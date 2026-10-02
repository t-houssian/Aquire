import { readProfile, type PlayerProfile } from './profile';
import { kingdomUnlocked, storyWins } from './campaign';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import type {
  BotDifficulty,
  GameAction,
  GameMode,
  GameState,
  HouseRules,
  MapId,
} from '../game/types';
import type { LeaderboardEntry, MatchSummary } from './matches';
import publicProject from './supabase-public.json';
import { watchOnlineRoom } from './online-watch';
import { applyRoomUpdate } from './room-wire';

export interface OnlinePlayer {
  id: string;
  name: string;
  isBot: boolean;
  characterId?: string;
  avatar?: string;
  country?: string;
}
export interface OnlineProfile {
  id: string;
  name: string;
  avatar: string | null;
  country: string;
  storyWins: number;
  games: number;
  wins: number;
  ties: number;
  placementSum: number;
  podiums: number;
  bestFinish: number | null;
  bestScore: number;
}
export interface LobbyOptions {
  mapId: MapId;
  seatLimit: number;
  botDifficulty: BotDifficulty;
  houseRules?: HouseRules;
}
export interface OpenTable {
  code: string;
  host: OnlinePlayer;
  playerCount: number;
  options: LobbyOptions;
  updatedAt: string;
}
export interface OnlineRoom {
  id: string;
  code: string;
  hostId: string;
  ruleset: '2008';
  mode: GameMode;
  status: 'lobby' | 'playing' | 'finished';
  version: number;
  players: OnlinePlayer[];
  /** Opponent hands and the draw bag contain '?' placeholders. Never mutate this state locally. */
  game: GameState | null;
  viewerId: string;
  updatedAt: string;
  features?: string[];
  visibility?: 'private' | 'public';
  lobbyOptions?: LobbyOptions;
}

// Public browser credentials. Explicit env overrides must supply their own key
// so a fork/test project never receives the production project's key.
const hasOverride = import.meta.env.VITE_SUPABASE_URL !== undefined;
const url = hasOverride ? import.meta.env.VITE_SUPABASE_URL.trim() : publicProject.url;
const key = hasOverride
  ? ((
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY
    )?.trim() ?? '')
  : publicProject.publishableKey;
const configuredBaseUrl = (() => {
  try {
    const parsed = new URL(url);
    return (
      /^https?:$/.test(parsed.protocol) && parsed.pathname === '/' && !parsed.search && !parsed.hash
    );
  } catch {
    return false;
  }
})();
export const onlineConfigured = configuredBaseUrl && key.length > 20 && !key.includes('your-');
export const onlineSetupMessage = url.includes('/functions/')
  ? 'Use your Supabase project base URL in VITE_SUPABASE_URL, ending in .supabase.co. Remove /functions/v1/acquire-room, then restart the app.'
  : 'Online rooms need a Supabase project. Follow docs/ONLINE.md, add its base URL and publishable key to .env.local, then restart the app.';

let client: SupabaseClient | undefined;
let sessionRequest: Promise<{ id: string }> | undefined;
// Only the currently used room, in memory. Never persist private racks twice.
let cachedRoom: OnlineRoom | undefined;
const roomListeners = new Set<(room: OnlineRoom) => void>();
function rememberRoom(room: OnlineRoom): OnlineRoom {
  if (
    cachedRoom?.id === room.id &&
    cachedRoom.viewerId === room.viewerId &&
    cachedRoom.version > room.version
  )
    return cachedRoom;
  cachedRoom = room;
  roomListeners.forEach((listener) => listener(room));
  return room;
}

function getClient(): SupabaseClient {
  if (!onlineConfigured) throw new OnlineError(onlineSetupMessage, 'SETUP_REQUIRED');
  client ??= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'aquire.online.auth',
    },
  });
  return client;
}

export class OnlineError extends Error {
  code: string;
  constructor(message: string, code = 'ONLINE_ERROR') {
    super(message);
    this.name = 'OnlineError';
    this.code = code;
  }
}

