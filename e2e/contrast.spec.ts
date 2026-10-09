import { expect, test, type Locator, type Page } from '@playwright/test';
import { readable } from './helpers/contrast';
import { applyAction, chooseBotAction, createGame, getActiveChains, getCurrentActor, type GameState, type Phase } from '../src/game/engine';
import { STORY_CHAPTERS } from '../src/game/campaign';
import { summarizeMatch } from '../src/lib/matches';

const phases: { phase: Phase; seed: number }[] = [
  { phase: 'place', seed: 1 }, { phase: 'found', seed: 1 },
  { phase: 'buy', seed: 3 }, { phase: 'merger-survivor', seed: 4 },
  { phase: 'merger-order', seed: 55 }, { phase: 'merger-shares', seed: 1 },
  { phase: 'ended', seed: 1 },
];
const fixtures = new Map<Phase, GameState>();
function fixture(phase: Phase) {
  if (fixtures.has(phase)) return fixtures.get(phase)!;
  const startSeed = phases.find(p => p.phase === phase)!.seed;
  for (let seed = startSeed; seed < startSeed + 40; seed++) {
    let game = createGame({ id: `contrast-${phase}-${seed}`, seed,
      players: ['Alex', 'Ellis', 'Margot', 'Riley', 'Sam', 'Jordan'].map((name, i) => ({ id: `p${i}`, name })) });
    for (let step = 0; step < 850; step++) {
      if (game.phase === phase && (phase !== 'buy' || getActiveChains(game).length === 7)) {
        fixtures.set(phase, game);
        return game;
      }
      if (game.phase === 'ended') break;
      game = applyAction(game, chooseBotAction(game));
    }
  }
  throw new Error(`The seeded game did not reach ${phase}.`);
}

test.use({ reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  const completed = fixture('ended');
  await page.addInitScript(({ progress, match }) => {
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false, speed: 1400 }));
    localStorage.setItem('aquire.story.v1', JSON.stringify({ version: 1, chapters: progress }));
    localStorage.setItem('aquire.matches.v1', JSON.stringify([match]));
  }, {
    progress: Object.fromEntries(STORY_CHAPTERS.map(c => [c.id, { won: true, attempts: 1, best: 7000, lastGameId: 'previous', lastOutcome: 'won' }])),
    match: summarizeMatch(completed, 'local'),
  });
});

async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name }).click();
}

async function resume(page: Page, game: GameState) {
  await page.addInitScript(game => localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: 'local', updatedAt: new Date().toISOString() }])), game);
  await page.goto('/');
  await navigate(page, /My games/);
  await page.locator('.saved-game-main').first().click();
  await page.getByRole('button', { name: new RegExp(`I’m ${getCurrentActor(game).name}`) }).click();
}

for (const screen of ['lobby', 'setup', 'settings', 'character', 'rewards', 'online-record', 'rulebook', 'story', 'briefing', 'history', 'finale', 'opening-dice'] as const) {
  test(`${screen} text stays readable on its own surfaces`, async ({ page }) => {
    await page.goto('/');
    let scope = page.locator('.lobby');
    if (screen === 'setup' || screen === 'opening-dice') {
      await page.getByRole('button', { name: /Let’s play/ }).first().click();
      await page.locator('.setup-advanced').first().evaluate((el: HTMLDetailsElement) => { el.open = true; });
      scope = page.getByRole('dialog');
      if (screen === 'opening-dice') {
        await scope.getByLabel('Market fluctuation').selectOption('market');
        await scope.getByLabel('Market roll frequency').selectOption('turn');
        await scope.getByRole('button', { name: /Let’s build something/ }).click();
        scope = page.getByRole('dialog', { name: 'The opening market' });
      }
    } else if (screen === 'settings') {
      await page.getByRole('button', { name: 'Table preferences', exact: true }).first().click();
      scope = page.getByRole('dialog');
    } else if (['character', 'rewards', 'online-record'].includes(screen)) {
      await page.getByRole('button', { name: 'Customize your character', exact: true }).click();
      if (screen === 'rewards') await page.getByRole('button', { name: 'Win rewards', exact: true }).click();
      if (screen === 'online-record') await page.getByRole('button', { name: 'Online record', exact: true }).click();
      scope = page.getByRole('dialog');
    } else if (screen === 'rulebook') {
      await navigate(page, /How to play/);
      await page.locator('.rules-list details').evaluateAll(els => els.forEach(el => { (el as HTMLDetailsElement).open = true; }));
      scope = page.locator('.rulebook');
    } else if (screen === 'story' || screen === 'briefing') {
      await navigate(page, /The Long Game/);
      await page.locator('.story-book-tabs button').first().click();
      scope = page.locator('.story-page');
      if (screen === 'briefing') {
        await page.getByRole('button', { name: /Challenge 6:/ }).click();
        scope = page.getByRole('dialog');
        await expect(scope.locator('.story-opponents strong')).toHaveCount(3);
      }
    } else if (screen === 'history' || screen === 'finale') {
      await navigate(page, /My games/);
      scope = page.locator('.history-page');
      if (screen === 'finale') {
        await page.locator('.match-history-card').first().click();
        scope = page.locator('.finale');
      }
    }
    await readable(page, scope);
  });
}

for (const { phase } of phases.filter(p => p.phase !== 'ended')) {
  test(`${phase} gameplay instructions and stock labels stay readable`, async ({ page }) => {
    const game = fixture(phase);
    await resume(page, game);
    if (phase !== 'place' && phase !== 'found') {
      const stocks = page.getByRole('button', { name: 'Stocks', exact: true });
      if (await stocks.isVisible()) await stocks.click();
    }
    await readable(page, page.locator('.game-view'));
  });
}

for (const panel of ['Investors', 'Activity', 'House rules', 'flat-board', 'turn-recap'] as const) {
  test(`${panel} remains readable throughout the table`, async ({ page }) => {
    await resume(page, fixture(panel === 'flat-board' ? 'place' : 'buy'));
    let scope = page.locator('.game-view');
    if (panel === 'flat-board') {
      await page.getByRole('button', { name: 'Switch to flat board' }).click();
    } else {
      const stocks = page.getByRole('button', { name: 'Stocks', exact: true });
      if (await stocks.isVisible()) await stocks.click();
      if (panel === 'turn-recap') {
        await page.getByRole('button', { name: 'Skip buying', exact: true }).click();
        scope = page.getByRole('dialog').filter({ has: page.getByTestId('turn-recap') });
      } else {
        await page.getByRole('button', { name: panel, exact: true }).click();
        if (panel === 'Investors') await page.locator('.investor-list details').evaluateAll(els => els.forEach(el => { (el as HTMLDetailsElement).open = true; }));
      }
    }
    await readable(page, scope);
  });
}
