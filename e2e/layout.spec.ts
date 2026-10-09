import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  applyAction,
  CHAINS,
  chooseBotAction,
  createGame,
  getActiveChains,
  getAvailableChains,
  getCurrentActor,
  type GameState,
  type Phase,
} from '../src/game/engine';

const GAME_KEY = 'aquire.games.v2';
const SETTINGS_KEY = 'aquire.settings.v1';
const names = ['Alex', 'Ellis', 'Margot', 'Riley', 'Sam', 'Jordan'];
const checkpoints: { phase: Phase; seed: number; revision: number }[] = [
  { phase: 'place', seed: 1, revision: 0 },
  { phase: 'found', seed: 1, revision: 3 },
  { phase: 'buy', seed: 3, revision: 34 },
  { phase: 'merger-survivor', seed: 4, revision: 52 },
  { phase: 'merger-order', seed: 55, revision: 98 },
  { phase: 'merger-shares', seed: 1, revision: 25 },
  { phase: 'ended', seed: 1, revision: 96 },
];

/** Reproduce actual six-player game positions without fabricating board or stock data. */
const fixtureCache = new Map<Phase, GameState>();
function fixture(checkpoint: (typeof checkpoints)[number]): GameState {
  const cached = fixtureCache.get(checkpoint.phase);
  if (cached) return cached;
  for (let seed = checkpoint.seed; seed < checkpoint.seed + 40; seed++) {
    let state = createGame({
      id: `layout-${seed}-${checkpoint.phase}`,
      seed,
      players: names.map((name, index) => ({ id: `p${index}`, name })),
    });
    for (let step = 0; step < 850; step++) {
      if (state.phase === checkpoint.phase &&
        (checkpoint.phase !== 'found' || getAvailableChains(state).length === 7) &&
        (checkpoint.phase !== 'buy' || getActiveChains(state).length === 7)) {
        fixtureCache.set(checkpoint.phase, state);
        return state;
      }
      if (state.phase === 'ended') break;
      state = applyAction(state, chooseBotAction(state));
    }
  }
  throw new Error(`No real seeded game reached ${checkpoint.phase}.`);
}

async function load(page: Page, game: GameState, collapsed = false) {
  await page.addInitScript(
    ({ state, gameKey, settingsKey }) => {
      if (!localStorage.getItem(gameKey)) localStorage.setItem(
        gameKey,
        JSON.stringify([{ game: state, kind: 'local', updatedAt: '2026-09-17T15:00:00.000Z' }]),
      );
      if (!localStorage.getItem(settingsKey)) localStorage.setItem(
        settingsKey,
        JSON.stringify({ sound: false, speed: 1400, hints: true, sidebarCollapsed: false }),
      );
    },
    { state: game, gameKey: GAME_KEY, settingsKey: SETTINGS_KEY },
  );
  await page.goto('/');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /My games/ })
    .click();
  if (game.phase === 'ended') {
    await page.locator('.match-history-card').click();
    await expect(page.locator('.finale')).toBeVisible();
  } else {
    await page.locator('.saved-game-main').click();
    await expect(page.getByRole('heading', { name: 'The boardroom.' })).toBeVisible();
  }
  if (collapsed) await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
  if (game.phase !== 'ended') {
    await expect(page.locator('.privacy-panel')).toBeVisible();
    await page.locator('.privacy-panel').getByRole('button').click();
  }
  await page.evaluate(() => document.fonts.ready);
}

async function documentFits(page: Page, context: string) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const root = document.documentElement;
          return Math.max(root.scrollHeight - innerHeight, root.scrollWidth - innerWidth);
        }),
      {
        message: `${context}: the desktop document must not require vertical or horizontal scrolling`,
      },
    )
    .toBeLessThanOrEqual(1);
  const metrics = await page.evaluate(() => ({
    height: innerHeight,
    width: innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollY,
    scrollX,
  }));
  expect(metrics.scrollHeight, context).toBeLessThanOrEqual(metrics.height + 1);
  expect(metrics.scrollWidth, context).toBeLessThanOrEqual(metrics.width);
  expect(metrics.scrollY, context).toBe(0);
  expect(metrics.scrollX, context).toBe(0);
}

async function fullyVisible(locator: Locator, context: string) {
  await expect(locator, `${context}: the element exists and is visible`).toBeVisible();
  // IntersectionObserver also detects clipping by overflow ancestors, unlike page dimensions alone.
  await expect(
    locator,
    `${context}: the whole element must fit, not be clipped or require scrolling`,
  ).toBeInViewport({ ratio: 0.999 });
}

