import type { DocumentedArchitecture } from '../../generated/analysis-results.js';
import type { NoticeSink } from './notices.js';
import { decodeText, fencedLines, headingOf, idAndTitle, splitLines } from './text.js';
import { mergeLines, type LinesOnBothSides, type LinesRead, type SourceTree } from './tree.js';

/**
 * The documented architecture in the `.sdd/` format (C001-IF-007 §4): the components of
 * `## 2. Component catalogue` of the selected SDD change's `10-spec/60-architecture/architecture.md`
 * with their path patterns, layers and allowed dependencies (C001-REQ-207). An architecture in
 * which no component has a path pattern is dropped with ERR-SDD-004 (C001-REQ-223); a damaged
 * component is left out with ERR-SDD-005 (C001-REQ-123). The lines each component is read from are
 * recorded in the snapshot and at the base commit (C001-REQ-222).
 */

export const ARCHITECTURE_FILE = '10-spec/60-architecture/architecture.md';

const COMP_ID = /^C[0-9]{3}-COMP-[0-9]{2,}$/;
const COMP_SHAPE = /^C[0-9]+-COMP-/;
const COMP_MENTION = /C[0-9]{3}-COMP-[0-9]{2,}/g;
const CATALOGUE = /^2\.\s+Component catalogue$/i;
const BULLET = /^(\s*)[-*+]\s+\*\*(Depends on|Paths|Layer|Evidence):\*\*(.*)$/;
const LAYER = /^([0-9]+)\s+—\s+(\S.*)$/;

type DocumentedComponent = DocumentedArchitecture['components'][number];

/** The result of reading one `architecture.md`. */
export interface ArchitectureParse {
  readonly file: string;
  /** `null` when no component gives a path pattern: not a documented architecture (§4 item 4). */
  readonly architecture: DocumentedArchitecture | null;
  /** The lines the documented architecture is read from (§4 item 6); `null` when not documented. */
  readonly linesRead: LinesRead | null;
  /** The lines each component is read from: its heading and its four bullets, by component ID. */
  readonly componentLines: ReadonlyMap<string, LinesRead>;
}

interface Bullet {
  readonly name: string;
  readonly value: string;
  readonly lines: readonly number[];
}

/** The bullets of §4 item 2 in a component's body, each with its continuation lines. */
function bulletsOf(lines: readonly string[], fenced: readonly boolean[], from: number, to: number) {
  const out: Bullet[] = [];
  for (let n = from; n <= to; n++) {
    if (fenced[n - 1]) continue;
    const m = BULLET.exec(lines[n - 1]!);
    if (!m) continue;
    const indent = m[1]!.length;
    const parts = [m[3]!];
    const read = [n];
    let k = n + 1;
    for (; k <= to; k++) {
      const next = lines[k - 1]!;
      if (fenced[k - 1] || next.trim() === '' || headingOf(next)) break;
      if (new RegExp(`^\\s{0,${indent}}([-*+]|[0-9]+[.)])\\s`).test(next)) break;
      parts.push(next);
      read.push(k);
    }
    out.push({ name: m[2]!, value: parts.join(' ').trim(), lines: read });
    n = k - 1;
  }
  return out;
}

const backticked = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.trim());

