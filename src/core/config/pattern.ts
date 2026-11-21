/**
 * Path patterns of C001-IF-005 §1: matched against the whole repository-relative path with `/` as
 * separator; `*` any characters except `/`, `?` one character except `/`, `**` as a whole segment
 * zero or more segments, `{a,b}` either alternative, `[abc]` one listed character (ranges such as
 * `a-z` included). A pattern without `/` matches the file name at any depth. Built-in patterns
 * match case-insensitively, configured patterns case-sensitively on every operating system.
 *
 * A pattern that does not follow this syntax (an unclosed `[` or `{`, an empty `[]`, a `}` or `]`
 * without its opening bracket) is rejected with `PatternSyntaxError`; the configuration loader
 * turns that into an unreadable configuration (C001-REQ-427, C001-TS-480).
 */

export class PatternSyntaxError extends Error {
  constructor(
    readonly pattern: string,
    readonly reason: string,
  ) {
    super(`invalid path pattern "${pattern}": ${reason}`);
    this.name = 'PatternSyntaxError';
  }
}

const SPECIAL = /[.+^$()|\\/]/;

function escapeChar(c: string): string {
  return SPECIAL.test(c) ? `\\${c}` : c;
}

/** Translates one segment-level piece (no `/` handling) of a pattern to a regular expression. */
function translate(pattern: string, text: string, stopAtComma: boolean, start: number) {
  let out = '';
  let i = start;
  while (i < text.length) {
    const c = text[i]!;
    if (stopAtComma && (c === ',' || c === '}')) return { out, end: i };
    if (c === '*') {
      // `**` inside a segment (not a whole segment) behaves as `*`.
      while (text[i + 1] === '*') i++;
      out += '[^/]*';
      i++;
    } else if (c === '?') {
      out += '[^/]';
      i++;
    } else if (c === '[') {
      const close = text.indexOf(']', i + 1);
      if (close === -1) throw new PatternSyntaxError(pattern, 'unclosed "["');
      const body = text.slice(i + 1, close);
      if (body.length === 0) throw new PatternSyntaxError(pattern, 'empty "[]"');
      if (body.includes('/')) throw new PatternSyntaxError(pattern, '"/" inside "[ ]"');
      let cls = '';
      for (let k = 0; k < body.length; k++) {
        const ch = body[k]!;
        if (ch === '-' && k > 0 && k < body.length - 1) {
          if (body[k - 1]! > body[k + 1]!) {
            throw new PatternSyntaxError(pattern, `reversed range "${body[k - 1]}-${body[k + 1]}"`);
          }
          cls += '-';
        } else cls += /[\\\]^-]/.test(ch) ? `\\${ch}` : ch;
      }
      out += `[${cls}]`;
      i = close + 1;
    } else if (c === '{') {
      const alternatives: string[] = [];
      let k = i + 1;
      for (;;) {
        const part = translate(pattern, text, true, k);
        alternatives.push(part.out);
        if (part.end >= text.length) throw new PatternSyntaxError(pattern, 'unclosed "{"');
        k = part.end + 1;
        if (text[part.end] === '}') break;
      }
      out += `(?:${alternatives.join('|')})`;
      i = k;
    } else if (c === '}' || c === ']') {
      throw new PatternSyntaxError(pattern, `"${c}" without its opening bracket`);
    } else {
      out += escapeChar(c);
      i++;
    }
  }
  if (stopAtComma) return { out, end: text.length };
  return { out, end: i };
}

/** Splits at `/` outside `{ }`, so that an alternative may hold a `/` (`{src,lib/gen}/**`). */
function splitSegments(pattern: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let current = '';
  for (const c of pattern) {
    if (c === '{') depth++;
    else if (c === '}' && depth > 0) depth--;
    if (c === '/' && depth === 0) {
      segments.push(current);
      current = '';
    } else current += c;
  }
  segments.push(current);
  return segments;
}

function segmentRegex(pattern: string, segment: string): string {
  return translate(pattern, segment, false, 0).out;
}

/** Compiles a pattern to a regular expression over the whole path; throws `PatternSyntaxError`. */
export function compilePattern(pattern: string, options: { builtin?: boolean } = {}): RegExp {
  if (pattern.length === 0) throw new PatternSyntaxError(pattern, 'empty pattern');
  const anyDepth = !pattern.includes('/');
  const segments = splitSegments(pattern);
  let source = '';
  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s]!;
    const last = s === segments.length - 1;
    if (segment === '**') {
      // Zero or more whole segments.
      if (last) source += s === 0 ? '.*' : '(?:/.*)?';
      else source += s === 0 ? '(?:[^/]+/)*' : '(?:/[^/]+)*/';
      continue;
    }
    if (segment === '') throw new PatternSyntaxError(pattern, 'empty path segment');
    const previousGlobstar = s > 0 && segments[s - 1] === '**';
    if (s > 0 && !previousGlobstar) source += '/';
    source += segmentRegex(pattern, segment);
  }
  if (anyDepth) source = `(?:[^/]+/)*${source}`;
  return new RegExp(`^${source}$`, options.builtin ? 'i' : '');
}

/** Throws `PatternSyntaxError` when the pattern does not follow C001-IF-005 §1. */
export function checkPattern(pattern: string): void {
  compilePattern(pattern);
}

/** A compiled set of patterns: a path matches when any pattern matches it. */
export class PatternSet {
  private readonly regexes: readonly RegExp[];

  constructor(
    readonly patterns: readonly string[],
    options: { builtin?: boolean } = {},
  ) {
    this.regexes = patterns.map((p) => compilePattern(p, options));
  }

  /** The first pattern that matches the repository-relative path, or `null`. */
  match(path: string): string | null {
    for (let i = 0; i < this.regexes.length; i++) {
      if (this.regexes[i]!.test(path)) return this.patterns[i]!;
    }
    return null;
  }
}
