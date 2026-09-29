import { test, expect, type Page } from '@playwright/test';
import { applyAction, CHAINS, chooseBotAction, createGame, getChainSize, getCurrentActor, getLegalTiles, getSharePrice } from '../src/game/engine';
import type { GameState } from '../src/game/types';

const players = ['Alex', 'Morgan', 'Riley'].map((name, index) => ({ id: `p${index}`, name }));

async function openSavedTable(page: Page, game: GameState) {
  await page.addInitScript((saved) => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game: saved, kind: 'local', updatedAt: '2026-09-29T12:00:00.000Z' }]));
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false, speed: 1400, hints: true }));
  }, game);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').first().click();
  await page.locator('.privacy-panel').getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'The boardroom.' })).toBeVisible();
}

async function assertScreenFit(page: Page, width: number, height: number) {
  const layout = await page.evaluate(() => {
    const action = document.querySelector('.action-card')!.getBoundingClientRect();
    const board = document.querySelector('.board-card')!.getBoundingClientRect();
    const market = document.querySelector('.market-panel')!.getBoundingClientRect();
    return {
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      actionBottom: action.bottom,
      panelWidth: Math.max(board.width, market.width),
    };
  });
  expect(layout.pageWidth, `${width}×${height} page width`).toBeLessThanOrEqual(width + 1);
  expect(layout.pageHeight, `${width}×${height} page height`).toBeLessThanOrEqual(height + 1);
  expect(layout.actionBottom, `${width}×${height} action visibility`).toBeLessThanOrEqual(height + 1);
  expect(layout.panelWidth).toBeGreaterThan(200);
}

test('the active board, rack and market fit phone, tablet and desktop viewports', async ({ page }) => {
  const game = createGame({ id: 'responsive-table', seed: 52, players });
  await openSavedTable(page, game);
  const sizes = [
    [320, 568], [375, 667], [390, 844], [430, 932],
    [667, 375], [844, 390], [932, 430],
    [768, 1024], [1024, 768], [1280, 800], [1600, 900],
  ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await assertScreenFit(page, width, height);
    if (width <= 1059) {
      const switcher = page.getByRole('group', { name: 'Game view' });
      await switcher.getByRole('button', { name: 'Stocks' }).click();
      await expect(page.locator('.market-panel .stock-list')).toBeVisible();
      await expect(page.getByRole('group', { name: 'Acquire game board' })).toBeHidden();
      await assertScreenFit(page, width, height);
      await switcher.getByRole('button', { name: 'Board' }).click();
      await expect(page.getByRole('group', { name: 'Acquire game board' })).toBeVisible();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('.sidebar.nav-open')).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation' }).click();
  const legal = getLegalTiles(game)[0];
  await page.locator('.tile-rack .rack-tile').filter({ hasText: new RegExp(`^${legal}`) }).click();
  await page.getByRole('button', { name: new RegExp(`^Place ${legal}`) }).click();
  await expect(page.locator('.game-view')).toHaveAttribute('data-phase', /found|buy|place|merger/);
});

test('stock purchase starts in the compact market with the action in reach', async ({ page }) => {
  let game: GameState | null = null;
  for (let seed = 1; seed < 20 && !game; seed++) {
    let candidate = createGame({ id: `responsive-buy-${seed}`, seed, players });
    for (let turn = 0; turn < 120 && candidate.phase !== 'ended'; turn++) {
      if (candidate.phase === 'buy' && CHAINS.some((chain) => getChainSize(candidate, chain.id) > 0 && candidate.bank[chain.id] > 0 && getSharePrice(candidate, chain.id) <= getCurrentActor(candidate).cash)) {
        game = candidate;
        break;
      }
      candidate = applyAction(candidate, chooseBotAction(candidate));
    }
  }
  if (!game) throw new Error('Could not find a seeded stock-purchase turn');
  await openSavedTable(page, game);
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('group', { name: 'Game view' }).getByRole('button', { name: 'Stocks' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Invest in the market' })).toBeVisible();
    await assertScreenFit(page, width, height);
  }
  const chain = CHAINS.find((hotel) => getChainSize(game, hotel.id) > 0 && game.bank[hotel.id] > 0 && getSharePrice(game, hotel.id) <= getCurrentActor(game).cash)!;
  await page.getByRole('button', { name: `Buy ${chain.name} share` }).click();
  await expect(page.locator('.order-summary')).toContainText('1 share');
  await page.getByRole('group', { name: 'Game view' }).getByRole('button', { name: 'Board' }).click();
  await expect(page.getByRole('group', { name: 'Acquire game board' })).toBeVisible();
  await expect(page.locator('.order-summary')).toContainText('1 share');
});

test('merger shares, tile rack and confirmation fit a landscape phone', async ({ page }) => {
  let game = createGame({ id: 'responsive-merger', seed: 1, players });
  for (let turn = 0; turn < 240 && game.phase !== 'merger-shares'; turn++) {
    game = applyAction(game, chooseBotAction(game));
  }
  expect(game.phase).toBe('merger-shares');
  await openSavedTable(page, game);
  for (const [width, height] of [[667, 375], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.merger-rack')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm choices' })).toBeInViewport();
    const action = await page.locator('.action-card').evaluate((element) => ({ scroll: element.scrollHeight, visible: element.clientHeight }));
    expect(action.scroll, `${width}×${height} merger controls`).toBeLessThanOrEqual(action.visible + 1);
    await assertScreenFit(page, width, height);
  }
});

