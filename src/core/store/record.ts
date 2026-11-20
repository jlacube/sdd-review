import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Entry, Header } from '../../generated/review-record.js';
import { ReviewError } from '../errors/review-error.js';
import {
  errnoCode,
  fsOf,
  fsyncDir,
  guarded,
  step,
  writeAllSync,
  type StoreContext,
} from './fsutil.js';
import { withFileLock } from './lock.js';

export type { Entry, Header };

/** An entry as the caller supplies it: the store assigns seq, time, snapshotId and prevHash. */
export type EntryInput = Entry extends infer E
  ? E extends unknown
    ? Omit<E, 'seq' | 'time' | 'snapshotId' | 'prevHash'>
    : never
  : never;

/** The header fields the caller supplies; kind, format version and snapshot ID are fixed. */
export type HeaderInput = Pick<
  Header,
  'repositoryRoot' | 'baseCommit' | 'headCommit' | 'createdAt'
>;

export interface RecordContents {
  readonly header: Header;
  /** Entries in sequence order, seq 1 first. */
  readonly entries: readonly Entry[];
  /** The file ends in an unfinished line (an action that was never confirmed); it is not an entry. */
  readonly unfinishedTail: boolean;
}

export const RECORD_FILE = 'review-record.jsonl';
const LF = 0x0a;

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

interface ParsedRecord {
  header: Header | null;
  entries: Entry[];
  /** Length in bytes of the complete lines: where an unfinished tail starts. */
  completeLength: number;
  /** Hash of the last complete line, the prevHash of the next entry. */
  lastHash: string;
}

function damaged(snapshotId: string, line: number, cause: string): ReviewError {
  return new ReviewError('ERR-STORE-002', {
    operation: 'verify-review-record',
    inputs: { snapshotId, line },
    params: { 'snapshot-id': snapshotId, n: line },
    cause,
  });
}

/**
 * Parses and verifies the record (C001-IF-009): header first, sequence numbers 1, 2, 3, ..., each
 * prevHash the SHA-256 of the previous line's bytes without its LF. An unfinished last line
 * (no LF) is not part of the result; any other bad line is ERR-STORE-002.
 */
export function parseRecord(bytes: Buffer, snapshotId: string): ParsedRecord {
  const completeLength = bytes.lastIndexOf(LF) + 1;
  const result: ParsedRecord = { header: null, entries: [], completeLength, lastHash: '' };
  let start = 0;
  let lineNo = 0;
  while (start < completeLength) {
    const end = bytes.indexOf(LF, start);
    const line = bytes.subarray(start, end);
    lineNo++;
    let value: unknown;
    try {
      value = JSON.parse(line.toString('utf8'));
    } catch (error) {
      throw damaged(snapshotId, lineNo, `not valid JSON: ${(error as Error).message}`);
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw damaged(snapshotId, lineNo, 'not a JSON object');
    }
    if (lineNo === 1) {
      const header = value as Header;
      if (header.kind !== 'header' || header.snapshotId !== snapshotId) {
        throw damaged(snapshotId, 1, 'the first line is not the header of this snapshot');
      }
      result.header = header;
    } else {
      const entry = value as Entry;
      const expectedSeq = lineNo - 1;
      if (entry.seq !== expectedSeq) {
        throw damaged(
          snapshotId,
          lineNo,
          `sequence number ${String(entry.seq)}, expected ${expectedSeq}`,
        );
      }
      if (entry.prevHash !== result.lastHash) {
        throw damaged(snapshotId, lineNo, 'previous-line hash does not match');
      }
      result.entries.push(entry);
    }
    result.lastHash = sha256(line);
    start = end + 1;
  }
  return result;
}

/**
 * The append-only review record of one snapshot (C001-IF-009, C001-ADR-005 items 4 and 6).
 * Writers take the record lock, re-read what other processes appended, append and flush; an entry
 * is on disk when `append` returns.
 */
export class RecordStore {
  readonly file: string;
  readonly lockFile: string;

  constructor(
    private readonly ctx: StoreContext,
    snapshotDir: string,
    readonly snapshotId: string,
  ) {
    this.file = join(snapshotDir, RECORD_FILE);
    this.lockFile = `${this.file}.lock`;
  }

