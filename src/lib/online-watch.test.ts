import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../game/engine';
import type { OnlineRoom } from './online';
import { watchOnlineRoom, type RoomEvent } from './online-watch';
import { makeRoomUpdate } from './room-wire';

const fixture = (): OnlineRoom => ({ id: 'room', code: 'ABC234', hostId: 'host', viewerId: 'host',
  mode: 'classic', ruleset: '2008', status: 'lobby', version: 1,
  players: [{ id: 'host', name: 'Host', isBot: false }], game: null, updatedAt: '',
  features: ['room-notifications-v1'] });

describe('lightweight online synchronization', () => {
  let doc: EventTarget & { hidden: boolean };
  let net: { onLine: boolean };
  let stop: (() => void) | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    doc = Object.assign(new EventTarget(), { hidden: false });
    net = { onLine: true };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', net);
    vi.stubGlobal('window', new EventTarget());
  });
  afterEach(() => { stop?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function setup(initial = fixture(), online = true) {
    let snapshot = initial;
    let changed: (version: number, closed: boolean) => void;
    let connection: (online: boolean) => void;
    let update: (event: RoomEvent) => void;
    let accept: (room: OnlineRoom) => void;
    const remove = vi.fn();
    const read = vi.fn(async (version: number): Promise<OnlineRoom | { unchanged: true; version: number }> =>
      snapshot.version === version ? { unchanged: true, version } : snapshot);
    const onRoom = vi.fn(), onError = vi.fn();
    const subscribe = vi.fn((_room, onChange, onConnection, onUpdate) => {
      changed = onChange; connection = onConnection; update = onUpdate; return remove;
    });
    stop = watchOnlineRoom(initial, { read, subscribe, onRoom, onError,
      listen: (listener) => { accept = listener; return () => {}; } });
    if (online && initial.status !== 'finished') connection!(true);
    return { read, onRoom, onError, subscribe, remove,
      notify: (next: OnlineRoom) => { snapshot = next; changed(next.version, false); },
      push: (event: RoomEvent, next: OnlineRoom) => { snapshot = next; update(event); },
      local: (next: OnlineRoom) => { snapshot = next; accept(next); },
      ready: () => connection(true), close: () => changed(snapshot.version, true) };
  }
  it('uses notifications for moves and only one idle version check per minute', async () => {
    const h = setup();
    await vi.advanceTimersByTimeAsync(0);
    h.ready(); await vi.advanceTimersByTimeAsync(0);
    const startup = h.read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(59999);
    expect(h.read).toHaveBeenCalledTimes(startup);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.read).toHaveBeenCalledTimes(startup + 1);
    h.notify({ ...fixture(), version: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.onRoom).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));
    const reads = h.read.mock.calls.length;
    h.notify({ ...fixture(), version: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.read).toHaveBeenCalledTimes(reads);
  });
  it('disconnects hidden/offline pages and catches up when returning', async () => {
    const h = setup(); await vi.advanceTimersByTimeAsync(0);
    h.ready(); await vi.advanceTimersByTimeAsync(0);
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.remove).toHaveBeenCalledOnce();
    const reads = h.read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(180000);
    expect(h.read).toHaveBeenCalledTimes(reads);
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.subscribe).toHaveBeenCalledTimes(2);
    expect(h.read).toHaveBeenCalledTimes(reads + 1);
    net.onLine = false; window.dispatchEvent(new Event('offline'));
    await vi.advanceTimersByTimeAsync(180000);
    expect(h.read).toHaveBeenCalledTimes(reads + 1);
    net.onLine = true; window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.read).toHaveBeenCalledTimes(reads + 2);
  });
  it('checks turn deadlines promptly even when realtime is healthy', async () => {
    const game = createGame({ players: ['One', 'Two', 'Three'].map((name) => ({ id: name, name, isBot: false })), seed: 42 });
    game.turnDeadlineAt = Date.now() + 5000;
    const h = setup({ ...fixture(), status: 'playing', game });
    await vi.advanceTimersByTimeAsync(0); h.ready(); await vi.advanceTimersByTimeAsync(0);
    const startup = h.read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5250);
    expect(h.read).toHaveBeenCalledTimes(startup + 1);
  });
  it('coalesces overlapping requests and recovers a change arriving during a read', async () => {
    const h = setup(); await vi.advanceTimersByTimeAsync(0);
    let release!: (r: OnlineRoom) => void;
    h.read.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    h.notify({ ...fixture(), version: 2 });
    h.notify({ ...fixture(), version: 3 });
    h.notify({ ...fixture(), version: 4 });
    expect(h.read).toHaveBeenCalledTimes(2);
    release({ ...fixture(), version: 2 }); await vi.advanceTimersByTimeAsync(0);
    expect(h.read).toHaveBeenCalledTimes(3);
    expect(h.onRoom).toHaveBeenLastCalledWith(expect.objectContaining({ version: 4 }));
  });
  it('falls back when realtime is unavailable and stops on closed/finished rooms', async () => {
    const h = setup(fixture(), false); await vi.advanceTimersByTimeAsync(8000);
    expect(h.read).toHaveBeenCalledTimes(1);
    h.read.mockRejectedValueOnce(Object.assign(new Error('Closed'), { code: 'ROOM_NOT_FOUND' }));
    h.close(); await vi.advanceTimersByTimeAsync(0);
    expect(h.onError).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(120000);
    expect(h.read).toHaveBeenCalledTimes(2);
    const finished = setup({ ...fixture(), status: 'finished' });
    await vi.advanceTimersByTimeAsync(120000);
    expect(finished.read).not.toHaveBeenCalled();
    expect(finished.subscribe).not.toHaveBeenCalled();
  });
  it('ignores an in-flight response after unmount', async () => {
    const h = setup(); await vi.advanceTimersByTimeAsync(0);
    let release!: (r: OnlineRoom) => void;
    h.read.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    h.notify({ ...fixture(), version: 2 }); stop?.();
    release({ ...fixture(), version: 2 }); await vi.advanceTimersByTimeAsync(60000);
    expect(h.onRoom).not.toHaveBeenCalled();
  });
  it('applies private changes instantly without GETs and ignores duplicate action responses', async () => {
    const h = setup(); await vi.advanceTimersByTimeAsync(0);
    const next = { ...fixture(), version: 2 };
    h.push(makeRoomUpdate(fixture(), next), next);
    expect(h.onRoom).toHaveBeenCalledWith(next);
    expect(h.read).toHaveBeenCalledOnce();
    h.local(next); h.push(makeRoomUpdate(fixture(), next), next);
    expect(h.onRoom).toHaveBeenCalledOnce();
    const third = { ...next, version: 3 };
    h.local(third); h.push(makeRoomUpdate(next, third), third);
    expect(h.onRoom).toHaveBeenCalledTimes(2);
    expect(h.read).toHaveBeenCalledOnce();
  });
  it('recovers a missing patch and never regresses when an older GET returns', async () => {
    const h = setup(); await vi.advanceTimersByTimeAsync(0);
    const second = { ...fixture(), version: 2 }, third = { ...fixture(), version: 3 };
    h.push(makeRoomUpdate(second, third), third); await vi.advanceTimersByTimeAsync(0);
    expect(h.onRoom).toHaveBeenLastCalledWith(third);
    expect(h.read).toHaveBeenCalledTimes(2);
    let release!: (r: OnlineRoom) => void;
    h.read.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    await vi.advanceTimersByTimeAsync(60000);
    const fourth = { ...third, version: 4 };
    h.push(makeRoomUpdate(third, fourth), fourth);
    release(third); await vi.advanceTimersByTimeAsync(0);
    expect(h.onRoom).toHaveBeenLastCalledWith(fourth);
  });
  it('stops a closed private room without another server request', async () => {
    const h = setup(); await vi.advanceTimersByTimeAsync(0);
    h.push({ kind: 'closed', id: 'room', viewerId: 'host' }, fixture());
    await vi.advanceTimersByTimeAsync(120000);
    expect(h.read).toHaveBeenCalledOnce();
    expect(h.remove).toHaveBeenCalledOnce();
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'ROOM_NOT_FOUND' }));
  });
});
