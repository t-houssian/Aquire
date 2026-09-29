import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, CHAINS, createGame, type GameState } from '../game/engine';
import GameView, { ActivityPanel, InvestorPanel } from './GameView';

function table(): GameState {
  return createGame({
    seed: 73,
    players: [
      { id: 'human', name: 'Alex' },
      { id: 'bot', name: 'Ellis', isBot: true },
      { id: 'other', name: 'Morgan' },
    ],
  });
}
function render(
  game: GameState,
  viewerId = 'human',
  privateGate = false,
  preferences: { hideOpponentHoldings?: boolean; hideStockAvailability?: boolean } = {},
) {
  return renderToStaticMarkup(
    createElement(GameView, {
      game,
      viewerId,
      privateGate,
      ...preferences,
      onAction: () => {},
      onHome: () => {},
      onRules: () => {},
    }),
  );
}

describe('boardroom privacy and settlement presentation', () => {
  it('shows only the viewer’s rack while a computer opponent is deciding', () => {
    const game = table();
    game.currentPlayer = 1;
    const html = render(game);
    const rack = html.match(/<div class="tile-rack"[^>]*>(.*?)<\/div>/s)?.[1] ?? '';
    expect(html).toContain('Ellis is finding their next opportunity.');
    for (const tile of game.players[0].hand) expect(rack).toContain(`<span>${tile}</span>`);
    for (const tile of game.players[1].hand) expect(rack).not.toContain(`<span>${tile}</span>`);
    expect(html).not.toContain('Exchange entire rack');
  });

  it('offers a full-rack exchange and individual dead-tile retirement only to the blocked rack’s owner', () => {
    const game = table();
    game.currentPlayer = 0;
    game.board = {};
    for (let i = 1; i <= 11; i++) {
      game.board[`${i}A`] = 'tower';
      game.board[`${i}C`] = 'continental';
    }
    game.players[0].hand = ['1B', '2B', '3B', '4B', '5B', '6B'];
    expect(render(game)).toContain('Exchange entire rack');
    expect(render(game)).toContain('Retire only 6 permanently blocked tiles');
    expect(render(game, 'human', true)).not.toContain('class="rack-tile');
    expect(render(game, 'human', true)).not.toContain('Exchange entire rack');
    expect(render(game, 'other')).not.toContain('Exchange entire rack');
  });

  it('hides all hand markings and rack contents during a device handoff', () => {
    const game = table();
    game.currentPlayer = 0;
    const html = render(game, 'human', true);
    expect(html).toContain('Pass the device to');
    expect(html).not.toContain('class="rack-tile');
    expect(html).not.toContain(', in your hand');
  });

  it('values pending acquired shares at their sale price until the holder decides', () => {
    let game = table();
    game.currentPlayer = 0;
    game.board = { '1A': 'tower', '2A': 'tower', '4A': 'american', '5A': 'american' };
    game.players[0].hand = ['3A'];
    game.players.forEach((player, i) => {
      player.stocks.american = [2, 3, 1][i];
    });
    game.bank.american = 19;
    game = applyAction(game, { type: 'place', tile: '3A' });
    game = applyAction(game, { type: 'choose-survivor', chain: 'tower' });
    expect(render(game)).toContain('Your tile rack');
    expect(render(game)).toContain('No tiles left in your rack');
    expect(render(game)).toContain('STOCK VALUE</span><strong>$600</strong>');
    expect(render(game)).toContain('Acquired · $300 settlement');
    game = applyAction(game, { type: 'resolve-shares', sell: 0, trade: 0 });
    expect(render(game)).toContain('STOCK VALUE</span><strong>$0</strong>');
    expect(render(game, 'bot')).toContain('STOCK VALUE</span><strong>$900</strong>');
  });
});

