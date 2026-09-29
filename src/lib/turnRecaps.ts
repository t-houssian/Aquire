import { CHAINS, getHouseRules, getNeighbors, type ChainId, type GameLog, type GameState, type MapId, type Tile } from '../game/engine';

export interface TurnRecapData {
  id: string;
  turn: number;
  playerId: string;
  playerName: string;
  isBot: boolean;
  mapId?: MapId;
  tile: Tile | null;
  tiles?: Tile[];
  removedTiles?: Tile[];
  anonymousBuying?: boolean;
  chain: ChainId | 'independent' | null;
  board: GameState['board'];
  purchases: { chain: ChainId; quantity: number }[];
  purchaseMessage: string;
  founding: { chain: ChainId; receivedShare: boolean } | null;
  events: Pick<GameLog, 'id' | 'type' | 'message'>[];
}

function absorbIndependent(board: GameState['board'], chain: ChainId, mapId?: MapId, seed?: Tile) {
  const queue = seed ? [seed] : Object.keys(board).filter((tile) => board[tile] === chain);
  const visited = new Set<Tile>();
  while (queue.length) {
    const tile = queue.pop()!;
    if (visited.has(tile)) continue;
    visited.add(tile);
    if (board[tile] !== 'independent' && board[tile] !== chain) continue;
    board[tile] = chain;
    queue.push(...getNeighbors(tile, mapId).filter((neighbor) => board[neighbor] === 'independent'));
  }
}

/** Replay only public board events so batched updates retain each turn's own map. */
function advanceBoard(board: GameState['board'], entry: GameLog, mapId?: MapId) {
  if (entry.type === 'remove' && entry.tile) delete board[entry.tile];
  if (entry.type === 'tile' && entry.tile) board[entry.tile] = 'independent';
  if (entry.type === 'tile' && entry.chain) absorbIndependent(board, entry.chain, mapId);
  if (entry.type === 'found' && entry.chain) absorbIndependent(board, entry.chain, mapId, entry.tile);
  if (entry.type === 'merger' && entry.chain) {
    const survivor = CHAINS.find((chain) => entry.message.startsWith(`${chain.name} acquires `));
    if (survivor) {
      for (const tile of Object.keys(board)) {
        if (board[tile] === entry.chain) board[tile] = survivor.id;
      }
    } else if (entry.message.includes(' now spans ')) {
      absorbIndependent(board, entry.chain, mapId);
    }
  }
}

/**
 * Observe live snapshots, never historical turns on opening or resuming a table.
 * A buy event (including passing on shares) completes a turn, even at game end.
 * No hand, bank count, or ongoing portfolio is included in these public recaps.
 */
export function collectTurnRecaps(
  previous: GameState | null | undefined,
  next: GameState,
  viewerId: string,
  includeAllPlayers = false,
): TurnRecapData[] {
  if (!previous || previous.id !== next.id || next.revision <= previous.revision) return [];
  const lastSeenId = previous.logs.at(-1)?.id ?? 0;
  const freshLogs = next.logs.filter((entry) => entry.id > lastSeenId);
  const board = { ...previous.board };
  const recaps: TurnRecapData[] = [];
  for (const entry of freshLogs) {
    advanceBoard(board, entry, next.mapId);
    if (entry.type === 'remove' && entry.tile && recaps.at(-1)?.turn === entry.turn) {
      const recap = recaps[recaps.length - 1];
      recap.board = { ...board };
      recap.removedTiles = [...(recap.removedTiles ?? []), entry.tile];
    }
    if (entry.type !== 'buy' || !entry.playerId) continue;
    if (!includeAllPlayers && entry.playerId === viewerId) continue;
    const player = next.players.find((candidate) => candidate.id === entry.playerId);
    if (!player) continue;
    const turnLogs = next.logs.filter((log) => log.turn === entry.turn && log.id <= entry.id);
    const placements = turnLogs.filter((log) => log.type === 'tile' && log.playerId === player.id && log.tile).map((log) => log.tile!);
    const removedTiles = turnLogs.filter((log) => log.type === 'remove' && log.playerId === player.id && log.tile).map((log) => log.tile!);
    const placement = placements.at(-1);
    const founding = turnLogs.find((log) => log.type === 'found' && log.playerId === player.id);
    const anonymousBuying = getHouseRules(next).anonymousBuying;
    // Quantities come from the engine's public purchase event, not portfolio differences:
    // differences can also contain founder shares, trades, or end-game liquidation.
    const purchasePrefix = `${player.name} buys `;
    const purchaseText = entry.message.slice(purchasePrefix.length);
    const purchases = !anonymousBuying && entry.message.startsWith(purchasePrefix)
      ? CHAINS.filter((chain) => getHouseRules(next).hotelChains.includes(chain.id)).flatMap((chain) => {
          const match = purchaseText.match(new RegExp(`(?:^|, )(\\d+) ${chain.name}(?=,| for )`));
          return match ? [{ chain: chain.id, quantity: Number(match[1]) }] : [];
        })
      : [];
    recaps.push({
      id: `${next.id}:${entry.id}`,
      turn: entry.turn,
      playerId: player.id,
      playerName: player.name,
      isBot: player.isBot,
      mapId: next.mapId,
      tile: placement ?? null,
      tiles: placements,
      removedTiles,
      anonymousBuying,
      chain: placement ? (board[placement] ?? 'independent') : null,
      board: { ...board },
      purchases,
      purchaseMessage: anonymousBuying ? `${player.name} completed a private market order.` : entry.message,
      founding: founding?.chain
        ? {
            chain: founding.chain,
            receivedShare: founding.message.includes('one free founder share'),
          }
        : null,
      events: turnLogs
        .filter((log) => ['merger', 'shares', 'bonus', 'discard', 'remove', 'sell'].includes(log.type))
        .map(({ id, type, message, playerId }) => ({ id, type, message:
          anonymousBuying && (type === 'sell' || type === 'shares') && playerId !== viewerId
            ? 'Private share decision completed.'
            : (getHouseRules(next).hiddenMoney || anonymousBuying) && type === 'bonus' && playerId !== viewerId
              ? 'A private shareholder bonus was paid.'
              : message })),
    });
  }
  return recaps;
}
