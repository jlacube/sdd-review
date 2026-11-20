import { describe, expect, it } from 'vitest';
import {
  lookupAttribute,
  parseAttributeFile,
  wildmatchToRegex,
} from '../../../src/core/git/attributes.js';
import { matchLines, splitLines } from '../../../src/core/git/line-diff.js';
import {
  mapRefspec,
  submoduleNameOf,
  isSafeSubmoduleName,
} from '../../../src/core/git/operations.js';
import { detectRenames, type RenameSide } from '../../../src/core/git/renames.js';
import {
  HashCache,
  configBool,
  convertEol,
  hashBlob,
  indexEntryUpToDate,
  parseConfigList,
  parseIndexListing,
  parseTreeListing,
  type IndexEntry,
  type WorkingStat,
} from '../../../src/core/git/worktree-compare.js';

// Pure parts of the git adapter of C001-T-006: no git process runs here.

describe('line matching (G-09)', () => {
  const lines = (s: string) => splitLines(Buffer.from(s));
  it('matches unchanged lines and leaves added lines unmatched', () => {
    const m = matchLines(lines('a\nb\nc\n'), lines('a\nx\nb\nc\ny\n'));
    expect([...m]).toEqual([0, -1, 1, 2, -1]);
  });
  it('keeps a final line without a line feed distinct from one with it', () => {
    expect([...matchLines(lines('a\nb'), lines('a\nb\n'))]).toEqual([0, -1]);
  });
  it('handles empty sides and complete replacement', () => {
    expect([...matchLines([], lines('a\n'))]).toEqual([-1]);
    expect([...matchLines(lines('a\n'), [])]).toEqual([]);
    expect([...matchLines(lines('a\nb\n'), lines('c\nd\n'))]).toEqual([-1, -1]);
  });
  it('matches in order on a shuffled interleaving', () => {
    const a = lines('1\n2\n3\n4\n5\n6\n7\n8\n');
    const b = lines('1\nx\n3\n4\ny\n6\n8\n7\n');
    const m = matchLines(a, b);
    let previous = -1;
    for (const from of m) {
      if (from >= 0) {
        expect(from).toBeGreaterThan(previous);
        previous = from;
      }
    }
    expect([...m].filter((x) => x >= 0).length).toBeGreaterThanOrEqual(5);
  });
});

describe('.gitattributes matching (G-11)', () => {
  const file = (dir: string, text: string) => parseAttributeFile(dir, text);
  it('matches basenames at any depth, anchored patterns and directories', () => {
    const files = [
      file('', '*.gen linguist-generated\n/top.txt text\nsrc/*.ts filter=x\ndocs/** -diff\n'),
    ];
    expect(lookupAttribute(files, 'a/b/c.gen', 'linguist-generated')).toBe('set');
    expect(lookupAttribute(files, 'top.txt', 'text')).toBe('set');
    expect(lookupAttribute(files, 'sub/top.txt', 'text')).toBeNull();
    expect(lookupAttribute(files, 'src/a.ts', 'filter')).toBe('x');
    expect(lookupAttribute(files, 'src/deep/a.ts', 'filter')).toBeNull();
    expect(lookupAttribute(files, 'docs/a/b.md', 'diff')).toBe('unset');
  });
  it('lets a deeper file and a later line win, and `!` reset', () => {
    const files = [
      file('', '*.gen linguist-generated\n'),
      file('lib', '*.gen -linguist-generated\n'),
      file('lib/x', '*.gen linguist-generated=false\n'),
    ];
    expect(lookupAttribute(files, 'a.gen', 'linguist-generated')).toBe('set');
    expect(lookupAttribute(files, 'lib/a.gen', 'linguist-generated')).toBe('unset');
    expect(lookupAttribute(files, 'lib/x/a.gen', 'linguist-generated')).toBe('false');
    const reset = [file('', '*.gen linguist-generated\n*.gen !linguist-generated\n')];
    expect(lookupAttribute(reset, 'a.gen', 'linguist-generated')).toBeNull();
  });
  it('applies the binary macro and user macros of the top-level file', () => {
    const files = [file('', '[attr]mine filter=secret -diff\n*.bin binary\n*.key mine\n')];
    expect(lookupAttribute(files, 'a.bin', 'text')).toBe('unset');
    expect(lookupAttribute(files, 'a.key', 'filter')).toBe('secret');
    expect(lookupAttribute(files, 'a.key', 'diff')).toBe('unset');
  });
  it('ignores comments, blank lines, directory-only patterns and quoted patterns', () => {
    const files = [file('', '# c\n\nbuild/ text\n"with space.txt" text\n')];
    expect(lookupAttribute(files, 'build', 'text')).toBeNull();
    expect(lookupAttribute(files, 'with space.txt', 'text')).toBe('set');
  });
  it('translates wildmatch classes and double stars', () => {
    expect(wildmatchToRegex('a/**/b').test('a/b')).toBe(true);
    expect(wildmatchToRegex('a/**/b').test('a/x/y/b')).toBe(true);
    expect(wildmatchToRegex('*.[ch]').test('x.c')).toBe(true);
    expect(wildmatchToRegex('*.[!ch]').test('x.c')).toBe(false);
    expect(wildmatchToRegex('a?c').test('a/c')).toBe(false);
    expect(wildmatchToRegex('[[:digit:]]x').test('7x')).toBe(true);
    expect(wildmatchToRegex('A.txt', true).test('a.TXT')).toBe(true);
  });
});

