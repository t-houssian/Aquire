import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import type { BotDifficulty, GameAction, GameMode, GameState, HouseRules, MapId } from '../game/types';
import type { LeaderboardEntry, MatchSummary } from './matches';

export interface OnlinePlayer {
  id: string;
  name: string;
  isBot: boolean;
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
}

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const key =
  (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  )?.trim() ?? '';
const configuredBaseUrl = (() => { try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) && parsed.pathname === '/' && !parsed.search && !parsed.hash; } catch { return false; } })();
export const onlineConfigured = configuredBaseUrl && key.length > 20 && !key.includes('your-');
export const onlineSetupMessage = url.includes('/functions/')
  ? 'Use your Supabase project base URL in VITE_SUPABASE_URL, ending in .supabase.co. Remove /functions/v1/acquire-room, then restart the app.'
  : 'Online rooms need a Supabase project. Follow docs/ONLINE.md, add its base URL and publishable key to .env.local, then restart the app.';

let client: SupabaseClient | undefined;
let sessionRequest: Promise<{ id: string }> | undefined;

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
  await getOnlineUser();
  const { data, error } = await getClient().functions.invoke('acquire-room', { body });
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
  // A web/native upgrade may precede deployment of its server. Never let the
  // 2008 UI interpret an earlier room or a different generation of game state.
  if (
    !['leave', 'end', 'history', 'leaderboard'].includes(String(body.operation)) &&
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
  return data as T;
}

export function createRoom(name: string, mode: GameMode = 'classic'): Promise<OnlineRoom> {
  return invoke({ operation: 'create', name, mode });
}
export function getOnlineHistory(): Promise<MatchSummary[]> {
  return invoke({ operation: 'history' });
}
export function getOnlineLeaderboard(): Promise<(LeaderboardEntry & { id: string })[]> {
  return invoke({ operation: 'leaderboard' });
}
export function joinRoom(code: string, name: string): Promise<OnlineRoom> {
  return invoke({ operation: 'join', code: code.trim().toUpperCase(), name });
}
export function getRoom(code: string): Promise<OnlineRoom> {
  return invoke({ operation: 'get', code: code.trim().toUpperCase() });
}
export function startRoom(code: string, botCount = 0, mapId: MapId = 'classic', botDifficulty: BotDifficulty = 'standard', houseRules?: Partial<HouseRules>): Promise<OnlineRoom> {
  return invoke({ operation: 'start', code, botCount, mapId, botDifficulty, houseRules });
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
}
export async function endRoom(code: string): Promise<void> {
  await invoke({ operation: 'end', code });
}

/** Authoritative polling avoids ever broadcasting private game state to a room channel. */
export function watchRoom(
  code: string,
  onRoom: (room: OnlineRoom) => void,
  onError?: (error: OnlineError) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latestVersion = -1;
  let failures = 0;
  const poll = async () => {
    if (stopped) return;
    try {
      const room = await getRoom(code);
      if (stopped) return;
      failures = 0;
      if (room.version > latestVersion) {
        latestVersion = room.version;
        onRoom(room);
      }
    } catch (error) {
      if (stopped) return;
      failures++;
      onError?.(error instanceof OnlineError ? error : new OnlineError(String(error)));
    }
    if (!stopped) timer = setTimeout(poll, Math.min(15000, 2000 * Math.max(1, failures)));
  };
  void poll();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
