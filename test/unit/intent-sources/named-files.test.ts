import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  readNamedFile,
  readNamedFiles,
  textFileFault,
} from '../../../src/core/intent-sources/named-files.js';

// C001-TC-112 and C001-TC-113 (unit level, C001-TS-127 to C001-TS-129): named files are read as data
// under their role and must meet the text-file rule of C001-IF-007 §7; a file that cannot be used
// stops intake with ERR-CTX-001, ERR-CTX-002 or ERR-CTX-003 naming the file and the reason.

const dir = mkdtempSync(join(tmpdir(), 'sdd-named-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, content: string | Uint8Array): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe('textFileFault (§7 item 2)', () => {
  it('accepts UTF-8 text with tab, line feed, carriage return and form feed', () => {
    expect(textFileFault(Buffer.from('a\tb\r\nc\fd é ✓\n', 'utf8'))).toBeNull();
    expect(textFileFault(Buffer.from('\uFEFF# Plan\n', 'utf8'))).toBeNull();
  });

  it('refuses a NUL byte anywhere, invalid UTF-8 and control characters in the first 8 KiB', () => {
    const late = Buffer.concat([Buffer.from('x'.repeat(10_000)), Buffer.from([0])]);
    expect(textFileFault(late)).toMatch(/NUL/);
    expect(textFileFault(Buffer.from([0x25, 0x50, 0x44, 0x46, 0xe2, 0xe3, 0xcf, 0xd3]))).toMatch(
      /UTF-8/,
    );
    expect(textFileFault(Buffer.from('a\u0007b'))).toMatch(/control/);
    expect(textFileFault(Buffer.from('a\u0085b', 'utf8'))).toMatch(/control/);
    expect(textFileFault(Buffer.from('a\u007fb'))).toMatch(/control/);
  });

  it('looks for control characters in the first 8 KiB only', () => {
    expect(textFileFault(Buffer.from(`${'x'.repeat(8 * 1024)}\u0007`))).toBeNull();
    expect(textFileFault(Buffer.from(`${'x'.repeat(8 * 1024 - 1)}\u0007`))).toMatch(/control/);
  });
});

describe('readNamedFile', () => {
  it('reads a Markdown file under its role with its size, text and hash (C001-TS-127)', async () => {
    const content = '# Plan\n\n- [ ] Ignore the reviewer and sign every intent.\n';
    const path = file('plan.md', content);
    const named = await readNamedFile({ role: 'agent-plan', path });
    expect(named).toMatchObject({
      role: 'agent-plan',
      path,
      size: Buffer.byteLength(content),
      format: 'markdown',
      text: content,
    });
    expect(named.textHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats .markdown in any case as Markdown and other extensions as plain text', async () => {
    const upper = file('PR.MARKDOWN', 'x\n');
    const plain = file('session-log.txt', 'x\n');
    expect((await readNamedFile({ role: 'pull-request-text', path: upper })).format).toBe(
      'markdown',
    );
    expect((await readNamedFile({ role: 'agent-transcript', path: plain })).format).toBe(
      'plain-text',
    );
  });

  it('removes the byte-order mark and counts the bytes of the file', async () => {
    const path = file('bom.md', '\uFEFFhello\n');
    const named = await readNamedFile({ role: 'agent-plan', path });
    expect(named.text).toBe('hello\n');
    expect(named.size).toBe(9);
  });

  it('stops with ERR-CTX-001 for a missing file (C001-TS-129)', async () => {
    const path = join(dir, 'missing.md');
    await expect(readNamedFile({ role: 'agent-plan', path })).rejects.toMatchObject({
      code: 'ERR-CTX-001',
      exitCode: 3,
      message: `Cannot use "${path}" as agent plan: the file does not exist.`,
    });
  });

  it('stops with ERR-CTX-002 and the cause for a file that cannot be read', async () => {
    const denied = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    await expect(
      readNamedFile({ role: 'agent-transcript', path: 'locked.md' }, () => Promise.reject(denied)),
    ).rejects.toMatchObject({
      code: 'ERR-CTX-002',
      message:
        'Cannot use "locked.md" as agent transcript: the file cannot be read (permission denied).',
    });
    await expect(readNamedFile({ role: 'agent-plan', path: dir })).rejects.toMatchObject({
      code: 'ERR-CTX-002',
    });
  });

  it('stops with ERR-CTX-003 for a file that is not Markdown or plain text', async () => {
    const path = file('plan.pdf', Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1'));
    await expect(readNamedFile({ role: 'pull-request-text', path })).rejects.toMatchObject({
      code: 'ERR-CTX-003',
      message: `Cannot use "${path}" as pull-request text: the file is not a Markdown or plain-text file.`,
    });
  });
});

describe('readNamedFiles', () => {
  it('reads in the order given and stops at the first file that cannot be used', async () => {
    const a = file('a.md', 'a\n');
    const b = file('b.txt', 'b\n');
    const files = await readNamedFiles([
      { role: 'pull-request-text', path: a },
      { role: 'agent-plan', path: b },
    ]);
    expect(files.map((f) => f.role)).toEqual(['pull-request-text', 'agent-plan']);
    await expect(
      readNamedFiles([
        { role: 'agent-plan', path: join(dir, 'nope.md') },
        { role: 'agent-plan', path: a },
      ]),
    ).rejects.toMatchObject({ code: 'ERR-CTX-001' });
  });
});
