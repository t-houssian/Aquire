import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  applyAction,
  analyzeTile,
  CHAINS,
  chooseBotAction,
  createGame,
  getActiveChains,
  getCurrentActor,
  type GameState,
  type Stocks,
} from '../src/game/engine';

const GAME_KEY = 'aquire.games.v2';
const SETTINGS_KEY = 'aquire.settings.v1';

function findState(predicate: (state: GameState) => boolean): GameState {
  for (let seed = 1; seed <= 30; seed++) {
    let state = createGame({
      id: `preferences-fixture-${seed}`,
      seed,
      players: ['Alex', 'Ellis', 'Margot'].map((name, index) => ({
        id: `p${index}`,
        name,
        isBot: index > 0,
      })),
    });
    for (let step = 0; state.phase !== 'ended' && step < 700; step++) {
      if (predicate(state)) return state;
      state = applyAction(state, chooseBotAction(state));
    }
  }
  throw new Error('No real seeded game reached the requested preferences scenario.');
}

function investorFixture(): GameState {
  return findState(
    (state) =>
      state.phase === 'place' &&
      state.currentPlayer === 0 &&
      state.turn >= 9 &&
      getActiveChains(state).length >= 2 &&
      state.logs.slice(-55).some((log) => log.type === 'buy' && log.playerId !== 'p0' && log.message.includes(' buys ')) &&
      state.logs.slice(-55).some((log) => log.type === 'buy' && log.playerId === 'p0' && log.message.includes(' buys ')),
  );
}

function completeTurn(state: GameState): GameState {
  let next = state;
  for (let step = 0; step < 20 && next.turn === state.turn && next.phase !== 'ended'; step++) {
    next = applyAction(next, chooseBotAction(next));
  }
  return next;
}

function recapFixture(playerIndex: number): { before: GameState; after: GameState; tile: string; purchases: Partial<Stocks> } {
  const before = findState((state) => {
    if (state.phase !== 'place' || state.currentPlayer !== playerIndex || state.turn < 6) return false;
    const placement = chooseBotAction(state);
    if (placement.type !== 'place' || analyzeTile(state, placement.tile).kind === 'merge') return false;
    const after = completeTurn(state);
    return after.phase === 'place' && after.turn === state.turn + 1 &&
      after.logs.some((log) => log.turn === state.turn && log.type === 'buy' && log.message.includes(' buys '));
  });
  const after = completeTurn(before);
  const placed = after.logs.find((log) => log.turn === before.turn && log.type === 'tile' && log.playerId === getCurrentActor(before).id && log.tile);
  let decision = before;
  let purchases: Partial<Stocks> = {};
  while (decision.turn === before.turn) {
    const action = chooseBotAction(decision);
    if (action.type === 'buy') { purchases = action.stocks; break; }
    decision = applyAction(decision, action);
  }
  return { before, after, tile: placed!.tile!, purchases };
}

async function preferences(page: Page) {
  const compact = page.locator('.game-topline').getByRole('button', { name: 'Table preferences' });
  if (await compact.isVisible()) await compact.click();
  else await page.locator('.topbar').getByRole('button', { name: 'Table preferences' }).click();
  await expect(page.getByRole('dialog', { name: 'Make yourself at home' })).toBeVisible();
}

async function closePreferences(page: Page) {
  await page.getByRole('button', { name: /^Just right/ }).click();
}

async function resume(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').click();
  await expect(page.getByRole('heading', { name: 'The boardroom.' })).toBeVisible();
}

async function loadFixture(page: Page, state: GameState, kind: 'solo' | 'local' = 'solo', preferences: Record<string, boolean> = {}) {
  await page.addInitScript(({ game, savedKind, gameKey, settingsKey, overrides }) => {
    if (!localStorage.getItem(gameKey)) {
      localStorage.setItem(gameKey, JSON.stringify([{ game, kind: savedKind, updatedAt: '2026-09-17T15:00:00.000Z' }]));
    }
    if (!localStorage.getItem(settingsKey)) {
      localStorage.setItem(settingsKey, JSON.stringify({ sound: false, speed: 220, hints: true, ...overrides }));
    }
  }, { game: state, savedKind: kind, gameKey: GAME_KEY, settingsKey: SETTINGS_KEY, overrides: preferences });
  await page.goto('/');
  await resume(page);
}

async function saved(page: Page): Promise<GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!)[0].game, GAME_KEY);
}

