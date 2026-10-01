import { describe, expect, it } from 'vitest';
import {
  ALL_TILES,
  CHAIN_IDS,
  applyAction,
  chooseBotAction,
  createGame,
  getChainSize,
  getCurrentActor,
  getLegalTiles,
  type GameConfig,
  type GameState,
} from './engine';

function config(count = 4, seed = 42): GameConfig {
  return {
    players: Array.from({ length: count }, (_, i) => ({
      id: `player-${i}`,
      name: `Investor ${i + 1}`,
      isBot: true,
    })),
    mode: 'classic',
    seed,
  };
}
function checkInvariants(state: GameState) {
  const tiles = [
    ...Object.keys(state.board),
    ...state.bag,
    ...state.discarded,
    ...state.players.flatMap((p) => p.hand),
  ];
  expect(tiles).toHaveLength(108);
  expect(new Set(tiles).size).toBe(108);
  expect(tiles.every((tile) => ALL_TILES.includes(tile))).toBe(true);
  for (const player of state.players) {
    expect(player.hand.length).toBeLessThanOrEqual(6);
    expect(player.cash).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(player.cash)).toBe(true);
    for (const chain of CHAIN_IDS) {
      expect(player.stocks[chain]).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(player.stocks[chain])).toBe(true);
    }
  }
  for (const chain of CHAIN_IDS) {
    expect(state.bank[chain]).toBeGreaterThanOrEqual(0);
    expect(state.bank[chain] + state.players.reduce((n, p) => n + p.stocks[chain], 0)).toBe(25);
  }
  expect(getCurrentActor(state)).toBeDefined();
}

describe('complete seeded games', () => {
  for (const count of [2, 3, 4, 5, 6]) {
    it(`${count} players finish 2008 games with conserved tiles/shares and no bankruptcies`, () => {
      for (const seed of [1, 7, 42, 319, 999, 1021, 4007, 7349, 9991, 21527]) {
        let state = createGame(config(count, seed));
        let steps = 0;
        while (state.phase !== 'ended' && steps < 650) {
          const safe = CHAIN_IDS.filter((chain) => getChainSize(state, chain) >= 11);
          const previous = JSON.stringify(state);
          const action = chooseBotAction(state);
          const next = applyAction(state, action);
          expect(JSON.stringify(state), 'Actions cannot mutate the input state.').toBe(previous);
          state = next;
          for (const chain of safe) expect(getChainSize(state, chain)).toBeGreaterThanOrEqual(11);
          checkInvariants(state);
          steps++;
        }
        expect(state.phase, `Seed ${seed} stalled after ${steps} actions`).toBe('ended');
        expect(state.results).toHaveLength(count);
        expect(state.winnerIds.length).toBeGreaterThan(0);
        expect(state.results[0].total).toBe(Math.max(...state.players.map((p) => p.cash)));
      }
    }, 60000);
  }
  it('replays identically from the same seed', () => {
    let first = createGame(config(4, 821));
    let second = createGame(config(4, 821));
    expect(second).toEqual(first);
    while (first.phase !== 'ended') {
      const action = chooseBotAction(first);
      first = applyAction(first, action);
      second = applyAction(second, action);
    }
    expect(second).toEqual(first);
  });
  it('bots choose identically when opponent racks and future draws are fully masked', () => {
    const state = createGame(config());
    const hidden = structuredClone(state);
    hidden.bag = hidden.bag.map(() => '?');
    hidden.players.forEach((p) => {
      if (p.id !== getCurrentActor(hidden).id) p.hand = p.hand.map(() => '?');
    });
    hidden.rng = 9876;
    expect(chooseBotAction(hidden)).toEqual(chooseBotAction(state));
  });
});

describe('action boundaries', () => {
  it('creates only 2008 saves and refuses to reinterpret a legacy game', () => {
    const state = createGame(config());
    expect(state.version).toBe(2);
    expect(state.ruleset).toBe('2008');
    expect(state.mode).toBe('classic');
    expect(() => createGame({ ...config(), mode: 'tycoon' } as unknown as GameConfig)).toThrow(
      '2008',
    );
    const legacy = { ...state, version: 1 } as unknown as GameState;
    expect(() => applyAction(legacy, { type: 'place', tile: getLegalTiles(state)[0] })).toThrow(
      'different edition',
    );
  });
  it('rejects illegal actions without changing persisted state', () => {
    const state = createGame(config());
    const original = JSON.stringify(state);
    expect(() => applyAction(state, { type: 'pass' })).toThrow('playable tile');
    expect(() => applyAction(state, { type: 'buy', stocks: { tower: 1 } })).toThrow(
      'Place a building',
    );
    expect(() => applyAction(state, { type: 'place', tile: '99Z' })).toThrow('not in your rack');
    expect(() => applyAction(state, { type: 'declare-end' })).toThrow('41');
    expect(JSON.stringify(state)).toBe(original);
  });
  it('requires two to six distinct named investors', () => {
    expect(() => createGame(config(1))).toThrow('two and 6');
    expect(createGame(config(2)).players).toHaveLength(2);
    expect(() => createGame(config(7))).toThrow('two and 6');
    expect(() =>
      createGame({
        players: [
          { id: 'same', name: 'One' },
          { id: 'same', name: 'Two' },
          { id: 'third', name: 'Three' },
        ],
      }),
    ).toThrow('unique');
  });
  it('does not let forged buy quantities change the bank', () => {
    let state = createGame(config());
    state = applyAction(state, { type: 'place', tile: getLegalTiles(state)[0] });
    if (state.phase === 'found') state = applyAction(state, { type: 'found', chain: 'tower' });
    const original = JSON.stringify(state);
    expect(() => applyAction(state, { type: 'buy', stocks: { tower: -1 } })).toThrow('nonnegative');
    expect(() => applyAction(state, { type: 'buy', stocks: { tower: 0.5 } })).toThrow('whole');
    expect(() => applyAction(state, { type: 'buy', stocks: { tower: Number.NaN } })).toThrow(
      'whole',
    );
    expect(JSON.stringify(state)).toBe(original);
  });
});
