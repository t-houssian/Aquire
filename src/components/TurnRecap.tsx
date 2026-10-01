import { ArrowRight, Check, MapPin, ShoppingBag } from 'lucide-react';
import { CHAINS, getMap, type ChainId } from '../game/engine';
import type { TurnRecapData } from '../lib/turnRecaps';
import Modal from './Modal';
import CharacterAvatar from './CharacterAvatar';
import { getCharacter } from '../game/characters';

const chainById = Object.fromEntries(CHAINS.map((chain) => [chain.id, chain])) as Record<
  ChainId,
  (typeof CHAINS)[number]
>;

export default function TurnRecap({
  recap,
  onContinue,
  remaining = 0,
}: {
  recap: TurnRecapData;
  onContinue: () => void;
  /** Number of additional recaps waiting after this one. */
  remaining?: number;
}) {
  const character = getCharacter(recap.characterId);
  const placedChain = recap.chain && recap.chain !== 'independent' ? chainById[recap.chain] : null;
  const map = getMap(recap.mapId);
  const spaces = new Set(map.tiles);
  return (
    <Modal title={`${recap.playerName}’s turn`} onClose={onContinue}>
      <div className="turn-recap" data-testid="turn-recap">
        {character && <div className="recap-character"><CharacterAvatar characterId={character.id} /><div><strong>{character.title}</strong><p>“{character.quote}”</p></div></div>}
        <div className="recap-kicker">
          TURN {recap.turn} · {recap.isBot ? 'COMPUTER' : 'INVESTOR'}
        </div>
        <div className="recap-overview">
          <div className="recap-placement">
            <span className="recap-step-icon">
              <MapPin size={22} aria-hidden="true" />
            </span>
            <div>
              <span className="recap-label">
                {recap.tiles && recap.tiles.length > 1 ? 'Placed buildings at' : recap.tile ? 'Placed a building at' : 'Placement'}
              </span>
              <strong className="recap-coordinate">{recap.tiles?.length ? recap.tiles.join(' · ') : recap.tile ?? 'No playable tile'}</strong>
              {!!recap.removedTiles?.length && <small>Removed {recap.removedTiles.join(' · ')}</small>}
            </div>
            {placedChain && (
              <span
                className="recap-chain-badge"
                style={{ background: placedChain.light, color: placedChain.color }}
              >
                <b>{placedChain.name[0]}</b>
                {placedChain.name}
              </span>
            )}
          </div>
          <svg
            className="recap-board"
            viewBox={`0 0 ${30 + map.columns * 28} ${28 + map.rows * 28}`}
            role="img"
            aria-label={
              recap.tile
                ? `Board after turn ${recap.turn}, placed tile${recap.tiles && recap.tiles.length > 1 ? 's' : ''} ${(recap.tiles?.length ? recap.tiles.join(', ') : recap.tile)} highlighted`
                : `Board after turn ${recap.turn}, no tile placed`
            }
          >
            <title>
              {recap.tile ? `${recap.playerName} placed ${recap.tiles?.join(', ') ?? recap.tile}` : 'No tile placed'}
            </title>
            {Array.from({ length: map.columns }, (_, index) => (
              <text
                key={`column-${index}`}
                x={36 + index * 28}
                y={15}
                textAnchor="middle"
                className="recap-axis"
              >
                {index + 1}
              </text>
            ))}
            {Array.from({ length: map.rows }, (_, index) => (
              <text
                key={`row-${index}`}
                x={11}
                y={41 + index * 28}
                textAnchor="middle"
                className="recap-axis"
              >
                {String.fromCharCode(65 + index)}
              </text>
            ))}
            {map.gridTiles.map((tile) => {
              const x = 24 + (Number(tile.slice(0, -1)) - 1) * 28;
              const y = 24 + (tile.charCodeAt(tile.length - 1) - 65) * 28;
              const occupied = recap.board[tile];
              const definition =
                occupied && occupied !== 'independent' ? chainById[occupied] : null;
              const highlighted = recap.tiles?.includes(tile) ?? tile === recap.tile;
              return (
                <g key={tile} data-tile={tile} data-highlighted={highlighted || undefined}>
                  <rect
                    x={x}
                    y={y}
                    width={24}
                    height={24}
                    rx={5}
                    fill={spaces.has(tile) ? (definition?.color ?? (occupied ? '#bcb6aa' : '#eeeae2')) : map.palette.void}
                    stroke={highlighted ? '#193d33' : 'none'}
                    strokeWidth={3}
                  />
                  {highlighted && (
                    <rect
                      x={x + 3}
                      y={y + 3}
                      width={18}
                      height={18}
                      rx={3}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  )}
                  {definition && (
                    <text x={x + 12} y={y + 16} textAnchor="middle" className="recap-board-letter">
                      {definition.name[0]}
                    </text>
                  )}
                  {highlighted && !definition && (
                    <circle cx={x + 12} cy={y + 12} r={3} fill="#193d33" />
                  )}
                </g>
              );
            })}
          </svg>
          {recap.founding && (
            <div className="recap-founded">
              <Check size={17} aria-hidden="true" />
              <span>
                Founded <strong>{chainById[recap.founding.chain].name}</strong>
                {recap.founding.receivedShare
                  ? ' · received 1 free founder share'
                  : ' · no founder share available'}
              </span>
            </div>
          )}
        </div>
        <div className="recap-details">
          <section className="recap-purchases" aria-label="Shares purchased">
            <h3>
              <ShoppingBag size={18} aria-hidden="true" />
              {recap.anonymousBuying ? 'Private market order' : 'Shares purchased'}
            </h3>
            {recap.anonymousBuying ? <p className="recap-no-purchase">Purchase and sale quantities are private at this table.</p> : recap.purchases.length ? (
              <div className="recap-purchase-list">
                {recap.purchases.map(({ chain, quantity }) => (
                  <div className="recap-purchase" key={chain}>
                    <span
                      className="recap-stock-letter"
                      style={{ background: chainById[chain].color }}
                    >
                      {chainById[chain].name[0]}
                    </span>
                    <strong>{chainById[chain].name}</strong>
                    <span>
                      <b>{quantity}</b> {quantity === 1 ? 'share' : 'shares'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="recap-no-purchase">No shares purchased. Kept their cash.</p>
            )}
          </section>
          {recap.events.length > 0 && (
            <section className="recap-events" aria-label="Other public turn events">
              <h3>Also this turn</h3>
              <ul>
                {recap.events.map((event) => (
                  <li key={event.id}>{event.message}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <footer className="recap-footer">
          <span>
            {remaining
              ? `${remaining} more ${remaining === 1 ? 'turn' : 'turns'} to review`
              : 'All caught up after this turn'}
          </span>
          <button className="button primary" onClick={onContinue}>
            Continue
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </footer>
      </div>
    </Modal>
  );
}
