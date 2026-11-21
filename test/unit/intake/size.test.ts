import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  groupDigits,
  measureSize,
  sizeWarning,
  SUPPORTED_SIZE,
} from '../../../src/core/intake/size.js';
import { ContextualLog } from '../../../src/core/log/log.js';

// C001-T-026: the supported size (C001-REQ-121, C001-TS-147, C001-TS-148).

const files = (lines: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    changedLines: Math.floor(lines / count) + (i < lines % count ? 1 : 0),
  }));

const dir = mkdtempSync(join(tmpdir(), 'size-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('measureSize', () => {
  it('is the supported size of C001-DEC-007', () => {
    expect(SUPPORTED_SIZE).toEqual({ changedLines: 10_000, changedFiles: 300 });
  });

  it.each([
    [10_001, 120, true],
    [8_000, 301, true],
    [12_500, 340, true],
    [10_000, 300, false],
    [9_999, 299, false],
  ])('%i lines over %i files exceeds: %s', (lines, count, exceeded) => {
    expect(measureSize(files(lines, count))).toEqual({
      changedLines: lines,
      changedFiles: count,
      exceeded,
    });
  });

  it('counts a binary file, with 0 changed lines, as a changed file', () => {
    expect(measureSize([...files(10, 300), { changedLines: 0 }])).toMatchObject({
      changedFiles: 301,
      exceeded: true,
    });
  });
});

describe('sizeWarning', () => {
  it('states the measured counts and the supported size (ERR-INTAKE-006), and logs it', () => {
    const logFile = join(dir, 'log.jsonl');
    const log = new ContextualLog(logFile);
    const notice = sizeWarning(measureSize(files(12_500, 340)), log, { base: 'b0' });
    expect(notice).toEqual({
      code: 'ERR-INTAKE-006',
      message:
        'This change has 12,500 changed lines in 340 files; the supported size is 10,000 changed lines and 300 files. Results and response times may fall outside the stated limits.',
    });
    const logged = JSON.parse(readFileSync(logFile, 'utf8').trim()) as Record<string, unknown>;
    expect(logged).toMatchObject({
      level: 'notice',
      code: 'ERR-INTAKE-006',
      operation: 'intake',
      inputs: { base: 'b0', changedLines: 12_500, changedFiles: 340 },
    });
  });

  it('is null at or below the supported size', () => {
    expect(sizeWarning(measureSize(files(10_000, 300)))).toBeNull();
  });

  it('groups digits by thousands', () => {
    expect([0, 999, 1_000, 10_001, 1_234_567].map(groupDigits)).toEqual([
      '0',
      '999',
      '1,000',
      '10,001',
      '1,234,567',
    ]);
  });
});
