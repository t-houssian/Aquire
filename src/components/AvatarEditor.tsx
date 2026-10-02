import { useEffect, useState } from 'react';
import { ArrowRight, Check, LockKeyhole, Shuffle, LoaderCircle } from 'lucide-react';
import {
  AVATAR_OPTIONS,
  COSMETIC_REWARDS,
  DEFAULT_AVATAR,
  decodeAvatar,
  encodeAvatar,
  optionUnlocked,
  rewardUnlocked,
  type AvatarSpec,
} from '../game/avatars';
import type { PlayerProfile } from '../lib/profile';
import { storyWins } from '../lib/campaign';
import { COUNTRIES } from '../lib/countries';
import {
  getOnlineProfile,
  hasOnlineSession,
  saveOnlineProfile,
  type OnlineProfile,
} from '../lib/online';
import ProfileStats from './ProfileStats';
import CharacterAvatar from './CharacterAvatar';
import Modal from './Modal';
import '../avatar-editor.css';
const labels: Record<keyof AvatarSpec, string[]> = {
  skin: [
    'Porcelain',
    'Warm cocoa',
    'Peach',
    'Espresso',
    'Cream',
    'Caramel',
    'Copper',
    'Deep cocoa',
    'Rose ivory',
  ],
  hair: [
    'Ink',
    'Chestnut',
    'Champagne',
    'Chocolate',
    'Silver',
    'Ginger',
    'Ocean',
    'Plum',
    'Bubblegum',
    'Blue raspberry',
    'Mint',
    'Goldenrod',
    'Firecracker',
    'Snow',
    'Lavender',
    'Turquoise',
  ],
  cut: [
    'The side hustle',
    'The deal swoop',
    'The brainstorm',
    'The professor',
    'The long game',
    'The top knot',
    'Market spikes',
    'The buzz',
    'Compound curls',
    'The fringe benefit',
    'The bold bob',
    'The clean slate',
  ],
  eyes: [
    'Wide awake',
    'A happy squint',
    'The skeptic',
    'The wink',
    'The dreamer',
    'Big ideas',
    'Starry eyed',
  ],
  mouth: [
    'Big grin',
    'Knowing smile',
    'Poker face',
    'Oh!',
    'The belly laugh',
    'The schemer',
    'Ruby smile',
  ],
  accessory: [
    'Round specs',
    'The tycoon hat',
    'Monocle',
    'Mighty moustache',
    'The beret',
    'Statement specs',
    'Flower & bow',
    'A tiny crown',
    'Keep it simple',
    'Cool shades',
    'Headphones',
    'Chef’s hat',
    'Street cap',
    'Cozy beanie',
    'Hard hat',
    'Cat ears',
    'Space investor helmet',
    'Dragon horns',
    'The sovereign crown',
    'Winner’s laurels',
    'Diamond monocle',
    'Champion’s cap',
    'Diamond top hat',
  ],
  color: Array.from({ length: 24 }, (_, i) => `Suit ${i + 1}`),
  shape: ['Classic', 'Round', 'Long', 'Broad', 'Petite'],
  nose: ['Classic', 'Button', 'Straight', 'Bold', 'Tiny'],
  facialHair: [
    'Clean shaven',
    'Classic moustache',
    'Goatee',
    'Full beard',
    'Chin strap',
    'Handlebars',
    'Sideburns',
    'Five o’clock shadow',
  ],
  outfit: [
    'The classic suit',
    'Double breasted',
    'Black tie',
    'Cozy sweater',
    'Hoodie',
    'Argyle investor',
    'Starlight jacket',
    'Royal cape',
    'Champion’s jacket',
    'Platinum pinstripes',
  ],
  background: [
    'Plain',
    'Polka dots',
    'Stripes',
    'Sunshine',
    'Mountains',
    'Waves',
    'Sunburst',
    'Twinkles',
    'City skyline',
    'Golden confetti',
  ],
  earrings: ['None', 'Gold studs', 'Gold hoops', 'Diamond drops', 'Little stars', 'Pearls'],
  badge: [
    'None',
    'The first key',
    'The first ledger',
    'Story star',
    'Kingdom seal',
    'First online trophy',
    'Ten-win laurels',
    'Diamond investor',
  ],
};
const titles: Record<keyof AvatarSpec, string> = {
  skin: 'Skin',
  hair: 'Hair color',
  cut: 'Hair style',
  eyes: 'Eyes',
  mouth: 'Smile',
  accessory: 'Finishing touch',
  color: 'Outfit color',
  shape: 'Face shape',
  nose: 'Nose',
  facialHair: 'Facial hair',
  outfit: 'Outfit',
  background: 'Background',
  earrings: 'Jewelry',
  badge: 'Earned badge',
};
const groups: { title: string; keys: (keyof AvatarSpec)[] }[] = [
  {
    title: 'A face for your fortune',
    keys: ['skin', 'shape', 'eyes', 'nose', 'mouth', 'facialHair'],
  },
  { title: 'A little flair', keys: ['hair', 'cut', 'accessory', 'earrings'] },
  { title: 'Dress for your next deal', keys: ['outfit', 'color', 'background', 'badge'] },
];
export default function AvatarEditor({
  profile,
  onSave,
  onClose,
  initialTab = 'character',
}: {
  profile: PlayerProfile;
  onSave: (profile: PlayerProfile) => void;
  onClose: () => void;
  initialTab?: 'character' | 'rewards' | 'record';
}) {
  const [name, setName] = useState(profile.name),
    [face, setFace] = useState(decodeAvatar(profile.avatar) ?? DEFAULT_AVATAR),
    [royalTitle, setTitle] = useState(profile.royalTitle);
  const [country, setCountry] = useState(profile.country ?? ''),
    [tab, setTab] = useState<'character' | 'rewards' | 'record'>(initialTab);
  const [record, setRecord] = useState<OnlineProfile | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const progress = {
    storyWins: Math.max(storyWins(), record?.storyWins ?? 0),
    onlineWins: record?.wins ?? 0,
  };
  const avatar = encodeAvatar(face);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (await hasOnlineSession()) {
          const value = await getOnlineProfile();
          if (active) setRecord(value);
        }
      } catch {
        if (active)
          setError(
            'Your online record could not be loaded. Reopen your profile when connected to see online rewards.',
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return (
    <Modal title="Meet your next tycoon." wide onClose={onClose}>
      <div className="modal-body avatar-editor">
        <div className="avatar-editor-preview">
          <CharacterAvatar avatar={avatar} name={name} />
          <div>
            <strong>{name.trim() || 'You'}</strong>
            <p>A small face. Enormous ambitions.</p>
            <button
              className="button secondary"
              disabled={loading || busy}
              onClick={() => {
                const random = crypto.getRandomValues(
                  new Uint32Array(Object.keys(AVATAR_OPTIONS).length),
                );
                setFace(
                  Object.fromEntries(
                    (Object.keys(AVATAR_OPTIONS) as (keyof AvatarSpec)[]).map((key, i) => {
                      const available = Array.from(
                        { length: AVATAR_OPTIONS[key] },
                        (_, n) => n,
                      ).filter((value) => optionUnlocked(key, value, progress));
                      return [key, available[random[i] % available.length]];
                    }),
                  ) as unknown as AvatarSpec,
                );
              }}
            >
              <Shuffle size={15} /> Surprise me
            </button>
          </div>
        </div>
        <div className="segmented avatar-editor-tabs">
          {(['character', 'rewards', 'record'] as const).map((item) => (
            <button
              key={item}
              className={tab === item ? 'selected' : ''}
              onClick={() => setTab(item)}
            >
              {item === 'character'
                ? 'Your character'
                : item === 'rewards'
                  ? 'Win rewards'
                  : 'Online record'}
            </button>
          ))}
        </div>
        {tab === 'character' && (
          <>
            <label className="field-label" htmlFor="character-name">
              Your name
              <input
                id="character-name"
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field-label" htmlFor="character-country">
              Country · optional
              <select
                id="character-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="">Keep it private</option>
                {COUNTRIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {groups.map((group) => (
              <section key={group.title}>
                <h3 className="avatar-group-title">{group.title}</h3>
                <div className="avatar-editor-options">
                  {group.keys.map((key) => (
                    <label key={key}>
                      {titles[key]}
                      {key === 'color' ? (
                        <div
                          className="avatar-color-options"
                          role="group"
                          aria-label="Outfit color"
                        >
                          {labels.color.map((label, i) => (
                            <button
                              key={i}
                              aria-label={label}
                              aria-pressed={face.color === i}
                              style={{ background: `hsl(${i * 15} 35% 40%)` }}
                              onClick={() => setFace({ ...face, color: i })}
                            />
                          ))}
                        </div>
                      ) : (
                        <select
                          aria-label={key}
                          value={face[key]}
                          onChange={(e) => setFace({ ...face, [key]: Number(e.target.value) })}
                        >
                          {labels[key].map((label, i) => {
                            const reward = COSMETIC_REWARDS.find(
                                (r) => r.key === key && r.value === i,
                              ),
                              earned = optionUnlocked(key, i, progress);
                            return (
                              <option value={i} key={i} disabled={!earned}>
                                {label}
                                {!earned && reward
                                  ? ` · win ${reward.wins} ${reward.source === 'story' ? 'story challenges' : 'online matches'}`
                                  : ''}
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}
            <label className="field-label">
              Your royal title
              <select
                aria-label="Royal title"
                value={royalTitle}
                onChange={(e) => setTitle(e.target.value as PlayerProfile['royalTitle'])}
              >
                <option>King</option>
                <option>Queen</option>
              </select>
            </label>
          </>
        )}
        {tab === 'rewards' && (
          <>
            <div className="wardrobe-progress">
              <span>{progress.storyWins} story challenges won</span>
              <span>{progress.onlineWins} online wins</span>
            </div>
            <p className="muted small">
              Win different story challenges or finish first outright against other people online.
              Every earned item is yours to wear in free play and online.
            </p>
            <div className="wardrobe-rewards">
              {COSMETIC_REWARDS.map((reward) => {
                const earned = rewardUnlocked(reward, progress),
                  current = reward.source === 'story' ? progress.storyWins : progress.onlineWins;
                return (
                  <button
                    key={`${reward.key}-${reward.value}`}
                    className="wardrobe-reward"
                    data-earned={earned}
                    disabled={!earned || loading}
                    onClick={() => {
                      setFace({ ...face, [reward.key]: reward.value });
                      setTab('character');
                    }}
                  >
                    <CharacterAvatar
                      avatar={encodeAvatar({ ...face, [reward.key]: reward.value })}
                      name={reward.name}
                    />
                    <span>
                      <strong>{reward.name}</strong>
                      <small>
                        {earned ? <Check size={12} /> : <LockKeyhole size={12} />}{' '}
                        {earned
                          ? 'Earned · tap to wear'
                          : `${Math.min(current, reward.wins)}/${reward.wins} ${reward.source === 'story' ? 'story wins' : 'online wins'}`}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {tab === 'record' && (
          <>
            <ProfileStats record={record} />
            <p className="muted small">
              Your guest record stays with this browser. Clearing site data or changing devices
              creates a different guest. Account recovery will come with sign-in.
            </p>
          </>
        )}
        {loading && (
          <p className="small muted">
            <LoaderCircle className="spin" size={14} /> Loading your online record…
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <p className="muted small">
          Your character joins new solo, pass-and-play and online tables. Online faces use a tiny
          character code; no image uploads are needed. Changes apply to your next table.
        </p>
        <button
          className="button primary full"
          disabled={loading || busy || !name.trim()}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setError('');
              const value = { name: name.trim(), avatar, royalTitle, country };
              try {
                if (await hasOnlineSession()) await saveOnlineProfile(value);
                onSave(value);
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Your character could not be saved.');
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <>
              Save my character <ArrowRight size={17} />
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}
