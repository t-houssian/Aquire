import { test, expect } from '@playwright/test';
import { MAPS, CREATIVE_MAP_IDS } from '../src/game/maps';
import { applyAction, chooseBotAction, createGame } from '../src/game/engine';

test('new table choices apply a variant map, strategic computers, and private holdings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'A new opportunity' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Hide opponents’ holdings after moves')).toBeChecked();
  await dialog.getByLabel('City map').selectOption('courtyard');
  await dialog.getByLabel('Computer difficulty').selectOption('strategist');
  await dialog.getByRole('button', { name: /Let’s build something/ }).click();
  await expect(page.getByRole('heading', { name: 'The boardroom.' })).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
  expect(state.mapId).toBe('courtyard');
  expect(state.botDifficulty).toBe('strategist');
  expect(Object.keys(state.board).length + state.bag.length + state.players.reduce((sum: number, p: { hand: string[] }) => sum + p.hand.length, 0)).toBe(102);
  await expect(page.locator('.board-tile.map-void')).toHaveCount(6);
  await expect(page.locator('.tiles-count')).toContainText('Rack 6');
  await expect(page.locator('.tiles-count')).toContainText('/ 102');
});

test('five new shapes preview their own palettes and place the correct tiles on the live board', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'A new opportunity' });
  const choices = [
    ['hourglass', 84], ['crossroads', 80], ['switchback', 84], ['atoll', 86], ['four-spires', 80],
  ] as const;
  const accents = new Set<string>();
  for (const [id, count] of choices) {
    await dialog.getByLabel('City map').selectOption(id);
    await expect(dialog.locator('.map-miniature .included')).toHaveCount(count);
    await expect(dialog.locator('.map-miniature .excluded')).toHaveCount(108 - count);
    accents.add(await dialog.locator('.map-choice-preview').evaluate((element) => getComputedStyle(element).getPropertyValue('--map-accent').trim()));
    if (process.env.AQUIRE_CAPTURE_MAPS === '1' && id === 'atoll') {
      await dialog.locator('.map-choice-preview').scrollIntoViewIfNeeded();
      await dialog.screenshot({ path: 'artifacts/map-atoll-setup-20260928.png' });
    }
  }
  expect(accents.size).toBe(choices.length);
  await dialog.getByRole('button', { name: /Let’s build something/ }).click();
  const board = page.locator('.board-card');
  await expect(board).toHaveAttribute('data-map', 'four-spires');
  await expect(board.locator('.board-tile.map-void')).toHaveCount(28);
  await expect(board.locator('.tiles-count')).toContainText('/ 80');
  const contrast = await board.locator('.game-board').evaluate((element) => {
    const sample = (color: string) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).reduce((sum, value) => sum + value, 0);
    };
    const tile = element.querySelector('.board-tile:not(.map-void)')!;
    return { board: sample(getComputedStyle(element).backgroundColor), tile: sample(getComputedStyle(tile).backgroundColor), gap: getComputedStyle(element).gap };
  });
  expect(contrast.tile).toBeGreaterThan(contrast.board);
  expect(contrast.gap).toBe('1px');
  if (process.env.AQUIRE_CAPTURE_MAPS === '1') {
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'artifacts/map-four-spires-board-20260928.png', fullPage: true });
  }
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
  expect(Object.keys(state.board).length + state.bag.length + state.players.reduce((sum: number, player: { hand: string[] }) => sum + player.hand.length, 0)).toBe(80);
});

