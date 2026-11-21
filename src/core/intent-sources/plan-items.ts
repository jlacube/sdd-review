import type { NamedFile, PlanItem } from '../../generated/analysis-results.js';
import { readFrontmatter } from './frontmatter.js';
import { FileMentions } from './mentions.js';
import { blockText, fencedLines, headingOf, splitLines, textHash } from './text.js';

/**
 * The plan-item rule of C001-IF-007 §8 (C001-REQ-314): the plan items of a named agent plan, in
 * file order, each with its source line, its text and the changed files it names (§10, link signal
 * "plan item names the file"). A plan is data: nothing in it is followed (C001-CON-20).
 */

/** A plan item with the last line of its extent (for the links of recorded runs, §9 item 3). */
export interface LocatedPlanItem {
  readonly item: PlanItem;
  /** The 1-based file line of the item's last line. */
  readonly lastLine: number;
}

/** A line that starts an item: 0-based index, indentation and, for a heading, its level. */
interface Start {
  readonly index: number;
  readonly indent: number;
  readonly level: number | null;
}

/** How each item's extent ends (§8 "Extent"). */
type ExtentKind = 'list' | 'heading' | 'paragraph' | 'file';

interface Rule {
  readonly kind: ExtentKind;
  readonly starts: readonly Start[];
}

const TITLE_MAX = 200;

const MD_TASK = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[[ xX]\](?=[ \t]|$)/;
const MD_ORDERED = /^[ \t]*\d{1,9}[.)](?=[ \t]|$)/;
const MD_UNORDERED = /^[ \t]*[-*+](?=[ \t]|$)/;
const MD_LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)/;
const NUMBERED_HEADING = /^(?:\d+(?:[.)]|\s)|(?:Step|Phase|Stage|Task|Part)\s+\d)/;

const TXT_TASK = /^[ \t]*(?:[-*][ \t]*)?\[[ xX]\]/;
const TXT_ORDERED = /^[ \t]*\d{1,9}[.)][ \t]/;
const TXT_BULLET = /^[ \t]*[-*+•][ \t]/;
const TXT_LIST_ITEM = /^[ \t]*(?:\[[ xX]\]|\d{1,9}[.)][ \t]|[-*+•][ \t])/;

const isBlank = (line: string) => line.trim() === '';

/** The width of a line's leading white space, a tab advancing to the next multiple of 4. */
function indentOf(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width++;
    else if (ch === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
}

/**
 * The text of each line that the Markdown rules read: YAML frontmatter, fenced code blocks and
 * HTML comments are ignored (`null` for a line that holds nothing else); a comment that covers
 * part of a line is removed from it.
 */
function visibleLines(lines: readonly string[]): Array<string | null> {
  const out: Array<string | null> = lines.map((l) => l);
  const fm = readFrontmatter(lines);
  const bodyStart = fm.kind === 'ok' ? fm.closingLine : 0;
  for (let i = 0; i < bodyStart; i++) out[i] = null;
  const fenced = fencedLines(lines.slice(bodyStart));
  let inComment = false;
  for (let i = bodyStart; i < lines.length; i++) {
    if (fenced[i - bodyStart] && !inComment) {
      out[i] = null;
      continue;
    }
    let rest = lines[i]!;
    let kept = '';
    let touched = inComment;
    for (;;) {
      if (inComment) {
        const close = rest.indexOf('-->');
        if (close < 0) {
          rest = '';
          break;
        }
        rest = rest.slice(close + 3);
        inComment = false;
      }
      const open = rest.indexOf('<!--');
      if (open < 0) break;
      kept += rest.slice(0, open);
      rest = rest.slice(open + 4);
      inComment = true;
      touched = true;
    }
    kept += rest;
    out[i] = touched && isBlank(kept) ? null : kept;
  }
  return out;
}

/** The starts that match `pattern`, kept at the smallest indentation among them. */
function atSmallestIndent(lines: ReadonlyArray<string | null>, pattern: RegExp): Start[] {
  const found: Start[] = [];
  lines.forEach((line, index) => {
    if (line !== null && pattern.test(line)) {
      found.push({ index, indent: indentOf(line), level: null });
    }
  });
  const min = Math.min(...found.map((s) => s.indent));
  return found.filter((s) => s.indent === min);
}

/** The headings of the visible lines: 0-based index and level. */
function headingsOf(
  lines: ReadonlyArray<string | null>,
): Array<{ index: number; level: number; text: string }> {
  return lines.flatMap((line, index) => {
    const h = line === null ? null : headingOf(line);
    return h ? [{ index, level: h.level, text: h.text }] : [];
  });
}

/** The first Markdown rule of §8 that yields at least one item. */
function markdownRule(visible: ReadonlyArray<string | null>): Rule | null {
  const tasks = atSmallestIndent(visible, MD_TASK);
  if (tasks.length > 0) return { kind: 'list', starts: tasks };

  const headings = headingsOf(visible);
  const numbered = headings.filter((h) => NUMBERED_HEADING.test(h.text));
  if (numbered.length > 0) {
    const level = Math.min(...numbered.map((h) => h.level));
    return {
      kind: 'heading',
      starts: numbered
        .filter((h) => h.level === level)
        .map((h) => ({ index: h.index, indent: 0, level })),
    };
  }

  const ordered = atSmallestIndent(visible, MD_ORDERED);
  if (ordered.length > 0) return { kind: 'list', starts: ordered };
  const unordered = atSmallestIndent(visible, MD_UNORDERED);
  if (unordered.length > 0) return { kind: 'list', starts: unordered };

  const titles = headings.filter((h) => h.level === 1);
  const rest = titles.length === 1 ? headings.filter((h) => h !== titles[0]) : headings;
  if (rest.length > 0) {
    const level = Math.min(...rest.map((h) => h.level));
    return {
      kind: 'heading',
      starts: rest
        .filter((h) => h.level === level)
        .map((h) => ({ index: h.index, indent: 0, level })),
    };
  }
  return null;
}

/** The first plain-text rule of §8 that yields at least one item. */
function plainTextRule(lines: readonly string[]): Rule | null {
  for (const pattern of [TXT_TASK, TXT_ORDERED, TXT_BULLET]) {
    const starts = atSmallestIndent(lines, pattern);
    if (starts.length > 0) return { kind: 'list', starts };
  }
  const starts: Start[] = [];
  lines.forEach((line, index) => {
    if (!isBlank(line) && (index === 0 || isBlank(lines[index - 1]!))) {
      starts.push({ index, indent: 0, level: null });
    }
  });
  return starts.length > 0 ? { kind: 'paragraph', starts } : null;
}

/**
 * The 0-based index of an item's last line (§8 "Extent"): the line before the next item of the
 * same rule and level, before a heading of the same or a higher level, or the end of its list. A
 * list ends at a heading, or at a line that follows a blank line, is indented no deeper than the
 * item's marker and is neither a list item nor an ignored line (a fenced block or comment inside
 * an item stays in it).
 */
function extentEnd(
  rule: Rule,
  k: number,
  lines: readonly string[],
  visible: ReadonlyArray<string | null>,
  markdown: boolean,
): number {
  const start = rule.starts[k]!;
  const next = rule.starts[k + 1]?.index ?? lines.length;
  if (rule.kind === 'file') return lines.length - 1;
  if (rule.kind === 'paragraph') {
    let i = start.index;
    while (i + 1 < lines.length && !isBlank(lines[i + 1]!)) i++;
    return i;
  }
  for (let i = start.index + 1; i < next; i++) {
    const line = visible[i];
    if (line === null || line === undefined || isBlank(line)) continue;
    const heading = markdown ? headingOf(line) : null;
    if (rule.kind === 'heading') {
      if (heading && heading.level <= start.level!) return i - 1;
      continue;
    }
    if (heading) return i - 1;
    const afterBlank = isBlank(lines[i - 1]!);
    const listItem = (markdown ? MD_LIST_ITEM : TXT_LIST_ITEM).test(line);
    if (afterBlank && indentOf(line) <= start.indent && !listItem) return i - 1;
  }
  return next - 1;
}

/** The title of a Markdown item: its first line without markers and inline markup (§8). */
function markdownTitle(line: string): string {
  const heading = headingOf(line);
  let t = heading
    ? heading.text
    : line
        .trim()
        .replace(/^(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$)/, '')
        .replace(/^\[[ xX]\](?:[ \t]+|$)/, '');
  t = t
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/(`+)(.*?)\1/g, '$2')
    .replace(/(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(^|[^\p{L}\p{N}*])\*(?=\S)(.+?)(?<=\S)\*(?![\p{L}\p{N}])/gu, '$1$2')
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}])/gu, '$1$2')
    .replace(/\\([!-/:-@[-`{-~])/g, '$1');
  return t;
}

