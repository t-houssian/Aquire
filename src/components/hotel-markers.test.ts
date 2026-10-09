import { describe, expect, it } from 'vitest';
import { hotelLabels } from './hotel-markers';
import type { GameState } from '../game/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHAINS, createGame } from '../game/engine';
import { summarizeMatch } from '../lib/matches';
import FinalBoard from './FinalBoard';

const grid = ['1A', '2A', '3A', '4A', '1B', '2B', '3B', '4B', '1C', '2C', '3C', '4C'];
describe('hotel name markers', () => {
  it('prefers a horizontal pair near the founding hotel and leaves the board intact', () => {
    const board: GameState['board'] = { '2A': 'tower', '2B': 'tower', '3B': 'tower', '2C': 'tower', '3C': 'tower' };
    const before = JSON.stringify(board);
    expect(hotelLabels(board, grid, 4, { tower: '2B' })).toEqual([
      { chain: 'tower', tiles: ['2B', '3B'], index: 5, direction: 'horizontal' },
    ]);
    expect(JSON.stringify(board)).toBe(before);
  });
  it('uses a vertical marker when the chain is a column', () => {
    expect(hotelLabels({ '3A': 'continental', '3B': 'continental' }, grid, 4)).toEqual([
      { chain: 'continental', tiles: ['3A', '3B'], index: 2, direction: 'vertical' },
    ]);
  });
  it('does not join tiles across a row edge, empty space, or another hotel', () => {
    const labels = hotelLabels({ '4A': 'tower', '1B': 'tower', '2B': 'independent', '3B': 'american', '4C': 'tower' }, grid, 4);
    expect(labels.filter(label => label.chain === 'tower').map(label => label.tiles)).toEqual([['4A'], ['1B'], ['4C']]);
    expect(labels.some(label => label.tiles.includes('2B'))).toBe(false);
  });
  it('names every remaining island after a removal and drops acquired chain names after a merger', () => {
    const before: GameState['board'] = { '1A': 'tower', '2A': 'tower', '3A': 'tower', '4A': 'american', '4B': 'american' };
    const removed = { ...before }; delete removed['2A'];
    expect(hotelLabels(removed, grid, 4).filter(label => label.chain === 'tower')).toHaveLength(2);
    const merged: GameState['board'] = Object.fromEntries(Object.keys(before).map(tile => [tile, 'tower']));
    expect(hotelLabels(merged, grid, 4).map(label => label.chain)).toEqual(['tower']);
  });
  it('keeps the same hotel footprint when the board is rotated', () => {
    const rotated = ['1C', '1B', '1A', '2C', '2B', '2A', '3C', '3B', '3A', '4C', '4B', '4A'];
    const board: GameState['board'] = { '2A': 'tower', '2B': 'tower' };
    const marker = hotelLabels(board, rotated, 3)[0];
    expect(marker.direction).toBe('horizontal');
    expect(new Set(marker.tiles)).toEqual(new Set(['2A', '2B']));
  });
  it('keeps full hotel names and tile initials on archived cities too', () => {
    const game = createGame({ seed: 1, players: [{ id: 'alex', name: 'Alex' }, { id: 'ellis', name: 'Ellis' }] });
    game.board = {};
    for (const [i, chain] of CHAINS.entries()) {
      game.board[`${i + 1}A`] = chain.id;
      game.board[`${i + 1}B`] = chain.id;
    }
    game.phase = 'ended';
    const html = renderToStaticMarkup(createElement(FinalBoard, { match: summarizeMatch(game, 'local') }));
    for (const chain of CHAINS) {
      expect(html).toContain(`<span class="hotel-name-full">${chain.name}</span>`);
      expect(html).toContain(`<b class="final-hotel-initial">${chain.name[0]}</b>`);
    }
    expect(html.match(/class="hotel-nameplate"/g)).toHaveLength(12);
  });
});
