import { expect, test, type Page } from '@playwright/test';
import { STORY_CHAPTERS, storyGameConfig } from '../src/game/campaign';
import { createGame, type GameState } from '../src/game/engine';
import { getMap, MAPS, SMALL_MAP_IDS } from '../src/game/maps';

async function openStory(page: Page) {
  await page.goto('/');
  await page.locator('.story-entry').click();
  await expect(page.getByRole('heading', { name: 'The Long Game.' })).toBeVisible();
}

test('story chapters are gated, introduce original rivals, and resume the same saved game', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('aquire.settings.v1', JSON.stringify({ sound: false, speed: 1400, houseRules: { startingCash: 99900, dividends: true } })));
  await openStory(page);
  await expect(page.locator('.story-chapter')).toHaveCount(12);
  await expect(page.getByRole('button', { name: /Challenge 2:/ })).toBeDisabled();
  for (const [width, height] of [[1440, 900], [393, 700], [844, 390], [320, 568]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 1440 || width === 393) await page.screenshot({ path: `artifacts/story/chapter-map-${info.project.name}-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Begin your story' }).click();
  const briefing = page.getByRole('dialog');
  await expect(briefing).toContainText('Penny Pinch');
  await expect(briefing.getByRole('img', { name: /Penny Pinch/ })).toBeVisible();
  await briefing.getByLabel('Your name').fill('Alex');
  await briefing.getByRole('button', { name: 'Play this challenge' }).click();
  await expect(page.locator('.board-card')).toHaveAttribute('data-map', 'duo-pocket-square');
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2')!)[0].game as GameState);
  expect(original.players).toHaveLength(2);
  expect(original.players[1].name).toBe('Penny Pinch');
  expect(original.players[1].characterId).toBe('cast-01');
  expect(original.houseRules!.startingCash).toBe(6000);
  expect(original.houseRules!.dividends).toBe(false);
  expect(original.botDifficulty).toBe('strategist');
  // Reload simulates returning later; the chapter card must use its existing snapshot.
  await openStory(page);
  await page.getByRole('button', { name: 'Continue your challenge' }).click();
  await page.getByRole('button', { name: 'Resume challenge', exact: true }).click();
  await expect(page.locator('.board-card')).toHaveAttribute('data-map', 'duo-pocket-square');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2')!)[0].game.id)).toBe(original.id);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2')!).length)).toBe(1);
});

function finishable(win: boolean) {
  const game = createGame(storyGameConfig('chapter-1', 'Alex', 884));
  const tiles = getMap(game.mapId).tiles;
  game.board = Object.fromEntries(tiles.slice(0, 21).map((tile) => [tile, 'worldwide']));
  game.players[0].hand = tiles.slice(21, 27); game.players[1].hand = tiles.slice(27, 33); game.bag = tiles.slice(33);
  game.currentPlayer = 0; game.phase = 'buy'; game.tilePlacedThisTurn = true;
  game.players[win ? 0 : 1].stocks.worldwide = 10; game.bank.worldwide = 15;
  return game;
}

for (const win of [true, false]) test(`story ${win ? 'victory opens the next chapter' : 'loss offers a retry and keeps the next chapter locked'}`, async ({ page }) => {
  const game = finishable(win);
  await page.addInitScript((game) => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: 'solo', updatedAt: new Date().toISOString() }]));
  }, game);
  await openStory(page);
  await page.getByRole('button', { name: 'Continue your challenge' }).click();
  await page.getByRole('button', { name: 'Resume challenge', exact: true }).click();
  await page.getByRole('button', { name: 'Declare the final turn' }).click();
  await page.getByRole('button', { name: /Skip buying/ }).click();
  await page.getByRole('button', { name: 'Reveal final scores' }).click();
  await expect(page.getByTestId('story-result')).toContainText(win ? 'A new door opens.' : 'The story is not over.');
  await page.getByRole('button', { name: win ? 'Continue your story' : 'Return to your chapter' }).click();
  const next = page.getByRole('button', { name: /Challenge 2:/ });
  if (win) await expect(next).toBeEnabled(); else await expect(next).toBeDisabled();
  await page.getByRole('button', { name: /Challenge 1:/ }).click();
  await expect(page.getByRole('button', { name: win ? 'Replay challenge' : 'Try this challenge again' })).toBeVisible();
});

test('the final invitation seats eleven distinct Strategists with faces', async ({ page }, info) => {
  const chapters = Object.fromEntries(STORY_CHAPTERS.slice(0, -1).map((chapter) => [chapter.id, { won: true, attempts: 1, best: 20000, lastGameId: chapter.id, lastOutcome: 'won' }]));
  await page.addInitScript((chapters) => localStorage.setItem('aquire.story.v1', JSON.stringify({ version: 1, chapters })), chapters);
  await openStory(page);
  await page.getByRole('button', { name: /Challenge 81:/ }).click();
  await expect(page.locator('.story-opponents article')).toHaveCount(11);
  await expect(page.locator('.story-opponents .character-avatar')).toHaveCount(11);
  if (info.project.name === 'chromium') await page.getByRole('dialog').screenshot({ path: 'artifacts/story/final-invitation.png' });
  await page.getByRole('button', { name: 'Play this challenge' }).click();
  await expect(page.locator('.board-card')).toHaveAttribute('data-map', 'goldspire-kingdom');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('aquire.games.v2')!)[0].game as GameState);
  expect(state.players.filter((player) => player.isBot)).toHaveLength(11);
  expect(new Set(state.players.filter((player) => player.isBot).map((player) => player.characterId)).size).toBe(11);
  expect(state.botDifficulty).toBe('strategist');
});

test('all thirty small maps preview, enforce seat limits, and support two-player free play', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  const setup = page.getByRole('dialog', { name: 'A new opportunity' });
  for (const map of MAPS.filter((map) => SMALL_MAP_IDS.has(map.id))) {
    await setup.getByLabel('City map').selectOption(map.id);
    await expect(setup.locator('.map-miniature .included')).toHaveCount(map.tiles.length);
    await expect(setup.getByRole('button', { name: `${map.maxPlayers} players`, exact: true })).toBeVisible();
    await expect(setup.getByRole('button', { name: `${map.maxPlayers + 1} players`, exact: true })).toHaveCount(0);
  }
  await setup.getByLabel('City map').selectOption('duo-jellybean');
  await expect(setup.locator('.cast-preview-item')).toHaveCount(1);
  await expect(setup.locator('.cast-preview-item .character-avatar')).toHaveCount(1);
  await setup.getByRole('button', { name: /Let’s build something/ }).click();
  await expect(page.locator('.board-card')).toHaveAttribute('data-map', 'duo-jellybean');
  for (const [width, height] of [[393, 700], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.board-card')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `artifacts/story/duel-${info.project.name}-${width}.png` });
  }
});

test('character turns keep their portrait, move, and Continue usable on phones and compact desktops', async ({ page }, info) => {
  const game = createGame(storyGameConfig('chapter-1', 'Alex', 56));
  game.currentPlayer = 1;
  await page.addInitScript((game) => {
    localStorage.setItem('aquire.games.v2', JSON.stringify([{ game, kind: 'solo', updatedAt: new Date().toISOString() }]));
    localStorage.setItem('aquire.settings.v1', JSON.stringify({ speed: 220, sound: false }));
  }, game);
  await openStory(page);
  await page.getByRole('button', { name: 'Continue your challenge' }).click();
  await page.getByRole('button', { name: 'Resume challenge', exact: true }).click();
  const recap = page.getByTestId('turn-recap');
  await expect(recap).toBeVisible();
  await expect(recap.getByRole('img', { name: /Penny Pinch/ })).toBeVisible();
  for (const [width, height] of [[1366, 650], [393, 700], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await recap.getByRole('button', { name: 'Continue', exact: true }).scrollIntoViewIfNeeded();
    await expect(recap.getByRole('button', { name: 'Continue', exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 1366) await page.getByRole('dialog').screenshot({ path: `artifacts/story/rival-recap-${info.project.name}.png` });
  }
  await recap.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(recap).toHaveCount(0);
});

test('later chapters explain fixed settings and royal rewards stay locked until the final victory', async ({ page }) => {
  const progress = Object.fromEntries(STORY_CHAPTERS.slice(0, 12).map((challenge) => [challenge.id, { won: true, attempts: 1, best: 20000, lastGameId: challenge.id, lastOutcome: 'won' }]));
  await page.addInitScript((chapters) => localStorage.setItem('aquire.story.v1', JSON.stringify({ version: 1, chapters })), progress);
  await openStory(page);
  await expect(page.locator('.story-book-tabs button')).toHaveCount(7);
  await expect(page.locator('.story-chapter')).toHaveCount(13);
  await page.getByRole('button', { name: /Challenge 13:/ }).click();
  const rules = page.getByRole('region', { name: 'Challenge rules' });
  await expect(rules).toContainText('Hotel roster and certificates');
  await expect(rules).toContainText('Opening and cash');
  await expect(rules).toContainText('Construction and demolition');
  await expect(rules).toContainText('Buying and selling');
  await expect(rules).toContainText('Market prices');
  await expect(rules).toContainText('Dividends');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goto('/');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  await expect(page.getByLabel('City map').locator('option[value="goldspire-kingdom"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.evaluate((ids) => {
    const chapters = Object.fromEntries(ids.map((id) => [id, { won: true, attempts: 1, best: 20000, lastGameId: id, lastOutcome: 'won' }]));
    localStorage.setItem('aquire.story.v1', JSON.stringify({ version: 1, chapters }));
  }, STORY_CHAPTERS.map((challenge) => challenge.id));
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  await expect(page.getByLabel('City map').locator('option[value="goldspire-kingdom"]')).toHaveCount(1);
});

test('a custom face and name survive reload and join new games', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customize your character' }).click();
  const editor = page.getByRole('dialog', { name: 'Meet your next tycoon.' });
  await editor.getByLabel('Your name').fill('Madame Pickle');
  await editor.getByRole('combobox', { name: 'accessory', exact: true }).selectOption('3');
  await editor.getByRole('combobox', { name: 'Royal title' }).selectOption('Queen');
  await editor.getByRole('button', { name: 'Save my character' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Customize your character' }).getByRole('img')).toHaveAttribute('aria-label', 'Madame Pickle, custom face');
  await page.getByRole('button', { name: /Let’s play/ }).first().click();
  await expect(page.getByLabel('Your name')).toHaveValue('Madame Pickle');
  await page.getByRole('button', { name: /Let’s build something/ }).click();
  await expect(page.locator('.player-chip').first().getByRole('img')).toHaveAttribute('aria-label', 'Madame Pickle, custom face');
  const result = await page.evaluate(() => ({ profile: JSON.parse(localStorage.getItem('aquire.profile.v1')!), game: JSON.parse(localStorage.getItem('aquire.games.v2')!)[0].game }));
  expect(result.profile.avatar).toHaveLength(16); expect(result.game.players[0].avatar).toBe(result.profile.avatar);
});

test('expanded wardrobe stays usable across phone sizes and free choices persist', async ({page}, info) => {
  await page.goto('/');await page.getByRole('button',{name:'Customize your character'}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('combobox')).toHaveCount(15);
  await dialog.getByLabel('Your name',{exact:true}).fill('WWWWWWWWWWWWWWWWWWWWWWWW');
  await dialog.getByRole('combobox',{name:'skin',exact:true}).selectOption('8');
  await dialog.getByRole('combobox',{name:'hair',exact:true}).selectOption('15');
  await dialog.getByRole('combobox',{name:'cut',exact:true}).selectOption('10');
  await dialog.getByRole('combobox',{name:'facialHair',exact:true}).selectOption('5');
  await dialog.getByRole('combobox',{name:'outfit',exact:true}).selectOption('5');
  await dialog.getByRole('combobox',{name:'earrings',exact:true}).selectOption('4');
  await dialog.getByLabel('Country · optional').selectOption('GB');
  await expect(dialog.getByRole('combobox',{name:'accessory',exact:true}).locator('option[value="19"]')).toHaveAttribute('disabled', '');
  for(const [width,height] of [[393,700],[844,320],[320,568],[1440,900]]){
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(await dialog.evaluate((el)=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    if(width===393)await page.screenshot({path:`artifacts/social/profile-${info.project.name}.png`});
  }
  await dialog.getByRole('button',{name:'Win rewards',exact:true}).click();
  await expect(dialog.locator('.wardrobe-reward')).toHaveCount(20);await expect(dialog.locator('.wardrobe-reward:enabled')).toHaveCount(0);
  await dialog.getByRole('button',{name:'Your character',exact:true}).click();await dialog.getByRole('button',{name:'Save my character'}).click();
  const profile=await page.evaluate(()=>JSON.parse(localStorage.getItem('aquire.profile.v1')!));
  expect(profile.avatar).toHaveLength(16);expect(profile.country).toBe('GB');
});

test('five unique story wins earn the helmet and skyline without a guest account', async ({page}) => {
  await page.addInitScript((ids)=>localStorage.setItem('aquire.story.v1',JSON.stringify({version:1,chapters:Object.fromEntries(ids.map((id)=>[id,{won:true,attempts:4,best:20000,lastGameId:id,lastOutcome:'won'}]))})),STORY_CHAPTERS.slice(0,5).map((c)=>c.id));
  await page.goto('/');await page.getByRole('button',{name:'Customize your character'}).click();
  await page.getByRole('button',{name:'Win rewards',exact:true}).click();
  await expect(page.getByText('5 story challenges won',{exact:true})).toBeVisible();
  const helmet=page.getByRole('button',{name:/Space investor helmet Earned/});await expect(helmet).toBeEnabled();
  await expect(page.getByRole('button',{name:/Dragon horns 5\/12/})).toBeDisabled();await helmet.click();
  await expect(page.getByRole('combobox',{name:'accessory',exact:true})).toHaveValue('16');
  await page.getByRole('button',{name:'Save my character'}).click();
  expect(await page.evaluate(()=>localStorage.getItem('aquire.online.auth'))).toBeNull();
});
