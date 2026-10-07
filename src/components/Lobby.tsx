import { lazy, Suspense, useMemo, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Bot, Check, Clock3, Crown, Globe2, Layers3, Play, Sparkles, Trophy, Users } from 'lucide-react';
import { CHAINS } from '../game/engine';
import type { SavedGame } from '../lib/storage';
import type { StoryProgress } from '../lib/campaign';
import { storyWins } from '../lib/campaign';
import CharacterAvatar from './CharacterAvatar';
import CityIllustration from './CityIllustration';
import type { CityTile } from './CityScene';
const CityScene = lazy(() => import('./CityScene'));

type Mode = 'solo' | 'local' | 'online';
const modes = [
  { id: 'solo' as const, icon: Bot, title: 'Against the house', label: 'Solo', text: 'Your city. Your pace. Take on a table of clever rivals.', detail: '3 difficulties · Up to 11 rivals', tag: 'FIND YOUR EDGE' },
  { id: 'local' as const, icon: Users, title: 'Around the table', label: 'Pass & play', text: 'Bring your favorite people. Pass the device, build a rivalry.', detail: '2–12 players · One device', tag: 'BETTER TOGETHER' },
  { id: 'online' as const, icon: Globe2, title: 'Across the city', label: 'Online', text: 'Join an open table or make a little room for your friends.', detail: 'Public tables · Private rooms', tag: 'MAKE CONNECTIONS' },
];
export default function Lobby({ onPlay, onLearn, onStory, onResume, lastSave, progress }: {
  onPlay: (mode: Mode) => void; onLearn: () => void; onStory: () => void;
  onResume: (save: SavedGame) => void; lastSave?: SavedGame; progress: StoryProgress;
}) {
  const [mode, setMode] = useState<Mode>('solo');
  const [ready, setReady] = useState(false);
  const wins = storyWins(progress);
  const tiles = useMemo<CityTile[]>(() => Array.from({ length: 64 }, (_, i) => {
    const x = i % 8, y = Math.floor(i / 8);
    const index = x > 0 && x < 3 && y > 0 && y < 4 ? 1 : x > 4 && y > 0 && y < 4 ? 4 : x > 2 && x < 6 && y > 4 ? 2 : x === 1 && y > 4 ? 0 : -1;
    return { id: String(i), occupied: index >= 0 || i === 36 || i === 14, color: index >= 0 ? CHAINS[index].color : undefined, selected: i === 35 };
  }), []);
  return <div className="lobby home-page">
    <div className="lobby-heading"><div><span className="eyebrow">THE CITY IS YOURS</span><h1>Make your next move<span>.</span></h1></div><span className="lobby-edition"><Layers3 size={14} /> The classic strategy game</span></div>
    <section className="lobby-hero">
      <div className="lobby-hero-copy">
        <span className="lobby-badge"><span className="live-dot" /> SMALL TILES. BIG AMBITIONS.</span>
        <h2>Build a city.<br />Own the <em>skyline.</em></h2>
        <p>Build hotels, back the right chains, and turn one smart move into an empire.</p>
        <div className="lobby-hero-actions"><button className="button primary" onClick={() => onPlay(mode)}>Let’s play <Play size={17} fill="currentColor" /></button><button className="text-button" onClick={onLearn}><BookOpen size={17} /> Learn the game <ArrowUpRight size={14} /></button></div>
        <div className="lobby-facts"><span><Users size={14} /> 2–12 players</span><span><Layers3 size={14} /> 81 cities</span><span><Check size={14} /> Free local play</span></div>
      </div>
      <div className={`lobby-city ${ready ? 'city-ready' : ''}`} role="img" aria-label="A miniature city of colorful three-dimensional hotel towers on a game board">
        <div className="city-orbit orbit-one" /><div className="city-orbit orbit-two" />
        <div className="city-placeholder" aria-hidden="true"><CityIllustration /></div>
        <Suspense fallback={null}><CityScene tiles={tiles} columns={8} rows={8} diorama onReady={() => setReady(true)} onUnavailable={() => setReady(false)} /></Suspense>
        <span className="city-float float-profit"><TrendingMark /><span>THE NEXT BIG THING<strong>Built by you.</strong></span></span>
        <span className="city-float float-tile"><span className="mini-tile">6F</span>Every empire starts here.</span>
        <span className="city-caption">A LITTLE VISION GOES A LONG WAY</span>
      </div>
    </section>
    {lastSave && <section className="lobby-resume resume-card"><span className="resume-icon"><Clock3 size={22} /></span><div><span className="eyebrow">YOUR TABLE IS WAITING</span><h3>Back to business?</h3><p>Turn {lastSave.game.turn} · {lastSave.game.players.length} investors · Progress saved</p></div><button className="button subtle" onClick={() => onResume(lastSave)}>Continue game <ArrowRight size={16} /></button></section>}
    <div className="lobby-section-heading"><div><span className="eyebrow">PULL UP A CHAIR</span><h2>How do you want to play?</h2></div><span>No account needed for local games</span></div>
    <div className="lobby-bottom-grid">
      <section className="lobby-play">
        <div className="lobby-modes" role="group" aria-label="Choose how to play">{modes.map(({ id, icon: Icon, title, label, text, detail, tag }) => <button key={id} className={`mode-card ${mode === id ? 'selected' : ''}`} aria-pressed={mode === id} onClick={() => { setMode(id); onPlay(id); }}>
          <span className={`mode-icon ${id}`}><Icon size={27} /></span><span className="mode-tag">{tag}</span><span className="mode-name">{title}</span><span className="mode-description">{text}</span><span className="mode-detail">{detail}</span><span className="mode-choice"><span>{label}</span>{mode === id ? <Check size={15} /> : <ArrowUpRight size={15} />}</span>
        </button>)}</div>
        <button className="button primary lobby-start" onClick={() => onPlay(mode)}>{mode === 'solo' ? 'Start a solo game' : mode === 'local' ? 'Set up your table' : 'Find a table'} <ArrowRight size={18} /></button>
      </section>
      <button className="lobby-campaign story-entry" onClick={onStory}>
        <span className="campaign-top"><span className="campaign-badge"><Crown size={13} /> STORY MODE</span><ArrowUpRight size={19} /></span>
        <span className="campaign-cast"><CharacterAvatar characterId="cast-01" /><CharacterAvatar characterId="cast-27" /><CharacterAvatar characterId="cast-56" /></span>
        <strong>The Long Game</strong><span>Start small. Outplay the city.<br />Earn your place at the top.</span>
        <span className="campaign-progress"><span><Trophy size={13} /> {wins} / 81 challenges won</span><span className="campaign-progress-track"><i style={{ width: `${wins / 81 * 100}%` }} /></span></span>
        <span className="campaign-cta">{wins ? 'Continue your story' : 'Begin your story'} <ArrowRight size={16} /></span>
      </button>
    </div>
    <footer className="lobby-footer"><span>Inspired by Acquire, created by Sid Sackson.</span><div className="lobby-chain-dots" aria-label="Twelve hotel chains">{CHAINS.map(chain => <i key={chain.id} title={chain.name} style={{ '--hotel-color': chain.color } as CSSProperties} />)}</div><button className="text-button" onClick={onLearn}>Rules & strategy <ArrowUpRight size={12} /></button></footer>
  </div>;
}
function TrendingMark() { return <span className="profit-icon"><Sparkles size={20} /></span>; }
