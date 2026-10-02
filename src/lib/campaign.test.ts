import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORY_CHAPTERS, STORY_BOOKS, storyRuleBriefing, storyGameConfig } from '../game/campaign';
import { CHARACTERS, pickCharacters } from '../game/characters';
import { applyAction, chooseBotAction, createGame, getHouseRules, validateHouseRules } from '../game/engine';
import { getMap, MAPS } from '../game/maps';
import { kingdomUnlocked, emptyStoryProgress, readStoryProgress, recordStoryResult, storyChapterUnlocked } from './campaign';
import { readGames, readMatches, saveGame } from './storage';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());

function completed(outcome: 'win' | 'tie' | 'loss', chapter = 'chapter-1', seed = 17) {
  const game = createGame(storyGameConfig(chapter, 'Alex', seed));
  game.phase = 'ended';
  const human = game.campaign!.playerId;
  game.results = game.players.map((player) => ({
    playerId: player.id, name: player.name, cashBefore: 6000, stocksValue: 0, bonuses: 0,
    total: outcome === 'tie' ? 7000 : player.id === human ? (outcome === 'win' ? 8000 : 6000) : 7000,
    rank: outcome === 'tie' || (player.id === human) === (outcome === 'win') ? 1 : 2,
  }));
  game.winnerIds = game.results.filter((entry) => entry.rank === 1).map((entry) => entry.playerId);
  return game;
}

