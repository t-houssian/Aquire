import { STORY_CHAPTERS, getStoryChapter } from '../game/campaign';
import { validateHouseRules, getHouseRules } from '../game/engine';
import type { GameState } from '../game/types';
import { cosmeticRewardId, newlyEarnedCosmetics } from './cosmetic-rewards';

export interface ChapterProgress {
  won: boolean; attempts: number; best: number; lastGameId: string; lastOutcome: 'won' | 'lost';
  /** Items newly earned by lastGameId; repeat challenge wins earn nothing new. */
  earnedCosmetics?: string[];
}
export interface StoryProgress { version: 1; chapters: Record<string, ChapterProgress> }
const KEY = 'aquire.story.v1';
export const emptyStoryProgress = (): StoryProgress => ({ version: 1, chapters: {} });
export function readStoryProgress(): StoryProgress {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (value?.version !== 1 || !value.chapters || typeof value.chapters !== 'object') return emptyStoryProgress();
    const chapters: Record<string, ChapterProgress> = {};
    for (const chapter of STORY_CHAPTERS) {
      const entry = value.chapters[chapter.id];
      if (entry && typeof entry.won === 'boolean' && Number.isSafeInteger(entry.attempts) && entry.attempts > 0
        && Number.isFinite(entry.best) && entry.best >= 0 && typeof entry.lastGameId === 'string'
        && ['won', 'lost'].includes(entry.lastOutcome)) chapters[chapter.id] = entry;
    }
    return { version: 1, chapters };
  } catch { return emptyStoryProgress(); }
}
export function storyChapterUnlocked(progress: StoryProgress, id: string): boolean {
  const index = STORY_CHAPTERS.findIndex((chapter) => chapter.id === id);
  return index >= 0 && STORY_CHAPTERS.slice(0, index).every((chapter) => progress.chapters[chapter.id]?.won);
}
/** Called before finished local saves are compacted into match history. */
export function recordStoryResult(game: GameState): StoryProgress {
  const progress = readStoryProgress();
  const run = game.campaign, chapter = getStoryChapter(run?.chapterId);
  if (game.phase !== 'ended' || run?.version !== 1 || !chapter || !storyChapterUnlocked(progress, chapter.id)
    || game.mapId !== chapter.mapId || game.botDifficulty !== 'strategist'
    || game.players.length !== chapter.players
    || game.players.filter((player) => !player.isBot).length !== 1
    || !game.players.some((player) => player.id === run.playerId && !player.isBot)
    || game.players.filter((player) => player.isBot).map((player) => player.characterId).sort().join() !== [...chapter.opponents].sort().join()
    || JSON.stringify(getHouseRules(game)) !== JSON.stringify(validateHouseRules(chapter.houseRules))) return progress;
  const result = game.results.find((entry) => entry.playerId === run.playerId);
  if (!result || game.results.length !== game.players.length || !Number.isFinite(result.total)) return progress;
  const prior = progress.chapters[chapter.id];
  if (prior?.lastGameId === game.id) return progress;
  const winsBefore = storyWins(progress);
  const won = game.winnerIds.length === 1 && game.winnerIds[0] === run.playerId
    && game.results.every((entry) => entry.playerId === run.playerId || entry.total < result.total);
  progress.chapters[chapter.id] = {
    won: Boolean(prior?.won || won), attempts: (prior?.attempts ?? 0) + 1,
    best: Math.max(prior?.best ?? 0, result.total), lastGameId: game.id, lastOutcome: won ? 'won' : 'lost',
  };
  const earned = newlyEarnedCosmetics('story', winsBefore, storyWins(progress));
  if (earned.length) progress.chapters[chapter.id].earnedCosmetics = earned.map(cosmeticRewardId);
  localStorage.setItem(KEY, JSON.stringify(progress));
  return progress;
}

export function kingdomUnlocked(progress: StoryProgress = readStoryProgress()): boolean {
  return STORY_CHAPTERS.every((challenge) => progress.chapters[challenge.id]?.won);
}
/** Reward progress counts different won challenges, never repeat wins on one level. */
export const storyWins = (progress: StoryProgress = readStoryProgress()) => STORY_CHAPTERS.filter((challenge) => progress.chapters[challenge.id]?.won).length;
