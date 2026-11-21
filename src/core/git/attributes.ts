/**
 * `.gitattributes` matching in process (C001-ADR-004 decision item 6, G-11): git 2.34 cannot read
 * attributes from a tree, and the sources other than the commit's tree must not count
 * (C001-IF-012 §7), so the files of the tree are parsed here.
 */

export type AttributeState = { readonly kind: 'set' | 'unset' | 'unspecified' } | { value: string };

interface Rule {
  readonly regex: RegExp;
  readonly basenameOnly: boolean;
  readonly assignments: ReadonlyArray<readonly [string, AttributeState]>;
}

export interface AttributeFile {
  /** The directory of the file, '' for the root, otherwise 'a/b' without a trailing slash. */
  readonly directory: string;
  readonly rules: readonly Rule[];
  readonly macros: ReadonlyMap<string, ReadonlyArray<readonly [string, AttributeState]>>;
}

const BUILT_IN_MACROS: ReadonlyMap<
  string,
  ReadonlyArray<readonly [string, AttributeState]>
> = new Map([
  [
    'binary',
    [
      ['diff', { kind: 'unset' }],
      ['merge', { kind: 'unset' }],
      ['text', { kind: 'unset' }],
    ],
  ],
]);

const POSIX_CLASSES: Record<string, string> = {
  alpha: 'A-Za-z',
  digit: '0-9',
  alnum: 'A-Za-z0-9',
  upper: 'A-Z',
  lower: 'a-z',
  space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t',
  punct: '!-\\/:-@\\[-`{-~',
  xdigit: '0-9A-Fa-f',
  cntrl: '\\x00-\\x1f\\x7f',
  print: '\\x20-\\x7e',
  graph: '\\x21-\\x7e',
};

const escapeChar = (c: string) => c.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');

/** git's wildmatch with WM_PATHNAME, as a regular expression over a '/'-separated path. */
export function wildmatchToRegex(pattern: string, ignoreCase = false): RegExp {
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === '\\') {
      i++;
      if (i < pattern.length) out += escapeChar(pattern[i]!);
      i++;
    } else if (c === '?') {
      out += '[^/]';
      i++;
    } else if (c === '*') {
      let stars = 0;
      while (pattern[i] === '*') {
        stars++;
        i++;
      }
      const atStart = out === '' || out.endsWith('\\/');
      if (stars >= 2 && atStart && pattern[i] === '/') {
        out += '(?:.*\\/)?';
        i++;
      } else if (stars >= 2 && atStart && i >= pattern.length) {
        out += '.*';
      } else {
        out += '[^/]*';
      }
    } else if (c === '[') {
      const close = findClassEnd(pattern, i);
      if (close < 0) {
        out += '\\[';
        i++;
      } else {
        out += translateClass(pattern.slice(i + 1, close));
        i = close + 1;
      }
    } else {
      out += escapeChar(c);
      i++;
    }
  }
  return new RegExp(`^${out}$`, ignoreCase ? 'i' : '');
}

function findClassEnd(pattern: string, open: number): number {
  let i = open + 1;
  if (pattern[i] === '!' || pattern[i] === '^') i++;
  if (pattern[i] === ']') i++;
  while (i < pattern.length) {
    if (pattern[i] === '[' && pattern[i + 1] === ':') {
      const end = pattern.indexOf(':]', i + 2);
      if (end >= 0) {
        i = end + 2;
        continue;
      }
    }
    if (pattern[i] === '\\') i++;
    else if (pattern[i] === ']') return i;
    i++;
  }
  return -1;
}

function translateClass(body: string): string {
  let negate = false;
  let i = 0;
  if (body[0] === '!' || body[0] === '^') {
    negate = true;
    i++;
  }
  let out = '';
  while (i < body.length) {
    if (body[i] === '[' && body[i + 1] === ':') {
      const end = body.indexOf(':]', i + 2);
      if (end >= 0) {
        out += POSIX_CLASSES[body.slice(i + 2, end)] ?? '';
        i = end + 2;
        continue;
      }
    }
    if (body[i] === '\\' && i + 1 < body.length) {
      out += escapeChar(body[i + 1]!);
      i += 2;
      continue;
    }
    out += body[i] === '-' ? '-' : escapeChar(body[i]!);
    i++;
  }
  // A '/' never matches a class under WM_PATHNAME.
  return negate ? `[^${out}/]` : `(?!\\/)[${out}]`;
}

