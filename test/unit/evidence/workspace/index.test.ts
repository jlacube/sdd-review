import { describe, expect, it } from 'vitest';
import {
  SortedPaths,
  compareOptionsFor,
  compareStat,
  expandTouched,
  normaliseRelative,
  type IndexRecord,
  type ObservedEntry,
} from '../../../../src/core/evidence/workspace/index.js';

// C001-T-015, C001-ADR-006 §2 "Reset and check": the touched-path comparison of recorded index
// entries, without a file system.

const SECOND = 1_000_000_000n;
const rec = (r: Partial<IndexRecord> = {}): IndexRecord => ({
  kind: 'file',
  size: 10n,
  mtimeNs: 100n * SECOND,
  ctimeNs: 100n * SECOND,
  ino: 7n,
  executable: false,
  sha256: 'h',
  recordedAtNs: 200n * SECOND,
  ...r,
});
const obs = (o: Partial<ObservedEntry> = {}): ObservedEntry => ({
  kind: 'file',
  size: 10n,
  mtimeNs: 100n * SECOND,
  ctimeNs: 100n * SECOND,
  ino: 7n,
  executable: false,
  ...o,
});
const posix = compareOptionsFor('linux');
const windows = compareOptionsFor('win32');

describe('stat comparison of a recorded entry', () => {
  it('equal stat data settle "same" without reading the file', () => {
    expect(compareStat(rec(), obs(), posix)).toBe('same');
  });
  it('another size is a content change without hashing', () => {
    expect(compareStat(rec(), obs({ size: 11n }), posix)).toBe('content');
  });
  it('another modification time, file ID or change time needs the hash', () => {
    expect(compareStat(rec(), obs({ mtimeNs: 101n * SECOND }), posix)).toBe('hash');
    expect(compareStat(rec(), obs({ ino: 8n }), posix)).toBe('hash');
    expect(compareStat(rec(), obs({ ctimeNs: 101n * SECOND }), posix)).toBe('hash');
  });
  it('the change time is compared on Windows too (NTFS ChangeTime)', () => {
    expect(compareStat(rec(), obs({ ctimeNs: 101n * SECOND }), windows)).toBe('hash');
  });
  it('a changed executable bit is a mode change on POSIX only', () => {
    expect(compareStat(rec(), obs({ executable: true }), posix)).toBe('mode');
    expect(compareStat(rec(), obs({ executable: true }), windows)).toBe('same');
  });
  it('another kind (file replaced by a link or a directory) is a change', () => {
    expect(compareStat(rec(), obs({ kind: 'symlink' }), posix)).toBe('kind');
    expect(compareStat(rec(), obs({ kind: 'dir' }), posix)).toBe('kind');
  });
  it('a modification time close to the record time is racy and always hashed', () => {
    const racy = rec({ mtimeNs: 199n * SECOND });
    expect(compareStat(racy, obs({ mtimeNs: 199n * SECOND }), posix)).toBe('hash');
  });
  it('a directory record compares by kind only', () => {
    const dir = rec({ kind: 'dir', sha256: null });
    expect(compareStat(dir, obs({ kind: 'dir', size: 0n, mtimeNs: 5n }), posix)).toBe('same');
  });
});

describe('touched paths', () => {
  const indexed = new SortedPaths(['src/a.ts', 'src/b/c.ts', 'src2/x.ts', 'README.md']);

  it('lists the indexed paths below a directory, not those of a sibling with the same prefix', () => {
    expect(indexed.below('src')).toEqual(['src/a.ts', 'src/b/c.ts']);
    expect(indexed.below('')).toHaveLength(4);
    expect(indexed.below('none')).toEqual([]);
  });
  it('a touched directory brings every indexed path below it', () => {
    expect([...expandTouched(['src', 'new.txt'], indexed)].sort()).toEqual([
      'new.txt',
      'src',
      'src/a.ts',
      'src/b/c.ts',
    ]);
  });
  it('watcher names are made repository-relative; the root and outside names are dropped', () => {
    expect(normaliseRelative('src\\a.ts')).toBe('src/a.ts');
    expect(normaliseRelative('./src/')).toBe('src');
    expect(normaliseRelative('')).toBeNull();
    expect(normaliseRelative('../x')).toBeNull();
    expect([...expandTouched(['', '..', 'README.md'], indexed)]).toEqual(['README.md']);
  });
});
