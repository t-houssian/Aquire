import type { ChainId, GameState, Tile } from '../game/types';

export interface HotelLabel {
  chain: ChainId;
  tiles: Tile[];
  index: number;
  direction: 'horizontal' | 'vertical' | 'single';
}

/** Name each connected hotel group, preferring a two-space horizontal marker. */
export function hotelLabels(board: GameState['board'], grid: readonly Tile[], columns: number,
  headquarters: Partial<Record<ChainId, Tile>> = {}): HotelLabel[] {
  const labels: HotelLabel[] = [];
  const seen = new Set<number>();
  const neighbors = (index: number) => [
    index % columns > 0 ? index - 1 : -1,
    index % columns < columns - 1 ? index + 1 : -1,
    index - columns, index + columns,
  ].filter(i => i >= 0 && i < grid.length);
  for (let index = 0; index < grid.length; index++) {
    const chain = board[grid[index]];
    if (!chain || chain === 'independent' || seen.has(index)) continue;
    const group = new Set<number>();
    const pending = [index];
    while (pending.length) {
      const current = pending.pop()!;
      if (group.has(current)) continue;
      group.add(current); seen.add(current);
      for (const next of neighbors(current)) if (board[grid[next]] === chain && !group.has(next)) pending.push(next);
    }
    const cells = [...group].sort((a, b) => a - b);
    const founding = grid.findIndex(tile => tile === headquarters[chain]);
    const anchor = group.has(founding) ? founding : cells[0];
    const distance = (i: number) => Math.abs(i % columns - anchor % columns) + Math.abs(Math.floor(i / columns) - Math.floor(anchor / columns));
    const horizontal = cells.filter(i => i % columns < columns - 1 && group.has(i + 1)).map(i => [i, i + 1]);
    const vertical = cells.filter(i => group.has(i + columns)).map(i => [i, i + columns]);
    const candidates = horizontal.length ? horizontal : vertical;
    candidates.sort((a, b) => Math.min(...a.map(distance)) - Math.min(...b.map(distance)) || a[0] - b[0]);
    const pair = candidates[0] ?? [anchor];
    labels.push({ chain, tiles: pair.map(i => grid[i]), index: pair[0],
      direction: horizontal.length ? 'horizontal' : vertical.length ? 'vertical' : 'single' });
  }
  return labels;
}
