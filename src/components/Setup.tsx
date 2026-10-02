import { readProfile } from '../lib/profile';
import { kingdomUnlocked } from '../lib/campaign';
import { useRef, useState } from 'react';
import { ArrowRight, Bot, Users, Landmark, ShieldCheck } from 'lucide-react';
import type { GameConfig } from '../game/types';
import { MAPS, MAP_SEAT_TIERS, getMap } from '../game/maps';
import { DEFAULT_HOUSE_RULES } from '../game/engine';
import type { BotDifficulty, MapId } from '../game/types';
import type { Settings } from '../lib/storage';
import Modal from './Modal';
import MapPreview from './MapPreview';
import CharacterAvatar from './CharacterAvatar';
import { pickCharacters, STYLE_NAMES } from '../game/characters';
import HouseRulesControls, { maximumOpeningTiles } from './HouseRulesControls';

function playerId() {
  // getRandomValues also works on local-network HTTP, where randomUUID is unavailable.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function Setup({
  initialKind,
  onClose,
  onStart,
  hasSave,
  settings,
  onSettingsChange,
}: {
  initialKind: 'solo' | 'local';
  onClose: () => void;
  onStart: (config: GameConfig, kind: 'solo' | 'local') => void;
  hasSave: boolean;
  settings?: Settings;
  onSettingsChange?: (settings: Settings) => void;
}) {
  const [kind, setKind] = useState(initialKind),
    [count, setCount] = useState(3);
  const profile = readProfile(), royalReward = kingdomUnlocked();
  const [names, setNames] = useState([profile.name, 'Alex', 'Morgan', 'Riley', 'Sam', 'Jordan', 'Casey', 'Drew', 'Taylor', 'Robin', 'Avery', 'Parker']);
  const [mapId, setMapId] = useState<MapId>('classic');
  const selectedMap = getMap(mapId);
  const [castSeed, setCastSeed] = useState(() => crypto.getRandomValues(new Uint32Array(1))[0]);
  const opponents = pickCharacters(count - 1, castSeed, royalReward);
  const previewRef = useRef<HTMLDivElement>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('standard');
  const [houseRules, setHouseRules] = useState(() => ({ ...(settings?.houseRules ?? DEFAULT_HOUSE_RULES) }));
  const start = () =>
    onStart(
      {
        mode: 'classic',
        mapId,
        botDifficulty,
        houseRules,
        players: Array.from({ length: count }, (_, i) => ({
          id: playerId(),
          name:
            kind === 'solo' && i > 0
              ? opponents[i - 1].name
              : names[i].trim() || `Player ${i + 1}`,
          ...(i === 0 ? { avatar: profile.avatar } : {}),
          isBot: kind === 'solo' && i > 0,
          ...(kind === 'solo' && i > 0 ? { characterId: opponents[i - 1].id } : {}),
        })),
      },
      kind,
    );
  return (
    <Modal title="A new opportunity" onClose={onClose}>
      <div className="modal-body">
        <p className="muted">Choose your city and set the table rules.</p>
        <div className="segmented">
          <button className={kind === 'solo' ? 'selected' : ''} onClick={() => setKind('solo')}>
            <Bot size={17} /> Against the house
          </button>
          <button className={kind === 'local' ? 'selected' : ''} onClick={() => setKind('local')}>
            <Users size={17} /> Pass & play
          </button>
        </div>
        <label className="field-label" htmlFor="player-name">
          {kind === 'solo' ? 'Your name' : 'Player 1'}
        </label>
        <input
          id="player-name"
          maxLength={24}
          value={names[0]}
          onChange={(e) => setNames((n) => n.map((v, i) => (i === 0 ? e.target.value : v)))}
        />
        <div className="field-row">
          <span className="field-label">Seats at the table</span>
          <span className="muted small">
            {kind === 'solo' ? `${count - 1} computer opponent${count === 2 ? '' : 's'}` : `Up to ${selectedMap.maxPlayers} on this map`}
          </span>
        </div>
        <div className={`number-options ${selectedMap.maxPlayers > 6 ? 'expanded' : ''}`}>
          {Array.from({ length: selectedMap.maxPlayers - 1 }, (_, i) => i + 2).map((n) => (
            <button
              key={n}
              aria-label={`${n} players`}
              className={count === n ? 'selected' : ''}
              onClick={() => {
                setCount(n);
                setHouseRules((rules) => ({ ...rules, startingTilesPerPlayer: Math.min(rules.startingTilesPerPlayer, maximumOpeningTiles(selectedMap.tiles.length, n)) }));
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {kind === 'local' && (
          <div className="player-inputs">
            {Array.from({ length: count - 1 }, (_, j) => j + 1).map((i) => (
              <label key={i}>
                Player {i + 1}
                <input
                  value={names[i]}
                  maxLength={24}
                  onChange={(e) => setNames((n) => n.map((v, j) => (j === i ? e.target.value : v)))}
                />
              </label>
            ))}
          </div>
        )}
        <div className="edition-card">
          <Landmark size={23} />
          <div>
            <span className="eyebrow">{selectedMap.id !== 'classic' || count === 2 ? 'CUSTOM CITY · 2008 FOUNDATION' : 'THE 2008 EDITION'}</span>
            <strong>{selectedMap.maxPlayers > 6 ? 'A bigger city. More investors.' : 'The classic rules, at your table.'}</strong>
            <p>{selectedMap.id !== 'classic' ? `2–${selectedMap.maxPlayers} investors · 2008 prices & bonuses · ${selectedMap.endSize}-hotel end target` : '2–6 investors · 2008 prices & bonuses · Two-player house variant'}</p>
          </div>
        </div>
        <div className="setup-options">
          <span className="eyebrow">TABLE RULES & OPTIONS</span>
          <p className="small muted">The 2008 prices, bonuses and turn order stay the same. Custom cities change the footprint and may change the seat limit or end target.</p>
          <label className="field-label" htmlFor="setup-map">City map</label>
          <select id="setup-map" value={mapId} onChange={(event) => {
            const next = getMap(event.target.value as MapId);
            setMapId(next.id);
            const seats = Math.min(count, next.maxPlayers);
            setCount(seats);
            setHouseRules((rules) => ({ ...rules, startingTilesPerPlayer: Math.min(rules.startingTilesPerPlayer, maximumOpeningTiles(next.tiles.length, seats)) }));
            requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
          }}>
            {MAP_SEAT_TIERS.map((seats) => <optgroup key={seats} label={`Up to ${seats} players`}>
              {MAPS.filter((map) => (map.id !== 'goldspire-kingdom' || royalReward) && map.maxPlayers === seats).map((map) => <option key={map.id} value={map.id}>{map.name} · {map.tiles.length} tiles · {map.columns}×{map.rows}</option>)}
            </optgroup>)}
          </select>
          <div ref={previewRef}><MapPreview map={selectedMap} /></div>
          {selectedMap.maxPlayers > 6 && <p className="small muted">Expansion end: declare after {selectedMap.endSize} hotels in one chain, or once every active chain is safe, after playing a tile.</p>}
          {selectedMap.maxPlayers <= 6 && selectedMap.endSize !== 41 && <p className="small muted">Custom-city end: declare after {selectedMap.endSize} hotels in one chain, or when every active chain is safe.</p>}
          {kind === 'solo' && <>
            <label className="field-label" htmlFor="setup-difficulty">Computer difficulty</label>
            <select id="setup-difficulty" value={botDifficulty} onChange={(event) => setBotDifficulty(event.target.value as BotDifficulty)}>
              <option value="casual">Casual · quick, forgiving decisions</option>
              <option value="standard">Standard · balanced investing</option>
              <option value="strategist">Strategist · protects its lead</option>
            </select>
          </>}
          {kind === 'solo' && <div className="setup-cast">
            <div className="field-row"><span className="field-label">Meet the competition</span><button type="button" className="text-button" onClick={() => setCastSeed((seed) => seed + 1)}>Shuffle rivals</button></div>
            <div className="cast-preview">{opponents.map((character) => <div className="cast-preview-item" key={character.id} title={character.quote}><CharacterAvatar characterId={character.id} /><div><strong>{character.name}</strong><small>{STYLE_NAMES[character.style]}</small></div></div>)}</div>
          </div>}
          <HouseRulesControls value={houseRules} onChange={setHouseRules} mapTiles={selectedMap.tiles.length} players={count} />
          {settings && onSettingsChange && <div className="setup-privacy">
            <label><input type="checkbox" checked={settings.hideOpponentHoldings} onChange={(event) => onSettingsChange({ ...settings, hideOpponentHoldings: event.target.checked })} /> Hide opponents’ holdings after moves</label>
            <label><input type="checkbox" checked={settings.hideStockAvailability} onChange={(event) => onSettingsChange({ ...settings, hideStockAvailability: event.target.checked })} /> Show only “available” or “sold out”</label>
            <label><input type="checkbox" checked={settings.hints} onChange={(event) => onSettingsChange({ ...settings, hints: event.target.checked })} /> Show move hints</label>
          </div>}
        </div>
        <div className="inline-note">
          <ShieldCheck size={18} />
          {kind === 'solo'
            ? 'Saved automatically. Pick up where you left off.'
            : 'Private tile racks. Pass the device between turns.'}
        </div>
        <button className="button primary full" onClick={start}>
          Let’s build something <ArrowRight size={18} />
        </button>
        {hasSave && <p className="small muted center">Your other games stay safe in My games.</p>}
      </div>
    </Modal>
  );
}