test('large map tiers expose 8, 10 and 12 seats and render the full max city', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aquire.settings.v1', JSON.stringify({ speed: 1400, hints: true })));
  await page.goto('/');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'A new opportunity' });
  await dialog.getByLabel('City map').selectOption('big-rectangle');
  await expect(dialog.getByRole('button', { name: '8 players' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '9 players' })).toHaveCount(0);
  await expect(dialog.locator('.map-miniature .included')).toHaveCount(192);
  await dialog.getByLabel('City map').selectOption('mega-diamond');
  await expect(dialog.getByRole('button', { name: '10 players' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '11 players' })).toHaveCount(0);
  await expect(dialog.locator('.map-miniature .included')).toHaveCount(240);
  await dialog.getByLabel('City map').selectOption('max-metropolis');
  await dialog.getByRole('button', { name: '12 players' }).click();
  await expect(dialog.locator('.map-miniature .included')).toHaveCount(384);
  await expect(dialog).toContainText('111-hotel end target');
  await dialog.getByRole('button', { name: /Let’s build something/ }).click();
  const board = page.locator('.board-card');
  await expect(board).toHaveAttribute('data-map', 'max-metropolis');
  await expect(board.locator('.board-tile')).toHaveCount(384);
  await expect(board.locator('.board-tile[aria-label^="24P"]')).toHaveCount(1);
  const investorColors = await page.locator('.players-bar .avatar').evaluateAll((avatars) => avatars.map((avatar) => getComputedStyle(avatar).backgroundColor));
  expect(new Set(investorColors).size).toBe(12);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2') || '[]')[0].game);
  expect(state.players).toHaveLength(12);
  expect(state.players.every((player: { hand: string[] }) => player.hand.length === 6)).toBe(true);
  expect(Object.keys(state.board).length + state.bag.length + state.players.reduce((sum: number, player: { hand: string[] }) => sum + player.hand.length, 0)).toBe(384);
  if ((page.viewportSize()?.width ?? 1000) < 430) {
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector('.board-stage') as HTMLElement;
      return { pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, boardWidth: stage.scrollWidth, frameWidth: stage.clientWidth };
    });
    expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.boardWidth).toBeLessThanOrEqual(geometry.frameWidth + 1);
    await expect(page.getByRole('button', { name: 'Enlarge board tiles' })).toBeVisible();
  }
  if (process.env.AQUIRE_CAPTURE_MAPS === '1') {
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'artifacts/max-metropolis-board.png', fullPage: true });
  }
});

test('eight new six-seat shapes preview unique dimensions and a tall map plays without page overflow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'A new opportunity' });
  const choices = [
    ['twin-docks', 108, '20 by 7'], ['obelisk', 139, '11 by 17'],
    ['coral-crown', 136, '14 by 12'], ['lightning-run', 118, '18 by 9'],
    ['compass-rose', 127, '15 by 13'], ['pinwheel', 136, '15 by 14'],
    ['starfall-x', 115, '17 by 11'], ['twin-lagoons', 144, '16 by 12'],
  ] as const;
  const accents = new Set<string>();
  for (const [id, tiles, dimensions] of choices) {
    await dialog.getByLabel('City map').selectOption(id);
    await expect(dialog.locator('.map-miniature .included')).toHaveCount(tiles);
    await expect(dialog.locator('.map-miniature')).toHaveAttribute('aria-label', new RegExp(dimensions));
    accents.add(await dialog.locator('.map-choice-preview').evaluate((element) => getComputedStyle(element).getPropertyValue('--map-accent').trim()));
  }
  expect(accents.size).toBe(8);
  await dialog.getByLabel('City map').selectOption('obelisk');
  await dialog.getByRole('button', { name: /Let’s build something/ }).click();
  const board = page.locator('.board-card');
  await expect(board).toHaveClass(/expansion-board/);
  await expect(board.locator('.board-tile')).toHaveCount(187);
  await expect(board.locator('.board-tile.map-void')).toHaveCount(48);
  await expect(board.locator('.board-columns span')).toHaveCount(11);
  await expect(board.locator('.board-rows span')).toHaveCount(17);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('tall MacBook board stays centered, close-set, and keeps chain initials inside their tiles', async ({ page }) => {
  await page.setViewportSize({ width: 1914, height: 934 });
  const state = createGame({ id: 'board-polish-fixture', seed: 841, mapId: 'obelisk',
    players: ['Alex', 'Ellis', 'Morgan'].map((name, index) => ({ id: `p${index}`, name })) });
  state.board = { '1K': 'tower', '2K': 'tower', '8L': 'continental', '9L': 'continental' };
  await page.addInitScript((game) => localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: 'local', updatedAt: new Date().toISOString() }])), state);
  await page.goto('/');
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').click();
  await page.locator('.privacy-panel').getByRole('button').click();
  const geometry = await page.locator('.board-card').evaluate((card) => {
    const stage = card.querySelector('.board-stage')!.getBoundingClientRect();
    const wrap = card.querySelector('.board-wrap')!.getBoundingClientRect();
    const tile = card.querySelector('.board-tile[aria-label^="1K"]')!.getBoundingClientRect();
    const initial = card.querySelector('.board-tile[aria-label^="1K"] .tile-initial')!.getBoundingClientRect();
    const board = card.querySelector('.game-board')!;
    return { centerOffset: Math.abs((stage.left + stage.width / 2) - (wrap.left + wrap.width / 2)),
      boardWidth: wrap.width, gap: getComputedStyle(board).gap,
      letterFits: initial.left >= tile.left && initial.right <= tile.right && initial.top >= tile.top && initial.bottom <= tile.bottom,
      scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
  });
  expect(geometry.centerOffset).toBeLessThan(2);
  expect(geometry.boardWidth).toBeGreaterThan(390);
  expect(geometry.gap).toBe('1px');
  expect(geometry.letterFits).toBe(true);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  await expect(page.locator('.board-tile[aria-label^="1K"] .tile-initial')).toHaveText('T');
  await expect(page.locator('.board-tile[aria-label^="8L"] .tile-initial')).toHaveText('C');
  if (process.env.AQUIRE_CAPTURE_MAPS === '1') await page.screenshot({ path: 'artifacts/obelisk-board-polish.png', fullPage: true });
});

