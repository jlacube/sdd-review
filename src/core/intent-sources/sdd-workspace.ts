import type { SddChange, SpecItem } from '../../generated/analysis-results.js';
import { readSddArchitecture, type ArchitectureReading } from './architecture.js';
import {
  asMapping,
  readFrontmatter,
  scalarText,
  textList,
  type Frontmatter,
  type YamlValue,
} from './frontmatter.js';
import type { EntryKind, NoticeSink } from './notices.js';
import {
  blockText,
  decodeText,
  fencedLines,
  fenceOf,
  headingOf,
  idAndTitle,
  lineRange,
  splitLines,
  textHash,
} from './text.js';
import type { NeutralReading } from './neutral-file.js';
import { selectSddChange } from './select-change.js';
import { FileMentions } from './mentions.js';
import { type LinesOnBothSides, type LinesRead, type SourceTree } from './tree.js';

/**
 * The `.sdd/` workspace of a tree (C001-IF-007 §2 and §3): its SDD changes with their phases, the
 * spec items of each change and the lines each item is read from. Read on the snapshot with
 * notices for unreadable entries (C001-REQ-111, C001-REQ-123), and on the base commit, silently,
 * only for the lines read there (C001-REQ-328).
 */

const CHANGE_FOLDER = /^[0-9]{3}-[a-z0-9-]+$/;
const REQ_ID = /^C[0-9]{3}-REQ-[0-9]{3,}$/;
const AC_ID = /^C[0-9]{3}-AC-[0-9]{3,}\.[0-9]+$/;
const TS_ID = /^C[0-9]{3}-TS-[0-9]{3,}$/;
const LITE_TASK_ID = /^C[0-9]{3}-T-[0-9]{3,}$/;
const REQ_SHAPE = /^C[0-9]+-REQ-/;
const AC_SHAPE = /^C[0-9]+-AC-/;
const TS_SHAPE = /^C[0-9]+-TS-/;
const SCENARIO_LINE = /^\s*Scenario(?: Outline)?:[ \t]*(.*)$/;
const REQ_MENTION = /C[0-9]{3}-REQ-[0-9]{3,}/g;

/** One SDD change of a `.sdd/` workspace. */
export interface WorkspaceChange {
  /** The `id` of the frontmatter of `change.md`, for example `CHG-042` (§2 item 3). */
  readonly id: string;
  readonly title: string;
  /** Where the change is read from: a `.sdd/` change folder or the neutral file (§5). */
  readonly origin: 'sdd-folder' | 'neutral-file';
  /** The change folder, for example `.sdd/042-cart`; for the neutral file, its path. */
  readonly folder: string;
  readonly status: string | null;
  /** `full`, `lite` or `null` when `change.md` does not say. */
  readonly profile: string | null;
  /** The current phase of the change, and the status of each phase (`change.md`). */
  readonly phase: string | null;
  readonly phases: Readonly<Record<string, string | null>>;
  /** Open unless its status is `archived` (§2 item 4). */
  readonly open: boolean;
  /** Spec items in reading order; IDs are unique within the change. */
  readonly items: readonly SpecItem[];
  /** The lines each item is read from, by item ID. */
  readonly linesRead: ReadonlyMap<string, LinesRead>;
}

export interface WorkspaceReading {
  /** The tree holds a `.sdd/` workspace: a `.sdd/` folder with at least one change folder (§2 item 1). */
  readonly present: boolean;
  /** The readable SDD changes, in folder-name order. */
  readonly changes: readonly WorkspaceChange[];
}

const ORIGIN = 'sdd-folder' as const;

async function readLines(tree: SourceTree, path: string): Promise<string[] | null> {
  const bytes = await tree.read(path);
  return bytes === null ? null : splitLines(decodeText(bytes));
}

/** The ERR-SDD-005 line and reason of a frontmatter that yields no ID, or `null` when it has one. */
function frontmatterFault(fm: Frontmatter): { line: number; reason: string } | null {
  switch (fm.kind) {
    case 'none':
      return { line: 1, reason: 'file has no YAML frontmatter' };
    case 'unclosed':
      return { line: 1, reason: 'frontmatter is not closed by a "---" line' };
    case 'invalid':
      return { line: fm.line, reason: `frontmatter is not YAML (${fm.message})` };
    case 'ok':
      return scalarText(asMapping(fm.data)?.id) === null
        ? { line: 1, reason: 'frontmatter has no ID' }
        : null;
  }
}