function recap(page: Page): Locator {
  return page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Continue', exact: true }) });
}

test('opponent holdings start hidden and information settings persist independently', async ({ page }) => {
  await page.goto('/');
  await preferences(page);
  const holdings = page.getByRole('switch', { name: 'Hide opponents’ holdings', exact: true });
  const bank = page.getByRole('switch', { name: 'Hide remaining stock counts', exact: true });
  await expect(holdings).toHaveAttribute('aria-checked', 'true');
  await expect(bank).toHaveAttribute('aria-checked', 'false');
  await holdings.click();
  await expect(bank).toHaveAttribute('aria-checked', 'false');
  await bank.click();
  await closePreferences(page);
  await page.reload();
  await preferences(page);
  await expect(holdings).toHaveAttribute('aria-checked', 'false');
  await expect(bank).toHaveAttribute('aria-checked', 'true');
  await holdings.click();
  await closePreferences(page);
  await page.reload();
  await preferences(page);
  await expect(holdings).toHaveAttribute('aria-checked', 'true');
  await expect(bank).toHaveAttribute('aria-checked', 'true');
});

test('chain cells and headquarters use one readable first letter with coordinates intact', async ({ page }) => {
  const fixture = investorFixture();
  await loadFixture(page, fixture);
  for (const chain of getActiveChains(fixture)) {
    const definition = CHAINS.find((item) => item.id === chain)!;
    const headquarters = page.locator(`.game-board .chain-headquarters[aria-label*="${definition.name}"]`);
    await expect(headquarters).toHaveCount(1);
    await expect(headquarters.locator('.tile-initial')).toHaveText(definition.name[0]);
    await expect(headquarters.locator('.tile-coordinate')).toHaveText(/^\d{1,2}[A-I]$/);
    const chainCells = page.locator(`.game-board .chain-tile[aria-label*="${definition.name}"]`);
    for (const letter of await chainCells.locator('.tile-initial').allTextContents()) expect(letter).toBe(definition.name[0]);
  }
  await expect(page.locator('.game-board .tile-building')).toHaveCount(0);
});

test('memory play hides opponents’ portfolios and purchase history while retaining your own records', async ({ page }) => {
  const fixture = investorFixture();
  const opponentPurchase = [...fixture.logs].reverse().find((log) => log.type === 'buy' && log.playerId !== 'p0' && log.message.includes(' buys '))!;
  const ownPurchase = [...fixture.logs].reverse().find((log) => log.type === 'buy' && log.playerId === 'p0' && log.message.includes(' buys '))!;
  await loadFixture(page, fixture);
  await preferences(page);
  await page.getByRole('switch', { name: 'Hide opponents’ holdings', exact: true }).click();
  await closePreferences(page);
  const stocksView = page.getByRole('group', { name: 'Game view' }).getByRole('button', { name: 'Stocks' });
  if (await stocksView.isVisible()) await stocksView.click();
  await page.getByRole('button', { name: 'Investors', exact: true }).click();
  const own = page.locator('.investor-list details').filter({ has: page.locator('summary', { hasText: 'Alex' }) });
  const opponents = page.locator('.investor-list details').filter({ hasNot: page.locator('summary', { hasText: 'Alex' }) });
  await expect(own.locator('.holdings')).toHaveCount(1);
  await expect(opponents.locator('.holdings')).toHaveCount(2);
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.locator('.activity-list')).toContainText(opponentPurchase.message);
  await preferences(page);
  await page.getByRole('switch', { name: 'Hide opponents’ holdings', exact: true }).click();
  await closePreferences(page);
  await expect(page.locator('.activity-list')).not.toContainText(opponentPurchase.message);
  await expect(page.locator('.activity-list')).toContainText(ownPurchase.message);
  await page.getByRole('button', { name: 'Investors', exact: true }).click();
  await expect(own.locator('.holdings')).toHaveCount(1);
  await expect(opponents.locator('.holdings')).toHaveCount(0);
  await expect(opponents.locator('.hidden-holdings')).toHaveCount(2);
});

