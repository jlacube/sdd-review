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
import { chooseBase } from './base.js';
import { cleanFilterNotice, computeChange, fail, type ChangeFile } from './change.js';
import { cutHunks, identifyHunks } from './hunks.js';
import { hasHunks, snapshotBytes } from './classify.js';
import { measureSize, sizeWarning } from './size.js';
import { readChangeCommits } from './commits.js';
import { attributeHunks } from './attribution.js';
import type { SddIntentSources } from '../intent-sources/sdd-workspace.js';
import { namedFileSources, readIntakeIntentSources } from './intent-context.js';
import { isReviewError } from '../errors/review-error.js';
import { readNamedFiles, type NamedFileRequest } from '../intent-sources/named-files.js';

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
 * The content part of a file in the snapshot ID: the SHA-256 of the snapshot-side bytes, text or
 * binary, `null` for a deleted file. A binary file whose bytes a git port did not give (the adapter
 * always gives them, C001-T-026) is named by git's own hash of them, with a prefix that no SHA-256
 * can have, so that two contents never share an ID.
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
  /**
   * The commit the developer named (C001-REQ-102); without one, the default rules of
   * C001-REQ-103 and C001-REQ-104 choose the base commit.
   */
  readonly namedBase?: string;
  /** The pull-request text, plans and transcripts named at intake (C001-REQ-112, C001-T-030). */
  readonly namedFiles?: readonly NamedFileRequest[];
  /** The SDD change named at intake (`--sdd-change`, C001-IF-007 §6, C001-T-031). */
  readonly sddChange?: string;
}

export type IntakeResult =
  | {
      readonly status: 'created';
      readonly snapshotId: string;
      readonly intake: IntakeDocument;
      /** The `.sdd/` reading with the lines read on both sides (C001-REQ-222, C001-REQ-328). */
      readonly intentSources: SddIntentSources;
    }
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
 * Intake (C001-REQ-101 to C001-REQ-106, C001-REQ-115): chooses the base commit, takes in the change
 * against it, cuts the hunks, computes the snapshot ID and stores the snapshot document and the
 * snapshot-side content of the text files. When a snapshot with the same ID is stored already, it is
 * reported and nothing is written.
 */
export async function takeInChange(
  deps: IntakeDeps,
  options: IntakeOptions,
): Promise<IntakeResult> {
  const { git, store, log } = deps;
  const chosen = await chooseBase(git, options.namedBase, log);
  const { base, head } = chosen;
  // A named file that cannot be used stops intake before anything is written (C001-REQ-113).
  const namedFiles = await readNamedFiles(options.namedFiles ?? []).catch((error: unknown) =>
    isReviewError(error) ? fail(log, error) : Promise.reject(error),
  );
  const files = await computeChange(git, base, log);
  const snapshotId = snapshotIdOf(base, head, files);
  // The intent source reader runs before the existing-review check (architecture.md §3, "Intake
  // to architecture delta"): its stops — an invalid neutral file, several open SDD changes and
  // none named, a named SDD change that is not open — refuse a reopen as well (C001-T-031).
  const sources = await readIntakeIntentSources(git, base, files, log, options.sddChange);

  const known = (await store.listReviews()).find((r) => r.snapshotId === snapshotId);
  if (known) {
    return { status: 'existing', snapshotId, baseCommit: base, headCommit: head };
  }

  const hunks: Hunk[] = [];
  const changedFiles: ChangedFile[] = files.map((entry) => {
    const { file } = entry;
    // A binary file is listed with 0 changed lines and no hunk (C001-REQ-108).
    const cut = hasHunks(file) ? cutHunks(file.path, file.baseContent, file.currentContent) : [];
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
  // The supported size (C001-REQ-121): a warning with the measured counts; the whole change is
  // still taken in and analysed (C001-REQ-122).
  const size = measureSize(changedFiles);
  const { changedLines } = size;
  const warning = sizeWarning(size, log, { base, head });
  // Files under a clean filter compared by their working-tree bytes (C001-REQ-126, C001-T-028).
  const cleanFilter = cleanFilterNotice(files, log, { base, head });
  const baseCommit = await commitRef(git, base);
  const commits = await readChangeCommits(git, base, head); // C001-T-027
  const attributed = await attributeHunks(git, { base, head, commits, files, hunks }, log);
  const createdAt = (deps.now?.() ?? new Date()).toISOString();

  const snapshot: Snapshot = {
    snapshotId,
    baseCommit,
    baseChoice: chosen.baseChoice,
    namedValue: chosen.namedValue,
    baseRef: chosen.baseRef,
    headCommit: head,
    changedFiles: changedFiles as Snapshot['changedFiles'],
    changedLines,
    sizeWarning: size.exceeded,
    configurationSource: { default: true }, // C001-T-035
    createdAt,
  } as Snapshot;
  const intake: IntakeDocument = {
    document: 'intake',
    formatVersion: 1,
    snapshot,
    hunks: attributed,
    intakeSummary: {
      baseCommit,
      baseChoice: chosen.baseChoice,
      baseRef: chosen.baseRef,
      changedFiles: changedFiles.length,
      changedLines,
      // The intent context is read by C001-T-029 to C001-T-033.
      intentContext: {
        ...sources.summary,
        commits: commits.length,
        namedFiles: namedFiles.map(({ role, path }) => ({ role, path })),
      },
      sizeWarning: warning,
    },
    intentContext: {
      ...sources.intentContext,
      commits,
      namedFiles,
      ...namedFileSources(namedFiles, files), // C001-T-032
    },
    notices: [...(cleanFilter ? [cleanFilter] : []), ...sources.notices],
  };

  // The snapshot-side content of every changed text and binary file (domain model §2.2).
  const contents = files.flatMap((entry) => {
    const bytes = entry.contentSha256 !== null ? snapshotBytes(entry.file) : null;
    return bytes ? [bytes] : [];
  });
  await store.createSnapshot(intake, contents, deps.repositoryRoot);
  return { status: 'created', snapshotId, intake, intentSources: sources.sdd };
}