test('a 12-seat city fits fully, then zooms and pans without moving the whole page', async ({ page }) => {
  const game = createGame({
    id: 'responsive-megacity', seed: 12, mapId: 'max-metropolis',
    players: Array.from({ length: 12 }, (_, index) => ({ id: `p${index}`, name: `Player ${index + 1}` })),
  });
  await openSavedTable(page, game);
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const stage = page.locator('.board-stage');
    await expect(page.getByRole('button', { name: 'Enlarge board tiles' })).toBeVisible();
    await expect(page.locator('.game-board button').last()).toBeInViewport({ ratio: 1 });
    expect(await stage.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await stage.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Enlarge board tiles' }).click();
    await expect(page.getByText('Drag to explore')).toBeVisible();
    await assertScreenFit(page, width, height);
    await stage.evaluate((element) => { element.scrollLeft = 0; element.scrollTop = 0; });
    const first = await stage.evaluate((element) => ({ visible: element.querySelector('.game-board button')!.getBoundingClientRect().left >= element.getBoundingClientRect().left }));
    expect(first.visible).toBe(true);
    const scroll = await stage.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      element.scrollTop = element.scrollHeight;
      const last = element.querySelector('.game-board button:last-child')!.getBoundingClientRect();
      const frame = element.getBoundingClientRect();
      return { left: element.scrollLeft, top: element.scrollTop, lastVisible: last.right <= frame.right + 1 && last.bottom <= frame.bottom + 1 };
    });
    expect(scroll.left).toBeGreaterThan(0);
    expect(scroll.top).toBeGreaterThan(0);
    expect(scroll.lastVisible).toBe(true);
    const legal = getLegalTiles(game)[0];
    await page.locator('.tile-rack .rack-tile').filter({ hasText: new RegExp(`^${legal}`) }).click();
    await expect(page.locator(`.board-tile[aria-label^="${legal},"]`)).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: 'Fit entire board' }).click();
  }
});

test('iPhone notch insets are applied once across rotation and browser toolbar sizes', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Safe-area emulation uses the Chromium device protocol; WebKit exercises layout separately.');
  const game = createGame({ id: 'iphone-safe-area', seed: 52, players });
  await openSavedTable(page, game);
  const device = await context.newCDPSession(page);
  for (const [width, height, left, right, bottom] of [
    [852, 320, 59, 0, 21], [852, 393, 0, 59, 21],
    [844, 320, 44, 44, 21], [393, 650, 0, 0, 0], [393, 852, 0, 0, 34],
  ]) {
    await page.setViewportSize({ width, height });
    await device.send('Emulation.setSafeAreaInsetsOverride', { insets: { left, right, bottom, top: 0 } });
    await assertScreenFit(page, width, height);
    const layout = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const frame = box('.game-layout'), board = box('.board-wrap'), stage = box('.board-stage'), action = box('.action-card');
      return { left: frame.left, right: frame.right, bottom: action.bottom, boardWidth: board.width, stageWidth: stage.width, boardHeight: board.height, stageHeight: stage.height };
    });
    expect(layout.left).toBeCloseTo(Math.max(width > height ? 6 : 9, left), 0);
    expect(layout.right).toBeCloseTo(width - Math.max(width > height ? 6 : 9, right), 0);
    expect(layout.bottom).toBeCloseTo(height - Math.max(width > height || height <= 700 ? 4 : 7, bottom), 0);
    expect(layout.stageWidth - layout.boardWidth).toBeLessThanOrEqual(5);
    expect(layout.stageHeight - layout.boardHeight).toBeLessThanOrEqual(5);
    await expect(page.locator('.game-board button').last()).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Place a tile', exact: true })).toBeInViewport({ ratio: 1 });
  }
});

test('the wide Twin Docks board uses the full mobile frame in both orientations', async ({ page }) => {
  const game = createGame({ id: 'responsive-docks', mapId: 'twin-docks', seed: 52, players });
  await openSavedTable(page, game);
  for (const [width, height] of [[393, 852], [393, 650], [852, 393], [852, 320]]) {
    await page.setViewportSize({ width, height });
    await assertScreenFit(page, width, height);
    const layout = await page.locator('.board-stage').evaluate((stage) => {
      const frame = stage.getBoundingClientRect(), board = stage.querySelector('.board-wrap')!.getBoundingClientRect();
      return { widthGap: frame.width - board.width, heightGap: frame.height - board.height, overflowX: stage.scrollWidth - stage.clientWidth, overflowY: stage.scrollHeight - stage.clientHeight };
    });
    expect(layout.widthGap).toBeLessThanOrEqual(5);
    expect(layout.heightGap).toBeLessThanOrEqual(5);
    expect(layout.overflowX).toBeLessThanOrEqual(1);
    expect(layout.overflowY).toBeLessThanOrEqual(1);
    await expect(page.locator('.game-board button').last()).toBeInViewport({ ratio: 1 });
  }
});
