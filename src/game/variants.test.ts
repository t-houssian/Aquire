import { describe, expect, it } from 'vitest';
import { ALL_TILES, MAPS, analyzeTile, applyAction, canEndGame, chooseBotAction, createGame, getLegalTiles, getNeighbors } from './engine';
import type { BotDifficulty, GameState, MapId } from './types';

const players = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: true }));
const game = (mapId: MapId = 'classic', botDifficulty: BotDifficulty = 'standard', seed = 11) => createGame({ players, mapId, botDifficulty, seed });

describe('optional 2008 city maps', () => {
  it('keeps earlier maps and adds fourteen connected, rotationally balanced cities', () => {
    expect(MAPS.map((map) => map.id)).toEqual([
      'classic', 'corner-plazas', 'riverwalk', 'grand-avenue', 'courtyard', 'peninsulas',
      'hourglass', 'crossroads', 'switchback', 'atoll', 'four-spires',
      'twin-docks', 'obelisk', 'coral-crown', 'lightning-run', 'compass-rose', 'pinwheel', 'starfall-x', 'twin-lagoons',
      'big-rectangle', 'big-crater', 'big-harbors',
      'big-aurora-gate', 'big-trident-towers',
      'mega-diamond', 'mega-rivers', 'mega-divide',
      'mega-triple-arch', 'mega-citadel-grid',
      'max-metropolis', 'max-archipelago', 'max-cross',
      'max-celestial-ring', 'max-orion-star',
    ]);
    expect(MAPS[0].tiles).toEqual(ALL_TILES);
    expect(MAPS.map((map) => map.tiles.length)).toEqual([
      108, 92, 96, 100, 102, 96, 84, 80, 84, 86, 80,
      108, 139, 136, 118, 127, 136, 115, 144,
      192, 168, 160, 185, 206,
      240, 240, 232, 255, 262,
      384, 292, 312, 366, 409,
    ]);
    expect(new Set(MAPS.map((map) => map.palette.name)).size).toBe(MAPS.length);
    expect(new Set(MAPS.map((map) => map.palette.accent)).size).toBe(MAPS.length);
    expect(new Set(MAPS.map((map) => map.tiles.join(','))).size).toBe(MAPS.length);
    for (const map of MAPS) {
      expect(map.tiles.length).toBeGreaterThanOrEqual(80);
      const tiles = new Set(map.tiles);
      expect(tiles.size).toBe(map.tiles.length);
      for (const tile of tiles) {
        const c = Number(tile.slice(0, -1));
        const r = tile.charCodeAt(tile.length - 1) - 65;
        const opposite = `${map.columns + 1 - c}${String.fromCharCode(65 + map.rows - 1 - r)}`;
        expect(tiles.has(opposite), `${map.id} lacks rotational balance at ${tile}`).toBe(true);
      }
      const visited = new Set([map.tiles[0]]);
      const queue = [map.tiles[0]];
      while (queue.length) for (const neighbor of getNeighbors(queue.shift()!, map.id))
        if (tiles.has(neighbor) && !visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      expect(visited.size, `${map.id} is disconnected`).toBe(map.tiles.length);
      const state = game(map.id);
      const distribution = [...Object.keys(state.board), ...state.bag, ...state.players.flatMap((p) => p.hand)];
      expect(new Set(distribution)).toEqual(tiles);
      expect(analyzeTile(state, ALL_TILES.find((tile) => !tiles.has(tile)) ?? '99Z').legal).toBe(false);
    }
  });
  it('gives the new six-seat boards genuinely different dimensions and fair full openings', () => {
    const newSix = MAPS.filter((map) => [
      'twin-docks', 'obelisk', 'coral-crown', 'lightning-run', 'compass-rose', 'pinwheel', 'starfall-x', 'twin-lagoons',
    ].includes(map.id));
    expect(newSix).toHaveLength(8);
    expect(new Set(newSix.map((map) => `${map.columns}×${map.rows}`)).size).toBe(8);
    expect(newSix.every((map) => map.columns !== 12 || map.rows !== 9)).toBe(true);
    for (const map of newSix) {
      const seats = Array.from({ length: 6 }, (_, i) => ({ id: `seat-${i}`, name: `Seat ${i}` }));
      const state = createGame({ players: seats, mapId: map.id, seed: 842, houseRules: { startingTilesPerPlayer: 10 } });
      expect(Object.keys(state.board)).toHaveLength(60);
      expect(state.players.every((player) => player.hand.length === 6)).toBe(true);
      expect(state.bag.length).toBe(map.tiles.length - 96);
    }
  });
  it('keeps enough unique tiles for a six-seat opening on every shape', () => {
    for (const map of MAPS) {
      const seats = Array.from({ length: 6 }, (_, i) => ({ id: `seat-${i}`, name: `Seat ${i}` }));
      const state = createGame({ players: seats, mapId: map.id, seed: 77 });
      expect(state.players.every((player) => player.hand.length === 6), map.id).toBe(true);
      expect(state.bag.length, map.id).toBe(map.tiles.length - 42);
      expect(state.bag.length).toBeGreaterThanOrEqual(38);
    }
  });
  it('enforces each map’s seat limit and deals a complete rack at 8, 10, and 12 seats', () => {
    for (const map of MAPS) {
      const seats = Array.from({ length: map.maxPlayers }, (_, i) => ({ id: `seat-${i}`, name: `Seat ${i}` }));
      const state = createGame({ players: seats, mapId: map.id, seed: 171 });
      expect(state.players).toHaveLength(map.maxPlayers);
      expect(state.players.every((player) => player.hand.length === 6), map.id).toBe(true);
      expect(state.bag.length, map.id).toBe(map.tiles.length - map.maxPlayers * 7);
      expect(() => createGame({ players: [...seats, { id: 'extra', name: 'Extra' }], mapId: map.id })).toThrow();
    }
  });
  it('scales end declarations on expansion maps while leaving the printed board threshold at 41', () => {
    for (const map of [MAPS[0], ...MAPS.filter((item) => item.maxPlayers > 6)]) {
      const state = game(map.id);
      state.phase = 'buy';
      state.tilePlacedThisTurn = true;
      state.board = Object.fromEntries(map.tiles.slice(0, map.endSize + 1).map((tile, index) => [tile, index < map.endSize - 1 ? 'worldwide' : 'sackson']));
      expect(canEndGame(state), `${map.id} one tile below target`).toBe(false);
      state.board[map.tiles[map.endSize + 1]] = 'worldwide';
      expect(canEndGame(state), `${map.id} at target`).toBe(true);
      state.tilePlacedThisTurn = false;
      expect(canEndGame(state), `${map.id} before tile placement`).toBe(false);
      if (map.maxPlayers > 6) {
        state.tilePlacedThisTurn = true;
        state.board = Object.fromEntries(map.tiles.slice(0, Math.ceil(map.tiles.length * 0.38) - 1).map((tile, index) => [tile, index < 11 ? 'worldwide' : 'independent']));
        expect(canEndGame(state), `${map.id} all-safe without an occupancy requirement`).toBe(true);
        state.board[map.tiles[Math.ceil(map.tiles.length * 0.38) - 1]] = 'independent';
        expect(canEndGame(state), `${map.id} all-safe at occupancy target`).toBe(true);
      }
    }
  });
  it('completes six-player games on every shaped six-seat layout', () => {
    for (const map of MAPS.filter((item) => item.maxPlayers === 6 && !['classic', 'corner-plazas', 'riverwalk', 'grand-avenue', 'courtyard', 'peninsulas'].includes(item.id))) {
      const seats = Array.from({ length: 6 }, (_, i) => ({ id: `bot-${i}`, name: `Bot ${i}`, isBot: true }));
      let state = createGame({ players: seats, mapId: map.id, botDifficulty: 'strategist', seed: 921 });
      let steps = 0;
      while (state.phase !== 'ended' && steps++ < 1300) state = applyAction(state, chooseBotAction(state));
      expect(state.phase, map.id).toBe('ended');
      expect(state.results).toHaveLength(6);
      const accounted = [...Object.keys(state.board), ...state.bag, ...state.discarded, ...state.players.flatMap((player) => player.hand)];
      expect(new Set(accounted).size, map.id).toBe(map.tiles.length);
    }
  }, 60000);
  it('finishes seeded games on every map without losing tiles or creating shares', () => {
    for (const map of MAPS) for (const seed of [19, 267]) {
      let state = game(map.id, 'strategist', seed);
      let steps = 0;
      while (state.phase !== 'ended' && steps++ < 1100) state = applyAction(state, chooseBotAction(state));
      expect(state.phase, `${map.id} / seed ${seed}`).toBe('ended');
      const tiles = [...Object.keys(state.board), ...state.bag, ...state.discarded, ...state.players.flatMap((p) => p.hand)];
      expect(new Set(tiles).size).toBe(map.tiles.length);
      expect(state.awards?.every((award) => state.players.some((p) => p.id === award.playerId))).toBe(true);
      expect(state.players.every((p) => state.awards?.some((award) => award.playerId === p.id))).toBe(true);
      expect(state.finalSettlements?.map((chain) => chain.size)).toEqual([...state.finalSettlements!.map((chain) => chain.size)].sort((a, b) => a - b));
      for (const result of state.results) {
        const payouts = state.finalSettlements!.reduce((sum, chain) => sum + chain.players.find((p) => p.playerId === result.playerId)!.total, 0);
        expect(result.total).toBe(result.cashBefore + payouts);
        expect(result.bonuses + result.stocksValue).toBe(payouts);
      }
    }
  }, 120000);
  it('finishes complete games at each new seat limit', () => {
    for (const map of MAPS.filter((item) => item.maxPlayers > 6)) {
      const seats = Array.from({ length: map.maxPlayers }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}`, isBot: true }));
      let state = createGame({ players: seats, mapId: map.id, botDifficulty: 'strategist', seed: 8201 });
      let steps = 0;
      while (state.phase !== 'ended' && steps++ < 6500) state = applyAction(state, chooseBotAction(state));
      expect(state.phase, map.id).toBe('ended');
      expect(state.results.length, map.id).toBe(map.maxPlayers);
      const accounted = [...Object.keys(state.board), ...state.bag, ...state.discarded, ...state.players.flatMap((player) => player.hand)];
      expect(new Set(accounted).size, map.id).toBe(map.tiles.length);
      expect(state.players.every((player) => state.awards?.some((award) => award.playerId === player.id)), map.id).toBe(true);
    }
  }, 120000);
});

describe('difficulty and the optional end declaration', () => {
  it('strategist avoids reviving a cash-starved rival through their majority merger', () => {
    const base = game();
    base.currentPlayer = 0;
    base.phase = 'place';
    base.board = { '1A': 'imperial', '2A': 'imperial', '4A': 'tower', '5A': 'tower', '6A': 'tower' };
    base.players[0].hand = ['3A', '12I'];
    base.players[1].cash = 100;
    base.players[1].stocks.imperial = 15;
    base.bank.imperial = 10;
    expect(getLegalTiles(base)).toEqual(['3A', '12I']);
    expect(chooseBotAction({ ...base, botDifficulty: 'casual' })).toEqual({ type: 'place', tile: '3A' });
    expect(chooseBotAction({ ...base, botDifficulty: 'strategist' })).toEqual({ type: 'place', tile: '12I' });
  });
  it('lets a trailing computer keep playing when end conditions are met and tiles remain', () => {
    const state: GameState = game();
    state.currentPlayer = 0;
    state.board = Object.fromEntries(ALL_TILES.slice(0, 41).map((tile) => [tile, 'worldwide']));
    state.phase = 'buy';
    state.tilePlacedThisTurn = true;
    state.players[1].stocks.worldwide = 12;
    state.bank.worldwide = 13;
    expect(canEndGame(state)).toBe(true);
    expect(state.players[0].hand.length).toBe(6);
    expect(chooseBotAction(state).type).toBe('buy');
    expect(chooseBotAction({ ...state, botDifficulty: 'casual' }).type).toBe('declare-end');
  });
});
