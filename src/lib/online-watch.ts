import { getCurrentActor } from '../game/engine';
import type { OnlineRoom } from './online';
import { applyRoomUpdate, type RoomUpdate } from './room-wire';

export type RoomEvent = RoomUpdate<OnlineRoom> | { kind: 'closed'; id: string; viewerId: string };

interface WatchOptions {
  read: (knownVersion: number) => Promise<OnlineRoom | { unchanged: true; version: number }>;
  subscribe: (room: OnlineRoom, changed: (version: number, closed: boolean) => void,
    connection: (connected: boolean) => void, update: (event: RoomEvent) => void) => () => void;
  /** An action response can arrive before its Broadcast (or the reverse). */
  listen?: (accept: (room: OnlineRoom) => void) => () => void;
  onRoom: (room: OnlineRoom) => void;
  onError: (error: unknown) => void;
}

/** Private changes arrive directly, plus a small version check once a minute.
 * Hidden/offline tabs disconnect. Reconnects fetch immediately to recover gaps.
 * Timed turns get a deadline check even when nobody makes a move.
 */
export function watchOnlineRoom(initialRoom: OnlineRoom, options: WatchOptions): () => void {
  let room = initialRoom;
  let stopped = false, reading = false, queued = false, connected = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  let unlisten: (() => void) | undefined;
  const active = () => !stopped && !document.hidden && navigator.onLine !== false;
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const disconnect = () => {
    const remove = unsubscribe;
    unsubscribe = undefined;
    connected = false;
    remove?.();
  };
  const schedule = () => {
    clearTimer();
    if (!active() || room.status === 'finished') return;
    let delay = failures ? Math.min(60000, 8000 * 2 ** Math.min(failures - 1, 3)) : connected ? 60000 : 8000;
    if (!failures && room.game) {
      if (room.game.turnDeadlineAt) delay = Math.min(delay, Math.max(1000, room.game.turnDeadlineAt - Date.now() + 250));
      if (getCurrentActor(room.game).isBot) delay = Math.min(delay, 1000);
    }
    timer = setTimeout(() => void refresh(), delay);
  };
  const connect = () => {
    if (!active() || unsubscribe || room.status === 'finished' || !room.features?.includes('room-notifications-v1')) return;
    let checked = false;
    unsubscribe = options.subscribe(room, (version, closed) => {
      if (closed || version > room.version) void refresh();
    }, (online) => {
      const recovered = online && !connected;
      connected = online;
      // Close the gap between the initial GET and subscription acknowledgement.
      if (recovered || !checked) { checked = true; void refresh(); }
      else schedule();
    }, (event) => {
      if (!active()) return;
      if (event.kind === 'closed') {
        if (event.id !== room.id || event.viewerId !== room.viewerId) return;
        stop();
        options.onError(Object.assign(new Error('This table was closed by its host.'), { code: 'ROOM_NOT_FOUND' }));
        return;
      }
      const version = event.kind === 'snapshot' ? event.room.version : event.version;
      if (version <= room.version) return;
      const next = applyRoomUpdate(room, event);
      if (next) accept(next);
      else void refresh();
    });
  };
  const accept = (next: OnlineRoom) => {
    if (stopped || next.id !== room.id || next.viewerId !== room.viewerId || next.version <= room.version) return;
    room = next;
    failures = 0;
    options.onRoom(next);
    if (room.status === 'finished') disconnect();
    schedule();
  };
  const refresh = async () => {
    clearTimer();
    if (!active() || room.status === 'finished') return;
    if (reading) { queued = true; return; }
    reading = true;
    try {
      const next = await options.read(room.version);
      if (stopped) return;
      failures = 0;
      if (!('unchanged' in next)) accept(next);
      connect();
    } catch (error) {
      if (stopped) return;
      failures++;
      const code = (error as { code?: string })?.code;
      if (code === 'ROOM_NOT_FOUND' || code === 'OLD_RULESET') stop();
      options.onError(error);
    } finally {
      reading = false;
      if (queued && active()) { queued = false; void refresh(); }
      else schedule();
    }
  };
  const resume = () => {
    if (!active()) { clearTimer(); disconnect(); return; }
    connect();
    void refresh();
  };
  function stop() {
    stopped = true;
    clearTimer();
    disconnect();
    unlisten?.();
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
    window.removeEventListener('offline', resume);
    window.removeEventListener('pageshow', resume);
    window.removeEventListener('pagehide', suspend);
  }
  function suspend() { clearTimer(); disconnect(); }
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('pagehide', suspend);
  unlisten = options.listen?.(accept);
  // The caller already fetched a snapshot. Subscribe first, then do exactly
  // one version check on acknowledgement to close the connection gap.
  connect();
  if (!unsubscribe) void refresh();
  else schedule();
  return stop;
}
