import { expect, test, type Page } from '@playwright/test';
import {
  applyAction,
  CHAINS,
  chooseBotAction,
  createGame,
  getActiveChains,
  getCurrentActor,
  getSharePrice,
  type ChainId,
  type GameState,
} from '../src/game/engine';

function fixture(kind: 'founding' | 'merger'): { game: GameState; purchases: ChainId[] } {
  for (let seed = 1; seed <= 60; seed++) {
    let game = createGame({
      id: `recap-layout-${kind}-${seed}`,
      seed,
      players: ['Alex', 'Ellis', 'Margot', 'Riley', 'Sam', 'Jordan'].map((name, index) => ({
        id: `p${index}`,
        name,
      })),
    });
    while (game.phase !== 'ended') {
      if (game.phase === 'buy' && !game.endDeclared) {
        const events = game.logs.filter((entry) => entry.turn === game.turn);
        const wantedEvent = kind === 'founding' ? 'found' : 'merger';
        const purchases = getActiveChains(game)
          .filter((chain) => game.bank[chain] > 0)
          .sort((a, b) => getSharePrice(game, a) - getSharePrice(game, b))
          .slice(0, 3);
        if (
          events.some((entry) => entry.type === wantedEvent) &&
          (kind === 'founding' ||
            events.filter((entry) => ['merger', 'shares', 'bonus'].includes(entry.type)).length >=
              7) &&
          purchases.length === 3 &&
          purchases.reduce((sum, chain) => sum + getSharePrice(game, chain), 0) <=
            getCurrentActor(game).cash
        )
          return { game, purchases };
      }
      game = applyAction(game, chooseBotAction(game));
    }
  }
  throw new Error(`No actual ${kind} turn with three affordable chains found.`);
}

async function loadAndComplete(page: Page, game: GameState, purchases: ChainId[]) {
  await page.addInitScript((state) => {
    localStorage.setItem(
      'aquire.games.v2',
      JSON.stringify([{ game: state, kind: 'local', updatedAt: '2026-09-17T15:00:00.000Z' }]),
    );
    localStorage.setItem(
      'aquire.settings.v1',
      JSON.stringify({ sound: false, hints: true, speed: 1400 }),
    );
  }, game);
  await page.goto('/');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /My games/ })
    .click();
  await page.locator('.saved-game-main').click();
  await page.locator('.privacy-panel').getByRole('button').click();
  for (const chain of purchases) {
    const name = CHAINS.find((item) => item.id === chain)!.name;
    await page.getByRole('button', { name: `Buy ${name} share`, exact: true }).click();
  }
  await page.getByRole('button', { name: /^Invest \$/ }).click();
  await expect(page.getByTestId('turn-recap')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test.describe('desktop turn recap fits without scrolling', () => {
  for (const viewport of [
    { width: 1366, height: 650 },
    { width: 1280, height: 720 },
  ]) {
    for (const kind of ['founding', 'merger'] as const) {
      test(`${kind} and three purchased chains fit at ${viewport.width}×${viewport.height}`, async ({
        page,
      }, testInfo) => {
        test.skip(
          testInfo.project.name === 'mobile',
          'Desktop-only layout; mobile recap flows are tested in preferences.spec.ts.',
        );
        await page.setViewportSize(viewport);
        const { game, purchases } = fixture(kind);
        await loadAndComplete(page, game, purchases);
        const recap = page.getByTestId('turn-recap');
        const dialog = page.getByRole('dialog');
        await expect(recap.locator('.recap-purchase')).toHaveCount(3);
        if (kind === 'founding') await expect(recap.locator('.recap-founded')).toBeVisible();
        else
          await expect(recap.locator('.recap-events li')).toHaveCount(
            game.logs.filter(
              (entry) =>
                entry.turn === game.turn &&
                ['merger', 'shares', 'bonus', 'discard'].includes(entry.type),
            ).length,
          );
        for (const element of [
          recap.locator('.recap-coordinate'),
          recap.locator('.recap-board'),
          ...(await recap.locator('.recap-purchase').all()),
          recap.getByRole('button', { name: 'Continue', exact: true }),
        ]) {
          await expect(element).toBeInViewport({ ratio: 0.999 });
        }
        expect(
          await dialog.evaluate((element) => element.scrollHeight - element.clientHeight),
        ).toBeLessThanOrEqual(1);
        expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
        await page.screenshot({ path: testInfo.outputPath('desktop-recap.png') });
        await recap.getByRole('button', { name: 'Continue', exact: true }).click();
        await expect(recap).toHaveCount(0);
        await expect(page.locator('.privacy-panel')).toBeVisible();
      });
    }
  }
});
