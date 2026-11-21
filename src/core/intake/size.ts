import type { Notice } from '../../generated/analysis-results.js';
import { ReviewError } from '../errors/review-error.js';
import type { ContextualLog } from '../log/log.js';

/**
 * The supported size of a change (C001-DEC-007, C001-CON-06): above 10,000 changed lines or 300
 * changed files, intake warns with the measured counts (C001-REQ-121) and the review goes on over
 * the whole change (C001-REQ-122). Changed lines count text files only (glossary, changed line);
 * changed files count every changed file, binary files included (C001-IF-012 §7 item 3).
 */
export const SUPPORTED_SIZE = { changedLines: 10_000, changedFiles: 300 } as const;

export interface SizeMeasure {
  readonly changedLines: number;
  readonly changedFiles: number;
  /** True when either count is above the supported size (domain model §2.2 `sizeWarning`). */
  readonly exceeded: boolean;
}

/** Measures the change from its changed files, each with its changed lines. */
export function measureSize(files: ReadonlyArray<{ readonly changedLines: number }>): SizeMeasure {
  const changedLines = files.reduce((sum, file) => sum + file.changedLines, 0);
  const changedFiles = files.length;
  return {
    changedLines,
    changedFiles,
    exceeded:
      changedLines > SUPPORTED_SIZE.changedLines || changedFiles > SUPPORTED_SIZE.changedFiles,
  };
}

/** A count as the catalogue message writes the supported size: digits grouped by commas. */
export function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The size warning of the intake summary (ERR-INTAKE-006), or `null` at or below the supported
 * size. The warning informs and never stops intake; it is logged as a notice (NFR-D-04).
 */
export function sizeWarning(
  measure: SizeMeasure,
  log?: ContextualLog,
  inputs: Readonly<Record<string, unknown>> = {},
): Notice | null {
  if (!measure.exceeded) return null;
  const notice = new ReviewError('ERR-INTAKE-006', {
    operation: 'intake',
    inputs: { ...inputs, changedLines: measure.changedLines, changedFiles: measure.changedFiles },
    params: { lines: groupDigits(measure.changedLines), files: groupDigits(measure.changedFiles) },
    cause: 'the change exceeds the supported size',
  });
  try {
    log?.recordError(notice, 'intake');
  } catch {
    /* a failing log never hides the notice */
  }
  return { code: notice.code, message: notice.message };
}
