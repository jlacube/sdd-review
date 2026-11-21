import type {
  ChangedFile as SnapshotFile,
  IntakeDocument,
} from '../../generated/analysis-results.js';
import type { components } from '../../generated/openapi.js';
import { ReviewError } from '../errors/review-error.js';
import type {
  ChangedFile as PortFile,
  FileMode,
  GitAccessPort,
  ObjectFormat,
  WorkingState,
} from '../git/port.js';
import { hashBlob } from '../git/worktree-compare.js';
import type { ContextualLog } from '../log/log.js';

export type MovedOnNotice = components['schemas']['MovedOnNotice'];

/**
 * The moved-on check (C001-REQ-117, C001-IF-012 G-12, C001-T-033): compares HEAD and the working
 * tree with the snapshot under review and, when they no longer match, gives the moved-on notice
 * ERR-INTAKE-007 naming every file that differs from the snapshot and whether HEAD moved.
 *
 * G-12 compares the current state file by file with the snapshot's side of each changed file by
 * the git blob hash of that side's content. The snapshot stores that content by its SHA-256 (domain
 * model §2.2), so the blob hash is computed once per process from the stored bytes, in the object
 * format of the repository. The adapter keeps the hashes of unchanged working-tree files between
 * checks of one process (C001-IF-012 §8 item 3), so a check before each recorded action reads only
 * the files edited since they were last hashed (§5).
 */

export interface MovedOnDeps {
  readonly git: Pick<GitAccessPort, 'workingState'>;
  /** The stored snapshot-side bytes of a file, named by their SHA-256. */
  readonly readContent: (snapshotId: string, sha256: string) => Promise<Buffer>;
  /** The object format of the repository, for the blob hashes of the stored content. */
  readonly objectFormat: () => Promise<ObjectFormat>;
  readonly log?: ContextualLog;
}

function portMode(mode: SnapshotFile['mode']): FileMode | null {
  if (mode === 'symbolic-link') return 'symlink';
  return mode === 'regular' || mode === 'executable' ? mode : null;
}

/**
 * The snapshot's changed files as G-12 takes them: path, previous path, and the blob hash and mode
 * of the snapshot side (`null` for a deleted file). Only these fields are compared.
 */
export async function snapshotSides(
  intake: IntakeDocument,
  readContent: MovedOnDeps['readContent'],
  format: ObjectFormat,
): Promise<PortFile[]> {
  const files: PortFile[] = [];
  for (const file of intake.snapshot.changedFiles) {
    const deleted = file.changeType === 'deleted' || !file.contentHash;
    const blob = deleted
      ? null
      : hashBlob(await readContent(intake.snapshot.snapshotId, file.contentHash!), format);
    files.push({
      path: file.path,
      previousPath: file.oldPath ?? null,
      changeType: file.changeType,
      binary: file.binary,
      contentHash: blob,
      baseMode: null,
      currentMode: deleted ? null : portMode(file.mode),
      baseContent: null,
      currentContent: null,
    });
  }
  return files;
}

/**
 * The notice of C001-REQ-117 from the result of G-12, or `null` when the working tree and HEAD
 * match the snapshot. The message is the catalogue's, with its optional HEAD part only when HEAD
 * moved; the notice is logged (NFR-D-04).
 */
export function movedOnNoticeOf(
  intake: IntakeDocument,
  state: WorkingState,
  log?: ContextualLog,
): MovedOnNotice | null {
  const { snapshotId, headCommit } = intake.snapshot;
  const filesDiffering = state.differing.map((d) => d.path);
  const headMoved = state.head !== headCommit;
  if (filesDiffering.length === 0 && !headMoved) return null;
  const list = filesDiffering.length > 0 ? filesDiffering.join(', ') : 'none';
  const error = new ReviewError('ERR-INTAKE-007', {
    operation: 'moved-on-check',
    inputs: { snapshotId, filesDiffering, headCommit, currentHead: state.head },
    params: { 'snapshot-id': snapshotId, n: filesDiffering.length, list },
    cause: 'the working tree or HEAD no longer matches the snapshot',
  });
  const headPart = headMoved ? `; HEAD moved from ${headCommit} to ${state.head}` : '';
  error.message =
    `The working tree has moved on since snapshot ${snapshotId}: ` +
    `${filesDiffering.length} files differ (${list})${headPart}. ` +
    'This review still shows the snapshot.';
  try {
    log?.recordError(error, 'moved-on-check');
  } catch {
    /* a failing log never hides the notice */
  }
  return {
    filesDiffering,
    headMoved,
    ...(headMoved ? { currentHead: state.head } : {}),
    notice: { code: error.code, message: error.message, count: filesDiffering.length },
  };
}

/**
 * Runs the moved-on check of one snapshot. The snapshot sides are computed once per snapshot and
 * kept by the caller through `sides`.
 */
export async function checkMovedOn(
  deps: MovedOnDeps,
  intake: IntakeDocument,
  sides: () => Promise<PortFile[]>,
): Promise<MovedOnNotice | null> {
  const state = await deps.git.workingState({
    base: intake.snapshot.baseCommit.hash,
    files: await sides(),
  });
  return movedOnNoticeOf(intake, state, deps.log);
}

/** Keeps the snapshot sides of each snapshot for the life of the process. */
export class MovedOnChecker {
  private readonly sides = new Map<string, Promise<PortFile[]>>();
  private readonly last = new Map<string, MovedOnNotice | null>();

  constructor(private readonly deps: MovedOnDeps) {}

  async check(intake: IntakeDocument): Promise<MovedOnNotice | null> {
    const { snapshotId } = intake.snapshot;
    const notice = await checkMovedOn(this.deps, intake, () => {
      let kept = this.sides.get(snapshotId);
      if (!kept) {
        kept = this.deps
          .objectFormat()
          .then((format) => snapshotSides(intake, this.deps.readContent, format));
        kept.catch(() => this.sides.delete(snapshotId));
        this.sides.set(snapshotId, kept);
      }
      return kept;
    });
    this.last.set(snapshotId, notice);
    return notice;
  }

  /** The result of the last check of the snapshot in this process; `null` when none ran. */
  lastResult(snapshotId: string): MovedOnNotice | null {
    return this.last.get(snapshotId) ?? null;
  }
}
