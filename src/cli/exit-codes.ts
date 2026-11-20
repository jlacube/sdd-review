import { ReviewError, isReviewError } from '../core/api/index.js';

/** The exit codes of C001-IF-001 (Exit codes). */
export const EXIT = {
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
} as const;

/**
 * The exit code of an outcome: the code of the error catalogue's CLI column for a `ReviewError`
 * (transcribed from `errors.md`, so the two tables cannot drift), and 1 (ERR-CLI-003) for anything
 * else.
 */
export function exitCodeOf(error: unknown): number {
  return isReviewError(error) ? error.exitCode : EXIT.internal;
}

/** Any thrown value as the error the command reports: a `ReviewError` stays, others become ERR-CLI-003. */
export function toReviewError(error: unknown, operation = 'the command'): ReviewError {
  if (isReviewError(error)) return error;
  const cause = error instanceof Error ? error.message : String(error);
  return new ReviewError('ERR-CLI-003', {
    operation,
    inputs: { operation },
    params: { operation, cause },
    cause: error,
  });
}

/** Standard-error line of an error: `<code>: <message>` (C001-IF-001 Output). */
export function errorLine(error: unknown, operation?: string): string {
  const reviewError = toReviewError(error, operation);
  return `${reviewError.code}: ${reviewError.message}`;
}

/** Standard-error line of a notice. */
export function noticeLine(notice: { readonly code: string; readonly message: string }): string {
  return `${notice.code}: ${notice.message}`;
}
