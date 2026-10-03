import { test, expect, type Page } from '@playwright/test';
import { analyzeTile, applyAction, CHAINS, chooseBotAction, createGame, getChainSize, getCurrentActor, getLegalTiles, getSharePrice } from '../src/game/engine';
import { getMap } from '../src/game/maps';
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
  await page.evaluate(() => document.fonts.ready);
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

for (const viewport of ['browser', 'native'] as const) {
  test(`${viewport} notch spacing stays correct across rotation and browser toolbar sizes`, async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Inset emulation uses Chromium; WebKit exercises board layout separately.');
    if (viewport === 'native') {
      await page.addInitScript(() => {
        Object.assign(window, { CapacitorCustomPlatform: { name: 'ios' } });
      });
    }
    const game = createGame({ id: 'iphone-safe-area', seed: 52, players });
    await openSavedTable(page, game);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', new RegExp(`viewport-fit=${viewport === 'native' ? 'cover' : 'contain'}`));
    const device = await context.newCDPSession(page);
    // The 725px case models Chrome's already narrowed landscape webview with
    // a notch on the left and browser controls on the right. env() can still
    // report the notch inset; adding it again created the large blank gutter.
    for (const [width, height, left, right, bottom] of [
      [852, 320, 59, 0, 21], [852, 393, 0, 59, 21], [725, 320, 59, 0, 21],
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
      const gutter = width > height ? 6 : 9;
      expect(layout.left).toBeCloseTo(Math.max(gutter, viewport === 'native' ? left : 0), 0);
      expect(layout.right).toBeCloseTo(width - Math.max(gutter, viewport === 'native' ? right : 0), 0);
      expect(layout.bottom).toBeCloseTo(height - Math.max(width > height || height <= 700 ? 4 : 7, bottom), 0);
      expect(layout.stageWidth - layout.boardWidth).toBeLessThanOrEqual(5);
      expect(layout.stageHeight - layout.boardHeight).toBeLessThanOrEqual(5);
      await expect(page.locator('.game-board button').last()).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('button', { name: 'Place a tile', exact: true })).toBeInViewport({ ratio: 1 });
    }
  });
}

