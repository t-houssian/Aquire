import { expect, test, type Page } from '@playwright/test';
import { ALL_TILES, CHAIN_IDS, applyAction, createGame, getLegalTiles, type GameState } from '../src/game/engine';

const players = ['Alex', 'Morgan', 'Riley'].map((name, i) => ({ id: `p${i}`, name }));
function fixture() {
  const game = createGame({ id: 'payout-review', seed: 45, players, houseRules: { hotelChains: [...CHAIN_IDS] } });
  game.currentPlayer = 1;
  game.board = { '1A': 'budgeton', '2A': 'budgeton', '4A': 'festival', '5A': 'festival', '4B': 'festival', '5B': 'festival' };
  game.players[0].stocks.budgeton = 6;
  game.players[1].stocks.festival = 4;
  game.bank.budgeton = 19; game.bank.festival = 21;
  const free = ALL_TILES.filter((tile) => !game.board[tile] && tile !== '3A');
  game.players[1].hand = ['3A', ...free.splice(0, 5)];
  game.players[0].hand = free.splice(0, 6); game.players[2].hand = free.splice(0, 6);
  game.bag = free;
  return game;
}
async function openTable(page: Page, game: GameState) {
  await page.addInitScript((game) => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: 'local', updatedAt: new Date().toISOString() }]));
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false, speed: 1400, hints: true }));
  }, game);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  const archived = page.locator('.match-history-card');
  if (game.phase === 'ended') await archived.click();
  else {
    await page.locator('.saved-game-main').first().click();
    await page.locator('.privacy-panel').getByRole('button').click();
  }
}

for (const phase of ['buy', 'merger-shares'] as const) {
  test(phase + ' highlights legal rack options without placing or selecting a second tile', async ({ page }, info) => {
    let game = fixture();
    game = phase === 'buy' ? { ...game, phase: 'buy' }
      : applyAction(game, { type: 'place', tile: '3A' });
    const viewerId = phase === 'buy' ? 'p1' : 'p0';
    const legal = getLegalTiles(game, viewerId);
    expect(legal.length).toBeGreaterThan(0);
    await openTable(page, game);
    for (const [width, height] of [[393, 700], [844, 390], [320, 568], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      const boardButton = page.getByRole('button', { name: 'Board', exact: true });
      if (await boardButton.isVisible()) await boardButton.click();
      const previews = page.locator('.game-board .rack-preview');
      await expect(previews).toHaveCount(legal.length);
      expect(await previews.evaluateAll(cells => cells.map(cell => cell.getAttribute('data-tile')).sort())).toEqual([...legal].sort());
      for (const cell of await previews.all()) await expect(cell).toBeDisabled();
      await expect(page.locator('.board-legend')).toContainText('preview only');
      const before = await page.evaluate(() => localStorage.getItem('aquire.games.v2'));
      await previews.first().evaluate((button: HTMLButtonElement) => button.click());
      expect(await page.evaluate(() => localStorage.getItem('aquire.games.v2'))).toBe(before);
      await expect(page.locator('.game-board .tile-selected')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Place / })).toHaveCount(0);
      const colors = await previews.first().evaluate(button => {
        const unbuilt = button.closest('.game-board')!.querySelector('.board-tile:not(.playable):not(.occupied):not(.map-void)')!;
        return [getComputedStyle(button).backgroundColor, getComputedStyle(unbuilt).backgroundColor];
      });
      expect(colors[0]).not.toBe(colors[1]);
      if (phase === 'merger-shares') {
        const order = page.locator('.merger-decision-order');
        await order.locator('summary').click();
        await expect(order.getByRole('list', { name: 'Merger shareholder decision order' })).toContainText('Alex · Deciding now');
        await order.locator('summary').click();
      }
      const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
      expect(geometry.width).toBeLessThanOrEqual(width + 1);
      expect(geometry.height).toBeLessThanOrEqual(height + 1);
      if (width === 393) await page.screenshot({ path: 'artifacts/rack-preview/' + phase + '-' + info.project.name + '.png' });
    }
  });
}

test('landscape cash stays visible without taking space from the board', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openTable(page, fixture());
  const balances = page.getByRole('group', { name: 'Investor cash' });
  for (const [width, height] of [[844, 390], [667, 375]]) {
    await page.setViewportSize({ width, height });
    await expect(balances).toContainText('Alex$6,000Morgan$6,000Riley$6,000');
    for (const chip of await balances.locator(':scope > span').all()) await expect(chip).toBeInViewport({ ratio: 1 });
    const layout = await page.evaluate(() => {
      const cash = document.querySelector('.landscape-balances')!.getBoundingClientRect();
      const nav = document.querySelector('.game-navigation')!.getBoundingClientRect();
      const tools = document.querySelector('.game-toplinks')!.getBoundingClientRect();
      return { left: cash.left, navRight: nav.right, right: cash.right, toolsLeft: tools.left, height: document.documentElement.scrollHeight, boardTop: document.querySelector('.board-card')!.getBoundingClientRect().top };
    });
    expect(layout.left).toBeGreaterThanOrEqual(layout.navRight);
    expect(layout.right).toBeLessThanOrEqual(layout.toolsLeft);
    expect(layout.boardTop).toBeLessThan(80);
    expect(layout.height).toBeLessThanOrEqual(height + 1);
  }
});

