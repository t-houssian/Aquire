import { createGame, getMap } from '../functions/_shared/game/engine.ts';
import { CHAIN_IDS } from '../functions/_shared/game/types.ts';
import {
  parseAction,
  parseCode,
  parseName,
  publicRoom,
  requireActor,
  requireCurrentRules,
  secureDeal,
  type StoredRoom,
} from '../functions/acquire-room/protocol.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function rejects(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    assert((error as { code: string }).code === code, `Expected ${code}, got ${error}`);
    return;
  }
  throw new Error(`Expected ${code} to be rejected`);
}
function fixture(): StoredRoom {
  const players = [
    { id: 'alice', name: 'Alice', isBot: false },
    { id: 'bob', name: 'Bob', isBot: false },
    { id: 'bot', name: 'Computer', isBot: true },
  ];
  return {
    id: 'test',
    code: 'ABC234',
    host_id: 'alice',
    mode: 'classic',
    ruleset: '2008',
    status: 'playing',
    version: 1,
    players,
    game: createGame({ players, seed: 9001 }),
    updated_at: '2026-09-17T00:00:00Z',
  };
}

Deno.test('room views preserve only the viewer hand and reveal no bag/seed/rng', () => {
  const room = fixture();
  const view = publicRoom(room, 'alice');
  assert(view.game?.seed === 0 && view.game.rng === 0, 'RNG leaked');
  assert(
    view.game.bag.length === room.game!.bag.length && view.game.bag.every((tile) => tile === '?'),
    'Bag leaked',
  );
  for (const player of view.game.players) {
    const original = room.game!.players.find((candidate) => candidate.id === player.id)!;
    assert(player.hand.length === original.hand.length, 'Hand counts changed');
    assert(
      player.id === 'alice'
        ? player.hand.join() === original.hand.join()
        : player.hand.every((tile) => tile === '?'),
      'Opponent hand leaked',
    );
  }
  assert(
    view.ruleset === '2008' && view.game.version === 2 && view.game.ruleset === '2008',
    'Rules edition was lost',
  );
  assert(
    room.game!.seed === 9001 && room.game!.bag.every((tile) => tile !== '?'),
    'Sanitization mutated authoritative state',
  );
  rejects(() => publicRoom(room, 'outsider'), 'ROOM_NOT_FOUND');
  rejects(() => publicRoom(room, 'bot'), 'ROOM_NOT_FOUND');
});

Deno.test('new map tile sets survive server dealing and member-safe room views', () => {
  for (const [mapId, count] of [
    ['hourglass', 84], ['crossroads', 80], ['switchback', 84], ['atoll', 86], ['four-spires', 80],
    ['big-rectangle', 192], ['big-crater', 168], ['big-harbors', 160],
    ['mega-diamond', 240], ['mega-rivers', 240], ['mega-divide', 232],
    ['max-metropolis', 384], ['max-archipelago', 292], ['max-cross', 312],
  ] as const) {
    const room = fixture();
    room.game = createGame({ players: room.players, mapId, seed: 81 });
    room.game = secureDeal(room.game);
    const dealt = [...Object.keys(room.game.board), ...room.game.bag, ...room.game.players.flatMap((player) => player.hand)];
    assert(dealt.length === count && new Set(dealt).size === count, `${mapId} dealing changed its tile set`);
    assert(getMap(mapId).tiles.length === count, `${mapId} not available on the server`);
    const view = publicRoom(room, 'alice');
    assert(view.game?.mapId === mapId && view.game.bag.length === room.game.bag.length, `${mapId} view lost the map`);
    assert(view.game.bag.every((tile) => tile === '?'), `${mapId} bag leaked`);
  }
});

Deno.test('anonymous house rules mask cash, holdings, bank counts, and private trades in room responses', () => {
  const room = fixture();
  const state = room.game!;
  state.houseRules = { ...state.houseRules!, hiddenMoney: true, anonymousBuying: true };
  state.players.find((player) => player.id === 'bob')!.cash = 3400;
  state.players.find((player) => player.id === 'bob')!.stocks.worldwide = 4;
  state.bank.worldwide = 21;
  state.logs.push({ id: 100, turn: 2, type: 'buy', playerId: 'bob', message: 'Bob buys 4 Worldwide for $800.' });
  state.logs.push({ id: 101, turn: 2, type: 'sell', playerId: 'bob', message: 'Bob sells 1 Sackson for $200.' });
  state.logs.push({ id: 102, turn: 2, type: 'dividend', message: 'Round 1: $2,000 paid.' });
  const view = publicRoom(room, 'alice');
  const bob = view.game!.players.find((player) => player.id === 'bob')!;
  assert(bob.cash === 0 && bob.stocks.worldwide === 0, 'Opponent wealth leaked');
  assert(view.game!.bank.worldwide === 13, 'Bank quantity leaked');
  assert(view.game!.logs.filter((entry) => entry.id >= 100).every((entry) => !entry.message.includes('$')), 'Private financial log leaked');
  assert(room.game!.players.find((player) => player.id === 'bob')!.cash === 3400, 'Authoritative state mutated');
  room.game!.phase = 'ended';
  const finalView = publicRoom(room, 'alice');
  assert(finalView.game!.players.find((player) => player.id === 'bob')!.cash === 3400, 'Final money stayed hidden');
  assert(finalView.game!.bank.worldwide === 21, 'Final bank stayed hidden');
});

