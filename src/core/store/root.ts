import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ReviewError } from '../errors/review-error.js';
import { fsOf, type StoreContext } from './fsutil.js';

/**
 * Store root per operating system (C001-ADR-005 item 1). Tests isolate the store by setting
 * LOCALAPPDATA (Windows) or XDG_DATA_HOME (Linux), or by passing `home` (macOS, and the Linux
 * fallback); there is no option in C001-IF-001.
 */
export function storeRoot(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  // The home folder comes from the environment given (HOME on macOS and Linux), so a caller that
  // passes an environment gets the same store as a process started with it; os.homedir() reads
  // only the current process's own HOME.
  home: string = (platform !== 'win32' && env.HOME) || homedir(),
): string {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA;
    return join(local && local.length > 0 ? local : join(home, 'AppData', 'Local'), 'sdd-review');
  }
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'sdd-review');
  }
  const xdg = env.XDG_DATA_HOME;
  return join(xdg && xdg.length > 0 ? xdg : join(home, '.local', 'share'), 'sdd-review');
}

/**
 * Repository key (C001-ADR-005 item 2): SHA-256 of the canonical path of the common git
 * directory, absolute, symbolic links resolved, in the letter case the file system reports
 * (`realpath.native`), as UTF-8. Two spellings of one path give one key.
 */
export function repositoryKey(commonGitDir: string): string {
  const canonical = realpathSync.native(resolve(commonGitDir));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

const SNAPSHOT_ID = /^s-[0-9a-f]{64}$/;

/** The paths of the store layout of architecture §4.1 for one repository. */
export class StoreLayout {
  readonly repositoryDir: string;

  constructor(
    readonly root: string,
    readonly key: string,
  ) {
    this.repositoryDir = join(root, key);
  }

  get reviewsIndexFile(): string {
    return join(this.repositoryDir, 'reviews.json');
  }

  snapshotDir(snapshotId: string): string {
    if (!SNAPSHOT_ID.test(snapshotId)) {
      // A snapshot ID names a folder: anything else could leave the store.
      throw new ReviewError('ERR-STORE-004', {
        operation: 'resolve-snapshot-folder',
        inputs: { snapshotId },
        params: { value: snapshotId },
      });
    }
    return join(this.repositoryDir, snapshotId);
  }
}

/** Layout of the repository whose common git directory is given. */
export function layoutFor(commonGitDir: string, env?: NodeJS.ProcessEnv): StoreLayout {
  return new StoreLayout(storeRoot(env), repositoryKey(commonGitDir));
}

/**
 * Creates `dir` and every missing directory above it with owner-only permissions (0700) on macOS
 * and Linux; on Windows the inherited access rules of the per-user folder apply
 * (C001-ADR-005 item 3).
 */
export function ensurePrivateDir(ctx: StoreContext, dir: string): void {
  const fs = fsOf(ctx);
  const missing: string[] = [];
  for (let at = resolve(dir); !fs.existsSync(at);) {
    missing.push(at);
    const parent = resolve(at, '..');
    if (parent === at) break;
    at = parent;
  }
  for (const path of missing.reverse()) {
    try {
      fs.mkdirSync(path, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      continue;
    }
    // umask can only remove bits, but chmod makes the intent explicit and checkable.
    if ((ctx.platform ?? process.platform) !== 'win32') fs.chmodSync(path, 0o700);
  }
}