for (const mapId of ['twin-docks', 'obelisk', 'max-metropolis'] as const) {
  test(`${mapId} fits without stretching tiles and rotates without changing coordinates`, async ({ page }) => {
    const game = createGame({ id: `responsive-${mapId}`, mapId, seed: 52, players });
    await openSavedTable(page, game);
    for (const [width, height] of [[393, 852], [393, 650], [852, 393], [725, 320]]) {
      await page.setViewportSize({ width, height });
      // Let orientation and ResizeObserver notifications reach the board before
      // comparing its automatic orientation with a manual rotation.
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await assertScreenFit(page, width, height);
      const checkBoard = async () => {
        const layout = await page.locator('.board-stage').evaluate((stage) => {
          const frame = stage.getBoundingClientRect(), board = stage.querySelector('.board-wrap')!.getBoundingClientRect();
          const tile = stage.querySelector('.board-tile')!.getBoundingClientRect();
          return { fitGap: Math.min(frame.width - board.width, frame.height - board.height), centerX: frame.x + frame.width / 2 - board.x - board.width / 2, centerY: frame.y + frame.height / 2 - board.y - board.height / 2, tileRatio: tile.width / tile.height, overflowX: stage.scrollWidth - stage.clientWidth, overflowY: stage.scrollHeight - stage.clientHeight };
        });
        expect(layout.fitGap).toBeLessThanOrEqual(5);
        expect(Math.abs(layout.centerX)).toBeLessThanOrEqual(1);
        expect(Math.abs(layout.centerY)).toBeLessThanOrEqual(1);
        expect(layout.tileRatio).toBeGreaterThan(.85);
        expect(layout.tileRatio).toBeLessThan(1.15);
        expect(layout.overflowX).toBeLessThanOrEqual(1);
        expect(layout.overflowY).toBeLessThanOrEqual(1);
      };
      await expect(async () => { await checkBoard(); }).toPass();
      const rotation = await page.locator('.board-card').getAttribute('data-board-rotated');
      await page.getByRole('button', { name: 'Rotate board', exact: true }).click();
      await expect(page.locator('.board-card')).toHaveAttribute('data-board-rotated', rotation === 'true' ? 'false' : 'true');
      await checkBoard();
      await expect(page.locator('.game-board button').first()).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.game-board button').last()).toBeInViewport({ ratio: 1 });
    }
    const tile = getLegalTiles(game)[0];
    await page.locator(`.board-tile[data-tile="${tile}"]`).click();
    await page.getByRole('button', { name: `Place ${tile}`, exact: true }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2')!)[0].game);
    expect(saved.lastPlacedTile).toBe(tile);
  });
}

test('board focus gives more room while keeping market status, the rack and purchase flow usable', async ({ page }) => {
  const game = createGame({ id: 'board-focus', mapId: 'twin-docks', seed: 52, players, houseRules: { marketMode: 'crazy' } });
  await page.setViewportSize({ width: 393, height: 650 });
  await openSavedTable(page, game);
  const before = await page.locator('.board-stage').boundingBox();
  await page.getByRole('button', { name: 'Focus on board' }).click();
  await expect(page.getByRole('heading', { name: 'The boardroom.' })).toBeHidden();
  const after = await page.locator('.board-stage').boundingBox();
  expect(after!.height - before!.height).toBeGreaterThan(60);
  await expect(page.locator('.compact-view-switcher .market-status-pill')).toBeVisible();
  await expect(page.locator('.tile-rack button')).toHaveCount(6);
  await assertScreenFit(page, 393, 650);
  await page.getByRole('button', { name: 'Enlarge board tiles' }).click();
  const tile = getLegalTiles(game)[0];
  await page.locator('.tile-rack .rack-tile').filter({ hasText: new RegExp(`^${tile}`) }).click();
  await expect(page.locator(`.board-tile[data-tile="${tile}"]`)).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Rotate board', exact: true }).click();
  await expect(page.locator(`.board-tile[data-tile="${tile}"]`)).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Fit entire board' }).click();
  const switcher = page.getByRole('group', { name: 'Game view' });
  await switcher.getByRole('button', { name: 'Stocks' }).click();
  await expect(page.locator('.stock-list')).toBeVisible();
  await switcher.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show table details' })).toBeVisible();
  await page.setViewportSize({ width: 725, height: 320 });
  await assertScreenFit(page, 725, 320);
  await expect(page.getByRole('button', { name: `Place ${tile}`, exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Show table details' }).click();
  await expect(page.getByRole('heading', { name: 'The boardroom.' })).toBeVisible();
  await page.setViewportSize({ width: 393, height: 650 });
  await page.getByRole('button', { name: 'Focus on board' }).click();
  await page.getByRole('button', { name: `Place ${tile}`, exact: true }).click();
  if (analyzeTile(game, tile).kind === 'found') await page.locator('.chain-choices button').first().click();
  await expect(page.getByRole('heading', { name: 'Invest in the market' })).toBeVisible();
  await expect(switcher.getByRole('button', { name: 'Stocks' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Skip buying', exact: true })).toBeInViewport({ ratio: 1 });
  await assertScreenFit(page, 393, 650);
});


for (const mapId of ['clockwork-keys', 'crystal-cascade', 'max-world-tree', 'max-astral-loom', 'goldspire-kingdom'] as const) {
  test(`${mapId} fits portrait and landscape with working rotation, zoom and tile selection`, async ({ page }) => {
    const map = getMap(mapId);
    const game = createGame({ id: `creative-${mapId}`, seed: 42, mapId,
      players: Array.from({ length: map.maxPlayers }, (_, i) => ({ id: `p${i}`, name: `Investor ${i + 1}` })) });
    await openSavedTable(page, game);
    const legal = getLegalTiles(game)[0];
    for (const [width, height] of [[393, 700], [852, 330]]) {
      await page.setViewportSize({ width, height });
      await assertScreenFit(page, width, height);
      await expect(page.locator('.board-card')).toHaveAttribute('data-map', mapId);
      const stage = page.locator('.board-stage');
      await expect.poll(() => stage.evaluate((element) => Math.max(element.scrollWidth - element.clientWidth, element.scrollHeight - element.clientHeight))).toBeLessThanOrEqual(1);
      const rotation = page.getByRole('button', { name: 'Rotate board', exact: true });
      if (await rotation.isVisible()) {
        await rotation.click();
        await assertScreenFit(page, width, height);
        await rotation.click();
      }
      await page.getByRole('button', { name: 'Enlarge board tiles' }).click();
      await page.locator('.tile-rack .rack-tile').filter({ hasText: new RegExp(`^${legal}`) }).click();
      await expect(page.locator(`.board-tile[aria-label^="${legal},"]`)).toBeInViewport({ ratio: 1 });
      await page.getByRole('button', { name: 'Fit entire board' }).click();
      if (process.env.AQUIRE_CAPTURE_MAPS === '1') await page.screenshot({ path: `artifacts/map-expansion/${mapId}-${width}.png` });
    }
    await page.getByRole('button', { name: new RegExp(`^Place ${legal}$`) }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
    expect(saved.board[legal]).toBeTruthy();
    expect(saved.mapId).toBe(mapId);
  });
}
