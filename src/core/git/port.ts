/**
 * The git access port (C001-IF-012 §3), implemented by C001-COMP-003 on the installed git program
 * (C001-ADR-004). The operations are filled by C001-T-006; this file fixes their shape so that
 * the consumers (C001-COMP-002, -004, -006, -011) depend on the port and not on the adapter.
 *
 * Every operation is read-only and runs under the safety rules of C001-IF-012 §2. Errors are
 * rejected as `ReviewError` with the codes of `errors.md`; nothing is retried.
 */

export type ObjectFormat = 'sha1' | 'sha256';
export type FileMode = 'regular' | 'executable' | 'symlink' | 'submodule';

/** A repository found by `discover` (G-01). */
export interface RepositoryLocation {
  readonly workTreeRoot: string;
  readonly gitDir: string;
  readonly commonGitDir: string;
  readonly objectFormat: ObjectFormat;
}

/** G-02. */
export interface HeadInfo {
  readonly commit: string;
  /** The current branch as a full ref name, or `null` for a detached HEAD. */
  readonly branch: string | null;
}

/** G-05. */
export interface UpstreamInfo {
  readonly ref: string;
  readonly commit: string;
}

/** G-06. */
export interface CommitInfo {
  readonly hash: string;
  readonly parents: readonly string[];
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorTime: string;
  readonly message: string;
  readonly changedFiles: readonly string[];
}

export type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

/** G-07: one changed file of the base tree versus the working tree. */
export interface ChangedFile {
  readonly path: string;
  readonly previousPath: string | null;
  readonly changeType: ChangeType;
  readonly binary: boolean;
  readonly contentHash: string | null;
  readonly baseMode: FileMode | null;
  readonly currentMode: FileMode | null;
  readonly baseContent: Buffer | null;
  readonly currentContent: Buffer | null;
}

/** G-09: the commit that added or deleted a line, or `null` for "uncommitted". */
export interface LineAttribution {
  readonly added: ReadonlyArray<string | null>;
  readonly deleted: ReadonlyArray<string | null>;
}

/** G-10. */
export interface UserIdentity {
  readonly name: string | null;
  readonly email: string | null;
}

/** G-12. */
export interface WorkingState {
  readonly head: string;
  readonly differing: ReadonlyArray<{ readonly path: string; readonly contentHash: string | null }>;
}

/** G-13. */
export interface TreeEntry {
  readonly path: string;
  readonly mode: FileMode;
  readonly blob: string;
}

/** G-14. */
export interface DefaultBranch {
  readonly ref: string;
  readonly commit: string;
}

/** G-15. */
export interface IndexEntryState {
  readonly blob: string;
  readonly mode: FileMode;
  readonly upToDate: boolean;
  readonly stat: {
    readonly size: number;
    readonly mtimeSeconds: number;
    readonly mtimeNanoseconds: number;
    readonly ctimeSeconds: number;
    readonly ctimeNanoseconds: number;
    readonly inode: number;
    readonly uid: number;
    readonly gid: number;
  };
}

/** G-16. */
export type SubmoduleTree =
  | {
      readonly present: true;
      /** The submodule's local repository, usable as the parent of a nested G-16. */
      readonly location: RepositoryLocation;
      readonly commit: string;
      readonly entries: readonly TreeEntry[];
      readonly readBlob: (path: string) => Promise<Buffer | null>;
    }
  | {
      readonly present: false;
      readonly cause: 'no-local-repository' | 'commit-not-in-repository' | 'repository-refused';
      readonly gitMessage?: string;
    };

export interface GitAccessPort {
  /** G-01: ERR-INTAKE-001 outside a working tree, ERR-INTAKE-008 when git refuses it. */
  discover(directory: string): Promise<RepositoryLocation>;
  /** G-02: ERR-INTAKE-002 when HEAD resolves to no commit. */
  head(): Promise<HeadInfo>;
  /** G-03: ERR-INTAKE-003 for an unusable value. */
  resolveCommit(value: string): Promise<string>;
  /** G-04. */
  mergeBase(a: string, b: string): Promise<string | null>;
  /** G-05. */
  upstream(branch: string): Promise<UpstreamInfo | null>;
  /** G-06: oldest first, merges included. */
  commitsBetween(base: string, head: string): Promise<readonly CommitInfo[]>;
  /** G-07. */
  changeAgainst(base: string): Promise<readonly ChangedFile[]>;
  /** G-08. */
  readBlob(commit: string, path: string): Promise<Buffer | null>;
  /** G-09. */
  attributeLines(base: string, head: string, path: string): Promise<LineAttribution>;
  /** G-10. */
  userIdentity(): Promise<UserIdentity>;
  /** G-11. */
  attributes(
    commit: string,
    paths: readonly string[],
    name: string,
  ): Promise<ReadonlyMap<string, string | null>>;
  /** G-12. */
  workingState(snapshot: {
    readonly base: string;
    readonly files: readonly ChangedFile[];
  }): Promise<WorkingState>;
  /** G-13. */
  treeEntries(commit: string): Promise<readonly TreeEntry[]>;
  /** G-14. */
  defaultBranches(): Promise<readonly DefaultBranch[]>;
  /** G-15. */
  indexState(paths: readonly string[]): Promise<ReadonlyMap<string, IndexEntryState | null>>;
  /** G-16. */
  submoduleTree(parent: RepositoryLocation, path: string, commit: string): Promise<SubmoduleTree>;
}
