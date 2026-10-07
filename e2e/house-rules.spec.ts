import { test, expect } from '@playwright/test';
import { analyzeTile, createGame, getLegalTiles } from '../src/game/engine';

test('hotel roster and per-chain share supplies persist into a playable game', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Table preferences' }).first().click();
  const preferences = page.getByRole('dialog', { name: 'Make yourself at home' });
  await preferences.locator('.hotel-choice').filter({ hasText: 'Goldspire' }).locator('input[type="checkbox"]').check();
  await preferences.locator('.hotel-choice').filter({ hasText: 'Sackson' }).locator('input[type="checkbox"]').uncheck();
  await preferences.getByRole('spinbutton', { name: 'Goldspire shares available' }).fill('40');
  await preferences.getByRole('spinbutton', { name: 'Worldwide shares available' }).fill('8');
  await preferences.getByRole('button', { name: /Just right/ }).click();
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const setup = page.getByRole('dialog', { name: 'A new opportunity' });
  await setup.locator('summary').filter({ hasText: 'Customize house rules' }).click();
  await setup.getByLabel('Your name', { exact: true }).fill('Avery');
  await expect(setup.locator('.hotel-choice').filter({ hasText: 'Goldspire' }).locator('input[type="checkbox"]')).toBeChecked();
  await expect(setup.locator('.hotel-choice').filter({ hasText: 'Sackson' }).locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(setup.getByRole('spinbutton', { name: 'Goldspire shares available' })).toHaveValue('40');
  await setup.getByRole('button', { name: /Let’s build something/ }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
  expect(state.houseRules.hotelChains).toContain('goldspire');
  expect(state.houseRules.hotelChains).not.toContain('sackson');
  expect(state.bank.goldspire).toBe(40);
  expect(state.bank.worldwide).toBe(8);
  const stocksView = page.getByRole('button', { name: 'Stocks', exact: true });
  if (await stocksView.isVisible()) await stocksView.click();
  await page.getByRole('button', { name: 'Market' }).click();
  await expect(page.locator('.stock-row')).toHaveCount(7);
  await expect(page.locator('.stock-list')).toContainText('Goldspire');
  await expect(page.locator('.stock-list')).not.toContainText('Sackson');
  await expect(page.locator('.market-heading')).toContainText('Custom share supplies');
  await page.getByRole('button', { name: 'House rules' }).click();
  await expect(page.locator('.house-rules-summary')).toContainText('Goldspire · 40 shares');
});

test('all twelve hotels remain reachable in a compact desktop market', async ({ page }) => {
  await page.setViewportSize({ width: 1060, height: 650 });
  await page.goto('/');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const setup = page.getByRole('dialog', { name: 'A new opportunity' });
  await setup.locator('summary').filter({ hasText: 'Customize house rules' }).click();
  await setup.getByLabel('Your name', { exact: true }).fill('Avery');
  for (const name of ['Budgeton', 'Heritage', 'Riviera', 'Monarch', 'Goldspire'])
    await setup.locator('.hotel-choice').filter({ hasText: name }).locator('input[type="checkbox"]').check();
  await setup.getByRole('button', { name: /Let’s build something/ }).click();
  await page.getByRole('button', { name: 'Market' }).click();
  await expect(page.locator('.stock-row')).toHaveCount(12);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
  const last = page.locator('.stock-row').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport({ ratio: 0.99 });
  await expect(last).toContainText('Goldspire');
});

test('house-rule defaults live in preferences and can be changed for a new table', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Table preferences' }).first().click();
  const preferences = page.getByRole('dialog', { name: 'Make yourself at home' });
  await expect(preferences.getByText('HOUSE RULES')).toBeVisible();
  await preferences.getByLabel('Starting cash').fill('9000');
  await preferences.getByLabel('Tiles to place per turn').fill('3');
  await preferences.getByLabel('Tiles to remove per turn').fill('2');
  await preferences.getByLabel('Shares to buy per turn').fill('5');
  await preferences.getByLabel('Market fluctuation').selectOption('crazy');
  await preferences.getByLabel('Market roll frequency').selectOption('three-rounds');
  await preferences.getByLabel('Anonymous buying, bank counts, and cash').check();
  await preferences.getByRole('button', { name: /Just right/ }).click();
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const setup = page.getByRole('dialog', { name: 'A new opportunity' });
  await setup.locator('summary').filter({ hasText: 'Customize house rules' }).click();
  await expect(setup.getByLabel('Starting cash')).toHaveValue('9000');
  await expect(setup.getByLabel('Tiles to place per turn')).toHaveValue('3');
  await expect(setup.getByLabel('Tiles to remove per turn')).toHaveValue('2');
  await expect(setup.getByLabel('Market roll frequency')).toHaveValue('three-rounds');
  await setup.getByLabel('Market roll frequency').selectOption('two-rounds');
  await setup.getByLabel('Starting tiles per player').fill('4');
  await setup.getByRole('button', { name: /Let’s build something/ }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
  expect(Object.keys(state.board)).toHaveLength(12);
  expect(state.players.every((player: { cash: number }) => player.cash === 9000)).toBe(true);
  expect(state.houseRules).toMatchObject({ startingTilesPerPlayer: 4, placementsPerTurn: 3, removalsPerTurn: 2, buyLimit: 5, anonymousBuying: true, marketMode: 'crazy', marketFrequency: 'two-rounds' });
  const stocksView = page.getByRole('button', { name: 'Stocks', exact: true });
  if (await stocksView.isVisible()) await stocksView.click();
  await page.getByRole('button', { name: 'House rules' }).click();
  await expect(page.locator('.house-rules-summary')).toContainText('9,000');
  await expect(page.locator('.house-rules-summary')).toContainText('Crazy fluctuation');
});

test('a player removes an allowed tile, places more than once, and can finish placing early', async ({ page }) => {
  const players = [
    { id: 'human', name: 'You' },
    { id: 'bot-1', name: 'Ellis', isBot: true },
    { id: 'bot-2', name: 'Morgan', isBot: true },
  ];
  let state = createGame({ players, seed: 431, houseRules: { placementsPerTurn: 3, removalsPerTurn: 2 } });
  state.currentPlayer = 0;
  const independent = getLegalTiles(state).find((tile) => analyzeTile(state, tile).kind === 'independent');
  expect(independent).toBeDefined();
  const opening = state.players[0].initialTile;
  await page.addInitScript((game) => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: 'solo', updatedAt: new Date().toISOString() }]));
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ speed: 1400, hints: false }));
  }, state);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').first().click();
  await page.getByRole('button', { name: /Remove a tile · 2 left/ }).click();
  await page.locator(`.board-tile[aria-label^="${opening},"]`).click();
  await page.getByRole('button', { name: `Remove ${opening}` }).click();
  await expect(page.locator(`.board-tile[aria-label^="${opening}"]`)).not.toHaveClass(/occupied/);
  await page.locator('.tile-rack button').filter({ hasText: independent! }).click();
  await page.getByRole('button', { name: `Place ${independent}` }).click();
  await expect(page.locator('.game-view')).toHaveAttribute('data-phase', 'place');
  await expect(page.locator('.action-card')).toContainText('Placed 1 of up to 3');
  await page.getByRole('button', { name: 'Finish placing and invest now' }).click();
  await expect(page.locator('.game-view')).toHaveAttribute('data-phase', 'buy');
  await page.getByRole('button', { name: 'Skip buying' }).click();
  const next = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
  expect(next.board[opening]).toBeUndefined();
  expect(next.board[independent!]).toBe('independent');
  expect(next.players[0].hand).toHaveLength(6);
});

