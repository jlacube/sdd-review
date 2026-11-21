import { lookupAttributeState, type AttributeFile } from './attributes.js';

/**
 * Filter attribution of C001-IF-012 §7 (C001-REQ-126 to C001-REQ-128): which paths are **under a
 * clean filter**, decided without running any filter (§2 item 2, C001-CON-13).
 *
 * A path is under a clean filter when the `filter` attribute that the `.gitattributes` files of the
 * base commit's tree give it (G-11) names a driver for which the repository's effective
 * configuration sets `filter.<driver>.clean` or `filter.<driver>.process`. No other attribute
 * source counts: not `.git/info/attributes`, not the file `core.attributesFile` names, not the
 * system-wide attributes file and not a `.gitattributes` file that the change adds or edits
 * (Q-cleanfilter-02, CR-37). A **Git LFS file** is one whose driver is `lfs`.
 */

/** The driver that Git LFS installs; its files are settled by their pointer files (§7 item 7). */
export const LFS_DRIVER = 'lfs';

/**
 * Why §7 item 3 compares a file under a clean filter by its working-tree bytes; the cause texts of
 * ERR-INTAKE-009 (`errors.md`) in `CLEAN_FILTER_CAUSE_TEXT`.
 */
export type CleanFilterCause =
  'no-matching-lfs-pointer' | 'not-up-to-date' | 'no-index-entry' | 'index-blob-missing';

export const CLEAN_FILTER_CAUSE_TEXT: Readonly<Record<CleanFilterCause, string>> = {
  'no-matching-lfs-pointer': 'content matches no Git LFS pointer file',
  'not-up-to-date': "not up to date in git's index",
  'no-index-entry': "no entry in git's index",
  'index-blob-missing': 'index blob missing',
};

/** How §7 settled a file under a clean filter that it compared by its working-tree bytes. */
export interface CleanFilterFallback {
  readonly driver: string;
  readonly cause: CleanFilterCause;
}

const NO_VALUE = '\u0000true';
const FILTER_KEY = /^filter\.(.+)\.(clean|process)$/;

/**
 * The drivers for which the effective configuration (as `config --list --null` gives it, parsed by
 * `parseConfigList`) sets a clean or process command. The last value of a key wins, as in git; an
 * empty value or a key without a value sets no command (git runs nothing for either). The driver
 * name is the configuration subsection and keeps its case.
 */
export function cleanFilterDrivers(config: ReadonlyMap<string, readonly string[]>): Set<string> {
  const drivers = new Set<string>();
  for (const [key, values] of config) {
    const m = FILTER_KEY.exec(key);
    if (!m) continue;
    const value = values[values.length - 1];
    if (value !== undefined && value !== NO_VALUE && value.trim() !== '') drivers.add(m[1]!);
  }
  return drivers;
}

/** Answers, for a path, the clean-filter driver it is under, or `null` when under none. */
export interface CleanFilterAttribution {
  driverOf(path: string): string | null;
  /** True when no path can be under a clean filter (no driver configured). */
  readonly empty: boolean;
}

/**
 * The attribution for the `.gitattributes` files of the base commit's tree (`files`, ordered from
 * the root downward, as G-11 parses them) and the effective configuration. Only a `filter=<name>`
 * value names a driver: a set, unset or unspecified `filter` attribute puts no file under one.
 */
export function cleanFilterAttribution(
  files: readonly AttributeFile[],
  config: ReadonlyMap<string, readonly string[]>,
): CleanFilterAttribution {
  const drivers = cleanFilterDrivers(config);
  const empty = drivers.size === 0 || files.length === 0;
  return {
    empty,
    driverOf(path: string): string | null {
      if (empty) return null;
      const state = lookupAttributeState(files, path, 'filter');
      return 'value' in state && drivers.has(state.value) ? state.value : null;
    },
  };
}
