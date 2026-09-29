import { describe, expect, it } from 'vitest';
import { applyAction, chooseBotAction, createGame, type GameState } from '../game/engine';
import { collectTurnRecaps } from './turnRecaps';

function table(): GameState {
  const state = createGame({
    seed: 73,
    players: [
      { id: 'human', name: 'Alex' },
      { id: 'bot', name: 'Ellis', isBot: true },
      { id: 'other', name: 'Morgan' },
    ],
  });
  state.currentPlayer = 1;
  state.board = { '1A': 'worldwide', '2A': 'worldwide', '6A': 'independent' };
  state.players[1].hand = ['3A', '6B'];
  state.players[2].hand = ['7A', '10G'];
  state.players[0].hand = ['3B', '12I'];
  return state;
}

describe('public completed-turn recaps', () => {
  it('waits for a completed turn and includes its exact placement and purchases', () => {
    const before = table();
    const placed = applyAction(before, { type: 'place', tile: '3A' });
    expect(collectTurnRecaps(before, placed, 'human')).toEqual([]);
    const bought = applyAction(placed, { type: 'buy', stocks: { worldwide: 3 } });
    const [recap] = collectTurnRecaps(placed, bought, 'human');
    expect(recap).toMatchObject({
      turn: 1,
      playerId: 'bot',
      playerName: 'Ellis',
      isBot: true,
      tile: '3A',
      chain: 'worldwide',
      purchases: [{ chain: 'worldwide', quantity: 3 }],
      founding: null,
    });
    expect(recap.board).toEqual(bought.board);
    expect(recap).not.toHaveProperty('hand');
    expect(recap).not.toHaveProperty('stocks');
    expect(recap).not.toHaveProperty('bank');
  });

  it('keeps every completed turn and its own board in a batched online update', () => {
    const before = table();
    let next = applyAction(before, { type: 'place', tile: '3A' });
    next = applyAction(next, { type: 'buy', stocks: { worldwide: 2 } });
    const firstBoard = next.board;
    next = applyAction(next, { type: 'place', tile: '7A' });
    next = applyAction(next, { type: 'found', chain: 'sackson' });
    next = applyAction(next, { type: 'buy', stocks: { worldwide: 1, sackson: 2 } });
    const recaps = collectTurnRecaps(before, next, 'human');
    expect(recaps).toHaveLength(2);
    expect(recaps.map((recap) => recap.playerId)).toEqual(['bot', 'other']);
    expect(recaps[0].board).toEqual(firstBoard);
    expect(recaps[0].board).not.toHaveProperty('7A');
    expect(recaps[1].board).toEqual(next.board);
    expect(recaps[1].founding).toEqual({ chain: 'sackson', receivedShare: true });
    expect(recaps[1].purchases).toEqual([
      { chain: 'worldwide', quantity: 1 },
      { chain: 'sackson', quantity: 2 },
    ]);
    expect(new Set(recaps.map((recap) => recap.id)).size).toBe(2);
  });

  it('excludes the viewer’s own turn unless pass-and-play requests every turn', () => {
    const before = table();
    let next = applyAction(before, { type: 'place', tile: '3A' });
    next = applyAction(next, { type: 'buy', stocks: {} });
    expect(collectTurnRecaps(before, next, 'bot')).toEqual([]);
    expect(collectTurnRecaps(before, next, 'bot', true)).toHaveLength(1);
    expect(collectTurnRecaps(before, next, 'human')[0].purchases).toEqual([]);
  });

  it('never replays history after opening, resuming, duplicating, or switching a game', () => {
    const before = table();
    let next = applyAction(before, { type: 'place', tile: '3A' });
    next = applyAction(next, { type: 'buy', stocks: {} });
    expect(collectTurnRecaps(null, next, 'human')).toEqual([]);
    expect(collectTurnRecaps(next, next, 'human')).toEqual([]);
    expect(collectTurnRecaps(next, before, 'human')).toEqual([]);
    expect(collectTurnRecaps({ ...before, id: 'another-game' }, next, 'human')).toEqual([]);
    expect(collectTurnRecaps(next, { ...next, revision: next.revision + 1 }, 'human')).toEqual([]);
  });

  it('includes public merger settlements without relying on current holdings', () => {
    const before = table();
    before.board = { '1A': 'worldwide', '2A': 'worldwide', '4A': 'sackson', '5A': 'sackson' };
    before.players[1].stocks.sackson = 2;
    before.bank.sackson = 23;
    let next = applyAction(before, { type: 'place', tile: '3A' });
    next = applyAction(next, { type: 'choose-survivor', chain: 'worldwide' });
    next = applyAction(next, { type: 'resolve-shares', sell: 0, trade: 2 });
    next = applyAction(next, { type: 'buy', stocks: { worldwide: 1 } });
    const [recap] = collectTurnRecaps(before, next, 'human');
    expect(recap.board).toEqual(next.board);
    expect(recap.chain).toBe('worldwide');
    expect(recap.purchases).toEqual([{ chain: 'worldwide', quantity: 1 }]);
    expect(recap.events.some((event) => event.type === 'merger')).toBe(true);
    expect(recap.events.some((event) => event.type === 'bonus')).toBe(true);
    expect(recap.events.find((event) => event.type === 'shares')?.message).toContain(
      'trades 2 for 1 Worldwide',
    );
  });

  it('still reports the final purchase after automatic share liquidation', () => {
    const before = table();
    before.board = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`${i + 1}A`, 'worldwide']),
    );
    before.players[1].hand = ['12A'];
    let next = applyAction(before, { type: 'place', tile: '12A' });
    next = applyAction(next, { type: 'declare-end' });
    next = applyAction(next, { type: 'buy', stocks: { worldwide: 3 } });
    expect(next.phase).toBe('ended');
    expect(next.players[1].stocks.worldwide).toBe(0);
    const [recap] = collectTurnRecaps(before, next, 'human');
    expect(recap.tile).toBe('12A');
    expect(recap.purchases).toEqual([{ chain: 'worldwide', quantity: 3 }]);
  });

  it('distinguishes an unavailable founder share from a purchased share', () => {
    const before = table();
    before.bank.sackson = 0;
    before.players[0].stocks.sackson = 25;
    let next = applyAction(before, { type: 'place', tile: '6B' });
    next = applyAction(next, { type: 'found', chain: 'sackson' });
    next = applyAction(next, { type: 'buy', stocks: {} });
    const [recap] = collectTurnRecaps(before, next, 'human');
    expect(recap.founding).toEqual({ chain: 'sackson', receivedShare: false });
    expect(recap.purchases).toEqual([]);
    expect(recap.board).toEqual(next.board);
  });

  it('parses purchases even when an investor name includes the word buys', () => {
    const before = table();
    before.players[1].name = 'Ellis buys hotels';
    let next = applyAction(before, { type: 'place', tile: '3A' });
    next = applyAction(next, { type: 'buy', stocks: { worldwide: 2 } });
    expect(collectTurnRecaps(before, next, 'human')[0].purchases).toEqual([
      { chain: 'worldwide', quantity: 2 },
    ]);
  });

  it('reconstructs every board through complete games with growth and multiple mergers', () => {
    for (const seed of [7, 42, 319]) {
      const initial = createGame({
        seed,
        players: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), isBot: true })),
      });
      let state = initial;
      const expectedBoards: GameState['board'][] = [];
      while (state.phase !== 'ended') {
        const action = chooseBotAction(state);
        state = applyAction(state, action);
        if (action.type === 'buy') expectedBoards.push(state.board);
      }
      const recaps = collectTurnRecaps(initial, state, '', true);
      expect(recaps).toHaveLength(expectedBoards.length);
      expect(recaps.map((recap) => recap.board)).toEqual(expectedBoards);
    }
  });
});
