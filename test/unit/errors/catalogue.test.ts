import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseErrorsMd, errorsMdPath } from '../../../scripts/transcribe-catalogue.mjs';
import { ERROR_CATALOGUE, lookupError } from '../../../src/core/errors/catalogue.js';
import { ReviewError } from '../../../src/core/errors/review-error.js';

interface SpecRow {
  code: string;
  kind: string;
  exitCode: number | null;
  httpStatus: number | null;
}
const spec: SpecRow[] = parseErrorsMd(readFileSync(errorsMdPath(), 'utf8'));

describe('error catalogue (C001-TS-930)', () => {
  it('equals errors.md in code, kind, exit code and HTTP status', () => {
    expect(spec.length).toBeGreaterThan(60);
    expect(ERROR_CATALOGUE.map((e) => [e.code, e.kind, e.exitCode, e.httpStatus])).toEqual(
      spec.map((e) => [e.code, e.kind, e.exitCode, e.httpStatus]),
    );
  });

  it('keeps message, fix and spec text', () => {
    expect(ERROR_CATALOGUE).toEqual(spec);
  });

  it('uses only the exit codes of C001-IF-001', () => {
    const allowed = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null]);
    for (const e of ERROR_CATALOGUE) expect(allowed.has(e.exitCode)).toBe(true);
  });

  it('maps each code to exit code and HTTP status through ReviewError', () => {
    const err = new ReviewError('ERR-INTAKE-005', {
      operation: 'intake',
      params: { hash: 'abc123' },
    });
    expect(err.exitCode).toBe(4);
    expect(err.message).toContain('base commit abc123');
    const ui = new ReviewError('ERR-EVID-007', {
      operation: 'run',
      params: { command: 'x', source: 'y' },
    });
    expect(ui.httpStatus).toBe(409);
    expect(ui.toProblem()).toMatchObject({ status: 409, code: 'ERR-EVID-007' });
    expect(lookupError('ERR-CLI-003').exitCode).toBe(1);
  });

  it('rejects an unknown code', () => {
    expect(() => new ReviewError('ERR-NOPE-001', { operation: 'x' })).toThrow();
  });
});