describe('rename detection (G-07, 50 % similarity)', () => {
  const side = (path: string, text: string, symlink = false): RenameSide => {
    const content = Buffer.from(text);
    return { path, hash: hashBlob(content, 'sha1'), symlink, size: content.length, content };
  };
  const body = (n: number, tag = '') =>
    Array.from({ length: n }, (_, i) => `line ${i} ${tag}\n`).join('');
  it('pairs identical content, preferring the same file name', () => {
    const pairs = detectRenames(
      [side('a/x.ts', body(5)), side('b/y.ts', body(5))],
      [side('c/y.ts', body(5))],
    );
    expect(pairs).toEqual([['b/y.ts', 'c/y.ts']]);
  });
  it('pairs files that share at least half of their bytes and not fewer', () => {
    const half = detectRenames(
      [side('old.ts', body(10, '_'))],
      [side('new.ts', body(5, '_') + body(5, '-'))],
    );
    expect(half).toEqual([['old.ts', 'new.ts']]);
    const less = detectRenames(
      [side('old.ts', body(10, '_'))],
      [side('new.ts', body(4, '_') + body(6, '-'))],
    );
    expect(less).toEqual([]);
  });
  it('never pairs empty files or a symbolic link with a file', () => {
    expect(detectRenames([side('a', '')], [side('b', '')])).toEqual([]);
    expect(detectRenames([side('a', 'target')], [side('b', 'target', true)])).toEqual([]);
  });
});

describe('end-of-line conversion (C001-IF-012 §2 item 2)', () => {
  const crlf = Buffer.from('a\r\nb\r\n');
  const lf = Buffer.from('a\nb\n');
  const off = { autocrlf: 'false' } as const;
  it('leaves bytes alone when nothing asks for a conversion', () => {
    expect(convertEol(crlf, '', false, off)).toEqual(crlf);
    expect(convertEol(crlf, '-text', false, { autocrlf: 'true' })).toEqual(crlf);
  });
  it('converts for the text attribute, text=auto and core.autocrlf', () => {
    expect(convertEol(crlf, 'text', false, off)).toEqual(lf);
    expect(convertEol(crlf, 'text eol=crlf', false, off)).toEqual(lf);
    expect(convertEol(crlf, 'text=auto', false, off)).toEqual(lf);
    expect(convertEol(crlf, '', false, { autocrlf: 'true' })).toEqual(lf);
    expect(convertEol(crlf, '', false, { autocrlf: 'input' })).toEqual(lf);
  });
  it('does not convert binary-looking content in auto mode, nor when the index holds CRLF', () => {
    const binary = Buffer.from('a\r\n\0b\r\n');
    expect(convertEol(binary, 'text=auto', false, off)).toEqual(binary);
    expect(convertEol(crlf, 'text=auto', true, off)).toEqual(crlf);
    // an explicit text attribute converts whatever the content
    expect(convertEol(binary, 'text', false, off)).toEqual(Buffer.from('a\n\0b\n'));
  });
  it('keeps a lone CR', () => {
    expect(convertEol(Buffer.from('a\rb\r\n'), 'text', false, off)).toEqual(Buffer.from('a\rb\n'));
  });
});

