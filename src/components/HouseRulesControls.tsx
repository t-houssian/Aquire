import type { CSSProperties } from 'react';
import { CHAINS, getPriceForSize } from '../game/engine';
import { DEFAULT_CHAIN_IDS, type HouseRules } from '../game/types';

export function maximumOpeningTiles(mapTiles: number, players: number) {
  return Math.min(10, Math.max(1, Math.floor(mapTiles / players) - 6));
}

export default function HouseRulesControls({ value, onChange, mapTiles, players, hotelSelectionAvailable = true, shareSupplyAvailable = true }: {
  value: HouseRules;
  onChange: (next: HouseRules) => void;
  mapTiles?: number;
  players?: number;
  hotelSelectionAvailable?: boolean;
  shareSupplyAvailable?: boolean;
}) {
  const openingLimit = mapTiles && players ? maximumOpeningTiles(mapTiles, players) : 10;
  const change = (patch: Partial<HouseRules>) => onChange({ ...value, ...patch });
  return <div className="house-rules-controls">
    <div className="settings-section-heading">
      <span className="eyebrow">HOUSE RULES</span>
      <p>Optional changes for new games. The printed 2008 rules remain the default.</p>
    </div>
    {hotelSelectionAvailable && <><div className="hotel-roster-heading">
      <div>
        <strong>Hotels in this game</strong>
        <small>{value.hotelChains.length} selected · choose any two or more{shareSupplyAvailable && ' · 1–100 shares per chain'}</small>
      </div>
      <button type="button" onClick={() => change({ hotelChains: [...DEFAULT_CHAIN_IDS], shareSupply: {} })}>Reset to 2008 seven</button>
    </div>
    <div className="hotel-roster-grid">
      {CHAINS.map((hotel) => {
        const checked = value.hotelChains.includes(hotel.id);
        return <div className={`hotel-choice ${checked ? 'selected' : ''}`} key={hotel.id}
          style={{ '--hotel-color': hotel.color, '--hotel-light': hotel.light } as CSSProperties}>
          <label className="hotel-choice-main">
            <input type="checkbox" checked={checked} disabled={checked && value.hotelChains.length <= 2}
              onChange={() => change({ hotelChains: CHAINS.map((chain) => chain.id).filter((id) => id === hotel.id ? !checked : value.hotelChains.includes(id)) })} />
            <span className="hotel-choice-mark">{hotel.name[0]}</span>
            <span className="hotel-choice-copy"><strong>{hotel.name}</strong><small>From ${getPriceForSize(hotel.id, 2)} a share</small></span>
          </label>
          {checked && shareSupplyAvailable && <label className="hotel-share-supply">Shares
            <input type="number" aria-label={`${hotel.name} shares available`} min="1" max="100" step="1"
              value={value.shareSupply[hotel.id] ?? 25}
              onChange={(event) => {
                const count = Math.max(1, Math.min(100, Number(event.target.value) || 1));
                const shareSupply = { ...value.shareSupply };
                if (count === 25) delete shareSupply[hotel.id];
                else shareSupply[hotel.id] = count;
                change({ shareSupply });
              }} />
          </label>}
        </div>;
      })}
    </div></>}
    <div className="house-rule-grid">
      <label>Starting tiles per player
        <input aria-label="Starting tiles per player" type="number" min="1" max={openingLimit} step="1" value={value.startingTilesPerPlayer}
          onChange={(event) => change({ startingTilesPerPlayer: Math.max(1, Math.min(openingLimit, Number(event.target.value) || 1)) })} />
        <small>{players ? `${players * value.startingTilesPerPlayer} on the opening board` : 'One seating tile each by default'} · up to {openingLimit} each</small>
      </label>
      <label>Starting cash
        <input aria-label="Starting cash" type="number" min="0" max="1000000" step="100" value={value.startingCash}
          onChange={(event) => change({ startingCash: Math.max(0, Math.min(1000000, Number(event.target.value) || 0)) })} />
        <small>Each investor receives this amount.</small>
      </label>
      <label>Tiles to place per turn
        <input aria-label="Tiles to place per turn" type="number" min="1" max="6" step="1" value={value.placementsPerTurn}
          onChange={(event) => {
            const placementsPerTurn = Math.max(1, Math.min(6, Number(event.target.value) || 1));
            change({ placementsPerTurn, removalsPerTurn: Math.min(value.removalsPerTurn, placementsPerTurn - 1) });
          }} />
        <small>Place up to this many before investing.</small>
      </label>
      <label>Tiles to remove per turn
        <input aria-label="Tiles to remove per turn" type="number" min="0" max={Math.min(5, value.placementsPerTurn - 1)} step="1" value={value.removalsPerTurn}
          onChange={(event) => change({ removalsPerTurn: Math.max(0, Math.min(5, value.placementsPerTurn - 1, Number(event.target.value) || 0)) })} />
        <small>Always fewer than the placement limit.</small>
      </label>
      <label>Shares to buy per turn
        <input aria-label="Shares to buy per turn" type="number" min="1" max="10" step="1" value={value.buyLimit}
          onChange={(event) => change({ buyLimit: Math.max(1, Math.min(10, Number(event.target.value) || 1)) })} />
        <small>Trading can add up to three more buys.</small>
      </label>
      <label>Market fluctuation
        <select aria-label="Market fluctuation" value={value.marketMode} onChange={(event) => change({ marketMode: event.target.value as HouseRules['marketMode'] })}>
          <option value="off">Off · printed prices</option>
          <option value="market">Market · one row up or down</option>
          <option value="crazy">Crazy market · up to two rows</option>
        </select>
        <small>Roll after each complete round; affects every valuation.</small>
      </label>
    </div>
    <label className="house-rule-toggle"><input type="checkbox" checked={value.turnTimerSeconds > 0}
      onChange={(event) => change({ turnTimerSeconds: event.target.checked ? 60 : 0 })} /> Enforce a turn timer</label>
    {value.turnTimerSeconds > 0 && <label className="house-rule-timer">Seconds per turn
      <input aria-label="Seconds per turn" type="number" min="5" max="600" step="1" value={value.turnTimerSeconds}
        onChange={(event) => change({ turnTimerSeconds: Math.max(5, Math.min(600, Number(event.target.value) || 5)) })} />
      <small>5 seconds to 10 minutes. Unfinished decisions are completed automatically when time runs out.</small>
    </label>}
    <div className="house-rule-switches">
      <label><input type="checkbox" checked={value.hiddenMoney} onChange={(event) => change({ hiddenMoney: event.target.checked })} /> Hide other players’ cash</label>
      <label><input type="checkbox" checked={value.anonymousBuying} onChange={(event) => change({ anonymousBuying: event.target.checked })} /> Anonymous buying, bank counts, and cash</label>
      <label><input type="checkbox" checked={value.dividends} onChange={(event) => change({ dividends: event.target.checked })} /> Round-end dividends</label>
      <label><input type="checkbox" checked={value.trading} onChange={(event) => change({ trading: event.target.checked })} /> Sell up to three shares, then reinvest</label>
    </div>
  </div>;
}
