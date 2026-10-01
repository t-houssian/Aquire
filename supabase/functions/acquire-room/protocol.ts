import { getCurrentActor, getHouseRules } from '../_shared/game/engine.ts';
import { CHAIN_IDS, type GameAction, type GameState } from '../_shared/game/types.ts';

export interface RoomPlayer {
  id: string;
  name: string;
  isBot: boolean;
}
export interface StoredRoom {
  id: string;
  code: string;
  host_id: string;
  mode: 'classic' | 'tycoon';
  ruleset: '2008' | '2023';
  status: 'lobby' | 'playing' | 'finished';
  version: number;
  players: RoomPlayer[];
  game: GameState | null;
  updated_at: string;
}
export class RequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const invalid = () => {
  throw new RequestError('INVALID_REQUEST', 'That room request is not valid.');
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isTile = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9]\d?[A-Z]$/.test(value);
const isCount = (value: unknown, max: number): value is number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max;
const isChain = (value: unknown): boolean =>
  typeof value === 'string' && CHAIN_IDS.includes(value as (typeof CHAIN_IDS)[number]);

export function parseAction(input: unknown): GameAction {
  if (!isRecord(input)) return invalid();
  switch (input.type) {
    case 'place':
      if (!isTile(input.tile)) return invalid();
      return { type: 'place', tile: input.tile };
    case 'remove':
      if (!isTile(input.tile)) return invalid();
      return { type: 'remove', tile: input.tile };
    case 'pass':
    case 'finish-placing':
    case 'declare-end':
    case 'replace-dead-tiles':
    case 'exchange-hand':
      return { type: input.type };
    case 'found':
    case 'choose-survivor':
    case 'choose-acquired':
      if (!isChain(input.chain)) return invalid();
      return { type: input.type, chain: input.chain as (typeof CHAIN_IDS)[number] };
    case 'resolve-shares':
      if (!isCount(input.sell, 100) || !isCount(input.trade, 100) || input.trade % 2 !== 0)
        return invalid();
      return { type: 'resolve-shares', sell: input.sell, trade: input.trade };
    case 'buy': {
      if (!isRecord(input.stocks) || Object.keys(input.stocks).some((key) => !isChain(key)))
        return invalid();
      if (Object.values(input.stocks).some((count) => !isCount(count, 13))) return invalid();
      if (Object.values(input.stocks).reduce<number>((sum, count) => sum + Number(count), 0) > 13)
        return invalid();
      if (input.sellStocks !== undefined && (!isRecord(input.sellStocks) || Object.keys(input.sellStocks).some((key) => !isChain(key)) || Object.values(input.sellStocks).some((count) => !isCount(count, 3)) || Object.values(input.sellStocks).reduce<number>((sum, count) => sum + Number(count), 0) > 3)) return invalid();
      return {
        type: 'buy',
        stocks: input.stocks as Extract<GameAction, { type: 'buy' }>['stocks'],
        sellStocks: input.sellStocks as Extract<GameAction, { type: 'buy' }>['sellStocks'],
      };
    }
    default:
      return invalid();
  }
}

export function parseName(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  // Strip control characters from names submitted by arbitrary API clients.
  const name = value
    .trim()
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ');
  if (!name.length || name.length > 24)
    throw new RequestError('INVALID_NAME', 'Choose a name between 1 and 24 characters.');
  return name;
}
export function parseCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/.test(value.trim().toUpperCase())) {
    throw new RequestError('INVALID_CODE', 'Enter the six-character room code.');
  }
  return value.trim().toUpperCase();
}
export function requireMember(room: StoredRoom, userId: string): void {
  if (!room.players.some((p) => p.id === userId && !p.isBot)) {
    throw new RequestError(
      'ROOM_NOT_FOUND',
      'This room is unavailable. Join with its code first.',
      404,
    );
  }
}
export function requireCurrentRules(room: StoredRoom): void {
  if (
    room.ruleset !== '2008' ||
    room.mode !== 'classic' ||
    (room.game !== null &&
      (room.game.version !== 2 ||
        room.game.ruleset !== '2008' ||
        room.game.mode !== 'classic' ||
        room.game.players.length < 3))
  ) {
    throw new RequestError(
      'OLD_RULESET',
      'This table uses an older rules edition. Create a new 2008 table.',
      409,
    );
  }
}
export function requireActor(room: StoredRoom, userId: string, action: GameAction): void {
  requireMember(room, userId);
  requireCurrentRules(room);
  if (!room.game || room.status !== 'playing')
    throw new RequestError('ROOM_NOT_PLAYING', 'This room is not playing a game.');
  const actor =
    action.type === 'declare-end'
      ? room.game.players[room.game.currentPlayer]
      : getCurrentActor(room.game);
  if (actor.id !== userId || actor.isBot)
    throw new RequestError('NOT_YOUR_TURN', 'Wait for your decision before making a move.', 403);
}

