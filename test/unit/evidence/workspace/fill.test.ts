import { describe, expect, it } from 'vitest';
import {
  AttributeSet,
  crlfAction,
  snapshotEntries,
  toWorkingTree,
  type CheckoutSettings,
  type EolAttributes,
} from '../../../../src/core/evidence/workspace/fill.js';
import type { TreeEntry } from '../../../../src/core/git/port.js';

// C001-T-015, C001-ADR-006 §2 "Fill": git's built-in checkout end-of-line conversion
// (convert.c of git 2.45: convert_attrs, output_eol, will_convert_lf_to_crlf) and the file list of
// a workspace, without git and without a file system.

const none: EolAttributes = { text: null, crlf: null, eol: null };
const settings = (s: Partial<CheckoutSettings> = {}): CheckoutSettings => ({
  autocrlf: 'false',
  eol: null,
  nativeEol: 'lf',
  ...s,
});
const conv = (text: string, attrs: Partial<EolAttributes>, s: Partial<CheckoutSettings> = {}) =>
  toWorkingTree(Buffer.from(text, 'latin1'), { ...none, ...attrs }, settings(s)).toString('latin1');

describe('checkout end-of-line conversion', () => {
  it('leaves content unchanged without attributes and with core.autocrlf=false', () => {
    expect(conv('a\nb\n', {})).toBe('a\nb\n');
    expect(crlfAction(none, settings())).toBe('binary');
  });
  it('core.autocrlf=true converts text files without CR to CRLF', () => {
    expect(conv('a\nb\n', {}, { autocrlf: 'true' })).toBe('a\r\nb\r\n');
    expect(conv('\nx', {}, { autocrlf: 'true' })).toBe('\r\nx');
  });
  it('core.autocrlf=true leaves binary content and content with CR untouched', () => {
    expect(conv('a\0\nb\n', {}, { autocrlf: 'true' })).toBe('a\0\nb\n');
    expect(conv('a\r\nb\n', {}, { autocrlf: 'true' })).toBe('a\r\nb\n');
    expect(conv('a\rb\n', {}, { autocrlf: 'true' })).toBe('a\rb\n');
  });
  it('core.autocrlf=input never converts on checkout', () => {
    expect(conv('a\nb\n', {}, { autocrlf: 'input' })).toBe('a\nb\n');
    expect(conv('a\nb\n', { text: 'set' }, { autocrlf: 'input', eol: 'crlf' })).toBe('a\nb\n');
  });
  it('text with eol=crlf converts every lone LF, also next to CRLF and in binary-looking content', () => {
    expect(conv('a\r\nb\nc', { text: 'set', eol: 'crlf' })).toBe('a\r\nb\r\nc');
    expect(conv('a\0\n', { text: 'set', eol: 'crlf' })).toBe('a\0\r\n');
    expect(crlfAction({ ...none, text: 'set', eol: 'crlf' }, settings())).toBe('text-crlf');
  });
  it('eol=lf keeps LF whatever core.autocrlf says, and eol alone implies text', () => {
    expect(conv('a\nb\n', { eol: 'lf' }, { autocrlf: 'true' })).toBe('a\nb\n');
    expect(conv('a\nb\n', { eol: 'crlf' })).toBe('a\r\nb\r\n');
  });
  it('-text (and the binary macro) is never converted', () => {
    expect(conv('a\nb\n', { text: 'unset' }, { autocrlf: 'true' })).toBe('a\nb\n');
  });
  it('text=auto follows the auto rules with the eol of the settings', () => {
    expect(conv('a\nb\n', { text: 'auto' }, { eol: 'crlf' })).toBe('a\r\nb\r\n');
    expect(conv('a\r\nb\n', { text: 'auto' }, { eol: 'crlf' })).toBe('a\r\nb\n');
    expect(conv('a\nb\n', { text: 'auto' }, { eol: 'lf' })).toBe('a\nb\n');
    expect(conv('a\nb\n', { text: 'auto', eol: 'crlf' })).toBe('a\r\nb\r\n');
    expect(crlfAction({ ...none, text: 'auto', eol: 'lf' }, settings())).toBe('auto-input');
  });
  it('text without eol uses core.eol, and the native line ending when core.eol is unset or native', () => {
    expect(conv('a\n', { text: 'set' }, { eol: 'crlf' })).toBe('a\r\n');
    expect(conv('a\n', { text: 'set' }, { eol: 'lf', nativeEol: 'crlf' })).toBe('a\n');
    expect(conv('a\n', { text: 'set' }, { eol: null, nativeEol: 'crlf' })).toBe('a\r\n');
    expect(conv('a\n', { text: 'set' }, { eol: 'native', nativeEol: 'crlf' })).toBe('a\r\n');
    expect(conv('a\n', { text: 'set' }, { eol: null, nativeEol: 'lf' })).toBe('a\n');
  });
  it('core.eol alone does not mark files as text', () => {
    expect(conv('a\n', {}, { eol: 'crlf' })).toBe('a\n');
  });
  it('reads the legacy crlf attribute when text is unspecified', () => {
    expect(conv('a\n', { crlf: 'set' }, { eol: 'crlf' })).toBe('a\r\n');
    expect(conv('a\n', { crlf: 'unset' }, { autocrlf: 'true' })).toBe('a\n');
    expect(conv('a\n', { crlf: 'input' }, { autocrlf: 'true' })).toBe('a\n');
  });
  it('an empty file stays empty', () => {
    expect(conv('', { text: 'set', eol: 'crlf' })).toBe('');
  });
});

