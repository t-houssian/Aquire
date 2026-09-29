import type { CSSProperties } from 'react';
import type { MapDefinition } from '../game/maps';

export function mapThemeStyle(map: MapDefinition): CSSProperties {
  return {
    '--map-canvas': map.palette.canvas,
    '--map-frame': map.palette.frame,
    '--map-tile': map.palette.tile,
    '--map-accent': map.palette.accent,
    '--map-ink': map.palette.ink,
    '--map-void': map.palette.void,
    '--map-columns': map.columns,
    '--map-rows': map.rows,
    '--map-ratio': map.columns / map.rows,
    '--map-inverse-ratio': map.rows / map.columns,
  } as CSSProperties;
}

export default function MapPreview({ map }: { map: MapDefinition }) {
  const spaces = new Set(map.tiles);
  return <div className="map-choice-preview" style={mapThemeStyle(map)}>
    <div className="map-miniature" role="img" aria-label={`${map.name}: ${map.columns} by ${map.rows}, ${map.tiles.length} playable tiles, up to ${map.maxPlayers} players, ${map.feature.toLowerCase()}`}
      style={{ gridTemplateColumns: `repeat(${map.columns}, 1fr)`, gridTemplateRows: `repeat(${map.rows}, 1fr)` }}>
      {map.gridTiles.map((coordinate) => {
        return <span aria-hidden="true" className={spaces.has(coordinate) ? 'included' : 'excluded'} key={coordinate} />;
      })}
    </div>
    <div className="map-preview-copy">
      <span className="eyebrow">{map.palette.name}</span>
      <strong>{map.feature} · {map.tiles.length} tiles</strong>
      <small>Up to {map.maxPlayers} investors · {map.columns} × {map.rows}</small>
      <p>{map.description}</p>
    </div>
  </div>;
}
