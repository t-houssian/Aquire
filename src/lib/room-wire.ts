/** Versioned, viewer-specific updates. This module never sees authoritative
 * private state: the server must redact a room before computing its changes. */
export interface RoomIdentity { id: string; viewerId: string; version: number }
type Path = (string | number)[];
type Operation = ['set', Path, unknown] | ['delete', Path] | ['append', Path, number, unknown[]];
export interface RoomPatch {
  kind: 'patch'; id: string; viewerId: string; baseVersion: number; version: number;
  operations: Operation[];
}
export type RoomUpdate<T extends RoomIdentity> = RoomPatch | { kind: 'snapshot'; room: T };
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function makeRoomUpdate<T extends RoomIdentity>(previous: T | null, current: T): RoomUpdate<T> {
  const next = jsonCopy(current);
  const snapshot: RoomUpdate<T> = { kind: 'snapshot', room: next };
  if (!previous || previous.id !== next.id || previous.viewerId !== next.viewerId || previous.version >= next.version)
    return snapshot;
  const operations: Operation[] = [];
  function diff(before: unknown, after: unknown, path: Path) {
    if (equal(before, after)) return;
    if (Array.isArray(before) && Array.isArray(after)) {
      // The bounded ledger rolls forward. Send only newly appended entries,
      // but replace it if privacy changes at the end reveal earlier entries.
      if (path.join('.') === 'game.logs' && before.length && after.length) {
        const start = before.findIndex((entry) => entry.id === after[0].id);
        const overlap = start < 0 ? 0 : before.length - start;
        if (overlap > 0 && overlap <= after.length && equal(before.slice(start), after.slice(0, overlap))) {
          operations.push(['append', path, start, after.slice(overlap)]);
          return;
        }
      }
      if (before.length === after.length && path.join('.') !== 'game.logs') {
        before.forEach((value, index) => diff(value, after[index], [...path, index]));
        return;
      }
    }
    if (record(before) && record(after)) {
      for (const key of Object.keys(before)) if (!(key in after)) operations.push(['delete', [...path, key]]);
      for (const key of Object.keys(after)) diff(before[key], after[key], [...path, key]);
      return;
    }
    operations.push(['set', path, after]);
  }
  diff(jsonCopy(previous), next, []);
  const patch: RoomPatch = { kind: 'patch', id: next.id, viewerId: next.viewerId,
    baseVersion: previous.version, version: next.version, operations };
  return JSON.stringify(patch).length < JSON.stringify(snapshot).length ? patch : snapshot;
}

/** A missing/out-of-order base is a recovery request, never a guessed state. */
export function applyRoomUpdate<T extends RoomIdentity>(current: T, update: RoomUpdate<T>): T | null {
  if (update.kind === 'snapshot') {
    const next = update.room;
    return next.id === current.id && next.viewerId === current.viewerId && next.version >= current.version ? next : null;
  }
  if (update.kind !== 'patch' || update.id !== current.id || update.viewerId !== current.viewerId ||
      update.baseVersion !== current.version || update.version <= current.version || !Array.isArray(update.operations)) return null;
  const next = jsonCopy(current);
  try {
    for (const operation of update.operations) {
      const [type, path] = operation;
      if (!Array.isArray(path) || !path.length || path.some((key) =>
        typeof key !== 'string' && typeof key !== 'number' || ['__proto__', 'prototype', 'constructor'].includes(String(key)))) return null;
      let parent: unknown = next;
      for (const key of path.slice(0, -1)) {
        if (parent === null || typeof parent !== 'object' || !Object.hasOwn(parent, key)) return null;
        parent = (parent as Record<string | number, unknown>)[key];
      }
      if (parent === null || typeof parent !== 'object') return null;
      const target = parent as Record<string | number, unknown>, key = path[path.length - 1];
      if (type === 'set') target[key] = jsonCopy(operation[2]);
      else if (type === 'delete') delete target[key];
      else if (type === 'append' && path.join('.') === 'game.logs' && Array.isArray(target[key]) &&
        Number.isInteger(operation[2]) && operation[2] >= 0 && operation[2] <= target[key].length && Array.isArray(operation[3]))
        target[key] = [...target[key].slice(operation[2]), ...jsonCopy(operation[3])];
      else return null;
    }
    return next.id === current.id && next.viewerId === current.viewerId && next.version === update.version ? next : null;
  } catch { return null; }
}