test('landscape cash respects hidden-money tables', async ({ page }) => {
  const game = fixture(); game.houseRules!.hiddenMoney = true;
  game.players[0].cash = 4100; game.players[2].cash = 2700;
  await page.setViewportSize({ width: 844, height: 390 });
  await openTable(page, game);
  const balances = page.getByRole('group', { name: 'Investor cash' });
  await expect(balances).toContainText('AlexPrivateMorgan$6,000RileyPrivate');
});

test('buy and sell controls align inside their own rows across phone orientations', async ({ page }, testInfo) => {
  const game = fixture(); game.phase = 'buy'; game.houseRules!.trading = true;
  game.players[1].stocks.budgeton = 2; game.bank.budgeton -= 2;
  await openTable(page, game);
  for (const [width, height] of [[844, 390], [667, 375], [393, 700], [320, 568], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('button', { name: 'Buy Festival share' })).toBeVisible();
    await expect(page.getByLabel('Your tile rack while buying')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.buy-rack > div > span')).toHaveText(game.players[1].hand);
    const geometry = await page.locator('.stock-row').evaluateAll((rows) => rows.map((row) => {
      const box = row.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, controls: [...row.querySelectorAll('button')].map((button) => {
        const control = button.getBoundingClientRect();
        return { inside: control.top >= box.top && control.bottom <= box.bottom + 1 && control.right <= box.right + 1, left: control.left };
      }) };
    }));
    for (let i = 0; i < geometry.length; i++) {
      expect(geometry[i].controls.every((control) => control.inside), `${width} row ${i} controls contained`).toBe(true);
      if (i > 0) expect(geometry[i].top).toBeGreaterThanOrEqual(geometry[i - 1].bottom - 1);
    }
    const scrolling = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    expect(scrolling.width).toBeLessThanOrEqual(width + 1);
    expect(scrolling.height).toBeLessThanOrEqual(height + 1);
    if (width === 844) await page.screenshot({ path: `artifacts/game-review/trading-${testInfo.project.name}.png` });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: 'Sell more Festival shares' }).click();
  await page.getByRole('button', { name: 'Buy Budgeton share' }).click();
  await expect(page.locator('.order-summary')).toContainText('1 buying · 1 selling');
});

test('a merger shows every bonus before any shareholder must sell or trade', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 750 });
  await openTable(page, fixture());
  await page.locator('.tile-rack .rack-tile').filter({ hasText: /^3A/ }).click();
  await page.getByRole('button', { name: 'Place 3A' }).click();
  const reveal = page.getByTestId('merger-reveal');
  await expect(page.getByRole('dialog', { name: 'Budgeton joins Festival' })).toBeVisible();
  await expect(reveal).toContainText('Sole holder · both bonuses');
  await expect(reveal.locator('.merger-payout-row').nth(1)).toContainText('Alex');
  await expect(reveal.locator('.merger-payout-row').nth(1)).toContainText('$1,500');
  await expect(reveal.locator('.merger-payout-row').nth(2)).toContainText('$0');
  await expect(page.locator('.modal-backdrop')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: `artifacts/game-review/merger-${testInfo.project.name}.png` });
  await reveal.getByRole('button', { name: 'Continue' }).click();
  const privacy = page.locator('.privacy-panel').getByRole('button');
  if (await privacy.isVisible()) await privacy.click();
  await expect(page.getByRole('button', { name: 'Confirm choices' })).toBeVisible();
  await page.getByRole('button', { name: 'View bonuses' }).click();
  await expect(reveal).toContainText('$1,500');
});

