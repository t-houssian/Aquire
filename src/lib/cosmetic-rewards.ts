import { COSMETIC_REWARDS, type CosmeticReward } from '../game/avatars';
import type { GameState } from '../game/types';

export const cosmeticRewardId = (reward: CosmeticReward) => `${reward.key}:${reward.value}`;

export function newlyEarnedCosmetics(source: CosmeticReward['source'], before: number, after: number): CosmeticReward[] {
  return COSMETIC_REWARDS.filter((reward) => reward.source === source && before < reward.wins && after >= reward.wins);
}

export function cosmeticsFromIds(ids: unknown, source: CosmeticReward['source']): CosmeticReward[] {
  return Array.isArray(ids)
    ? COSMETIC_REWARDS.filter((reward) => reward.source === source && ids.includes(cosmeticRewardId(reward)))
    : [];
}

interface OnlineRewardRecord {
  gameId: string;
  viewerId: string;
  winsBefore?: number;
  earned?: string[];
}
const KEY = 'aquire.match-rewards.v1';
const starts = new Map<string, Promise<number | null>>();
const finishes = new Map<string, Promise<CosmeticReward[]>>();
const validWins = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

function readRecords(): OnlineRewardRecord[] {
  try {
    const records = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(records) ? records.filter((record) => typeof record?.gameId === 'string'
      && typeof record.viewerId === 'string' && (validWins(record.winsBefore) || Array.isArray(record.earned))).slice(0, 100) : [];
  } catch { return []; }
}
function remember(record: OnlineRewardRecord): void {
  const records = readRecords().filter((item) => item.gameId !== record.gameId || item.viewerId !== record.viewerId);
  try { localStorage.setItem(KEY, JSON.stringify([record, ...records].slice(0, 100))); }
  catch { /* A reward notice must never interrupt gameplay if browser storage is full. */ }
}
export function readOnlineMatchRewards(gameId: string, viewerId: string): CosmeticReward[] {
  return cosmeticsFromIds(readRecords().find((item) => item.gameId === gameId && item.viewerId === viewerId)?.earned, 'online');
}

/** Two small profile reads per eligible match, never per turn. All receipts stay in this browser. */
export async function trackOnlineMatchRewards(game: GameState, viewerId: string, getWins: () => Promise<number | null>): Promise<CosmeticReward[]> {
  if (game.players.filter((player) => !player.isBot).length < 2
    || !game.players.some((player) => player.id === viewerId && !player.isBot)) return [];
  const key = `${game.id}:${viewerId}`;
  const saved = readRecords().find((item) => item.gameId === game.id && item.viewerId === viewerId);
  if (saved?.earned) return cosmeticsFromIds(saved.earned, 'online');
  if (game.phase !== 'ended') {
    if (validWins(saved?.winsBefore)) return [];
    let start = starts.get(key);
    if (!start) {
      start = (async () => {
        const wins = await getWins().catch(() => null);
        if (!validWins(wins)) return null;
        remember({ gameId: game.id, viewerId, winsBefore: wins });
        return wins;
      })();
      starts.set(key, start);
      // Keep failed requests quiet until a later session; don't retry on every turn.
      if (starts.size > 100) starts.delete(starts.keys().next().value!);
    }
    await start;
    return [];
  }
  const pending = finishes.get(key);
  if (pending) return pending;
  const finish = (async () => {
    const before = validWins(saved?.winsBefore) ? saved.winsBefore : await starts.get(key);
    const won = game.winnerIds.length === 1 && game.winnerIds[0] === viewerId;
    // An already-finished room has no before count. Never guess which old win earned an item.
    if (!won || !validWins(before)) {
      remember({ gameId: game.id, viewerId, earned: [] });
      return [];
    }
    const after = await getWins().catch(() => null);
    if (!validWins(after)) return [];
    // If other games changed the record too, these unlocks cannot be attributed to this match.
    const rewards = after === before + 1 ? newlyEarnedCosmetics('online', before, after) : [];
    remember({ gameId: game.id, viewerId, earned: rewards.map(cosmeticRewardId) });
    return rewards;
  })();
  finishes.set(key, finish);
  try { return await finish; }
  finally { finishes.delete(key); starts.delete(key); }
}
