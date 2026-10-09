import type { CSSProperties } from 'react';
import { CHAINS } from '../game/engine';
import { getMap } from '../game/maps';
import { CHAIN_IDS, type ChainId } from '../game/types';
import type { MatchSummary } from '../lib/matches';
import { mapThemeStyle } from './MapPreview';
import HotelLabels from './HotelLabels';
import { hotelLabels } from './hotel-markers';

export default function FinalBoard({ match, featuredChain }: { match: MatchSummary; featuredChain?: ChainId }) {
  const map = getMap(match.mapId);
  const snapshot = match.boardSnapshot;
  if (!snapshot || snapshot.length !== map.gridTiles.length) return <aside className="final-board-panel final-board-unavailable">
    <span className="eyebrow">THE FINAL CITY</span>
    <p>Board views are available for games completed after this update.</p>
  </aside>;

  const available = new Set(map.tiles);
  const labels = map.gridTiles.map((tile, index) => {
    const code = snapshot[index];
    const chain = code >= 'A' && code <= 'L' ? CHAIN_IDS[code.charCodeAt(0) - 65] : undefined;
    const definition = CHAINS.find((item) => item.id === chain);
    return { tile, chain, definition, independent: code === '#', playable: available.has(tile) };
  });
  const markers = hotelLabels(Object.fromEntries(labels.filter(cell => cell.playable && cell.chain).map(cell => [cell.tile, cell.chain!])), map.gridTiles, map.columns);
  return <aside className="final-board-panel" style={mapThemeStyle(map)}>
    <div className="final-board-title"><span className="eyebrow">THE FINAL CITY</span><strong>{map.name}</strong><small>{map.palette.name} · {match.placedTiles} buildings</small></div>
    <div className="final-board-frame">
      <div className="final-board-columns" style={{ gridTemplateColumns: `repeat(${map.columns}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length: map.columns }, (_, index) => <span key={index}>{index + 1}</span>)}
      </div>
      <div className="final-board-body">
        <div className="final-board-rows" style={{ gridTemplateRows: `repeat(${map.rows}, minmax(0, 1fr))` }} aria-hidden="true">
          {Array.from({ length: map.rows }, (_, index) => <span key={index}>{String.fromCharCode(65 + index)}</span>)}
        </div>
        <div className="final-board-grid" role="img" aria-label={`Final board for ${map.name}; ${featuredChain ? `${CHAINS.find((item) => item.id === featuredChain)?.name} highlighted` : 'all hotels shown'}`}
          style={{ '--map-columns': map.columns, '--map-rows': map.rows, gridTemplateColumns: `repeat(${map.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${map.rows}, minmax(0, 1fr))`, aspectRatio: `${map.columns}/${map.rows}` } as CSSProperties}>
          {labels.map(({ tile, chain, definition, independent, playable }) => <span key={tile}
            className={`final-board-tile ${!playable ? 'void' : ''} ${chain ? 'chain' : ''} ${featuredChain === chain ? 'featured' : ''}`}
            style={definition ? { '--final-chain': definition.color, '--final-chain-light': definition.light } as CSSProperties : undefined}
            title={`${tile}${definition ? ` · ${definition.name}` : independent ? ' · independent hotel' : ''}`}>
            {definition ? <b className="final-hotel-initial">{definition.name[0]}</b> : independent ? '▪' : ''}
          </span>)}
          <HotelLabels labels={markers} columns={map.columns} />
        </div>
      </div>
    </div>
    <p className="final-board-caption">{featuredChain ? `${CHAINS.find((item) => item.id === featuredChain)?.name} is highlighted on the board.` : 'A last look at the city you built together.'}</p>
  </aside>;
}
