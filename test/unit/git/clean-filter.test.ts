import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseAttributeFile } from '../../../src/core/git/attributes.js';
import {
  cleanFilterAttribution,
  cleanFilterDrivers,
  CLEAN_FILTER_CAUSE_TEXT,
} from '../../../src/core/git/clean-filter.js';
import { indexEntryUpToDate, isRacy } from '../../../src/core/git/index-stat.js';
import { lfsDigest, matchesLfsPointer, parseLfsPointer } from '../../../src/core/git/lfs.js';
import {
  HashCache,
  hashBlob,
  scanWorkingTree,
  type IndexEntry,
  type ScanInput,
  type WorkingStat,
} from '../../../src/core/git/worktree-compare.js';
import { lookupError } from '../../../src/core/errors/catalogue.js';
import { cleanFilterNotice } from '../../../src/core/intake/change.js';
import type { ChangedFile } from '../../../src/core/git/port.js';
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// C001-T-028: filter attribution, the Git LFS pointer match and the up-to-date rule of
// C001-IF-012 §7 (C001-REQ-126 to C001-REQ-128), and notice ERR-INTAKE-009.

const config = (entries: Record<string, string[]>) => new Map(Object.entries(entries));
const pointerOf = (bytes: Buffer) =>
  Buffer.from(
    `version https://git-lfs.github.com/spec/v1\noid sha256:${createHash('sha256')
      .update(bytes)
      .digest('hex')}\nsize ${bytes.length}\n`,
  );

describe('filter attribution (§7)', () => {
  it('counts a driver with a clean or a process command, the last value winning', () => {
    const drivers = cleanFilterDrivers(
      config({
        'filter.lfs.clean': ['git-lfs clean -- %f'],
        'filter.lfs.smudge': ['git-lfs smudge -- %f'],
        'filter.Crypt.process': ['git-crypt'],
        'filter.audit.smudge': ['cat'],
        'filter.off.clean': ['cat', ''],
        'filter.bare.clean': ['\u0000true'],
        'filter.a.b.clean': ['x'],
      }),
    );
    expect([...drivers].sort()).toEqual(['Crypt', 'a.b', 'lfs']);
  });

  it("takes the driver from the base commit's .gitattributes files only, and only a value", () => {
    const files = [
      parseAttributeFile('', '*.bin filter=lfs -text\nsecrets/*.env filter=crypt\n*.txt filter\n'),
      parseAttributeFile('docs', '*.bin -filter\n'),
    ];
    const attribution = cleanFilterAttribution(
      files,
      config({ 'filter.lfs.process': ['x'], 'filter.crypt.clean': ['y'] }),
    );
    expect(attribution.driverOf('assets/model.bin')).toBe('lfs');
    expect(attribution.driverOf('secrets/app.env')).toBe('crypt');
    expect(attribution.driverOf('docs/a.bin')).toBeNull(); // unset
    expect(attribution.driverOf('notes.txt')).toBeNull(); // set, names no driver
    expect(attribution.driverOf('src/cart.ts')).toBeNull();
  });

  it('puts no file under a filter whose driver the configuration does not set', () => {
    const files = [parseAttributeFile('', 'data/*.csv filter=audit\n')];
    const attribution = cleanFilterAttribution(files, config({ 'filter.audit.smudge': ['cat'] }));
    expect(attribution.empty).toBe(true);
    expect(attribution.driverOf('data/a.csv')).toBeNull();
  });

  it('has the cause texts of errors.md, as the catalogue message lists them', () => {
    const message = lookupError('ERR-INTAKE-009').message;
    for (const text of Object.values(CLEAN_FILTER_CAUSE_TEXT)) expect(message).toContain(text);
  });
});

