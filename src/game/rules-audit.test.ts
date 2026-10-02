/** Independent audit of the 2008 placement, prices, and full-rack FAQ rule. */
import { describe, expect, it, vi } from 'vitest';
import { CHAIN_IDS, DEFAULT_CHAIN_IDS, type ChainId, type GameAction, type GameState, type Stocks, type Tile } from './types';
import { applyAction, createGame, analyzeTile, getCurrentActor, getPriceForSize, getBonusAmounts, canEndGame, getNeighbors, makeAwards, CHAINS } from './engine';
import { readGames, saveGame } from '../lib/storage';

const allTiles: Tile[] = Array.from({ length: 108 }, (_, i) => `${i % 12 + 1}${'ABCDEFGHI'[Math.floor(i / 12)]}`);
const stocks = (value = 0): Stocks => Object.fromEntries(CHAIN_IDS.map(chain => [chain, value])) as Stocks;

/** Replaces a generated board with deterministic reachable geometry. */
function scenario(chains: Partial<Record<ChainId | 'independent', Tile[]>>, nextTile: Tile,
  holdings: Partial<Record<ChainId, number[]>> = {}, playerCount = 3): GameState {
  const state = createGame({ id: 'audit-fixture', seed: 73, players: Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `Investor ${i + 1}` })) });
  state.board = {};
  for (const [chain, tiles] of Object.entries(chains)) for (const tile of tiles) state.board[tile] = chain as ChainId | 'independent';
  const free = allTiles.filter(tile => !state.board[tile] && tile !== nextTile).reverse();
  state.currentPlayer = 0;
  state.players.forEach((player, i) => {
    player.hand = i === 0 ? [nextTile, ...free.splice(0, 5)] : free.splice(0, 6);
    player.stocks = stocks(); player.cash = 6000;
  });
  state.bank = stocks(25);
  for (const [chain, values] of Object.entries(holdings)) {
    values.forEach((value, i) => { state.players[i].stocks[chain as ChainId] = value; });
    state.bank[chain as ChainId] -= values.reduce((a, b) => a + b, 0);
  }
  state.bag = free; state.logs = [];
  return state;
}