test('an expired local turn advances automatically and logs the timeout', async ({ page }) => {
  const players = [
    { id: 'human', name: 'You' },
    { id: 'bot-1', name: 'Ellis', isBot: true },
    { id: 'bot-2', name: 'Morgan', isBot: true },
  ];
  const state = createGame({ players, seed: 827, houseRules: { turnTimerSeconds: 5 } });
  state.currentPlayer = 0;
  state.turnDeadlineAt = Date.now() - 1000;
  await page.addInitScript((game) => localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: 'solo', updatedAt: new Date().toISOString() }])), state);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').first().click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0]?.game?.turn)).toBeGreaterThan(1);
  const next = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
  expect(next.logs.some((log: { type: string }) => log.type === 'timeout')).toBe(true);
});

test('anonymous trading hides rivals and buys extra shares after selling worthless stock', async ({ page }) => {
  const players = [
    { id: 'human', name: 'You' },
    { id: 'bot-1', name: 'Ellis', isBot: true },
    { id: 'bot-2', name: 'Morgan', isBot: true },
  ];
  const state = createGame({ players, seed: 9211, houseRules: { trading: true, buyLimit: 1, anonymousBuying: true, hiddenMoney: true } });
  state.currentPlayer = 0;
  state.phase = 'buy';
  state.board = { '1A': 'worldwide', '2A': 'worldwide' };
  state.players[0].stocks.sackson = 3;
  state.bank.sackson = 22;
  state.players[1].stocks.worldwide = 5;
  state.bank.worldwide = 20;
  state.logs.push({ id: 100, type: 'buy', turn: 1, playerId: 'bot-1', message: 'Ellis buys 5 Worldwide for $1,000.' });
  state.logSequence = 100;
  await page.addInitScript((game) => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: 'solo', updatedAt: new Date().toISOString() }]));
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ speed: 1400, hints: false }));
  }, state);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').first().click();
  await expect(page.locator('.market-heading')).toContainText('Availability only');
  await expect(page.locator('.players-bar')).toContainText('Private cash');
  await page.getByRole('button', { name: 'Investors' }).click();
  await expect(page.locator('.investor-list')).toContainText('Private');
  await page.getByRole('button', { name: 'Activity' }).click();
  await expect(page.locator('.activity-list')).not.toContainText('Ellis buys 5');
  await page.getByRole('button', { name: 'Market' }).click();
  const sell = page.getByRole('button', { name: 'Sell more Sackson shares' });
  await sell.click(); await sell.click(); await sell.click();
  const buy = page.getByRole('button', { name: 'Buy Worldwide share' });
  await buy.click(); await buy.click(); await buy.click(); await buy.click();
  await expect(buy).toBeDisabled();
  await page.getByRole('button', { name: 'Confirm market order' }).click();
  const next = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
  expect(next.players[0].stocks.sackson).toBe(0);
  expect(next.players[0].stocks.worldwide).toBe(4);
  expect(next.bank.sackson).toBe(25);
  expect(next.bank.worldwide).toBe(16);
});
