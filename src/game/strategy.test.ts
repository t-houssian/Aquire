import { describe, expect, it } from 'vitest';
import { applyAction, chooseBotAction, createGame } from './engine';
import type { HouseRules } from './types';
const game = (houseRules: Partial<HouseRules> = {}) => {
  const state = createGame({ seed: 12, botDifficulty: 'strategist', players: ['A', 'B', 'C'].map((name, i) => ({ name, id: `p${i}`, isBot: true })), houseRules });
  state.currentPlayer = 0; return state;
};
describe('Strategist house-rule decisions', () => {
  it('values discounted future stock instead of ignoring a depleted majority contest', () => {
    const state = game({ marketMode: 'crazy' }); state.phase = 'buy'; state.marketShift = -2;
    state.board = { '1A': 'worldwide', '2A': 'worldwide', '3A': 'worldwide', '4A': 'worldwide' };
    state.players[0].stocks.worldwide = 12; state.players[1].stocks.worldwide = 10; state.bank.worldwide = 3;
    const action = chooseBotAction(state);
    expect(action.type).toBe('buy'); if (action.type === 'buy') expect(action.stocks.worldwide).toBeGreaterThan(0);
  });
  it('raises cash from an overvalued holding while preserving its bonus lead', () => {
    const state = game({ trading: true, marketMode: 'crazy' }); state.phase = 'buy'; state.marketShift = 2;
    state.board = { '1A': 'worldwide', '2A': 'worldwide' };
    state.players[0].stocks.worldwide = 18; state.players[1].stocks.worldwide = 4; state.bank.worldwide = 3;
    const action = chooseBotAction(state);
    expect(action.type).toBe('buy'); if (action.type === 'buy') { expect(action.sellStocks?.worldwide).toBe(3); expect(action.stocks.worldwide).toBeUndefined(); }
    expect(() => applyAction(state, action)).not.toThrow();
  });
  it('does not use hidden cash or anonymous portfolios when ranking moves', () => {
    for (const rules of [{ hiddenMoney: true }, { anonymousBuying: true }]) {
      const state = game(rules);
      state.board = { '1A': 'imperial', '2A': 'imperial', '4A': 'tower', '5A': 'tower', '6A': 'tower' };
      state.players[0].hand = ['3A', '12I'];
      const other = structuredClone(state);
      other.players[1].cash = 999999;
      if ('anonymousBuying' in rules) other.players[1].stocks.imperial = 20;
      expect(chooseBotAction(other)).toEqual(chooseBotAction(state));
    }
  });
  it('can stop a second placement that would fund an opposing majority', () => {
    const state = game({ placementsPerTurn: 2 }); state.placementsThisTurn = 1; state.tilePlacedThisTurn = true;
    state.board = { '1A': 'imperial', '2A': 'imperial', '4A': 'tower', '5A': 'tower', '6A': 'tower' };
    state.players[0].hand = ['3A']; state.players[1].stocks.imperial = 20; state.players[1].cash = 0;
    expect(chooseBotAction(state)).toEqual({ type: 'finish-placing' });
  });
  it('settles an exhausted table rather than endlessly removing and replaying its own tiles', () => {
    const state = game({ placementsPerTurn: 2, removalsPerTurn: 1 });
    state.board = { '1A': 'worldwide', '2A': 'worldwide', '3A': 'worldwide' };
    state.bag = []; state.players.forEach((player) => { player.hand = []; });
    const action = chooseBotAction(state); expect(action.type).toBe('pass');
    let next = applyAction(state, action);
    next = applyAction(next, chooseBotAction(next));
    expect(next.phase).toBe('ended');
  });
});

it('targets a legal rival edge when its removal lowers their share price and bonuses', () => {
  const state = game({ placementsPerTurn: 2, removalsPerTurn: 1 });
  state.board = Object.fromEntries(['1A', '2A', '3A', '4A', '5A'].map((tile) => [tile, 'worldwide']));
  state.players[0].hand = ['12I']; state.players[1].stocks.worldwide = 20;
  const action = chooseBotAction(state); expect(action.type).toBe('remove');
  const next = applyAction(state, action); expect(Object.keys(next.board)).toHaveLength(4);
});
it('buys the third certificate for a dividend when another bonus bid has little value', () => {
  const state = game({ hotelChains: ['festival', 'imperial', 'american'], dividends: true });
  state.phase = 'buy'; state.bag = state.bag.slice(0, 10); state.players[0].cash = 300;
  state.board = { '1A': 'festival', '2A': 'festival', '4A': 'imperial', '5A': 'imperial', '7A': 'american', '8A': 'american' };
  state.players[2].cash = 0; state.players[0].stocks.festival = 2; state.players[1].stocks.festival = 20;
  state.bank.festival = 3; state.bank.imperial = 0; state.bank.american = 0;
  const without = chooseBotAction({ ...state, houseRules: { ...state.houseRules!, dividends: false } });
  const withDividend = chooseBotAction(state);
  expect(without.type).toBe('buy'); expect(withDividend.type).toBe('buy');
  if (without.type === 'buy' && withDividend.type === 'buy') { expect(without.stocks.festival ?? 0).toBe(0); expect(withDividend.stocks.festival).toBe(1); }
});