describe('attributes of the snapshot', () => {
  it('a deeper .gitattributes overrides a higher one, info/attributes overrides both', () => {
    const set = new AttributeSet({
      files: [
        { directory: 'docs', content: '*.txt eol=lf\n' },
        { directory: '', content: '*.txt text eol=crlf\n*.bin binary\n' },
      ],
      infoAttributes: 'special.txt -text\n',
      globalAttributes: '*.md text\n',
    });
    expect(set.eolOf('a.txt')).toEqual({ text: 'set', crlf: null, eol: 'crlf' });
    expect(set.eolOf('docs/a.txt')).toEqual({ text: 'set', crlf: null, eol: 'lf' });
    expect(set.eolOf('x.bin').text).toBe('unset');
    expect(set.eolOf('special.txt').text).toBe('unset');
    expect(set.eolOf('r.md').text).toBe('set');
  });
});

describe('the file list of a workspace', () => {
  const tree: TreeEntry[] = [
    { path: 'README.md', mode: 'regular', blob: 'b1' },
    { path: 'src/old.ts', mode: 'regular', blob: 'b2' },
    { path: 'src/gone.ts', mode: 'regular', blob: 'b3' },
    { path: 'src/edit.ts', mode: 'regular', blob: 'b4' },
    { path: 'bin/run', mode: 'executable', blob: 'b5' },
    { path: 'vendor/lib', mode: 'submodule', blob: 'c0' },
  ];
  const base: Record<string, string> = {
    'README.md': 'readme\n',
    'src/old.ts': 'old\n',
    'src/edit.ts': 'before\n',
    'bin/run': '#!/bin/sh\n',
  };
  const store: Record<string, string> = { h1: 'renamed\n', h2: 'after\n', h3: 'new\n', h4: 'x' };

  const entries = snapshotEntries({
    baseTree: tree,
    changedFiles: [
      {
        path: 'src/new.ts',
        oldPath: 'src/old.ts',
        changeType: 'renamed',
        mode: 'regular',
        contentHash: 'h1',
      },
      { path: 'src/gone.ts', oldPath: null, changeType: 'deleted', mode: null, contentHash: null },
      {
        path: 'src/edit.ts',
        oldPath: null,
        changeType: 'modified',
        mode: 'executable',
        contentHash: 'h2',
      },
      {
        path: 'link',
        oldPath: null,
        changeType: 'added',
        mode: 'symbolic-link',
        contentHash: 'h3',
      },
      { path: 'img.png', oldPath: null, changeType: 'added', mode: 'regular', contentHash: null },
    ],
    readBase: async (path) => (base[path] === undefined ? null : Buffer.from(base[path])),
    readSnapshot: async (hash) => Buffer.from(store[hash]!),
  });

  it('is the base tree without deleted and renamed-away paths, with the snapshot files, sorted', () => {
    expect(entries.map((e) => [e.path, e.mode])).toEqual([
      ['README.md', 'regular'],
      ['bin/run', 'executable'],
      ['img.png', 'regular'],
      ['link', 'symlink'],
      ['src/edit.ts', 'executable'],
      ['src/new.ts', 'regular'],
      ['vendor/lib', 'submodule'],
    ]);
  });
  it('reads base content from the base commit and changed content from the snapshot', async () => {
    const byPath = new Map(entries.map((e) => [e.path, e]));
    expect((await byPath.get('README.md')!.read()).toString()).toBe('readme\n');
    expect((await byPath.get('src/edit.ts')!.read()).toString()).toBe('after\n');
    expect((await byPath.get('link')!.read()).toString()).toBe('new\n');
  });
  it('a changed file whose content the snapshot does not hold cannot be read', async () => {
    const img = entries.find((e) => e.path === 'img.png')!;
    await expect(img.read()).rejects.toThrow(/img\.png/);
  });
});