/** The pattern an `Evidence` path contributes: `<directory of the path>/**` (§4 item 2). */
function evidencePattern(cited: string): string | null {
  const path = cited.replace(/:[0-9]+(?:[-:][0-9]+)*$/, '').replace(/^\.\//, '');
  if (path === '' || /[\s*?[\]{}]/.test(path) || /^[/\\]/.test(path)) return null;
  const slash = path.lastIndexOf('/');
  // A file at the repository root has no directory to give a pattern for.
  return slash > 0 ? `${path.slice(0, slash)}/**` : null;
}

/** Reads the component catalogue of an `architecture.md` text (§4 items 2 to 6). */
export function parseSddArchitecture(
  text: string,
  file: string,
  sink: NoticeSink | null,
): ArchitectureParse {
  const lines = splitLines(text);
  const fenced = fencedLines(lines);
  const headings = lines.flatMap((line, i) => {
    if (fenced[i]) return [];
    const h = headingOf(line);
    return h ? [{ index: i + 1, level: h.level, text: h.text }] : [];
  });
  const skip = (line: number, reason: string) => sink?.skipped('component', file, line, reason);

  const catalogue = headings.find((h) => h.level === 2 && CATALOGUE.test(h.text));
  const components: Array<DocumentedComponent & { rank: number | null }> = [];
  const componentLines = new Map<string, LinesRead>();
  if (catalogue) {
    const end = headings.find((h) => h.index > catalogue.index && h.level <= 2)?.index;
    const last = end !== undefined ? end - 1 : lines.length;
    const inCatalogue = headings.filter(
      (h) => h.index > catalogue.index && h.index <= last && h.level === 3,
    );
    for (const h of inCatalogue) {
      const { token, title } = idAndTitle(h.text);
      if (!COMP_SHAPE.test(token)) continue;
      if (!COMP_ID.test(token)) {
        skip(h.index, `ID "${token}" does not match ${COMP_ID.source}`);
        continue;
      }
      if (title === null) {
        skip(h.index, 'heading lacks the " — <name>" part');
        continue;
      }
      const next = headings.find((x) => x.index > h.index && x.level <= 3);
      const bodyEnd = next && next.index <= last ? next.index - 1 : last;
      const bullets = bulletsOf(lines, fenced, h.index + 1, bodyEnd);

      let damaged = false;
      const paths: string[] = [];
      const dependencies: string[] = [];
      const evidence: string[] = [];
      let layer: { rank: number; name: string } | null = null;
      let hasPaths = false;
      for (const b of bullets) {
        if (b.name === 'Paths') {
          hasPaths = true;
          const found = backticked(b.value).map((p) => p.replace(/^\.\//, ''));
          if (found.length === 0) {
            skip(b.lines[0]!, 'the **Paths:** bullet holds no backticked pattern');
            damaged = true;
            break;
          }
          paths.push(...found.filter((p) => p !== ''));
        } else if (b.name === 'Layer') {
          const m = LAYER.exec(b.value);
          if (!m) {
            skip(b.lines[0]!, 'the **Layer:** bullet does not have the form "<rank> — <name>"');
            damaged = true;
            break;
          }
          layer ??= { rank: Number(m[1]), name: m[2]!.trim() };
        } else if (b.name === 'Depends on') {
          dependencies.push(...(b.value.match(COMP_MENTION) ?? []));
        } else {
          for (const cited of backticked(b.value)) {
            const pattern = evidencePattern(cited);
            if (pattern) evidence.push(pattern);
          }
        }
      }
      if (damaged) continue;
      if (componentLines.has(token)) continue; // a repeated ID: the first component is kept
      components.push({
        id: token,
        name: title,
        layer: layer?.name ?? null,
        rank: layer?.rank ?? null,
        paths: [...new Set(hasPaths ? paths : evidence)],
        allowedDependencies: [...new Set(dependencies)].filter((d) => d !== token),
      });
      componentLines.set(token, mergeLines(file, [h.index], ...bullets.map((b) => b.lines)));
    }
  }

  if (!components.some((c) => c.paths.length > 0)) {
    sink?.noComponentPaths(file);
    return { file, architecture: null, linesRead: null, componentLines: new Map() };
  }

  const layers = components
    .filter((c) => c.layer !== null)
    .map((c, order) => ({ name: c.layer!, rank: c.rank!, order }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((l) => l.name)
    .filter((name, i, all) => all.indexOf(name) === i);
  return {
    file,
    architecture: {
      origin: 'sdd-folder',
      location: file,
      layers,
      components: components.map(({ rank: _rank, ...c }) => c),
    },
    linesRead: mergeLines(
      file,
      [catalogue!.index],
      ...[...componentLines.values()].map((l) => l.lines),
    ),
    componentLines,
  };
}

/** The documented architecture with its lines read on both sides (§4 items 1 and 6). */
export interface ArchitectureReading {
  /** The snapshot's `architecture.md` of the selected change, `null` when there is none. */
  readonly file: string | null;
  /** The documented architecture of the snapshot; `null` when none (or dropped, ERR-SDD-004). */
  readonly documented: DocumentedArchitecture | null;
  readonly linesRead: LinesOnBothSides;
  /** By component ID, of the components read on either side. */
  readonly componentLines: ReadonlyMap<string, LinesOnBothSides>;
}

export interface ArchitectureSide {
  readonly tree: SourceTree;
  /** The change folder whose architecture is read; `null` for none. */
  readonly folder: string | null;
}

async function readSide(side: ArchitectureSide, sink: NoticeSink | null) {
  if (side.folder === null) return null;
  const file = `${side.folder}/${ARCHITECTURE_FILE}`;
  if (!side.tree.paths.includes(file)) return null;
  const bytes = await side.tree.read(file);
  if (bytes === null) return null;
  return parseSddArchitecture(decodeText(bytes), file, sink);
}

/**
 * Reads the architecture of the selected SDD change in the snapshot, with notices, and of the SDD
 * change with the same ID at the base commit, silently, for the lines read there.
 */
export async function readSddArchitecture(
  snapshot: ArchitectureSide,
  base: ArchitectureSide,
  sink: NoticeSink,
): Promise<ArchitectureReading> {
  const now = await readSide(snapshot, sink);
  const before = await readSide(base, null);
  const componentLines = new Map<string, LinesOnBothSides>();
  for (const [id, lines] of now?.componentLines ?? []) {
    componentLines.set(id, { snapshot: lines, base: before?.componentLines.get(id) ?? null });
  }
  for (const [id, lines] of before?.componentLines ?? []) {
    if (!componentLines.has(id)) componentLines.set(id, { snapshot: null, base: lines });
  }
  return {
    file: now?.file ?? null,
    documented: now?.architecture ?? null,
    linesRead: { snapshot: now?.linesRead ?? null, base: before?.linesRead ?? null },
    componentLines,
  };
}
