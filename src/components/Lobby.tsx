import { lazy, Suspense, useMemo, useState, type CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Bot, Clock3, Crown, Globe2, Layers3, Play, Trophy, Users } from 'lucide-react';
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
  { id: 'solo' as const, icon: Bot, title: 'Against the house', label: 'Solo', detail: 'You + clever rivals' },
  { id: 'local' as const, icon: Users, title: 'Around the table', label: 'Pass & play', detail: 'Friends. One device.' },
  { id: 'online' as const, icon: Globe2, title: 'Across the city', label: 'Online', detail: 'Your own room or an open table' },
];
export default function Lobby({ onPlay, onLearn, onStory, onResume, lastSave, progress }: {
  onPlay: (mode: Mode) => void; onLearn: () => void; onStory: () => void;
  onResume: (save: SavedGame) => void; lastSave?: SavedGame; progress: StoryProgress;
}) {
  const [ready, setReady] = useState(false);
  const wins = storyWins(progress);
  const tiles = useMemo<CityTile[]>(() => Array.from({ length: 64 }, (_, i) => {
    const x = i % 8, y = Math.floor(i / 8);
    const index = x > 0 && x < 3 && y > 0 && y < 4 ? 1 : x > 4 && y > 0 && y < 4 ? 4 : x > 2 && x < 6 && y > 4 ? 2 : x === 1 && y > 4 ? 0 : -1;
    return { id: String(i), occupied: index >= 0 || i === 36 || i === 14, color: index >= 0 ? CHAINS[index].color : undefined, model: index, selected: i === 35 };
  }), []);
  return <div className="lobby home-page">
    <section className="lobby-hero">
      <div className="lobby-hero-copy">
        <span className="eyebrow">THE CLASSIC GAME OF HOTEL EMPIRES</span>
        <h1>Acquire<span>.</span></h1>
        <h2>Build. Invest. Take over.</h2>
        <p>A city on the rise. A seat at the table.<br />Make your next move count.</p>
        <div className="lobby-hero-actions"><button className="button primary" onClick={() => onPlay('solo')}>Let’s play <Play size={17} fill="currentColor" /></button><button className="text-button" onClick={onLearn}><BookOpen size={17} /> How to play <ArrowUpRight size={14} /></button></div>
        <div className="lobby-facts"><span><Users size={14} /> 2–12 players</span><span><Layers3 size={14} /> 81 cities</span></div>
      </div>
      <div className={`lobby-city ${ready ? 'city-ready' : ''}`} role="img" aria-label="An Acquire board with colorful three-dimensional hotel-chain pieces">
        <div className="city-orbit orbit-one" /><div className="city-orbit orbit-two" />
        <div className="city-placeholder" aria-hidden="true"><CityIllustration /></div>
        <Suspense fallback={null}><CityScene tiles={tiles} columns={8} rows={8} diorama onReady={() => setReady(true)} onUnavailable={() => setReady(false)} /></Suspense>
        <span className="city-caption">SMALL MOVES. BIG BUSINESS.</span>
      </div>
    </section>
    <div className="lobby-modes" role="group" aria-label="Choose how to play">{modes.map(({ id, icon: Icon, title, label, detail }) => <button key={id} className="mode-card" onClick={() => onPlay(id)}>
      <span className={`mode-icon ${id}`}><Icon size={23} /></span><span className="mode-copy"><span className="mode-tag">{label}</span><span className="mode-name">{title}</span><span className="mode-detail">{detail}</span></span><ArrowRight className="mode-arrow" size={18} />
    </button>)}</div>
    <div className="lobby-extras">
      {lastSave && <section className="lobby-resume resume-card"><span className="resume-icon"><Clock3 size={22} /></span><div><span className="eyebrow">YOUR TABLE IS WAITING</span><h3>Back to business?</h3><p>Turn {lastSave.game.turn} · {lastSave.game.players.length} investors</p></div><button className="button subtle" onClick={() => onResume(lastSave)}>Continue game <ArrowRight size={16} /></button></section>}
      <button className="lobby-campaign story-entry" onClick={onStory}>
        <span className="campaign-cast"><CharacterAvatar characterId="cast-01" /><CharacterAvatar characterId="cast-27" /><CharacterAvatar characterId="cast-56" /></span>
        <span className="campaign-copy"><span className="campaign-badge"><Crown size={13} /> STORY MODE</span><strong>The Long Game</strong><span>Outplay the city. Earn your place at the top.</span></span>
        <span className="campaign-progress"><span><Trophy size={13} /> {wins} / 81 challenges won</span><span className="campaign-progress-track"><i style={{ width: `${wins / 81 * 100}%` }} /></span></span><ArrowRight size={18} />
      </button>
    </div>
    <footer className="lobby-footer"><span>Inspired by Acquire, created by Sid Sackson.</span><div className="lobby-chain-dots" aria-label="Twelve hotel chains">{CHAINS.map(chain => <i key={chain.id} title={chain.name} style={{ '--hotel-color': chain.color } as CSSProperties} />)}</div><button className="text-button" onClick={onLearn}>Rules & strategy <ArrowUpRight size={12} /></button></footer>
  </div>;
}
