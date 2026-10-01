import { describe, expect, it } from 'vitest';
import {
  ALL_TILES, applyAction, canRemoveTile, chooseBotAction, createGame, expireTurn,
  getInsideTiles, getLegalTiles, getMarketPriceForSize, getRemovableTiles, getSharePrice,
  getHouseRules,
} from './engine';
import type { GameState, HouseRules } from './types';

const seats = Array.from({ length: 3 }, (_, i) => ({ id: `h${i}`, name: `Investor ${i + 1}`, isBot: true }));
const game = (rules: Partial<HouseRules>, seed = 712) => createGame({ players: seats, seed, houseRules: rules });

describe('optional house rules', () => {
  it('treats pre-house-rule saves as printed-rule games', () => {
    const state = game({});
    delete state.houseRules;
    expect(getHouseRules(state)).toMatchObject({ startingCash: 6000, placementsPerTurn: 1, buyLimit: 3, dividends: false, marketMode: 'off' });
    const next = applyAction(state, { type: 'place', tile: getLegalTiles(state)[0] });
    expect(['found', 'merger-survivor', 'merger-order', 'merger-shares', 'buy']).toContain(next.phase);
  });
  it('deals configurable opening boards and cash while keeping six private tiles per player', () => {
    const state = game({ startingTilesPerPlayer: 10, startingCash: 12500 });
    expect(Object.keys(state.board)).toHaveLength(30);
    expect(state.players.every((player) => player.cash === 12500 && player.hand.length === 6)).toBe(true);
    expect(state.bag).toHaveLength(60);
    expect(new Set([...Object.keys(state.board), ...state.bag, ...state.players.flatMap((player) => player.hand)]).size).toBe(108);
    expect(() => createGame({ players: Array.from({ length: 6 }, (_, i) => ({ id: `${i}`, name: `${i}` })), mapId: 'four-spires', houseRules: { startingTilesPerPlayer: 10 } })).toThrow('larger map');
    expect(() => game({ placementsPerTurn: 3, removalsPerTurn: 3 })).toThrow('fewer than placed');
    expect(() => game({ turnTimerSeconds: 4 })).toThrow('five seconds');
  });

  it('allows several placements and only safe, limited removals before the purchase step', () => {
    let state = game({ placementsPerTurn: 3, removalsPerTurn: 2 });
    const opening = state.players[state.currentPlayer].initialTile;
    expect(canRemoveTile(state, opening)).toBe(true);
    const before = state.bag.length;
    state = applyAction(state, { type: 'remove', tile: opening });
    expect(state.board[opening]).toBeUndefined();
    expect(state.bag.length).toBe(before + 1);
    expect(state.removalsThisTurn).toBe(1);
    expect(() => applyAction(state, { type: 'remove', tile: '99Z' })).toThrow();
    const first = getLegalTiles(state)[0];
    state = applyAction(state, { type: 'place', tile: first });
    while (!['place', 'buy'].includes(state.phase)) state = applyAction(state, chooseBotAction(state));
    expect(state.placementsThisTurn).toBe(1);
    expect(state.phase).toBe('place');
    expect(getRemovableTiles(state)).not.toContain(first);
    state = applyAction(state, { type: 'finish-placing' });
    expect(state.phase).toBe('buy');
    const nextPlayer = state.players[(state.currentPlayer + 1) % state.players.length].id;
    state = applyAction(state, { type: 'buy', stocks: {} });
    expect(state.players[state.currentPlayer].id).toBe(nextPlayer);
    expect(state.placementsThisTurn).toBe(0);
    expect(state.removalsThisTurn).toBe(0);
    expect(state.players.find((player) => player.id === seats[0].id)?.hand.length).toBeLessThanOrEqual(6);
  });

  it('protects chain connectivity and minimum size when removing a hotel', () => {
    const state = game({ placementsPerTurn: 2, removalsPerTurn: 1 });
    state.board = { '1A': 'worldwide', '2A': 'worldwide', '3A': 'worldwide' };
    state.logs = [];
    expect(canRemoveTile(state, '2A')).toBe(false);
    expect(canRemoveTile(state, '1A')).toBe(true);
    state.board = { '1A': 'worldwide', '2A': 'worldwide' };
    expect(canRemoveTile(state, '1A')).toBe(false);
  });

  it('keeps playing when a legal removal can reopen an otherwise blocked city', () => {
    const state = game({ placementsPerTurn: 2, removalsPerTurn: 1 });
    state.phase = 'buy';
    state.board = { '1A': 'independent' };
    state.bag = [];
    state.players.forEach((player) => { player.hand = ['1A']; });
    const next = applyAction(state, { type: 'buy', stocks: {} });
    expect(next.phase).toBe('place');
    expect(next.turn).toBe(2);
  });

  it('trades at the current price, including worthless shares, and adds one buy per sale', () => {
    const state = game({ trading: true, buyLimit: 1 });
    const player = state.players[state.currentPlayer];
    state.phase = 'buy';
    state.board = { '1A': 'worldwide', '2A': 'worldwide' };
    player.stocks.worldwide = 4;
    state.bank.worldwide = 21;
    player.stocks.sackson = 3;
    state.bank.sackson = 22;
    expect(() => applyAction(state, { type: 'buy', stocks: { worldwide: 5 }, sellStocks: { worldwide: 3 } })).toThrow('at most');
    const cash = player.cash;
    const next = applyAction(state, { type: 'buy', stocks: { worldwide: 4 }, sellStocks: { sackson: 3 } });
    expect(next.players[state.currentPlayer].cash).toBeLessThan(cash);
    expect(next.players.find((p) => p.id === player.id)?.stocks.sackson).toBe(0);
    expect(next.players.find((p) => p.id === player.id)?.stocks.worldwide).toBe(8);
    expect(next.bank.worldwide).toBe(17);
    expect(next.bank.sackson).toBe(25);
    expect(() => applyAction({ ...state, houseRules: { ...state.houseRules!, trading: false } }, { type: 'buy', stocks: {}, sellStocks: { sackson: 1 } })).toThrow('not enabled');
  });

  it('uses the final chain roll for both sale and bonuses', () => {
    const state = game({ marketMode: 'crazy' });
    state.board = Object.fromEntries(ALL_TILES.slice(0, 41).map((tile) => [tile, 'worldwide']));
    state.marketShift = -2;
    expect(getMarketPriceForSize(state, 'worldwide', 2)).toBe(200);
    expect(getSharePrice(state, 'worldwide')).toBe(800);
    state.players[0].stocks.worldwide = 3;
    state.bank.worldwide = 22;
    state.phase = 'buy';
    state.endDeclared = true;
    const ended = applyAction(state, { type: 'buy', stocks: {} });
    expect(ended.phase).toBe('ended');
    const settlement = ended.finalSettlements![0];
    expect(settlement.marketDie).toBeGreaterThanOrEqual(1);
    expect(settlement.sharePrice).toBe(getMarketPriceForSize(state, 'worldwide', 41, settlement.marketShift));
    expect(settlement.players[0].stockValue).toBe(3 * settlement.sharePrice);
    expect(settlement.players[0].bonus).toBe(15 * settlement.sharePrice);
  });

  it('pays round-end dividends, removes every fully surrounded tile, and rolls the next market', () => {
    const base = game({ dividends: true, marketMode: 'crazy' });
    const board: GameState['board'] = {};
    for (let row = 0; row < 5; row++) for (let column = 1; column <= 5; column++) board[`${column}${String.fromCharCode(65 + row)}`] = 'worldwide';
    board['11I'] = 'sackson'; board['12I'] = 'sackson';
    base.board = board;
    const held = new Set([...Object.keys(board), ...base.players.flatMap((player) => player.hand)]);
    base.bag = ALL_TILES.filter((tile) => !held.has(tile));
    base.turn = base.players.length;
    base.phase = 'buy';
    base.currentPlayer = 0;
    base.players[0].stocks.worldwide = 6;
    base.bank.worldwide = 19;
    expect(getInsideTiles(base, 'worldwide')).toHaveLength(9);
    let result: GameState | undefined;
    for (let rng = 0; rng < 500; rng++) {
      const candidate = applyAction({ ...base, rng }, { type: 'buy', stocks: {} });
      if (candidate.lastRoundRolls?.chain === 'worldwide') { result = candidate; break; }
    }
    expect(result).toBeDefined();
    expect(result!.lastRoundRolls?.dividendDie).toBe(1);
    expect(result!.lastRoundRolls?.stockDie).toBe(1);
    expect(result!.lastRoundRolls?.marketDie).toBeGreaterThanOrEqual(1);
    expect(result!.players[0].cash).toBe(base.players[0].cash + 2 * 800);
    expect(result!.board['3C']).toBeUndefined();
    expect(Object.values(result!.board).filter((chain) => chain === 'worldwide')).toHaveLength(16);
    const accounted = [...Object.keys(result!.board), ...result!.bag, ...result!.discarded, ...result!.players.flatMap((player) => player.hand)];
    expect(new Set(accounted).size).toBe(108);
  });

  it('uses the cluster probability table and exact normal/crazy market die rows', () => {
    const empty = game({ dividends: true });
    empty.turn = 3; empty.phase = 'buy'; empty.board = {};
    const noCluster = applyAction(empty, { type: 'buy', stocks: {} });
    expect(noCluster.lastRoundRolls).toMatchObject({ dividendDie: null, stockDie: null, chain: null });

    const full = game({ dividends: true });
    full.turn = 3; full.phase = 'buy';
    const chains = ['worldwide', 'sackson', 'festival', 'imperial', 'american', 'continental', 'tower'] as const;
    full.board = Object.fromEntries(chains.flatMap((chain, index) => [[`${index + 1}A`, chain], [`${index + 1}B`, chain]]));
    const always = applyAction(full, { type: 'buy', stocks: {} });
    expect(always.lastRoundRolls?.stockDie).toBeGreaterThanOrEqual(1);
    expect(always.lastRoundRolls?.chain).not.toBeNull();

    const two = structuredClone(full);
    delete two.board['3A']; delete two.board['3B']; delete two.board['4A']; delete two.board['4B']; delete two.board['5A']; delete two.board['5B'];
    let missed = false;
    for (let rng = 0; rng < 100 && !missed; rng++) {
      const next = applyAction({ ...two, rng }, { type: 'buy', stocks: {} });
      if (next.lastRoundRolls?.dividendDie === 3) {
        expect(next.lastRoundRolls.stockDie).toBeNull();
        missed = true;
      }
    }
    expect(missed).toBe(true);

    for (const [mode, expected] of [['market', [-1, -1, 0, 0, 1, 1]], ['crazy', [-2, -1, 0, 0, 1, 2]]] as const) {
      const base = game({ marketMode: mode });
      base.turn = 3; base.phase = 'buy';
      const observed = new Map<number, number>();
      for (let rng = 0; rng < 100 && observed.size < 6; rng++) {
        const next = applyAction({ ...base, rng }, { type: 'buy', stocks: {} });
        observed.set(next.lastRoundRolls!.marketDie!, next.marketShift!);
      }
      expect([...observed.entries()].sort((a, b) => a[0] - b[0]).map(([, shift]) => shift)).toEqual(expected);
    }
  });

  it('rolls a personal market before the opening turn and each following turn', () => {
    let state = game({ marketMode: 'market', marketFrequency: 'turn' });
    expect(state.lastRoundRolls).toMatchObject({ kind: 'opening', atTurn: 0, marketDie: expect.any(Number) });
    for (let completed = 1; completed <= 9; completed++) {
      state = applyAction({ ...state, phase: 'buy' }, { type: 'buy', stocks: {} });
      expect(state.lastRoundRolls).toMatchObject({ atTurn: completed, marketDie: expect.any(Number) });
      expect(state.lastRoundRolls?.kind).toBe(completed % state.players.length === 0 ? 'round' : 'turn');
      expect(state.lastRoundRolls?.marketShift).toBe(state.marketShift);
    }
    expect(state.recentDiceRolls?.map((roll) => roll.atTurn)).toEqual([7, 8, 9]);
    const timed = game({ marketMode: 'market', marketFrequency: 'turn', turnTimerSeconds: 5 });
    expect(timed.turnDeadlineAt! - Date.now()).toBeGreaterThan(10000);
    const nextTimed = applyAction({ ...timed, phase: 'buy' }, { type: 'buy', stocks: {} });
    expect(nextTimed.turnDeadlineAt! - Date.now()).toBeGreaterThan(10000);
  });

  it('can wait two or three completed rounds between market rolls while dividends stay roundly', () => {
    let everyTwo = game({ dividends: true, marketMode: 'market', marketFrequency: 'two-rounds' });
    for (let completed = 1; completed <= 6; completed++) {
      everyTwo = applyAction({ ...everyTwo, phase: 'buy' }, { type: 'buy', stocks: {} });
      if (completed === 3) expect(everyTwo.lastRoundRolls).toMatchObject({ atTurn: 3, marketDie: null });
      if (completed === 6) expect(everyTwo.lastRoundRolls).toMatchObject({ atTurn: 6, marketDie: expect.any(Number) });
    }
    let everyThree = game({ marketMode: 'crazy', marketFrequency: 'three-rounds' });
    for (let completed = 1; completed <= 9; completed++) {
      everyThree = applyAction({ ...everyThree, phase: 'buy' }, { type: 'buy', stocks: {} });
      if (completed < 9) expect(everyThree.lastRoundRolls).toBeUndefined();
    }
    expect(everyThree.lastRoundRolls).toMatchObject({ atTurn: 9, marketDie: expect.any(Number) });
    expect(() => game({ marketFrequency: 'sometimes' as HouseRules['marketFrequency'] })).toThrow('market roll frequency');
  });

  it('enforces a turn deadline by completing the current turn automatically', () => {
    const state = game({ placementsPerTurn: 3, turnTimerSeconds: 5 });
    expect(expireTurn(state, state.turnDeadlineAt! - 1)).toBe(state);
    const next = expireTurn(state, state.turnDeadlineAt!);
    expect(next.turn).toBe(2);
    expect(next.logs.some((entry) => entry.type === 'timeout')).toBe(true);
    expect(next.turnDeadlineAt).toBeGreaterThan(Date.now());
  });

  it('completes a seeded game with combined house rules and conserves tiles and shares', () => {
    let state = game({ startingTilesPerPlayer: 3, startingCash: 9000, placementsPerTurn: 3, removalsPerTurn: 2, buyLimit: 5, dividends: true, trading: true, marketMode: 'crazy' }, 8102);
    let steps = 0;
    while (state.phase !== 'ended' && steps++ < 3000) state = applyAction(state, chooseBotAction(state));
    expect(state.phase).toBe('ended');
    const tiles = [...Object.keys(state.board), ...state.bag, ...state.discarded, ...state.players.flatMap((player) => player.hand)];
    expect(tiles).toHaveLength(108);
    expect(new Set(tiles).size).toBe(108);
    for (const chain of ['worldwide', 'sackson', 'festival', 'imperial', 'american', 'continental', 'tower'] as const)
      expect(state.bank[chain] + state.players.reduce((sum, player) => sum + player.stocks[chain], 0)).toBe(25);
  }, 60000);
});