export async function getOnlineUser(): Promise<{ id: string }> {
  // Multiple mounted components must not create competing anonymous sessions.
  sessionRequest ??= (async () => {
    const supabase = getClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new OnlineError(error.message, 'AUTH_ERROR');
    if (data.session) return { id: data.session.user.id };
    const result = await supabase.auth.signInAnonymously({ options: { data: { app: 'aquire' } } });
    if (result.error || !result.data.user) {
      throw new OnlineError(
        result.error?.message ??
          'Could not create your guest session. Enable anonymous sign-ins in Supabase Auth.',
        'AUTH_ERROR',
      );
    }
    return { id: result.data.user.id };
  })();
  try {
    return await sessionRequest;
  } finally {
    sessionRequest = undefined;
  }
}
export async function hasOnlineSession(): Promise<boolean> {
  if (!onlineConfigured) return false;
  const { data } = await getClient().auth.getSession();
  return Boolean(data.session);
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const user = await getOnlineUser();
  const base =
    cachedRoom && cachedRoom.code === body.code && cachedRoom.viewerId === user.id
      ? cachedRoom
      : undefined;
  const incremental =
    ['action', 'start'].includes(String(body.operation)) &&
    base?.features?.includes('room-deltas-v1');
  let { data, error } = await getClient().functions.invoke('acquire-room', {
    body: incremental && base ? { ...body, sync: 'delta-v1', knownVersion: base.version } : body,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const response = (await error.context.json().catch(() => null)) as {
        error?: string;
        code?: string;
      } | null;
      throw new OnlineError(response?.error ?? error.message, response?.code);
    }
    throw new OnlineError(
      'Could not reach the room server. Check your connection and that the acquire-room function is deployed.',
      'CONNECTION_ERROR',
    );
  }
  if (!data) throw new OnlineError('The room server returned an empty response.', 'SERVER_ERROR');
  if (data.error) throw new OnlineError(data.error, data.code);
  if (data.kind === 'patch' || data.kind === 'snapshot') {
    data = base ? applyRoomUpdate(base, data) : data.kind === 'snapshot' ? data.room : null;
    // The action was already accepted: recover without resubmitting it.
    if (!data) return await invoke({ operation: 'get', code: body.code });
  }
  // A web/native upgrade may precede deployment of its server. Never let the
  // 2008 UI interpret an earlier room or a different generation of game state.
  if (
    !['leave', 'end', 'history', 'leaderboard', 'profile', 'save-profile', 'list'].includes(
      String(body.operation),
    ) &&
    !(body.operation === 'get' && data.unchanged === true && Number.isInteger(data.version)) &&
    (data.ruleset !== '2008' ||
      data.mode !== 'classic' ||
      (data.game !== null &&
        (!data.game ||
          data.game.version !== 2 ||
          data.game.ruleset !== '2008' ||
          data.game.mode !== 'classic')))
  ) {
    throw new OnlineError(
      'This table uses an older rules edition. Update the room server and create a new 2008 table.',
      'OLD_RULESET',
    );
  }
  return (
    data.viewerId === user.id && data.id && data.code ? rememberRoom(data as OnlineRoom) : data
  ) as T;
}