/** One item found in a file, before the change-wide duplicate check. */
interface FoundItem {
  readonly kind: EntryKind;
  readonly item: SpecItem;
  readonly lines: readonly number[];
}

function specItem(
  id: string,
  kind: SpecItem['kind'],
  title: string,
  text: string,
  links: SpecItem['links'],
  path: string,
  line: number,
): SpecItem {
  return {
    id,
    kind,
    title,
    text,
    textHash: textHash(text),
    links,
    // The changed files a task names are found by the mention rules of §10 (`withTaskFiles`).
    files: [],
    location: { path, line },
  } as SpecItem;
}

interface MarkdownKinds {
  readonly requirements: boolean;
  readonly acceptance: boolean;
  readonly liteTasks: boolean;
}

/** The end (1-based, inclusive) of a section that starts at heading line `start`. */
function sectionEnd(
  headings: ReadonlyArray<{ index: number; level: number }>,
  start: number,
  maxLevel: number,
  total: number,
): number {
  const next = headings.find((h) => h.index > start && h.level <= maxLevel);
  return next ? next.index - 1 : total;
}

/**
 * The spec items of one Markdown file of §3: requirements (`###`), acceptance criteria (`####`),
 * scenarios (in fenced `gherkin` blocks) and lite tasks (`###`). Headings in fenced blocks do not
 * count.
 */
function markdownItems(
  lines: readonly string[],
  path: string,
  kinds: MarkdownKinds,
  sink: NoticeSink | null,
): FoundItem[] {
  const fenced = fencedLines(lines);
  const headings = lines.flatMap((line, i) => {
    if (fenced[i]) return [];
    const h = headingOf(line);
    return h ? [{ index: i + 1, level: h.level, text: h.text }] : [];
  });
  const found: FoundItem[] = [];
  const skip = (kind: EntryKind, line: number, reason: string) =>
    sink?.skipped(kind, path, line, reason);
  const slice = (from: number, to: number) => lines.slice(from - 1, to);

  // Valid acceptance criteria by heading line: the criterion a scenario below it is linked to.
  const criterionAt = new Map<number, string>();

  for (const h of headings) {
    const { token, title } = idAndTitle(h.text);
    if (h.level === 3 && kinds.requirements && REQ_SHAPE.test(token)) {
      if (!REQ_ID.test(token)) {
        skip('requirement', h.index, `ID "${token}" does not match ${REQ_ID.source}`);
      } else if (title === null) {
        skip('requirement', h.index, 'heading lacks the " — <title>" part');
      } else {
        const end = sectionEnd(headings, h.index, 3, lines.length);
        const text = blockText(slice(h.index + 1, end));
        found.push({
          kind: 'requirement',
          item: specItem(token, 'requirement', title, text, [], path, h.index),
          lines: lineRange(h.index, end),
        });
      }
    } else if (h.level === 4 && kinds.acceptance && AC_SHAPE.test(token)) {
      if (!AC_ID.test(token)) {
        skip('acceptance criterion', h.index, `ID "${token}" does not match ${AC_ID.source}`);
      } else if (title === null) {
        skip('acceptance criterion', h.index, 'heading lacks the " — <title>" part');
      } else {
        const end = sectionEnd(headings, h.index, 4, lines.length);
        const text = blockText(slice(h.index + 1, end));
        const requirement = token.replace(/-AC-([0-9]+)\.[0-9]+$/, '-REQ-$1');
        criterionAt.set(h.index, token);
        found.push({
          kind: 'acceptance criterion',
          item: specItem(
            token,
            'acceptance-criterion',
            title,
            text,
            [{ to: requirement, type: 'refines' }],
            path,
            h.index,
          ),
          lines: lineRange(h.index, end),
        });
      }
    } else if (h.level === 3 && kinds.liteTasks && LITE_TASK_ID.test(token) && title !== null) {
      const end = sectionEnd(headings, h.index, 3, lines.length);
      const body = slice(h.index + 1, end);
      const implemented = new Set<string>();
      body.forEach((line, i) => {
        if (!/^\s*[-*+]\s+\*\*Implements:\*\*/.test(line)) return;
        const indent = /^\s*/.exec(line)![0].length;
        const bullet = [line];
        for (let j = i + 1; j < body.length; j++) {
          const next = body[j]!;
          if (next.trim() === '' || new RegExp(`^\\s{0,${indent}}[-*+]\\s`).test(next)) break;
          bullet.push(next);
        }
        for (const id of bullet.join(' ').match(REQ_MENTION) ?? []) implemented.add(id);
      });
      found.push({
        kind: 'task',
        item: specItem(
          token,
          'task',
          title,
          blockText(body),
          [...implemented].map((to) => ({ to, type: 'implements' as const })),
          path,
          h.index,
        ),
        lines: lineRange(h.index, end),
      });
    }
  }

  if (kinds.acceptance) found.push(...scenarios(lines, headings, criterionAt, path, skip));
  return found.sort((a, b) => a.item.location!.line - b.item.location!.line);
}

