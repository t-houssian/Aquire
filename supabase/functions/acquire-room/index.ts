import { createClient } from '@supabase/supabase-js';
import {
  applyAction,
  chooseBotAction,
  createGame,
  expireTurn,
  getCurrentActor,
  validateHouseRules,
} from '../_shared/game/engine.ts';
import type { GameState } from '../_shared/game/types.ts';
import { getMap, isMapId } from '../_shared/game/maps.ts';
import {
  parseAction,
  parseCode,
  parseName,
  publicRoom,
  RequestError,
  requireActor,
  requireMember,
  requireCurrentRules,
  secureDeal,
  type StoredRoom,
} from './protocol.ts';

import { makeRoomUpdate } from '../_shared/room-wire.ts';
import { jsonResponse } from './response.ts';

const dbMessages: Record<string, [string, number]> = {
  ROOM_NOT_FOUND: [
    'This room is unavailable. Check the code or ask the host to create a new room.',
    404,
  ],
  ROOM_FULL: ['This room already has twelve players.', 409],
  ROOM_STARTED: ['This game has already started.', 409],
  ROOM_FINISHED: ['This game has finished.', 409],
  ROOM_LIMIT: ['You have several recent rooms already. Return to one of those rooms to play.', 429],
  HOST_ONLY: ['Only the host can start or end this table.', 403],
  VERSION_CONFLICT: [
    'The room changed while you were choosing. Review the latest state and try again.',
    409,
  ],
  INVALID_NAME: ['Choose a name between 1 and 24 characters.', 400],
  INVALID_MODE: ['This game follows the 2008 rules, with no alternate mode.', 400],
  PLAYER_COUNT: ['Choose at least three players without exceeding the selected map’s seat limit.', 400],
  OLD_RULESET: ['This table uses an older rules edition. Create a new 2008 table.', 409],
};
function dbError(message: string): never {
  const code = Object.keys(dbMessages).find((item) => message.includes(item));
  if (code) throw new RequestError(code, ...dbMessages[code]);
  console.error('Acquire database operation failed:', message);
  throw new RequestError(
    'SERVER_ERROR',
    'The room server could not save this request. Please try again.',
    500,
  );
}

function advanceBots(input: GameState): GameState {
  let state = input;
  // Bounded work per request. A later poll continues an unusually long bot sequence.
  for (let i = 0; i < 96 && state.phase !== 'ended'; i++) {
    if (!getCurrentActor(state).isBot) break;
    state = applyAction(
      { ...state, rng: crypto.getRandomValues(new Uint32Array(1))[0] },
      chooseBotAction(state),
    );
  }
  return state;
}
function roomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (n) => alphabet[n % alphabet.length],
  ).join('');
}

