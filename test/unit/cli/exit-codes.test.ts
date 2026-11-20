import { describe, expect, it } from 'vitest';
import { ERROR_CATALOGUE } from '../../../src/core/errors/catalogue.js';
import { ReviewError } from '../../../src/core/errors/review-error.js';
import { EXIT, errorLine, exitCodeOf, noticeLine } from '../../../src/cli/exit-codes.js';

// C001-IF-001 Exit codes: each code 0..10 is the exit status of the errors the table lists for it.

const LISTED: Array<[number, string[]]> = [
  [1, ['ERR-CLI-003']],
  [2, ['ERR-CLI-001']],
  [
    3,
    [
      'ERR-INTAKE-001',
      'ERR-INTAKE-002',
      'ERR-INTAKE-003',
      'ERR-INTAKE-004',
      'ERR-INTAKE-008',
      'ERR-CTX-001',
      'ERR-CTX-002',
      'ERR-CTX-003',
      'ERR-SDD-001',
      'ERR-SDD-002',
      'ERR-SDD-003',
    ],
  ],
  [4, ['ERR-INTAKE-005']],
  [5, ['ERR-STORE-004', 'ERR-ACT-004']],
  [6, ['ERR-ACT-001', 'ERR-ACT-002', 'ERR-ACT-003', 'ERR-ACT-006']],
  [7, ['ERR-CLI-002']],
  [8, ['ERR-STORE-001', 'ERR-STORE-002', 'ERR-STORE-003']],
  [9, ['ERR-UI-004']],
  [10, ['ERR-CFG-003']],
];

function raise(code: string): ReviewError {
  return new ReviewError(code, { operation: 'test' });
}

describe('outcome to exit code', () => {
  it('names the codes of the table', () => {
    expect(EXIT).toEqual({
      ok: 0,
      internal: 1,
      usage: 2,
      intakeRefused: 3,
      emptyChange: 4,
      unknown: 5,
      actionRefused: 6,
      notWritten: 7,
      store: 8,
      uiCannotListen: 9,
      invalidConfig: 10,
    });
  });

  it.each(LISTED.flatMap(([exit, codes]) => codes.map((code) => [code, exit] as const)))(
    '%s exits with %i',
    (code, exit) => {
      expect(exitCodeOf(raise(code))).toBe(exit);
    },
  );

  it('reaches every code 0 to 10', () => {
    expect(new Set([EXIT.ok, ...LISTED.map(([exit]) => exit)])).toEqual(
      new Set([...Array(11).keys()]),
    );
  });

  it('maps any other error to the internal error, 1', () => {
    expect(exitCodeOf(new Error('boom'))).toBe(1);
    expect(exitCodeOf('text')).toBe(1);
  });

  it('exits 0 for the notices (the command completes)', () => {
    for (const entry of ERROR_CATALOGUE.filter((e) => e.kind === 'notice' && e.exitCode !== null)) {
      expect(entry.exitCode).toBe(0);
    }
  });

  it('prints errors and notices as "<code>: <message>"', () => {
    expect(errorLine(raise('ERR-CLI-001'))).toMatch(/^ERR-CLI-001: .*Run `sdd-review --help`\.$/);
    expect(errorLine(new Error('boom'))).toBe(
      'ERR-CLI-003: Internal error in the command: boom. The review state is unchanged.',
    );
    expect(noticeLine({ code: 'ERR-SDD-005', message: 'Skipped a spec item.' })).toBe(
      'ERR-SDD-005: Skipped a spec item.',
    );
  });
});
