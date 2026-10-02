import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../game/engine';
import { cosmeticsFromIds, newlyEarnedCosmetics, readOnlineMatchRewards, trackOnlineMatchRewards } from './cosmetic-rewards';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

let gameSequence = 0;
function table() {
  return createGame({ id: `reward-test-${gameSequence++}`, players: [{ id: 'alex', name: 'Alex' }, { id: 'morgan', name: 'Morgan' }] });
}

describe('match-specific cosmetic rewards', () => {
  it('lists only the items newly unlocked at a milestone', () => {
    expect(newlyEarnedCosmetics('story', 0, 1).map((r) => r.name)).toEqual(['The first key']);
    expect(newlyEarnedCosmetics('story', 1, 2)).toEqual([]);
    expect(newlyEarnedCosmetics('story', 5, 5)).toEqual([]);
    expect(newlyEarnedCosmetics('story', 4, 5).map((r) => r.name)).toEqual(['Space investor helmet', 'City skyline']);
    expect(newlyEarnedCosmetics('story', 80, 81).map((r) => r.name)).toEqual(['The sovereign crown', 'Royal cape', 'Kingdom seal']);
    expect(cosmeticsFromIds(['badge:1', 'accessory:19', 'unknown', 'badge:1'], 'story').map((r) => r.name)).toEqual(['The first key']);
    expect(cosmeticsFromIds(null, 'online')).toEqual([]);
  });

  it('uses two small profile reads per win and retains the exact items on replay', async () => {
    const game = table();
    const getWins = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await Promise.all([trackOnlineMatchRewards(game, 'alex', getWins), trackOnlineMatchRewards(game, 'alex', getWins)]);
    await trackOnlineMatchRewards({ ...game, phase: 'buy' }, 'alex', getWins);
    expect(getWins).toHaveBeenCalledTimes(1);
    const ended = { ...game, phase: 'ended' as const, winnerIds: ['alex'] };
    const [rewards] = await Promise.all([trackOnlineMatchRewards(ended, 'alex', getWins), trackOnlineMatchRewards(ended, 'alex', getWins)]);
    expect(rewards.map((r) => r.name)).toEqual(['Winner’s laurels', 'First online trophy']);
    expect(getWins).toHaveBeenCalledTimes(2);
    await trackOnlineMatchRewards(ended, 'alex', getWins);
    expect(getWins).toHaveBeenCalledTimes(2);
    expect(readOnlineMatchRewards(game.id, 'alex')).toEqual(rewards);
    expect(readOnlineMatchRewards(game.id, 'morgan')).toEqual([]);
  });

  it('does not announce an unlock for an ordinary win, a loss or a tie', async () => {
    for (const winners of [['alex'], ['morgan'], ['alex', 'morgan']]) {
      const game = table();
      const getWins = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
      await trackOnlineMatchRewards(game, 'alex', getWins);
      expect(await trackOnlineMatchRewards({ ...game, phase: 'ended', winnerIds: winners }, 'alex', getWins)).toEqual([]);
      expect(readOnlineMatchRewards(game.id, 'alex')).toEqual([]);
      expect(getWins).toHaveBeenCalledTimes(winners.length === 1 && winners[0] === 'alex' ? 2 : 1);
    }
  });

  it('never attributes existing rewards to an already finished room or to a different account', async () => {
    const game = table();
    const getWins = vi.fn().mockResolvedValue(5);
    expect(await trackOnlineMatchRewards({ ...game, phase: 'ended', winnerIds: ['alex'] }, 'alex', getWins)).toEqual([]);
    expect(getWins).not.toHaveBeenCalled();
    const active = table();
    await trackOnlineMatchRewards(active, 'alex', getWins);
    expect(await trackOnlineMatchRewards({ ...active, phase: 'ended', winnerIds: ['morgan'] }, 'morgan', getWins)).toEqual([]);
    expect(getWins).toHaveBeenCalledTimes(1);
  });

  it('ignores CPU-only opponents and avoids attributing concurrent match wins', async () => {
    const game = table();
    const getWins = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    const solo = { ...game, players: game.players.map((p) => ({ ...p, isBot: p.id !== 'alex' })) };
    await trackOnlineMatchRewards(solo, 'alex', getWins);
    expect(getWins).not.toHaveBeenCalled();
    await trackOnlineMatchRewards(game, 'alex', getWins);
    expect(await trackOnlineMatchRewards({ ...game, phase: 'ended', winnerIds: ['alex'] }, 'alex', getWins)).toEqual([]);
  });

  it('recovers the before count after a reload without another start read', async () => {
    const game = table();
    memory.set('aquire.match-rewards.v1', JSON.stringify([{ gameId: game.id, viewerId: 'alex', winsBefore: 4 }]));
    const getWins = vi.fn().mockResolvedValue(5);
    await trackOnlineMatchRewards(game, 'alex', getWins);
    expect(getWins).not.toHaveBeenCalled();
    expect((await trackOnlineMatchRewards({ ...game, phase: 'ended', winnerIds: ['alex'] }, 'alex', getWins)).map((r) => r.name)).toEqual(['Diamond monocle', 'Golden confetti']);
    expect(getWins).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight before count and never retries a failed start on each turn', async () => {
    const game = table();
    let resolve!: (wins: number) => void;
    const getWins = vi.fn().mockReturnValueOnce(new Promise<number>((done) => { resolve = done; })).mockResolvedValueOnce(1);
    const start = trackOnlineMatchRewards(game, 'alex', getWins);
    const finish = trackOnlineMatchRewards({ ...game, phase: 'ended', winnerIds: ['alex'] }, 'alex', getWins);
    resolve(0);
    await start;
    expect(await finish).toHaveLength(2);
    const offline = table();
    const fail = vi.fn().mockRejectedValue(new Error('Offline'));
    await trackOnlineMatchRewards(offline, 'alex', fail);
    await trackOnlineMatchRewards({ ...offline, phase: 'buy' }, 'alex', fail);
    expect(await trackOnlineMatchRewards({ ...offline, phase: 'ended', winnerIds: ['alex'] }, 'alex', fail)).toEqual([]);
    expect(fail).toHaveBeenCalledTimes(1);
  });
});
