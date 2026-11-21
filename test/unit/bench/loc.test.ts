import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  countBufferLines,
  countRepositoryLines,
  isExcludedPath,
} from '../../../bench/harness/loc.js';

describe('line counter', () => {
  it('counts lines with and without a final line feed, and gives null for binary', () => {
    expect(countBufferLines(Buffer.from(''))).toBe(0);
    expect(countBufferLines(Buffer.from('a\nb\n'))).toBe(2);
    expect(countBufferLines(Buffer.from('a\nb'))).toBe(2);
    expect(countBufferLines(Buffer.from('a\r\nb\r\n'))).toBe(2);
    expect(countBufferLines(Buffer.from([1, 0, 2]))).toBeNull();
  });

  it('leaves out lock files, minified, binary and vendored paths', () => {
    for (const p of [
      'package-lock.json',
      'sub/Cargo.lock',
      'dist/app.min.js',
      'logo.png',
      'vendor/x/y.js',
      'a/node_modules/b.js',
    ]) {
      expect(isExcludedPath(p)).toBe(true);
    }
    for (const p of ['src/index.ts', 'README.md', 'tests/a.py', 'src/vendorish.ts']) {
      expect(isExcludedPath(p)).toBe(false);
    }
  });

  it('counts the tracked files of a repository, not untracked ones', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sdd-bench-loc-'));
    try {
      const git = (...args: string[]) =>
        execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
      git('init', '-q');
      mkdirSync(path.join(dir, 'src'));
      writeFileSync(path.join(dir, 'src', 'a.ts'), 'one\ntwo\nthree\n');
      writeFileSync(path.join(dir, 'README.md'), '# t\n');
      writeFileSync(path.join(dir, 'package-lock.json'), '{\n}\n');
      writeFileSync(path.join(dir, 'untracked.ts'), 'x\ny\n');
      git('add', 'src', 'README.md', 'package-lock.json');
      const count = countRepositoryLines(dir);
      expect(count.totalLines).toBe(4);
      expect(count.sourceLines).toBe(3);
      expect(count.files).toBe(2);
      expect(count.excludedFiles).toBe(1);
      expect(count.byExtension['.ts']).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
