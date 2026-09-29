import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/game/engine';
import type { GameState } from '../src/game/types';

const players = ['Avery', 'Ellis', 'Margot'].map((name, index) => ({ id: `p${index}`, name }));

async function openSavedTable(page: Page, game: GameState, kind: 'local' | 'solo' = 'local') {
  await page.addInitScript(({ saved, savedKind }) => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game: saved, kind: savedKind, updatedAt: new Date().toISOString() }]));
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false, speed: 220, hints: true }));
  }, { saved: game, savedKind: kind });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').first().click();
  const privacy = page.locator('.privacy-panel').getByRole('button');
  if (await privacy.isVisible()) await privacy.click();
}

async function finishBuyAndSeeDice(page: Page) {
  await page.getByRole('button', { name: 'Skip buying' }).click();
  await page.getByTestId('turn-recap').getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByTestId('dice-reveal')).toBeVisible();
  const showResults = page.getByRole('button', { name: 'Show results' });
  if (await showResults.isVisible()) await showResults.click();
  await expect(page.getByTestId('dice-reveal')).toHaveAttribute('data-revealed', 'true');
}

test('a full round reveals dividend and market dice, then keeps the market visible', async ({ page }) => {
  const game = createGame({ id: 'dice-round', seed: 52, players, houseRules: { dividends: true, marketMode: 'market' } });
  game.turn = 3;
  game.currentPlayer = 2;
  game.phase = 'buy';
  await openSavedTable(page, game);
  await page.setViewportSize({ width: 844, height: 390 });
  await finishBuyAndSeeDice(page);
  const reveal = page.getByTestId('dice-reveal');
  await expect(page.getByRole('dialog', { name: 'Round 1 closes' })).toBeVisible();
  await expect(reveal).toContainText('No complete hotel cluster');
  await expect(reveal).toContainText('A new market is set');
  await expect(reveal.locator('.dice-roll')).toHaveCount(2);
  await reveal.getByRole('button', { name: 'Continue to the table' }).click();
  await expect(reveal).toHaveCount(0);
  await expect(page.locator('.compact-view-context .market-status-pill')).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
  expect(state.lastRoundRolls).toMatchObject({ atTurn: 3, kind: 'round', marketDie: expect.any(Number) });
  await page.setViewportSize({ width: 1060, height: 650 });
  await expect(page.locator('.game-title-row .market-status-pill')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(651);
});

test('before-each-turn market rolls appear between investors without replaying on resume', async ({ page }) => {
  const game = createGame({ id: 'dice-turn', seed: 18, players, houseRules: { marketMode: 'crazy', marketFrequency: 'turn' } });
  game.phase = 'buy';
  await openSavedTable(page, game);
  await expect(page.getByTestId('dice-reveal')).toHaveCount(0);
  await finishBuyAndSeeDice(page);
  const reveal = page.getByTestId('dice-reveal');
  await expect(page.getByRole('dialog', { name: 'The market moves' })).toBeVisible();
  await expect(reveal.locator('.dice-roll')).toHaveCount(1);
  await reveal.getByRole('button', { name: 'Continue to the table' }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
  expect(state.lastRoundRolls).toMatchObject({ atTurn: 1, kind: 'turn', marketDie: expect.any(Number) });
});

test('a new per-turn market game reveals its opening roll', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const setup = page.getByRole('dialog', { name: 'A new opportunity' });
  await setup.getByLabel('Your name', { exact: true }).fill('Avery');
  await setup.getByLabel('Market fluctuation').selectOption('market');
  await setup.getByLabel('Market roll frequency').selectOption('turn');
  await setup.getByRole('button', { name: /Let’s build something/ }).click();
  await expect(page.getByRole('dialog', { name: 'The opening market' })).toBeVisible();
  const reveal = page.getByTestId('dice-reveal');
  await expect(reveal.locator('.dice-roll')).toHaveCount(1);
  await reveal.getByRole('button', { name: 'Show results' }).click();
  await reveal.getByRole('button', { name: 'Continue to the table' }).click();
  await expect(page.locator('.market-status-pill:visible')).toBeVisible();
});

test('computer opponents wait while the round dice are on screen', async ({ page }) => {
  const soloPlayers = players.map((player, index) => ({ ...player, isBot: index > 0 }));
  const game = createGame({ id: 'dice-computers', seed: 27, players: soloPlayers, houseRules: { marketMode: 'market' } });
  game.turn = 3;
  game.currentPlayer = 0;
  game.phase = 'buy';
  await openSavedTable(page, game, 'solo');
  await page.getByRole('button', { name: 'Skip buying' }).click();
  await expect(page.getByTestId('dice-reveal')).toBeVisible();
  const pausedRevision = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game.revision);
  await page.waitForTimeout(550);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game.revision)).toBe(pausedRevision);
  const showResults = page.getByRole('button', { name: 'Show results' });
  if (await showResults.isVisible()) await showResults.click();
  await page.getByRole('button', { name: 'Continue to the table' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game.revision)).toBeGreaterThan(pausedRevision);
});
