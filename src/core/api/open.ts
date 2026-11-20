import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ReviewError } from '../errors/review-error.js';
import { GitAdapter } from '../git/operations.js';
import { ContextualLog } from '../log/log.js';
import { layoutFor } from '../store/root.js';
import { SnapshotStore } from '../store/snapshots.js';
import { createCore, type Core } from './index.js';

/** A core bound to one repository, with the git program and review state store of the machine. */
export interface OpenedCore {
  readonly core: Core;
  /** The working-tree root git found for the directory. */
  readonly repositoryRoot: string;
  /** The per-repository log (NFR-D-04). */
  readonly log: ContextualLog;
  /** Ends the running events and the git processes. */
  close(): Promise<void>;
}

export interface OpenCoreOptions {
  /** The developer's environment; default `process.env`. Tests isolate the store through it. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Finds the repository of `directory` and binds the core API to it. The git program check
 * (C001-IF-012 §6) runs first, so ERR-INTAKE-008 comes before any other git read; then
 * ERR-INTAKE-001 when the directory is outside every working tree.
 */
export async function openCore(
  directory: string,
  options: OpenCoreOptions = {},
): Promise<OpenedCore> {
  const env = options.env ?? process.env;
  const from = resolve(directory);
  let isDirectory = false;
  try {
    isDirectory = statSync(from).isDirectory();
  } catch {
    /* not there: the same refusal as a directory outside every working tree */
  }
  if (!isDirectory) {
    throw new ReviewError('ERR-INTAKE-001', {
      operation: 'discover',
      inputs: { directory },
      params: { directory },
    });
  }
  const git = new GitAdapter({ baseEnv: env });
  try {
    const location = await git.discover(from);
    const layout = layoutFor(location.commonGitDir, env);
    const log = new ContextualLog(join(layout.repositoryDir, 'log.jsonl'));
    const ctx = { log };
    const core = createCore({
      git,
      store: new SnapshotStore(ctx, layout),
      ctx,
      repositoryRoot: location.workTreeRoot,
    });
    return {
      core,
      repositoryRoot: location.workTreeRoot,
      log,
      close: async () => {
        await core.close();
        await git.close();
      },
    };
  } catch (error) {
    await git.close();
    throw error;
  }
}