function parseAssignments(
  tokens: readonly string[],
  macros: ReadonlyMap<string, ReadonlyArray<readonly [string, AttributeState]>>,
): Array<readonly [string, AttributeState]> {
  const out: Array<readonly [string, AttributeState]> = [];
  const apply = (name: string, state: AttributeState, depth: number) => {
    out.push([name, state]);
    if ('kind' in state && state.kind === 'set' && depth < 5) {
      const macro = macros.get(name) ?? BUILT_IN_MACROS.get(name);
      if (macro) for (const [n, s] of macro) apply(n, s, depth + 1);
    }
  };
  for (const token of tokens) {
    if (token.startsWith('-') && token.length > 1) apply(token.slice(1), { kind: 'unset' }, 0);
    else if (token.startsWith('!') && token.length > 1)
      apply(token.slice(1), { kind: 'unspecified' }, 0);
    else {
      const eq = token.indexOf('=');
      if (eq > 0) apply(token.slice(0, eq), { value: token.slice(eq + 1) }, 0);
      else apply(token, { kind: 'set' }, 0);
    }
  }
  return out;
}

/** Parses one `.gitattributes` file of a tree; `directory` is its directory ('' for the root). */
export function parseAttributeFile(
  directory: string,
  content: string,
  ignoreCase = false,
): AttributeFile {
  const rules: Rule[] = [];
  const macros = new Map<string, Array<readonly [string, AttributeState]>>();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/^[ \t]+/, '');
    if (line === '' || line.startsWith('#')) continue;
    let pattern: string;
    let rest: string;
    if (line.startsWith('"')) {
      const m = /^"((?:[^"\\]|\\.)*)"[ \t]*(.*)$/.exec(line);
      if (!m) continue;
      pattern = m[1]!.replace(/\\(.)/g, '$1');
      rest = m[2]!;
    } else {
      const m = /^(\S+)[ \t]*(.*)$/.exec(line);
      if (!m) continue;
      pattern = m[1]!;
      rest = m[2]!;
    }
    const tokens = rest.split(/[ \t]+/).filter(Boolean);
    if (pattern.startsWith('[attr]')) {
      // Macros are defined in the top-level file only.
      if (directory === '') macros.set(pattern.slice(6), parseAssignments(tokens, macros));
      continue;
    }
    // A pattern that ends with '/' never matches a file.
    if (pattern.endsWith('/')) continue;
    const anchored = pattern.includes('/');
    if (pattern.startsWith('/')) pattern = pattern.slice(1);
    rules.push({
      regex: wildmatchToRegex(pattern, ignoreCase),
      basenameOnly: !anchored,
      assignments: parseAssignments(tokens, macros),
    });
  }
  return { directory, rules, macros };
}

/** The state of attribute `name` for `path`, from files ordered from the root downward. */
export function lookupAttributeState(
  files: readonly AttributeFile[],
  path: string,
  name: string,
): AttributeState {
  let state: AttributeState = { kind: 'unspecified' };
  for (const file of files) {
    const prefix = file.directory === '' ? '' : `${file.directory}/`;
    if (!path.startsWith(prefix)) continue;
    const relative = path.slice(prefix.length);
    const base = relative.slice(relative.lastIndexOf('/') + 1);
    for (const rule of file.rules) {
      if (!rule.regex.test(rule.basenameOnly ? base : relative)) continue;
      for (const [n, s] of rule.assignments) if (n === name) state = s;
    }
  }
  return state;
}

/** The value of attribute `name` for `path`, from files ordered from the root downward. */
export function lookupAttribute(
  files: readonly AttributeFile[],
  path: string,
  name: string,
): string | null {
  const state = lookupAttributeState(files, path, name);
  if ('value' in state) return state.value;
  if (state.kind === 'set') return 'set';
  if (state.kind === 'unset') return 'unset';
  return null;
}
