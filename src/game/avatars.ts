/** Seven tiny base-36 choices; no images, URLs or database profile rows. */
export interface AvatarSpec { skin: number; hair: number; cut: number; eyes: number; mouth: number; accessory: number; color: number }
export const AVATAR_OPTIONS = { skin: 7, hair: 8, cut: 4, eyes: 3, mouth: 3, accessory: 9, color: 24 } as const;
export const DEFAULT_AVATAR: AvatarSpec = { skin: 0, hair: 0, cut: 1, eyes: 0, mouth: 0, accessory: 1, color: 7 };
export function encodeAvatar(spec: AvatarSpec): string {
  return 'a1' + (Object.keys(AVATAR_OPTIONS) as (keyof AvatarSpec)[]).map((key) => {
    const value = spec[key];
    if (!Number.isInteger(value) || value < 0 || value >= AVATAR_OPTIONS[key]) throw new Error('Choose a valid face option.');
    return value.toString(36);
  }).join('');
}
export function decodeAvatar(value?: unknown): AvatarSpec | null {
  if (typeof value !== 'string' || !/^a1[0-9a-z]{7}$/.test(value)) return null;
  const spec = Object.fromEntries(Object.keys(AVATAR_OPTIONS).map((key, i) => [key, parseInt(value[i + 2], 36)])) as unknown as AvatarSpec;
  return (Object.keys(AVATAR_OPTIONS) as (keyof AvatarSpec)[]).every((key) => spec[key] < AVATAR_OPTIONS[key]) ? spec : null;
}
export const royalAvatar = (value?: string) => encodeAvatar({ ...(decodeAvatar(value) ?? DEFAULT_AVATAR), accessory: 7 });
