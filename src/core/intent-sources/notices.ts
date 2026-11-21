import type { Notice } from '../../generated/analysis-results.js';
import { ReviewError } from '../errors/review-error.js';
import type { ContextualLog } from '../log/log.js';

/**
 * Notices of the intent-source reader: ERR-SDD-005 for an unreadable `.sdd/` entry, which is left
 * out and reading continues (C001-REQ-123, C001-IF-007 §2 to §4), and ERR-SDD-004 for an
 * architecture without component paths (C001-REQ-223, C001-IF-007 §4 item 4). Each notice is
 * logged with its operation, identifying inputs and cause (NFR-D-04).
 */

/** The entry kinds that ERR-SDD-005 names. */
export type EntryKind =
  'change folder' | 'requirement' | 'acceptance criterion' | 'scenario' | 'task' | 'component';

/** Where notices go; reading the base commit's side passes none, as it reports nothing. */
export interface NoticeSink {
  /** ERR-SDD-005: the entry is left out of the intent context. */
  skipped(kind: EntryKind, file: string, line: number, reason: string): void;
  /** ERR-SDD-004: the architecture in `file` is not used as the documented architecture. */
  noComponentPaths(file: string): void;
}

const OPERATION = 'read-intent-sources';

/** Collects the reader's notices in the order they were found. */
export class NoticeCollector implements NoticeSink {
  readonly notices: Notice[] = [];

  constructor(private readonly log?: ContextualLog) {}

  skipped(kind: EntryKind, file: string, line: number, reason: string): void {
    this.add(
      new ReviewError('ERR-SDD-005', {
        operation: OPERATION,
        inputs: { file, line, entryKind: kind },
        params: { 'entry kind': kind, file, n: line, reason },
        cause: reason,
      }),
      file,
    );
  }

  noComponentPaths(file: string): void {
    this.add(
      new ReviewError('ERR-SDD-004', {
        operation: OPERATION,
        inputs: { file },
        params: { path: file },
        cause: 'no component of the architecture gives a path pattern',
      }),
      file,
    );
  }

  private add(error: ReviewError, subject: string): void {
    try {
      this.log?.recordError(error, OPERATION);
    } catch {
      /* the notice itself is what matters */
    }
    this.notices.push({ code: error.code, message: error.message, subject });
  }
}
