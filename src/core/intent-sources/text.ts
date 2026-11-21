import { createHash } from 'node:crypto';

/**
 * Text helpers of the intent-source reader (C001-IF-007 §1 item 3): files are decoded as UTF-8
 * without byte-order mark and their line endings normalised to LF before anything is read or hashed.
 */

const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false });

/** The text of a file: UTF-8, byte-order mark removed, CRLF and CR normalised to LF. */
export function decodeText(bytes: Uint8Array): string {
  return decoder.decode(bytes).replace(/\r\n?/g, '\n');
}

/**
 * The lines of a text: `lines[0]` is line 1. A final line feed ends the last line and does not
 * start an empty one.
 */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** `textHash` (C001-IF-007 §1 item 3): SHA-256 of the text with trailing white space removed per line. */
export function textHash(text: string): string {
  const normalised = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n');
  return createHash('sha256').update(normalised, 'utf8').digest('hex');
}

/** The lines of a range joined as text, without its leading and trailing blank lines. */
export function blockText(lines: readonly string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === '') start++;
  while (end > start && lines[end - 1]!.trim() === '') end--;
  return lines.slice(start, end).join('\n');
}

/** The lines `from` to `to` (1-based, inclusive), as an ascending list. */
export function lineRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
}

/** An ATX heading: level 1 to 6, its text without the `#` marks. */
export interface Heading {
  readonly level: number;
  readonly text: string;
}

/** The ATX heading of a line, or `null` (C001-IF-007 §3: `### <ID> — <title>`). */
export function headingOf(line: string): Heading | null {
  const m = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/.exec(line);
  if (!m) return null;
  const text = (m[2] ?? '').replace(/[ \t]+#+$/, '').trim();
  return { level: m[1]!.length, text };
}

/** A code fence opening or closing line: its character, length and info string. */
export interface Fence {
  readonly char: '`' | '~';
  readonly length: number;
  readonly info: string;
}

export function fenceOf(line: string): Fence | null {
  const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return null;
  const marks = m[1]!;
  const info = m[2]!.trim();
  if (marks[0] === '`' && info.includes('`')) return null;
  return { char: marks[0] as '`' | '~', length: marks.length, info };
}

/** For each line of a Markdown text, whether it lies inside a fenced code block (fences included). */
export function fencedLines(lines: readonly string[]): boolean[] {
  const out: boolean[] = [];
  let open: Fence | null = null;
  for (const line of lines) {
    const fence = fenceOf(line);
    if (open === null) {
      if (fence) {
        open = fence;
        out.push(true);
      } else {
        out.push(false);
      }
      continue;
    }
    out.push(true);
    if (fence && fence.char === open.char && fence.length >= open.length && fence.info === '') {
      open = null;
    }
  }
  return out;
}

/**
 * The `<ID> — <title>` form of a heading or scenario name: the ID token is the text up to the first
 * white space; the title follows a spaced em dash. `title` is `null` when that part is missing.
 */
export function idAndTitle(text: string): { token: string; title: string | null } {
  const token = /^\S*/.exec(text)![0];
  const rest = text.slice(token.length);
  const m = /^[ \t]+—[ \t]+(\S.*)$/.exec(rest);
  return { token, title: m ? m[1]!.trim() : null };
}
