import { test as base, expect, type Page } from '@playwright/test';
import { applyAction, canEndGame, chooseBotAction, createGame, getCurrentActor, getSharePrice, analyzeTile, getAvailableChains, ALL_TILES } from '../src/game/engine';
import type { GameState } from '../src/game/types';

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await use(errors);
    expect(errors, 'No JavaScript exceptions or browser console errors').toEqual([]);
  }, { auto: true }],
});

async function savedGame(page: Page): Promise<GameState> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0]?.game);
}

async function navigate(page: Page, name: 'My games' | 'How to play') {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: new RegExp(name) }).click();
}

function replayTo(startSeed: number, predicate: (state: GameState) => boolean): GameState {
  for (let seed = startSeed; seed < startSeed + 30; seed++) {
    let state = createGame({ id: `e2e-city-${seed}`, seed,
      players: ['Alex', 'Morgan', 'Riley'].map((name, i) => ({ id: `p${i}`, name, isBot: false })) });
    for (let i = 0; i < 800 && state.phase !== 'ended'; i++) {
      if (predicate(state)) return state;
      state = applyAction(state, chooseBotAction(state));
    }
  }
  throw new Error('No seeded game reached the required scenario.');
}

function soloOpening(): { seed: number; tile: string } {
  for (let seed = 1; seed < 40; seed++) {
    let state = createGame({ seed, players: ['Avery', 'Ellis', 'Margot'].map((name, i) => ({ id: `p${i}`, name, isBot: i > 0 })) });
    for (let i = 0; i < 24 && getCurrentActor(state).isBot; i++) state = applyAction(state, chooseBotAction(state));
    const tile = state.players[0].hand.find(t => analyzeTile(state, t).kind === 'found');
    if (tile && getAvailableChains(state).includes('sackson')) return { seed, tile };
  }
  throw new Error('No opening with a founding opportunity was found.');
}

function blockedRackFixture(): GameState {
  const state = createGame({ id: 'e2e-blocked-rack', seed: 12,
    players: ['Alex', 'Morgan', 'Riley'].map((name, i) => ({ id: `p${i}`, name })) });
  const chains = { tower: ['1A', '2A'], sackson: ['4A', '5A'], american: ['1C', '2C'],
    festival: ['4C', '5C'], worldwide: ['1E', '2E'], continental: ['4E', '5E'], imperial: ['1G', '2G'],
    independent: ['8B', '11B', '8E', '11E', '8H', '11H'] };
  state.board = {};
  for (const [chain, tiles] of Object.entries(chains)) for (const tile of tiles) state.board[tile] = chain as GameState['board'][string];
  const rack = ['7B', '9B', '8A', '10B', '12B', '11A'];
  const free = ALL_TILES.filter(tile => !state.board[tile] && !rack.includes(tile));
  state.players[0].hand = rack;
  state.players.slice(1).forEach(player => { player.hand = free.splice(0, 6); });
  state.bag = free; state.currentPlayer = 0;
  return state;
}

async function resumeFixture(page: Page, state: GameState, kind: 'local' | 'solo' = 'local') {
  await page.addInitScript(({ game, savedKind }) => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: savedKind, updatedAt: '2026-09-17T15:00:00.000Z' }]));
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false, speed: 1400, hints: true }));
  }, { game: state, savedKind: kind });
  await page.goto('/');
  await navigate(page, 'My games');
  await page.locator('.saved-game-main').click();
  await expect(page.getByRole('heading', { name: 'The boardroom.' })).toBeVisible();
}

async function reveal(page: Page) {
  await expect(page.locator('.privacy-panel')).toBeVisible();
  await page.locator('.privacy-panel').getByRole('button').click();
  await expect(page.locator('.privacy-panel')).toHaveCount(0);
}

test('new table starts when randomUUID is unavailable on local-network HTTP', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  await page.getByRole('dialog', { name: 'A new opportunity' }).getByRole('button', { name: /Let’s build something/ }).click();
  await expect(page.getByRole('heading', { name: 'The boardroom.' })).toBeVisible();
  const game = await savedGame(page);
  expect(game.players).toHaveLength(3);
  expect(new Set(game.players.map(player => player.id)).size).toBe(3);
});

