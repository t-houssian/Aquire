import { describe, expect, it } from 'vitest';
import { applyRoomUpdate, makeRoomUpdate, type RoomPatch } from './room-wire';

const fixture = () => ({ id: 'room', viewerId: 'alice', version: 4,
  game: { board: { '1A': null as string | null }, logs: [{ id: 1, message: 'First' }],
    players: [{ id: 'alice', hand: ['2A', '3B'], cash: 6000 }], obsolete: true } });

describe('private room changes', () => {
  it('round trips board removals, player changes, logs and removed optional fields without mutation', () => {
    const before = fixture();
    const after = structuredClone(before); after.version++;
    after.game.board = { '1A': 'tower' };
    after.game.players[0].cash = 5400;
    after.game.players[0].hand = ['6C', '3B'];
    after.game.logs.push({ id: 2, message: 'Second' });
    delete (after.game as { obsolete?: boolean }).obsolete;
    const update = makeRoomUpdate(before, after);
    expect(applyRoomUpdate(before, JSON.parse(JSON.stringify(update)))).toEqual(after);
    expect(before).toEqual(fixture());
  });
  it('appends a rolling ledger without retransmitting history and reveals changed history on final settlement', () => {
    const before = fixture(); before.game.logs = Array.from({ length: 512 }, (_, id) => ({ id, message: 'A previous move' }));
    const after = structuredClone(before); after.version++;
    after.game.logs = [...before.game.logs.slice(2), { id: 512, message: 'New move' }, { id: 513, message: 'Another move' }];
    const patch = makeRoomUpdate(before, after);
    expect(patch.kind).toBe('patch');
    expect(JSON.stringify(patch).length).toBeLessThan(500);
    expect(applyRoomUpdate(before, patch)).toEqual(after);
    const revealed = structuredClone(after); revealed.version++;
    revealed.game.logs[0].message = 'Private purchase now revealed';
    expect(applyRoomUpdate(after, makeRoomUpdate(after, revealed))).toEqual(revealed);
  });
  it('rejects wrong viewers, rooms, missing versions and prototype paths', () => {
    const before = fixture(), after = { ...before, version: 5 };
    const patch = makeRoomUpdate(before, after) as RoomPatch;
    expect(applyRoomUpdate({ ...before, viewerId: 'bob' }, patch)).toBeNull();
    expect(applyRoomUpdate({ ...before, id: 'another' }, patch)).toBeNull();
    expect(applyRoomUpdate({ ...before, version: 3 }, patch)).toBeNull();
    expect(applyRoomUpdate(after, patch)).toBeNull();
    expect(applyRoomUpdate(before, { ...patch, operations: [['set', ['__proto__', 'polluted'], true]] })).toBeNull();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
