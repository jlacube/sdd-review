import type { IntakeDocument, IntakeSummary, Notice } from '../../generated/analysis-results.js';
import type { FileMode, GitAccessPort } from '../git/port.js';
import type { ContextualLog } from '../log/log.js';
import { NoticeCollector } from '../intent-sources/notices.js';
import { readSddIntentSources, type SddIntentSources } from '../intent-sources/sdd-workspace.js';
import type { SourceTree } from '../intent-sources/tree.js';
import type { ChangeFile } from './change.js';

/**
 * Intake's side of the intent source reader (C001-COMP-004 hands content to C001-COMP-005): the
 * snapshot tree holds the snapshot content of the changed files and the base-commit content of the
 * others, the base tree the base commit's content (C001-IF-007 §1 item 1, C001-REQ-116). Only the
 * files under `.sdd/` are listed; nothing is read from the working tree directly.
 */

const SDD_PREFIX = '.sdd/';
const readable = (mode: FileMode | null) => mode === 'regular' || mode === 'executable';

/** The base commit's files under `.sdd/`. */
export async function baseSourceTree(git: GitAccessPort, base: string): Promise<SourceTree> {
  const paths = (await git.treeEntries(base))
    .filter((e) => e.path.startsWith(SDD_PREFIX) && readable(e.mode))
    .map((e) => e.path)
    .sort();
  return { paths, read: (path) => git.readBlob(base, path) };
}

/**
 * The snapshot's files under `.sdd/`: the base commit's files, less the deleted and renamed-away
 * ones, plus the added, modified and renamed ones with their snapshot content. A changed file
 * without text content (binary, symbolic link, submodule) is not listed.
 */
export function snapshotSourceTree(
  git: GitAccessPort,
  base: string,
  baseTree: SourceTree,
  files: readonly ChangeFile[],
): SourceTree {
  const paths = new Set(baseTree.paths);
  const changed = new Map<string, Buffer>();
  for (const { file } of files) {
    if (file.previousPath) paths.delete(file.previousPath);
    if (!file.path.startsWith(SDD_PREFIX)) continue;
    paths.delete(file.path);
    if (file.changeType === 'deleted') continue;
    if (file.binary || file.currentContent === null || !readable(file.currentMode)) continue;
    paths.add(file.path);
    changed.set(file.path, file.currentContent);
  }
  return {
    paths: [...paths].sort(),
    read: (path) => {
      const content = changed.get(path);
      return content !== undefined ? Promise.resolve(content) : git.readBlob(base, path);
    },
  };
}

/** The intent context parts, summary parts and notices that intake writes, and the lines read. */
export interface IntakeIntentSources {
  readonly sdd: SddIntentSources;
  readonly intentContext: Pick<
    IntakeDocument['intentContext'],
    'sddChanges' | 'documentedArchitecture'
  >;
  readonly summary: Pick<IntakeSummary['intentContext'], 'sddChanges' | 'documentedArchitecture'>;
  readonly notices: Notice[];
}

/** Reads the `.sdd/` workspace of the snapshot and of the base commit (C001-REQ-111, C001-REQ-207). */
export async function readIntakeIntentSources(
  git: GitAccessPort,
  base: string,
  files: readonly ChangeFile[],
  log?: ContextualLog,
): Promise<IntakeIntentSources> {
  const baseTree = await baseSourceTree(git, base);
  const snapshot = snapshotSourceTree(git, base, baseTree, files);
  const sink = new NoticeCollector(log);
  const sdd = await readSddIntentSources({ snapshot, base: baseTree, sink });
  const documented = sdd.architecture.documented;
  return {
    sdd,
    intentContext: { sddChanges: [...sdd.sddChanges], documentedArchitecture: documented },
    summary: {
      sddChanges: sdd.sddChanges.map((change) => ({
        id: change.id,
        specItems: change.items.length,
        selected: sdd.selected?.id === change.id,
      })),
      documentedArchitecture: documented ? 'sdd-folder' : 'none',
    },
    notices: sink.notices,
  };
}
