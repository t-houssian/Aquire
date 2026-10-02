import { expect, it } from 'vitest';
import { AVATAR_OPTIONS, COSMETIC_REWARDS, DEFAULT_AVATAR, avatarUnlocked, decodeAvatar, encodeAvatar, optionUnlocked, royalAvatar } from './avatars';
import { createGame } from './engine';
it('round-trips tiny avatar codes and rejects unbounded or malformed faces', () => {
  expect(encodeAvatar(DEFAULT_AVATAR)).toHaveLength(16);
  expect(decodeAvatar(encodeAvatar(DEFAULT_AVATAR))).toEqual(DEFAULT_AVATAR);
  for (const [key, count] of Object.entries(AVATAR_OPTIONS)) {
    expect(decodeAvatar(encodeAvatar({ ...DEFAULT_AVATAR, [key]: count - 1 }))?.[key as keyof typeof DEFAULT_AVATAR]).toBe(count - 1);
    expect(() => encodeAvatar({ ...DEFAULT_AVATAR, [key]: count })).toThrow();
  }
  for (const value of [null, {}, 'a1zzzzzzz', '<svg/>', 'https://example.com/face.png', 'a100000000', encodeAvatar(DEFAULT_AVATAR)+'\n']) expect(decodeAvatar(value)).toBeNull();
  expect(decodeAvatar(royalAvatar())!.accessory).toBe(7);
  const game = createGame({ seed: 1, players: [{ id: 'a', name: 'A', avatar: encodeAvatar(DEFAULT_AVATAR) }, { id: 'b', name: 'B', avatar: '<svg/>' }] });
  expect(game.players[0].avatar).toBe(encodeAvatar(DEFAULT_AVATAR)); expect(game.players[1].avatar).toBeUndefined();
});
it('preserves old faces and locks only earned additions at their exact milestones', () => {
  expect(decodeAvatar('a10010017')).toEqual(DEFAULT_AVATAR);
  expect(decodeAvatar('a11210182')).toMatchObject({skin:1,hair:2,cut:1,eyes:0,mouth:1,accessory:8,color:2,background:0});
  const fresh={storyWins:0,onlineWins:0};
  expect(avatarUnlocked(encodeAvatar(DEFAULT_AVATAR),fresh)).toBe(true);
  for(const reward of COSMETIC_REWARDS){
    const code=encodeAvatar({...DEFAULT_AVATAR,[reward.key]:reward.value});
    const metric=reward.source==='story'?'storyWins':'onlineWins';
    expect(optionUnlocked(reward.key,reward.value,{...fresh,[metric]:reward.wins-1})).toBe(false);
    expect(avatarUnlocked(code,{...fresh,[metric]:reward.wins})).toBe(true);
    expect(avatarUnlocked(code,fresh)).toBe(false);
  }
});
