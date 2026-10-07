import { test, expect, type Page } from '@playwright/test';
import { createGame, getCurrentActor, getLegalTiles } from '../src/game/engine';

const game = createGame({ id: 'city-renderer-regression', seed: 52,
  players: ['Alex', 'Morgan', 'Riley'].map((name, i) => ({ id: `p${i}`, name })) });

async function openTable(page: Page) {
  await page.addInitScript(saved => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game: saved, kind: 'local', updatedAt: '2026-10-07T12:00:00Z' }]));
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false, hints: true }));
  }, game);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').click();
  await page.locator('.privacy-panel').getByRole('button').click();
}

async function placeFromBoard(page: Page) {
  const tile = getLegalTiles(game, getCurrentActor(game).id)[0];
  await page.locator(`.game-board [data-tile="${tile}"]`).click();
  await expect(page.getByRole('button', { name: `Place ${tile}`, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: `Place ${tile}`, exact: true }).click();
  await expect.poll(() => page.evaluate(tile => {
    const saved = JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0];
    return Boolean(saved.game.board[tile]);
  }, tile)).toBe(true);
}

test('3D city survives remounting and switches between renderers without changing the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await openTable(page);
  await expect(page.locator('.city-rendered canvas')).toBeVisible();
  const original = await page.evaluate(() => localStorage.getItem('aquire.games.v2'));
  await page.getByRole('button', { name: 'Switch to flat board' }).click();
  await expect(page.locator('.game-board canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch to 3D city' }).click();
  await expect(page.locator('.city-rendered canvas')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('aquire.games.v2'))).toBe(original);
  // Native board buttons are still the source of input, including keyboard play.
  const tile = getLegalTiles(game)[0];
  await page.locator(`.game-board [data-tile="${tile}"]`).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: `Place ${tile}`, exact: true })).toBeEnabled();
  await placeFromBoard(page);
  expect(errors).toEqual([]);
});

test('a device without WebGL keeps the illustrated lobby and fully playable flat board', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await openTable(page);
  await expect(page.locator('.game-board.city-rendered')).toHaveCount(0);
  await expect(page.locator('.game-board .board-tile')).toHaveCount(108);
  await placeFromBoard(page);
});

test('losing and restoring a graphics context preserves the board and selected tile', async ({ page }) => {
  await openTable(page);
  await expect(page.locator('.city-rendered canvas')).toBeVisible();
  const tile = getLegalTiles(game)[0];
  await page.locator(`.game-board [data-tile="${tile}"]`).click();
  await page.locator('.game-board canvas').evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext('webgl2')!;
    const extension = context.getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    (window as unknown as { restoreCity: () => void }).restoreCity = () => extension.restoreContext();
  });
  await expect(page.locator('.game-board.city-rendered')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Place ${tile}`, exact: true })).toBeEnabled();
  await page.evaluate(() => (window as unknown as { restoreCity: () => void }).restoreCity());
  await expect(page.locator('.city-rendered canvas')).toBeVisible();
  await placeFromBoard(page);
});

test('desktop zoom, drag, rotation and fit preserve tile targets', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTable(page);
  await page.getByRole('button', { name: 'Enlarge board tiles' }).click();
  const stage = page.locator('.board-stage');
  const metrics = await stage.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  expect(metrics.scroll).toBeGreaterThan(metrics.width);
  const bounds = (await stage.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .5, { steps: 8 });
  await page.mouse.up();
  expect(await stage.evaluate(element => element.scrollLeft)).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Fit entire board' }).click();
  await page.getByRole('button', { name: 'Rotate board' }).click();
  await expect(page.locator('.board-card')).toHaveAttribute('data-board-rotated', 'true');
  await expect(page.locator('.board-tile')).toHaveCount(108);
  await placeFromBoard(page);
});

test('setup exposes optional rules on demand and keeps its start button reachable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Let’s play/ }).click();
  const setup = page.getByRole('dialog', { name: 'A new opportunity' });
  await expect(setup.getByLabel('Starting cash')).toBeHidden();
  await setup.locator('summary').filter({ hasText: 'Customize house rules' }).click();
  await setup.getByLabel('Starting cash').fill('8000');
  await setup.getByRole('button', { name: /Let’s build something/ }).click();
  await expect(page.locator('.game-view')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game.houseRules.startingCash)).toBe(8000);
});