test('leaving a local game offers save or removal, and My games can end a saved game', async ({ page }) => {
  const game = createGame({ id: 'exit-choice-game', seed: 52,
    players: ['Alex', 'Morgan', 'Riley'].map((name, index) => ({ id: `p${index}`, name })) });
  await resumeFixture(page, game);
  await reveal(page);
  await page.locator('.game-topline').getByRole('button', { name: 'The clubhouse' }).click();
  const exit = page.getByRole('dialog', { name: 'Leave this game?' });
  await expect(exit).toContainText('Save & exit');
  await exit.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.getByRole('heading', { name: 'The boardroom.' })).toBeVisible();
  await page.locator('.game-topline').getByRole('button', { name: 'The clubhouse' }).click();
  await exit.getByRole('button', { name: 'Save & exit' }).click();
  await navigate(page, 'My games');
  await expect(page.locator('.saved-game-row')).toHaveCount(1);
  await page.locator('.saved-game-row').getByRole('button', { name: 'End game' }).click();
  const end = page.getByRole('dialog', { name: 'End this game?' });
  await end.getByRole('button', { name: 'Keep game' }).click();
  await expect(page.locator('.saved-game-row')).toHaveCount(1);
  await page.locator('.saved-game-row').getByRole('button', { name: 'End game' }).click();
  await end.getByRole('button', { name: 'End game & remove' }).click();
  await expect(page.locator('.saved-list')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]'))).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.matches.v1') || '[]'))).toEqual([]);
});

test('ending a local game from the exit choice removes it without creating a result', async ({ page }) => {
  const game = createGame({ id: 'exit-discard-game', seed: 53,
    players: ['Alex', 'Morgan', 'Riley'].map((name, index) => ({ id: `p${index}`, name })) });
  await resumeFixture(page, game);
  await reveal(page);
  await page.locator('.game-topline').getByRole('button', { name: 'The clubhouse' }).click();
  await page.getByRole('dialog', { name: 'Leave this game?' }).getByRole('button', { name: 'End game & remove' }).click();
  await navigate(page, 'My games');
  await expect(page.locator('.saved-list')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]'))).toEqual([]);
});