describe('listing parsers', () => {
  it('parses ls-tree -z output with every mode', () => {
    const out = Buffer.from(
      [
        '100644 blob aaaa\ta b.txt',
        '100755 blob bbbb\tx.sh',
        '120000 blob cccc\tl',
        '160000 commit dddd\tsub',
        '',
      ].join('\0'),
    );
    expect(parseTreeListing(out).map((e) => [e.path, e.mode, e.blob])).toEqual([
      ['a b.txt', 'regular', 'aaaa'],
      ['x.sh', 'executable', 'bbbb'],
      ['l', 'symlink', 'cccc'],
      ['sub', 'submodule', 'dddd'],
    ]);
  });
  it('parses ls-files --debug with flags of assume-unchanged, skip-worktree and intent-to-add', () => {
    const entry = (name: string, flags: string, stage = 0) =>
      `100644 ${'a'.repeat(40)} ${stage}\t${name}\0  ctime: 10:20\n  mtime: 30:40\n  dev: 1\tino: 2\n  uid: 3\tgid: 4\n  size: 5\tflags: ${flags}\n`;
    const out = Buffer.from(
      entry('a', '8000') + entry('b', '40004000') + entry('c', '20004000') + entry('d', '1000', 2),
    );
    const [a, b, c, d] = parseIndexListing(out);
    expect([a!.assumeUnchanged, a!.skipWorktree, a!.intentToAdd]).toEqual([true, false, false]);
    expect([b!.assumeUnchanged, b!.skipWorktree, b!.intentToAdd]).toEqual([false, true, false]);
    expect([c!.assumeUnchanged, c!.skipWorktree, c!.intentToAdd]).toEqual([false, false, true]);
    expect(d!.stage).toBe(2);
    expect(a!.stat).toEqual({
      ctimeSeconds: 10,
      ctimeNanoseconds: 20,
      mtimeSeconds: 30,
      mtimeNanoseconds: 40,
      dev: 1,
      inode: 2,
      uid: 3,
      gid: 4,
      size: 5,
    });
  });
  it('rejects a listing it cannot read instead of dropping entries', () => {
    expect(() => parseIndexListing(Buffer.from('100644 abc 0\tname\0garbage'))).toThrow(
      /cannot read/,
    );
  });
  it('reads config lists and booleans', () => {
    const cfg = parseConfigList(
      Buffer.from('core.autocrlf\ntrue\0core.filemode\nfalse\0core.bare\0user.name\nA B\0'),
    );
    expect(configBool(cfg.get('core.autocrlf'), false)).toBe(true);
    expect(configBool(cfg.get('core.filemode'), true)).toBe(false);
    expect(configBool(cfg.get('core.bare'), false)).toBe(true);
    expect(configBool(cfg.get('core.missing'), true)).toBe(true);
    expect(cfg.get('user.name')).toEqual(['A B']);
  });
});

describe('index entry up-to-date test (C001-IF-012 §7 item 1)', () => {
  const NS = 1_000_000_000n;
  const entry = (over: Partial<IndexEntry['stat']> = {}, mode: IndexEntry['mode'] = 'regular') =>
    ({
      path: 'f',
      mode,
      blob: 'a'.repeat(40),
      stage: 0,
      assumeUnchanged: false,
      skipWorktree: false,
      intentToAdd: false,
      stat: {
        ctimeSeconds: 100,
        ctimeNanoseconds: 500,
        mtimeSeconds: 100,
        mtimeNanoseconds: 0,
        dev: 0,
        inode: 7,
        uid: 8,
        gid: 9,
        size: 12,
        ...over,
      },
    }) satisfies IndexEntry;
  const stat = (over: Partial<WorkingStat> = {}): WorkingStat => ({
    kind: 'file',
    mode: 0o100644,
    size: 12n,
    mtimeNs: 100n * NS + 999n,
    ctimeNs: 100n * NS + 500n,
    ino: 7n,
    uid: 8n,
    gid: 9n,
    ...over,
  });
  const options = { fileMode: true, symlinks: true, indexMtimeNs: 200n * NS };
  it('is up to date when every compared field is equal; seconds only for a zero nanosecond part', () => {
    expect(indexEntryUpToDate(entry(), stat(), options)).toBe(true);
  });
  it('is not up to date after any field changes, in the executable bit only with core.fileMode', () => {
    expect(indexEntryUpToDate(entry(), stat({ size: 13n }), options)).toBe(false);
    expect(indexEntryUpToDate(entry(), stat({ mtimeNs: 101n * NS }), options)).toBe(false);
    expect(indexEntryUpToDate(entry(), stat({ ctimeNs: 100n * NS + 501n }), options)).toBe(false);
    expect(indexEntryUpToDate(entry(), stat({ ino: 8n }), options)).toBe(false);
    expect(indexEntryUpToDate(entry(), stat({ mode: 0o100755 }), options)).toBe(false);
    expect(
      indexEntryUpToDate(entry(), stat({ mode: 0o100755 }), { ...options, fileMode: false }),
    ).toBe(true);
    expect(indexEntryUpToDate(entry(), stat({ kind: 'symlink' }), options)).toBe(false);
  });
  it('counts a racy entry, a conflict stage, intent-to-add and a missing file as not up to date', () => {
    expect(indexEntryUpToDate(entry(), stat(), { ...options, indexMtimeNs: 100n * NS })).toBe(
      false,
    );
    expect(indexEntryUpToDate({ ...entry(), stage: 2 }, stat(), options)).toBe(false);
    expect(indexEntryUpToDate({ ...entry(), intentToAdd: true }, stat(), options)).toBe(false);
    expect(indexEntryUpToDate(entry(), null, options)).toBe(false);
  });
  it('ignores the assume-unchanged and skip-worktree flags: the stat data decide', () => {
    const flagged = { ...entry(), assumeUnchanged: true, skipWorktree: true };
    expect(indexEntryUpToDate(flagged, stat(), options)).toBe(true);
    expect(indexEntryUpToDate(flagged, stat({ size: 99n }), options)).toBe(false);
  });
});

