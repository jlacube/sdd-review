import { describe, expect, it } from 'vitest';
import {
  canTransition,
  isOwnerAlive,
  parseOwner,
  workspaceKeys,
  workspaceNames,
  hasRoomFor,
  type OwnerRecord,
} from '../../../../src/core/evidence/workspace/lifetime.js';

// C001-T-015, C001-ADR-006 §1: layout names, owner-file state transitions, owner liveness and the
// disk-space rule, without a file system.

describe('layout', () => {
  it('keys: 16 hex of the repository key, 12 hex of the snapshot ID', () => {
    const k = workspaceKeys('ab'.repeat(32), `s-${'0123456789'.repeat(6)}abcd`);
    expect(k).toEqual({ repository: 'abababababababab', snapshot: '012345678901' });
  });
  it('refuses keys that are not what the store gives', () => {
    expect(() => workspaceKeys('xyz', `s-${'0'.repeat(64)}`)).toThrow();
    expect(() => workspaceKeys('a'.repeat(64), '../escape')).toThrow();
  });
  it('a run workspace and its mutation copy have names of equal length', () => {
    const w = workspaceNames('run', 7);
    const m = workspaceNames('mutation', 7);
    expect(w).toEqual({ name: 'w07', aux: 'w07.aux', owner: 'w07.owner' });
    expect(m.name).toBe('m07');
    expect(m.name.length).toBe(w.name.length);
    expect(() => workspaceNames('run', 100)).toThrow();
  });
});

describe('owner-file states', () => {
  it('a run workspace goes preparing → free → in run → free, and into the copy window', () => {
    expect(canTransition('run', 'preparing', 'free')).toBe(true);
    expect(canTransition('run', 'free', 'in-run')).toBe(true);
    expect(canTransition('run', 'in-run', 'free')).toBe(true);
    expect(canTransition('run', 'in-run', 'copying')).toBe(true);
    expect(canTransition('run', 'free', 'copying')).toBe(true);
    expect(canTransition('run', 'copying', 'free')).toBe(true);
  });
  it('refuses a second run in a workspace that is in a run or in the copy window', () => {
    expect(canTransition('run', 'in-run', 'in-run')).toBe(false);
    expect(canTransition('run', 'copying', 'in-run')).toBe(false);
    expect(canTransition('run', 'preparing', 'in-run')).toBe(false);
  });
  it('a mutation copy goes preparing → mutation and is never reset for a run', () => {
    expect(canTransition('mutation', 'preparing', 'mutation')).toBe(true);
    expect(canTransition('mutation', 'mutation', 'free')).toBe(false);
    expect(canTransition('mutation', 'mutation', 'in-run')).toBe(false);
    expect(canTransition('run', 'preparing', 'mutation')).toBe(false);
  });
});

describe('owner liveness', () => {
  const self = { pid: 100, startedAt: '2026-11-21T10:00:00.000Z' };
  const owner = (o: Partial<OwnerRecord>): OwnerRecord => ({
    formatVersion: 1,
    pid: 200,
    startedAt: '2026-11-21T09:00:00.000Z',
    kind: 'run',
    state: 'free',
    updatedAt: '2026-11-21T09:00:00.000Z',
    ...o,
  });
  const probe = (alive: Set<number>) => (pid: number) => alive.has(pid);

  it('another process is alive while the operating system knows its process ID', () => {
    expect(isOwnerAlive(owner({}), self, probe(new Set([200])))).toBe(true);
    expect(isOwnerAlive(owner({}), self, probe(new Set()))).toBe(false);
  });
  it('this process owns a workspace only with its own start time (a reused ID is dead)', () => {
    expect(
      isOwnerAlive(owner({ pid: 100, startedAt: self.startedAt }), self, probe(new Set([100]))),
    ).toBe(true);
    expect(isOwnerAlive(owner({ pid: 100 }), self, probe(new Set([100])))).toBe(false);
  });
  it('parses owner files and rejects anything else', () => {
    const text = JSON.stringify(owner({}));
    expect(parseOwner(text)).toEqual(owner({}));
    expect(parseOwner('')).toBeNull();
    expect(parseOwner('{"formatVersion":1}')).toBeNull();
    expect(parseOwner(JSON.stringify({ ...owner({}), state: 'odd' }))).toBeNull();
  });
});

describe('disk space', () => {
  it('needs the expected size and 20 % margin', () => {
    expect(hasRoomFor(1000, 1200n)).toBe(true);
    expect(hasRoomFor(1000, 1199n)).toBe(false);
    expect(hasRoomFor(0, 0n)).toBe(true);
  });
});