describe('Git LFS pointer files (§7 item 7)', () => {
  const content = Buffer.from([0, 1, 2, 3, 4, 5]);

  it('parses version 1 with exactly the three lines', () => {
    expect(parseLfsPointer(pointerOf(content))).toEqual({
      oid: createHash('sha256').update(content).digest('hex'),
      size: 6,
    });
  });

  it('refuses extension lines, CRLF, upper-case hashes, other versions and large blobs', () => {
    const p = pointerOf(content).toString('latin1');
    const oid = createHash('sha256').update(content).digest('hex');
    expect(parseLfsPointer(Buffer.from(p.replace('\noid', `\next-0-foo sha256:${oid}\noid`)))).toBe(
      null,
    );
    expect(parseLfsPointer(Buffer.from(p.replace(/\n/g, '\r\n')))).toBeNull();
    expect(parseLfsPointer(Buffer.from(p.replace(oid, oid.toUpperCase())))).toBeNull();
    expect(parseLfsPointer(Buffer.from(p.replace('spec/v1', 'spec/v2')))).toBeNull();
    expect(parseLfsPointer(Buffer.from(p.slice(0, -1)))).toBeNull(); // no final line feed
    expect(parseLfsPointer(Buffer.from(`${p}extra\n`))).toBeNull();
    expect(parseLfsPointer(Buffer.alloc(1024, 0x61))).toBeNull();
    expect(parseLfsPointer(null)).toBeNull();
  });

  it('matches bytes by SHA-256 hash and size, as they are', () => {
    const digest = lfsDigest(content);
    expect(matchesLfsPointer(digest, pointerOf(content))).toBe(true);
    expect(matchesLfsPointer(digest, pointerOf(Buffer.from([0, 1, 2])))).toBe(false);
    expect(matchesLfsPointer(digest, content)).toBe(false); // not a pointer file
  });
});

describe('up to date in the index (§7 item 1)', () => {
  const NS = 1_000_000_000n;
  const entry = (over: Partial<IndexEntry['stat']> = {}): IndexEntry => ({
    path: 'secrets/app.env',
    mode: 'regular',
    blob: 'e'.repeat(40),
    stage: 0,
    assumeUnchanged: false,
    skipWorktree: false,
    intentToAdd: false,
    stat: {
      ctimeSeconds: 100,
      ctimeNanoseconds: 0,
      mtimeSeconds: 100,
      mtimeNanoseconds: 0,
      dev: 0,
      inode: 7,
      uid: 1,
      gid: 1,
      size: 12,
      ...over,
    },
  });
  const stat = (over: Partial<WorkingStat> = {}): WorkingStat => ({
    kind: 'file',
    mode: 0o100644,
    size: 12n,
    mtimeNs: 100n * NS,
    ctimeNs: 100n * NS,
    ino: 7n,
    uid: 1n,
    gid: 1n,
    ...over,
  });
  const options = { fileMode: true, symlinks: true, indexMtimeNs: 200n * NS };

  it('compares the change time whatever core.trustctime would say', () => {
    expect(indexEntryUpToDate(entry(), stat({ ctimeNs: 160n * NS }), options)).toBe(false);
  });

  it('counts an entry recorded in the second of the index file as racy', () => {
    expect(isRacy(entry({ mtimeSeconds: 200 }), 200n * NS + 999_999n)).toBe(true);
    expect(isRacy(entry({ mtimeSeconds: 199 }), 200n * NS)).toBe(false);
    // With a nanosecond part, to the nanosecond.
    expect(isRacy(entry({ mtimeSeconds: 200, mtimeNanoseconds: 5 }), 200n * NS + 6n)).toBe(false);
    expect(isRacy(entry({ mtimeSeconds: 200, mtimeNanoseconds: 6 }), 200n * NS + 6n)).toBe(true);
    expect(
      indexEntryUpToDate(entry({ mtimeSeconds: 200 }), stat({ mtimeNs: 200n * NS }), {
        ...options,
        indexMtimeNs: 200n * NS + 5n,
      }),
    ).toBe(false);
  });
});

// ---- The comparison of §7 on a scratch working tree ---------------------------------------------