/** The title of a plain-text item: its first line without list and checkbox markers. */
function plainTitle(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*][ \t]*)?\[[ xX]\][ \t]*/, '')
    .replace(/^\d{1,9}[.)][ \t]+/, '')
    .replace(/^[-*+•][ \t]+/, '');
}

/** Trimmed and cut to 200 characters (code points, as JSON Schema counts them). */
function cut(title: string): string {
  const chars = Array.from(title.trim());
  return chars.length <= TITLE_MAX ? chars.join('') : chars.slice(0, TITLE_MAX).join('').trimEnd();
}

/**
 * The plan items of an agent plan (§8), each with the changed files its text names (§10). A
 * Markdown plan is read by the six Markdown rules, any other by the plain-text rules; the text is
 * read with its line endings normalised to LF (§1 item 3). A plan without any non-blank line has no
 * plan item.
 */
export function locatePlanItems(
  file: Pick<NamedFile, 'path' | 'format' | 'text'>,
  mentions: FileMentions,
): LocatedPlanItem[] {
  const lines = splitLines(file.text.replace(/\r\n?/g, '\n'));
  const markdown = file.format === 'markdown';
  const visible = markdown ? visibleLines(lines) : lines;
  let rule = markdown ? markdownRule(visible) : plainTextRule(lines);
  if (rule === null) {
    // Rule 6: the whole file, from its first non-blank line after any frontmatter.
    const fm = markdown ? readFrontmatter(lines) : null;
    const from = fm?.kind === 'ok' ? fm.closingLine : 0;
    const first = lines.findIndex((l, i) => i >= from && !isBlank(l));
    if (first < 0) return [];
    rule = { kind: 'file', starts: [{ index: first, indent: 0, level: null }] };
  }
  const found = rule;
  return found.starts.map((start, k) => {
    const end = extentEnd(found, k, lines, visible, markdown);
    const text = blockText(lines.slice(start.index, end + 1));
    const first = lines[start.index]!;
    const item: PlanItem = {
      file: file.path,
      ordinal: k + 1,
      title: cut(markdown ? markdownTitle(visible[start.index] ?? first) : plainTitle(first)),
      text,
      textHash: textHash(text),
      location: { path: file.path, line: start.index + 1 },
      files: mentions.names(text),
    } as PlanItem;
    let last = end;
    while (last > start.index && isBlank(lines[last]!)) last--;
    return { item, lastLine: last + 1 };
  });
}

/** The plan items of an agent plan (§8) for the intent context. */
export function planItemsOf(
  file: Pick<NamedFile, 'path' | 'format' | 'text'>,
  mentions: FileMentions,
): PlanItem[] {
  return locatePlanItems(file, mentions).map((l) => l.item);
}
