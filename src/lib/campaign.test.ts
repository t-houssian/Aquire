import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORY_CHAPTERS, storyGameConfig } from '../game/campaign';
import { CHARACTERS, pickCharacters } from '../game/characters';
import { applyAction, chooseBotAction, createGame, DEFAULT_HOUSE_RULES, getHouseRules } from '../game/engine';
import { getMap, MAPS } from '../game/maps';
import { emptyStoryProgress, readStoryProgress, recordStoryResult, storyChapterUnlocked } from './campaign';
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
  it('uses 56 different rivals and grows from a tiny duel to eleven Strategists on the biggest city', () => {
    expect(STORY_CHAPTERS).toHaveLength(12);
    const cast = STORY_CHAPTERS.flatMap((chapter) => chapter.opponents);
    expect(cast).toHaveLength(56); expect(new Set(cast).size).toBe(56);
    expect(new Set(CHARACTERS.map((character) => character.name)).size).toBe(56);
    expect(new Set(CHARACTERS.map((character) => character.portrait)).size).toBe(56);
    expect(STORY_CHAPTERS[0].players).toBe(2);
    expect(getMap(STORY_CHAPTERS.at(-1)!.mapId).tiles.length).toBe(Math.max(...MAPS.map((map) => map.tiles.length)));
    expect(STORY_CHAPTERS.at(-1)!.opponents).toHaveLength(11);
    for (const chapter of STORY_CHAPTERS) {
      const game = createGame(storyGameConfig(chapter.id, '  Alex  ', 43));
      expect(game.players).toHaveLength(chapter.players);
      expect(game.botDifficulty).toBe('strategist');
      expect(game.players.filter((player) => player.isBot).map((player) => player.characterId)).toEqual(chapter.opponents);
      expect(game.players[0].name).toBe('Alex');
      expect(getHouseRules(game)).toEqual(DEFAULT_HOUSE_RULES);
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
      for (const chain of DEFAULT_HOUSE_RULES.hotelChains) expect(game.bank[chain] + game.players.reduce((sum, player) => sum + player.stocks[chain], 0)).toBe(25);
    }
  }, 60000);
});
