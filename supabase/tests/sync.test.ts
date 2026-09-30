import { applyAction, chooseBotAction, createGame } from '../functions/_shared/game/engine.ts';
import { publicRoom, type StoredRoom } from '../functions/acquire-room/protocol.ts';
import { applyRoomUpdate, makeRoomUpdate } from '../functions/_shared/room-wire.ts';
import { jsonResponse } from '../functions/acquire-room/response.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const json = (value: unknown) => JSON.stringify(value);
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const bytes = (value: unknown) => new TextEncoder().encode(json(value)).length;

Deno.test('personalized changes preserve complete games, private rules and final settlements within a small traffic budget', () => {
  for (const [count, mapId, privacy] of [[4, 'classic', false], [4, 'classic', true], [12, 'max-metropolis', false]] as const) {
    const players = Array.from({ length: count }, (_, i) => ({ id: `player-${i}`, name: `Investor ${i + 1}`, isBot: false }));
    let room: StoredRoom = { id: 'room', code: 'ABC234', host_id: players[0].id, ruleset: '2008', mode: 'classic',
      status: 'playing', version: 1, players, updated_at: '', game: createGame({ players, seed: 9001, mapId,
        houseRules: privacy ? { hiddenMoney: true, anonymousBuying: true, marketMode: 'crazy', dividends: true } : {} }) };
    let commands = 0, legacyBytes = 0, updateBytes = 0, legacyDb = 0, nextDb = 0, mergers = 0;
    while (room.game!.phase !== 'ended' && commands < 1200) {
      const old = room;
      const game = applyAction(room.game!, chooseBotAction(room.game!));
      room = { ...room, game, version: room.version + 1, status: game.phase === 'ended' ? 'finished' : 'playing' };
      if (game.merger) mergers++;
      commands++;
      legacyDb += bytes(old.game) + bytes(game) * (count + 1);
      nextDb += bytes(old.game) + bytes({ ...room, game: undefined });
      for (const player of players) {
        const before = publicRoom(old, player.id), after = publicRoom(room, player.id);
        const update = makeRoomUpdate(before, after);
        const restored = applyRoomUpdate(before, JSON.parse(json(update)));
        assert(json(canonical(restored)) === json(canonical(after)), `${count}-seat ${mapId}: incorrect state at ${commands} for ${player.id}`);
        // Include one extra action response, using an average viewer payload.
        legacyBytes += bytes(after) * (1 + 1 / count);
        updateBytes += bytes(update) * (1 + 1 / count);
        if (game.phase !== 'ended') {
          assert(restored!.game!.bag.every((tile) => tile === '?'), 'Bag exposed');
          for (const other of restored!.game!.players.filter((p) => p.id !== player.id)) {
            assert(other.hand.every((tile) => tile === '?'), 'Opponent rack exposed');
            if (privacy) assert(other.cash === 0 && Object.values(other.stocks).every((n) => n === 0), 'Private finances exposed');
          }
        }
      }
    }
    assert(room.game!.phase === 'ended' && mergers > 0, 'Must exercise a full game with mergers');
    assert(updateBytes < legacyBytes * 0.2, 'Updates should cut client payload by at least 80%');
    assert(nextDb < legacyDb * 0.25, 'Database responses should shrink by at least 75%');
    console.log(json({ players: count, mapId, privacy, commands,
      oldClientMB: +(legacyBytes / 1e6).toFixed(3), newClientMB: +(updateBytes / 1e6).toFixed(3),
      oldDatabaseMB: +(legacyDb / 1e6).toFixed(3), newDatabaseMB: +(nextDb / 1e6).toFixed(3),
      oldMoveCalls: commands * (count + 1), newMoveCalls: commands }));
  }
});

Deno.test('large HTTP responses compress losslessly and small/unsupported responses remain readable', async () => {
  const payload = { data: Array.from({ length: 300 }, (_, i) => ({ id: i, message: 'A hotel was founded' })) };
  const compressed = jsonResponse(new Request('https://example.com', { headers: { 'Accept-Encoding': 'br, gzip' } }), payload);
  assert(compressed.headers.get('Content-Encoding') === 'gzip', 'Compression missing');
  const body = new Uint8Array(await compressed.arrayBuffer());
  assert(body.length < bytes(payload) / 4, 'Compression did not reduce payload');
  const plain = await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  assert(json(plain) === json(payload), 'Compression changed content');
  for (const encoding of ['', 'gzip;q=0', 'br']) {
    const response = jsonResponse(new Request('https://example.com', { headers: { 'Accept-Encoding': encoding } }), payload);
    assert(!response.headers.has('Content-Encoding') && json(await response.json()) === json(payload), 'Unsupported compression');
  }
  const small = jsonResponse(new Request('https://example.com', { headers: { 'Accept-Encoding': 'gzip' } }), { unchanged: true, version: 2 });
  assert(!small.headers.has('Content-Encoding'), 'Tiny response should avoid compression overhead');
  await small.body?.cancel();
});