describe('The Long Game', () => {
  it('uses all maps and 399 different rivals and grows from a tiny duel to eleven Strategists on the biggest city', () => {
    expect(STORY_CHAPTERS).toHaveLength(81);
    expect(STORY_BOOKS).toHaveLength(7);
    expect(STORY_CHAPTERS.filter((chapter) => chapter.chapter === 1)).toHaveLength(12);
    expect(new Set(STORY_CHAPTERS.map((chapter) => chapter.mapId))).toEqual(new Set(MAPS.map((map) => map.id)));
    const cast = STORY_CHAPTERS.flatMap((chapter) => chapter.opponents);
    expect(cast).toHaveLength(399); expect(new Set(cast).size).toBe(399);
    expect(new Set(CHARACTERS.map((character) => character.name)).size).toBe(399);
    expect(new Set(CHARACTERS.map((character) => character.portrait)).size).toBe(399);
    expect(STORY_CHAPTERS[0].players).toBe(2);
    expect(STORY_CHAPTERS.at(-1)!.mapId).toBe('goldspire-kingdom');
    expect(STORY_CHAPTERS.at(-1)!.opponents).toHaveLength(11);
    for (const chapter of STORY_CHAPTERS) {
      const game = createGame(storyGameConfig(chapter.id, '  Alex  ', 43));
      expect(game.players).toHaveLength(chapter.players);
      expect(game.botDifficulty).toBe('strategist');
      expect(game.players.filter((player) => player.isBot).map((player) => player.characterId)).toEqual(chapter.opponents);
      expect(game.players[0].name).toBe(chapter.mapId === 'goldspire-kingdom' ? 'King Alex' : 'Alex');
      expect(getHouseRules(game)).toEqual(validateHouseRules(chapter.houseRules));
      expect(storyRuleBriefing(chapter)).toHaveLength(9);
    }
    for (const seed of [0, 1, 56, 4294967295]) expect(new Set(pickCharacters(11, seed).map((character) => character.id)).size).toBe(11);
  });
  it('requires an outright win, unlocks just the next chapter, and retains earlier victories on replay', () => {
    expect(storyChapterUnlocked(emptyStoryProgress(), 'chapter-1')).toBe(true);
    expect(storyChapterUnlocked(emptyStoryProgress(), 'chapter-2')).toBe(false);
    for (const outcome of ['loss', 'tie'] as const) {
      const progress = recordStoryResult(completed(outcome, 'chapter-1', outcome === 'loss' ? 1 : 2));
      expect(storyChapterUnlocked(progress, 'chapter-2')).toBe(false);
    }
    const win = completed('win');
    saveGame(win, 'solo');
    expect(readGames()).toHaveLength(0);
    expect(readMatches()[0].campaign).toEqual(win.campaign);
    let progress = readStoryProgress();
    expect(progress.chapters['chapter-1'].attempts).toBe(3);
    expect(storyChapterUnlocked(progress, 'chapter-2')).toBe(true);
    expect(storyChapterUnlocked(progress, 'chapter-3')).toBe(false);
    saveGame(win, 'solo');
    expect(readStoryProgress().chapters['chapter-1'].attempts).toBe(3);
    progress = recordStoryResult(completed('loss', 'chapter-1', 99));
    expect(progress.chapters['chapter-1']).toMatchObject({ won: true, attempts: 4, best: 8000, lastOutcome: 'lost' });
    expect(storyChapterUnlocked(progress, 'chapter-2')).toBe(true);
  });
  it('keeps a running chapter resumable and records its result before compacting an ended save', () => {
    const game = createGame(storyGameConfig('chapter-1', 'Alex', 84));
    saveGame(game, 'solo');
    expect(readGames()[0].game).toEqual(game);
    expect(readStoryProgress()).toEqual(emptyStoryProgress());
    const win = completed('win');
    memory.set('aquire.games.v2', JSON.stringify([{ game: win, kind: 'solo', updatedAt: new Date().toISOString() }]));
    expect(readGames()).toHaveLength(0);
    expect(readStoryProgress().chapters['chapter-1'].won).toBe(true);
  });
  it('does not award progress to unfinished, altered, ordinary, or locked games', () => {
    const base = completed('win');
    const variants = [
      { ...base, phase: 'place' as const }, { ...base, campaign: undefined },
      { ...base, botDifficulty: 'casual' as const }, { ...base, mapId: 'classic' as const },
      { ...base, houseRules: { ...base.houseRules!, startingCash: 100000 } },
      { ...base, players: base.players.map((player) => ({ ...player, characterId: undefined })) },
      completed('win', 'chapter-12'),
    ];
    for (const game of variants) expect(recordStoryResult(game)).toEqual(emptyStoryProgress());
    memory.set('aquire.story.v1', 'not json');
    expect(readStoryProgress()).toEqual(emptyStoryProgress());
  });
  it('unlocks royal rewards only after every challenge, including the kingdom, is won', () => {
    expect(kingdomUnlocked()).toBe(false);
    for (const chapter of STORY_CHAPTERS) {
      expect(kingdomUnlocked()).toBe(false);
      recordStoryResult(completed('win', chapter.id, chapter.number));
    }
    expect(kingdomUnlocked()).toBe(true);
    expect(pickCharacters(399, 2)).toHaveLength(388);
    expect(pickCharacters(399, 2, true).filter((character) => character.royal)).toHaveLength(11);
  });
  it('finishes every chapter with its actual cast and conserves all tiles and shares', () => {
    for (const chapter of STORY_CHAPTERS) {
      let game = createGame(storyGameConfig(chapter.id, 'Alex', 203));
      let steps = 0;
      while (game.phase !== 'ended' && steps++ < 6500) game = applyAction(game, chooseBotAction(game));
      expect(game.phase, chapter.id).toBe('ended');
      expect(game.results).toHaveLength(chapter.players);
      const inventory = [...Object.keys(game.board), ...game.bag, ...game.discarded, ...game.players.flatMap((player) => player.hand)];
      expect(new Set(inventory).size, chapter.id).toBe(getMap(chapter.mapId).tiles.length);
      expect(inventory.length).toBe(getMap(chapter.mapId).tiles.length);
      for (const chain of getHouseRules(game).hotelChains) expect(game.bank[chain] + game.players.reduce((sum, player) => sum + player.stocks[chain], 0)).toBe(getHouseRules(game).shareSupply[chain] ?? 25);
    }
  }, 240000);
});
