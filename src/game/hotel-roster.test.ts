import { describe, expect, it } from 'vitest';
import {
  CHAIN_IDS, DEFAULT_CHAIN_IDS, applyAction, chooseBotAction, createGame,
  getAvailableChains, getHouseRules, getMarketPriceForSize, getPriceForSize,
  validateHouseRules,
} from './engine';
import type { ChainId, GameState, HouseRules } from './types';

const players = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `Investor ${i + 1}`, isBot: true }));
const game = (houseRules?: Partial<HouseRules>, seed = 117) => createGame({ players, houseRules, seed });

describe('custom hotel roster and share supplies', () => {
  it('keeps the seven printed chains and 25 shares each for old saves and default games', () => {
    const current = game();
    expect(getAvailableChains(current)).toEqual([...DEFAULT_CHAIN_IDS]);
    expect(DEFAULT_CHAIN_IDS.map((chain) => current.bank[chain])).toEqual(Array(7).fill(25));
    delete current.houseRules;
    expect(getHouseRules(current).hotelChains).toEqual([...DEFAULT_CHAIN_IDS]);
    expect(getHouseRules(current).shareSupply).toEqual({});
  });

  it('prices each new hotel at its requested tier', () => {
    expect(getPriceForSize('budgeton', 2)).toBe(100);
    expect(getPriceForSize('heritage', 2)).toBe(getPriceForSize('worldwide', 2));
    expect(getPriceForSize('riviera', 2)).toBe(getPriceForSize('festival', 2));
    expect(getPriceForSize('monarch', 2)).toBe(getPriceForSize('tower', 2));
    expect(getPriceForSize('goldspire', 2)).toBe(getPriceForSize('tower', 2) + 100);
    const state = game({ marketMode: 'crazy', hotelChains: [...CHAIN_IDS] });
    state.marketShift = 2;
    expect(getMarketPriceForSize(state, 'budgeton', 2)).toBe(300);
    expect(getMarketPriceForSize(state, 'goldspire', 2)).toBe(700);
  });

  it('validates small and large rosters and rejects invalid supplies', () => {
    expect(game({ hotelChains: ['budgeton', 'goldspire'] }).houseRules?.hotelChains).toEqual(['budgeton', 'goldspire']);
    expect(game({ hotelChains: [...CHAIN_IDS] }).houseRules?.hotelChains).toHaveLength(12);
    expect(() => validateHouseRules({ hotelChains: ['budgeton'] })).toThrow('at least two');
    expect(() => validateHouseRules({ hotelChains: ['budgeton', 'budgeton'] })).toThrow('different');
    expect(() => validateHouseRules({ shareSupply: { budgeton: 0 } })).toThrow('1 to 100');
    expect(() => validateHouseRules({ shareSupply: { goldspire: 101 } })).toThrow('1 to 100');
    expect(() => validateHouseRules({ shareSupply: { heritage: 2.5 } })).toThrow('1 to 100');
    expect(() => validateHouseRules({ shareSupply: { fake: 4 } as unknown as HouseRules['shareSupply'] })).toThrow('1 to 100');
    expect(validateHouseRules({ shareSupply: { budgeton: 25, goldspire: 50 } }).shareSupply).toEqual({ goldspire: 50 });
  });

  it('lets new chains be founded and bought with their configured finite stock', () => {
    const state = game({ hotelChains: ['budgeton', 'heritage', 'goldspire'], shareSupply: { budgeton: 4, heritage: 1, goldspire: 60 } });
    expect(getAvailableChains(state)).toEqual(['budgeton', 'heritage', 'goldspire']);
    expect(state.bank.budgeton).toBe(4);
    expect(state.bank.heritage).toBe(1);
    expect(state.bank.goldspire).toBe(60);
    state.board = { '1A': 'independent', '2A': 'independent' };
    state.phase = 'found';
    state.foundingTiles = ['1A', '2A'];
    state.lastPlacedTile = '2A';
    state.placementsThisTurn = 1;
    const founded = applyAction(state, { type: 'found', chain: 'budgeton' });
    expect(founded.bank.budgeton).toBe(3);
    expect(founded.players[founded.currentPlayer].stocks.budgeton).toBe(1);
    expect(founded.phase).toBe('buy');
    expect(() => applyAction(founded, { type: 'buy', stocks: { worldwide: 1 } })).toThrow('not available');
    const bought = applyAction(founded, { type: 'buy', stocks: { budgeton: 3 } });
    expect(bought.bank.budgeton).toBe(0);
    expect(bought.players[founded.currentPlayer].stocks.budgeton).toBe(4);
    expect(bought.bank.budgeton + bought.players.reduce((sum, player) => sum + player.stocks.budgeton, 0)).toBe(4);
  });

  it('conserves custom shares through complete games with two and twelve chains', () => {
    for (const roster of [(['budgeton', 'goldspire'] as ChainId[]), [...CHAIN_IDS]]) {
      let state: GameState = game({ hotelChains: roster, shareSupply: { budgeton: 7, goldspire: 40 } }, roster.length);
      let steps = 0;
      while (state.phase !== 'ended' && steps++ < 800) {
        state = applyAction(state, chooseBotAction(state));
        for (const chain of roster) {
          const total = state.bank[chain] + state.players.reduce((sum, player) => sum + player.stocks[chain], 0);
          expect(total, `${chain} after action ${steps}`).toBe(state.houseRules!.shareSupply[chain] ?? 25);
        }
      }
      expect(state.phase, `Roster of ${roster.length} stalled after ${steps} actions`).toBe('ended');
      expect(state.results).toHaveLength(3);
      expect(state.finalSettlements?.every((entry) => roster.includes(entry.chain))).toBe(true);
    }
  }, 30000);
});
