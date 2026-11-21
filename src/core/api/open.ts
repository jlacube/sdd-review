import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ReviewError } from '../errors/review-error.js';
import { GitAdapter } from '../git/operations.js';
import { ContextualLog } from '../log/log.js';
import { PROVIDER_ADAPTERS } from '../model/adapters/index.js';
import { CloudUseAnnouncer, type CloudUseListener } from '../model/announce.js';
import { createEgressPolicy } from '../model/egress.js';
import { createKeySource } from '../model/keys/key-source.js';
import { layoutFor } from '../store/root.js';
import { SnapshotStore } from '../store/snapshots.js';
import { createCore, type Core } from './index.js';

export { cloudAnnouncement, type CloudUseEvent } from '../model/announce.js';

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
  /**
   * Receives the cloud-use event of C001-IF-010 §6 check 5, once per cloud provider, right before
   * the first request of this core to it (C001-REQ-808): the CLI prints `cloudAnnouncement(event)`.
   */
  readonly onCloudUse?: CloudUseListener;
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
    // One cloud-use state per opened core, that is per CLI process (§6 check 5).
    const cloudUse = new CloudUseAnnouncer();
    if (options.onCloudUse) cloudUse.subscribe(options.onCloudUse);
    const core = createCore({
      git,
      store: new SnapshotStore(ctx, layout),
      ctx,
      repositoryRoot: location.workTreeRoot,
      // The model gateway's parts (C001-IF-010): provider keys from the developer's environment or
      // credential store (§7, C001-T-086); the adapters (§4, §5, C001-T-087); the egress policy of
      // §6 checks 2 and 3, endpoint locality and cloud opt-in, which is what lets a request leave
      // (C001-T-088); the cloud-use state of check 5. Check 4, the model-excluded paths, is run by
      // the gateway itself before every request.
      model: {
        keys: createKeySource({ env }),
        adapters: PROVIDER_ADAPTERS,
        egress: createEgressPolicy(),
        cloudUse,
      },
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