async function phaseFits(page: Page, game: GameState, context: string) {
  if (game.phase === 'ended') {
    await expect(page.locator('.finale')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    for (const chain of game.finalSettlements ?? []) {
      await expect(page.locator('.settlement-card')).toContainText(CHAINS.find((c) => c.id === chain.chain)!.name);
      await page.getByRole('button', { name: /Next hotel chain|Reveal final scores/ }).click();
    }
    await expect(page.locator('.final-standings-list > div')).toHaveCount(6);
    return;
  }
  await documentFits(page, context);
  const board = page.getByRole('group', { name: 'Acquire game board' });
  await fullyVisible(board, `${context} board`);
  await expect(board.getByRole('button')).toHaveCount(108);
  await fullyVisible(board.getByRole('button').first(), `${context} first tile`);
  await fullyVisible(board.getByRole('button').last(), `${context} last tile`);
  const tile = await board.getByRole('button').first().boundingBox();
  expect.soft(tile!.width, `${context}: tile width must remain usable`).toBeGreaterThanOrEqual(20);
  expect.soft(tile!.height, `${context}: tile height must remain usable`).toBeGreaterThanOrEqual(20);
  await fullyVisible(page.locator('.action-card'), `${context} current decision`);
  for (const button of await page.locator('.action-card button').all()) {
    await fullyVisible(button, `${context} decision control`);
  }
  await expect(page.locator('.stock-row')).toHaveCount(7);
  for (const row of await page.locator('.stock-row').all())
    await fullyVisible(row, `${context} stock listing`);
  if (game.phase === 'place') {
    await fullyVisible(page.locator('.tile-rack'), `${context} tile rack`);
    await expect(page.locator('.tile-rack button')).toHaveCount(6);
  }
  if (game.phase === 'found') await expect(page.locator('.chain-choices button')).toHaveCount(7);
  if (game.phase === 'buy') {
    for (const chain of CHAINS.filter((chain) => game.houseRules?.hotelChains.includes(chain.id))) {
      await fullyVisible(
        page.getByRole('button', { name: `Buy ${chain.name} share`, exact: true }),
        `${context} buy ${chain.name}`,
      );
      await fullyVisible(
        page.getByRole('button', { name: `Remove ${chain.name} share`, exact: true }),
        `${context} remove ${chain.name}`,
      );
    }
  }
}

test.describe('desktop gameplay fits the viewport', () => {
  for (const viewport of [
    { width: 1060, height: 650 },
    { width: 1366, height: 650 },
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    for (const collapsed of [false, true]) {
      for (const checkpoint of checkpoints) {
        // Each screen gets its own time budget and browser context. Slow CI
        // rendering must not consume the budget for the following six phases.
        test(`${viewport.width}×${viewport.height}, sidebar ${collapsed ? 'hidden' : 'shown'}: ${checkpoint.phase} and seven chains remain reachable`, { tag: '@desktop' }, async ({ page }) => {
          await page.setViewportSize(viewport);
          const game = fixture(checkpoint);
          await load(page, game, collapsed);
          await phaseFits(
            page,
            game,
            `${viewport.width}×${viewport.height} ${collapsed ? 'collapsed' : 'expanded'} ${game.phase}`,
          );
        });
      }
    }
  }
});

test('desktop sidebar releases horizontal space and remembers hiding and restoring it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'This checks the desktop sidebar preference.');
  await page.setViewportSize({ width: 1366, height: 768 });
  await load(page, fixture(checkpoints[0]));
  const before = await page.locator('.main-shell').boundingBox();
  const boardBefore = await page.locator('.game-layout').boundingBox();
  const railWidth = (await page.locator('.sidebar').boundingBox())!.width;
  await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show sidebar', exact: true })).toBeVisible();
  await expect
    .poll(async () => (await page.locator('.main-shell').boundingBox())!.width)
    .toBeGreaterThanOrEqual(before!.width + railWidth - 1);
  expect((await page.locator('.game-layout').boundingBox())!.width).toBeGreaterThan(
    boardBefore!.width + railWidth - 1,
  );
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).sidebarCollapsed,
      SETTINGS_KEY,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show sidebar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show sidebar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide sidebar', exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).sidebarCollapsed,
      SETTINGS_KEY,
    ),
  ).toBe(false);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hide sidebar', exact: true })).toBeVisible();
  await expect(page.locator('#sidebar-navigation')).toBeInViewport({ ratio: 0.999 });
});

test('a desktop tile remains clickable through buying, recap and a private device handoff', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    'Existing mobile gameplay tests cover the narrow layout.',
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  const before = fixture(checkpoints[0]);
  await load(page, before, true);
  const placement = chooseBotAction(before);
  expect(placement.type).toBe('place');
  if (placement.type !== 'place') throw new Error('Fixture needs an opening placement.');
  const boardTile = page
    .getByRole('group', { name: 'Acquire game board' })
    .getByRole('button', { name: new RegExp(`^${placement.tile},`) });
  await fullyVisible(boardTile, 'playable board tile');
  await boardTile.click();
  await page.getByRole('button', { name: `Place ${placement.tile}`, exact: true }).click();
  if (await page.getByRole('heading', { name: 'Found a chain', exact: true }).isVisible())
    await page.locator('.chain-choices button').first().click();
  await fullyVisible(
    page.getByRole('button', { name: 'Skip buying', exact: true }),
    'end-turn action',
  );
  await page.getByRole('button', { name: 'Skip buying', exact: true }).click();
  await expect(page.getByTestId('turn-recap')).toBeVisible();
  await fullyVisible(
    page.getByTestId('turn-recap').getByRole('button', { name: 'Continue', exact: true }),
    'recap acknowledgment',
  );
  await page
    .getByTestId('turn-recap')
    .getByRole('button', { name: 'Continue', exact: true })
    .click();
  await fullyVisible(page.locator('.privacy-panel').getByRole('button'), 'private handoff action');
  await expect(page.locator('.tile-rack')).toHaveCount(0);
  const after = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!)[0].game as GameState,
    GAME_KEY,
  );
  expect(after.board[placement.tile]).toBeDefined();
  expect(getCurrentActor(after).id).not.toBe(getCurrentActor(before).id);
  await documentFits(page, 'handoff after a full desktop turn');
});

test('mobile navigation remains usable when the desktop sidebar preference is hidden', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Exercise the real mobile drawer.');
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ sidebarCollapsed: true, sound: false, hints: true, speed: 850 }),
    );
  }, SETTINGS_KEY);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  const history = page.locator('#sidebar-navigation').getByRole('button', { name: /My games/ });
  await fullyVisible(history, 'mobile drawer history link');
  await history.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.history-page')).toBeVisible();
  await menu.click();
  // Tap the exposed backdrop to the right of the drawer, not its covered center.
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click({
    position: { x: page.viewportSize()!.width - 15, y: 120 },
  });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});
