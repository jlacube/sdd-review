import { createHash } from 'node:crypto';
import type {
  ChangedFile,
  CommitRef,
  Hunk,
  IntakeDocument,
  Snapshot,
} from '../../generated/analysis-results.js';
import type { FileMode, GitAccessPort } from '../git/port.js';
import type { ContextualLog } from '../log/log.js';
import type { SnapshotStore } from '../store/snapshots.js';
import { computeChange, resolveNamedBase, type ChangeFile } from './change.js';
import { cutHunks, identifyHunks } from './hunks.js';

/** JSON with object keys in code-unit order and no white space: one text per value. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The content part of a file in the snapshot ID: the SHA-256 of the snapshot-side bytes, `null` for
 * a deleted file. A binary file, whose bytes the review does not keep, is named by git's own hash of
 * them with a prefix that no SHA-256 can have.
 */
function idContent(entry: ChangeFile): string | null {
  if (entry.contentSha256 !== null) return entry.contentSha256;
  if (entry.file.binary && entry.file.contentHash !== null) {
    return `git-blob:${entry.file.contentHash}`;
  }
  return null;
}

/**
 * Snapshot ID (domain model §3, C001-REQ-115): `s-` and the hex SHA-256 of the canonical JSON of the
 * base hash, the HEAD hash and the changed files sorted by path, each as path, previous path,
 * change type and content hash. Only content enters: no time stamp, no mode, no directory, so the
 * same repository state gives the same ID on every run and every machine.
 */
export function snapshotIdOf(base: string, head: string, files: readonly ChangeFile[]): string {
  const sorted = [...files].sort((a, b) => (a.file.path < b.file.path ? -1 : 1));
  const text = canonicalJson({
    base,
    head,
    files: sorted.map((entry) => ({
      path: entry.file.path,
      previousPath: entry.file.previousPath,
      changeType: entry.file.changeType,
      contentHash: idContent(entry),
    })),
  });
  return `s-${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function modeOf(mode: FileMode | null): ChangedFile['mode'] {
  if (mode === 'symlink') return 'symbolic-link';
  // The schema has no value for a submodule entry (C001-T-028 and C001-T-016 meet submodules).
  return mode === 'regular' || mode === 'executable' ? mode : null;
}

/** What the orchestrator gives intake besides the git port and the store. */
export interface IntakeDeps {
  readonly git: GitAccessPort;
  readonly store: SnapshotStore;
  readonly log: ContextualLog;
  /** The working-tree root of the repository, for the record header. */
  readonly repositoryRoot: string;
  readonly now?: () => Date;
}

export interface IntakeOptions {
  /** The commit the developer named (C001-REQ-102). */
  readonly namedBase: string;
}

export type IntakeResult =
  | { readonly status: 'created'; readonly snapshotId: string; readonly intake: IntakeDocument }
  | {
      /** The snapshot exists already: the orchestrator reopens it (C001-T-034); nothing was written. */
      readonly status: 'existing';
      readonly snapshotId: string;
      readonly baseCommit: string;
      readonly headCommit: string;
    };

/** The subject of the base commit, `''` when the port cannot give it (a root commit). */
async function commitRef(git: GitAccessPort, hash: string): Promise<CommitRef> {
  let subject = '';
  try {
    const commits = await git.commitsBetween(`${hash}^`, hash);
    const own = commits.find((c) => c.hash === hash);
    subject = own ? (own.message.split('\n', 1)[0] ?? '') : '';
  } catch {
    /* a root commit has no parent to start the range at */
  }
  return { hash, subject } as CommitRef;
}

/**
 * Intake (C001-REQ-101, C001-REQ-102, C001-REQ-115): takes in the change against the named base
 * commit, cuts the hunks, computes the snapshot ID and stores the snapshot document and the
 * snapshot-side content of the text files. When a snapshot with the same ID is stored already, it is
 * reported and nothing is written.
 */
export async function takeInChange(
  deps: IntakeDeps,
  options: IntakeOptions,
): Promise<IntakeResult> {
  const { git, store, log } = deps;
  const { base, head } = await resolveNamedBase(git, options.namedBase, log);
  const files = await computeChange(git, base, log);
  const snapshotId = snapshotIdOf(base, head, files);

  const known = (await store.listReviews()).find((r) => r.snapshotId === snapshotId);
  if (known) {
    return { status: 'existing', snapshotId, baseCommit: base, headCommit: head };
  }

  const hunks: Hunk[] = [];
  const changedFiles: ChangedFile[] = files.map((entry) => {
    const { file } = entry;
    const cut = file.binary ? [] : cutHunks(file.path, file.baseContent, file.currentContent);
    const identified = identifyHunks(snapshotId, cut);
    hunks.push(...identified);
    return {
      path: file.path,
      oldPath: file.previousPath,
      changeType: file.changeType,
      binary: file.binary,
      ecosystem: 'other', // C001-T-036 assigns the ecosystem
      contentHash: entry.contentSha256,
      mode: modeOf(file.currentMode),
      changedLines: identified.reduce((sum, hunk) => sum + hunk.changedLines, 0),
      componentId: 'undocumented', // C001-T-039 places the file in a component
      hunkIds: identified.map((hunk) => hunk.hunkId),
    } as ChangedFile;
  });
  const changedLines = changedFiles.reduce((sum, file) => sum + file.changedLines, 0);
  const baseCommit = await commitRef(git, base);
  const createdAt = (deps.now?.() ?? new Date()).toISOString();

  const snapshot: Snapshot = {
    snapshotId,
    baseCommit,
    baseChoice: 'named',
    namedValue: options.namedBase,
    baseRef: null,
    headCommit: head,
    changedFiles: changedFiles as Snapshot['changedFiles'],
    changedLines,
    sizeWarning: false, // C001-T-026
    configurationSource: { default: true }, // C001-T-035
    createdAt,
  } as Snapshot;
  const intake: IntakeDocument = {
    document: 'intake',
    formatVersion: 1,
    snapshot,
    hunks,
    intakeSummary: {
      baseCommit,
      baseChoice: 'named',
      baseRef: null,
      changedFiles: changedFiles.length,
      changedLines,
      // The intent context is read by C001-T-029 to C001-T-033.
      intentContext: {
        sddChanges: [],
        commits: 0,
        namedFiles: [],
        documentedArchitecture: 'none',
      },
      sizeWarning: null,
    },
    intentContext: {
      sddChanges: [],
      documentedArchitecture: null,
      commits: [],
      namedFiles: [],
      planItems: [],
      recordedRuns: [],
    },
    notices: [],
  };

  const contents = files.flatMap((entry) =>
    entry.contentSha256 !== null && entry.file.currentContent ? [entry.file.currentContent] : [],
  );
  await store.createSnapshot(intake, contents, deps.repositoryRoot);
  return { status: 'created', snapshotId, intake };
}