const mergerBoard = {
  tower: ['1B', '2B', '3B', '4B', '1C', '2C', '3C', '4C'],
  continental: ['6C', '7C', '8C', '9C', '10C'],
} satisfies Partial<Record<ChainId, Tile[]>>;
const step = (state: GameState, action: GameAction) => applyAction(state, action);
const players = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Investor ${i}` }));

function blockedRackState(): GameState {
  const state = scenario({
    tower: ['1A', '2A'], sackson: ['4A', '5A'], american: ['1C', '2C'], festival: ['4C', '5C'],
    worldwide: ['1E', '2E'], continental: ['4E', '5E'], imperial: ['1G', '2G'],
    independent: ['8B', '11B', '8E', '11E', '8H', '11H'],
  }, '7B');
  const rack = ['7B', '9B', '8A', '10B', '12B', '11A'];
  const otherTiles = state.players.slice(1).flatMap(player => player.hand);
  state.players[0].hand = rack;
  state.bag = allTiles.filter(tile => !state.board[tile] && !rack.includes(tile) && !otherTiles.includes(tile));
  return state;
}

function finishMerger(state: GameState): GameState {
  let next = state;
  for (let i = 0; next.phase === 'merger-shares' && i < 24; i++) next = step(next, { type: 'resolve-shares', sell: 0, trade: 0 });
  return next;
}

describe('2008 setup, names and exact printed prices (pp. 1–5, 7)', () => {
  it('allows two to six seats with the two-player extension and rejects unsupported bonus variants', () => {
    expect(() => createGame({ players: players(1) })).toThrow();
    expect(() => createGame({ players: players(7) })).toThrow();
    expect(() => createGame({ players: players(3), mode: 'tycoon' as never })).toThrow();
    for (const count of [2, 3, 4, 5, 6]) {
      const config = { players: players(count), seed: 249 };
      const state = createGame(config);
      expect(state.version).toBe(2);
      expect(state.mode).toBe('classic');
      expect(createGame(config)).toEqual(state);
      expect(state.players.every(player => player.cash === 6000 && player.hand.length === 6)).toBe(true);
      const dealt = [...Object.keys(state.board), ...state.bag, ...state.players.flatMap(player => player.hand)];
      expect(dealt).toHaveLength(108); expect(new Set(dealt).size).toBe(108);
      const ordinal = (tile: string) => 'ABCDEFGHI'.indexOf(tile.slice(-1)) * 12 + parseInt(tile, 10);
      expect(ordinal(state.players[state.currentPlayer].initialTile)).toBe(Math.min(...state.players.map(player => ordinal(player.initialTile))));
    }
  });

  it('uses the seven 2008 names and their different price groups', () => {
    expect(CHAINS.filter(chain => DEFAULT_CHAIN_IDS.includes(chain.id)).map(chain => chain.name).sort()).toEqual(['American', 'Continental', 'Festival', 'Imperial', 'Sackson', 'Tower', 'Worldwide']);
    expect(CHAIN_IDS).toContain('sackson');
    expect(CHAIN_IDS).not.toContain('luxor');
    for (const chain of ['sackson', 'worldwide'] as const) expect(getPriceForSize(chain, 2)).toBe(200);
    for (const chain of ['festival', 'imperial', 'american'] as const) expect(getPriceForSize(chain, 2)).toBe(300);
    for (const chain of ['continental', 'tower'] as const) expect(getPriceForSize(chain, 2)).toBe(400);
    expect(getPriceForSize('worldwide', 3)).toBe(300); // p.3 worked example
    expect(getPriceForSize('american', 10)).toBe(700); // p.5 worked example
    expect(getPriceForSize('continental', 6)).toBe(800); // p.4 worked sale example
  });

  it('matches every size threshold and majority/minority reference value', () => {
    const thresholds = [[0, 0], [1, 0], [2, 200], [3, 300], [4, 400], [5, 500], [6, 600], [10, 600],
      [11, 700], [20, 700], [21, 800], [30, 800], [31, 900], [40, 900], [41, 1000], [108, 1000]];
    for (const [size, base] of thresholds) for (const chain of DEFAULT_CHAIN_IDS) {
      const tier = ['sackson', 'worldwide'].includes(chain) ? 0 : ['continental', 'tower'].includes(chain) ? 200 : 100;
      expect(getPriceForSize(chain, size), `${chain} at ${size} tiles`).toBe(base ? base + tier : 0);
    }
    for (let price = 200; price <= 1200; price += 100) expect(getBonusAmounts(price, 'classic')).toEqual([price * 10, price * 5]);
  });
});

describe('2008 shareholder payout rules (p. 4)', () => {
  it.each<[string, number[], number[]]>([
    ['regular ranks', [3, 2, 1], [7000, 3500, 0]],
    ['sole shareholder', [0, 1, 0], [0, 10500, 0]],
    ['primary three-way tie', [3, 3, 3, 1], [3500, 3500, 3500, 0]],
    ['secondary three-way rounded split', [5, 2, 2, 2], [7000, 1200, 1200, 1200]],
    ['no shareholders', [0, 0, 0], [0, 0, 0]],
  ])('%s', (_label, holdings, expected) => {
    const state = scenario(mergerBoard, '5C', { continental: holdings }, holdings.length);
    const after = step(state, { type: 'place', tile: '5C' });
    expect(after.players.map(player => player.cash - 6000)).toEqual(expected);
    expect(after.bank.continental).toBe(25 - holdings.reduce((a, b) => a + b, 0));
    expect(after.rng).toBe(state.rng);
    expect(after.bag).toEqual(state.bag); // no virtual bank shareholder in this edition
  });
});

describe('2008 placement and founder stock (pp. 2–4)', () => {
  it('leaves adjacent setup tiles unincorporated until the next placed tile founds their group', () => {
    const configs = { players: players(3) };
    const state = Array.from({ length: 150 }, (_, index) => createGame({ ...configs, seed: index + 1 }))
      .find((game) => Object.keys(game.board).some((tile) => getNeighbors(tile).some((neighbor) => game.board[neighbor] === 'independent')))!;
    expect(state).toBeDefined();
    const setupTiles = Object.keys(state.board);
    expect(setupTiles.every((tile) => state.board[tile] === 'independent')).toBe(true);
    const next = state.bag.find((tile) => setupTiles.some((existing) => getNeighbors(existing).includes(tile)))!;
    expect(next).toBeDefined();
    const oldTile = state.players[state.currentPlayer].hand[0];
    state.players[state.currentPlayer].hand[0] = next;
    state.bag[state.bag.indexOf(next)] = oldTile;
    const placed = step(state, { type: 'place', tile: next });
    expect(placed.phase).toBe('found');
    expect(placed.foundingTiles).toContain(next);
    expect(placed.foundingTiles.length).toBeGreaterThanOrEqual(3);
    const founded = step(placed, { type: 'found', chain: 'tower' });
    expect(founded.foundingTiles).toEqual([]);
    expect(founded.board[next]).toBe('tower');
    expect(founded.players[state.currentPlayer].stocks.tower).toBe(1);
  });
  it('keeps diagonal hotels independent and still permits buying after an isolated placement', () => {
    const state = scenario({ independent: ['4D'], worldwide: ['1A', '2A'] }, '5E');
    const placed = step(state, { type: 'place', tile: '5E' });
    expect(placed.board['5E']).toBe('independent'); expect(placed.phase).toBe('buy');
    const bought = step(placed, { type: 'buy', stocks: { worldwide: 1 } });
    expect(bought.players[0].stocks.worldwide).toBe(1);
    expect(bought.players[0].cash).toBe(5800);
  });

  it('absorbs a connected independent cluster and keeps the free share separate from three purchases', () => {
    const state = scenario({ independent: ['4D', '4C', '3C'] }, '5D');
    const placed = step(state, { type: 'place', tile: '5D' });
    const founded = step(placed, { type: 'found', chain: 'tower' });
    expect(['4D', '4C', '3C', '5D'].map(tile => founded.board[tile])).toEqual(Array(4).fill('tower'));
    expect(founded.players[0].stocks.tower).toBe(1); expect(founded.players[0].cash).toBe(6000);
    const bought = step(founded, { type: 'buy', stocks: { tower: 3 } });
    expect(bought.players[0].stocks.tower).toBe(4); expect(bought.players[0].cash).toBe(4200);
  });

  it('gives no founder share and no cash substitute when all 25 certificates are retained', () => {
    const state = scenario({ independent: ['4D'] }, '5D', { tower: [0, 25, 0] });
    const after = step(step(state, { type: 'place', tile: '5D' }), { type: 'found', chain: 'tower' });
    expect(after.players[0].cash).toBe(6000); expect(after.players[0].stocks.tower).toBe(0); expect(after.bank.tower).toBe(0);
  });

  it('protects two safe chains and permits one safe chain to acquire a smaller chain', () => {
    const state = scenario({
      tower: [...Array.from({ length: 10 }, (_, i) => `${i + 1}C`), '1B'],
      imperial: [...Array.from({ length: 10 }, (_, i) => `${i + 1}E`), '1F'],
    }, '5D');
    expect(analyzeTile(state, '5D')).toMatchObject({ legal: false, permanent: true });
    expect(() => step(state, { type: 'place', tile: '5D' })).toThrow();
    delete state.board['1F']; state.bag.push('1F');
    expect(analyzeTile(state, '5D')).toMatchObject({ legal: true, kind: 'merge' });
    const after = step(state, { type: 'place', tile: '5D' });
    expect(Object.values(after.board).filter(chain => chain === 'tower')).toHaveLength(22);
  });
});

describe('closing awards', () => {
  it('reserves City Builder for tile-placement variants and gives quiet investors earned awards', () => {
    const state = scenario({}, '5D');
    state.winnerIds = ['p2'];
    state.metrics!['p0'].tilesPlaced = 4;
    state.metrics!['p1'].tilesPlaced = 5;
    state.metrics!['p2'].tilesPlaced = 6;
    state.metrics!['p2'].sharesBought = 1;
    state.finalSettlements = [{ chain: 'tower', size: 2, sharePrice: 400, majorityIds: [], minorityIds: [],
      players: state.players.map((player, index) => ({ playerId: player.id, name: player.name, shares: [6, 0, 2][index], bonus: 0, stockValue: 0, total: 0 })) }];
    const standard = makeAwards(state);
    expect(standard.some((award) => award.title === 'City Builder')).toBe(false);
    expect(standard.find((award) => award.playerId === 'p0')?.title).toBe('Tower Backer');
    expect(standard.find((award) => award.playerId === 'p1')?.title).toBe('Neighborhood Scout');
    expect(state.players.every((player) => standard.some((award) => award.playerId === player.id))).toBe(true);
    state.houseRules!.placementsPerTurn = 2;
    expect(makeAwards(state).some((award) => award.title === 'City Builder')).toBe(true);
  });
});

describe('2008 unplayable tiles and complete rack exchange (p. 5 FAQ)', () => {
  it('exchanges all temporarily blocked tiles and permits a placement in the same turn', () => {
    const state = blockedRackState();
    expect(state.players[0].hand.every(tile => !analyzeTile(state, tile).legal && !analyzeTile(state, tile).permanent)).toBe(true);
    const originals = [...state.players[0].hand];
    const snapshot = structuredClone(state);
    expect(() => step(state, { type: 'replace-dead-tiles' })).toThrow();
    expect(() => step(state, { type: 'pass' })).toThrow();
    const after = step(state, { type: 'exchange-hand' });
    expect(after.discarded).toEqual(expect.arrayContaining(originals));
    expect(after.players[0].hand).toHaveLength(6);
    expect(after.players[0].hand.some(tile => originals.includes(tile))).toBe(false);
    expect(after.phase).toBe('place'); expect(after.turn).toBe(state.turn);
    const legal = after.players[0].hand.find(tile => analyzeTile(after, tile).legal)!;
    expect(legal).toBeDefined();
    expect(step(after, { type: 'place', tile: legal }).tilePlacedThisTurn).toBe(true);
    expect(state).toEqual(snapshot);
  });

  it('exchanges a mixed rack, including both safe-merger and eighth-chain tiles', () => {
    const state = scenario({
      tower: Array.from({ length: 11 }, (_, i) => `${i + 1}C`),
      imperial: Array.from({ length: 11 }, (_, i) => `${i + 1}E`),
      worldwide: ['1A', '2A'], sackson: ['4A', '5A'], festival: ['7A', '8A'],
      american: ['1G', '2G'], continental: ['4G', '5G'],
      independent: ['12H', '9H'],
    }, '5D');
    const rack = ['5D', '12G', '11H', '12I', '8H', '10H'];
    state.players[0].hand = rack;
    const otherHands = state.players.slice(1).flatMap(player => player.hand);
    state.bag = allTiles.filter(tile => !state.board[tile] && !rack.includes(tile) && !otherHands.includes(tile));
    expect(analyzeTile(state, '5D')).toMatchObject({ legal: false, permanent: true });
    expect(rack.slice(1).every(tile => {
      const analysis = analyzeTile(state, tile);
      return !analysis.legal && !analysis.permanent;
    })).toBe(true);
    const after = step(state, { type: 'exchange-hand' });
    expect(after.discarded).toEqual(expect.arrayContaining(rack));
    expect(after.players[0].hand).toHaveLength(6);
    expect(after.phase).toBe('place');
  });

  it('retains temporarily blocked tiles when another tile can be placed', () => {
    const state = blockedRackState();
    const waiting = state.players[0].hand.slice(1);
    state.players[0].hand = ['1I', ...waiting];
    state.bag = state.bag.filter((tile) => tile !== '1I');
    expect(analyzeTile(state, '1I').legal).toBe(true);
    expect(waiting.every((tile) => !analyzeTile(state, tile).legal && !analyzeTile(state, tile).permanent)).toBe(true);
    expect(() => step(state, { type: 'exchange-hand' })).toThrow();
    const placed = step(state, { type: 'place', tile: '1I' });
    const bought = step(placed, { type: 'buy', stocks: {} });
    expect(waiting.every((tile) => bought.players[0].hand.includes(tile))).toBe(true);
    expect(bought.discarded).toEqual([]);
  });

  it('retires only a safe-to-safe tile, preserving legal alternatives and drawing what is available', () => {
    const state = scenario({
      tower: Array.from({ length: 11 }, (_, i) => `${i + 1}C`),
      imperial: Array.from({ length: 11 }, (_, i) => `${i + 1}E`),
    }, '5D');
    state.players[0].hand = ['5D', '12I'];
    state.bag = ['2I'];
    expect(analyzeTile(state, '5D')).toMatchObject({ legal: false, permanent: true });
    expect(analyzeTile(state, '12I').legal).toBe(true);
    expect(() => step(state, { type: 'pass' })).toThrow();
    expect(() => step(state, { type: 'exchange-hand' })).toThrow();
    const after = step(state, { type: 'replace-dead-tiles' });
    expect(after.discarded).toEqual(['5D']);
    expect(after.players[0].hand).toEqual(['12I', '2I']);
    expect(after.phase).toBe('place');
    expect(after.turn).toBe(state.turn);
  });

  it('retires permanently blocked tiles even when no replacements remain', () => {
    const state = scenario({
      tower: Array.from({ length: 11 }, (_, i) => `${i + 1}C`),
      imperial: Array.from({ length: 11 }, (_, i) => `${i + 1}E`),
    }, '5D');
    state.players[0].hand = ['5D'];
    state.bag = [];
    const after = step(state, { type: 'replace-dead-tiles' });
    expect(after.discarded).toEqual(['5D']);
    expect(after.players[0].hand).toEqual([]);
    expect(step(after, { type: 'pass' }).phase).toBe('buy');
  });

  it('can exchange a second fully blocked rack, then skip placement only when the bag is empty', () => {
    const state = blockedRackState();
    const nextBlocked = ['7E', '9E', '8D', '10E', '12E', '11D'];
    state.bag = [...state.bag.filter(tile => !nextBlocked.includes(tile)), ...nextBlocked];
    const first = step(state, { type: 'exchange-hand' });
    expect(first.players[0].hand.every(tile => !analyzeTile(first, tile).legal)).toBe(true);
    const second = step(first, { type: 'exchange-hand' });
    expect(second.turn).toBe(state.turn);
    expect(second.discarded).toHaveLength(12);
    const last = blockedRackState();
    last.bag = ['7E', '9E'];
    const exhausted = step(last, { type: 'exchange-hand' });
    expect(exhausted.players[0].hand).toHaveLength(2);
    expect(exhausted.bag).toHaveLength(0);
    expect(step(exhausted, { type: 'pass' }).phase).toBe('buy');
  });

  it('limits the full-rack exchange to the beginning of a turn', () => {
    const afterPlacement = blockedRackState();
    afterPlacement.houseRules!.placementsPerTurn = 2;
    afterPlacement.placementsThisTurn = 1;
    expect(() => step(afterPlacement, { type: 'exchange-hand' })).toThrow();
    const afterRemoval = blockedRackState();
    afterRemoval.houseRules!.placementsPerTurn = 2;
    afterRemoval.houseRules!.removalsPerTurn = 1;
    afterRemoval.removalsThisTurn = 1;
    expect(() => step(afterRemoval, { type: 'exchange-hand' })).toThrow();
  });

  it('retains individual blocked tiles after buying when the rack has legal alternatives', () => {
    const state = scenario({
      tower: Array.from({ length: 11 }, (_, i) => `${i + 1}C`),
      imperial: Array.from({ length: 11 }, (_, i) => `${i + 1}E`),
    }, '5D');
    const after = step(step(state, { type: 'place', tile: '12I' }), { type: 'buy', stocks: {} });
    expect(after.phase).toBe('place'); expect(after.currentPlayer).toBe(1);
    expect(after.players[0].hand).toContain('5D'); expect(after.discarded).toEqual([]);
  });
});

describe('2008 merger sequence and bank limits (pp. 3–4)', () => {
  it('lets the merger maker trade before the majority holder when only one survivor share remains', () => {
    const state = scenario(mergerBoard, '5C', { continental: [2, 12, 4], tower: [24, 0, 0] });
    let next = step(state, { type: 'place', tile: '5C' });
    expect(next.merger?.shareholders).toEqual([0, 1, 2]);
    expect(next.logs.find(entry => entry.payout)?.payout?.majorityIds).toEqual(['p1']);
    next = step(next, { type: 'resolve-shares', sell: 0, trade: 2 });
    expect(next.players[0].stocks.tower).toBe(25);
    expect(next.bank.tower).toBe(0);
    expect(getCurrentActor(next).id).toBe('p1');
    expect(() => step(next, { type: 'resolve-shares', sell: 0, trade: 2 })).toThrow();
    next = step(next, { type: 'resolve-shares', sell: 12, trade: 0 });
    expect(getCurrentActor(next).id).toBe('p2');
  });

  it('lets the mover choose an equal survivor using original sizes and settles at the original price', () => {
    const state = scenario({ tower: ['3C', '4C'], american: ['6C', '7C'] }, '5C', { american: [2, 3, 1] });
    const placed = step(state, { type: 'place', tile: '5C' });
    expect(placed.phase).toBe('merger-survivor');
    expect(placed.merger?.survivorOptions.sort()).toEqual(['american', 'tower']);
    const chosen = step(placed, { type: 'choose-survivor', chain: 'tower' });
    expect(chosen.merger?.sharePrice).toBe(300);
    expect(chosen.players.map(player => player.cash)).toEqual([7500, 9000, 6000]);
    const traded = step(chosen, { type: 'resolve-shares', sell: 0, trade: 2 });
    expect(traded.players[0].stocks.tower).toBe(1);
    expect(getCurrentActor(traded).id).toBe('p1');
    const sold = step(traded, { type: 'resolve-shares', sell: 3, trade: 0 });
    expect(sold.players[1].cash).toBe(9900);
    const resolved = finishMerger(sold);
    expect(resolved.players[2].stocks.american).toBe(1);
    expect(resolved.bank.american).toBe(24); expect(resolved.bank.tower).toBe(24);
    expect(resolved.phase).toBe('buy'); expect(getCurrentActor(resolved).id).toBe('p0');
  });

  it('resolves four chains by descending original size and restarts shareholder decisions at the mover', () => {
    const state = scenario({
      tower: ['1E', '2E', '3E', '4E'], american: ['6E', '7E', '8E'], festival: ['5F', '5G', '5H'], imperial: ['5C', '5D'],
    }, '5E', { american: [2, 2, 2], festival: [2, 2, 2], imperial: [2, 2, 2] });
    [state.players[0].hand, state.players[2].hand] = [state.players[2].hand, state.players[0].hand];
    state.currentPlayer = 2;
    let next = step(state, { type: 'place', tile: '5E' });
    expect(next.phase).toBe('merger-order');
    expect(() => step(next, { type: 'choose-acquired', chain: 'imperial' })).toThrow();
    next = step(next, { type: 'choose-acquired', chain: 'festival' });
    for (const chain of ['festival', 'american', 'imperial'] as const) {
      expect(next.merger?.acquired).toBe(chain);
      expect(next.merger?.sharePrice).toBe(chain === 'imperial' ? 300 : 400);
      expect(next.merger?.shareholders).toEqual([2, 0, 1]);
      for (const i of [2, 0, 1]) {
        expect(getCurrentActor(next).id).toBe(`p${i}`);
        next = step(next, { type: 'resolve-shares', sell: 0, trade: 2 });
      }
    }
    expect(next.phase).toBe('buy'); expect(next.currentPlayer).toBe(2);
    expect(next.players.map(player => player.stocks.tower)).toEqual([3, 3, 3]);
    expect(Object.values(next.board).filter(chain => chain === 'tower')).toHaveLength(13);
  });

  it('rejects odd, excessive and unavailable exchanges without changing the previous state', () => {
    const state = scenario(mergerBoard, '5C', { continental: [3, 2, 0], tower: [0, 25, 0] });
    const merging = step(state, { type: 'place', tile: '5C' });
    const snapshot = structuredClone(merging);
    for (const action of [{ sell: 0, trade: 1 }, { sell: 4, trade: 0 }, { sell: 0, trade: 2 }]) expect(() => step(merging, { type: 'resolve-shares', ...action })).toThrow();
    expect(merging).toEqual(snapshot);
  });
});

describe('2008 ending requires placement first (p. 5)', () => {
  it('rejects an end announcement before placement and finishes buying and drawing after a legal declaration', () => {
    const state = scenario({ tower: Array.from({ length: 11 }, (_, i) => `${i + 1}A`) }, '12A', { tower: [2, 1, 0], imperial: [0, 0, 25] });
    expect(canEndGame(state)).toBe(false);
    expect(() => step(state, { type: 'declare-end' })).toThrow();
    const placed = step(state, { type: 'place', tile: '12A' });
    expect(canEndGame(placed)).toBe(true);
    const declared = step(placed, { type: 'declare-end' });
    expect(declared.phase).toBe('buy');
    const ended = step(declared, { type: 'buy', stocks: { tower: 3 } });
    expect(ended.phase).toBe('ended'); expect(ended.players[0].hand).toHaveLength(6);
    expect(ended.results.find(result => result.playerId === 'p0')).toMatchObject({ cashBefore: 3300, bonuses: 9000, stocksValue: 4500, total: 16800, rank: 1 });
    expect(ended.results.find(result => result.playerId === 'p2')).toMatchObject({ bonuses: 0, stocksValue: 0, total: 6000 });
    expect(ended.bank.tower).toBe(25);
  });

  it('allows an eligible player to continue and clears the placement flag for the next turn', () => {
    const state = scenario({ tower: Array.from({ length: 11 }, (_, i) => `${i + 1}A`) }, '12A');
    const placed = step(state, { type: 'place', tile: '12A' });
    expect(canEndGame(placed)).toBe(true);
    const continued = step(placed, { type: 'buy', stocks: {} });
    expect(continued.phase).toBe('place'); expect(continued.currentPlayer).toBe(1);
    expect(continued.tilePlacedThisTurn).toBe(false); expect(canEndGame(continued)).toBe(false);
  });

  it('shares victory and rejects further play after settlement', () => {
    const state = scenario({ tower: Array.from({ length: 11 }, (_, i) => `${i + 1}A`) }, '12A', { tower: [1, 1, 0] });
    const placed = step(state, { type: 'place', tile: '12A' });
    const ended = step(step(placed, { type: 'declare-end' }), { type: 'buy', stocks: {} });
    expect(ended.winnerIds.sort()).toEqual(['p0', 'p1']);
    expect(ended.results.filter(result => result.rank === 1).map(result => result.total)).toEqual([13700, 13700]);
    expect(() => step(ended, { type: 'pass' })).toThrow();
  });
});

describe('2008 purchase validation and legacy-save isolation', () => {
  it('rejects invalid, inactive, unaffordable and sold-out purchases atomically', () => {
    const state = step(scenario({ tower: ['1A', '2A'] }, '12I'), { type: 'place', tile: '12I' });
    const snapshot = structuredClone(state);
    for (const stock of [{ tower: 4 }, { tower: 1.5 }, { tower: -1 }, { tower: NaN }, { tower: Infinity }, { imperial: 1 }]) {
      expect(() => step(state, { type: 'buy', stocks: stock })).toThrow(); expect(state).toEqual(snapshot);
    }
    const broke = structuredClone(state); broke.players[0].cash = 100;
    expect(() => step(broke, { type: 'buy', stocks: { tower: 1 } })).toThrow();
    const soldOut = structuredClone(state); soldOut.bank.tower = 0; soldOut.players[1].stocks.tower = 25;
    expect(() => step(soldOut, { type: 'buy', stocks: { tower: 1 } })).toThrow();
  });

  it('preserves old save bytes and stores new 2008 games under version 2 only', () => {
    const legacy = ' [{"game":{"version":1,"id":"legacy","mode":"tycoon"},"kind":"local"}] ';
    const memory = new Map<string, string>([['aquire.games.v1', legacy]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) });
    try {
      expect(readGames()).toEqual([]);
      const game = createGame({ players: players(3), seed: 1948 });
      saveGame(game, 'local');
      expect(readGames()).toHaveLength(1);
      expect(readGames()[0].game.version).toBe(2);
      expect(memory.get('aquire.games.v1')).toBe(legacy);
      expect(JSON.parse(memory.get('aquire.games.v2')!)[0].game.id).toBe(game.id);
    } finally { vi.unstubAllGlobals(); }
  });
});