/** The scenarios of the fenced `gherkin` blocks of a file (§3 table, row Scenario). */
function scenarios(
  lines: readonly string[],
  headings: ReadonlyArray<{ index: number; level: number }>,
  criterionAt: ReadonlyMap<number, string>,
  path: string,
  skip: (kind: EntryKind, line: number, reason: string) => void,
): FoundItem[] {
  const found: FoundItem[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = fenceOf(lines[i]!);
    if (!open) {
      i++;
      continue;
    }
    // The block runs from the line after the fence to the line before its closing fence.
    let close = i + 1;
    while (close < lines.length) {
      const f = fenceOf(lines[close]!);
      if (f && f.char === open.char && f.length >= open.length && f.info === '') break;
      close++;
    }
    const gherkin = /^gherkin$/i.test(open.info.split(/\s+/)[0] ?? '');
    if (gherkin) {
      // The criterion above the block: the last heading of level 1 to 4 before it, when valid.
      const above = [...headings].reverse().find((h) => h.index <= i && h.level <= 4);
      const criterion = above ? (criterionAt.get(above.index) ?? null) : null;
      const starts: number[] = [];
      for (let j = i + 1; j < close; j++) if (SCENARIO_LINE.test(lines[j]!)) starts.push(j);
      starts.forEach((start, k) => {
        const end = k + 1 < starts.length ? starts[k + 1]! : close; // exclusive, 0-based
        const name = SCENARIO_LINE.exec(lines[start]!)![1]!.trim();
        const { token, title } = idAndTitle(name);
        if (!TS_SHAPE.test(token)) return;
        const lineNo = start + 1;
        if (!TS_ID.test(token)) {
          skip('scenario', lineNo, `ID "${token}" does not match ${TS_ID.source}`);
        } else if (title === null) {
          skip('scenario', lineNo, 'scenario name lacks the " — <title>" part');
        } else {
          const text = blockText(lines.slice(start + 1, end));
          found.push({
            kind: 'scenario',
            item: specItem(
              token,
              'scenario',
              title,
              text,
              criterion ? [{ to: criterion, type: 'verifies' }] : [],
              path,
              lineNo,
            ),
            lines: lineRange(lineNo, end),
          });
        }
      });
    }
    i = close + 1;
  }
  return found;
}

/** The task of a task file (§3 table, row Task): every line of the file is read. */
function taskFileItem(
  lines: readonly string[],
  path: string,
  sink: NoticeSink | null,
): FoundItem | null {
  const fm = readFrontmatter(lines);
  const fault = frontmatterFault(fm);
  if (fault || fm.kind !== 'ok') {
    sink?.skipped('task', path, fault?.line ?? 1, fault?.reason ?? 'frontmatter has no ID');
    return null;
  }
  const data = asMapping(fm.data)!;
  const id = scalarText(data.id)!;
  const links: SpecItem['links'] = [
    ...textList(data.implements).map((to) => ({ to, type: 'implements' as const })),
    ...textList(data.satisfies_ac).map((to) => ({ to, type: 'relates' as const })),
  ];
  const text = blockText(lines.slice(fm.closingLine));
  return {
    kind: 'task',
    item: specItem(id, 'task', scalarText(data.title) ?? '', text, links, path, 1),
    lines: lineRange(1, lines.length),
  };
}

