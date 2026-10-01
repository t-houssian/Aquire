import { describe, expect, it } from 'vitest';
import { ALL_TILES, CHAIN_IDS, applyAction, calculateBonuses, canEndGame, chooseBotAction, createGame, endConditionMet, getActiveChains, getMarketPriceForSize, type ChainId, type GameState } from './engine';

const players = ['Alex', 'Morgan', 'Riley'].map((name, i) => ({ id: `p${i}`, name, isBot: i > 0 }));
function mergerFixture(tied = false) {
  const state = createGame({ players, seed: 45, botDifficulty: 'strategist', houseRules: { hotelChains: [...CHAIN_IDS] } });
  state.currentPlayer = 1;
  state.board = { '1A': 'budgeton', '2A': 'budgeton', '4A': 'festival', '5A': 'festival' };
  if (!tied) Object.assign(state.board, { '4B': 'festival', '5B': 'festival' });
  const free = ALL_TILES.filter((tile) => !state.board[tile] && tile !== '3A' && tile !== '6B');
  state.players[1].hand = ['3A', '6B'];
  state.players[0].hand = free.splice(0, 6);
  state.players[2].hand = free.splice(0, 6);
  state.bag = free;
  state.logs = [];
  return state;
}
function hold(state: GameState, chain: ChainId, shares: number[]) {
  shares.forEach((count, i) => { state.players[i].stocks[chain] = count; });
  state.bank[chain] = 25 - shares.reduce((a, b) => a + b, 0);
}

describe('dividend selection and final market rolls', () => {
  it('selects only active chains even with an expanded roster full of inactive chains', () => {
    const state = mergerFixture();
    state.houseRules!.dividends = true;
    state.turn = 3;
    state.phase = 'buy';
    // Budgeton forms a complete one-hotel price group; Festival also remains eligible.
    const selected = new Set<string>();
    for (let rng = 0; rng < 120; rng++) {
      const next = applyAction({ ...state, rng }, { type: 'buy', stocks: {} });
      const report = next.lastRoundRolls!;
      expect(report.stockDieSides).toBe(2);
      if (report.chain) {
        expect(getActiveChains(state)).toContain(report.chain);
        selected.add(report.chain);
      }
    }
    expect([...selected].sort()).toEqual(['budgeton', 'festival']);
    state.board = {};
    const next = applyAction(state, { type: 'buy', stocks: {} });
    expect(next.lastRoundRolls).toMatchObject({ stockDie: null, stockDieSides: 0, chain: null, dividendPaid: 0 });
  });

  for (const mode of ['off', 'market', 'crazy'] as const) it(`settles each chain once with its own ${mode} market, preserving total cash and replay`, () => {
    const state = mergerFixture();
    state.houseRules!.marketMode = mode;
    state.marketShift = -2;
    state.phase = 'buy'; state.endDeclared = true;
    hold(state, 'budgeton', [5, 3, 1]); hold(state, 'festival', [0, 1, 3]);
    const pairs = new Set<string>();
    for (let rng = 0; rng < 30; rng++) {
      const initial = { ...state, rng };
      const ended = applyAction(initial, { type: 'buy', stocks: {} });
      expect(applyAction(JSON.parse(JSON.stringify(initial)), { type: 'buy', stocks: {} })).toEqual(ended);
      const settlements = ended.finalSettlements!;
      expect(settlements.map((item) => item.chain)).toEqual(['budgeton', 'festival']);
      for (const settlement of settlements) {
        if (mode === 'off') expect(settlement.marketDie).toBeUndefined();
        else {
          expect(settlement.marketDie).toBeGreaterThanOrEqual(1);
          expect(settlement.marketDie).toBeLessThanOrEqual(6);
          const shifts = mode === 'crazy' ? [-2, -1, 0, 0, 1, 2] : [-1, -1, 0, 0, 1, 1];
          expect(settlement.marketShift).toBe(shifts[settlement.marketDie! - 1]);
        }
        const price = getMarketPriceForSize(state, settlement.chain, settlement.size, settlement.marketShift ?? 0);
        expect(settlement.sharePrice).toBe(price);
        expect(settlement.players.map((player) => player.bonus)).toEqual(calculateBonuses(state.players.map((p) => p.stocks[settlement.chain]), price));
        settlement.players.forEach((p) => expect(p.stockValue).toBe(p.shares * price));
      }
      state.players.forEach((player) => {
        const paid = settlements.reduce((sum, item) => sum + item.players.find((p) => p.playerId === player.id)!.total, 0);
        expect(ended.results.find((p) => p.playerId === player.id)!.total).toBe(player.cash + paid);
      });
      pairs.add(settlements.map((s) => s.marketDie).join(','));
    }
    if (mode !== 'off') {
      expect(pairs.size).toBeGreaterThan(6);
      expect([...pairs].some((pair) => pair.split(',')[0] !== pair.split(',')[1])).toBe(true);
    }
  });
});

