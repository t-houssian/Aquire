import { shareDecisionText } from './ShareDecisionReveal';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  TrendingDown,
  TrendingUp,
  Users,
  ZoomIn,
  Scan,
  RotateCw,
  Maximize2,
  Minimize2,
  Box,
} from 'lucide-react';
import {
  CHAINS,
  analyzeTile,
  canEndGame,
  endConditionMet,
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
import CharacterAvatar from './CharacterAvatar';
import { getCharacter } from '../game/characters';
import { mapThemeStyle } from './MapPreview';
import type { CityTileLayout } from './CityScene';
import HotelLabels from './HotelLabels';
import { hotelLabels } from './hotel-markers';
const CityScene = lazy(() => import('./CityScene'));
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
function centerBoardTile(stage: HTMLDivElement | null, tile: Tile | null) {
  if (!stage || !tile) return;
  const target = stage.querySelector<HTMLElement>(`[data-tile="${CSS.escape(tile)}"]`);
  if (!target) return;
  // Pan only the board, keeping the rack and confirmation button stationary.
  const frame = stage.getBoundingClientRect(), cell = target.getBoundingClientRect();
  stage.scrollLeft += cell.left + cell.width / 2 - frame.left - frame.width / 2;
  stage.scrollTop += cell.top + cell.height / 2 - frame.top - frame.height / 2;
}
export default function GameView({
  game,
  viewerId,
  onAction,
  onHome,
  onMenu,
  onRules,
  onSettings,
  onShowMergerPayout,
  onProfile,
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
  onShowMergerPayout?: (entry: GameState['logs'][number]) => void;
  onProfile?: () => void;
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
  const cityMap = getMap(game.mapId);
  const expansionBoard = cityMap.maxPlayers > 6 || cityMap.columns !== 12 || cityMap.rows !== 9;
  const slenderBoard = Math.max(cityMap.columns / cityMap.rows, cityMap.rows / cityMap.columns) >= 2;
  const permanentlyBlocked = actor.hand.filter((tile) => analyzeTile(game, tile).permanent);
  const [selected, setSelected] = useState<Tile | null>(null),
    [cart, setCart] = useState<Stocks>(emptyCart),
    [sellCart, setSellCart] = useState<Stocks>(emptyCart),
    [removalMode, setRemovalMode] = useState(false),
    [selectedRemoval, setSelectedRemoval] = useState<Tile | null>(null),
    [clockNow, setClockNow] = useState(Date.now()),
    [sell, setSell] = useState(0),
    [trade, setTrade] = useState(0),
    [mobileEnlargedBoard, setMobileEnlargedBoard] = useState(false),
    [desktopZoom, setDesktopZoom] = useState(1),
    [focusedBoard, setFocusedBoard] = useState(false),
    [cityReady, setCityReady] = useState(false),
    [cityView, setCityView] = useState(true),
    [cityLayout, setCityLayout] = useState<CityTileLayout[]>([]),
    [boardRotation, setBoardRotation] = useState<boolean | null>(null),
    [boardFit, setBoardFit] = useState({ compact: false, rotated: false, short: false }),
    [compactView, setCompactView] = useState<'board' | 'market'>(game.phase === 'buy' ? 'market' : 'board'),
    [tab, setTab] = useState<'market' | 'investors' | 'activity' | 'results' | 'rules'>(
      game.phase === 'ended' ? 'results' : 'market',
    );
  const boardStage = useRef<HTMLDivElement>(null);
  const zoomAnchor = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const enlargedBoard = boardFit.compact ? mobileEnlargedBoard : desktopZoom > 1;
  const enlargedRef = useRef(enlargedBoard);
  enlargedRef.current = enlargedBoard;
  const cameraIncline = boardFit.compact || boardFit.short ? 13 : 19;
  const rotatedBoard = boardRotation ?? (boardFit.compact && boardFit.rotated);
  const boardColumns = rotatedBoard ? cityMap.rows : cityMap.columns;
  const boardRows = rotatedBoard ? cityMap.columns : cityMap.rows;
  const cameraDistance = Math.hypot(30, cameraIncline);
  const sceneRatio = (boardColumns + .4) / ((boardRows + .4) * 30 / cameraDistance + 1.38 * cameraIncline / cameraDistance);
  const projectedTiles = useMemo(() => new Map(cityLayout.map(tile => [tile.id, tile])), [cityLayout]);
  const boardTiles = useMemo(() => rotatedBoard ? Array.from({ length: cityMap.gridTiles.length }, (_, i) => {
    const column = Math.floor(i / cityMap.rows);
    const row = cityMap.rows - 1 - i % cityMap.rows;
    return cityMap.gridTiles[row * cityMap.columns + column];
  }) : cityMap.gridTiles, [rotatedBoard, cityMap]);
  const changeDesktopZoom = (value: number) => {
    const next = Math.min(3, Math.max(1, Math.round(value * 100) / 100));
    if (next === desktopZoom) return;
    const stage = boardStage.current, wrap = stage?.querySelector<HTMLElement>('.board-wrap');
    zoomAnchor.current = null;
    if (next !== 1 && stage && wrap) {
      const frame = stage.getBoundingClientRect(), board = wrap.getBoundingClientRect();
      const offsetX = stage.clientWidth / 2, offsetY = stage.clientHeight / 2;
      zoomAnchor.current = { x: (frame.left + offsetX - board.left) / board.width,
        y: (frame.top + offsetY - board.top) / board.height, offsetX, offsetY };
    }
    setDesktopZoom(next);
  };
  useLayoutEffect(() => {
    const stage = boardStage.current, wrap = stage?.querySelector<HTMLElement>('.board-wrap');
    if (boardFit.compact || !stage || !wrap) return;
    if (desktopZoom === 1) { stage.scrollLeft = 0; stage.scrollTop = 0; }
    else if (zoomAnchor.current) {
      const anchor = zoomAnchor.current, frame = stage.getBoundingClientRect(), board = wrap.getBoundingClientRect();
      stage.scrollLeft += board.left + anchor.x * board.width - frame.left - anchor.offsetX;
      stage.scrollTop += board.top + anchor.y * board.height - frame.top - anchor.offsetY;
    }
    zoomAnchor.current = null;
  }, [desktopZoom, boardFit.compact, cityReady]);
  useEffect(() => {
    const stage = boardStage.current;
    if (!stage || !enlargedBoard) return;
    let drag: { x: number; y: number; left: number; top: number; moved: boolean; id: number } | null = null;
    let suppressClick = false;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      suppressClick = false;
      drag = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, moved: false, id: event.pointerId };
    };
    const move = (event: PointerEvent) => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 5) {
        drag.moved = true;
        stage.setPointerCapture(drag.id);
        stage.classList.add('is-dragging');
        stage.scrollLeft = drag.left - dx; stage.scrollTop = drag.top - dy;
      }
    };
    const up = () => {
      if (drag) { suppressClick = drag.moved; if (stage.hasPointerCapture(drag.id)) stage.releasePointerCapture(drag.id); }
      drag = null; stage.classList.remove('is-dragging');
    };
    const click = (event: MouseEvent) => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; } };
    stage.addEventListener('pointerdown', down); stage.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('click', click, true);
    return () => { stage.removeEventListener('pointerdown', down); stage.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); stage.removeEventListener('pointercancel', up); stage.removeEventListener('click', click, true); stage.classList.remove('is-dragging'); };
  }, [enlargedBoard]);
  useEffect(() => {
    const stage = boardStage.current;
    if (!stage) return;
    const compact = window.matchMedia('(max-width: 1059px)');
    const portrait = window.matchMedia('(orientation: portrait)');
    const short = window.matchMedia('(max-height: 700px)');
    const update = () => {
      if (!stage.clientWidth || !stage.clientHeight) return;
      const width = stage.clientWidth - 31, height = stage.clientHeight - 31;
      const normalSize = Math.min(width / cityMap.columns, height / cityMap.rows);
      const rotatedSize = Math.min(width / cityMap.rows, height / cityMap.columns);
      const next = { compact: compact.matches, rotated: (expansionBoard || cityView) && rotatedSize > normalSize * 1.15, short: short.matches };
      setBoardFit((prior) => prior.compact === next.compact && prior.rotated === next.rotated && prior.short === next.short ? prior : next);
    };
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    compact.addEventListener('change', update);
    portrait.addEventListener('change', update);
    short.addEventListener('change', update);
    update();
    return () => {
      observer.disconnect();
      compact.removeEventListener('change', update);
      portrait.removeEventListener('change', update);
      short.removeEventListener('change', update);
    };
  }, [cityMap, expansionBoard, cityView]);
  useEffect(() => {
    setMobileEnlargedBoard(false);
    setDesktopZoom(1);
    zoomAnchor.current = null;
    setFocusedBoard(false);
    setBoardRotation(null);
  }, [game.id]);
  useEffect(() => {
    const stage = boardStage.current;
    if (!stage || !selected) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (!enlargedRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => centerBoardTile(stage, selected));
    });
    observer.observe(stage);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [selected, mobileEnlargedBoard, compactView, rotatedBoard]);
  useEffect(() => {
    setTab(game.phase === 'ended' ? 'results' : 'market');
  }, [game.id, game.phase === 'ended']);
  useEffect(() => {
    // Only the viewer's own decisions navigate the table automatically.
    // Opponent phase changes must not close rules or portfolios being read.
    if (actor.id !== viewerId || actor.isBot) return;
    setCompactView(game.phase === 'buy' ? 'market' : 'board');
    if (game.phase === 'buy') setTab('market');
  }, [game.id, game.phase, game.turn, actor.id, actor.isBot, viewerId]);
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
  const marketShift = game.marketShift ?? 0;
  const marketTone = marketShift < 0 ? 'low' : marketShift > 0 ? 'high' : 'normal';
  const marketStatus = marketShift === 0 ? 'Normal' : `${marketShift < 0 ? 'Low' : 'High'} · ${marketShift > 0 ? '+' : ''}${marketShift}`;
  const marketFrequency = {
    round: 'after each round',
    turn: 'before each turn',
    'two-rounds': 'every 2 rounds',
    'three-rounds': 'every 3 rounds',
  }[rules.marketFrequency];
  const hotels = CHAINS.filter((chain) => rules.hotelChains.includes(chain.id));
  const anonymous = rules.anonymousBuying && game.phase !== 'ended';
  const hiddenCash = rules.hiddenMoney || anonymous;
  const hiddenBank = hideStockAvailability || anonymous;
  const hiddenHoldings = hideOpponentHoldings || anonymous;
  const soldCount = Object.values(sellCart).reduce((a, b) => a + b, 0);
  const saleValue = hotels.reduce((sum, chain) => sum + sellCart[chain.id] * getSharePrice(game, chain.id), 0);
  const purchaseLimit = rules.buyLimit + soldCount;
  const removableTiles = new Set(controllable && game.phase === 'place' ? getRemovableTiles(game) : []);
  const rackPreview = !privateGate && (game.phase === 'buy' || game.phase.startsWith('merger-'));
  const legal = rackPreview || (game.phase === 'place' && controllable)
    ? getLegalTiles(game, player.id) : [];
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
  const sceneTiles = useMemo(() => {
    const spaces = new Set(cityMap.tiles);
    return boardTiles.map(tile => {
      const chain = game.board[tile];
      return { id: tile, void: !spaces.has(tile), occupied: Boolean(chain), color: CHAINS.find(c => c.id === chain)?.color, model: CHAINS.findIndex(c => c.id === chain),
        selected: tile === selected || tile === selectedRemoval,
        inHand: !privateGate && player.hand.includes(tile) && legal.includes(tile) };
    });
  }, [boardTiles, cityMap, game.board, selected, selectedRemoval, privateGate, player.hand, legal.join(',')]);
  const headquarters: Partial<Record<ChainId, Tile>> = Object.fromEntries(
    game.logs
      .filter((log) => log.type === 'found' && log.chain && log.tile)
      .map((log) => [log.chain, log.tile]),
  );
  const labels = hotelLabels(game.board, boardTiles, boardColumns, headquarters);
  const select = (tile: Tile) => {
    if (controllable && game.phase === 'place' && player.hand.includes(tile)) {
      setSelected(tile);
      if (enlargedBoard) centerBoardTile(boardStage.current, tile);
    }
  };
  const add = (id: ChainId, change: number) =>
    setCart((prev) => ({ ...prev, [id]: Math.max(0, prev[id] + change) }));
  const chainName = (id: ChainId) => CHAINS.find((c) => c.id === id)!.name;
  const acquired = game.merger?.acquired;
  const acquisitionLogId = game.logs.filter((entry) => entry.turn === game.turn && entry.payout?.chain === acquired).at(-1)?.id ?? 0;
  const shareholderDecisions = game.logs.filter((entry) => entry.turn === game.turn && entry.id > acquisitionLogId && entry.shareDecision?.acquired === acquired);
  const owned = acquired ? actor.stocks[acquired] : 0;
  const action = (a: GameAction) => {
    if (controllable) onAction(a);
  };
  if (isEnded) return <Finale match={summarizeMatch(game, onlineCode ? 'online' : 'local')} onHome={onHome} onProfile={onProfile} viewerId={viewerId} />;
  return (
    <div className={`game-view ${expansionBoard ? 'expansion-game' : ''} ${isEnded ? 'game-ended' : ''}`} data-phase={game.phase} data-compact-view={compactView} data-board-focused={focusedBoard && compactView === 'board' || undefined} data-portrait-rail={slenderBoard && game.phase === 'place' && compactView === 'board' || undefined}>
      <div className="game-topline">
        <div className="game-navigation">
          <button className="text-button compact-menu" onClick={onMenu} aria-label="Open navigation" aria-controls="sidebar-navigation">
            <Menu size={18} />
          </button>
          <button className="text-button" onClick={onHome}>
            <ArrowLeft size={16} /> {game.campaign ? 'The Long Game' : 'The clubhouse'}
          </button>
        </div>
        <div className="landscape-balances" role="group" aria-label="Investor cash" tabIndex={0}>
          {game.players.map((p) => <span className={p.id === actor.id ? 'current' : ''} key={p.id}><span title={p.name}>{p.name}</span><strong>{hiddenCash && p.id !== viewerId ? 'Private' : money(p.cash)}</strong></span>)}
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
          <div className="game-title-row">
            <h1>
              The boardroom<span className="serif-dot">.</span>
            </h1>
            {rules.marketMode !== 'off' && <span className={`market-status-pill ${marketTone}`} role="status" title={`Market rolls ${marketFrequency}`}>
              {marketTone === 'low' ? <TrendingDown size={14} /> : marketTone === 'high' ? <TrendingUp size={14} /> : <Minus size={14} />}
              Market {marketStatus}
            </span>}
          </div>
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
              <CharacterAvatar characterId={p.characterId} avatar={p.avatar} name={p.name} />
              {p.id === actor.id && !isEnded && <span />}
            </div>
            <div>
              <strong>
                {p.name}
                {p.id === viewerId && <small> you</small>}
              </strong>
              <span>
                {p.isBot
                  ? getCharacter(p.characterId)?.title ?? 'The house'
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
        <span className="compact-view-context">{rules.marketMode !== 'off'
          ? <span className={`market-status-pill ${marketTone}`} role="status" title={`Market rolls ${marketFrequency}`}>
              {marketTone === 'low' ? <TrendingDown size={13} /> : marketTone === 'high' ? <TrendingUp size={13} /> : <Minus size={13} />}
              Market {marketStatus}
            </span>
          : compactView === 'board' && enlargedBoard ? 'Drag to explore' : phaseNames[game.phase]}</span>
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
          <section id="game-board-panel" className={`board-card map-themed ${expansionBoard ? 'expansion-board' : ''}`} style={{ ...mapThemeStyle(cityMap), '--map-columns': boardColumns, '--map-rows': boardRows, '--map-ratio': boardColumns / boardRows, '--map-inverse-ratio': boardRows / boardColumns, '--scene-ratio': sceneRatio, '--desktop-zoom': desktopZoom } as CSSProperties} data-map={cityMap.id} data-board-scale={enlargedBoard ? 'detail' : 'fit'} data-board-zoom={desktopZoom} data-board-rotated={rotatedBoard}>
            <div className="board-title">
              <div>
                <span className="live-dot" />
                <strong>{cityMap.id === 'classic' ? 'Acquire · The city' : cityMap.name}</strong>
                <span className="muted small">{cityMap.palette.name}</span>
              </div>
              <div className="board-tools">
                <button type="button" className="board-render-toggle" aria-label={cityView ? 'Switch to flat board' : 'Switch to 3D city'} title={cityView ? 'Switch to flat board' : 'Switch to 3D city'} aria-pressed={cityView} onClick={() => { setCityView(value => !value); setCityReady(false); }}><Box size={14} /><span>{cityView ? '3D' : '2D'}</span></button>
                <span className="tiles-count">
                  <Layers3 size={14} />
                  <span>{Object.keys(game.board).length} / {cityMap.tiles.length}</span><span className="board-stock-count"> · Rack {player.hand.length} · Bag {game.bag.length}</span>
                </span>
                <button type="button" className="board-rotate-toggle" aria-label="Rotate board" title="Rotate board · tile coordinates stay the same" aria-pressed={rotatedBoard} onClick={() => setBoardRotation(!rotatedBoard)}>
                  <RotateCw size={15} />
                </button>
                <div className="desktop-board-zoom" role="group" aria-label="Board zoom">
                  <button type="button" aria-label="Zoom out" title="Zoom out" disabled={desktopZoom <= 1} onClick={() => changeDesktopZoom(desktopZoom - .15)}><Minus size={14} /></button>
                  <button type="button" className="board-fit-button" aria-label="Fit entire board" title={`Fit entire board · ${Math.round(desktopZoom * 100)}% zoom`} onClick={() => changeDesktopZoom(1)}><Scan size={14} /><span>{Math.round(desktopZoom * 100)}%</span></button>
                  <button type="button" aria-label="Enlarge board tiles" title="Zoom in" disabled={desktopZoom >= 3} onClick={() => changeDesktopZoom(desktopZoom + .15)}><Plus size={14} /></button>
                </div>
                <button type="button" className="board-scale-toggle" aria-label={enlargedBoard ? 'Fit entire board' : 'Enlarge board tiles'} aria-pressed={enlargedBoard} onClick={() => setMobileEnlargedBoard((value) => !value)}>
                  {enlargedBoard ? <Scan size={14} /> : <ZoomIn size={14} />}
                  {enlargedBoard ? 'Fit' : 'Zoom'}
                </button>
                <button type="button" className="board-focus-toggle" aria-label={focusedBoard ? 'Show table details' : 'Focus on board'} title={focusedBoard ? 'Show table details' : 'More room for the board'} aria-pressed={focusedBoard} onClick={() => setFocusedBoard((value) => !value)}>
                  {focusedBoard ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </div>
            </div>
            <div className="board-stage" ref={boardStage} tabIndex={0} aria-label={enlargedBoard ? "City board. Drag or use arrow keys to explore." : "City board"}>
              <div className={`board-wrap ${cityView && cityReady ? 'city-projected' : ''}`}>
                <div className="board-columns">
                  {Array.from({ length: boardColumns }, (_, i) => (
                    <span key={i}>{rotatedBoard ? String.fromCharCode(65 + cityMap.rows - 1 - i) : i + 1}</span>
                  ))}
                </div>
                <div className="board-with-rows">
                  <div className="board-rows">
                    {Array.from({ length: boardRows }, (_, i) => rotatedBoard ? String(i + 1) : String.fromCharCode(65 + i)).map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </div>
                  <div className={`game-board ${cityView && cityReady ? 'city-rendered' : ''}`} role="group" aria-label="Acquire game board">
                    {cityView && <Suspense fallback={null}><CityScene tiles={sceneTiles} columns={boardColumns} rows={boardRows} incline={cameraIncline} onLayout={setCityLayout} onReady={() => setCityReady(true)} onUnavailable={() => setCityReady(false)} /></Suspense>}
                    {cityView && cityReady && <div className="city-board-axes" aria-hidden="true">
                      {Array.from({ length: boardColumns }, (_, i) => {
                        const position = projectedTiles.get(boardTiles[i]);
                        return position && <span className="city-axis-column" key={`column-${i}`} style={{ left: position.left + position.width / 2, top: position.columnLabelTop }}>{rotatedBoard ? String.fromCharCode(65 + cityMap.rows - 1 - i) : i + 1}</span>;
                      })}
                      {Array.from({ length: boardRows }, (_, i) => {
                        const position = projectedTiles.get(boardTiles[i * boardColumns]);
                        return position && <span className="city-axis-row" key={`row-${i}`} style={{ left: position.left, top: position.top + position.height / 2 }}>{rotatedBoard ? i + 1 : String.fromCharCode(65 + i)}</span>;
                      })}
                    </div>}
                    {boardTiles.map((tile) => {
                      const chain = game.board[tile];
                      const isPlayableSpace = playableSpaces.has(tile);
                      const def = CHAINS.find((c) => c.id === chain);
                      const inHand = player.hand.includes(tile) && !privateGate;
                      const enabled = controllable && game.phase === 'place' && (removalMode ? removableTiles.has(tile) : inHand);
                      const foundingHead = def ? headquarters[def.id] : undefined;
                      const projection = cityView && cityReady ? projectedTiles.get(tile) : undefined;
                      const head =
                        def &&
                        ((foundingHead && game.board[foundingHead] === def.id ? foundingHead : null) ||
                          Object.keys(game.board).find((t) => game.board[t] === chain)) === tile;
                      return (
                        <button
                          key={tile}
                          data-tile={tile}
                          className={`board-tile ${!isPlayableSpace ? 'map-void' : ''} ${chain ? 'occupied' : ''} ${chain === 'independent' ? 'independent-tile' : ''} ${def ? 'chain-tile' : ''} ${head ? 'chain-headquarters' : ''} ${!removalMode && inHand && legal.includes(tile) ? `playable${rackPreview ? ' rack-preview' : ''}` : ''} ${removalMode && removableTiles.has(tile) ? 'removal-target' : ''} ${selected === tile || selectedRemoval === tile ? 'tile-selected' : ''} ${game.lastPlacedTile === tile ? 'last-placed' : ''}`}
                          style={{ ...(def ? { '--chain': def.color, '--chain-light': def.light } : {}),
                            ...(projection ? { left: projection.left, top: projection.top, width: projection.width, height: projection.height, clipPath: projection.clipPath } : {}) } as CSSProperties}
                          aria-label={`${tile}${!isPlayableSpace ? ', outside this map' : def ? ', ' + def.name : chain ? ', independent hotel' : ''}${inHand ? ', in your hand' : ''}${rackPreview && legal.includes(tile) ? ', legal tile preview, placement disabled' : ''}`}
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
                    <HotelLabels labels={labels} columns={boardColumns} projected={cityView && cityReady ? projectedTiles : undefined} />
                  </div>
                </div>
              </div>
            </div>
            <div className="board-legend" role="group" aria-label="Hotel and tile legend" tabIndex={active.length ? 0 : undefined}>
              {active.length > 0 && <ul className="hotel-chain-key" aria-label="Hotel chains on this board">
                {active.map(chain => <li key={chain.id} style={{ '--chain': chain.color, '--chain-light': chain.light } as CSSProperties}>
                  <b aria-hidden="true">{chain.name[0]}</b>{chain.name}
                </li>)}
              </ul>}
              <span>
                <i className="legend-empty" /> Unbuilt
              </span>
              <span>
                <i className="legend-independent" /> Placed · independent
              </span>
              <span>
                <i className="legend-hand" /> {rackPreview ? 'Your options · preview only' : 'In your hand'}
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
                <div className="turn-track" aria-label="Turn progress"><span className={game.phase === 'place' ? 'current' : 'complete'} title="Place a tile">1<span>Build</span></span><i /><span className={game.phase === 'buy' ? 'current' : game.phase === 'place' ? '' : 'pending'} title="Resolve chains and invest">2<span>Invest</span></span><i /><span title="Refill your rack and end the turn">3<span>Draw</span></span></div>
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
                              ? 'Choose a tile in your rack or on the board.'
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
                                style={{ '--certificate-color': c.color, background: c.light } as CSSProperties}
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
                                style={{ '--certificate-color': c.color, background: c.light } as CSSProperties}
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
                        {onShowMergerPayout && game.logs.some((entry) => entry.payout?.chain === acquired && entry.turn === game.turn)
                          ? <button className="text-button merger-bonus-link" onClick={() => onShowMergerPayout([...game.logs].reverse().find((entry) => entry.payout?.chain === acquired && entry.turn === game.turn)!)}>View bonuses</button>
                          : 'Bonuses paid.'}
                      </p>
                      <details className="merger-decision-order">
                        <summary>Decision {game.merger!.shareholderCursor + 1} of {game.merger!.shareholders.length} · View order</summary>
                        <p>From {game.players[game.currentPlayer].name}, clockwise. Share counts determine bonuses.</p>
                        <ol aria-label="Merger shareholder decision order">
                          {game.merger!.shareholders.map((index, position) => <li key={game.players[index].id} aria-current={position === game.merger!.shareholderCursor ? 'step' : undefined}>
                            {game.players[index].name} · {position < game.merger!.shareholderCursor ? 'Done' : position === game.merger!.shareholderCursor ? 'Deciding now' : 'Waiting'}
                          </li>)}
                        </ol>
                      </details>
                      {shareholderDecisions.length > 0 && <details className="merger-decisions" open><summary>Shareholder decisions so far</summary><ol>{shareholderDecisions.map((entry) => <li key={entry.id}>{shareDecisionText(entry, game, viewerId)}</li>)}</ol></details>}
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
                          <div className="order-summary order-with-rack">
                            <div className="buy-rack" aria-label="Your tile rack while buying"><strong>Your next tiles</strong><div>{player.hand.length ? player.hand.map((tile) => <span key={tile}>{tile}</span>) : <em>Your rack is empty</em>}</div></div>
                            <div className="order-summary-total">
                            {quantity || soldCount ? (
                              <>
                                <span>
                                  {rules.trading ? `${quantity} buying · ${soldCount} selling` : `${quantity} share${quantity !== 1 ? 's' : ''} in your order`}
                                </span>
                                <strong>{money(total - saleValue)}</strong>
                              </>
                            ) : (
                              <span>No order yet.</span>
                            )}
                            </div>
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
              {controllable && game.phase === 'place' && endConditionMet(game) && <p className="end-ready-note">End conditions are met. Play a tile, then declare the final turn before finishing your stock order.</p>}
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
                <span><strong>{game.lastRoundRolls.kind === 'opening' ? 'Opening market roll' : game.lastRoundRolls.kind === 'turn' ? `Market roll before turn ${(game.lastRoundRolls.atTurn ?? 0) + 1}` : `Round ${game.lastRoundRolls.round} rolled`}</strong><br />
                  {rules.dividends && game.lastRoundRolls.kind !== 'turn' && game.lastRoundRolls.kind !== 'opening' && (game.lastRoundRolls.dividendDie === null ? 'No full cluster · no dividend' : `Dividend die ${game.lastRoundRolls.dividendDie}${game.lastRoundRolls.stockDie ? ` · stock die ${game.lastRoundRolls.stockDie} (${chainName(game.lastRoundRolls.chain!)})` : ' · no payout'}`)}
                  {rules.dividends && game.lastRoundRolls.kind !== 'turn' && game.lastRoundRolls.kind !== 'opening' && rules.marketMode !== 'off' ? ' · ' : ''}
                  {rules.marketMode !== 'off' && (game.lastRoundRolls.marketDie === null ? `Market holds ${marketStatus.toLowerCase()}` : `Market die ${game.lastRoundRolls.marketDie} · ${marketStatus.toLowerCase()}`)}
                </span>
              </div>}
              <div className={`stock-list ${rules.trading ? 'allows-trading' : ''}`}>
                {hotels.map((c) => {
                  const size = getChainSize(game, c.id),
                    price = getSharePrice(game, c.id),
                    canBuy = controllable && game.phase === 'buy' && size > 0;
                  return (
                    <div className={`stock-row ${!size ? 'inactive' : ''}`} key={c.id} style={{ '--chain': c.color, '--chain-light': c.light } as CSSProperties}>
                      <div className="stock-main">
                        <span
                          className="chain-logo"
                          style={{ '--certificate-color': c.color, background: c.light } as CSSProperties}
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
                            Buy
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
                        <span>Sell</span>
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
            <p><strong>Market</strong> · {rules.marketMode === 'off' ? 'Printed prices' : rules.marketMode === 'crazy' ? 'Crazy fluctuation' : 'Fluctuation'}{rules.marketMode !== 'off' ? ` · ${marketStatus.toLowerCase()} · rolls ${marketFrequency}` : ''}</p>
            {game.lastRoundRolls && <p><strong>Last dice event</strong> · {game.lastRoundRolls.dividendDie !== null ? `dividend die ${game.lastRoundRolls.dividendDie}` : 'no dividend die'}{game.lastRoundRolls.stockDie !== null ? `, hotel die ${game.lastRoundRolls.stockDie}` : ''}{game.lastRoundRolls.marketDie !== null ? `, market die ${game.lastRoundRolls.marketDie}` : ''}</p>}
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
                <CharacterAvatar characterId={p.characterId} avatar={p.avatar} name={p.name} />
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
