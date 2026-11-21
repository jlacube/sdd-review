import { describe, expect, it } from 'vitest';
import {
  replaceInWindow,
  rewriteRandomAccess,
  rootVariants,
  type RandomAccess,
} from '../../../../src/core/evidence/workspace/mutation-copy.js';

// C001-T-016, C001-ADR-006 §7 item 2: the root rewrite of the mutation copy on byte buffers, in
// UTF-8 and (Windows) UTF-16LE with both separators; the two roots have equal byte length, so
// binary files keep their offsets.

const POSIX_SRC = '/home/u/.cache/sdd-review/0123456789abcdef/0123456789ab/w07';
const POSIX_DST = '/home/u/.cache/sdd-review/0123456789abcdef/0123456789ab/m07';
const WIN_SRC = 'C:\\Users\\u\\AppData\\Local\\sddr\\0123456789abcdef\\0123456789ab\\w07';
const WIN_DST = 'C:\\Users\\u\\AppData\\Local\\sddr\\0123456789abcdef\\0123456789ab\\m07';

function memory(bytes: Buffer): RandomAccess & { bytes: Buffer; writes: number } {
  const m = {
    bytes: Buffer.from(bytes),
    writes: 0,
    size: bytes.length,
    async read(position: number, length: number) {
      return Buffer.from(m.bytes.subarray(position, position + length));
    },
    async write(position: number, data: Buffer) {
      m.writes++;
      data.copy(m.bytes, position);
    },
  };
  return m;
}

describe('rootVariants', () => {
  it('gives the UTF-8 root on macOS and Linux', () => {
    const v = rootVariants(POSIX_SRC, POSIX_DST, 'linux');
    expect(v.map((p) => p.from.toString('utf8'))).toEqual([POSIX_SRC]);
    expect(v[0]!.to.toString('utf8')).toBe(POSIX_DST);
  });

  it('gives both separators, the JSON-escaped form, both drive-letter cases and UTF-16LE on Windows', () => {
    const v = rootVariants(WIN_SRC, WIN_DST, 'win32');
    const utf8 = v.filter((p) => p.encoding === 'utf8').map((p) => p.from.toString('utf8'));
    expect(utf8).toContain(WIN_SRC);
    expect(utf8).toContain(WIN_SRC.replace(/\\/g, '/'));
    expect(utf8).toContain(WIN_SRC.replace(/\\/g, '\\\\'));
    expect(utf8).toContain(`c${WIN_SRC.slice(1)}`);
    const utf16 = v.filter((p) => p.encoding === 'utf16le').map((p) => p.from.toString('utf16le'));
    expect(utf16).toContain(WIN_SRC);
    expect(utf16).toContain(WIN_SRC.replace(/\\/g, '/'));
    for (const p of v) expect(p.to.length).toBe(p.from.length);
  });

  it('refuses roots of different byte length', () => {
    expect(() => rootVariants('/a/w00', '/a/mm00', 'linux')).toThrow(/byte length/);
    expect(() => rootVariants('/a/w00', '/a/w00', 'linux')).toThrow(/differ/);
  });
});

describe('replaceInWindow', () => {
  it('replaces every occurrence in place and keeps the length and offsets of a binary file', () => {
    const pairs = rootVariants(POSIX_SRC, POSIX_DST, 'linux');
    const head = Buffer.from([0, 1, 2, 255]);
    const buf = Buffer.concat([
      head,
      Buffer.from(`${POSIX_SRC}/lib/python3.12\0`),
      Buffer.from([7, 7]),
      Buffer.from(`#!${POSIX_SRC}/.venv/bin/python\n`),
    ]);
    const before = buf.length;
    const n = replaceInWindow(buf, pairs, buf.length);
    expect(n).toBe(2);
    expect(buf.length).toBe(before);
    expect(buf.subarray(0, 4)).toEqual(head);
    expect(buf.includes(Buffer.from(POSIX_SRC))).toBe(false);
    expect(buf.indexOf(Buffer.from(POSIX_DST))).toBe(4);
  });

  it('replaces UTF-16LE and forward-slash forms on Windows', () => {
    const pairs = rootVariants(WIN_SRC, WIN_DST, 'win32');
    const buf = Buffer.concat([
      Buffer.from(`${WIN_SRC}\\obj\\x.dll`, 'utf16le'),
      Buffer.from(` "${WIN_SRC.replace(/\\/g, '/')}/bin" `),
      Buffer.from(JSON.stringify({ p: `${WIN_SRC}\\out` })),
      Buffer.from(`c${WIN_SRC.slice(1)}`),
    ]);
    expect(replaceInWindow(buf, pairs, buf.length)).toBe(4);
    for (const p of pairs) expect(buf.includes(p.from), p.from.toString('latin1')).toBe(false);
  });

  it('only takes matches that start before the limit', () => {
    const pairs = rootVariants(POSIX_SRC, POSIX_DST, 'linux');
    const buf = Buffer.from(`xx${POSIX_SRC}`);
    expect(replaceInWindow(buf, pairs, 2)).toBe(0);
    expect(replaceInWindow(buf, pairs, 3)).toBe(1);
  });

  it('leaves text without the root unchanged', () => {
    const pairs = rootVariants(POSIX_SRC, POSIX_DST, 'linux');
    const buf = Buffer.from('/home/u/.cache/sdd-review/0123456789abcdef/0123456789ab/w08/x');
    expect(replaceInWindow(buf, pairs, buf.length)).toBe(0);
  });
});

describe('rewriteRandomAccess', () => {
  it('finds occurrences across chunk boundaries and writes only where they are', async () => {
    const pairs = rootVariants(POSIX_SRC, POSIX_DST, 'linux');
    const parts: Buffer[] = [];
    for (let i = 0; i < 20; i++) parts.push(Buffer.from(`${'z'.repeat(i * 3)}${POSIX_SRC}`));
    const file = memory(Buffer.concat(parts));
    const n = await rewriteRandomAccess(file, pairs, 7);
    expect(n).toBe(20);
    expect(file.writes).toBe(20);
    expect(file.bytes.includes(Buffer.from(POSIX_SRC))).toBe(false);
    expect(file.bytes.length).toBe(file.size);
  });

  it('writes nothing to a file without the root', async () => {
    const file = memory(Buffer.alloc(1000, 0x61));
    expect(await rewriteRandomAccess(file, rootVariants(POSIX_SRC, POSIX_DST, 'linux'), 64)).toBe(
      0,
    );
    expect(file.writes).toBe(0);
  });
});
