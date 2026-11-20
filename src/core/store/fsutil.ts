import * as nodeFs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { ReviewError, type ErrorContext } from '../errors/review-error.js';
import type { ContextualLog } from '../log/log.js';

/** The file system calls of the store; tests replace single members to inject faults (ENOSPC, EACCES, kills). */
export interface FsOps {
  openSync: typeof nodeFs.openSync;
  writeSync: typeof nodeFs.writeSync;
  fsyncSync: typeof nodeFs.fsyncSync;
  closeSync: typeof nodeFs.closeSync;
  renameSync: typeof nodeFs.renameSync;
  mkdirSync: typeof nodeFs.mkdirSync;
  readFileSync: typeof nodeFs.readFileSync;
  readdirSync: typeof nodeFs.readdirSync;
  rmSync: typeof nodeFs.rmSync;
  unlinkSync: typeof nodeFs.unlinkSync;
  statSync: typeof nodeFs.statSync;
  ftruncateSync: typeof nodeFs.ftruncateSync;
  chmodSync: typeof nodeFs.chmodSync;
  existsSync: typeof nodeFs.existsSync;
}

export const nodeFsOps: FsOps = {
  openSync: nodeFs.openSync,
  writeSync: nodeFs.writeSync,
  fsyncSync: nodeFs.fsyncSync,
  closeSync: nodeFs.closeSync,
  renameSync: nodeFs.renameSync,
  mkdirSync: nodeFs.mkdirSync,
  readFileSync: nodeFs.readFileSync,
  readdirSync: nodeFs.readdirSync,
  rmSync: nodeFs.rmSync,
  unlinkSync: nodeFs.unlinkSync,
  statSync: nodeFs.statSync,
  ftruncateSync: nodeFs.ftruncateSync,
  chmodSync: nodeFs.chmodSync,
  existsSync: nodeFs.existsSync,
};

/** Names of the points where a kill or a fault can be injected (fault-injection tests of C001-NFR-014). */
export type StepName =
  | 'lock-acquired'
  | 'tail-repaired'
  | 'before-write'
  | 'after-write'
  | 'after-flush'
  | 'lock-released'
  | 'documents-written'
  | 'current-tmp-written'
  | 'current-switched'
  | 'older-removed';

/** What every store operation needs besides its own arguments. */
export interface StoreContext {
  /** The per-repository log (NFR-D-04); store errors are recorded in it. */
  readonly log: ContextualLog;
  readonly fs?: FsOps;
  /** Called at each named step; a test throws or kills the process here. */
  readonly onStep?: (step: StepName) => void;
  readonly platform?: NodeJS.Platform;
  readonly now?: () => Date;
  /** Waits; replaced in tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Lock acquisition limit in ms (ADR-005 item 6: 10 s). */
  readonly lockTimeoutMs?: number;
  /** Age in ms after which a lock file is stale (ADR-005 item 6: 30 s). */
  readonly lockStaleMs?: number;
  /** Pause between lock attempts in ms. */
  readonly lockPollMs?: number;
  /** Windows rename retry budget in ms (ADR-005 item 5: 2 s). */
  readonly renameRetryMs?: number;
}

export const LOCK_TIMEOUT_MS = 10_000;
export const LOCK_STALE_MS = 30_000;
export const RENAME_RETRY_MS = 2_000;

export const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function fsOf(ctx: StoreContext): FsOps {
  return ctx.fs ?? nodeFsOps;
}

export function step(ctx: StoreContext, name: StepName): void {
  ctx.onStep?.(name);
}

export function errnoCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function causeText(error: unknown): string {
  const code = errnoCode(error);
  const text = error instanceof Error ? error.message : String(error);
  return code && !text.includes(code) ? `${code}: ${text}` : text;
}

/** Records an error in the log; a failing log never hides the error being reported. */
export function logQuietly(
  ctx: StoreContext,
  error: unknown,
  operation: string,
  inputs?: Record<string, unknown>,
) {
  try {
    ctx.log.recordError(error, operation, inputs);
  } catch {
    /* the disk that failed the write may fail the log too */
  }
}

type OperationContext = Omit<ErrorContext, 'cause' | 'params'>;

function reported(ctx: StoreContext, error: unknown, context: OperationContext): ReviewError {
  const failure =
    error instanceof ReviewError
      ? error
      : new ReviewError('ERR-STORE-001', {
          ...context,
          params: { cause: causeText(error) },
          cause: error,
        });
  logQuietly(
    ctx,
    failure,
    context.operation,
    context.inputs as Record<string, unknown> | undefined,
  );
  return failure;
}

/**
 * Runs a store operation: a ReviewError passes through, any other failure becomes ERR-STORE-001
 * ("not saved"), and every error is logged with its context.
 */
export async function guarded<T>(
  ctx: StoreContext,
  context: OperationContext,
  work: () => Promise<T> | T,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw reported(ctx, error, context);
  }
}

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * rename over an existing file. On Windows a rename can be refused for a short time because
 * another program (a virus scanner, an indexer, a reader) holds the target: it is retried for up
 * to `renameRetryMs` (ADR-005 item 5). On macOS and Linux the first failure is final. When the
 * budget is used up the last error is thrown and the target keeps its old content.
 */
export async function renameWithRetry(ctx: StoreContext, from: string, to: string): Promise<void> {
  const fs = fsOf(ctx);
  const sleep = ctx.sleep ?? defaultSleep;
  const budget = ctx.renameRetryMs ?? RENAME_RETRY_MS;
  const windows = (ctx.platform ?? process.platform) === 'win32';
  let waited = 0;
  for (let delay = 10; ; delay = Math.min(delay * 2, 200)) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      const code = errnoCode(error);
      if (!windows || !code || !RETRY_CODES.has(code) || waited >= budget) throw error;
      const pause = Math.min(delay, budget - waited);
      await sleep(pause);
      waited += pause;
    }
  }
}

/** Flushes a directory entry after a rename or a create; not possible on Windows, where it is skipped. */
export function fsyncDir(ctx: StoreContext, dir: string): void {
  if ((ctx.platform ?? process.platform) === 'win32') return;
  const fs = fsOf(ctx);
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function writeAllSync(fs: FsOps, fd: number, data: Buffer): void {
  let offset = 0;
  while (offset < data.length) {
    offset += fs.writeSync(fd, data, offset, data.length - offset);
  }
}

/** Creates a file with owner-only permissions (0600; ignored on Windows), writes and flushes it. */
export function writeNewFileSync(ctx: StoreContext, path: string, data: Buffer): void {
  const fs = fsOf(ctx);
  const fd = fs.openSync(path, 'wx', 0o600);
  try {
    writeAllSync(fs, fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Replaces `path` with `data`: temporary file next to it, flush, rename over the target (with the
 * Windows retry), directory flush on POSIX. A reader sees the old or the new content, never a mix.
 * `afterTmp` runs between the flush and the rename (a test hook).
 */
export async function writeFileAtomic(
  ctx: StoreContext,
  path: string,
  data: Buffer,
  afterTmp?: () => void,
): Promise<void> {
  const fs = fsOf(ctx);
  const tmp = join(dirname(path), `.tmp-${randomBytes(6).toString('hex')}`);
  try {
    writeNewFileSync(ctx, tmp, data);
    afterTmp?.();
    await renameWithRetry(ctx, tmp, path);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw error;
  }
  fsyncDir(ctx, dirname(path));
}