test('six new large-city shapes include a playable 30th column and 23rd row', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'A new opportunity' });
  for (const [id, tiles] of [
    ['big-aurora-gate', 185], ['big-trident-towers', 206],
    ['mega-triple-arch', 255], ['mega-citadel-grid', 262],
    ['max-celestial-ring', 366], ['max-orion-star', 409],
  ] as const) {
    await dialog.getByLabel('City map').selectOption(id);
    await expect(dialog.locator('.map-miniature .included')).toHaveCount(tiles);
  }
  await dialog.getByLabel('City map').selectOption('max-celestial-ring');
  await dialog.getByRole('button', { name: /Let’s build something/ }).click();
  const board = page.locator('.board-card');
  await expect(board.locator('.board-tile')).toHaveCount(510);
  await expect(board.locator('.board-tile[aria-label^="30I"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a tile on the far edge of a max map can be played', async ({ page }) => {
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Investor ${i + 1}`, isBot: i > 0 }));
  let seed = 1;
  let game = createGame({ players, mapId: 'max-metropolis', seed });
  while (!game.bag.includes('24P')) game = createGame({ players, mapId: 'max-metropolis', seed: ++seed });
  game.currentPlayer = 0;
  const bagIndex = game.bag.indexOf('24P');
  const oldTile = game.players[0].hand[0];
  game.players[0].hand[0] = '24P';
  game.bag[bagIndex] = oldTile;
  await page.addInitScript((state) => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game: state, kind: 'solo', updatedAt: new Date().toISOString() }]));
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false, speed: 1400, hints: false }));
  }, game);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').first().click();
  await expect(page.locator('.tile-rack')).toContainText('24P');
  await page.locator('.tile-rack button').filter({ hasText: '24P' }).click();
  await expect(page.getByRole('button', { name: 'Place 24P', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Place 24P', exact: true }).click();
  await expect(page.locator('.board-tile[aria-label^="24P"]')).toHaveClass(/occupied/);
});

test('a tile beyond the old 24-column limit can be played on the celestial ring', async ({ page }) => {
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Investor ${i + 1}`, isBot: i > 0 }));
  let seed = 1;
  let game = createGame({ players, mapId: 'max-celestial-ring', seed });
  while (!game.bag.includes('30I')) game = createGame({ players, mapId: 'max-celestial-ring', seed: ++seed });
  game.currentPlayer = 0;
  const bagIndex = game.bag.indexOf('30I');
  const oldTile = game.players[0].hand[0];
  game.players[0].hand[0] = '30I';
  game.bag[bagIndex] = oldTile;
  await page.addInitScript((state) => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game: state, kind: 'solo', updatedAt: new Date().toISOString() }]));
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false, speed: 1400, hints: false }));
  }, game);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').first().click();
  await page.locator('.tile-rack button').filter({ hasText: '30I' }).click();
  await page.getByRole('button', { name: 'Place 30I', exact: true }).click();
  await expect(page.locator('.board-tile[aria-label^="30I"]')).toHaveClass(/occupied/);
});

