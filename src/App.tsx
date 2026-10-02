import AvatarEditor from './components/AvatarEditor';
import { readProfile, saveProfile } from './lib/profile';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  EyeOff,
  Globe2,
  Home,
  Layers3,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Trophy,
  TrendingUp,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { applyAction, CHAINS, chooseBotAction, createGame, expireTurn, getCurrentActor, getHouseRules } from './game/engine';
import type { DiceRollReport, GameAction, GameConfig, GameState } from './game/types';
import {
  money,
  playTone,
  readGames,
  readLegacyGameCount,
  readSettings,
  removeSavedGame,
  saveGame,
  saveSettings,
  readMatches,
  archiveMatch,
  type SavedGame,
} from './lib/storage';
import { makeLeaderboard, type MatchSummary } from './lib/matches';
import { endRoom, getOnlineHistory, getOnlineLeaderboard, getRoom, hasOnlineSession, leaveRoom, onlineConfigured, sendRoomAction, watchRoom, type OnlineRoom } from './lib/online';
import CityScene from './components/CityScene';
import Setup from './components/Setup';
import StoryMode from './components/StoryMode';
import CharacterAvatar from './components/CharacterAvatar';
import { storyGameConfig, getStoryChapter } from './game/campaign';
import { readStoryProgress, storyChapterUnlocked } from './lib/campaign';
import './story.css';
import GameView from './components/GameView';
import Finale from './components/Finale';
import Rulebook, { RULEBOOK_URL } from './components/Rulebook';
import Modal from './components/Modal';
import OnlinePanel from './components/OnlinePanel';
import TurnRecap from './components/TurnRecap';
import DiceReveal from './components/DiceReveal';
import ShareDecisionReveal from './components/ShareDecisionReveal';
import MergerReveal from './components/MergerReveal';
import HouseRulesControls from './components/HouseRulesControls';
import { collectTurnRecaps, type TurnRecapData } from './lib/turnRecaps';
import './sidebar.css';
import './map-themes.css';
import './house-rules.css';
import './exit-game.css';
type Page = 'story' | 'home' | 'play' | 'learn' | 'history' | 'replay';
export default function App() {
  const [profile, setProfile] = useState(readProfile);
  const [page, setPage] = useState<Page>('home');
  const [modal, setModal] = useState<'solo' | 'local' | 'online' | 'rules' | 'settings' | 'avatar' | null>(
    null,
  );
  const [localGame, setLocalGame] = useState<GameState | null>(null),
    [kind, setKind] = useState<'solo' | 'local'>('solo'),
    [saves, setSaves] = useState(readGames),
    [matches, setMatches] = useState(readMatches),
    [onlineMatches, setOnlineMatches] = useState<MatchSummary[]>([]),
    [onlineLeaders, setOnlineLeaders] = useState<ReturnType<typeof makeLeaderboard>>([]),
    [replayMatch, setReplayMatch] = useState<MatchSummary | null>(null),
    [settings, setSettings] = useState(readSettings);
  const [room, setRoom] = useState<OnlineRoom | null>(null),
    [activeMode, setActiveMode] = useState<'local' | 'online'>('local'),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [revealed, setRevealed] = useState(''),
    [mobileNav, setMobileNav] = useState(false);
  const [exitDestination, setExitDestination] = useState<Page | null>(null);
  const [endingSaveId, setEndingSaveId] = useState<string | null>(null);
  const [endingOnlineRoom, setEndingOnlineRoom] = useState(false);
  const [storyProgress, setStoryProgress] = useState(readStoryProgress);
  const [legacyGameCount] = useState(readLegacyGameCount);
  const [turnRecaps, setTurnRecaps] = useState<TurnRecapData[]>([]);
  const [diceRecaps, setDiceRecaps] = useState<DiceRollReport[]>([]);
  const [mergerRecaps, setMergerRecaps] = useState<GameState['logs']>([]);
  const continueAfterMerger = useCallback(() => {
    setMergerRecaps((pending) => pending.slice(1));
    if (activeMode === 'local') setLocalGame((current) => {
      if (!current || current.phase === 'ended') return current;
      const seconds = getHouseRules(current).turnTimerSeconds;
      return seconds ? { ...current, turnDeadlineAt: Date.now() + seconds * 1000 } : current;
    });
  }, [activeMode]);
  const previousGame = useRef<GameState | null>(null);
  const newlyStartedGameId = useRef<string | null>(null);
  const forgottenRoomCodes = useRef(new Set<string>());
  const hideSidebarButton = useRef<HTMLButtonElement>(null);
  const showSidebarButton = useRef<HTMLButtonElement>(null);
  const previousRoom = useRef<{ id: string; status: string } | null>(null);
  const game = activeMode === 'online' ? room?.game || null : localGame;
  const actor = game ? getCurrentActor(game) : null;
  const viewerId = game
    ? activeMode === 'online'
      ? room!.viewerId
      : kind === 'local'
        ? actor!.id
        : game.players.find((p) => !p.isBot)!.id
    : '';
  const closeModal = useCallback(() => setModal(null), []);
  const continueAfterRecap = useCallback(() => setTurnRecaps((pending) => pending.slice(1)), []);
  const continueAfterDice = useCallback(() => {
    setDiceRecaps((pending) => pending.slice(1));
    if (activeMode === 'local') setLocalGame((current) => {
      if (!current || current.phase === 'ended') return current;
      const seconds = getHouseRules(current).turnTimerSeconds;
      return seconds ? { ...current, turnDeadlineAt: Date.now() + seconds * 1000 } : current;
    });
  }, [activeMode]);
  const updateRoom = useCallback((next: OnlineRoom | null) => {
    if (next && forgottenRoomCodes.current.has(next.code)) return;
    if (!next) setPage('home');
    setRoom((prev) =>
      !next ? null : prev && prev.id === next.id && prev.version > next.version ? prev : next,
    );
  }, []);
  const changeRoom = (next: OnlineRoom | null) => {
    if (next) forgottenRoomCodes.current.delete(next.code);
    else if (room) forgottenRoomCodes.current.add(room.code);
    updateRoom(next);
  };
  useEffect(() => {
    const code = localStorage.getItem('aquire.room');
    if (!code || !onlineConfigured) return;
    let cancelled = false;
    void hasOnlineSession().then((session) => session ? getRoom(code) : null).then((savedRoom) => {
      if (!cancelled && savedRoom && localStorage.getItem('aquire.room') === code)
        setRoom((current) => current ?? savedRoom);
    }).catch((error) => {
      if (!cancelled && ['ROOM_NOT_FOUND', 'OLD_RULESET'].includes(error?.code) && localStorage.getItem('aquire.room') === code)
        localStorage.removeItem('aquire.room');
    });
    return () => { cancelled = true; };
  }, []);
  const viewingOnlineRoom = modal === 'online' || (page === 'play' && activeMode === 'online');
  useEffect(() => {
    if (!room || !viewingOnlineRoom) return;
    return watchRoom(room, updateRoom, (e) => {
      setNotice(e.message);
      if (e.code === 'ROOM_NOT_FOUND' || e.code === 'OLD_RULESET') {
        forgottenRoomCodes.current.add(room.code);
        setRoom(null);
        if (localStorage.getItem('aquire.room') === room.code) localStorage.removeItem('aquire.room');
        if (activeMode === 'online') setPage('home');
      }
    });
  }, [room?.code, updateRoom, activeMode, viewingOnlineRoom]);
  useEffect(() => {
    const started =
      room &&
      previousRoom.current?.id === room.id &&
      previousRoom.current.status === 'lobby' &&
      room.status !== 'lobby';
    previousRoom.current = room ? { id: room.id, status: room.status } : null;
    if (started && room?.game && modal === 'online') {
      newlyStartedGameId.current = room.game.id;
      setActiveMode('online');
      setPage('play');
      setModal(null);
    }
  }, [room, modal]);
  useEffect(() => {
    if (!localGame) return;
    try {
      saveGame(localGame, kind);
      setSaves(readGames());
      if (localGame.phase === 'ended') { setMatches(readMatches()); setStoryProgress(readStoryProgress()); }
    } catch {
      setNotice('Your browser could not save this game. Keep this tab open to continue playing.');
    }
  }, [localGame, kind]);
  useEffect(() => {
    if (room?.game?.phase !== 'ended') return;
    try {
      if (!readMatches().some((match) => match.id === room.game!.id)) archiveMatch(room.game, 'online');
      setMatches(readMatches());
    } catch { /* The completed online game remains on the server. */ }
  }, [room?.game?.id, room?.game?.phase]);
  useEffect(() => {
    if (page !== 'history') return;
    let cancelled = false;
    void hasOnlineSession().then(async (hasSession) => {
      if (!hasSession) return;
      const [history, leaders] = await Promise.all([getOnlineHistory(), getOnlineLeaderboard()]);
      if (!cancelled) {
        setOnlineMatches(Array.isArray(history) ? history : []);
        setOnlineLeaders(Array.isArray(leaders) ? leaders : []);
      }
    }).catch(() => { /* Local history remains available when offline or before migration. */ });
    return () => { cancelled = true; };
  }, [page, room?.status]);
  useEffect(() => {
    try {
      saveSettings(settings);
    } catch {
      /* Settings remain usable for this session. */
    }
  }, [settings]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const previous = previousGame.current;
    previousGame.current = game;
    if (page !== 'play' || !game || previous?.id !== game.id) {
      setTurnRecaps([]);
      setMergerRecaps([]);
      setDiceRecaps(page === 'play' && game?.id === newlyStartedGameId.current
        ? game.recentDiceRolls ?? (game.lastRoundRolls?.kind === 'opening' ? [game.lastRoundRolls] : []) : []);
      newlyStartedGameId.current = null;
      return;
    }
    const payouts = game.logs.filter((entry) => (entry.payout || entry.shareDecision) && entry.id > (previous.logs.at(-1)?.id ?? 0));
    if (payouts.length) setMergerRecaps((pending) => [...pending, ...payouts]);
    const recaps = collectTurnRecaps(
      previous,
      game,
      viewerId,
      activeMode === 'local' && kind === 'local',
    );
    if (recaps.length) setTurnRecaps((pending) => [...pending, ...recaps]);
    const lastSeenTurn = previous.lastRoundRolls?.atTurn ?? -1;
    const newRolls = game.recentDiceRolls?.filter((roll) => roll.atTurn !== undefined && roll.atTurn > lastSeenTurn)
      ?? (game.lastRoundRolls?.atTurn !== undefined && game.lastRoundRolls.atTurn > lastSeenTurn ? [game.lastRoundRolls] : []);
    if (newRolls.length) setDiceRecaps((pending) => [...pending, ...newRolls]);
  }, [game, page, viewerId, activeMode, kind]);
  useEffect(() => {
    if (
      !game ||
      activeMode === 'online' ||
      page !== 'play' ||
      modal ||
      turnRecaps.length > 0 || diceRecaps.length > 0 || mergerRecaps.length > 0 ||
      game.phase === 'ended' ||
      !actor?.isBot
    )
      return;
    const timer = setTimeout(() => {
      try {
        const next = applyAction(game, chooseBotAction(game));
        setLocalGame((current) =>
          current?.id === game.id && current.revision === game.revision ? next : current,
        );
        if (settings.sound) playTone();
      } catch (e) {
        setNotice(`Computer move paused: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, settings.speed);
    return () => clearTimeout(timer);
  }, [game, actor?.isBot, activeMode, page, modal, settings, turnRecaps.length, diceRecaps.length, mergerRecaps.length]);
  useEffect(() => {
    if (activeMode !== 'local' || !localGame?.turnDeadlineAt || localGame.phase === 'ended' || turnRecaps.length || diceRecaps.length || mergerRecaps.length) return;
    const check = () => setLocalGame((current) => current ? expireTurn(current) : current);
    const timer = setInterval(check, 500);
    check();
    return () => clearInterval(timer);
  }, [activeMode, localGame?.turnDeadlineAt, localGame?.phase, turnRecaps.length, diceRecaps.length, mergerRecaps.length]);
  const setSidebarCollapsed = (collapsed: boolean) => {
    setSettings((previous) => ({ ...previous, sidebarCollapsed: collapsed }));
    requestAnimationFrame(() =>
      (collapsed ? showSidebarButton.current : hideSidebarButton.current)?.focus(),
    );
  };
  const goTo = (to: Page) => {
    setPage(to);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const navigate = (to: Page) => {
    if (page === 'play' && to !== 'play' && game && game.phase !== 'ended') {
      setExitDestination(to);
      setMobileNav(false);
      return;
    }
    goTo(to);
  };
  const leaveLocalGame = (keep: boolean) => {
    if (!localGame || !exitDestination) return;
    try {
      if (keep) saveGame(localGame, kind);
      else removeSavedGame(localGame.id);
      setSaves(readGames());
      setLocalGame(null);
      setTurnRecaps([]);
      setMergerRecaps([]);
      setDiceRecaps([]);
      goTo(exitDestination);
      setExitDestination(null);
    } catch {
      setNotice('This device could not update your saved games. Please try again.');
    }
  };
  const forgetOnlineRoom = async () => {
    if (!room) return;
    setBusy(true);
    try {
      if (room.viewerId === room.hostId) await endRoom(room.code);
      else await leaveRoom(room.code);
      forgottenRoomCodes.current.add(room.code);
      if (localStorage.getItem('aquire.room') === room.code) localStorage.removeItem('aquire.room');
      setRoom(null);
      setActiveMode('local');
      setTurnRecaps([]);
      setMergerRecaps([]);
      setDiceRecaps([]);
      if (exitDestination) goTo(exitDestination);
      setExitDestination(null);
      setEndingOnlineRoom(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const endSavedGame = () => {
    if (!endingSaveId) return;
    try {
      removeSavedGame(endingSaveId);
      if (localGame?.id === endingSaveId) setLocalGame(null);
      setSaves(readGames());
      setEndingSaveId(null);
    } catch {
      setNotice('This device could not remove that game. Please try again.');
    }
  };
  const start = (config: GameConfig, newKind: 'solo' | 'local') => {
    try {
      previousGame.current = null;
      setTurnRecaps([]);
      setMergerRecaps([]);
      setDiceRecaps([]);
      const nextGame = createGame(config);
      newlyStartedGameId.current = nextGame.id;
      setLocalGame(nextGame);
      setKind(newKind);
      setActiveMode('local');
      setRevealed('');
      setModal(null);
      navigate('play');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };
  const resume = (save: SavedGame) => {
    previousGame.current = null;
    setTurnRecaps([]);
    setDiceRecaps([]);
    newlyStartedGameId.current = null;
    setLocalGame(save.game);
    setKind(save.kind);
    setActiveMode('local');
    setRevealed('');
    navigate('play');
  };
  const beginStory = (chapterId: string, name: string) => {
    const progress = readStoryProgress();
    if (!storyChapterUnlocked(progress, chapterId)) { setNotice('Win the previous challenge to open this one.'); return; }
    const saved = readGames().find((save) => save.game.campaign?.chapterId === chapterId);
    if (saved) { resume(saved); return; }
    start(storyGameConfig(chapterId, getStoryChapter(chapterId)?.mapId === 'goldspire-kingdom' ? `${profile.royalTitle} ${name}` : name, crypto.getRandomValues(new Uint32Array(1))[0], profile.avatar), 'solo');
  };
  const perform = (action: GameAction) => {
    if (!game || busy || turnRecaps.length || diceRecaps.length || mergerRecaps.length) return;
    if (settings.sound) playTone(action.type === 'found');
    if (Capacitor.isNativePlatform())
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    if (activeMode === 'online' && room) {
      setBusy(true);
      void sendRoomAction(room.code, room.version, action)
        .then(updateRoom)
        .catch((e) => setNotice(e.message))
        .finally(() => setBusy(false));
    } else {
      try {
        const current = expireTurn(game);
        setLocalGame(current === game ? applyAction(game, action) : current);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e));
      }
    }
  };
  const lastSave = saves.find((s) => s.game.phase !== 'ended');
  const activeOnlineRoom = room?.status !== 'finished' ? room : null;
  const completed = [...matches, ...onlineMatches.filter((match) => !matches.some((local) => local.id === match.id))].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  const leaderboard = makeLeaderboard(completed);
  const privateGate =
    kind === 'local' &&
    activeMode === 'local' &&
    !!actor &&
    !actor.isBot &&
    game?.phase !== 'ended' &&
    revealed !== `${game?.id}:${actor.id}:${game?.turn}`;
  return (
    <div
      className={`app-shell ${settings.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${page === 'play' && game && game.phase !== 'ended' ? 'playing-game' : ''}`}
    >
      <aside id="sidebar-navigation" className={`sidebar ${mobileNav ? 'nav-open' : ''}`}>
        <div className="sidebar-brand-row">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate('home');
            }}
            aria-label="Aquire home"
          >
            <span className="brand-mark">
              A<span />
            </span>
            <span>
              aquire<span className="brand-period">.</span>
            </span>
          </a>
          <button
            ref={hideSidebarButton}
            className="desktop-sidebar-toggle sidebar-hide icon-button"
            aria-label="Hide sidebar"
            title="Hide sidebar"
            aria-controls="sidebar-navigation"
            aria-expanded={!settings.sidebarCollapsed}
            onClick={() => setSidebarCollapsed(true)}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <span className="nav-label">YOUR CLUBHOUSE</span>
        <nav>
          <button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>
            <Home size={19} /> Overview
          </button>
          <button
            className={page === 'play' ? 'active' : ''}
            onClick={() => (game ? navigate('play') : setModal('solo'))}
          >
            <Layers3 size={19} /> Play a game <span className="nav-live" />
          </button>
          <button className={page === 'story' ? 'active' : ''} onClick={() => navigate('story')}><BookOpen size={19} /> The Long Game <span className="nav-live" /></button>
          <button
            className={page === 'history' ? 'active' : ''}
            onClick={() => navigate('history')}
          >
            <Clock3 size={19} /> My games {saves.length + (activeOnlineRoom ? 1 : 0) > 0 && <small>{saves.length + (activeOnlineRoom ? 1 : 0)}</small>}
          </button>
          <button className={page === 'learn' ? 'active' : ''} onClick={() => navigate('learn')}>
            <BookOpen size={19} /> How to play <ArrowUpRight size={13} className="nav-external" />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="tiny-city">
              <Building2 size={28} />
              <Building2 size={40} />
              <Building2 size={23} />
            </div>
            <span>A little vision goes a long way.</span>
          </div>
          <button className="sidebar-settings" onClick={() => setModal('settings')}>
            <Settings2 size={18} /> Table preferences
          </button>
          <div className="profile">
            <span className="avatar profile-avatar">Y</span>
            <div>
              <strong>Your corner of the city</strong>
              <span>Ready when you are</span>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            {settings.sidebarCollapsed && (
              <button
                ref={showSidebarButton}
                className="desktop-sidebar-toggle sidebar-show icon-button"
                aria-label="Show sidebar"
                title="Show sidebar"
                aria-controls="sidebar-navigation"
                aria-expanded={false}
                onClick={() => setSidebarCollapsed(false)}
              >
                <PanelLeftOpen size={19} />
              </button>
            )}
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              aria-controls="sidebar-navigation"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav((v) => !v)}
            >
              <Menu size={20} />
            </button>
            <span>The clubhouse</span>
            <ChevronRight size={13} />
            <strong>
              {page === 'home'
                ? 'Overview'
                : page === 'play'
                  ? 'The boardroom'
                  : page === 'story' ? 'The Long Game'
                  : page === 'learn'
                    ? 'How to play'
                    : 'My games'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-tag">THE 2008 EDITION.</span>
            <button
              className="icon-button"
              title="Table preferences"
              aria-label="Table preferences"
              onClick={() => setModal('settings')}
            >
              <Settings2 size={19} />
            </button>
            <button className="avatar header-avatar" aria-label="Customize your character" onClick={() => setModal('avatar')}><CharacterAvatar name={profile.name} avatar={profile.avatar} /></button>
          </div>
        </header>
        <main>
          {page === 'home' && (
            <div className="home-page">
              <section className="hero">
                <div className="hero-copy">
                  <span className="eyebrow">
                    <span className="live-dot" /> 2008 EDITION · THE CITY IS YOURS
                  </span>
                  <h1>
                    A little vision.
                    <br />A lasting <em>empire.</em>
                  </h1>
                  <p>
                    Build iconic hotels. Make shrewd investments.
                    <br className="desktop-break" /> Turn your next move into something remarkable.
                  </p>
                  <div className="hero-buttons">
                    <button className="button primary" onClick={() => setModal('solo')}>
                      Let’s play <ArrowRight size={17} />
                    </button>
                    <button className="button subtle" onClick={() => navigate('learn')}>
                      <BookOpen size={17} /> Learn the game
                    </button>
                  </div>
                  <div className="hero-caption">
                    <span className="mini-avatars">
                      <i>A</i>
                      <i>M</i>
                      <i>J</i>
                    </span>
                    <span>2–12 investors across classic and expansion cities.</span>
                  </div>
                </div>
                <div className="hero-art">
                  <CityScene />
                  <div className="scene-callout scene-callout-strategy">
                    <span className="scene-callout-icon"><TrendingUp size={23} strokeWidth={1.9} /></span>
                    <span className="scene-callout-copy">
                      <small>BUILT ON STRATEGY</small>
                      <strong>A brighter outlook.</strong>
                    </span>
                  </div>
                  <div className="scene-callout scene-callout-growth">
                    <span className="scene-callout-icon"><Sprout size={20} strokeWidth={1.9} /></span>
                    <strong>Room to grow.</strong>
                  </div>
                  <span className="art-caption">GREAT THINGS START WITH A SINGLE TILE.</span>
                </div>
              </section>
              <div className="chain-ticker">
                <span className="chain-ticker-intro">
                  THE HOTEL COLLECTION
                  <strong>{CHAINS.length} chains to choose from.</strong>
                </span>
                {CHAINS.map((c) => (
                  <div key={c.id}>
                    <span className="ticker-symbol" style={{ color: c.color }}>
                      {c.abbreviation}
                    </span>
                    <strong>{c.name}</strong>
                  </div>
                ))}
              </div>
              <button className="story-entry" onClick={() => navigate('story')}>
                <div className="story-entry-faces"><CharacterAvatar characterId="cast-01" /><CharacterAvatar characterId="cast-27" /><CharacterAvatar characterId="cast-56" /></div>
                <div className="story-entry-copy"><span className="eyebrow">NEW · SOLO STORY</span><strong>The Long Game</strong><p>Seven chapters. Eighty-one challenges. Build your way from a corner café to the city summit.</p></div><ArrowRight size={21} />
              </button>
              <section className="play-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">MAKE YOUR NEXT MOVE</span>
                    <h2>A table for every kind of player.</h2>
                  </div>
                  <span className="small muted">
                    <span className="live-dot" /> No account needed for local play
                  </span>
                </div>
                <div className="play-cards">
                  <button className="play-card solo-card" onClick={() => setModal('solo')}>
                    <div className="play-card-top">
                      <span className="feature-icon">
                        <Bot size={25} />
                      </span>
                      <span className="card-tag">YOUR PACE</span>
                    </div>
                    <h3>Against the house</h3>
                    <p>Sharpen your instincts against thoughtful computer opponents.</p>
                    <div className="card-bottom">
                      <span>Solo · 1–11 opponents</span>
                      <span className="round-arrow">
                        <ArrowUpRight size={20} />
                      </span>
                    </div>
                  </button>
                  <button className="play-card" onClick={() => setModal('local')}>
                    <div className="play-card-top">
                      <span className="feature-icon peach">
                        <Users size={24} />
                      </span>
                      <span className="card-tag">GOOD COMPANY</span>
                    </div>
                    <h3>Around the table</h3>
                    <p>One device. Your favorite people. A little friendly competition.</p>
                    <div className="card-bottom">
                      <span>Pass & play · 2–12 players</span>
                      <span className="round-arrow">
                        <ArrowUpRight size={20} />
                      </span>
                    </div>
                  </button>
                  <button className="play-card" onClick={() => setModal('online')}>
                    <div className="play-card-top">
                      <span className="feature-icon blue">
                        <Globe2 size={24} />
                      </span>
                      <span className="card-tag">NEAR OR FAR</span>
                    </div>
                    <h3>Across the city</h3>
                    <p>A private table for friends, wherever opportunity finds them.</p>
                    <div className="card-bottom">
                      <span>Online · Private rooms</span>
                      <span className="round-arrow">
                        <ArrowUpRight size={20} />
                      </span>
                    </div>
                  </button>
                </div>
              </section>
              {lastSave && (
                <section className="resume-card">
                  <div className="feature-icon">
                    <Clock3 size={24} />
                  </div>
                  <div>
                    <span className="eyebrow">YOUR CITY IS WAITING</span>
                    <h3>Pick up where you left off.</h3>
                    <p>
                      Turn {lastSave.game.turn} · {lastSave.game.players.length} investors · 2008
                      rules
                    </p>
                  </div>
                  <button className="button primary" onClick={() => resume(lastSave)}>
                    Continue game <Play size={15} />
                  </button>
                </section>
              )}
              <section className="bottom-feature">
                <div className="quote-panel">
                  <span className="eyebrow">SIMPLE MOVES. LASTING POSSIBILITIES.</span>
                  <h2>
                    It’s not just what you build.
                    <br />
                    It’s <em>when you make your move.</em>
                  </h2>
                  <p>Easy to learn. Endlessly rewarding to master.</p>
                  <button className="text-button" onClick={() => navigate('learn')}>
                    Discover the strategy <ArrowRight size={16} />
                  </button>
                  <span className="quote-decoration">
                    <Building2 />
                  </span>
                </div>
                <div className="quick-guide">
                  <span className="eyebrow">YOUR TURN, AT A GLANCE</span>
                  {[
                    {
                      n: '01',
                      title: 'Build a little.',
                      text: 'Place a tile. Watch the city grow.',
                    },
                    { n: '02', title: 'Invest wisely.', text: 'Buy shares in a promising future.' },
                    {
                      n: '03',
                      title: 'Think ahead.',
                      text: 'Draw a tile. Find your next opportunity.',
                    },
                  ].map((s) => (
                    <div key={s.n}>
                      <span>{s.n}</span>
                      <div>
                        <strong>{s.title}</strong>
                        <p>{s.text}</p>
                      </div>
                      <ArrowDown size={16} />
                    </div>
                  ))}
                </div>
              </section>
              <footer className="home-footer">
                <span>Inspired by the timeless game of Acquire, created by Sid Sackson.</span>
                <a href={RULEBOOK_URL} target="_blank" rel="noreferrer">
                  Official rulebook <ArrowUpRight size={12} />
                </a>
              </footer>
            </div>
          )}
          {page === 'play' && game && (
            <div
              className="game-screen"
              inert={turnRecaps.length > 0 || diceRecaps.length > 0 || mergerRecaps.length > 0}
              aria-hidden={turnRecaps.length || diceRecaps.length || mergerRecaps.length ? true : undefined}
            >
              <GameView
                game={game}
                viewerId={viewerId}
                onAction={perform}
                onHome={() => navigate(game.campaign ? 'story' : 'home')}
                onMenu={() => setMobileNav(true)}
                onRules={() => setModal('rules')}
                onSettings={() => setModal('settings')}
                onShowMergerPayout={(entry) => setMergerRecaps([entry])}
                hints={settings.hints}
                hideOpponentHoldings={settings.hideOpponentHoldings}
                hideStockAvailability={settings.hideStockAvailability}
                busy={busy}
                privateGate={privateGate}
                onReveal={() => setRevealed(`${game.id}:${actor!.id}:${game.turn}`)}
                onlineCode={activeMode === 'online' ? room?.code : undefined}
              />
            </div>
          )}
          {page === 'replay' && replayMatch && <Finale match={replayMatch} onHome={() => navigate(replayMatch.campaign ? 'story' : 'history')} />}
          {page === 'story' && <StoryMode progress={storyProgress} saves={saves} onStart={beginStory} />}
          {page === 'learn' && <Rulebook />}
          {page === 'history' && (
            <div className="history-page">
              <div className="page-heading">
                <span className="eyebrow">A RECORD OF YOUR AMBITION</span>
                <h1>
                  Every city
                  <br />
                  <em>has a story.</em>
                </h1>
                <p className="muted">Your saved tables and moments worth remembering.</p>
              </div>
              {legacyGameCount > 0 && (
                <div className="inline-note">
                  <ShieldCheck size={18} />
                  <span>
                    {legacyGameCount} earlier-edition{' '}
                    {legacyGameCount === 1 ? 'save is' : 'saves are'} preserved on this device.
                    Start a new table to play the 2008 rules.
                  </span>
                </div>
              )}
              <div className="history-stats">
                <div>
                  <Layers3 size={22} />
                  <strong>{saves.length + (activeOnlineRoom ? 1 : 0) + completed.length}</strong>
                  <span>Games at your table</span>
                </div>
                <div>
                  <Trophy size={22} />
                  <strong>{completed.length}</strong>
                  <span>Stories completed</span>
                </div>
                <div>
                  <Building2 size={22} />
                  <strong>
                    {completed.reduce((sum, s) => sum + s.placedTiles, 0)}
                  </strong>
                  <span>Hotels in completed cities</span>
                </div>
              </div>
              {saves.length || activeOnlineRoom ? (
                <div className="saved-list">
                  {activeOnlineRoom && <div className="saved-game-row">
                    <button className="saved-game-main" onClick={() => {
                      if (activeOnlineRoom.game) { setActiveMode('online'); navigate('play'); }
                      else setModal('online');
                    }}>
                      <span className="feature-icon blue"><Globe2 size={23} /></span>
                      <div><h3>{activeOnlineRoom.players.map((player) => player.name).join(', ')}’s online table</h3>
                        <p>Room {activeOnlineRoom.code} · {activeOnlineRoom.game ? `Turn ${activeOnlineRoom.game.turn}` : 'Waiting to start'}</p></div>
                      <span className="status-pill">{activeOnlineRoom.game ? 'In progress' : 'Lobby'}</span>
                      <ArrowUpRight size={20} />
                    </button>
                    <button className="saved-game-end" onClick={() => setEndingOnlineRoom(true)}>{activeOnlineRoom.viewerId === activeOnlineRoom.hostId ? 'End game' : 'Leave game'}</button>
                  </div>}
                  {saves.map((s) => (
                    <div className="saved-game-row" key={s.game.id}>
                    <button className="saved-game-main" onClick={() => resume(s)}>
                      <span className="feature-icon">
                        {s.game.phase === 'ended' ? <Trophy size={23} /> : <Building2 size={23} />}
                      </span>
                      <div>
                        <h3>
                          {s.game.phase === 'ended'
                            ? `${s.game.results
                                .filter((r) => r.rank === 1)
                                .map((r) => r.name)
                                .join(' & ')} won the city`
                            : s.game.campaign ? `The Long Game · ${getStoryChapter(s.game.campaign.chapterId)?.title ?? 'Chapter'}` : `${s.game.players.map((p) => p.name).join(', ')}’s table`}
                        </h3>
                        <p>
                          2008 edition · {s.game.players.length} investors · Turn {s.game.turn} ·{' '}
                          {new Date(s.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      <span className={`status-pill ${s.game.phase === 'ended' ? 'finished' : ''}`}>
                        {s.game.phase === 'ended' ? 'Completed' : 'In progress'}
                      </span>
                      {s.game.phase === 'ended' && (
                        <strong className="saved-winnings">
                          {money(s.game.results[0]?.total || 0)}
                        </strong>
                      )}
                      <ArrowUpRight size={20} />
                    </button>
                    {s.game.phase !== 'ended' && <button className="saved-game-end" onClick={() => setEndingSaveId(s.game.id)}>End game</button>}
                    </div>
                  ))}
                </div>
              ) : matches.length ? null : (
                <div className="empty-state">
                  <Building2 size={42} />
                  <h2>Your first city is waiting.</h2>
                  <p>Start a game. We’ll save every move here.</p>
                  <button className="button primary" onClick={() => setModal('solo')}>
                    Make your first move <ArrowRight size={17} />
                  </button>
                </div>
              )}
              {completed.length > 0 && <section className="match-history-section"><div className="section-heading"><div><span className="eyebrow">THE ARCHIVE</span><h2>Completed matches</h2></div><span className="small muted">Compact summaries · newest first</span></div><div className="match-history-grid">{completed.map((match) => <button key={match.id} className="match-history-card" onClick={() => { setReplayMatch(match); navigate('replay'); }}><span className="eyebrow">{new Date(match.endedAt).toLocaleDateString()} · {match.source === 'online' ? 'ONLINE' : 'THIS DEVICE'}</span><h3>{match.results.filter((result) => result.rank === 1).map((result) => result.name).join(' & ')} won</h3><p>{match.playerCount} investors · Turn {match.turn} · {match.placedTiles} tiles · {match.mapId.replaceAll('-', ' ')}</p><strong>{money(match.results[0]?.total ?? 0)} <ArrowUpRight size={15} /></strong></button>)}</div></section>}
              {leaderboard.length > 0 && <section className="history-analytics"><div className="section-heading"><div><span className="eyebrow">THE RECORD BOOK</span><h2>Leaderboard</h2></div><span className="small muted">{onlineLeaders.length ? 'Your tables' : 'Players on this device'}</span></div><div className="history-leaderboard">{(onlineLeaders.length ? onlineLeaders : leaderboard).map((entry, index) => <div key={`${entry.name.toLowerCase()}:${index}`}><span>{index + 1}</span><strong>{entry.name}</strong><small>{entry.games} games · {entry.wins} wins · {entry.trophies} trophies</small><b>{money(entry.best)} best</b></div>)}</div><div className="section-heading trophy-history-title"><div><span className="eyebrow">MOMENTS WORTH KEEPING</span><h2>Trophy case</h2></div></div><div className="history-trophies">{leaderboard.map((entry) => <div key={entry.name}><Trophy size={20} /><strong>{entry.name}</strong><span>{entry.trophies} award{entry.trophies === 1 ? '' : 's'} · {entry.wins} win{entry.wins === 1 ? '' : 's'}</span></div>)}</div></section>}
            </div>
          )}
        </main>
      </div>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      {(modal === 'solo' || modal === 'local') && (
        <Setup
          initialKind={modal}
          onClose={closeModal}
          onStart={start}
          hasSave={saves.length > 0}
          settings={settings}
          onSettingsChange={setSettings}
        />
      )}
      {modal === 'online' && (
        <OnlinePanel
          room={room}
          onRoom={changeRoom}
          settings={settings}
          onSettingsChange={setSettings}
          onClose={closeModal}
          onLocal={() => setModal('local')}
          onPlay={() => {
            setModal(null);
            setActiveMode('online');
            navigate('play');
          }}
        />
      )}
      {modal === 'rules' && (
        <Modal title="A little know-how" wide onClose={closeModal}>
          <div className="modal-body">
            <Rulebook compact />
          </div>
        </Modal>
      )}
      {modal === 'avatar' && <AvatarEditor profile={profile} onSave={(value) => setProfile(saveProfile(value))} onClose={() => setModal(null)} />}
      {modal === 'settings' && (
        <Modal title="Make yourself at home" onClose={closeModal}>
          <div className="modal-body">
            <p className="muted">A few little things to make your table your own.</p>
            <div className="setting-row">
              <Volume2 size={21} />
              <div>
                <strong>A little atmosphere</strong>
                <span>Gentle sounds with every move</span>
              </div>
              <button
                className={`toggle ${settings.sound ? 'on' : ''}`}
                aria-label="Game sounds"
                role="switch"
                aria-checked={settings.sound}
                onClick={() => {
                  setSettings((s) => ({ ...s, sound: !s.sound }));
                  if (!settings.sound) playTone(true);
                }}
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <Sparkles size={21} />
              <div>
                <strong>A helpful perspective</strong>
                <span>Show tips as you play</span>
              </div>
              <button
                className={`toggle ${settings.hints ? 'on' : ''}`}
                aria-label="Strategy tips"
                role="switch"
                aria-checked={settings.hints}
                onClick={() => setSettings((s) => ({ ...s, hints: !s.hints }))}
              >
                <span />
              </button>
            </div>
            <div className="settings-section-heading">
              <span className="eyebrow">A LITTLE MEMORY CHALLENGE</span>
              <p>
                Other players’ turns always get a clear recap. Choose what stays visible afterward.
              </p>
            </div>
            <div className="setting-row">
              <EyeOff size={21} />
              <div>
                <strong>Hide opponents’ holdings</strong>
                <span>
                  Keep your own portfolio visible. Remember everyone else’s shares after their turn
                  recap.
                </span>
              </div>
              <button
                className={`toggle ${settings.hideOpponentHoldings ? 'on' : ''}`}
                aria-label="Hide opponents’ holdings"
                role="switch"
                aria-checked={settings.hideOpponentHoldings}
                onClick={() =>
                  setSettings((s) => ({ ...s, hideOpponentHoldings: !s.hideOpponentHoldings }))
                }
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <Layers3 size={21} />
              <div>
                <strong>Hide remaining stock counts</strong>
                <span>
                  Show only Available or Sold out, including shares available for merger trades.
                </span>
              </div>
              <button
                className={`toggle ${settings.hideStockAvailability ? 'on' : ''}`}
                aria-label="Hide remaining stock counts"
                role="switch"
                aria-checked={settings.hideStockAvailability}
                onClick={() =>
                  setSettings((s) => ({ ...s, hideStockAvailability: !s.hideStockAvailability }))
                }
              >
                <span />
              </button>
            </div>
            <label className="field-label" htmlFor="bot-speed">
              The pace of the house
            </label>
            <select
              id="bot-speed"
              value={settings.speed}
              onChange={(e) => setSettings((s) => ({ ...s, speed: Number(e.target.value) }))}
            >
              <option value={1400}>Unhurried · take in every move</option>
              <option value={850}>Comfortable · the usual pace</option>
              <option value={220}>Quick · let’s keep things moving</option>
            </select>
            <button className="button secondary full" onClick={() => setModal('avatar')}>Customize your character</button>
            <HouseRulesControls value={settings.houseRules} onChange={(houseRules) => setSettings((prior) => ({ ...prior, houseRules }))} />
            <div className="inline-note">
              <Check size={18} /> Preferences and local games save automatically.
            </div>
            <button className="button primary full" onClick={closeModal}>
              Just right <Check size={17} />
            </button>
            <p className="small muted center">
              Local saves stay in this browser or app. Online rooms use your guest session on this
              device.
            </p>
          </div>
        </Modal>
      )}
      {page === 'play' && !modal && game && mergerRecaps[0]?.payout && <MergerReveal key={mergerRecaps[0].id} payout={mergerRecaps[0].payout} game={game} viewerId={privateGate ? '' : viewerId} onContinue={continueAfterMerger} remaining={mergerRecaps.length - 1} />}
      {page === 'play' && !modal && game && mergerRecaps[0]?.shareDecision && <ShareDecisionReveal key={mergerRecaps[0].id} entry={mergerRecaps[0]} game={game} viewerId={privateGate ? '' : viewerId} onContinue={continueAfterMerger} />}
      {page === 'play' && !modal && !mergerRecaps[0] && turnRecaps[0] && (
        <TurnRecap
          key={turnRecaps[0].id}
          recap={turnRecaps[0]}
          onContinue={continueAfterRecap}
          remaining={turnRecaps.length - 1}
        />
      )}
      {page === 'play' && !modal && !mergerRecaps[0] && !turnRecaps[0] && diceRecaps[0] && game && (
        <DiceReveal
          key={`${game.id}:${diceRecaps[0].atTurn}`}
          report={diceRecaps[0]}
          rules={getHouseRules(game)}
          onContinue={continueAfterDice}
        />
      )}
      {exitDestination && activeMode === 'local' && localGame?.phase !== 'ended' && (
        <Modal title="Leave this game?" onClose={() => setExitDestination(null)}>
          <div className="modal-body exit-game-dialog">
            <p>Your game is saved as you play. Keep it in My games for later, or end it and remove the unfinished save.</p>
            <div className="exit-game-actions">
              <button className="button subtle" onClick={() => setExitDestination(null)}>Keep playing</button>
              <button className="button subtle" onClick={() => leaveLocalGame(false)}>End game & remove</button>
              <button className="button primary" onClick={() => leaveLocalGame(true)}>Save & exit <ArrowRight size={16} /></button>
            </div>
          </div>
        </Modal>
      )}
      {exitDestination && activeMode === 'online' && room?.status !== 'finished' && (
        <Modal title="Leave this online game?" onClose={() => setExitDestination(null)}>
          <div className="modal-body exit-game-dialog">
            <p>{room?.viewerId === room?.hostId
              ? 'Keep this room to return later, or end it for everyone at the table. Ending removes the unfinished game without a result.'
              : 'Keep this room to return later, or remove its shortcut from this device. Your seat stays in the room, so play may pause on your turns.'}</p>
            <div className="exit-game-actions">
              <button className="button subtle" disabled={busy} onClick={() => setExitDestination(null)}>Keep playing</button>
              <button className="button subtle" disabled={busy} onClick={() => void forgetOnlineRoom()}>{room?.viewerId === room?.hostId ? 'End game for everyone' : 'Leave game'}</button>
              <button className="button primary" disabled={busy} onClick={() => { setExitDestination(null); goTo(exitDestination); }}>Save & exit <ArrowRight size={16} /></button>
            </div>
          </div>
        </Modal>
      )}
      {endingSaveId && (
        <Modal title="End this game?" onClose={() => setEndingSaveId(null)}>
          <div className="modal-body exit-game-dialog">
            <p>This unfinished game will be removed from My games. It will not count as a completed match, and this cannot be undone.</p>
            <div className="exit-game-actions">
              <button className="button subtle" onClick={() => setEndingSaveId(null)}>Keep game</button>
              <button className="button primary exit-game-danger" onClick={endSavedGame}>End game & remove</button>
            </div>
          </div>
        </Modal>
      )}
      {endingOnlineRoom && room && (
        <Modal title={room.viewerId === room.hostId ? 'End this online game?' : 'Leave this online game?'} onClose={() => setEndingOnlineRoom(false)}>
          <div className="modal-body exit-game-dialog">
            <p>{room.viewerId === room.hostId
              ? 'The room will close for everyone. This unfinished game will not count as a completed match, and this cannot be undone.'
              : 'This room will disappear from My games on this device. Your seat stays in the shared game; you can rejoin with the room code and this guest session.'}</p>
            <div className="exit-game-actions">
              <button className="button subtle" disabled={busy} onClick={() => setEndingOnlineRoom(false)}>Keep game</button>
              <button className="button primary exit-game-danger" disabled={busy} onClick={() => void forgetOnlineRoom()}>{room.viewerId === room.hostId ? 'End game for everyone' : 'Leave game'}</button>
            </div>
          </div>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="alert">
          <span>{notice}</span>
          <button
            className="icon-button"
            onClick={() => setNotice('')}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