describe('board chain identification and stock visibility', () => {
  it('labels every colored chain tile with its first letter while keeping its coordinate', () => {
    const game = table();
    game.houseRules!.hotelChains = CHAINS.map((chain) => chain.id);
    game.board = {};
    CHAINS.forEach((chain, i) => {
      game.board[`${i + 1}A`] = chain.id;
      game.board[`${i + 1}B`] = chain.id;
    });
    const html = render(game);
    for (const [i, chain] of CHAINS.entries()) {
      for (const row of ['A', 'B']) {
        const tile = `${i + 1}${row}`;
        const cell = html.match(
          new RegExp(`<button[^>]*aria-label="${tile}, ${chain.name}[^>]*>(.*?)</button>`, 's'),
        )?.[1];
        expect(cell).toContain(
          `<strong class="tile-initial" aria-hidden="true">${chain.name[0]}</strong>`,
        );
        expect(cell).toContain(`<span class="tile-coordinate">${tile}</span>`);
      }
      expect(html).toContain(`--chain:${chain.color}`);
    }
    expect(html.match(/chain-headquarters/g)).toHaveLength(12);
    expect(html).not.toContain('tile-building');
  });

  it('keeps portfolios and remaining stock counts visible by default', () => {
    const game = table();
    game.board = { '1A': 'tower', '2A': 'tower' };
    game.players[0].stocks.tower = 7;
    game.players[1].stocks.tower = 12;
    game.bank.tower = 6;
    expect(render(game)).toContain('2 hotels · 6 available');
    expect(render(game)).toContain('7 owned');
    const investors = renderToStaticMarkup(
      createElement(InvestorPanel, { game, viewerId: 'human' }),
    );
    expect(investors).toContain('<strong>7</strong>');
    expect(investors).toContain('<strong>12</strong>');
  });

  it('hides only opponents’ portfolios in memory mode, independently of bank availability', () => {
    const game = table();
    game.board = { '1A': 'tower', '2A': 'tower' };
    game.players[0].stocks.tower = 7;
    game.players[1].stocks.tower = 12;
    game.bank.tower = 6;
    const investors = renderToStaticMarkup(
      createElement(InvestorPanel, {
        game,
        viewerId: 'human',
        hideOpponentHoldings: true,
      }),
    );
    expect(investors).toContain('<strong>7</strong>');
    expect(investors).not.toContain('<strong>12</strong>');
    expect(investors.match(/class="hidden-holdings"/g)).toHaveLength(2);
    expect(render(game, 'human', false, { hideOpponentHoldings: true })).toContain(
      '2 hotels · 6 available',
    );
    const bankHidden = render(game, 'human', false, { hideStockAvailability: true });
    expect(bankHidden).toContain('2 hotels · Available');
    expect(bankHidden).not.toContain('6 available');
    expect(bankHidden).toContain('7 owned');
    game.bank.tower = 0;
    expect(render(game, 'human', false, { hideStockAvailability: true })).toContain(
      '2 hotels · Sold out',
    );
  });

  it('hides the incoming portfolio, its value, and inactive retained holdings before handoff', () => {
    const game = table();
    game.board = { '1A': 'tower', '2A': 'tower' };
    game.players[0].stocks.tower = 7;
    game.players[0].stocks.festival = 5;
    const html = render(game, 'human', true);
    expect(html).toContain('STOCK VALUE</span><strong>—</strong>');
    expect(html).not.toContain('7 owned');
    expect(html).not.toContain('5 owned');
    expect(html).not.toContain('shares retained');
    const investors = renderToStaticMarkup(
      createElement(InvestorPanel, {
        game,
        viewerId: 'human',
        privateGate: true,
      }),
    );
    expect(investors).not.toContain('class="holdings"');
    expect(investors.match(/class="hidden-holdings"/g)).toHaveLength(3);
  });

  it('redacts opponents’ stock details from persistent history while retaining public moves and your decisions', () => {
    const game = table();
    game.logs = [
      { id: 1, turn: 2, type: 'tile', playerId: 'bot', tile: '3A', message: 'Ellis places 3A.' },
      {
        id: 2,
        turn: 2,
        type: 'found',
        playerId: 'bot',
        chain: 'tower',
        message: 'Ellis founds Tower and receives one free founder share.',
      },
      { id: 3, turn: 2, type: 'buy', playerId: 'bot', message: 'Ellis buys 3 Tower for $1,200.' },
      {
        id: 4,
        turn: 3,
        type: 'shares',
        playerId: 'bot',
        message: 'Ellis: sells 2, trades 4 for 2 Tower, and keeps 6 American shares.',
      },
      {
        id: 5,
        turn: 3,
        type: 'bonus',
        playerId: 'bot',
        chain: 'american',
        message: 'Ellis receives $3,000 in American shareholder bonuses.',
      },
      { id: 6, turn: 4, type: 'buy', playerId: 'human', message: 'Alex buys 2 Festival for $600.' },
    ];
    const activity = (hideOpponentHoldings = false, privateGate = false) =>
      renderToStaticMarkup(
        createElement(ActivityPanel, {
          game,
          viewerId: 'human',
          hideOpponentHoldings,
          privateGate,
        }),
      );
    const hidden = activity(true);
    for (const log of game.logs.slice(1, 5)) expect(hidden).not.toContain(log.message);
    expect(hidden).toContain('Ellis places 3A.');
    expect(hidden).toContain('Ellis founded Tower.');
    expect(hidden).toContain('Ellis completed their investment decision.');
    expect(hidden).toContain('Ellis resolved their merger shares.');
    expect(hidden).toContain('Ellis received a shareholder bonus.');
    expect(hidden).toContain('Alex buys 2 Festival for $600.');
    expect(activity(false, true)).not.toContain('Alex buys 2 Festival for $600.');
    for (const log of game.logs) expect(activity()).toContain(log.message);
    game.phase = 'ended';
    for (const log of game.logs) expect(activity(true)).toContain(log.message);
  });

  it('hides opponent merger holdings and bank counts without changing trade limits', () => {
    let game = table();
    game.currentPlayer = 0;
    game.board = { '1A': 'tower', '2A': 'tower', '4A': 'american', '5A': 'american' };
    game.players[0].hand = ['3A'];
    game.players.forEach((player, i) => {
      player.stocks.american = [2, 3, 1][i];
    });
    game.bank.american = 19;
    game.bank.tower = 13;
    game = applyAction(game, { type: 'place', tile: '3A' });
    game = applyAction(game, { type: 'choose-survivor', chain: 'tower' });
    expect(render(game, 'other')).toContain('Alex owns 2 shares.');
    const hidden = render(game, 'other', false, { hideOpponentHoldings: true });
    expect(hidden).not.toContain('Alex owns 2 shares.');
    expect(hidden).toContain('Alex decides how to settle shares.');
    expect(render(game)).toContain('2 acquired → 1 survivor · 13 available');
    const own = render(game, 'human', false, {
      hideOpponentHoldings: true,
      hideStockAvailability: true,
    });
    expect(own).toContain('You own 2 shares.');
    expect(own).toContain('2 acquired → 1 survivor · Available');
    expect(own).not.toContain('13 available');
    game.bank.tower = 0;
    const soldOut = render(game, 'human', false, { hideStockAvailability: true });
    expect(soldOut).toContain('2 acquired → 1 survivor · Sold out');
    expect(soldOut).toContain('aria-label="Trade more shares" disabled=""');
  });

  it('preserves the complete final settlement with both visibility settings enabled', () => {
    const game = table();
    game.phase = 'ended';
    game.endReason = 'The end of the game was declared.';
    game.winnerIds = ['human'];
    game.results = [
      {
        playerId: 'human',
        name: 'Alex',
        cashBefore: 6000,
        bonuses: 3000,
        stocksValue: 1400,
        total: 10400,
        rank: 1,
      },
    ];
    const html = render(game, 'human', false, {
      hideOpponentHoldings: true,
      hideStockAvailability: true,
    });
    expect(html).toContain('takes the crown.');
    expect(html).toContain('$6,000 cash + $3,000 bonuses + $1,400 stock');
    expect(html).toContain('<b>$10,400</b>');
  });
});
