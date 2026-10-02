import { useCallback, useState } from 'react';
import { ArrowRight, BookOpen, Check, Crown, LockKeyhole, Play, Sparkles, Trophy } from 'lucide-react';
import { STORY_CHAPTERS, STORY_BOOKS, getStoryChapter, storyRuleBriefing } from '../game/campaign';
import { CHARACTERS, getCharacter, STYLE_NAMES } from '../game/characters';
import { getMap } from '../game/maps';
import { storyChapterUnlocked, type StoryProgress } from '../lib/campaign';
import { readProfile } from '../lib/profile';
import type { SavedGame } from '../lib/storage';
import CharacterAvatar from './CharacterAvatar';
import MapPreview from './MapPreview';
import Modal from './Modal';
import '../story.css';

export default function StoryMode({ progress, saves, onStart }: {
  progress: StoryProgress; saves: SavedGame[]; onStart: (chapterId: string, name: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(() => readProfile().name);
  const close = useCallback(() => setSelected(null), []);
  const chapter = getStoryChapter(selected ?? undefined);
  const completed = STORY_CHAPTERS.filter((item) => progress.chapters[item.id]?.won).length;
  const next = STORY_CHAPTERS.find((item) => !progress.chapters[item.id]?.won) ?? STORY_CHAPTERS.at(-1)!;
  const [book, setBook] = useState(next.chapter);
  const savedChapter = (id: string) => saves.find((save) => save.game.campaign?.chapterId === id && save.game.phase !== 'ended');
  const active = saves.find((save) => save.game.campaign && save.game.phase !== 'ended');
  const heroChapter = active ? getStoryChapter(active.game.campaign!.chapterId) ?? next : next;
  return <div className="story-page">
    <section className="story-hero">
      <div className="story-hero-copy"><span className="eyebrow"><BookOpen size={15} /> A SOLO STORY · {STORY_BOOKS.length} CHAPTERS · {STORY_CHAPTERS.length} CHALLENGES</span>
        <h1>The Long <em>Game.</em></h1>
        <p>A battered ledger. One little corner of the city.<br />An entirely unreasonable ambition.</p>
        <div className="story-hero-actions"><button className="button primary" onClick={() => { setBook(heroChapter.chapter); setSelected(heroChapter.id); }}>{completed === STORY_CHAPTERS.length ? 'Visit the kingdom again' : active ? 'Continue your challenge' : completed ? 'Your next challenge' : 'Begin your story'} <ArrowRight size={18} /></button><span><Trophy size={16} /> {completed} / {STORY_CHAPTERS.length} challenges won</span></div>
        <small>Saved on this device · No account needed · Every opponent is a Strategist</small>
      </div>
      <div className="story-hero-cast" aria-label="Some of the characters you will meet">
        {['cast-01', 'cast-27', 'cast-56'].map((id) => <div key={id}><CharacterAvatar characterId={id} /><span>{getCharacter(id)!.name}</span></div>)}
        <span className="story-cast-caption">{CHARACTERS.length} personalities. One seat with your name on it.</span>
      </div>
    </section>
    {completed === STORY_CHAPTERS.length && <section className="story-finished" role="status"><Crown size={34} /><div><span className="eyebrow">THE LAST PAGE IS YOURS</span><h2>You won the city.</h2><p>From the corner café to eleven rivals at the summit. Every challenge is yours to revisit. Goldspire Kingdom and eleven royal rivals are now available in free play.</p></div></section>}
    <div className="story-path-heading"><div><span className="eyebrow">FROM SMALL CHANGE TO THE SUMMIT</span><h2>Your road through the city.</h2></div><p>Win outright to open the next challenge. Losses and ties are a chance to try again.</p></div>
    <nav className="story-book-tabs" aria-label="Story chapters">{STORY_BOOKS.map((item) => <button key={item.number} aria-pressed={book === item.number} onClick={() => setBook(item.number)}><span>Chapter {item.number}</span><strong>{item.title}</strong><small>{STORY_CHAPTERS.filter((challenge) => challenge.chapter === item.number && progress.chapters[challenge.id]?.won).length} / {STORY_CHAPTERS.filter((challenge) => challenge.chapter === item.number).length} won</small></button>)}</nav>
    <p className="story-book-theme">{STORY_BOOKS[book - 1].theme}</p>
    <div className="story-chapters">
      {STORY_CHAPTERS.filter((item) => item.chapter === book).map((item) => {
        const unlocked = storyChapterUnlocked(progress, item.id), won = progress.chapters[item.id]?.won, save = savedChapter(item.id);
        const map = getMap(item.mapId);
        return <button key={item.id} className={`story-chapter ${won ? 'won' : unlocked ? 'unlocked' : 'locked'}`} disabled={!unlocked} onClick={() => setSelected(item.id)} aria-label={`Challenge ${item.number}: ${item.title}${won ? ', completed' : unlocked ? '' : ', locked'}`}>
          <div className="story-chapter-top"><span className="story-chapter-number">{String(item.stage).padStart(2, '0')}</span><span>{won ? <><Check size={14} /> Won</> : save ? <><Play size={14} /> In progress</> : unlocked ? <><Sparkles size={14} /> Your next move</> : <><LockKeyhole size={14} /> Locked</>}</span></div>
          <MapPreview map={map} />
          <span className="eyebrow">{item.district}</span><h3>{item.title}</h3>
          <p>{item.players - 1} {item.players === 2 ? 'rival' : 'rivals'} · {map.tiles.length} tiles · Strategist</p>
          <div className="story-chapter-cast">{item.opponents.slice(0, 4).map((id) => <CharacterAvatar key={id} characterId={id} />)}{item.opponents.length > 4 && <span>+{item.opponents.length - 4}</span>}<ArrowRight size={17} /></div>
          {!unlocked && <small>Win challenge {item.number - 1} to unlock</small>}
        </button>;
      })}
    </div>
    {chapter && <Modal title={`Chapter ${chapter.chapter} · Challenge ${chapter.stage}: ${chapter.title}`} onClose={close} wide>
      <div className="modal-body story-briefing">
        <span className="eyebrow">{chapter.district} · THE LONG GAME</span>
        <p className="story-intro">{chapter.intro}</p>
        <MapPreview map={getMap(chapter.mapId)} />
        <div className="story-objective"><Trophy size={22} /><div><strong>Finish alone in first place.</strong><p>Beat all {chapter.players - 1} {chapter.players === 2 ? 'opponent' : 'opponents'} at Strategist difficulty. Challenge rules are fixed; your display and speed preferences still apply.</p></div></div>
        <section className="story-rules" aria-label="Challenge rules"><h3>The terms of this challenge</h3><p>{chapter.strategy}</p><dl>{storyRuleBriefing(chapter).map((rule) => <div key={rule.title}><dt>{rule.title}</dt><dd>{rule.detail}</dd></div>)}</dl></section>
        <h3>Your competition</h3>
        <div className="story-opponents">{chapter.opponents.map((id) => {
          const character = getCharacter(id)!;
          return <article key={id}><CharacterAvatar characterId={id} /><div><strong>{character.name}</strong><span>{character.title}</span><small>{STYLE_NAMES[character.style]} · Strategist</small><p>“{character.quote}”</p></div></article>;
        })}</div>
        <p className="story-tip"><Sparkles size={17} /><span>{chapter.tip}</span></p>
        {!savedChapter(chapter.id) && <label className="field-label" htmlFor="story-name">Your name<input id="story-name" value={name} maxLength={24} onChange={(event) => setName(event.target.value)} /></label>}
        <div className="story-briefing-footer"><span>{progress.chapters[chapter.id]?.attempts ? `${progress.chapters[chapter.id].attempts} completed ${progress.chapters[chapter.id].attempts === 1 ? 'attempt' : 'attempts'}` : 'A fresh page in your ledger'}</span><button className="button primary" onClick={() => { onStart(chapter.id, name); close(); }}>{savedChapter(chapter.id) ? 'Resume challenge' : progress.chapters[chapter.id]?.won ? 'Replay challenge' : progress.chapters[chapter.id] ? 'Try this challenge again' : 'Play this challenge'} <ArrowRight size={17} /></button></div>
      </div>
    </Modal>}
  </div>;
}