/** The files of a change folder that hold spec items, in reading order, with what each holds. */
function itemFiles(
  tree: SourceTree,
  folder: string,
  profile: string | null,
): Array<{ path: string; kinds: MarkdownKinds | 'task-file' }> {
  const full = profile !== 'lite';
  const lite = profile !== 'full';
  const prefix = `${folder}/`;
  const out: Array<{ path: string; kinds: MarkdownKinds | 'task-file' }> = [];
  for (const path of tree.paths) {
    if (!path.startsWith(prefix)) continue;
    const rel = path.slice(prefix.length);
    const cap = /^10-spec\/20-capabilities\/[^/]+\/(requirements|acceptance)\.md$/.exec(rel);
    if (full && cap) {
      const requirements = cap[1] === 'requirements';
      out.push({
        path,
        kinds: { requirements, acceptance: !requirements, liteTasks: false },
      });
    } else if (full && /^20-plan\/50-tasks\/T-[^/]*\.md$/.test(rel)) {
      out.push({ path, kinds: 'task-file' });
    } else if (lite && rel === '10-spec/spec.md') {
      out.push({ path, kinds: { requirements: true, acceptance: true, liteTasks: false } });
    } else if (lite && rel === '20-plan/plan.md') {
      out.push({ path, kinds: { requirements: false, acceptance: false, liteTasks: true } });
    }
  }
  return out;
}

/** The change folders of a tree (§2 item 2): direct sub-folders of `.sdd/` that hold `change.md`. */
function changeFolders(tree: SourceTree): string[] {
  const folders = new Set<string>();
  for (const path of tree.paths) {
    const m = /^\.sdd\/([^/]+)\/change\.md$/.exec(path);
    if (m && CHANGE_FOLDER.test(m[1]!)) folders.add(`.sdd/${m[1]}`);
  }
  return [...folders].sort();
}

function phasesOf(value: YamlValue | undefined): Record<string, string | null> {
  const map = asMapping(value ?? null);
  if (!map) return {};
  const out: Record<string, string | null> = {};
  for (const [name, entry] of Object.entries(map)) {
    out[name] = scalarText(asMapping(entry)?.status) ?? scalarText(entry);
  }
  return out;
}

/**
 * Reads the `.sdd/` workspace of a tree. With a sink, every unreadable entry is reported with
 * ERR-SDD-005 and left out; reading continues with the next entry.
 */
export async function readSddWorkspace(
  tree: SourceTree,
  sink: NoticeSink | null,
): Promise<WorkspaceReading> {
  const folders = changeFolders(tree);
  const changes: WorkspaceChange[] = [];
  for (const folder of folders) {
    const changeFile = `${folder}/change.md`;
    const lines = await readLines(tree, changeFile);
    if (lines === null) {
      sink?.skipped('change folder', changeFile, 1, 'change.md cannot be read');
      continue;
    }
    const fm = readFrontmatter(lines);
    const fault = frontmatterFault(fm);
    if (fault || fm.kind !== 'ok') {
      sink?.skipped('change folder', changeFile, fault?.line ?? 1, fault?.reason ?? '');
      continue;
    }
    const data = asMapping(fm.data)!;
    const status = scalarText(data.status);
    const profile = scalarText(data.profile);

    const items: SpecItem[] = [];
    const linesRead = new Map<string, LinesRead>();
    for (const file of itemFiles(tree, folder, profile)) {
      const fileLines = await readLines(tree, file.path);
      if (fileLines === null) continue;
      const found =
        file.kinds === 'task-file'
          ? [taskFileItem(fileLines, file.path, sink)].filter((f) => f !== null)
          : markdownItems(fileLines, file.path, file.kinds, sink);
      for (const f of found) {
        const first = linesRead.get(f.item.id);
        if (first) {
          const at = items.find((x) => x.id === f.item.id)!.location!;
          sink?.skipped(
            f.kind,
            file.path,
            f.item.location!.line,
            `ID ${f.item.id} is already read in this SDD change at "${at.path}" line ${at.line}`,
          );
          continue;
        }
        items.push(f.item);
        linesRead.set(f.item.id, { path: file.path, lines: f.lines });
      }
    }
    changes.push({
      id: scalarText(data.id)!,
      title: scalarText(data.title) ?? '',
      origin: ORIGIN,
      folder,
      status,
      profile,
      phase: scalarText(data.phase),
      phases: phasesOf(data.phases),
      open: status !== 'archived',
      items,
      linesRead,
    });
  }
  return { present: folders.length > 0, changes };
}

