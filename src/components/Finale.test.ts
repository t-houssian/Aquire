import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGame } from '../game/engine';
import { storyGameConfig } from '../game/campaign';
import { recordStoryResult } from '../lib/campaign';
import { summarizeMatch } from '../lib/matches';
import Finale from './Finale';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

function finished(chapterId = 'chapter-1', seed = 73) {
  const game = createGame(storyGameConfig(chapterId, 'Alex', seed));
  game.phase = 'ended';
  game.results = game.players.map((p, i) => ({ playerId: p.id, name: p.name, rank: i + 1, cashBefore: 6000, bonuses: 0, stocksValue: 0, total: i ? 6000 : 7000 }));
  game.winnerIds = [game.campaign!.playerId];
  return game;
}
const render = (game: ReturnType<typeof finished>, viewerId = game.campaign!.playerId) => renderToStaticMarkup(createElement(Finale, {
  match: summarizeMatch(game, 'local'), viewerId, onHome: () => {}, onProfile: () => {},
}));

it('puts the winner first, exact wardrobe unlocks second, then the story continuation', () => {
  const game = finished();
  recordStoryResult(game);
  const html = render(game);
  expect(html).toContain('<h1>Alex takes the crown.</h1>');
  expect(html.indexOf('aria-label="Winner celebration"')).toBeLessThan(html.indexOf('data-testid="match-rewards"'));
  expect(html.indexOf('data-testid="match-rewards"')).toBeLessThan(html.indexOf('data-testid="story-result"'));
  expect(html).toContain('The first key');
  expect(html).toContain('Profile badge');
  expect(html).toContain('Try on your rewards');
  expect(html).not.toContain('Your wardrobe is growing');
});

it('omits the wardrobe for an ordinary win, a replay win, another viewer and legacy progress', () => {
  const first = finished();
  recordStoryResult(first);
  expect(render(first, first.players[1].id)).not.toContain('data-testid="match-rewards"');
  const second = finished('chapter-2');
  recordStoryResult(second);
  expect(render(second)).not.toContain('data-testid="match-rewards"');
  const replay = finished('chapter-1', 99);
  recordStoryResult(replay);
  expect(render(replay)).not.toContain('data-testid="match-rewards"');
  expect(render(replay)).toContain('Continue your story');
  memory.set('aquire.story.v1', JSON.stringify({ version: 1, chapters: { 'chapter-1': { won: true, attempts: 1, best: 7000, lastGameId: first.id, lastOutcome: 'won' } } }));
  expect(render(first)).not.toContain('data-testid="match-rewards"');
});

it('keeps tied champions at the top without a wardrobe notice', () => {
  const game = finished();
  game.winnerIds = game.players.map((p) => p.id);
  game.results.forEach((result) => { result.rank = 1; result.total = 7000; });
  recordStoryResult(game);
  const html = render(game);
  expect(html).toContain('Alex &amp; Penny Pinch');
  expect(html).toContain('share the crown.');
  expect(html).not.toContain('data-testid="match-rewards"');
});
