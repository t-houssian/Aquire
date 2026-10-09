import type { CSSProperties } from 'react';
import { CHAINS } from '../game/engine';
import type { Tile } from '../game/types';
import type { CityTileLayout } from './CityScene';
import type { HotelLabel } from './hotel-markers';

export default function HotelLabels({ labels, columns, projected }: {
  labels: HotelLabel[];
  columns: number;
  projected?: Map<Tile, CityTileLayout>;
}) {
  return <div className="hotel-board-labels" aria-hidden="true">
    {labels.map(label => {
      const chain = CHAINS.find(chain => chain.id === label.chain)!;
      const boxes = projected && label.tiles.map(tile => projected.get(tile));
      if (boxes?.some(box => !box)) return null;
      const positions = boxes?.filter((box): box is CityTileLayout => Boolean(box));
      const left = positions && Math.min(...positions.map(box => box.left));
      const top = positions && Math.min(...positions.map(box => box.top));
      const style: CSSProperties = {
        '--chain': chain.color, '--chain-light': chain.light,
        '--name-width': chain.name.length * .66,
        gridColumn: `${label.index % columns + 1} / span ${label.direction === 'horizontal' ? 2 : 1}`,
        gridRow: `${Math.floor(label.index / columns) + 1} / span ${label.direction === 'vertical' ? 2 : 1}`,
        ...(positions ? { position: 'absolute', left, top,
          width: Math.max(...positions.map(box => box.left + box.width)) - left!,
          height: Math.max(...positions.map(box => box.top + box.height)) - top! } : {}),
      } as CSSProperties;
      return <div className={`hotel-nameplate-slot ${label.direction} ${chain.name.length > 8 ? 'long-name' : 'short-name'}`} key={`${chain.id}-${label.tiles[0]}`}
        data-chain={chain.id} data-tiles={label.tiles.join(' ')} style={style}>
        <strong className="hotel-nameplate">
          <span className="hotel-name-full">{chain.name}</span>
          <span className="hotel-name-short">{chain.abbreviation}</span>
        </strong>
      </div>;
    })}
  </div>;
}
