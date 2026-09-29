import { useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Crown,
  HandCoins,
  HelpCircle,
  Landmark,
  Layers3,
  LockKeyhole,
  Menu,
  Minus,
  Plus,
  ShieldCheck,
  Settings2,
  Sparkles,
  Trophy,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  CHAINS,
  analyzeTile,
  canEndGame,
  getAvailableChains,
  getChainSize,
  getCurrentActor,
  getLegalTiles,
  getSharePrice,
  getMap,
  getHouseRules,
  getRemovableTiles,
} from '../game/engine';
import type { ChainId, GameState, GameAction, GameLog, Stocks, Tile } from '../game/types';
import { money } from '../lib/storage';
import { summarizeMatch } from '../lib/matches';
import Finale from './Finale';
import { mapThemeStyle } from './MapPreview';
const colors = [
  '#8eab6b', '#dc9f7a', '#8d9fb8', '#bfa0bf', '#bcb06c', '#85b6b0',
  '#b28f70', '#7a9fa0', '#ba8298', '#8a9d6a', '#9c88b2', '#c29b67',
];
const phaseNames: Record<string, string> = {
  place: 'Place a tile',
  found: 'Found a chain',
  'merger-survivor': 'Choose the survivor',
  'merger-order': 'Resolve a merger',
  'merger-shares': 'Manage your shares',
  buy: 'Invest in the market',
  ended: 'The closing bell',
};
const emptyCart = () => Object.fromEntries(CHAINS.map((c) => [c.id, 0])) as Stocks;
export default function GameView({
  game,
  viewerId,
  onAction,
  onHome,
  onMenu,
  onRules,
  onSettings,
  busy = false,
  hints = true,
  privateGate = false,
  hideOpponentHoldings = false,
  hideStockAvailability = false,
  onReveal,
  onlineCode,
}: {
  game: GameState;
  viewerId: string;
  onAction: (action: GameAction) => void;
  onHome: () => void;
  onMenu: () => void;
  onRules: () => void;
  onSettings: () => void;
  busy?: boolean;
  hints?: boolean;
  privateGate?: boolean;
  hideOpponentHoldings?: boolean;
  hideStockAvailability?: boolean;
  onReveal?: () => void;
  onlineCode?: string;
}) {
  const actor = getCurrentActor(game),
    player = game.players.find((p) => p.id === viewerId) || game.players[0];
  const controllable = actor.id === viewerId && !actor.isBot && !busy && !privateGate;
  const permanentlyBlocked = actor.hand.filter((tile) => analyzeTile(game, tile).permanent);
  const [selected, setSelected] = useState<Tile | null>(null),
    [cart, setCart] = useState<Stocks>(emptyCart),
    [sellCart, setSellCart] = useState<Stocks>(emptyCart),
    [removalMode, setRemovalMode] = useState(false),
    [selectedRemoval, setSelectedRemoval] = useState<Tile | null>(null),
    [clockNow, setClockNow] = useState(Date.now()),
    [sell, setSell] = useState(0),
    [trade, setTrade] = useState(0),
    [compactView, setCompactView] = useState<'board' | 'market'>(game.phase === 'buy' ? 'market' : 'board'),
    [tab, setTab] = useState<'market' | 'investors' | 'activity' | 'results' | 'rules'>(
      game.phase === 'ended' ? 'results' : 'market',
    );
  useEffect(() => {
    setTab(game.phase === 'ended' ? 'results' : 'market');
  }, [game.id, game.phase === 'ended']);
  useEffect(() => {
    setCompactView(game.phase === 'buy' ? 'market' : 'board');
    if (game.phase === 'buy') setTab('market');
  }, [game.id, game.phase, game.turn]);
  useEffect(() => {
    setSelected(null);
    setCart(emptyCart());
    setSellCart(emptyCart());
    setRemovalMode(false);
    setSelectedRemoval(null);
    setSell(0);
    setTrade(0);
  }, [game.id, game.revision, viewerId]);
  useEffect(() => {
    if (!game.turnDeadlineAt || game.phase === 'ended') return;
    const timer = setInterval(() => setClockNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [game.turnDeadlineAt, game.phase]);
  const rules = getHouseRules(game);
  const hotels = CHAINS.filter((chain) => rules.hotelChains.includes(chain.id));
  const anonymous = rules.anonymousBuying && game.phase !== 'ended';
  const hiddenCash = rules.hiddenMoney || anonymous;
  const hiddenBank = hideStockAvailability || anonymous;
  const hiddenHoldings = hideOpponentHoldings || anonymous;
  const soldCount = Object.values(sellCart).reduce((a, b) => a + b, 0);
  const saleValue = hotels.reduce((sum, chain) => sum + sellCart[chain.id] * getSharePrice(game, chain.id), 0);
  const purchaseLimit = rules.buyLimit + soldCount;
  const removableTiles = new Set(controllable && game.phase === 'place' ? getRemovableTiles(game) : []);
  const legal = game.phase === 'place' && controllable ? getLegalTiles(game) : [];
  const selection = selected ? analyzeTile(game, selected) : null;
  const total = hotels.reduce((sum, c) => sum + cart[c.id] * getSharePrice(game, c.id), 0),
    quantity = Object.values(cart).reduce((a, b) => a + b, 0);
  const orderValid = quantity <= purchaseLimit && soldCount <= 3 && total <= player.cash + saleValue &&
    hotels.every((chain) => cart[chain.id] <= game.bank[chain.id] + sellCart[chain.id] && sellCart[chain.id] <= player.stocks[chain.id]);
  const awaitingSettlement =
    game.merger?.acquired &&
    game.merger.shareholders
      .slice(game.merger.shareholderCursor)
      .some((index) => game.players[index].id === player.id);
  const assets = hotels.reduce(
    (sum, c) =>
      sum +
      (player.stocks[c.id] ?? 0) *
        (awaitingSettlement && game.merger?.acquired === c.id
          ? game.merger.sharePrice
          : getSharePrice(game, c.id)),
    0,
  );
  const active = hotels.filter((c) => getChainSize(game, c.id) > 0);
  const cityMap = getMap(game.mapId);
  const playableSpaces = new Set(cityMap.tiles);
  const isEnded = game.phase === 'ended';
  const ownHoldingsVisible = !privateGate || isEnded;
  const actorHoldingsVisible =
    isEnded || (!privateGate && (!hiddenHoldings || actor.id === viewerId));
  const availability = (chain: ChainId) =>
    hiddenBank
      ? game.bank[chain] > 0
        ? 'Available'
        : 'Sold out'
      : `${game.bank[chain]} available`;
  const headquarters: Partial<Record<ChainId, Tile>> = Object.fromEntries(
    game.logs
      .filter((log) => log.type === 'found' && log.chain && log.tile)
      .map((log) => [log.chain, log.tile]),
  );
  const select = (tile: Tile) => {
    if (controllable && game.phase === 'place' && player.hand.includes(tile)) setSelected(tile);
  };
  const add = (id: ChainId, change: number) =>
    setCart((prev) => ({ ...prev, [id]: Math.max(0, prev[id] + change) }));
  const chainName = (id: ChainId) => CHAINS.find((c) => c.id === id)!.name;
  const acquired = game.merger?.acquired;
  const owned = acquired ? actor.stocks[acquired] : 0;
  const action = (a: GameAction) => {
    if (controllable) onAction(a);
  };
  if (isEnded) return <Finale match={summarizeMatch(game, onlineCode ? 'online' : 'local')} onHome={onHome} />;
  return (
    <div className={`game-view ${cityMap.maxPlayers > 6 || cityMap.columns !== 12 || cityMap.rows !== 9 ? 'expansion-game' : ''} ${isEnded ? 'game-ended' : ''}`} data-phase={game.phase} data-compact-view={compactView}>
      <div className="game-topline">
        <div className="game-navigation">
          <button className="text-button compact-menu" onClick={onMenu} aria-label="Open navigation" aria-controls="sidebar-navigation">
            <Menu size={18} />
          </button>
          <button className="text-button" onClick={onHome}>
            <ArrowLeft size={16} /> The clubhouse
          </button>
        </div>
        <div className="game-toplinks">
          {onlineCode && <span className="room-tag">ROOM {onlineCode}</span>}
          <span className="save-indicator">
            <span />
            {onlineCode ? 'Connected room' : 'Saved on this device'}
          </span>
          <button className="text-button" onClick={onRules}>
            <HelpCircle size={17} /> Rules
          </button>
          <button className="text-button compact-settings" onClick={onSettings} aria-label="Table preferences" title="Table preferences">
            <Settings2 size={17} />
          </button>
        </div>
      </div>
      <div className="game-heading">
        <div>
          <span className="eyebrow">
            2008 EDITION <span> / </span> TURN {game.turn}
            <span className="compact-turn-name"> · {actor.name}</span>
          </span>
          <h1>
            The boardroom<span className="serif-dot">.</span>
          </h1>
        </div>
        <div className="personal-stats">
          <div>
            <span>YOUR CASH</span>
            <strong>{ownHoldingsVisible ? money(player.cash) : '—'}</strong>
          </div>
          <div>
            <span>STOCK VALUE</span>
            <strong>{ownHoldingsVisible ? money(assets) : '—'}</strong>
          </div>
        </div>
      </div>
      <div className="players-bar">
        {game.players.map((p, i) => (
          <div
            className={`player-chip ${p.id === actor.id && !isEnded ? 'current' : ''}`}
            key={p.id}
          >
            <div className="avatar" style={{ '--avatar': colors[i] } as CSSProperties}>
              {p.name.slice(0, 1).toUpperCase()}
              {p.id === actor.id && !isEnded && <span />}
            </div>
            <div>
              <strong>
                {p.name}
                {p.id === viewerId && <small> you</small>}
              </strong>
              <span>
                {p.isBot
                  ? 'The house'
                  : p.id === actor.id && !isEnded
                    ? 'At the table'
                    : 'Investor'}
              </span>
            </div>
            <span className="player-cash">{hiddenCash && p.id !== viewerId && !isEnded ? 'Private cash' : money(p.cash)}</span>
          </div>
        ))}
      </div>
      <div className="compact-view-switcher" role="group" aria-label="Game view">
        <span className="compact-view-context">{compactView === 'board' && (cityMap.columns > 12 || cityMap.rows > 9) ? 'Drag to explore' : phaseNames[game.phase]}</span>
        <div>
          <button type="button" aria-pressed={compactView === 'board'} aria-controls="game-board-panel" className={compactView === 'board' ? 'active' : ''} onClick={() => setCompactView('board')}>
            <Layers3 size={15} /> Board
          </button>
          <button type="button" aria-pressed={compactView === 'market'} aria-controls="game-market-panel" className={compactView === 'market' ? 'active' : ''} onClick={() => setCompactView('market')}>
            <TrendingUp size={15} /> Stocks
          </button>
        </div>
      </div>
      <div className="game-layout">
        <div className="board-column">
          <section id="game-board-panel" className={`board-card map-themed ${cityMap.maxPlayers > 6 || cityMap.columns !== 12 || cityMap.rows !== 9 ? 'expansion-board' : ''}`} style={mapThemeStyle(cityMap)} data-map={cityMap.id}>
            <div className="board-title">
              <div>
                <span className="live-dot" />
                <strong>{cityMap.id === 'classic' ? 'The city' : cityMap.name}</strong>
                <span className="muted small">{cityMap.palette.name}</span>
              </div>
              <span className="tiles-count">
                <Layers3 size={14} />
                {Object.keys(game.board).length} / {cityMap.tiles.length} · Rack {player.hand.length} · Bag {game.bag.length}
              </span>
            </div>
            <div className="board-stage">
              <div className="board-wrap">
                <div className="board-columns">
                  {Array.from({ length: cityMap.columns }, (_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>
                <div className="board-with-rows">
                  <div className="board-rows">
                    {Array.from({ length: cityMap.rows }, (_, i) => String.fromCharCode(65 + i)).map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </div>
                  <div className="game-board" role="group" aria-label="Acquire game board">
                    {cityMap.gridTiles.map((tile) => {
                      const chain = game.board[tile];
                      const isPlayableSpace = playableSpaces.has(tile);
                      const def = CHAINS.find((c) => c.id === chain);
                      const inHand = player.hand.includes(tile) && !privateGate;
                      const enabled = controllable && game.phase === 'place' && (removalMode ? removableTiles.has(tile) : inHand);
                      const foundingHead = def ? headquarters[def.id] : undefined;
                      const head =
                        def &&
                        ((foundingHead && game.board[foundingHead] === def.id ? foundingHead : null) ||
                          Object.keys(game.board).find((t) => game.board[t] === chain)) === tile;
                      return (
                        <button
                          key={tile}
                          className={`board-tile ${!isPlayableSpace ? 'map-void' : ''} ${chain ? 'occupied' : ''} ${chain === 'independent' ? 'independent-tile' : ''} ${def ? 'chain-tile' : ''} ${head ? 'chain-headquarters' : ''} ${!removalMode && inHand && legal.includes(tile) ? 'playable' : ''} ${removalMode && removableTiles.has(tile) ? 'removal-target' : ''} ${selected === tile || selectedRemoval === tile ? 'tile-selected' : ''} ${game.lastPlacedTile === tile ? 'last-placed' : ''}`}
                          style={
                            def
                              ? ({
                                  '--chain': def.color,
                                  '--chain-light': def.light,
                                } as CSSProperties)
                              : undefined
                          }
                          aria-label={`${tile}${!isPlayableSpace ? ', outside this map' : def ? ', ' + def.name : chain ? ', independent hotel' : ''}${inHand ? ', in your hand' : ''}`}
                          aria-pressed={selected === tile || selectedRemoval === tile}
                          disabled={!enabled || !isPlayableSpace}
                          onClick={() => removalMode ? setSelectedRemoval(tile) : select(tile)}
                        >
                          {def ? (
                            <strong className="tile-initial" aria-hidden="true">
                              {def.name[0]}
                            </strong>
                          ) : chain === 'independent' ? (
                            <Building2 className="independent-building" aria-hidden="true" strokeWidth={2.5} />
                          ) : null}
                          <span className="tile-coordinate">{tile}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="board-legend">
              <span>
                <i className="legend-empty" /> Unbuilt
              </span>
              <span>
                <i className="legend-independent" /> Placed · independent
              </span>
              <span>
                <i className="legend-hand" /> In your hand
              </span>
              <span>
                <ShieldCheck size={13} /> 11+ hotels = safe
              </span>
            </div>
          </section>
          {!isEnded && (
            <section className="action-card">
              <div className="action-heading">
                <div className="step-icon">
                  {game.phase === 'buy' ? (
                    <HandCoins size={21} />
                  ) : game.phase.includes('merger') ? (
                    <Landmark size={21} />
                  ) : (
                    <Layers3 size={21} />
                  )}
                </div>
                <div>
                  <span className="eyebrow">
                    {controllable
                      ? 'YOUR NEXT MOVE'
                      : privateGate
                        ? 'PASS THE DEVICE'
                        : actor.isBot
                          ? 'THE HOUSE IS THINKING'
                          : `${actor.name.toUpperCase()}’S MOVE`}
                  </span>
                  <h3>{privateGate ? 'A little privacy, please.' : phaseNames[game.phase]}</h3>
                </div>
                {game.turnDeadlineAt && <span className={`turn-timer ${game.turnDeadlineAt - clockNow <= 10000 ? 'urgent' : ''}`} aria-label="Turn time remaining">
                  {Math.floor(Math.max(0, Math.ceil((game.turnDeadlineAt - clockNow) / 1000)) / 60)}:{String(Math.max(0, Math.ceil((game.turnDeadlineAt - clockNow) / 1000)) % 60).padStart(2, '0')}
                </span>}
                {!controllable && !privateGate && (
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </div>
              {privateGate ? (
                <div className="privacy-panel">
                  <LockKeyhole size={26} />
                  <p>
                    Pass the device to <strong>{actor.name}</strong> to reveal their tiles.
                  </p>
                  <button className="button primary" onClick={onReveal}>
                    I’m {actor.name} <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <>
                  {game.phase === 'place' && (
                    <>
                      {rules.placementsPerTurn > 1 && <p className="small muted">Placed {game.placementsThisTurn ?? 0} of up to {rules.placementsPerTurn} tiles this turn.</p>}
                      <p className="action-description">
                        {controllable
                          ? removalMode
                            ? 'Select a highlighted built tile on the board. Hotel chains must stay connected and at least two tiles large.'
                            : selection
                            ? selection.legal
                              ? selection.kind === 'found'
                                ? 'This tile will found a new hotel chain.'
                                : selection.kind === 'merge'
                                  ? 'This move will trigger a merger.'
                                  : selection.kind === 'grow'
                                    ? `Grow ${selection.chains.map(chainName).join(' and ')} with this hotel.`
                                    : 'A fresh start. Place an independent hotel.'
                              : selection.reason
                            : legal.length
                              ? 'Choose a tile from your rack or a highlighted space on the board.'
                              : (game.placementsThisTurn ?? 0) > 0
                                ? 'No more tiles can be placed this turn. Finish placement and continue to investing.'
                                : game.bag.length && (game.removalsThisTurn ?? 0) === 0
                                  ? 'None of your tiles can be played. Reveal and set aside the entire rack, then draw replacements and play if possible.'
                                  : 'No legal placement remains and no rack exchange is available. Continue to investing.'
                          : `${actor.name} is finding their next opportunity.`}
                      </p>
                      <div className="tile-rack" aria-label="Your tile rack">
                        {player.hand.map((tile, i) => {
                          const info = analyzeTile(game, tile);
                          return (
                            <button
                              key={`${tile}-${i}`}
                              className={`rack-tile ${selected === tile ? 'selected' : ''} ${!info.legal ? 'rack-blocked' : ''}`}
                              disabled={!controllable}
                              title={info.reason || `Place ${tile}`}
                              onClick={() => { setRemovalMode(false); setSelectedRemoval(null); select(tile); }}
                            >
                              <span>{tile}</span>
                              <small>
                                {info.permanent ? (
                                  <LockKeyhole size={12} />
                                ) : info.kind === 'merge' ? (
                                  'MERGER'
                                ) : info.kind === 'found' ? (
                                  'FOUND'
                                ) : (
                                  'HOTEL'
                                )}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                      {controllable && rules.removalsPerTurn > 0 && (game.removalsThisTurn ?? 0) < rules.removalsPerTurn && <button
                        className={`house-remove-toggle ${removalMode ? 'active' : ''}`}
                        onClick={() => { setRemovalMode((current) => !current); setSelectedRemoval(null); setSelected(null); }}>
                        {removalMode ? 'Cancel removal' : `Remove a tile · ${rules.removalsPerTurn - (game.removalsThisTurn ?? 0)} left`}
                      </button>}
                      {controllable && permanentlyBlocked.length > 0 && !removalMode && <button className="dead-tile-replace" onClick={() => action({ type: 'replace-dead-tiles' })}>
                        <LockKeyhole size={14} /> Retire only {permanentlyBlocked.length} permanently blocked tile{permanentlyBlocked.length === 1 ? '' : 's'}
                      </button>}
                      {controllable && (
                        <div className="action-footer">
                          <span className="small muted">{game.bag.length} tiles in the bag</span>
                          {removalMode ? (
                            <button className="button primary" disabled={!selectedRemoval} onClick={() => selectedRemoval && action({ type: 'remove', tile: selectedRemoval })}>
                              Remove {selectedRemoval || 'a tile'} <ArrowRight size={16} />
                            </button>
                          ) : legal.length ? (
                            <button
                              className="button primary"
                              disabled={!selected || !selection?.legal}
                              onClick={() => selected && action({ type: 'place', tile: selected })}
                            >
                              Place {selected || 'a tile'} <ArrowRight size={16} />
                            </button>
                          ) : (game.placementsThisTurn ?? 0) > 0 ? (
                            <button className="button primary" onClick={() => action({ type: 'finish-placing' })}>Finish placing <ArrowRight size={16} /></button>
                          ) : (
                            <button
                              className="button primary"
                              onClick={() => action({ type: game.bag.length && (game.removalsThisTurn ?? 0) === 0 ? 'exchange-hand' : 'pass' })}
                            >
                              {game.bag.length && (game.removalsThisTurn ?? 0) === 0 ? 'Exchange entire rack' : 'Skip placement · Invest'}{' '}
                              <ArrowRight size={16} />
                            </button>
                          )}
                        </div>
                      )}
                      {controllable && !removalMode && (game.placementsThisTurn ?? 0) > 0 && rules.placementsPerTurn > 1 && legal.length > 0 && <button className="house-finish-placing" onClick={() => action({ type: 'finish-placing' })}>Finish placing and invest now</button>}
                    </>
                  )}
                  {game.phase === 'found' && (
                    <>
                      <p className="action-description">
                        Give these hotels a name. Receive one free share if the bank has any
                        available. There is no founder’s bonus when the stock is exhausted.
                      </p>
                      <div className="chain-choices">
                        {getAvailableChains(game).map((id) => {
                          const c = CHAINS.find((c) => c.id === id)!;
                          return (
                            <button
                              disabled={!controllable}
                              key={id}
                              onClick={() => action({ type: 'found', chain: id })}
                            >
                              <span
                                className="chain-logo"
                                style={{ background: c.light, color: c.color }}
                              >
                                {c.abbreviation}
                              </span>
                              <strong>{c.name}</strong>
                              <ArrowRight size={15} />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {(game.phase === 'merger-survivor' || game.phase === 'merger-order') && (
                    <>
                      <p className="action-description">
                        {game.phase === 'merger-survivor'
                          ? 'The largest chains are tied. Choose the name that survives.'
                          : 'These acquired chains are tied. Choose which resolves first.'}
                      </p>
                      <div className="chain-choices">
                        {(game.phase === 'merger-survivor'
                          ? game.merger!.survivorOptions
                          : game.merger!.orderOptions
                        ).map((id) => {
                          const c = CHAINS.find((c) => c.id === id)!;
                          return (
                            <button
                              disabled={!controllable}
                              key={id}
                              onClick={() =>
                                action({
                                  type:
                                    game.phase === 'merger-survivor'
                                      ? 'choose-survivor'
                                      : 'choose-acquired',
                                  chain: id,
                                })
                              }
                            >
                              <span
                                className="chain-logo"
                                style={{ background: c.light, color: c.color }}
                              >
                                {c.abbreviation}
                              </span>
                              <strong>{c.name}</strong>
                              <ArrowRight size={15} />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {game.phase === 'merger-shares' && acquired && (
                    <>
                      <div className="merger-intro">
                      <p className="action-description">
                        <strong>{chainName(acquired)}</strong> joins{' '}
                        <strong>{chainName(game.merger!.survivor!)}</strong>.{' '}
                        {actorHoldingsVisible
                          ? `${actor.id === viewerId ? 'You own' : `${actor.name} owns`} ${owned} shares.`
                          : `${actor.name} decides how to settle shares.`}{' '}
                        Bonuses paid.
                      </p>
                      {actor.id === viewerId && !privateGate && <div className="merger-rack" aria-label="Your tile rack during merger">
                        <div><strong>Your tile rack</strong><span>Keep your next move in view.</span></div>
                        <div className="merger-rack-tiles">{player.hand.length ? player.hand.map((tile) => <span key={tile} className="merger-rack-tile">{tile}</span>) : <em>No tiles left in your rack</em>}</div>
                      </div>}
                      </div>
                      {controllable && (
                        <>
                          <div className="merger-controls">
                            <div>
                              <span>
                                <strong>Sell</strong>
                                <small>{money(game.merger!.sharePrice)} per share</small>
                              </span>
                              <div className="stepper">
                                <button
                                  aria-label="Sell fewer shares"
                                  disabled={sell === 0}
                                  onClick={() => setSell((v) => v - 1)}
                                >
                                  <Minus size={14} />
                                </button>
                                <b>{sell}</b>
                                <button
                                  aria-label="Sell more shares"
                                  disabled={sell + trade >= owned}
                                  onClick={() => setSell((v) => v + 1)}
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            </div>
                            <div>
                              <span>
                                <strong>Trade</strong>
                                <small>
                                  2 acquired → 1 survivor · {availability(game.merger!.survivor!)}
                                </small>
                              </span>
                              <div className="stepper">
                                <button
                                  aria-label="Trade fewer shares"
                                  disabled={trade === 0}
                                  onClick={() => setTrade((v) => v - 2)}
                                >
                                  <Minus size={14} />
                                </button>
                                <b>{trade}</b>
                                <button
                                  aria-label="Trade more shares"
                                  disabled={
                                    sell + trade + 2 > owned ||
                                    trade / 2 >= game.bank[game.merger!.survivor!]
                                  }
                                  onClick={() => setTrade((v) => v + 2)}
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            </div>
                            <div>
                              <span>
                                <strong>Keep</strong>
                                <small>For a possible comeback</small>
                              </span>
                              <b>{owned - sell - trade}</b>
                            </div>
                          </div>
                          <div className="action-footer">
                            <span className="small muted">
                              Receive {money(sell * game.merger!.sharePrice)} + {trade / 2} survivor
                              shares
                            </span>
                            <button
                              className="button primary"
                              onClick={() => action({ type: 'resolve-shares', sell, trade })}
                            >
                              Confirm choices <Check size={16} />
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {game.phase === 'buy' && (
                    <>
                      <p className="action-description">
                        {controllable
                          ? `Choose up to ${rules.buyLimit} shares${rules.trading ? ', plus one extra buy for each share sold (up to three)' : ''}. A little foresight goes a long way.`
                          : `${actor.name} is choosing their investments.`}
                      </p>
                      {controllable && (
                        <>
                          <div className="order-summary">
                            {quantity || soldCount ? (
                              <>
                                <span>
                                  {rules.trading ? `${quantity} buying · ${soldCount} selling` : `${quantity} share${quantity !== 1 ? 's' : ''} in your order`}
                                </span>
                                <strong>{money(total - saleValue)}</strong>
                              </>
                            ) : (
                              <span>No shares selected. You can also save your cash.</span>
                            )}
                          </div>
                          <div className="action-footer">
                            <span className="small muted">
                              {money(player.cash + saleValue - total)} remaining
                            </span>
                            <button
                              className="button primary"
                              disabled={!orderValid}
                              onClick={() => action({ type: 'buy', stocks: cart, sellStocks: sellCart })}
                            >
                              {quantity || soldCount ? rules.trading ? 'Confirm market order' : `Invest ${money(total)}` : 'Skip buying'}{' '}
                              <ArrowRight size={16} />
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              {controllable && canEndGame(game) && !game.endDeclared && (
                <div className="end-choice"><p>End conditions are met. You may declare the final turn, or finish investing to keep playing. {player.hand.length} tile{player.hand.length === 1 ? '' : 's'} remain in your rack.</p><button className="declare-end" onClick={() => action({ type: 'declare-end' })}><Trophy size={15} /> Declare the final turn</button></div>
              )}
              {game.endDeclared && (
                <div className="inline-note">
                  <Trophy size={16} /> Final turn declared. Finish your turn to settle all holdings.
                </div>
              )}
            </section>
          )}
          {hints && !isEnded && (
            <div className="strategy-note">
              <Sparkles size={17} />
              <span>
                <strong>A little perspective.</strong>{' '}
                {active.length < 2
                  ? 'A founder’s free share is your first step toward a majority.'
                  : 'Merger bonuses can be worth more than the shares themselves. Keep an eye on smaller chains.'}
              </span>
            </div>
          )}
        </div>
        <aside id="game-market-panel" className="market-panel">
          <div className="market-tabs">
            {isEnded && (
              <button
                className={tab === 'results' ? 'active' : ''}
                onClick={() => setTab('results')}
                aria-label="Results"
              >
                <Trophy size={16} /> Results
              </button>
            )}
            <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}>
              <TrendingUp size={16} /> Market
            </button>
            <button
              className={tab === 'investors' ? 'active' : ''}
              onClick={() => setTab('investors')}
              aria-label="Investors"
            >
              <Users size={16} />
            </button>
            <button
              className={tab === 'activity' ? 'active' : ''}
              onClick={() => setTab('activity')}
              aria-label="Activity"
            >
              <Layers3 size={16} />
            </button>
            <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')} aria-label="House rules">
              <Settings2 size={16} />
            </button>
          </div>
          {tab === 'results' && isEnded && (
            <div className="end-card">
              <div className="end-trophy">
                <Trophy size={34} />
              </div>
              <span className="eyebrow">THE CLOSING BELL</span>
              <h2>
                {game.winnerIds.length > 1
                  ? 'A shared victory.'
                  : `${game.results.find((r) => r.rank === 1)?.name} takes the crown.`}
              </h2>
              <p>{game.endReason} A vision well invested.</p>
              <div className="results-list">
                {game.results.map((r) => (
                  <div key={r.playerId}>
                    <span className="result-rank">
                      {r.rank === 1 ? <Crown size={19} /> : String(r.rank).padStart(2, '0')}
                    </span>
                    <strong>{r.name}</strong>
                    <span className="result-details">
                      {money(r.cashBefore)} cash + {money(r.bonuses)} bonuses +{' '}
                      {money(r.stocksValue)} stock
                    </span>
                    <b>{money(r.total)}</b>
                  </div>
                ))}
              </div>
              <button className="button primary" onClick={onHome}>
                Back to the clubhouse <ArrowRight size={17} />
              </button>
            </div>
          )}
          {tab === 'market' && (
            <>
              <div className="market-heading">
                <div>
                  <h3>The stock exchange</h3>
                  <p>
                    {active.length} active chains ·{' '}
                    {hiddenBank ? 'Availability only' : hotels.every((hotel) => (rules.shareSupply[hotel.id] ?? 25) === 25) ? '25 shares each' : 'Custom share supplies'}
                    {rules.marketMode !== 'off' && ` · ${game.marketShift === 0 ? 'Normal market' : `${Math.abs(game.marketShift ?? 0)} row${Math.abs(game.marketShift ?? 0) === 1 ? '' : 's'} ${game.marketShift! < 0 ? 'low' : 'high'}`}`}
                  </p>
                </div>
                <span className="market-open">{game.phase === 'buy' ? 'OPEN' : 'LIVE'}</span>
              </div>
              {game.lastRoundRolls && (rules.dividends || rules.marketMode !== 'off') && <div className="round-report" role="status">
                <Sparkles size={16} />
                <span><strong>Round {game.lastRoundRolls.round} rolled</strong><br />
                  {rules.dividends && (game.lastRoundRolls.dividendDie === null ? 'No full cluster · no dividend' : `Dividend die ${game.lastRoundRolls.dividendDie}${game.lastRoundRolls.stockDie ? ` · stock die ${game.lastRoundRolls.stockDie} (${chainName(game.lastRoundRolls.chain!)})` : ' · no payout'}`)}
                  {rules.dividends && rules.marketMode !== 'off' ? ' · ' : ''}
                  {rules.marketMode !== 'off' && `Market die ${game.lastRoundRolls.marketDie} · ${game.lastRoundRolls.marketShift === 0 ? 'normal' : `${Math.abs(game.lastRoundRolls.marketShift)} row${Math.abs(game.lastRoundRolls.marketShift) === 1 ? '' : 's'} ${game.lastRoundRolls.marketShift < 0 ? 'low' : 'high'}`}`}
                </span>
              </div>}
              <div className="stock-list">
                {hotels.map((c) => {
                  const size = getChainSize(game, c.id),
                    price = getSharePrice(game, c.id),
                    canBuy = controllable && game.phase === 'buy' && size > 0;
                  return (
                    <div className={`stock-row ${!size ? 'inactive' : ''}`} key={c.id}>
                      <div className="stock-main">
                        <span
                          className="chain-logo"
                          style={{ background: c.light, color: c.color }}
                        >
                          {c.abbreviation}
                        </span>
                        <div className="stock-name">
                          <strong>
                            {c.name} {size >= 11 && <ShieldCheck size={12} />}
                          </strong>
                          <span>
                            {size
                              ? `${size} hotels · ${availability(c.id)}`
                              : game.merger?.acquired === c.id
                                ? `Acquired · ${money(game.merger.sharePrice)} settlement`
                                : ownHoldingsVisible && player.stocks[c.id]
                                  ? 'Inactive · shares retained'
                                  : 'Not yet founded'}
                          </span>
                        </div>
                        <div className="stock-price">
                          <strong>{size ? money(price) : '—'}</strong>
                          <span>
                            {ownHoldingsVisible
                              ? `${player.stocks[c.id]} owned`
                              : 'Private holdings'}
                          </span>
                        </div>
                      </div>
                      {canBuy && (
                        <div className="stock-purchase">
                          <span>
                            {cart[c.id] ? `${cart[c.id]} in your order` : 'Add to your portfolio'}
                          </span>
                          <div className="stepper">
                            <button
                              aria-label={`Remove ${c.name} share`}
                              disabled={!cart[c.id]}
                              onClick={() => add(c.id, -1)}
                            >
                              <Minus size={13} />
                            </button>
                            <b>{cart[c.id]}</b>
                            <button
                              aria-label={`Buy ${c.name} share`}
                              disabled={
                                quantity >= purchaseLimit ||
                                total + price > player.cash + saleValue ||
                                cart[c.id] >= game.bank[c.id] + sellCart[c.id]
                              }
                              onClick={() => add(c.id, 1)}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                      )}
                      {controllable && game.phase === 'buy' && rules.trading && player.stocks[c.id] > 0 && <div className="stock-purchase stock-sale">
                        <span>{sellCart[c.id] ? `${sellCart[c.id]} to sell · ${money(price)} each` : `Sell held shares · ${money(price)} each`}</span>
                        <div className="stepper">
                          <button aria-label={`Sell fewer ${c.name} shares`} disabled={!sellCart[c.id]}
                            onClick={() => setSellCart((prior) => ({ ...prior, [c.id]: Math.max(0, prior[c.id] - 1) }))}><Minus size={13} /></button>
                          <b>{sellCart[c.id]}</b>
                          <button aria-label={`Sell more ${c.name} shares`} disabled={soldCount >= 3 || sellCart[c.id] >= player.stocks[c.id]}
                            onClick={() => setSellCart((prior) => ({ ...prior, [c.id]: prior[c.id] + 1 }))}><Plus size={13} /></button>
                        </div>
                      </div>}
                    </div>
                  );
                })}
              </div>
              <div className="market-footer">
                <Landmark size={17} />
                <p>
                  2008 shareholder bonuses
                  <br />
                  <span>Majority: 10× · Minority: 5× share price</span>
                </p>
              </div>
            </>
          )}
          {tab === 'investors' && (
            <InvestorPanel
              game={game}
              viewerId={viewerId}
              hideOpponentHoldings={hiddenHoldings}
              hiddenMoney={hiddenCash}
              privateGate={privateGate}
            />
          )}
          {tab === 'activity' && (
            <ActivityPanel
              game={game}
              viewerId={viewerId}
              hideOpponentHoldings={hiddenHoldings || rules.hiddenMoney}
              privateGate={privateGate}
            />
          )}
          {tab === 'rules' && <div className="house-rules-summary">
            <h3>House rules</h3>
            <p><strong>Hotels</strong> · {hotels.length} in this game</p>
            <div className="hotel-roster-summary">{hotels.map((hotel) => <span key={hotel.id} style={{ '--hotel-color': hotel.color, '--hotel-light': hotel.light } as CSSProperties}>{hotel.name} · {rules.shareSupply[hotel.id] ?? 25} shares</span>)}</div>
            <p><strong>Opening</strong> · {rules.startingTilesPerPlayer} tiles per person, {money(rules.startingCash)} cash</p>
            <p><strong>Turn</strong> · place up to {rules.placementsPerTurn}, remove up to {rules.removalsPerTurn}, buy up to {rules.buyLimit} shares</p>
            <p><strong>Timer</strong> · {rules.turnTimerSeconds ? `${rules.turnTimerSeconds} seconds` : 'Off'}</p>
            <p><strong>Privacy</strong> · cash {hiddenCash ? 'hidden' : 'public'}; purchases {rules.anonymousBuying ? 'anonymous' : 'public'}</p>
            <p><strong>Dividends</strong> · {rules.dividends ? 'On' : 'Off'}; <strong>Trading</strong> · {rules.trading ? 'On' : 'Off'}</p>
            <p><strong>Market</strong> · {rules.marketMode === 'off' ? 'Printed prices' : rules.marketMode === 'crazy' ? 'Crazy fluctuation' : 'Fluctuation'}{rules.marketMode !== 'off' ? ` · ${game.marketShift === 0 ? 'normal prices' : `${Math.abs(game.marketShift ?? 0)} row${Math.abs(game.marketShift ?? 0) === 1 ? '' : 's'} ${game.marketShift! < 0 ? 'lower' : 'higher'}`}` : ''}</p>
            {game.lastRoundRolls && <p><strong>Last round</strong> · {game.lastRoundRolls.dividendDie !== null ? `dividend die ${game.lastRoundRolls.dividendDie}` : 'no dividend roll'}{game.lastRoundRolls.stockDie !== null ? `, stock die ${game.lastRoundRolls.stockDie}` : ''}{game.lastRoundRolls.marketDie !== null ? `, market die ${game.lastRoundRolls.marketDie}` : ''}</p>}
          </div>}
        </aside>
      </div>
    </div>
  );
}

interface PortfolioVisibilityProps {
  game: GameState;
  viewerId: string;
  hideOpponentHoldings?: boolean;
  hiddenMoney?: boolean;
  privateGate?: boolean;
}

/** Render stock details only after a private handoff, and respect memory mode for opponents. */
export function InvestorPanel({
  game,
  viewerId,
  hideOpponentHoldings = false,
  hiddenMoney = false,
  privateGate = false,
}: PortfolioVisibilityProps) {
  return (
    <div className="investor-list">
      <h3>At the table</h3>
      <p className="small muted">
        {privateGate
          ? 'Holdings stay private until the device is handed over.'
          : hideOpponentHoldings && game.phase !== 'ended'
            ? 'Memory mode. Your portfolio stays visible; remember the others’ moves.'
            : 'Open holdings. Private opportunities.'}
      </p>
      {game.players.map((p, i) => {
        const visible =
          game.phase === 'ended' || (!privateGate && (!hideOpponentHoldings || p.id === viewerId));
        return (
          <details key={p.id} open={p.id === viewerId}>
            <summary>
              <span
                className="avatar small-avatar"
                style={{ '--avatar': colors[i] } as CSSProperties}
              >
                {p.name[0]}
              </span>
              <strong>{p.name}</strong>
              <span>{hiddenMoney && p.id !== viewerId && game.phase !== 'ended' ? 'Private' : money(p.cash)}</span>
              <ChevronDown size={14} />
            </summary>
            {visible ? (
              <div className="holdings">
                {CHAINS.filter((chain) => getHouseRules(game).hotelChains.includes(chain.id)).map((c) => (
                  <div key={c.id}>
                    <span>
                      <i style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <strong>{p.stocks[c.id]}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="hidden-holdings">
                <LockKeyhole size={18} />
                <span>
                  {privateGate
                    ? 'Holdings are private during handoff.'
                    : 'Holdings hidden. Remember their moves.'}
                </span>
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}

function activityMessage(log: GameLog, game: GameState, viewerId: string, hide: boolean) {
  const rules = getHouseRules(game);
  if (game.phase !== 'ended' && log.type === 'dividend' && (rules.hiddenMoney || rules.anonymousBuying) && log.playerId !== viewerId)
    return log.playerId ? 'A private dividend was paid.' : `Round ${Math.ceil(log.turn / game.players.length)}: dividend resolved privately.`;
  if (game.phase !== 'ended' && rules.anonymousBuying && (log.type === 'buy' || log.type === 'sell') && log.playerId !== viewerId)
    return 'An investor completed a private market order.';
  if (!hide || game.phase === 'ended' || log.playerId === viewerId) return log.message;
  const name = game.players.find((player) => player.id === log.playerId)?.name || 'An investor';
  switch (log.type) {
    case 'buy':
    case 'sell':
      return `${name} completed their investment decision.`;
    case 'shares':
      return `${name} resolved their merger shares.`;
    case 'found': {
      const chain = CHAINS.find((chain) => chain.id === log.chain);
      return `${name} founded ${chain?.name || 'a hotel chain'}.`;
    }
    case 'bonus':
      return `${name} received a shareholder bonus.`;
    default:
      return log.message;
  }
}

/** Never leave hidden purchase or merger quantities in the persistent activity history. */
export function ActivityPanel({
  game,
  viewerId,
  hideOpponentHoldings = false,
  privateGate = false,
}: PortfolioVisibilityProps) {
  return (
    <div className="activity-list">
      <h3>The story so far</h3>
      <p className="small muted">
        {(hideOpponentHoldings || privateGate) && game.phase !== 'ended'
          ? 'The city’s history. Other portfolios stay off the record.'
          : 'Every move, every opportunity.'}
      </p>
      <ol>
        {[...game.logs]
          .reverse()
          .slice(0, 60)
          .map((log) => (
            <li key={log.id}>
              <span className={`log-dot log-${log.type}`} />
              <div>
                <small>TURN {log.turn}</small>
                <p>
                  {activityMessage(
                    log,
                    game,
                    privateGate ? '' : viewerId,
                    hideOpponentHoldings || privateGate,
                  )}
                </p>
              </div>
            </li>
          ))}
      </ol>
    </div>
  );
}
