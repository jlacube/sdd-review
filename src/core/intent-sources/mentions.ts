/**
 * The mention rules of C001-IF-007 §10: the spec-item IDs and the changed files a text names, with
 * their positions in that text. They are the ground of the deterministic link signals of
 * C001-CAP-03 §1 (ID in a commit message, ID in code, task names the file, plan item names the
 * file) and of the links of recorded runs (§9 item 3). Texts are data: nothing in them is followed
 * (C001-CON-20).
 */

/** Where a mention starts in the text searched: offset in UTF-16 code units, 1-based line and column. */
export interface MentionPosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

/** A spec item named by its ID (§10 item 1). */
export interface IdMention extends MentionPosition {
  /** The item's full ID. */
  readonly id: string;
  /** The ID as written: the full ID, or the short form without the `C<NNN>-` prefix. */
  readonly text: string;
}

/** A changed file named by its path or by its unique file name (§10 item 2). */
export interface FileMention extends MentionPosition {
  /** The file's repository-relative path, with `/` separators. */
  readonly path: string;
  /** The text as written, a leading `./` included. */
  readonly text: string;
}

/** A spec item that can be named; `short` when its short form counts too (§10 item 1). */
export interface MentionableItem {
  readonly id: string;
  /** The item is a `.sdd/` item of the selected SDD change. */
  readonly short?: boolean;
}

/** Characters with a meaning in a regular expression (`u` mode refuses other escapes). */
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Longest first, so that an alternation never stops at an ID or path that a longer one extends. */
const longestFirst = (a: string, b: string) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0);

/** The short form of a `.sdd/` ID: the ID without its `C<NNN>-` prefix, or `null`. */
export function shortIdOf(id: string): string | null {
  const m = /^C[0-9]{3}-(.+)$/.exec(id);
  return m ? m[1]! : null;
}

/** Line and column of each offset of a text, through the offsets of its line starts. */
class LineIndex {
  private readonly starts: number[] = [0];

  constructor(text: string) {
    for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 0x0a) this.starts.push(k + 1);
  }

  position(offset: number): MentionPosition {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { offset, line: lo + 1, column: offset - this.starts[lo]! + 1 };
  }
}

/**
 * ID mentions (§10 item 1): an ID counts as a whole token, not preceded or followed by a letter, a
 * digit, `-` or `_`. For the `.sdd/` items of the selected SDD change the short form counts as well.
 */
export class IdMentions {
  private readonly byText = new Map<string, string>();
  private readonly pattern: RegExp | null;

  constructor(items: Iterable<MentionableItem>) {
    const shorts: Array<[string, string]> = [];
    for (const item of items) {
      this.byText.set(item.id, item.id);
      const short = item.short ? shortIdOf(item.id) : null;
      if (short !== null) shorts.push([short, item.id]);
    }
    // A full ID wins over a short form that happens to spell it.
    for (const [short, id] of shorts) if (!this.byText.has(short)) this.byText.set(short, id);
    const texts = [...this.byText.keys()].sort(longestFirst);
    this.pattern =
      texts.length === 0
        ? null
        : new RegExp(
            `(?<![\\p{L}\\p{N}_-])(?:${texts.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_-])`,
            'gu',
          );
  }

  /** Every ID mention of a text, in text order. */
  find(text: string): IdMention[] {
    if (this.pattern === null) return [];
    const lines = new LineIndex(text);
    const out: IdMention[] = [];
    for (const m of text.matchAll(this.pattern)) {
      out.push({ ...lines.position(m.index), id: this.byText.get(m[0])!, text: m[0] });
    }
    return out;
  }

  /** The full IDs a text names, once each, in the order of their first mention. */
  names(text: string): string[] {
    return [...new Set(this.find(text).map((m) => m.id))];
  }
}

/** The file name of a repository-relative path: its last segment. */
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** A path with its separators written as `/` or `\`. */
const pathPattern = (path: string) => path.split('/').map(escapeRegExp).join('[/\\\\]');

/** What may stand before a file mention, besides the start of the text (§10 item 2). */
const BEFORE = String.raw`(?<=^|[\s\x60'"(\[<])`;
/**
 * What may follow a file mention: the end of the text, white space, a closing character or
 * punctuation, or a `.` that ends a sentence — one followed by the end of the text, white space or
 * a closing character.
 */
const AFTER = String.raw`(?=$|[\s\x60'")\]>,;:!?]|\.(?:$|[\s\x60'")\]>]))`;

/**
 * File mentions (§10 item 2): a changed file's repository-relative path with `/` or `\`
 * separators, optionally after `./`, or its file name with its extension when no other changed
 * file of the snapshot has that name. The mention starts at the start of the text, after white
 * space or after one of `` ` ' " ( [ < `` and ends at the end of the text, before white space,
 * before one of `` ` ' " ) ] > , ; : ! ? `` or before a `.` that ends a sentence.
 */
export class FileMentions {
  /** Path or file name, with `/` separators, to the changed file it names. */
  private readonly byText = new Map<string, string>();
  private readonly pattern: RegExp | null;

  constructor(changedPaths: Iterable<string>) {
    const paths = [...new Set(changedPaths)].map((p) => p.replace(/\\/g, '/'));
    const names = new Map<string, number>();
    for (const path of paths) names.set(fileName(path), (names.get(fileName(path)) ?? 0) + 1);
    for (const path of paths) this.byText.set(path, path);
    for (const path of paths) {
      const name = fileName(path);
      if (names.get(name) === 1 && !this.byText.has(name)) this.byText.set(name, path);
    }
    const texts = [...this.byText.keys()].filter((t) => t !== '').sort(longestFirst);
    this.pattern =
      texts.length === 0
        ? null
        : new RegExp(
            `${BEFORE}(?:\\.[/\\\\])?(?:${texts.map(pathPattern).join('|')})${AFTER}`,
            'gu',
          );
  }

  /** Every file mention of a text, in text order. */
  find(text: string): FileMention[] {
    if (this.pattern === null) return [];
    const lines = new LineIndex(text);
    const out: FileMention[] = [];
    for (const m of text.matchAll(this.pattern)) {
      const key = m[0].replace(/\\/g, '/').replace(/^\.\//, '');
      const path = this.byText.get(key);
      if (path !== undefined) out.push({ ...lines.position(m.index), path, text: m[0] });
    }
    return out;
  }

  /** The changed files a text names, once each, sorted by path. */
  names(text: string): string[] {
    return [...new Set(this.find(text).map((m) => m.path))].sort();
  }
}
