/**
 * Causes of an incomplete observation (C001-IF-013 §9 item 4, C001-ADR-006 §9 table) and the
 * summary of the parts not observed during one run, as ERR-EVID-010 needs it: each cause apart,
 * per part either the whole part or the top-most paths not observed (a directory stands for
 * everything below it).
 */

/** The two parts of the observed scope (C001-IF-013 §9 item 3). */
export type ObservedPart = 'working-tree' | 'repository';

export type IncompleteCause =
  'not-readable' | 'watch-limit' | 'events-lost' | 'observation-interrupted';

/** Report order of the causes: the order of C001-IF-013 §9 item 4. */
export const CAUSE_ORDER: readonly IncompleteCause[] = [
  'not-readable',
  'watch-limit',
  'events-lost',
  'observation-interrupted',
];

const CAUSE_NAMES: Readonly<Record<IncompleteCause, string>> = {
  'not-readable': 'not readable',
  'watch-limit': 'watch limit',
  'events-lost': 'events lost',
  'observation-interrupted': 'observation interrupted',
};

/** The name a notice gives the cause (C001-IF-013 §9 item 4, ERR-EVID-010). */
export const causeName = (cause: IncompleteCause): string => CAUSE_NAMES[cause];

/** One part of the scope not observed, as the mechanism reports it. */
export interface Gap {
  readonly cause: IncompleteCause;
  readonly part: ObservedPart;
  /**
   * The top-most path not observed, relative to its part with `/` separators; null for the whole
   * part (an event loss that cannot be placed, an interrupted observation, an unreadable root).
   */
  readonly path: string | null;
  /** What the mechanism reported, for the log (errno, flag). */
  readonly detail: string;
}

export interface IncompletePart {
  readonly part: ObservedPart;
  /** True when the whole part was not observed for this cause; `paths` is then empty. */
  readonly whole: boolean;
  /** Number of top-most paths not observed (0 when `whole`). */
  readonly count: number;
  /** Every top-most path not observed, sorted; a notice shows up to 10 of them. */
  readonly paths: readonly string[];
}

export interface IncompleteCauseReport {
  readonly cause: IncompleteCause;
  readonly name: string;
  readonly parts: readonly IncompletePart[];
}

const PART_ORDER: readonly ObservedPart[] = ['working-tree', 'repository'];

/** True when `path` is `ancestor` or lies below it. */
export function isAtOrBelow(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

/** Keeps the top-most paths: a path below another path of the set is dropped. */
export function topMost(paths: Iterable<string>): string[] {
  const sorted = [...new Set(paths)].sort();
  const out: string[] = [];
  for (const p of sorted) {
    // Sorted order puts an ancestor before its descendants, though not always directly
    // ("a" < "a-b" < "a/c"), so every kept path is checked.
    if (!out.some((kept) => isAtOrBelow(p, kept))) out.push(p);
  }
  return out;
}

/**
 * Summarises the gaps of one run: each cause apart, in the order of §9 item 4; per part the
 * whole part, or the top-most paths. A whole-part gap of a cause covers that cause's paths in the
 * same part; different causes never merge.
 */
export function summariseGaps(gaps: Iterable<Gap>): IncompleteCauseReport[] {
  const byCause = new Map<
    IncompleteCause,
    Map<ObservedPart, { whole: boolean; paths: string[] }>
  >();
  for (const gap of gaps) {
    let parts = byCause.get(gap.cause);
    if (!parts) byCause.set(gap.cause, (parts = new Map()));
    let entry = parts.get(gap.part);
    if (!entry) parts.set(gap.part, (entry = { whole: false, paths: [] }));
    if (gap.path === null || gap.path === '') entry.whole = true;
    else entry.paths.push(gap.path);
  }
  const out: IncompleteCauseReport[] = [];
  for (const cause of CAUSE_ORDER) {
    const parts = byCause.get(cause);
    if (!parts) continue;
    const list: IncompletePart[] = [];
    for (const part of PART_ORDER) {
      const entry = parts.get(part);
      if (!entry) continue;
      if (entry.whole) list.push({ part, whole: true, count: 0, paths: [] });
      else {
        const paths = topMost(entry.paths);
        list.push({ part, whole: false, count: paths.length, paths });
      }
    }
    out.push({ cause, name: causeName(cause), parts: list });
  }
  return out;
}

/**
 * The cause for an error of adding a watch or listing a directory (C001-ADR-006 §9 table), by
 * errno name. null: the directory no longer exists, which its parent reports as a removal.
 */
export function causeOfWatchError(code: string | undefined): IncompleteCause | null {
  switch (code) {
    case 'ENOENT':
    case 'ENOTDIR':
      return null;
    case 'ENOSPC':
      return 'watch-limit';
    default:
      // EACCES and EPERM above all; any other refusal also leaves the directory unobserved.
      return 'not-readable';
  }
}

/** The cause for an error of creating the notification instance itself. */
export function causeOfInitError(code: string | undefined): IncompleteCause {
  return code === 'EMFILE' ? 'watch-limit' : 'observation-interrupted';
}

/**
 * `statfs` file-system types that notify local changes only (C001-ADR-006 §9, "not readable"):
 * a change made by another machine, or on the Windows side of a 9p share, raises no event.
 * Values from `linux/magic.h`.
 */
export const LOCAL_ONLY_FILE_SYSTEMS: ReadonlyMap<number, string> = new Map([
  [0x6969, 'nfs'],
  [0x517b, 'smb'],
  [0xff534d42, 'cifs'],
  [0xfe534d42, 'smb2'],
  [0x65735546, 'fuse'],
  [0x01021997, '9p'],
]);
