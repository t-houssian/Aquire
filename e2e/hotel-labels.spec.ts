import { expect, test, type Page } from '@playwright/test';
import { applyAction, CHAINS, chooseBotAction, createGame, getAvailableChains, getCurrentActor, getLegalTiles, getMap, type GameState } from '../src/game/engine';
import type { MapId } from '../src/game/types';
import { readable } from './helpers/contrast';

test.use({ reducedMotion: 'reduce' });

function roster(mapId: MapId) {
  const map = getMap(mapId);
  for (let seed = 1; seed <= 30; seed++) {
    const game = createGame({ id: `hotel-labels-${mapId}`, seed, mapId,
      houseRules: { hotelChains: CHAINS.map(chain => chain.id) },
      players: ['Alex', 'Ellis', 'Margot'].map((name, i) => ({ id: `p${i}`, name })) });
    const reserved = new Set<number>();
    const reserve = (index: number) => {
      reserved.add(index); reserved.add(index - map.columns); reserved.add(index + map.columns);
      if (index % map.columns) reserved.add(index - 1);
      if (index % map.columns < map.columns - 1) reserved.add(index + 1);
    };
    map.gridTiles.forEach((tile, i) => { if (game.board[tile]) reserve(i); });
    let placed = 0;
    for (const chain of CHAINS) {
      const index = map.gridTiles.findIndex((tile, i) => i % map.columns < map.columns - 1 &&
        !reserved.has(i) && !reserved.has(i + 1) && game.bag.includes(tile) && game.bag.includes(map.gridTiles[i + 1]));
      if (index < 0) break;
      for (const i of [index, index + 1]) { game.board[map.gridTiles[i]] = chain.id; reserve(i); }
      game.bag = game.bag.filter(tile => !game.board[tile]);
      placed++;
    }
    if (placed === CHAINS.length) return game;
  }
  throw new Error(`Could not fit the hotel roster on ${mapId}.`);
}

function founding() {
  let game = createGame({ id: 'hotel-name-founding', seed: 1,
    players: ['Alex', 'Ellis', 'Margot'].map((name, i) => ({ id: `p${i}`, name })) });
  for (let step = 0; step < 700 && game.phase !== 'ended'; step++) {
    if (game.phase === 'found') return game;
    game = applyAction(game, chooseBotAction(game));
  }
  throw new Error('The seeded game did not reach a founding decision.');
}

async function resume(page: Page, game: GameState) {
  await page.addInitScript(game => {
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false }));
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: 'local', updatedAt: new Date().toISOString() }]));
  }, game);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
  await page.locator('.saved-game-main').click();
  await page.getByRole('button', { name: new RegExp(`I’m ${getCurrentActor(game).name}`) }).click();
}

async function identified(page: Page, game: GameState) {
  await expect(page.locator('.hotel-nameplate-slot')).toHaveCount(CHAINS.length);
  for (const chain of CHAINS) {
    const marker = page.locator(`.hotel-nameplate-slot[data-chain="${chain.id}"]`);
    const tiles = (await marker.getAttribute('data-tiles'))!.split(' ');
    expect(tiles).toHaveLength(2);
    for (const tile of tiles) {
      expect(game.board[tile]).toBe(chain.id);
      const cell = page.locator(`.board-tile[data-tile="${tile}"]`);
      await expect(cell.locator('.tile-initial')).toBeVisible();
      await expect(cell.locator('.tile-initial')).toHaveText(chain.name[0]);
      await expect(cell.locator('.tile-coordinate')).toHaveText(tile);
    }
    await expect(page.getByRole('list', { name: 'Hotel chains on this board' }).getByRole('listitem').filter({ hasText: chain.name })).toHaveCount(1);
  }
  await page.evaluate(() => document.fonts.ready);
  const clipped = await page.locator('.hotel-nameplate').evaluateAll(plates => plates.flatMap(plate => {
    const text = [...plate.children].find(el => getComputedStyle(el).display !== 'none')!;
    const range = document.createRange(); range.selectNodeContents(text);
    const name = range.getBoundingClientRect(), box = plate.getBoundingClientRect();
    return name.left < box.left - 1 || name.right > box.right + 1 || name.top < box.top - 1 || name.bottom > box.bottom + 1 ? [text.textContent] : [];
  }));
  expect(clipped, 'Hotel names and certificates must fit their physical marker').toEqual([]);
}

for (const mapId of ['classic', 'max-metropolis'] as const) {
  test(`${mapId}: all twelve hotels stay identifiable in 3D, flat, rotated and zoomed views`, async ({ page }) => {
    const game = roster(mapId);
    await resume(page, game);
    await expect(page.locator('.city-rendered canvas')).toBeVisible();
    await identified(page, game);
    await readable(page, page.locator('.board-card'));
    await page.getByRole('button', { name: 'Rotate board', exact: true }).click();
    await identified(page, game);
    await page.getByRole('button', { name: 'Switch to flat board' }).click();
    await identified(page, game);
    await page.getByRole('button', { name: 'Rotate board', exact: true }).click();
    await identified(page, game);
    await page.getByRole('button', { name: 'Enlarge board tiles', exact: true }).click();
    await identified(page, game);
    const key = page.getByRole('list', { name: 'Hotel chains on this board' });
    await key.getByRole('listitem').filter({ hasText: 'Goldspire' }).scrollIntoViewIfNeeded();
    await expect(key.getByRole('listitem').filter({ hasText: 'Goldspire' })).toBeInViewport();
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2')!)[0].game);
    expect(await saved()).toEqual(game);
    const tile = getLegalTiles(game)[0];
    await page.locator(`.board-tile[data-tile="${tile}"]`).click();
    await page.getByRole('button', { name: `Place ${tile}`, exact: true }).click();
    await expect.poll(saved).toEqual(applyAction(game, { type: 'place', tile }));
  });
}

test('founding a hotel adds its name marker and a letter to every chain tile', async ({ page }) => {
  const game = founding(), chain = CHAINS.find(chain => chain.id === getAvailableChains(game)[0])!;
  await resume(page, game);
  await page.locator('.chain-choices').getByRole('button', { name: new RegExp(chain.name) }).click();
  const board = page.getByRole('group', { name: 'Game view' }).getByRole('button', { name: 'Board', exact: true });
  if (await board.isVisible()) await board.click();
  await expect(page.locator(`.hotel-nameplate-slot[data-chain="${chain.id}"] .hotel-name-full`)).toBeVisible();
  const expected = applyAction(game, { type: 'found', chain: chain.id });
  for (const tile of Object.keys(expected.board).filter(tile => expected.board[tile] === chain.id)) {
    await expect(page.locator(`.board-tile[data-tile="${tile}"] .tile-initial`)).toBeVisible();
  }
  await expect(page.getByRole('list', { name: 'Hotel chains on this board' })).toContainText(chain.name);
});
