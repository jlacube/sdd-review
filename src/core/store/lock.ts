import { randomBytes } from 'node:crypto';
import { linkSync } from 'node:fs';
import { ReviewError } from '../errors/review-error.js';
import {
  LOCK_STALE_MS,
  LOCK_TIMEOUT_MS,
  defaultSleep,
  errnoCode,
  fsOf,
  logQuietly,
  type StoreContext,
} from './fsutil.js';

interface LockContent {
  readonly pid: number;
  readonly token: string;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errnoCode(error) === 'EPERM';
  }
}

function readLock(
  ctx: StoreContext,
  path: string,
): { content?: LockContent; ageMs: number } | null {
  const fs = fsOf(ctx);
  try {
    const mtime = fs.statSync(path).mtimeMs;
    const ageMs = (ctx.now?.() ?? new Date()).getTime() - mtime;
    try {
      const parsed = JSON.parse(fs.readFileSync(path, 'utf8')) as Partial<LockContent>;
      if (typeof parsed.pid === 'number' && typeof parsed.token === 'string') {
        return { content: { pid: parsed.pid, token: parsed.token }, ageMs };
      }
    } catch {
      /* empty or half-written: judged by age only */
    }
    return { ageMs };
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Lock file protocol of C001-ADR-005 item 6: a file created with exclusive creation next to the
 * guarded file, holding the owner's process ID and a random token, held for one operation only.
 * Acquisition retries until `lockTimeoutMs` (10 s), then fails with ERR-STORE-003. A lock whose
 * owner process no longer runs, or that is older than `lockStaleMs` (30 s), is stale and removed.
 *
 * Residual window: two processes that judge the same stale lock stale at the same moment can race
 * on its removal; the loser verifies the token it removed and puts a live lock back, but a third
 * process could take the lock in between. Both conditions (a dead holder and three processes in the
 * same millisecond) are outside what C001-NFR-014 injects; the chain check (sequence numbers,
 * previous-line hash) detects the effect instead of hiding it.
 */
export async function withFileLock<T>(
  ctx: StoreContext,
  lockPath: string,
  work: () => Promise<T> | T,
): Promise<T> {
  const fs = fsOf(ctx);
  const sleep = ctx.sleep ?? defaultSleep;
  const timeout = ctx.lockTimeoutMs ?? LOCK_TIMEOUT_MS;
  const staleMs = ctx.lockStaleMs ?? LOCK_STALE_MS;
  const poll = ctx.lockPollMs ?? 15;
  const token = randomBytes(12).toString('hex');
  const started = Date.now();

  for (let attempt = 0; ; attempt++) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, token } satisfies LockContent));
      } finally {
        fs.closeSync(fd);
      }
      break;
    } catch (error) {
      const code = errnoCode(error);
      // On Windows a lock file that was just deleted can still be "delete pending" while another
      // process holds it open for reading: creation fails with EPERM or EBUSY for a moment.
      const transient =
        (ctx.platform ?? process.platform) === 'win32' &&
        (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES');
      if (code !== 'EEXIST' && !transient) throw error;
    }

    const held = readLock(ctx, lockPath);
    if (held) {
      const dead = held.content !== undefined && !processAlive(held.content.pid);
      if (dead || held.ageMs > staleMs) {
        removeStale(ctx, lockPath, held.content?.token);
        continue;
      }
    }
    if (Date.now() - started >= timeout) {
      throw new ReviewError('ERR-STORE-003', {
        operation: 'acquire-record-lock',
        inputs: { lockPath, timeoutMs: timeout },
      });
    }
    // A little jitter keeps contenders from polling in step.
    await sleep(poll + (attempt % 5));
  }

  try {
    return await work();
  } finally {
    release(ctx, lockPath, token);
  }
}

function removeStale(ctx: StoreContext, lockPath: string, token: string | undefined) {
  const fs = fsOf(ctx);
  const aside = `${lockPath}.stale-${randomBytes(6).toString('hex')}`;
  try {
    fs.renameSync(lockPath, aside);
  } catch {
    return; // someone else removed or replaced it; the next attempt looks again
  }
  try {
    const moved = JSON.parse(fs.readFileSync(aside, 'utf8')) as Partial<LockContent>;
    if (token !== undefined && moved.token !== token) {
      // We moved a live lock that replaced the stale one; put it back unless the path is taken.
      try {
        linkSync(aside, lockPath); // fails when the path is taken again: never overwrites
      } catch {
        /* drop the copy below */
      }
    }
  } catch {
    /* unreadable: it was an unfinished lock file, drop it */
  }
  try {
    fs.rmSync(aside, { force: true });
  } catch {
    /* best effort */
  }
}

function release(ctx: StoreContext, lockPath: string, token: string) {
  const fs = fsOf(ctx);
  try {
    const held = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<LockContent>;
    if (held.token !== token) return; // taken over as stale: not ours to remove
    fs.unlinkSync(lockPath);
  } catch (error) {
    if (errnoCode(error) !== 'ENOENT') {
      logQuietly(ctx, error, 'release-record-lock', { lockPath });
    }
  }
}
