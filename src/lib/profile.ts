import { decodeAvatar, DEFAULT_AVATAR, encodeAvatar } from '../game/avatars';
export interface PlayerProfile { name: string; avatar: string; royalTitle: 'King' | 'Queen' }
const KEY = 'aquire.profile.v1';
export function readProfile(): PlayerProfile {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    return { name: typeof value?.name === 'string' ? value.name.trim().slice(0, 24) || 'You' : 'You',
      avatar: decodeAvatar(value?.avatar) ? value.avatar : encodeAvatar(DEFAULT_AVATAR), royalTitle: value?.royalTitle === 'Queen' ? 'Queen' : 'King' };
  } catch { return { name: 'You', avatar: encodeAvatar(DEFAULT_AVATAR), royalTitle: 'King' }; }
}
export function saveProfile(value: PlayerProfile): PlayerProfile {
  const profile = { name: value.name.trim().slice(0, 24) || 'You', avatar: decodeAvatar(value.avatar) ? value.avatar : encodeAvatar(DEFAULT_AVATAR), royalTitle: value.royalTitle };
  localStorage.setItem(KEY, JSON.stringify(profile));
  return profile;
}
