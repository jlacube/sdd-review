import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ContextualLog } from '../../../src/core/log/log.js';
import { ReviewError } from '../../../src/core/errors/review-error.js';

function setup() {
  const file = join(mkdtempSync(join(tmpdir(), 'sddlog-')), 'store', 'review.log');
  return { file, log: new ContextualLog(file, () => new Date('2026-01-01T00:00:00Z')) };
}
const lines = (f: string): Record<string, unknown>[] =>
  readFileSync(f, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe('contextual log (NFR-D-04)', () => {
  it('records operation, identifying inputs and cause of an error', () => {
    const { file, log } = setup();
    const err = new ReviewError('ERR-STORE-001', {
      operation: 'append-record',
      inputs: { snapshot: 's1' },
      cause: new Error('ENOSPC'),
    });
    log.recordError(err, 'append-record');
    expect(lines(file)).toEqual([
      expect.objectContaining({
        level: 'error',
        code: 'ERR-STORE-001',
        operation: 'append-record',
        inputs: { snapshot: 's1' },
        cause: 'ENOSPC',
      }),
    ]);
  });

  it('records a notice and appends', () => {
    const { file, log } = setup();
    log.record('ERR-INTAKE-006', { operation: 'intake', inputs: { files: 301 }, cause: 'size' });
    log.record('ERR-INTAKE-006', { operation: 'intake', inputs: { files: 302 }, cause: 'size' });
    const l = lines(file);
    expect(l).toHaveLength(2);
    expect(l[0]?.level).toBe('notice');
  });

  it('never logs a key or secret value (C001-CON-21)', () => {
    const { file, log } = setup();
    log.record('ERR-MODEL-006', {
      operation: 'model',
      inputs: { apiKey: 'sk-SECRET', providerToken: 'tok', service: 'sdd-review' },
    });
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain('sk-SECRET');
    expect(text).not.toContain('"tok"');
    expect(text).toContain('sdd-review');
  });

  it('logs an unknown error as an internal error', () => {
    const { file, log } = setup();
    log.recordError(new TypeError('boom'), 'intake', { repo: '/r' });
    expect(lines(file)[0]).toMatchObject({
      code: 'ERR-CLI-003',
      cause: 'boom',
      inputs: { repo: '/r' },
    });
  });
});