Deno.test(
  'authorization follows the shareholder in a merger and turn owner for end declaration',
  () => {
    const room = fixture();
    const state = room.game!;
    const alice = state.players.findIndex((player) => player.id === 'alice');
    const bob = state.players.findIndex((player) => player.id === 'bob');
    state.currentPlayer = alice;
    requireActor(room, 'alice', { type: 'pass' });
    rejects(() => requireActor(room, 'bob', { type: 'pass' }), 'NOT_YOUR_TURN');
    rejects(() => requireActor(room, 'outsider', { type: 'pass' }), 'ROOM_NOT_FOUND');
    state.phase = 'merger-shares';
    const [survivor, acquired] = CHAIN_IDS;
    state.merger = {
      tile: '1A',
      chains: [survivor, acquired],
      sizes: { [survivor]: 3, [acquired]: 2 },
      survivor,
      survivorOptions: [],
      remaining: [],
      orderOptions: [],
      acquired,
      sharePrice: 200,
      shareholders: [bob, alice],
      shareholderCursor: 0,
    };
    requireActor(room, 'bob', { type: 'resolve-shares', sell: 0, trade: 0 });
    rejects(
      () => requireActor(room, 'alice', { type: 'resolve-shares', sell: 0, trade: 0 }),
      'NOT_YOUR_TURN',
    );
    rejects(() => requireActor(room, 'bob', { type: 'declare-end' }), 'NOT_YOUR_TURN');
    requireActor(room, 'alice', { type: 'declare-end' });
  },
);

Deno.test('earlier-edition rooms and game states are rejected without mutation', () => {
  const legacy = { ...fixture(), ruleset: '2023' as const };
  const before = JSON.stringify(legacy);
  rejects(() => requireCurrentRules(legacy), 'OLD_RULESET');
  rejects(() => publicRoom(legacy, 'alice'), 'OLD_RULESET');
  rejects(() => requireActor(legacy, 'alice', { type: 'pass' }), 'OLD_RULESET');
  assert(JSON.stringify(legacy) === before, 'Historical state was changed');
  for (const incompatible of [
    { ...fixture(), mode: 'tycoon' },
    { ...fixture(), game: { ...fixture().game, version: 1 } },
    { ...fixture(), game: { ...fixture().game, ruleset: '2023' } },
  ])
    rejects(() => requireCurrentRules(incompatible as StoredRoom), 'OLD_RULESET');
});

Deno.test('malformed and oversized action payloads cannot reach the game engine', () => {
  const [first, second] = CHAIN_IDS;
  for (const action of [
    null,
    {},
    { type: 'place', tile: '?' },
    { type: 'place', tile: '100A' },
    { type: 'place', tile: '24AA' },
    { type: 'buy', stocks: { [first]: -1 } },
    { type: 'buy', stocks: { [first]: 11, [second]: 3 } },
    { type: 'buy', stocks: {}, sellStocks: { [first]: 4 } },
    { type: 'remove', tile: '100A' },
    { type: 'buy', stocks: { fake: 1 } },
    { type: 'buy', stocks: { [first]: 1.5 } },
    { type: 'resolve-shares', sell: 0, trade: 3 },
    { type: 'resolve-shares', sell: 101, trade: 0 },
    { type: 'discard', tiles: ['1A', '1A'] },
    { type: 'replace-state', state: {} },
  ]) {
    rejects(() => parseAction(action), 'INVALID_REQUEST');
  }
  assert(
    parseAction({ type: 'place', tile: '12I', playerId: 'someone-else' }).type === 'place',
    'Valid move rejected',
  );
  assert(parseAction({ type: 'place', tile: '24P' }).type === 'place', 'Large-map coordinate rejected');
  assert(parseAction({ type: 'place', tile: '30Q' }).type === 'place', 'Wide-map coordinate rejected');
  assert(parseAction({ type: 'place', tile: '23W' }).type === 'place', 'Tall-map coordinate rejected');
  assert(parseAction({ type: 'remove', tile: '12I' }).type === 'remove', 'House-rule removal rejected');
  assert(parseAction({ type: 'finish-placing' }).type === 'finish-placing', 'Multi-placement completion rejected');
  assert(parseAction({ type: 'buy', stocks: { [first]: 10 }, sellStocks: { [second]: 3 } }).type === 'buy', 'House-rule trade rejected');
  assert(parseAction({ type: 'found', chain: 'goldspire' }).type === 'found', 'Custom hotel founding rejected');
  assert(parseAction({ type: 'resolve-shares', sell: 100, trade: 0 }).type === 'resolve-shares', 'Custom share supply settlement rejected');
  assert(
    !('playerId' in parseAction({ type: 'pass', playerId: 'someone-else' })),
    'Untrusted identity preserved',
  );
  assert(
    parseAction({ type: 'replace-dead-tiles' }).type === 'replace-dead-tiles',
    'Individual dead-tile replacement was rejected',
  );
  assert(parseAction({ type: 'exchange-hand' }).type === 'exchange-hand',
    '2008 full-rack exchange was rejected');
  assert(parseName('  Alex  Smith ') === 'Alex Smith', 'Name normalization failed');
  assert(parseCode(' abc234 ') === 'ABC234', 'Code normalization failed');
  rejects(() => parseCode('ABIO01'), 'INVALID_CODE');
});

Deno.test(
  'cryptographic redeal preserves all tile counts and public seating without changing input',
  () => {
    const room = fixture();
    const before = room.game!;
    const after = secureDeal(before);
    assert(JSON.stringify(before.board) === JSON.stringify(after.board), 'Public board changed');
    const tiles = (state: typeof before) =>
      [...state.bag, ...state.players.flatMap((player) => player.hand)].sort().join();
    assert(tiles(before) === tiles(after), 'Tiles lost or duplicated');
    assert(
      after.players.every((player) => player.hand.length === 6),
      'Incorrect rack count',
    );
    assert(
      after.players.map((player) => player.id).join() ===
        before.players.map((player) => player.id).join(),
      'Seating changed',
    );
    assert(after.bag !== before.bag && after.players !== before.players, 'State aliased');
  },
);
