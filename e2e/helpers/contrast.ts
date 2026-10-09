import { expect, type Locator, type Page } from '@playwright/test';
import axe from 'axe-core';
import { createRequire } from 'node:module';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** Inspect actual rendered text at every scroll position, including below the fold. */
export async function readable(page: Page, scope: Locator) {
  await expect(scope).toBeVisible();
  await page.addScriptTag({ path: axePath });
  const scan = async () => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    });
    const violations = await scope.evaluate(async element => {
      const result = await (window as unknown as { axe: typeof axe }).axe.run(element, { runOnly: ['color-contrast'] });
      return result.violations.flatMap(v => v.nodes.map(n => ({ target: n.target, reason: n.failureSummary })));
    });
    expect(violations, 'Readable text must meet AA contrast against its rendered background').toEqual([]);
  };
  await scan();
  const root = await scope.elementHandle();
  const containers = page.locator('main, .modal, .modal-body, .stock-list, .market-panel, .finale');
  for (const container of await containers.all()) {
    if (!await container.isVisible()) continue;
    if (!await container.evaluate((element, root) => root && (root.contains(element) || element.contains(root)), root)) continue;
    const range = await container.evaluate(element => {
      const style = getComputedStyle(element);
      return /auto|scroll/.test(style.overflowY) ? element.scrollHeight - element.clientHeight : 0;
    });
    if (range < 1) continue;
    const height = await container.evaluate(element => element.clientHeight);
    for (let top = Math.min(range, height * .75); ; top = Math.min(range, top + height * .75)) {
      await container.evaluate((element, position) => { element.scrollTop = position; }, top);
      await scan();
      if (top >= range) break;
    }
    await container.evaluate(element => { element.scrollTop = 0; });
  }
}