export function publicRoom(room: StoredRoom, userId: string) {
  requireMember(room, userId);
  requireCurrentRules(room);
  let game: GameState | null = null;
  if (room.game) {
    const state = room.game;
    const rules = getHouseRules(state);
    const privateMoney = (rules.hiddenMoney || rules.anonymousBuying) && state.phase !== 'ended';
    const privateTrades = rules.anonymousBuying && state.phase !== 'ended';
    // Explicit allowlist prevents future private state fields being accidentally published.
    game = {
      version: state.version,
      ruleset: state.ruleset,
      id: state.id,
      mode: state.mode,
      mapId: state.mapId,
      botDifficulty: state.botDifficulty,
      houseRules: rules,
      placementsThisTurn: state.placementsThisTurn,
      removalsThisTurn: state.removalsThisTurn,
      turnDeadlineAt: state.turnDeadlineAt,
      marketShift: state.marketShift,
      lastRoundRolls: state.lastRoundRolls && (privateMoney
        ? { ...state.lastRoundRolls, dividendPaid: undefined } : state.lastRoundRolls),
      recentDiceRolls: state.recentDiceRolls?.map((report) => privateMoney
        ? { ...report, dividendPaid: undefined } : report),
      seed: 0,
      rng: 0,
      revision: state.revision,
      turn: state.turn,
      phase: state.phase,
      currentPlayer: state.currentPlayer,
      players: state.players.map((player) => ({
        id: player.id,
        name: player.name,
        isBot: player.isBot,
        cash: privateMoney && player.id !== userId ? 0 : player.cash,
        stocks: privateTrades && player.id !== userId
          ? Object.fromEntries(Object.keys(player.stocks).map((chain) => [chain, 0])) as typeof player.stocks
          : { ...player.stocks },
        initialTile: player.initialTile,
        hand: player.id === userId ? [...player.hand] : player.hand.map(() => '?'),
      })),
      board: state.board,
      bank: privateTrades
        ? Object.fromEntries(Object.entries(state.bank).map(([chain, count]) => [chain, count > 0 ? 13 : 0])) as typeof state.bank
        : state.bank,
      bag: state.bag.map(() => '?'),
      discarded: state.discarded,
      logs: state.logs.map((entry) => {
        if (entry.payout && state.phase !== 'ended') return { ...entry, payout: {
          ...entry.payout,
          majorityIds: privateTrades ? [] : entry.payout.majorityIds,
          minorityIds: privateTrades ? [] : entry.payout.minorityIds,
          players: entry.payout.players.map((player) => ({ ...player,
            shares: privateTrades && player.playerId !== userId ? null : player.shares,
            bonus: privateMoney && player.playerId !== userId ? null : player.bonus,
          })),
        } };
        if (entry.playerId === userId || state.phase === 'ended') return entry;
        if (privateTrades && (entry.type === 'buy' || entry.type === 'sell'))
          return { ...entry, message: `${state.players.find((player) => player.id === entry.playerId)?.name ?? 'An investor'} completed a private investment decision.` };
        if (privateTrades && entry.type === 'shares')
          return { ...entry, message: 'Private merger shares were resolved.' };
        if ((privateMoney || privateTrades) && entry.type === 'dividend')
          return { ...entry, message: entry.playerId ? 'A private cash payout was made.' : 'A dividend was resolved privately.' };
        if (privateMoney && entry.type === 'bonus')
          return { ...entry, message: 'A private shareholder bonus was paid.' };
        return entry;
      }),
      logSequence: state.logSequence,
      metrics: state.phase === 'ended' ? state.metrics : undefined,
      finalSettlements: state.phase === 'ended' ? state.finalSettlements : undefined,
      awards: state.phase === 'ended' ? state.awards : undefined,
      lastPlacedTile: state.lastPlacedTile,
      foundingTiles: state.foundingTiles,
      merger: state.merger,
      tilePlacedThisTurn: state.tilePlacedThisTurn,
      endDeclared: state.endDeclared,
      endReason: state.endReason,
      results: state.results,
      winnerIds: state.winnerIds,
    };
  }
  return {
    id: room.id,
    code: room.code,
    hostId: room.host_id,
    mode: 'classic' as const,
    ruleset: '2008' as const,
    status: room.status,
    version: room.version,
    players: room.players,
    game,
    viewerId: userId,
    updatedAt: room.updated_at,
    features: ['maps-v1', 'large-maps-v1', 'shaped-maps-v2', 'shaped-maps-v3', 'difficulty-v1', 'match-history-v1', 'house-rules-v1', 'hotel-roster-v1', 'hotel-stock-v1', 'market-frequency-v1', 'room-notifications-v1', 'room-deltas-v1'],
  };
}

/** A public seeded setup cannot be used to reconstruct online racks and bag. */
export function secureDeal(state: GameState): GameState {
  const pool = [...state.bag, ...state.players.flatMap((player) => player.hand)];
  const random = new Uint32Array(1);
  for (let i = pool.length - 1; i > 0; i--) {
    // Rejection sampling avoids modulo bias.
    const limit = 0x100000000 - (0x100000000 % (i + 1));
    do {
      crypto.getRandomValues(random);
    } while (random[0] >= limit);
    const j = random[0] % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const players = state.players.map((player) => ({
    ...player,
    hand: pool.splice(0, player.hand.length),
  }));
  return { ...state, players, bag: pool };
}