const profileBody = (profile = readProfile()) => ({
  avatar: profile.avatar,
  country: profile.country ?? '',
  storyWins: storyWins(),
});
export function createRoom(
  name: string,
  mode: GameMode = 'classic',
  visibility: 'private' | 'public' = 'private',
): Promise<OnlineRoom> {
  return invoke({ operation: 'create', name, mode, visibility, ...profileBody() });
}
export async function getOnlineProfile(profileId?: string): Promise<OnlineProfile | null> {
  const result = await invoke<{ profile: OnlineProfile | null }>({
    operation: 'profile',
    ...(profileId ? { profileId } : {}),
  });
  return result.profile;
}
export async function saveOnlineProfile(profile: PlayerProfile): Promise<OnlineProfile> {
  const result = await invoke<{ profile: OnlineProfile }>({
    operation: 'save-profile',
    name: profile.name,
    ...profileBody(profile),
  });
  return result.profile;
}
export async function listOpenTables(): Promise<OpenTable[]> {
  const result = await invoke<{ tables: OpenTable[] }>({ operation: 'list' });
  return result.tables;
}
export function configureLobby(
  room: OnlineRoom,
  visibility: 'private' | 'public',
  options: LobbyOptions,
): Promise<OnlineRoom> {
  return invoke({
    operation: 'configure',
    code: room.code,
    expectedVersion: room.version,
    visibility,
    options,
    royalsUnlocked: kingdomUnlocked(),
  });
}
export function getOnlineHistory(): Promise<MatchSummary[]> {
  return invoke({ operation: 'history' });
}
export function getOnlineLeaderboard(): Promise<(LeaderboardEntry & { id: string })[]> {
  return invoke({ operation: 'leaderboard' });
}
export function joinRoom(code: string, name: string): Promise<OnlineRoom> {
  return invoke({ operation: 'join', code: code.trim().toUpperCase(), name, ...profileBody() });
}
export function getRoom(code: string): Promise<OnlineRoom> {
  return invoke({ operation: 'get', code: code.trim().toUpperCase() });
}
export function startRoom(
  code: string,
  botCount = 0,
  mapId: MapId = 'classic',
  botDifficulty: BotDifficulty = 'standard',
  houseRules?: Partial<HouseRules>,
): Promise<OnlineRoom> {
  return invoke({
    operation: 'start',
    code,
    botCount,
    mapId,
    botDifficulty,
    houseRules,
    royalsUnlocked: kingdomUnlocked(),
  });
}
export function sendRoomAction(
  code: string,
  expectedVersion: number,
  action: GameAction,
): Promise<OnlineRoom> {
  return invoke({ operation: 'action', code, expectedVersion, action });
}
export async function leaveRoom(code: string): Promise<void> {
  await invoke({ operation: 'leave', code });
  if (cachedRoom?.code === code) cachedRoom = undefined;
}
export async function endRoom(code: string): Promise<void> {
  await invoke({ operation: 'end', code });
  if (cachedRoom?.code === code) cachedRoom = undefined;
}

/** Personalized state changes use a receive-only, member-specific channel. */
export function watchRoom(
  initialRoom: OnlineRoom,
  onRoom: (room: OnlineRoom) => void,
  onError?: (error: OnlineError) => void,
): () => void {
  return watchOnlineRoom(initialRoom, {
    read: (knownVersion) => invoke({ operation: 'get', code: initialRoom.code, knownVersion }),
    subscribe: (room, onChange, onConnection, onUpdate) => {
      const supabase = getClient();
      let cancelled = false;
      const deltas = room.features?.includes('room-deltas-v1');
      const channel = supabase.channel(`acquire:${room.id}${deltas ? `:${room.viewerId}` : ''}`, {
        config: { private: true },
      });
      void supabase.realtime
        .setAuth()
        .then(() => {
          if (cancelled) return;
          channel
            .on('broadcast', { event: deltas ? 'state' : 'changed' }, ({ payload }) => {
              if (cancelled) return;
              if (deltas && payload && ['patch', 'snapshot', 'closed'].includes(payload.kind))
                onUpdate(payload);
              else if (payload && Number.isInteger(payload.version))
                onChange(payload.version, payload.closed === true);
            })
            .subscribe((status) => {
              if (!cancelled) onConnection(status === 'SUBSCRIBED');
            });
        })
        .catch(() => {
          if (!cancelled) onConnection(false);
        });
      return () => {
        cancelled = true;
        void supabase.removeChannel(channel);
      };
    },
    listen: (accept) => {
      const listener = (next: OnlineRoom) => {
        if (next.id === initialRoom.id && next.viewerId === initialRoom.viewerId) accept(next);
      };
      roomListeners.add(listener);
      if (cachedRoom) listener(cachedRoom);
      return () => {
        roomListeners.delete(listener);
      };
    },
    onRoom: (next) => onRoom(rememberRoom(next)),
    onError: (error) => {
      const code =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : undefined;
      if (code === 'ROOM_NOT_FOUND' && cachedRoom?.id === initialRoom.id) cachedRoom = undefined;
      onError?.(
        error instanceof OnlineError
          ? error
          : new OnlineError(error instanceof Error ? error.message : String(error), code),
      );
    },
  });
}