test('solo: start three seats, found a chain, buy shares, save and resume after a reload', async ({ page }) => {
  const { seed, tile } = soloOpening();
  const clockStart = new Date('2026-09-29T12:00:00Z');
  await page.clock.install({ time: clockStart });
  await page.addInitScript((seed) => {
    // A reproducible real deal exercises founding after the house takes its turns.
    Date.now = () => seed;
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false, speed: 220, hints: true }));
  }, seed);
  await page.goto('/');
  await page.getByRole('button', { name: /^Let’s play/ }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Avery');
  await page.getByRole('button', { name: '3 players', exact: true }).click();
  await page.getByRole('button', { name: /^Let’s build something/ }).click();
  await expect(page.locator('.players-bar .player-chip')).toHaveCount(3);
  await expect.poll(async () => {
    const recap = page.getByTestId('turn-recap');
    if (await recap.isVisible()) {
      await recap.getByRole('button', { name: 'Continue', exact: true }).click();
      return false;
    }
    const game = await savedGame(page);
    return game?.phase === 'place' && !getCurrentActor(game).isBot &&
      await page.getByRole('group', { name: 'Acquire game board' }).count() === 1;
  }).toBe(true);
  await page.locator('.tile-rack button').filter({ hasText: new RegExp(`^${tile}`) }).click();
  await expect(page.getByText('This tile will found a new hotel chain.')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^Place ${tile}`) }).click();
  await expect(page.getByRole('heading', { name: 'Found a chain', exact: true })).toBeVisible();
  await page.locator('.chain-choices').getByRole('button', { name: /Sackson/ }).click();
  await expect(page.getByRole('heading', { name: 'Invest in the market', exact: true })).toBeVisible();
  const founded = await savedGame(page);
  const viewer = founded.players.find(player => player.name === 'Avery')!;
  expect(viewer.stocks.sackson).toBe(1);
  const sharePrice = getSharePrice(founded, 'sackson');
  const add = page.getByRole('button', { name: 'Buy Sackson share', exact: true });
  await add.click(); await add.click(); await add.click();
  await expect(add).toBeDisabled();
  await expect(page.getByText('3 shares in your order', { exact: true })).toBeVisible();
  // Hold the next computer turn while checking persistence. Otherwise its market
  // view or turn recap can hide the board before a slower CI runner inspects it.
  await page.clock.pauseAt(new Date(clockStart.getTime() + 60 * 60 * 1000));
  await page.getByRole('button', { name: /^Invest \$/ }).click();
  await expect(page.getByTestId('turn-recap')).toHaveCount(0);
  await navigate(page, 'My games');
  await page.getByRole('dialog', { name: 'Leave this game?' }).getByRole('button', { name: 'Save & exit' }).click();
  await expect(page.locator('.saved-game-main').filter({ hasText: 'Avery' })).toBeVisible();
  const beforeReload = await savedGame(page);
  expect(beforeReload.players.find(player => player.name === 'Avery')?.stocks.sackson).toBe(4);
  expect(beforeReload.players.find(player => player.name === 'Avery')?.cash).toBe(6000 - sharePrice * 3);
  expect(beforeReload.board[tile]).toBe('sackson');
  await page.reload();
  await navigate(page, 'My games');
  await page.locator('.saved-game-main').filter({ hasText: 'Avery' }).click();
  await expect(page.getByRole('group', { name: 'Acquire game board' }).getByRole('button', { name: new RegExp(`^${tile}, Sackson`) })).toBeVisible();
  expect(await savedGame(page)).toEqual(beforeReload);
  // Resuming must also restart computer play, not just display a saved board.
  await page.clock.resume();
  await expect.poll(async () => (await savedGame(page)).revision).toBeGreaterThan(beforeReload.revision);
  await expect(page.getByTestId('turn-recap')).toBeVisible();
});

test('pass and play: the two-player extension keeps racks private between turns', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Around the table/ }).click();
  await page.getByLabel('Player 1', { exact: true }).fill('Alex');
  await page.getByRole('button', { name: '2 players', exact: true }).click();
  await page.getByLabel('Player 2', { exact: true }).fill('Morgan');
  await expect(page.getByLabel('Player 3', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Tycoon/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Let’s build something/ }).click();
  await expect(page.locator('.game-heading .eyebrow')).toContainText('2008 EDITION');
  await expect(page.locator('.players-bar .player-chip')).toHaveCount(2);
  await expect(page.locator('.tile-rack')).toHaveCount(0);
  await expect(page.locator('.game-board button[aria-label*="in your hand"]')).toHaveCount(0);
  const before = await savedGame(page);
  expect(before.mode).toBe('classic');
  const actor = getCurrentActor(before);
  await expect(page.locator('.privacy-panel')).toContainText(actor.name);
  await reveal(page);
  await expect(page.locator('.tile-rack button')).toHaveCount(6);
  const action = chooseBotAction(before);
  expect(action.type).toBe('place');
  if (action.type !== 'place') throw new Error('Expected a starting tile.');
  await page.locator('.tile-rack button').filter({ hasText: new RegExp(`^${action.tile}`) }).click();
  await page.getByRole('button', { name: new RegExp(`^Place ${action.tile}`) }).click();
  if ((await savedGame(page)).phase === 'found') await page.locator('.chain-choices button').first().click();
  await page.getByRole('button', { name: 'Skip buying', exact: true }).click();
  await expect(page.getByTestId('turn-recap')).toBeVisible();
  await page.getByTestId('turn-recap').getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.privacy-panel')).toBeVisible();
  await expect(page.locator('.tile-rack')).toHaveCount(0);
  await expect(page.locator('.game-board button[aria-label*="in your hand"]')).toHaveCount(0);
  expect(getCurrentActor(await savedGame(page)).id).not.toBe(actor.id);
});

test('rules: search expands matching explanations and links the official rulebook', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'How to play');
  await page.getByRole('textbox', { name: 'Search rules' }).fill('merger');
  await expect(page.locator('.rules-list details')).not.toHaveCount(0);
  await expect(page.locator('.rules-list details:not([open])')).toHaveCount(0);
  await expect(page.locator('.rules-list')).toContainText('The largest chain survives');
  await expect(page.getByRole('link', { name: /Read the official 2008 rulebook/ })).toHaveAttribute('href', /\/ah\/acquire_rules\.pdf/);
  await page.getByRole('textbox', { name: 'Search rules' }).fill('nonexistent-unicorn-rule');
  await expect(page.getByText(/No rules found/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Search rules' }).fill('');
  await expect(page.locator('.rules-list details')).toHaveCount(13);
});

test('online: an unconfigured project explains its state and opens playable local setup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Across the city/ }).click();
  const unavailable = page.getByRole('heading', { name: 'Online tables aren’t connected yet.' });
  test.skip(!(await unavailable.isVisible()), 'This environment has a connected Supabase project.');
  await expect(unavailable).toBeVisible();
  await page.getByRole('button', { name: /Start a pass-and-play game/ }).click();
  await expect(page.getByRole('dialog', { name: 'A new opportunity' })).toBeVisible();
  await expect(page.getByLabel('Player 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pass & play', exact: true })).toHaveClass(/selected/);
});

test('preferences: sound, hints and bot speed persist after reloading', async ({ page }) => {
  await page.goto('/');
  await page.locator('.topbar').getByRole('button', { name: 'Table preferences' }).click();
  await page.getByRole('switch', { name: 'Game sounds' }).click();
  await page.getByRole('switch', { name: 'Strategy tips' }).click();
  await page.getByLabel('The pace of the house').selectOption('220');
  await page.getByRole('button', { name: /^Just right/ }).click();
  await page.reload();
  await page.locator('.topbar').getByRole('button', { name: 'Table preferences' }).click();
  await expect(page.getByRole('switch', { name: 'Game sounds' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: 'Strategy tips' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByLabel('The pace of the house')).toHaveValue('220');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('merger: sell, trade and keep a real seeded holding, then privately hand off the decision', async ({ page }) => {
  const fixture = replayTo(1, state => state.phase === 'merger-shares' && getCurrentActor(state).stocks[state.merger!.acquired!] >= 4 && state.bank[state.merger!.survivor!] > 0);
  const actor = getCurrentActor(fixture);
  const acquired = fixture.merger!.acquired!;
  const survivor = fixture.merger!.survivor!;
  const expected = applyAction(fixture, { type: 'resolve-shares', sell: 1, trade: 2 });
  await resumeFixture(page, fixture);
  await reveal(page);
  await expect(page.getByRole('heading', { name: 'Manage your shares' })).toBeVisible();
  await page.getByRole('button', { name: 'Sell more shares' }).click();
  await page.getByRole('button', { name: 'Trade more shares' }).click();
  await expect(page.locator('.action-footer')).toContainText(`Receive $${fixture.merger!.sharePrice} + 1 survivor shares`);
  await page.getByRole('button', { name: 'Confirm choices' }).click();
  await expect(page.locator('.privacy-panel')).toBeVisible();
  const after = await savedGame(page);
  const actualInvestor = after.players.find(player => player.id === actor.id)!;
  const expectedInvestor = expected.players.find(player => player.id === actor.id)!;
  expect(actualInvestor.cash).toBe(expectedInvestor.cash);
  expect(actualInvestor.stocks[acquired]).toBe(expectedInvestor.stocks[acquired]);
  expect(actualInvestor.stocks[survivor]).toBe(expectedInvestor.stocks[survivor]);
  expect(actualInvestor.stocks[acquired]).toBeGreaterThan(0);
  expect(getCurrentActor(after).id).not.toBe(actor.id);
  await expect(page.locator('.merger-controls')).toHaveCount(0);
});

test('merger: the mover chooses a tied survivor through the actual chain controls', async ({ page }) => {
  const fixture = replayTo(3, state => state.phase === 'merger-survivor');
  await resumeFixture(page, fixture);
  await reveal(page);
  await expect(page.getByRole('heading', { name: 'Choose the survivor', exact: true })).toBeVisible();
  await expect(page.locator('.chain-choices button')).toHaveCount(fixture.merger!.survivorOptions.length);
  await page.locator('.chain-choices button').first().click();
  const after = await savedGame(page);
  expect(after.merger?.survivor).toBe(fixture.merger!.survivorOptions[0]);
  expect(after.phase).toBe('merger-shares');
});

test('blocked rack: exchange all six temporary tiles and place a replacement in the same turn', async ({ page }) => {
  const fixture = blockedRackFixture();
  const originalRack = [...fixture.players[0].hand];
  await resumeFixture(page, fixture);
  await reveal(page);
  await expect(page.getByRole('button', { name: 'Exchange entire rack', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Exchange entire rack', exact: true }).click();
  const after = await savedGame(page);
  expect(after.turn).toBe(fixture.turn);
  expect(after.currentPlayer).toBe(fixture.currentPlayer);
  expect(after.discarded).toEqual(expect.arrayContaining(originalRack));
  expect(after.players[0].hand).toHaveLength(6);
  expect(after.players[0].hand.some(tile => originalRack.includes(tile))).toBe(false);
  expect(after.phase).toBe('place');
  await expect(page.locator('.privacy-panel')).toHaveCount(0);
  const tile = after.players[0].hand.find(tile => analyzeTile(after, tile).legal)!;
  expect(tile).toBeDefined();
  await page.locator('.tile-rack button').filter({ hasText: new RegExp(`^${tile}`) }).click();
  await page.getByRole('button', { name: new RegExp(`^Place ${tile}`) }).click();
  expect((await savedGame(page)).tilePlacedThisTurn).toBe(true);
});

test('closing bell: declare the final turn, finish investing and show exact final results', async ({ page }) => {
  const fixture = replayTo(1, state => state.phase === 'buy' && canEndGame(state) && !state.endDeclared);
  const expected = applyAction(applyAction(fixture, { type: 'declare-end' }), { type: 'buy', stocks: {} });
  expect(expected.phase).toBe('ended');
  await resumeFixture(page, fixture);
  await reveal(page);
  await page.getByRole('button', { name: /Declare the final turn/ }).click();
  await expect(page.getByText('Final turn declared. Finish your turn to settle all holdings.')).toBeVisible();
  await expect(page.locator('.finale')).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip buying' }).click();
  await expect(page.getByTestId('turn-recap')).toBeVisible();
  await page.getByTestId('turn-recap').getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.settlement-card')).toBeVisible();
  for (const settlement of expected.finalSettlements!) {
    await expect(page.locator('.settlement-card')).toContainText(settlement.players[0].name);
    await page.getByRole('button', { name: /Next hotel chain|Reveal final scores/ }).click();
  }
  await expect(page.locator('.final-standings-list > div')).toHaveCount(3);
  const ended = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.matches.v1') || '[]')[0]);
  expect(ended.results).toEqual(expected.results);
  expect(ended.winnerIds).toEqual(expected.winnerIds);
  expect(ended.finalSettlements).toEqual(expected.finalSettlements);
  await expect(page.locator('.action-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to the clubhouse' }).click();
  await navigate(page, 'My games');
  await expect(page.locator('.match-history-card')).toHaveCount(1);
});


test('edition migration: older saves stay untouched and new games use version 2', async ({ page }) => {
  const oldSave = ' [{"game":{"version":1,"id":"legacy-only","mode":"tycoon"},"kind":"local"}] ';
  await page.addInitScript(raw => localStorage.setItem('aquire.games.v1', raw), oldSave);
  await page.goto('/');
  await expect(page.locator('main')).not.toContainText('2023');
  await expect(page.locator('main')).not.toContainText('Tycoon');
  await navigate(page, 'My games');
  await expect(page.locator('.saved-list')).toHaveCount(0);
  await page.getByRole('button', { name: /Make your first move/ }).click();
  await expect(page.getByRole('dialog')).toContainText('2008');
  await page.getByRole('button', { name: /^Let’s build something/ }).click();
  await expect.poll(async () => (await savedGame(page))?.version).toBe(2);
  expect((await savedGame(page)).ruleset).toBe('2008');
  expect(await page.evaluate(() => localStorage.getItem('aquire.games.v1'))).toBe(oldSave);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2')!)[0].game.version)).toBe(2);
});