test('completed saves become compact match history with final sell-offs and trophies', async ({ page }) => {
  let state = createGame({ id: 'archive-fixture', seed: 491, players: ['Avery', 'Ellis', 'Morgan'].map((name, index) => ({ id: `p${index}`, name, isBot: index > 0 })) });
  for (let i = 0; state.phase !== 'ended' && i < 900; i++) state = applyAction(state, chooseBotAction(state));
  expect(state.phase).toBe('ended');
  await page.addInitScript((game) => localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: 'solo', updatedAt: new Date().toISOString() }])), state);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await expect(page.locator('.match-history-card')).toHaveCount(1);
  await expect(page.locator('.history-leaderboard')).toContainText('Avery');
  await expect(page.locator('.history-trophies')).toContainText('Avery');
  const compact = await page.evaluate(() => ({ active: localStorage.getItem('aquire.games.v2'), archive: localStorage.getItem('aquire.matches.v1') }));
  expect(compact.active).toBe('[]');
  expect(compact.archive).not.toContain('"bag"');
  expect(compact.archive).not.toContain('"hand"');
  await page.locator('.match-history-card').click();
  const archived = JSON.parse(compact.archive ?? '[]')[0];
  expect(archived.boardSnapshot).toHaveLength(108);
  if ((page.viewportSize()?.width ?? 1000) > 950) await expect(page.locator('.final-board-panel')).toBeVisible();
  else {
    await page.getByRole('button', { name: 'See the board' }).click();
    await expect(page.locator('.final-board-panel')).toBeVisible();
    await page.getByRole('button', { name: 'See the payouts' }).click();
  }
  if (process.env.AQUIRE_CAPTURE_FINALE === '1') {
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'artifacts/finale-settlement-20260928.png', fullPage: true });
  }
  for (const settlement of state.finalSettlements!) {
    await expect(page.locator('.settlement-card')).toContainText(settlement.players[0].name);
    await page.getByRole('button', { name: /Next hotel chain|Reveal final scores/ }).click();
  }
  await expect(page.locator('.final-standings-list > div')).toHaveCount(3);
  await expect(page.locator('.trophy-player')).toHaveCount(3);
  if (process.env.AQUIRE_CAPTURE_FINALE === '1') {
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'artifacts/finale-winner-20260928.png', fullPage: true });
  }
  await page.getByRole('button', { name: 'Replay the sell-offs' }).click();
  await expect(page.locator('.settlement-card')).toBeVisible();
});


test('all sixteen creative city previews expose their shapes, themes and seat limits', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'A new opportunity' });
  const cities = dialog.getByLabel('City map');
  await expect(cities.locator('option')).toHaveCount(80);
  const accents = new Set<string>();
  for (const map of MAPS.filter((map) => CREATIVE_MAP_IDS.has(map.id))) {
    await cities.selectOption(map.id);
    await expect(dialog.locator('.map-miniature .included')).toHaveCount(map.tiles.length);
    await expect(dialog.locator('.map-miniature .excluded')).toHaveCount(map.gridTiles.length - map.tiles.length);
    await expect(dialog.locator('.map-miniature')).toHaveAccessibleName(new RegExp(`${map.columns} by ${map.rows}.*up to ${map.maxPlayers} players`));
    await expect(dialog.getByRole('button', { name: `${map.maxPlayers} players`, exact: true })).toBeVisible();
    accents.add(await dialog.locator('.map-choice-preview').evaluate((element) => getComputedStyle(element).getPropertyValue('--map-accent').trim()));
  }
  expect(accents.size).toBe(16);
});