  /** Writes the header line if the record has none yet (idempotent). Returns the header in force. */
  async create(input: HeaderInput): Promise<Header> {
    const context = { operation: 'create-review-record', inputs: { snapshotId: this.snapshotId } };
    return guarded(this.ctx, context, () =>
      withFileLock(this.ctx, this.lockFile, () => {
        const fs = fsOf(this.ctx);
        const existing = this.readBytes();
        const parsed = existing ? parseRecord(existing, this.snapshotId) : null;
        if (parsed?.header) return parsed.header;
        const header: Header = {
          kind: 'header',
          formatVersion: 1,
          snapshotId: this.snapshotId,
          ...input,
        };
        const line = Buffer.from(`${JSON.stringify(header)}\n`, 'utf8');
        // A file with no complete header is an unfinished creation: start it again.
        const fd = fs.openSync(this.file, existing ? 'r+' : 'wx', 0o600);
        try {
          if (existing) fs.ftruncateSync(fd, 0);
          writeAllSync(fs, fd, line);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        fsyncDir(this.ctx, join(this.file, '..'));
        return header;
      }),
    );
  }

  /**
   * Appends entries as consecutive lines in one write and one flush (a defect report and its
   * escalation go together). `inputs` may be a function of the sequence number the first entry
   * gets, for entries that name each other (an escalation names its defect report's seq).
   * Returns the entries as written.
   */
  async append(
    inputs: readonly EntryInput[] | ((firstSeq: number) => readonly EntryInput[]),
  ): Promise<Entry[]> {
    const context = {
      operation: 'append-review-record-entry',
      inputs: { snapshotId: this.snapshotId },
    };
    return guarded(this.ctx, context, async () => {
      const written = await withFileLock(this.ctx, this.lockFile, () => this.appendLocked(inputs));
      step(this.ctx, 'lock-released');
      return written;
    });
  }

  private appendLocked(
    inputs: readonly EntryInput[] | ((firstSeq: number) => readonly EntryInput[]),
  ): Entry[] {
    const fs = fsOf(this.ctx);
    step(this.ctx, 'lock-acquired');
    const bytes = this.readBytes();
    if (!bytes) throw this.missing();
    const state = parseRecord(bytes, this.snapshotId);
    if (!state.header) throw this.missing();

    if (state.completeLength < bytes.length) {
      // The unfinished last line of a never-confirmed action: removed under the lock (C001-IF-009).
      this.truncate(state.completeLength);
      step(this.ctx, 'tail-repaired');
    }

    const list = typeof inputs === 'function' ? inputs(state.entries.length + 1) : inputs;
    if (list.length === 0) return [];
    const now = (this.ctx.now?.() ?? new Date()).toISOString();
    const out: Entry[] = [];
    const lines: Buffer[] = [];
    let prevHash = state.lastHash;
    list.forEach((input, index) => {
      const { kind, surface, user, ...rest } = input as Record<string, unknown>;
      const entry = {
        kind,
        seq: state.entries.length + 1 + index,
        time: now,
        snapshotId: this.snapshotId,
        surface,
        user,
        prevHash,
        ...rest,
      } as unknown as Entry;
      const line = Buffer.from(JSON.stringify(entry), 'utf8');
      prevHash = sha256(line);
      lines.push(line, Buffer.from([LF]));
      out.push(entry);
    });

    const data = Buffer.concat(lines);
    step(this.ctx, 'before-write');
    const fd = fs.openSync(this.file, 'a');
    try {
      writeAllSync(fs, fd, data);
      step(this.ctx, 'after-write');
      fs.fsyncSync(fd);
    } catch (error) {
      fs.closeSync(fd);
      this.rollback(state.completeLength);
      throw error;
    }
    fs.closeSync(fd);
    step(this.ctx, 'after-flush');
    return out;
  }

  /** Reads and verifies the record. No lock: an unfinished last line is ignored, never returned. */
  async read(): Promise<RecordContents> {
    return guarded(
      this.ctx,
      { operation: 'read-review-record', inputs: { snapshotId: this.snapshotId } },
      () => {
        const bytes = this.readBytes();
        if (!bytes) throw this.missing();
        const parsed = parseRecord(bytes, this.snapshotId);
        if (!parsed.header) throw this.missing();
        return {
          header: parsed.header,
          entries: parsed.entries,
          unfinishedTail: parsed.completeLength < bytes.length,
        };
      },
    );
  }

  /** Removes an unfinished last line under the lock; true when there was one (used on reopen). */
  async removeUnfinishedTail(): Promise<boolean> {
    return guarded(
      this.ctx,
      { operation: 'repair-review-record-tail', inputs: { snapshotId: this.snapshotId } },
      () =>
        withFileLock(this.ctx, this.lockFile, () => {
          const bytes = this.readBytes();
          if (!bytes) throw this.missing();
          const parsed = parseRecord(bytes, this.snapshotId);
          if (parsed.completeLength === bytes.length) return false;
          this.truncate(parsed.completeLength);
          return true;
        }),
    );
  }

  private readBytes(): Buffer | null {
    try {
      return fsOf(this.ctx).readFileSync(this.file);
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') return null;
      throw error;
    }
  }

  private missing(): ReviewError {
    return new ReviewError('ERR-STORE-004', {
      operation: 'open-review-record',
      inputs: { snapshotId: this.snapshotId },
      params: { value: this.snapshotId },
    });
  }

  private truncate(length: number): void {
    const fs = fsOf(this.ctx);
    const fd = fs.openSync(this.file, 'r+');
    try {
      fs.ftruncateSync(fd, length);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  /** After a failed write or flush: drop what may have reached the file so nothing was recorded. */
  private rollback(length: number): void {
    try {
      this.truncate(length);
    } catch {
      // The next writer removes an unfinished line; a complete but unflushed line is reported by
      // the error the caller already gets and by the log entry.
    }
  }
}