Deno.serve(async (request: Request) => {
  const respond = (body: unknown, status = 200) => jsonResponse(request, body, status);
  if (request.method === 'OPTIONS') return respond({ ok: true });
  if (request.method !== 'POST')
    return respond({ error: 'Use POST for room requests.', code: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey =
      Deno.env.get('ACQUIRE_SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey)
      throw new RequestError(
        'SETUP_REQUIRED',
        'The room server needs its Supabase service credentials.',
        503,
      );
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer '))
      throw new RequestError('UNAUTHORIZED', 'Sign in as a guest to play online.', 401);
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // The request identity is verified with Auth; never trust a user/player ID in JSON.
    const { data: auth, error: authError } = await admin.auth.getUser(authorization.slice(7));
    if (authError || !auth.user)
      throw new RequestError(
        'UNAUTHORIZED',
        'Your guest session expired. Reload and join again.',
        401,
      );
    const userId = auth.user.id;
    const raw = await request.text();
    if (raw.length > 16384)
      throw new RequestError('REQUEST_TOO_LARGE', 'The room request is too large.', 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new RequestError('INVALID_REQUEST', 'Send a valid room request.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new RequestError('INVALID_REQUEST', 'Send a valid room request.');
    const rpc = async (name: string, args: Record<string, unknown>): Promise<StoredRoom> => {
      const { data, error } = await admin.rpc(name, args);
      if (error) dbError(error.message);
      return data as StoredRoom;
    };
    const notifyRoom = async (room: StoredRoom, closed = false, before?: StoredRoom) => {
      // One ephemeral HTTP batch, no database event rows. Never send private
      // state on the legacy shared topic; personalized topics are receive-only.
      const messages: { topic: string; event: string; private: boolean; payload: unknown }[] = [
        { topic: `acquire:${room.id}`, event: 'changed', private: true, payload: { version: room.version, closed } },
      ];
      for (const player of room.players.filter((p) => !p.isBot)) {
        const oldView = before?.players.some((p) => p.id === player.id && !p.isBot) ? publicRoom(before, player.id) : null;
        messages.push({ topic: `acquire:${room.id}:${player.id}`, event: 'state', private: true,
          payload: closed ? { kind: 'closed', id: room.id, viewerId: player.id } : makeRoomUpdate(oldView, publicRoom(room, player.id)) });
      }
      try {
        const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
          method: 'POST',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }), signal: AbortSignal.timeout(2500),
        });
        if (!response.ok) console.warn('Room notification unavailable:', response.status);
        await response.body?.cancel();
      } catch { console.warn('Room notification unavailable; clients will recover with GET.'); }
    };
    const roomResponse = (room: StoredRoom, before?: StoredRoom) => {
      const view = publicRoom(room, userId);
      return respond(body.sync === 'delta-v1' && before && body.knownVersion === before.version
        ? makeRoomUpdate(publicRoom(before, userId), view) : view);
    };
    if (body.operation === 'create') {
      // Retention still runs on projects without pg_cron. Failure is nonfatal for play.
      const prune = await admin.rpc('acquire_prune_data');
      if (prune.error && prune.error.code !== 'PGRST202') console.warn('Acquire retention needs attention:', prune.error.code);
      const name = parseName(body.name);
      const mode = body.mode ?? 'classic';
      if (mode !== 'classic') throw new RequestError('INVALID_MODE', ...dbMessages.INVALID_MODE);
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await admin.rpc('acquire_create_room', {
          p_user_id: userId,
          p_name: name,
          p_code: roomCode(),
          p_mode: mode,
        });
        if (error?.code === '23505') continue;
        if (error) dbError(error.message);
        return respond(publicRoom(data as StoredRoom, userId));
      }
      throw new RequestError(
        'SERVER_BUSY',
        'Could not reserve a room code. Please try again.',
        503,
      );
    }
    if (body.operation === 'history' || body.operation === 'leaderboard') {
      const { data, error } = await admin.rpc(
        body.operation === 'history' ? 'acquire_recent_matches' : 'acquire_leaderboard',
        { p_user_id: userId, p_limit: 30 },
      );
      if (error) dbError(error.message);
      return respond(Array.isArray(data) ? data : []);
    }
    const code = parseCode(body.code);
    if (body.operation === 'join') {
      const room = await rpc('acquire_join_room', {
        p_user_id: userId,
        p_name: parseName(body.name),
        p_code: code,
      });
      await notifyRoom(room);
      return respond(publicRoom(room, userId));
    }
    if (body.operation === 'leave') {
      const before = await rpc('acquire_get_room', { p_user_id: userId, p_code: code });
      await rpc('acquire_leave_room', { p_user_id: userId, p_code: code });
      if (before.status === 'lobby') {
        if (before.host_id === userId) await notifyRoom(before, true);
        else {
          const remaining = await rpc('acquire_get_room', { p_user_id: before.host_id, p_code: code });
          await notifyRoom(remaining, false, before);
        }
      }
      return respond({ ok: true });
    }
    if (body.operation === 'end') {
      const before = await rpc('acquire_get_room', { p_user_id: userId, p_code: code });
      await rpc('acquire_end_room', { p_user_id: userId, p_code: code });
      await notifyRoom(before, true);
      return respond({ ok: true });
    }
    const { data: loaded, error: readError } = await admin.rpc('acquire_read_room', {
      p_user_id: userId, p_code: code,
      p_known_version: body.operation === 'get' && Number.isInteger(body.knownVersion) ? body.knownVersion : null,
    });
    if (readError) dbError(readError.message);
    if (loaded?.unchanged === true) return respond(loaded);
    let room = loaded as StoredRoom;
    requireMember(room, userId);
    requireCurrentRules(room);
    const before = room;
    const initialVersion = room.version;
    const commit = async (state: GameState, players = room.players) => {
      const committed = await rpc('acquire_commit_room_small', {
        p_user_id: userId,
        p_code: code,
        p_expected_version: room.version,
        p_game: state,
        p_players: players,
        p_status: state.phase === 'ended' ? 'finished' : 'playing',
      });
      room = { ...committed, game: state };
    };
    if (body.operation === 'start') {
      if (room.host_id !== userId)
        throw new RequestError('HOST_ONLY', 'Only the host can start the game.', 403);
      if (room.status !== 'lobby')
        throw new RequestError('ROOM_STARTED', 'This game has already started.', 409);
      const botCount = body.botCount ?? 0;
      const mapId = body.mapId ?? 'classic';
      const botDifficulty = body.botDifficulty ?? 'standard';
      let houseRules;
      try { houseRules = validateHouseRules(body.houseRules as Parameters<typeof validateHouseRules>[0]); }
      catch (error) { throw new RequestError('INVALID_HOUSE_RULES', error instanceof Error ? error.message : 'Choose valid house rules.'); }
      if (!isMapId(mapId)) throw new RequestError('INVALID_MAP', 'Choose an available city map.');
      if (!['casual', 'standard', 'strategist'].includes(String(botDifficulty)))
        throw new RequestError('INVALID_DIFFICULTY', 'Choose an available computer difficulty.');
      if (!Number.isInteger(botCount) || Number(botCount) < 0 || Number(botCount) > 11)
        throw new RequestError('INVALID_BOTS', 'Choose between zero and eleven computer players.');
      const players = [...room.players];
      const botNames = ['Marlow', 'Sinclair', 'Sterling', 'Avery', 'Ellis', 'Quinn', 'Devon', 'Arden', 'Rowan', 'Sage', 'Emery'];
      for (let i = 0; i < Number(botCount); i++)
        players.push({
          id: `bot-${crypto.randomUUID()}`,
          name: botNames[i],
          isBot: true,
        });
      if (players.length < 3 || players.length > getMap(mapId).maxPlayers)
        throw new RequestError('PLAYER_COUNT', ...dbMessages.PLAYER_COUNT);
      if (players.length * (houseRules.startingTilesPerPlayer + 6) > getMap(mapId).tiles.length)
        throw new RequestError('INVALID_HOUSE_RULES', 'This map cannot fit the selected opening and six private tiles per investor.');
      const state = secureDeal(
        createGame({
          players,
          mode: 'classic',
          seed: crypto.getRandomValues(new Uint32Array(1))[0],
          id: room.id,
          mapId,
          botDifficulty: botDifficulty as 'casual' | 'standard' | 'strategist',
          houseRules,
        }),
      );
      await commit(advanceBots(state), players);
    } else if (body.operation === 'action') {
      if (room.game) {
        const expired = expireTurn(room.game);
        if (expired !== room.game) {
          await commit(advanceBots(expired));
          await notifyRoom(room, false, before);
          return roomResponse(room, before);
        }
      }
      if (!Number.isInteger(body.expectedVersion) || body.expectedVersion !== room.version)
        throw new RequestError('VERSION_CONFLICT', ...dbMessages.VERSION_CONFLICT);
      const action = parseAction(body.action);
      requireActor(room, userId, action);
      let next: GameState;
      try {
        next = applyAction(
          { ...room.game!, rng: crypto.getRandomValues(new Uint32Array(1))[0] },
          action,
        );
      } catch (error) {
        throw new RequestError(
          'ILLEGAL_ACTION',
          error instanceof Error ? error.message : 'That move is not allowed.',
        );
      }
      await commit(advanceBots(next));
    } else if (body.operation === 'get') {
      if (room.game) {
        const expired = expireTurn(room.game);
        if (expired !== room.game) {
          try { await commit(advanceBots(expired)); }
          catch (error) {
            if (!(error instanceof RequestError) || error.code !== 'VERSION_CONFLICT') throw error;
            room = await rpc('acquire_get_room', { p_user_id: userId, p_code: code });
          }
        }
      }
      if (room.game && room.status === 'playing' && getCurrentActor(room.game).isBot) {
        try {
          await commit(advanceBots(room.game));
        } catch (error) {
          if (!(error instanceof RequestError) || error.code !== 'VERSION_CONFLICT') throw error;
          room = await rpc('acquire_get_room', { p_user_id: userId, p_code: code });
        }
      }
    } else throw new RequestError('INVALID_OPERATION', 'Choose a supported room operation.');
    if (room.version !== initialVersion) await notifyRoom(room, false, before);
    if (body.operation === 'get' && body.knownVersion === room.version)
      return respond({ unchanged: true, version: room.version });
    return roomResponse(room, before);
  } catch (error) {
    if (error instanceof RequestError)
      return respond({ error: error.message, code: error.code }, error.status);
    console.error('Acquire room error:', error);
    return respond(
      { error: 'The room server encountered a problem. Please try again.', code: 'SERVER_ERROR' },
      500,
    );
  }
});
