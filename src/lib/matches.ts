import type { BotDifficulty, FinalChainSettlement, FinalResult, MapId, PlayerAward, PlayerMetrics, GameState } from '../game/types';
import { encodeBoardSnapshot } from '../game/engine';

export interface MatchSummary {
  id: string;
  endedAt: string;
  source: 'local' | 'online';
  mapId: MapId;
  botDifficulty: BotDifficulty;
  campaign?: GameState['campaign'];
  turn: number;
  playerCount: number;
  placedTiles: number;
  players: { id: string; name: string; isBot: boolean; characterId?: string }[];
  results: FinalResult[];
  finalSettlements: FinalChainSettlement[];
  awards: PlayerAward[];
  metrics: Record<string, PlayerMetrics>;
  winnerIds: string[];
  endReason: string;
  /** Compact one-character-per-coordinate city at the closing bell. */
  boardSnapshot?: string;
}

export function summarizeMatch(game: GameState, source: MatchSummary['source']): MatchSummary {
  if (game.phase !== 'ended') throw new Error('Only finished games can enter match history.');
  return {
    id: game.id, endedAt: new Date().toISOString(), source,
    mapId: game.mapId ?? 'classic', botDifficulty: game.botDifficulty ?? 'standard',
    ...(game.campaign ? { campaign: game.campaign } : {}),
    turn: game.turn, playerCount: game.players.length, placedTiles: Object.keys(game.board).length,
    players: game.players.map(({ id, name, isBot, characterId }) => ({ id, name, isBot, ...(characterId ? { characterId } : {}) })),
    results: game.results, finalSettlements: game.finalSettlements ?? [],
    awards: game.awards ?? [], metrics: game.metrics ?? {},
    winnerIds: game.winnerIds, endReason: game.endReason ?? 'The game ended.',
    boardSnapshot: game.boardSnapshot ?? encodeBoardSnapshot(game),
  };
}

export interface LeaderboardEntry {
  name: string;
  games: number;
  wins: number;
  best: number;
  total: number;
  trophies: number;
}
export function makeLeaderboard(matches: MatchSummary[]): LeaderboardEntry[] {
  const rows = new Map<string, LeaderboardEntry>();
  for (const match of matches) for (const player of match.players) {
    if (player.isBot) continue;
    const key = player.name.trim().toLocaleLowerCase();
    const row = rows.get(key) ?? { name: player.name, games: 0, wins: 0, best: 0, total: 0, trophies: 0 };
    const result = match.results.find((item) => item.playerId === player.id);
    row.games++;
    row.wins += Number(match.winnerIds.includes(player.id));
    row.best = Math.max(row.best, result?.total ?? 0);
    row.total += result?.total ?? 0;
    row.trophies += match.awards.filter((award) => award.playerId === player.id).length;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.wins - a.wins || b.best - a.best || b.total - a.total);
}