describe('scanWorkingTree with files under a clean filter (§7)', () => {
  const work = () => mkdtempSync(join(tmpdir(), 'sddcf-'));
  const blobs = new Map<string, Buffer>();
  const store = (bytes: Buffer) => {
    const oid = hashBlob(bytes, 'sha1');
    blobs.set(oid, bytes);
    return oid;
  };

  function input(dir: string, over: Partial<ScanInput>): ScanInput {
    return {
      workTree: dir,
      format: 'sha1',
      baseTree: new Map(),
      index: [],
      untracked: [],
      eolInfo: async () => new Map(),
      settings: { autocrlf: 'false', fileMode: true, symlinks: true },
      readBlob: async (oid) => blobs.get(oid) ?? null,
      cache: new HashCache(),
      reuse: false,
      keepContent: true,
      ...over,
    };
  }

  function entryFor(dir: string, path: string, blob: string): IndexEntry {
    const st = statSync(join(dir, path), { bigint: true });
    const windows = process.platform === 'win32';
    return {
      path,
      mode: 'regular',
      blob,
      stage: 0,
      assumeUnchanged: false,
      skipWorktree: false,
      intentToAdd: false,
      stat: {
        ctimeSeconds: Number((windows ? st.birthtimeNs : st.ctimeNs) / 1_000_000_000n),
        ctimeNanoseconds: Number((windows ? st.birthtimeNs : st.ctimeNs) % 1_000_000_000n),
        mtimeSeconds: Number(st.mtimeNs / 1_000_000_000n),
        mtimeNanoseconds: Number(st.mtimeNs % 1_000_000_000n),
        dev: 0,
        inode: windows ? 0 : Number(st.ino & 0xffffffffn),
        uid: windows ? 0 : Number(st.uid),
        gid: windows ? 0 : Number(st.gid),
        size: Number(st.size),
      },
    };
  }

  it('settles a Git LFS file by the base pointer, then the index pointer, else its bytes', async () => {
    const dir = work();
    try {
      mkdirSync(join(dir, 'a'));
      const v1 = Buffer.from([0, 9, 9, 9]);
      const v2 = Buffer.from([0, 8, 8, 8, 8]);
      const basePointer = store(pointerOf(v1));
      const indexPointer = store(pointerOf(v2));
      const baseTree = new Map([
        ['a/one.bin', { path: 'a/one.bin', mode: 'regular' as const, blob: basePointer }],
        ['a/two.bin', { path: 'a/two.bin', mode: 'regular' as const, blob: basePointer }],
        ['a/three.bin', { path: 'a/three.bin', mode: 'regular' as const, blob: basePointer }],
      ]);
      writeFileSync(join(dir, 'a/one.bin'), v1);
      writeFileSync(join(dir, 'a/two.bin'), v2);
      writeFileSync(join(dir, 'a/three.bin'), Buffer.from([0, 7]));
      // Index entries with forged stat data and the base pointer cannot hide the edit of three.
      const index = [
        { ...entryFor(dir, 'a/one.bin', basePointer) },
        { ...entryFor(dir, 'a/two.bin', indexPointer) },
        { ...entryFor(dir, 'a/three.bin', basePointer), assumeUnchanged: true },
      ];
      const entries = await scanWorkingTree(
        input(dir, { baseTree, index, cleanFilter: () => 'lfs' }),
      );
      const by = new Map(entries.map((e) => [e.path, e]));
      expect(by.get('a/one.bin')!.differs).toBe(false);
      expect(by.get('a/two.bin')!.current!.hash).toBe(indexPointer);
      expect(by.get('a/two.bin')!.current!.bytes).toEqual(pointerOf(v2));
      expect(by.get('a/two.bin')!.cleanFilter).toBeUndefined();
      expect(by.get('a/three.bin')!.current!.bytes).toEqual(Buffer.from([0, 7]));
      expect(by.get('a/three.bin')!.cleanFilter).toEqual({
        driver: 'lfs',
        cause: 'no-matching-lfs-pointer',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads another filter from an up-to-date index blob, else reports why not', async () => {
    const dir = work();
    try {
      const encrypted = store(Buffer.from('\0ENC:base'));
      const staged = store(Buffer.from('\0ENC:staged'));
      const names = ['left.env', 'staged.env', 'touched.env', 'racy.env', 'gone.env', 'lost.env'];
      const t = Math.floor(Date.now() / 1000) - 3600;
      for (const name of names) {
        writeFileSync(join(dir, name), `plain ${name}\n`);
        utimesSync(join(dir, name), t, t);
      }
      const baseTree = new Map(
        names.map((n) => [n, { path: n, mode: 'regular' as const, blob: encrypted }]),
      );
      const index = [
        entryFor(dir, 'left.env', encrypted),
        entryFor(dir, 'staged.env', staged),
        entryFor(dir, 'touched.env', encrypted),
        { ...entryFor(dir, 'racy.env', encrypted) },
        entryFor(dir, 'lost.env', 'f'.repeat(40)),
      ];
      utimesSync(join(dir, 'touched.env'), t + 60, t + 60);
      const racyMtime = BigInt(index[3]!.stat.mtimeSeconds) * 1_000_000_000n;
      const entries = await scanWorkingTree(
        input(dir, {
          baseTree,
          index,
          cleanFilter: () => 'crypt',
          indexCheck: {
            fileMode: true,
            symlinks: true,
            indexMtimeNs: BigInt(t + 10) * 1_000_000_000n,
          },
        }),
      );
      const by = new Map(entries.map((e) => [e.path, e]));
      expect(by.get('left.env')!.differs).toBe(false);
      expect(by.get('staged.env')!.current!.hash).toBe(staged);
      expect(by.get('staged.env')!.cleanFilter).toBeUndefined();
      expect(by.get('touched.env')!.cleanFilter?.cause).toBe('not-up-to-date');
      expect(by.get('gone.env')!.cleanFilter?.cause).toBe('no-index-entry');
      expect(by.get('lost.env')!.cleanFilter?.cause).toBe('index-blob-missing');
      // The same entry with the index file written in its second is racy.
      const racy = await scanWorkingTree(
        input(dir, {
          baseTree,
          index,
          cleanFilter: () => 'crypt',
          indexCheck: { fileMode: true, symlinks: true, indexMtimeNs: racyMtime },
        }),
      );
      expect(racy.find((e) => e.path === 'racy.env')!.cleanFilter?.cause).toBe('not-up-to-date');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('notice ERR-INTAKE-009 (§7 item 4)', () => {
  const file = (path: string, over: Partial<ChangedFile> = {}): ChangedFile => ({
    path,
    previousPath: null,
    changeType: 'modified',
    binary: true,
    contentHash: 'a'.repeat(40),
    baseMode: 'regular',
    currentMode: 'regular',
    baseContent: null,
    currentContent: null,
    ...over,
  });

  it('names the count, the drivers and at most 10 files with their causes', () => {
    const files = [
      ...Array.from({ length: 11 }, (_, i) =>
        file(`assets/f${String(i + 1).padStart(2, '0')}.bin`, {
          cleanFilter: { driver: 'lfs', cause: 'no-matching-lfs-pointer' },
        }),
      ),
      file('secrets/app.env', { cleanFilter: { driver: 'crypt', cause: 'not-up-to-date' } }),
      file('src/cart.ts'),
    ];
    const notice = cleanFilterNotice(files)!;
    expect(notice.code).toBe('ERR-INTAKE-009');
    expect(notice.message).toMatch(/^12 files under a clean filter \(crypt, lfs\) are listed/);
    expect(notice.message).toContain(
      '(assets/f01.bin (content matches no Git LFS pointer file), assets/f02.bin',
    );
    expect(notice.message).toContain('assets/f10.bin (content matches no Git LFS pointer file)).');
    expect(notice.message).not.toContain('f11');
    expect(notice.message).not.toContain('secrets/app.env');
    expect(notice.message).not.toMatch(/<[^>]*>/);
  });

  it('is null when no file was compared by its working-tree bytes', () => {
    expect(cleanFilterNotice([file('src/cart.ts')])).toBeNull();
    expect(
      cleanFilterNotice([
        file('assets/new.bin', {
          changeType: 'added',
          cleanFilter: { driver: 'lfs', cause: 'no-matching-lfs-pointer' },
        }),
      ]),
    ).toBeNull();
  });
});
