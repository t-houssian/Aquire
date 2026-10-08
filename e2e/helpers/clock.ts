import type { Page } from '@playwright/test';

export const GAME_CLOCK_START = '2026-10-08T12:00:00Z';

// Opening racks, supplies and board geometry must not race computer turns on
// slower runners. Tests of timed gameplay advance this clock explicitly.
export async function freezeGameClock(page: Page) {
  const start = new Date(GAME_CLOCK_START);
  await page.clock.install({ time: new Date(start.getTime() - 1000) });
  await page.clock.pauseAt(start);
}