test('final market rolls reveal one chain at a time and replay the saved result', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 750 });
  const game = fixture(); game.houseRules!.marketMode = 'crazy'; game.phase = 'buy'; game.endDeclared = true;
  const ended = applyAction(game, { type: 'buy', stocks: {} });
  await openTable(page, ended);
  for (const settlement of ended.finalSettlements!) {
    await expect(page.locator('.settlement-table')).toHaveCount(0);
    await page.getByRole('button', { name: /^Roll for/ }).click();
    const fast = page.getByRole('button', { name: 'Show result', exact: true });
    if (await fast.isVisible()) await fast.click();
    await expect(page.locator('.final-market-result .dice-face')).toHaveText(String(settlement.marketDie));
    await expect(page.locator('.settlement-table')).toBeVisible();
    if (settlement === ended.finalSettlements![0]) await page.screenshot({ path: `artifacts/game-review/final-roll-${testInfo.project.name}.png` });
    await page.getByRole('button', { name: /Next hotel chain|Reveal final scores/ }).click();
  }
  await page.getByRole('button', { name: 'Replay the sell-offs' }).click();
  await page.getByRole('button', { name: /^Roll for/ }).click();
  const fast = page.getByRole('button', { name: 'Show result', exact: true });
  if (await fast.isVisible()) await fast.click();
  await expect(page.locator('.final-market-result .dice-face')).toHaveText(String(ended.finalSettlements![0].marketDie));
});

test('a multi-chain merger queues a separate bonus display for each acquired hotel', async ({ page }) => {
  const game = fixture();
  game.board = { '1A': 'budgeton', '2A': 'budgeton', '4A': 'festival', '5A': 'festival', '6A': 'festival', '3B': 'worldwide', '4B': 'worldwide' };
  game.players.forEach((player) => { player.stocks.budgeton = 0; player.stocks.festival = 0; });
  await openTable(page, game);
  await page.locator('.tile-rack .rack-tile').filter({ hasText: /^3A/ }).click();
  await page.getByRole('button', { name: 'Place 3A' }).click();
  await page.locator('.chain-choices button').filter({ hasText: 'Budgeton' }).click();
  await expect(page.getByRole('dialog', { name: 'Budgeton joins Festival' })).toBeVisible();
  await page.getByRole('button', { name: 'Next update' }).click();
  await expect(page.getByRole('dialog', { name: 'Worldwide joins Festival' })).toBeVisible();
  await expect(page.getByTestId('merger-reveal').locator('.merger-payout-row .paid')).toHaveCount(0);
  await page.getByTestId('merger-reveal').getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Invest in the market' })).toBeVisible();
});

test('all-safe end guidance leads from tile placement to a reachable declaration', async ({ page }) => {
  const game = fixture();
  game.board = Object.fromEntries(ALL_TILES.slice(0, 11).map((tile) => [tile, 'festival']));
  game.players[1].hand = ['12A'];
  await page.setViewportSize({ width: 393, height: 750 });
  await openTable(page, game);
  await expect(page.locator('.end-ready-note')).toContainText('Play a tile');
  await page.locator('.tile-rack .rack-tile').filter({ hasText: /^12A/ }).click();
  await page.getByRole('button', { name: 'Place 12A' }).click();
  const declare = page.getByRole('button', { name: 'Declare the final turn' });
  await declare.click();
  await expect(page.locator('.action-card')).toContainText('Final turn declared');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2')!)[0].game);
  expect(stored.endDeclared).toBe(true);
});


test('each merger choice is announced before the following shareholder chooses', async ({ page }, info) => {
  const game = fixture();
  game.players[1].stocks.budgeton = 8; game.players[0].stocks.budgeton = 4; game.players[2].stocks.budgeton = 2; game.bank.budgeton = 11;
  await page.setViewportSize({ width: 844, height: 390 });
  await openTable(page, game);
  await page.locator('.tile-rack .rack-tile').filter({ hasText: /^3A/ }).click();
  await page.getByRole('button', { name: 'Place 3A' }).click();
  await page.getByTestId('merger-reveal').getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Sell more shares' }).click();
  await page.getByRole('button', { name: 'Trade more shares' }).click();
  await page.getByRole('button', { name: 'Confirm choices' }).click();
  const reveal = page.getByTestId('share-decision-reveal');
  await expect(reveal).toContainText('Majority');
  await expect(reveal.locator('.share-decision-options article').nth(0)).toContainText('1');
  await expect(reveal.locator('.share-decision-options article').nth(1)).toContainText('2');
  await expect(reveal.locator('.share-decision-options article').nth(2)).toContainText('5');
  await expect(page.locator('.game-screen')).toHaveAttribute('inert', '');
  for (const [width, height] of [[844, 390], [393, 700], [320, 568]]) {
    await page.setViewportSize({ width, height });
    const continueButton = reveal.getByRole('button', { name: 'Continue', exact: true });
    await continueButton.scrollIntoViewIfNeeded(); await expect(continueButton).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.getByRole('dialog').screenshot({ path: `artifacts/story/merger-decision-${info.project.name}.png` });
  await reveal.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.privacy-panel').getByRole('button').click();
  await expect(page.locator('.merger-decisions')).toContainText('Morgan sold 1 Budgeton, traded 2 for 1 Festival, and kept 5 Budgeton.');
  // The official clockwise order is Morgan, Riley, Alex: do not silently sort by holdings.
  await expect(page.locator('.player-chip.current')).toContainText('Riley');
});
