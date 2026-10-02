import { expect, it } from 'vitest';
import { AVATAR_OPTIONS, DEFAULT_AVATAR, decodeAvatar, encodeAvatar, royalAvatar } from './avatars';
import { createGame } from './engine';
it('round-trips tiny avatar codes and rejects unbounded or malformed faces', () => {
  expect(encodeAvatar(DEFAULT_AVATAR)).toHaveLength(9);
  expect(decodeAvatar(encodeAvatar(DEFAULT_AVATAR))).toEqual(DEFAULT_AVATAR);
  for (const [key, count] of Object.entries(AVATAR_OPTIONS)) {
    expect(decodeAvatar(encodeAvatar({ ...DEFAULT_AVATAR, [key]: count - 1 }))?.[key as keyof typeof DEFAULT_AVATAR]).toBe(count - 1);
    expect(() => encodeAvatar({ ...DEFAULT_AVATAR, [key]: count })).toThrow();
  }
  for (const value of [null, {}, 'a1zzzzzzz', '<svg/>', 'https://example.com/face.png', 'a100000000']) expect(decodeAvatar(value)).toBeNull();
  expect(decodeAvatar(royalAvatar())!.accessory).toBe(7);
  const game = createGame({ seed: 1, players: [{ id: 'a', name: 'A', avatar: encodeAvatar(DEFAULT_AVATAR) }, { id: 'b', name: 'B', avatar: '<svg/>' }] });
  expect(game.players[0].avatar).toBe(encodeAvatar(DEFAULT_AVATAR)); expect(game.players[1].avatar).toBeUndefined();
});