describe('merger payout snapshots', () => {
  for (const shares of [[6, 0, 0], [4, 4, 1], [5, 2, 2], [0, 0, 0]]) it(`captures every investor, including zero payouts: ${shares}`, () => {
    const state = mergerFixture();
    hold(state, 'budgeton', shares);
    const next = applyAction(state, { type: 'place', tile: '3A' });
    const payout = next.logs.find((entry) => entry.payout)?.payout;
    expect(payout).toMatchObject({ chain: 'budgeton', survivor: 'festival', size: 2, sharePrice: 100 });
    expect(payout!.players.map((p) => p.shares)).toEqual(shares);
    expect(payout!.players.map((p) => p.bonus)).toEqual(calculateBonuses(shares, 100));
    state.players.forEach((player, i) => expect(next.players[i].cash - player.cash).toBe(payout!.players[i].bonus));
    if (shares[0] === 6) expect(payout!.majorityIds).toEqual(['p0']);
    if (shares[0] === 4) expect(payout!.majorityIds).toEqual(['p0', 'p1']);
    if (shares[0] === 5) expect(payout!.minorityIds).toEqual(['p1', 'p2']);
  });
});

describe('strategist merger decisions', () => {
  it('plans a full three-share bid to take a majority, rather than valuing only the first share', () => {
    const state = mergerFixture();
    delete state.board['1A']; delete state.board['2A'];
    hold(state, 'festival', [3, 1, 0]);
    state.phase = 'buy'; state.endDeclared = true;
    expect(chooseBotAction(state)).toMatchObject({ type: 'buy', stocks: { festival: 3 } });
  });

  it('sells costly acquired shares when a two-for-one exchange loses money without improving its bonus', () => {
    const state = mergerFixture();
    state.board = { '1A': 'tower', '2A': 'tower', '4A': 'budgeton', '5A': 'budgeton', '6A': 'budgeton' };
    hold(state, 'tower', [0, 4, 0]); hold(state, 'budgeton', [0, 14, 0]);
    const resolving = applyAction(state, { type: 'place', tile: '3A' });
    expect(chooseBotAction(resolving)).toEqual({ type: 'resolve-shares', sell: 4, trade: 0 });
  });

  it('declines a sole-owner windfall for a rival when growing its own chain is available', () => {
    const state = mergerFixture();
    hold(state, 'budgeton', [8, 0, 0]); hold(state, 'festival', [0, 2, 0]);
    state.players[1].cash = 200;
    expect(chooseBotAction(state)).toEqual({ type: 'place', tile: '6B' });
  });
  it('also accounts for acquired chains when the largest chains tie', () => {
    const state = mergerFixture(true);
    hold(state, 'budgeton', [8, 0, 0]); hold(state, 'festival', [0, 0, 8]);
    expect(chooseBotAction(state)).toEqual({ type: 'place', tile: '6B' });
  });
  it('still takes a profitable merger that funds its own next investments', () => {
    const state = mergerFixture();
    hold(state, 'budgeton', [0, 8, 0]); hold(state, 'festival', [0, 2, 0]);
    state.players[1].cash = 200;
    expect(chooseBotAction(state)).toEqual({ type: 'place', tile: '3A' });
  });
  it('uses the payout comparison when choosing a tied survivor, not just current ownership', () => {
    const state = mergerFixture(true);
    hold(state, 'budgeton', [8, 0, 0]); hold(state, 'festival', [0, 6, 1]);
    state.players[1].cash = 0;
    const choosing = applyAction(state, { type: 'place', tile: '3A' });
    expect(chooseBotAction(choosing)).toEqual({ type: 'choose-survivor', chain: 'budgeton' });
    const hidden = structuredClone(state);
    hidden.bag.reverse(); hidden.players[0].hand = ['?']; hidden.players[2].hand = ['?'];
    expect(chooseBotAction(hidden)).toEqual(chooseBotAction(state));
  });
});

it('all active chains safe allows ending, while absent chains and independent tiles do not block it', () => {
  const state = mergerFixture();
  state.board = Object.fromEntries(ALL_TILES.slice(0, 11).map((tile) => [tile, 'festival']));
  state.board['12I'] = 'independent';
  expect(endConditionMet(state)).toBe(true);
  expect(canEndGame(state)).toBe(false); // 2008 requires playing a tile this turn.
  state.phase = 'buy'; state.tilePlacedThisTurn = true;
  expect(canEndGame(state)).toBe(true);
  state.board['1H'] = 'budgeton'; state.board['2H'] = 'budgeton';
  expect(canEndGame(state)).toBe(false);
  state.board = {};
  expect(endConditionMet(state)).toBe(false);
});
