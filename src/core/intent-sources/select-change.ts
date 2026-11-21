import { ReviewError } from '../errors/review-error.js';
import type { WorkspaceChange } from './sdd-workspace.js';

/**
 * Selecting the SDD change whose requirements become the intents of the review (C001-IF-007 §6,
 * C001-REQ-302, C001-REQ-303, C001-REQ-304, C001-REQ-326). Only the open SDD changes of the
 * snapshot are candidates: the `.sdd/` change folders (§2; folders under `.sdd/_archive/` are never
 * change folders) and the changes of the neutral file (§5 item 3). Both stops throw before anything
 * is written, so they change nothing.
 */

const OPERATION = 'select-sdd-change';
const FOLDER_NAME = /^([0-9]{3})-[a-z0-9-]+$/;

/** The last segment of a `.sdd/` change folder, for example `042-cart` for `.sdd/042-cart`. */
function folderName(change: WorkspaceChange): string | null {
  if (change.origin !== 'sdd-folder') return null;
  const name = change.folder.slice(change.folder.lastIndexOf('/') + 1);
  return FOLDER_NAME.test(name) ? name : null;
}

/**
 * The values that name an open SDD change (§6 item 1): its ID and, for a `.sdd/` change folder, the
 * folder's three-digit number and its folder name. A value is compared as given: no path is
 * resolved, so a path-shaped value such as `../_archive/040-promo` names no change (C001-TS-355).
 */
export function namesOf(change: WorkspaceChange): string[] {
  const name = folderName(change);
  return name === null ? [change.id] : [change.id, name.slice(0, 3), name];
}

/** The open SDD changes of the snapshot, in reading order (`.sdd/` folders first, then the neutral file). */
export function openChanges(changes: readonly WorkspaceChange[]): WorkspaceChange[] {
  return changes.filter((c) => c.open);
}

const idList = (open: readonly WorkspaceChange[]) => open.map((c) => c.id).join(', ');

/** ERR-SDD-001: more than one open SDD change and none named (C001-REQ-304). */
export function severalOpenChanges(open: readonly WorkspaceChange[]): ReviewError {
  const ids = idList(open);
  return new ReviewError('ERR-SDD-001', {
    operation: OPERATION,
    inputs: { openChanges: open.map((c) => c.id) },
    params: { n: open.length, 'id list': ids },
    cause: `${open.length} open SDD changes and no --sdd-change: ${ids}`,
  });
}

/** ERR-SDD-002: the named value is not an open SDD change of the snapshot (C001-REQ-326). */
export function notAnOpenChange(
  value: string,
  open: readonly WorkspaceChange[],
  matches: readonly WorkspaceChange[] = [],
): ReviewError {
  const ids = open.length > 0 ? idList(open) : 'none';
  return new ReviewError('ERR-SDD-002', {
    operation: OPERATION,
    inputs: { sddChange: value, openChanges: open.map((c) => c.id) },
    params: { value, 'id list, or "none"': ids },
    cause:
      matches.length > 1
        ? `"${value}" names ${matches.length} open SDD changes: ${matches.map((c) => c.folder).join(', ')}`
        : `"${value}" is not the ID, folder number or folder name of an open SDD change`,
  });
}

/**
 * Selects the SDD change of the review among the readable SDD changes of the snapshot (§6).
 *
 * - With a named value: the one open SDD change that the value names; ERR-SDD-002 when it names
 *   none, including an archived change or a folder under `.sdd/_archive/`.
 * - Without one: the only open SDD change; ERR-SDD-001 when there are several; `null` when there
 *   is none, which puts the review in intent fallback.
 *
 * A value that names more than one open SDD change (two change folders with the same number, or an
 * ID equal to another change's folder name) is not settled by §6; it stops with ERR-SDD-002 rather
 * than guess (constitution principle 4; reported as a spec defect by C001-T-031).
 */
export function selectSddChange(
  changes: readonly WorkspaceChange[],
  named: string | undefined,
): WorkspaceChange | null {
  const open = openChanges(changes);
  if (named !== undefined) {
    const matches = open.filter((c) => namesOf(c).includes(named));
    if (matches.length === 1) return matches[0]!;
    throw notAnOpenChange(named, open, matches);
  }
  if (open.length > 1) throw severalOpenChanges(open);
  return open[0] ?? null;
}