/** The intent-context entry of an SDD change (domain model §2.6). */
export function toSddChange(change: WorkspaceChange): SddChange {
  return {
    id: change.id,
    title: change.title,
    origin: change.origin,
    location: change.folder,
    items: [...change.items],
  };
}

/** What the reader gives intake from the SDD workspace of the snapshot and the base commit. */
export interface SddIntentSources {
  /** The snapshot holds an SDD workspace: a `.sdd/` workspace or a neutral file. */
  readonly present: boolean;
  /** The readable SDD changes of the snapshot, open and archived, `.sdd/` ones first. */
  readonly changes: readonly WorkspaceChange[];
  /** The open SDD changes with their spec items: the intent context (C001-REQ-111). */
  readonly sddChanges: readonly SddChange[];
  /** The selected SDD change, whose architecture is read (§4 item 1, §6). */
  readonly selected: WorkspaceChange | null;
  /**
   * For each open SDD change of the snapshot, by change ID, the lines each spec item is read from
   * in the snapshot and at the base commit, where the base side reads the SDD change with the same
   * ID (§3 "Lines read"). Items that only the base commit holds are included (a deleted item).
   */
  readonly specItemLines: ReadonlyMap<string, ReadonlyMap<string, LinesOnBothSides>>;
  /** The documented architecture: of the neutral file, else of the selected change (§4 item 1). */
  readonly architecture: ArchitectureReading;
  /** The producer named by the snapshot's neutral file, when it names one. */
  readonly producer: string | null;
}

export interface ReadSddOptions {
  readonly snapshot: SourceTree;
  readonly base: SourceTree;
  /** Notices of the snapshot side. */
  readonly sink: NoticeSink;
  /**
   * The value of `--sdd-change` (C001-IF-007 §6, `select-change.ts`); without it, the only open
   * SDD change is selected.
   */
  readonly sddChange?: string;
  /**
   * The repository-relative paths of the changed files of the snapshot: the files a `.sdd/` task
   * names are found among them (§3 row Task, §10 item 2).
   */
  readonly changedPaths?: readonly string[];
  /** The neutral file of each side, read and validated by `readNeutralFile` (§5). */
  readonly neutral?: {
    readonly snapshot: NeutralReading | null;
    readonly base: NeutralReading | null;
  };
}

/** Pairs the lines read of the items of a change on both sides, by item ID. */
export function pairLines(
  snapshot: WorkspaceChange | null,
  base: WorkspaceChange | null,
): Map<string, LinesOnBothSides> {
  const out = new Map<string, LinesOnBothSides>();
  for (const [id, lines] of snapshot?.linesRead ?? []) {
    out.set(id, { snapshot: lines, base: base?.linesRead.get(id) ?? null });
  }
  for (const [id, lines] of base?.linesRead ?? []) {
    if (!out.has(id)) out.set(id, { snapshot: null, base: lines });
  }
  return out;
}

/**
 * The `.sdd/` changes with the changed files each task names in its text (§3 row Task, §10 item
 * 2; link signal "task names the file"). The tasks of the neutral file keep the files it lists.
 */
function withTaskFiles(
  changes: readonly WorkspaceChange[],
  mentions: FileMentions,
): WorkspaceChange[] {
  return changes.map((change) => ({
    ...change,
    items: change.items.map((item) =>
      item.kind === 'task' ? { ...item, files: mentions.names(item.text) } : item,
    ),
  }));
}

const NEUTRAL_PREFIX = 'neutral:';

/**
 * The SDD changes of a neutral file beside those of the `.sdd/` workspace of the same tree: a
 * neutral-file change ID equal to a `.sdd/` change ID is prefixed `neutral:` (§5 item 3).
 */
function withNeutral(
  sdd: readonly WorkspaceChange[],
  neutral: NeutralReading | null,
): WorkspaceChange[] {
  const taken = new Set(sdd.map((c) => c.id));
  const renamed = (neutral?.changes ?? []).map((c) =>
    taken.has(c.id) ? { ...c, id: `${NEUTRAL_PREFIX}${c.id}` } : c,
  );
  return [...sdd, ...renamed];
}

/** The ID a change has in its own source, without the prefix of §5 item 3. */
const sourceId = (c: WorkspaceChange) =>
  c.origin === 'neutral-file' && c.id.startsWith(NEUTRAL_PREFIX)
    ? c.id.slice(NEUTRAL_PREFIX.length)
    : c.id;