test('the stock-count setting masks only bank quantities and preserves your share counts', async ({ page }) => {
  const fixture = investorFixture();
  await loadFixture(page, fixture);
  const active = getActiveChains(fixture).find((chain) => fixture.bank[chain] > 0)!;
  const definition = CHAINS.find((chain) => chain.id === active)!;
  const row = page.locator('.stock-row').filter({ has: page.locator('.stock-name', { hasText: definition.name }) });
  await expect(row).toContainText(`${fixture.bank[active]} available`);
  await expect(row.locator('.stock-price')).toContainText(`${fixture.players[0].stocks[active]} owned`);
  await preferences(page);
  await page.getByRole('switch', { name: 'Hide remaining stock counts', exact: true }).click();
  await closePreferences(page);
  await expect(row).toContainText('Available');
  await expect(row).not.toContainText(`${fixture.bank[active]} available`);
  await expect(row.locator('.stock-price')).toContainText(`${fixture.players[0].stocks[active]} owned`);
});

test('each completed computer turn shows its tile and purchase, and pauses the next computer', async ({ page }) => {
  const fixture = recapFixture(1);
  await page.clock.install();
  await loadFixture(page, fixture.before);
  await expect(recap(page)).toBeVisible();
  await expect(recap(page)).toContainText('Ellis');
  await expect(recap(page).locator('.recap-coordinate')).toHaveText(fixture.tile);
  await expect(recap(page).getByRole('img', { name: `Board after turn ${fixture.before.turn}, placed tile ${fixture.tile} highlighted` })).toBeVisible();
  await expect(recap(page).locator('[data-highlighted="true"]')).toHaveAttribute('data-tile', fixture.tile);
  for (const [chain, quantity] of Object.entries(fixture.purchases)) {
    const name = CHAINS.find((item) => item.id === chain)!.name;
    await expect(recap(page).locator('.recap-purchase').filter({ hasText: name })).toContainText(`${quantity} share`);
  }
  const paused = await saved(page);
  expect(paused.turn).toBe(fixture.after.turn);
  expect(getCurrentActor(paused).name).toBe('Margot');
  expect(paused.revision).toBe(fixture.after.revision);
  await page.clock.runFor(10000);
  expect((await saved(page)).revision).toBe(paused.revision);
  await recap(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(paused.revision);
});

test('memory play shows purchases once in the recap, hides their history, and does not replay on resume', async ({ page }) => {
  const fixture = recapFixture(2);
  await loadFixture(page, fixture.before, 'solo', { hideOpponentHoldings: true, hideStockAvailability: true });
  await expect(recap(page)).toBeVisible();
  await expect(recap(page)).toContainText('Margot');
  for (const [chain, quantity] of Object.entries(fixture.purchases)) {
    const name = CHAINS.find((item) => item.id === chain)!.name;
    await expect(recap(page).locator('.recap-purchase').filter({ hasText: name })).toContainText(`${quantity} share`);
  }
  await recap(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(recap(page)).toHaveCount(0);
  expect(getCurrentActor(await saved(page)).id).toBe('p0');
  const stocksView = page.getByRole('group', { name: 'Game view' }).getByRole('button', { name: 'Stocks' });
  if (await stocksView.isVisible()) await stocksView.click();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  const purchaseLog = fixture.after.logs.find((log) => log.turn === fixture.before.turn && log.type === 'buy')!;
  await expect(page.locator('.activity-list')).not.toContainText(purchaseLog.message);
  await page.reload();
  await resume(page);
  await expect(recap(page)).toHaveCount(0);
  await expect(page.locator('.tile-rack button')).toHaveCount(6);
});

test('pass-and-play keeps the incoming rack hidden until the completed turn is reviewed', async ({ page }) => {
  const fixture = recapFixture(1);
  fixture.before.players.forEach((player) => { player.isBot = false; });
  const purchaseState = applyAction(fixture.before, chooseBotAction(fixture.before));
  let beforeBuy = purchaseState;
  while (beforeBuy.phase !== 'buy') beforeBuy = applyAction(beforeBuy, chooseBotAction(beforeBuy));
  await loadFixture(page, beforeBuy, 'local');
  await page.locator('.privacy-panel').getByRole('button').click();
  await page.getByRole('button', { name: 'Skip buying', exact: true }).click();
  await expect(recap(page)).toBeVisible();
  await expect(recap(page)).toContainText(fixture.tile);
  await expect(page.locator('.tile-rack')).toHaveCount(0);
  await expect(page.locator('.game-board button[aria-label*="in your hand"]')).toHaveCount(0);
  await recap(page).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.privacy-panel')).toBeVisible();
  await expect(page.locator('.privacy-panel')).toContainText('Margot');
  await expect(page.locator('.tile-rack')).toHaveCount(0);
});
