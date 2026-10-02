import { useState } from 'react';
import { ArrowRight, Shuffle } from 'lucide-react';
import { AVATAR_OPTIONS, DEFAULT_AVATAR, decodeAvatar, encodeAvatar, type AvatarSpec } from '../game/avatars';
import type { PlayerProfile } from '../lib/profile';
import CharacterAvatar from './CharacterAvatar';
import Modal from './Modal';
import '../avatar-editor.css';
const labels: Record<keyof AvatarSpec, string[]> = {
  skin: ['Porcelain', 'Warm cocoa', 'Peach', 'Espresso', 'Cream', 'Caramel', 'Copper'],
  hair: ['Ink', 'Chestnut', 'Champagne', 'Chocolate', 'Silver', 'Ginger', 'Ocean', 'Plum'],
  cut: ['The side hustle', 'The deal swoop', 'The brainstorm', 'The professor'],
  eyes: ['Wide awake', 'A happy squint', 'The skeptic'], mouth: ['Big grin', 'Knowing smile', 'Poker face'],
  accessory: ['Round specs', 'The tycoon hat', 'Monocle', 'Mighty moustache', 'The beret', 'Statement specs', 'Flower & bow', 'A tiny crown', 'Keep it simple'],
  color: Array.from({ length: 24 }, (_, i) => `Suit ${i + 1}`),
};
export default function AvatarEditor({ profile, onSave, onClose }: { profile: PlayerProfile; onSave: (profile: PlayerProfile) => void; onClose: () => void }) {
  const [name, setName] = useState(profile.name), [face, setFace] = useState(decodeAvatar(profile.avatar) ?? DEFAULT_AVATAR), [royalTitle, setTitle] = useState(profile.royalTitle);
  const avatar = encodeAvatar(face);
  return <Modal title="Meet your next tycoon." onClose={onClose}>
    <div className="modal-body avatar-editor">
      <div className="avatar-editor-preview"><CharacterAvatar avatar={avatar} name={name} /><div><strong>{name.trim() || 'You'}</strong><p>A small face. Enormous ambitions.</p><button className="button secondary" onClick={() => {
        const random = crypto.getRandomValues(new Uint32Array(7));
        setFace(Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([key, count], i) => [key, random[i] % count])) as unknown as AvatarSpec);
      }}><Shuffle size={15} /> Surprise me</button></div></div>
      <label className="field-label" htmlFor="character-name">Your name<input id="character-name" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="avatar-editor-options">{(Object.keys(AVATAR_OPTIONS) as (keyof AvatarSpec)[]).map((key) => <label key={key}>{({ skin: 'Skin', hair: 'Hair color', cut: 'Hair style', eyes: 'Eyes', mouth: 'Smile', accessory: 'Finishing touch', color: 'Suit color' })[key]}
        {key === 'color' ? <div className="avatar-color-options" role="group" aria-label="Suit color">{labels.color.map((label, i) => <button key={i} aria-label={label} aria-pressed={face.color === i} style={{ background: `hsl(${i * 15} 35% 40%)` }} onClick={() => setFace({ ...face, color: i })} />)}</div>
          : <select aria-label={key} value={face[key]} onChange={(e) => setFace({ ...face, [key]: Number(e.target.value) })}>{labels[key].map((label, i) => <option value={i} key={i}>{label}</option>)}</select>}
      </label>)}</div>
      <label className="field-label">Your royal title<select aria-label="Royal title" value={royalTitle} onChange={(e) => setTitle(e.target.value as PlayerProfile['royalTitle'])}><option>King</option><option>Queen</option></select></label>
      <p className="muted small">Saved on this device. Your character joins new solo, pass-and-play and online tables. Online players see your face; no image uploads are needed.</p>
      <button className="button primary full" onClick={() => { onSave({ name, avatar, royalTitle }); onClose(); }}>Save my character <ArrowRight size={17} /></button>
    </div>
  </Modal>;
}