function pairComponents(
  now: ReadonlyMap<string, LinesRead>,
  before: ReadonlyMap<string, LinesRead>,
): Map<string, LinesOnBothSides> {
  const out = new Map<string, LinesOnBothSides>();
  for (const [id, lines] of now) out.set(id, { snapshot: lines, base: before.get(id) ?? null });
  for (const [id, lines] of before) if (!out.has(id)) out.set(id, { snapshot: null, base: lines });
  return out;
}

/**
 * Reads the SDD workspace of the snapshot — its `.sdd/` workspace and its neutral file — into the
 * intent context, the lines read on both sides and the documented architecture in the source order
 * of §4 item 1: the neutral file's `architecture`, else the selected SDD change's
 * `architecture.md` (C001-IF-007 §1 to §5).
 */
export async function readSddIntentSources(options: ReadSddOptions): Promise<SddIntentSources> {
  const neutralNow = options.neutral?.snapshot ?? null;
  const neutralBefore = options.neutral?.base ?? null;
  const snapshot = await readSddWorkspace(options.snapshot, options.sink);
  const base = await readSddWorkspace(options.base, null);
  const mentions = new FileMentions(options.changedPaths ?? []);
  const changes = withNeutral(withTaskFiles(snapshot.changes, mentions), neutralNow);
  const baseChanges = withNeutral(withTaskFiles(base.changes, mentions), neutralBefore);
  // The base side reads the SDD change with the same ID from the same source.
  const baseOf = (change: WorkspaceChange) =>
    baseChanges.find((c) => c.origin === change.origin && sourceId(c) === sourceId(change)) ?? null;
  const open = changes.filter((c) => c.open);

  const specItemLines = new Map<string, ReadonlyMap<string, LinesOnBothSides>>();
  for (const change of open) {
    if (!specItemLines.has(change.id)) {
      specItemLines.set(change.id, pairLines(change, baseOf(change)));
    }
  }

  // §6: both stops (ERR-SDD-001, ERR-SDD-002) throw here, before the architecture is read.
  const selected = selectSddChange(changes, options.sddChange);
  const sddFolder = (change: WorkspaceChange | null) =>
    change?.origin === 'sdd-folder' ? change.folder : null;
  const baseSelected = selected ? baseOf(selected) : null;
  let architecture: ArchitectureReading;
  if (neutralNow?.architecture) {
    const now = neutralNow.architecture;
    // The base side, by the same source order: its neutral file's architecture, else the
    // architecture.md of the SDD change with the selected one's ID (§4 item 6).
    const before = neutralBefore?.architecture
      ? {
          linesRead: neutralBefore.architecture.linesRead,
          componentLines: neutralBefore.architecture.componentLines,
        }
      : await readSddArchitecture(
          { tree: options.snapshot, folder: null },
          { tree: options.base, folder: sddFolder(baseSelected) },
          options.sink,
        ).then((r) => ({
          linesRead: r.linesRead.base,
          componentLines: new Map(
            [...r.componentLines].flatMap(([id, l]) => (l.base ? [[id, l.base] as const] : [])),
          ),
        }));
    architecture = {
      file: neutralNow.file,
      documented: now.documented,
      linesRead: { snapshot: now.linesRead, base: before.linesRead },
      componentLines: pairComponents(now.componentLines, before.componentLines),
    };
  } else {
    const sdd = await readSddArchitecture(
      { tree: options.snapshot, folder: sddFolder(selected) },
      { tree: options.base, folder: neutralBefore?.architecture ? null : sddFolder(baseSelected) },
      options.sink,
    );
    const before = neutralBefore?.architecture;
    architecture = before
      ? {
          ...sdd,
          linesRead: { snapshot: sdd.linesRead.snapshot, base: before.linesRead },
          componentLines: pairComponents(
            new Map(
              [...sdd.componentLines].flatMap(([id, l]) =>
                l.snapshot ? [[id, l.snapshot] as const] : [],
              ),
            ),
            before.componentLines,
          ),
        }
      : sdd;
  }
  return {
    present: snapshot.present || neutralNow !== null,
    changes,
    sddChanges: open.map(toSddChange),
    selected,
    specItemLines,
    architecture,
    producer: neutralNow?.producer ?? null,
  };
}