describe('hash reuse of G-12 (C001-IF-012 §8 item 3, time-stamp rule)', () => {
  const NS = 1_000_000_000n;
  const st = (mtimeS: bigint, ctimeS: bigint): WorkingStat => ({
    kind: 'file',
    mode: 0o100644,
    size: 1n,
    mtimeNs: mtimeS * NS,
    ctimeNs: ctimeS * NS,
    ino: 1n,
    uid: 0n,
    gid: 0n,
  });
  it('keeps a hash only when both times are three seconds or more older than the read', () => {
    const cache = new HashCache();
    const started = 1_000_000;
    const old = BigInt(started / 1000 - 3);
    cache.keep('old', st(old, old), 'h', started);
    expect(cache.get('old', 'x')).toBeUndefined();
    cache.keep('a', st(old, old), 'h1', started);
    cache.keep('b', st(old, old + 1n), 'h2', started);
    cache.keep('c', st(old + 1n, old), 'h3', started);
    const key = (s: WorkingStat) =>
      [s.kind, s.size, s.mtimeNs, s.ctimeNs, s.ino, s.uid, s.gid, 0].join(':');
    expect(cache.get('a', key(st(old, old)))).toBe('h1');
    expect(cache.get('b', key(st(old, old + 1n)))).toBeUndefined();
    expect(cache.get('c', key(st(old + 1n, old)))).toBeUndefined();
  });
  it('drops a kept hash when the file is hashed again too soon, and ignores changed stat data', () => {
    const cache = new HashCache();
    const old = 1_000n;
    cache.keep('a', st(old, old), 'h1', 10_000_000);
    const key = (s: WorkingStat) =>
      [s.kind, s.size, s.mtimeNs, s.ctimeNs, s.ino, s.uid, s.gid, 0].join(':');
    expect(cache.get('a', key(st(old, old)))).toBe('h1');
    expect(cache.get('a', key(st(old, 1_001n)))).toBeUndefined();
    cache.keep('a', st(old, 9_999n), 'h2', 10_000_000);
    expect(cache.get('a', key(st(old, old)))).toBeUndefined();
  });
});

describe('small helpers of the adapter', () => {
  it('maps a merge ref through a fetch refspec', () => {
    expect(mapRefspec('+refs/heads/*:refs/remotes/origin/*', 'refs/heads/dev')).toBe(
      'refs/remotes/origin/dev',
    );
    expect(mapRefspec('+refs/heads/main:refs/remotes/o/m', 'refs/heads/main')).toBe(
      'refs/remotes/o/m',
    );
    expect(mapRefspec('+refs/heads/main:refs/remotes/o/m', 'refs/heads/dev')).toBeNull();
    expect(mapRefspec('+refs/tags/*:refs/tags/*', 'refs/heads/dev')).toBeNull();
  });
  it('finds the submodule name of a path and refuses names with a ".." component', () => {
    const text =
      '[submodule "lib/a"]\n\tpath = libs/a\n\turl = x\n[submodule "b"]\n\tpath = "b dir" ; c\n';
    expect(submoduleNameOf(text, 'libs/a')).toBe('lib/a');
    expect(submoduleNameOf(text, 'b dir')).toBe('b');
    expect(submoduleNameOf(text, 'none')).toBeNull();
    expect(isSafeSubmoduleName('a/b')).toBe(true);
    expect(isSafeSubmoduleName('../x')).toBe(false);
    expect(isSafeSubmoduleName('a/../x')).toBe(false);
    expect(isSafeSubmoduleName('a\\..\\x')).toBe(false);
    expect(isSafeSubmoduleName('')).toBe(false);
  });
});
