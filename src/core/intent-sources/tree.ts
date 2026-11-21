/**
 * The content the reader works on (C001-IF-007 §1 item 1). The intent source reader depends on no
 * other component (architecture, C001-COMP-005): intake hands it one tree for the snapshot (snapshot
 * content for changed files, base-commit content for the others) and one for the base commit.
 */
export interface SourceTree {
  /** Repository-relative, `/`-separated paths of the regular files of the tree. */
  readonly paths: readonly string[];
  /** The bytes of a file of `paths`; `null` when it cannot be read. */
  read(path: string): Promise<Uint8Array | null>;
}

/** The lines of one file from which an item is read (C001-IF-007 §3 and §4 "Lines read"). */
export interface LinesRead {
  readonly path: string;
  /** 1-based line numbers, ascending, each once. */
  readonly lines: readonly number[];
}

/** Lines read in the snapshot and at the base commit; `null` where the item is not read. */
export interface LinesOnBothSides {
  readonly snapshot: LinesRead | null;
  readonly base: LinesRead | null;
}

/** A tree over an in-memory map of path to content (tests, and content already at hand). */
export function treeOf(files: Readonly<Record<string, string | Uint8Array>>): SourceTree {
  const paths = Object.keys(files).sort();
  return {
    paths,
    read: (path) => {
      const value = files[path];
      if (value === undefined) return Promise.resolve(null);
      return Promise.resolve(typeof value === 'string' ? Buffer.from(value, 'utf8') : value);
    },
  };
}

/** Merges line lists of one file into one ascending list without repeats. */
export function mergeLines(path: string, ...lists: ReadonlyArray<readonly number[]>): LinesRead {
  return { path, lines: [...new Set(lists.flat())].sort((a, b) => a - b) };
}
