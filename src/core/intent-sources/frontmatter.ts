/**
 * YAML frontmatter of `.sdd/` files (C001-IF-007 §2 item 5, §3 task files).
 *
 * No YAML library is a confirmed dependency (licence report §9), so this module parses the YAML
 * that frontmatter blocks use: block mappings and sequences, flow sequences and mappings (also over
 * several lines), plain, single-quoted and double-quoted scalars, block scalars (`|`, `>`) and
 * comments. Anything outside that subset — anchors, aliases, tags, directives, complex keys — is
 * reported as "not YAML" with its line, as is every real YAML error found (unclosed flow
 * collection or quote, bad indentation, a mapping value where none is allowed, a duplicate key).
 */

/** A YAML fault, with the 1-based line of the file where it was found. */
export class YamlError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(message);
    this.name = 'YamlError';
  }
}

export type YamlValue =
  null | boolean | number | string | YamlValue[] | { [key: string]: YamlValue };

interface Line {
  /** 1-based line number in the file. */
  readonly no: number;
  indent: number;
  text: string;
}

const UNSUPPORTED_START = /^[&*!%@`]/;

function isBlankOrComment(raw: string): boolean {
  const t = raw.trim();
  return t === '' || t.startsWith('#');
}

/** Removes a trailing comment (` #…`) from a plain scalar's text. */
function stripComment(text: string): string {
  const m = /(^|[ \t])#/.exec(text);
  return (m ? text.slice(0, m.index) : text).trimEnd();
}

function resolvePlain(text: string): YamlValue {
  if (text === '' || text === '~' || /^(null|Null|NULL)$/.test(text)) return null;
  if (/^(true|True|TRUE)$/.test(text)) return true;
  if (/^(false|False|FALSE)$/.test(text)) return false;
  if (/^[-+]?[0-9]+$/.test(text)) return Number(text);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(text)) return Number(text);
  return text;
}

const ESCAPES: Record<string, string> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  t: '\t',
  '\t': '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  e: '\x1b',
  ' ': ' ',
  '"': '"',
  '/': '/',
  '\\': '\\',
  N: '\u0085',
  _: ' ',
  L: ' ',
  P: ' ',
};

/**
 * Reads a quoted scalar starting at `text[start]` (the quote). Returns the value and the index after
 * the closing quote, or `null` when the quote is not closed in `text`.
 */
function readQuoted(text: string, start: number, line: number): [string, number] | null {
  const quote = text[start];
  let out = '';
  let i = start + 1;
  while (i < text.length) {
    const c = text[i]!;
    if (quote === "'") {
      if (c === "'") {
        if (text[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        return [out, i + 1];
      }
      out += c;
      i++;
      continue;
    }
    if (c === '"') return [out, i + 1];
    if (c === '\\') {
      const e = text[i + 1];
      if (e === undefined) return null;
      if (e === 'x' || e === 'u' || e === 'U') {
        const len = e === 'x' ? 2 : e === 'u' ? 4 : 8;
        const hex = text.slice(i + 2, i + 2 + len);
        if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) {
          throw new YamlError(line, 'invalid escape sequence in a double-quoted scalar');
        }
        out += String.fromCodePoint(parseInt(hex, 16));
        i += 2 + len;
        continue;
      }
      if (e === '\n') {
        i += 2;
        while (text[i] === ' ' || text[i] === '\t') i++;
        continue;
      }
      const mapped = ESCAPES[e];
      if (mapped === undefined) {
        throw new YamlError(line, 'invalid escape sequence in a double-quoted scalar');
      }
      out += mapped;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return null;
}

/** Folds the line breaks of a multi-line quoted or plain scalar: one break becomes a space. */
function foldLines(parts: readonly string[]): string {
  let out = '';
  let pendingBreaks = 0;
  for (const [index, part] of parts.entries()) {
    const t = index === 0 ? part.trimEnd() : part.trim();
    if (index > 0 && t === '') {
      pendingBreaks++;
      continue;
    }
    if (index > 0) out += pendingBreaks > 0 ? '\n'.repeat(pendingBreaks) : ' ';
    pendingBreaks = 0;
    out += t;
  }
  return out;
}

/** Parser of a flow collection or flow scalar over a text that may hold several lines. */
class FlowParser {
  private pos = 0;

  constructor(
    private readonly text: string,
    private readonly firstLine: number,
  ) {}

  private lineAt(pos: number): number {
    let n = this.firstLine;
    for (let i = 0; i < pos && i < this.text.length; i++) if (this.text[i] === '\n') n++;
    return n;
  }

  private fail(message: string, pos = this.pos): never {
    throw new YamlError(this.lineAt(pos), message);
  }

  private skipSpace(): void {
    while (this.pos < this.text.length) {
      const c = this.text[this.pos]!;
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        this.pos++;
      } else if (c === '#' && (this.pos === 0 || /[ \t\n]/.test(this.text[this.pos - 1] ?? ''))) {
        while (this.pos < this.text.length && this.text[this.pos] !== '\n') this.pos++;
      } else {
        return;
      }
    }
  }

  /** Parses one flow value and returns the rest of the text after it. */
  parseTop(): { value: YamlValue; rest: string } {
    const value = this.value();
    return { value, rest: this.text.slice(this.pos) };
  }

  private value(): YamlValue {
    this.skipSpace();
    const c = this.text[this.pos];
    if (c === undefined) this.fail('missing value');
    if (c === '[') return this.sequence();
    if (c === '{') return this.mapping();
    if (c === '"' || c === "'") {
      const start = this.pos;
      const read = readQuoted(this.text, this.pos, this.lineAt(start));
      if (!read) this.fail('quoted scalar is not closed', start);
      this.pos = read[1];
      return foldLines(read[0].split('\n'));
    }
    if (UNSUPPORTED_START.test(c)) this.fail('unsupported YAML feature (anchor, alias or tag)');
    return this.plain();
  }

  private plain(): YamlValue {
    const start = this.pos;
    while (this.pos < this.text.length) {
      const c = this.text[this.pos]!;
      if (c === ',' || c === ']' || c === '}' || c === '[' || c === '{') break;
      if (c === ':' && /[\s,\]}]/.test(this.text[this.pos + 1] ?? ' ')) break;
      if (c === '#' && /[ \t\n]/.test(this.text[this.pos - 1] ?? '')) break;
      this.pos++;
    }
    const raw = this.text.slice(start, this.pos);
    return resolvePlain(foldLines(raw.split('\n')).trim());
  }

  private sequence(): YamlValue[] {
    const open = this.pos;
    this.pos++;
    const out: YamlValue[] = [];
    for (;;) {
      this.skipSpace();
      const c = this.text[this.pos];
      if (c === undefined) this.fail('flow sequence is not closed', open);
      if (c === ']') {
        this.pos++;
        return out;
      }
      out.push(this.value());
      this.skipSpace();
      const next = this.text[this.pos];
      if (next === ',') this.pos++;
      else if (next === ']') continue;
      else if (next === undefined) this.fail('flow sequence is not closed', open);
      else this.fail(`unexpected "${next}" in a flow sequence`);
    }
  }

  private mapping(): { [key: string]: YamlValue } {
    const open = this.pos;
    this.pos++;
    const out: { [key: string]: YamlValue } = {};
    for (;;) {
      this.skipSpace();
      const c = this.text[this.pos];
      if (c === undefined) this.fail('flow mapping is not closed', open);
      if (c === '}') {
        this.pos++;
        return out;
      }
      const keyPos = this.pos;
      const key = this.value();
      if (key !== null && typeof key === 'object') this.fail('unsupported complex key', keyPos);
      const name = key === null ? '' : String(key);
      this.skipSpace();
      let value: YamlValue = null;
      if (this.text[this.pos] === ':') {
        this.pos++;
        this.skipSpace();
        const after = this.text[this.pos];
        if (after !== ',' && after !== '}') value = this.value();
      }
      if (Object.hasOwn(out, name)) this.fail(`duplicate key "${name}"`, keyPos);
      out[name] = value;
      this.skipSpace();
      const next = this.text[this.pos];
      if (next === ',') this.pos++;
      else if (next === '}') continue;
      else if (next === undefined) this.fail('flow mapping is not closed', open);
      else this.fail(`unexpected "${next}" in a flow mapping`);
    }
  }
}

/** Block-structure parser over the lines of one YAML document. */
class BlockParser {
  private readonly lines: Line[];
  private i = 0;

  constructor(
    private readonly raw: readonly string[],
    private readonly firstLine: number,
  ) {
    this.lines = [];
    raw.forEach((text, index) => {
      const no = firstLine + index;
      const lead = /^[ \t]*/.exec(text)![0];
      if (lead.includes('\t') && !isBlankOrComment(text)) {
        throw new YamlError(no, 'tab character in indentation');
      }
      this.lines.push({ no, indent: lead.length, text: text.slice(lead.length).trimEnd() });
    });
  }

  private skip(): void {
    while (this.i < this.lines.length && isBlankOrComment(this.lines[this.i]!.text)) this.i++;
  }

  private current(): Line | undefined {
    this.skip();
    return this.lines[this.i];
  }

  parseDocument(): YamlValue {
    const first = this.current();
    if (!first) return null;
    const value = this.block(first.indent);
    const left = this.current();
    if (left) throw new YamlError(left.no, 'unexpected content (bad indentation)');
    return value;
  }

  private block(indent: number): YamlValue {
    const line = this.current()!;
    if (line.indent !== indent) throw new YamlError(line.no, 'bad indentation');
    if (isSequenceItem(line.text)) return this.sequence(indent);
    if (mappingKey(line.text, line.no) !== null) return this.mapping(indent);
    this.i++;
    return this.inline(line.text, line, indent - 1);
  }

  private mapping(indent: number): { [key: string]: YamlValue } {
    const out: { [key: string]: YamlValue } = {};
    for (;;) {
      const line = this.current();
      if (!line || line.indent < indent) return out;
      if (line.indent > indent) throw new YamlError(line.no, 'bad indentation');
      const entry = mappingKey(line.text, line.no);
      if (entry === null) {
        throw new YamlError(line.no, 'expected a "key: value" entry of the mapping');
      }
      if (Object.hasOwn(out, entry.key)) {
        throw new YamlError(line.no, `duplicate key "${entry.key}"`);
      }
      this.i++;
      out[entry.key] = this.valueAfterIndicator(entry.rest, line, indent, true);
    }
  }

  private sequence(indent: number): YamlValue[] {
    const out: YamlValue[] = [];
    for (;;) {
      const line = this.current();
      if (!line || line.indent < indent) return out;
      if (line.indent > indent) throw new YamlError(line.no, 'bad indentation');
      if (!isSequenceItem(line.text)) return out;
      const rest = line.text.slice(1);
      const content = rest.trimStart();
      if (content !== '' && !content.startsWith('#') && mappingKey(content, line.no) !== null) {
        // A compact mapping inside the item: re-read this line as its first entry.
        line.indent = indent + 1 + (rest.length - content.length);
        line.text = content;
        out.push(this.mapping(line.indent));
        continue;
      }
      this.i++;
      out.push(this.valueAfterIndicator(content, line, indent, false));
    }
  }

  /** The value after `key:` or `- `; `rest` is the text that follows on the same line. */
  private valueAfterIndicator(
    rest: string,
    line: Line,
    indent: number,
    inMapping: boolean,
  ): YamlValue {
    if (rest === '' || rest.startsWith('#')) {
      const next = this.current();
      if (next && next.indent > indent) return this.block(next.indent);
      if (inMapping && next && next.indent === indent && isSequenceItem(next.text)) {
        return this.sequence(indent);
      }
      return null;
    }
    return this.inline(rest, line, indent);
  }

  /** A value written on the line of its key or dash, possibly continued on later lines. */
  private inline(text: string, line: Line, indent: number): YamlValue {
    const c = text[0]!;
    if (c === '[' || c === '{' || c === '"' || c === "'") return this.flow(text, line, indent);
    if (c === '|' || c === '>') return this.blockScalar(text, line, indent);
    if (UNSUPPORTED_START.test(c)) {
      throw new YamlError(line.no, 'unsupported YAML feature (anchor, alias, tag or directive)');
    }
    if (c === '-' && isSequenceItem(text)) {
      throw new YamlError(line.no, 'a block sequence is not allowed here');
    }
    const parts = [stripComment(text)];
    if (mappingKey(parts[0]!, line.no) !== null) {
      throw new YamlError(line.no, 'mapping values are not allowed here');
    }
    let last = line.no;
    for (;;) {
      const next = this.current();
      if (!next || next.indent <= indent) break;
      for (let gap = last + 1; gap < next.no; gap++) parts.push('');
      const more = stripComment(next.text);
      if (mappingKey(more, next.no) !== null) {
        throw new YamlError(next.no, 'mapping values are not allowed here');
      }
      parts.push(more);
      last = next.no;
      this.i++;
    }
    return resolvePlain(foldLines(parts));
  }

  /**
   * A flow collection or quoted scalar; later lines are added until it is closed. Those lines must
   * be indented more than the block that holds the value (YAML 1.2 §7.3, §7.4); a less indented
   * line ends the value, which is then reported as not closed on its first line.
   */
  private flow(text: string, line: Line, indent: number): YamlValue {
    let joined = text;
    let consumed = 0;
    const startIndex = this.i;
    for (;;) {
      try {
        const { value, rest } = new FlowParser(joined, line.no).parseTop();
        const tail = rest.replace(/^[ \t\n]+/, '');
        if (tail !== '' && !tail.startsWith('#')) {
          throw new YamlError(line.no + consumed, `unexpected text after a value: "${tail}"`);
        }
        this.i = startIndex + consumed;
        return value;
      } catch (error) {
        const notClosed = error instanceof YamlError && /is not closed$/.test(error.message);
        const next = this.lines[startIndex + consumed];
        if (!notClosed || next === undefined) throw error;
        const raw = this.raw[startIndex + consumed]!;
        if (raw.trim() !== '' && next.indent <= indent) throw error;
        joined += `\n${raw}`;
        consumed++;
      }
    }
  }

  private blockScalar(text: string, line: Line, indent: number): string {
    const header = /^([|>])([1-9])?([+-])?([1-9])?\s*(#.*)?$/.exec(text);
    if (!header) throw new YamlError(line.no, 'invalid block scalar header');
    const literal = header[1] === '|';
    const chomp = header[3] ?? '';
    const explicit = header[2] ?? header[4];
    const body: string[] = [];
    let contentIndent = explicit ? indent + Number(explicit) : -1;
    while (this.i < this.lines.length) {
      const l = this.lines[this.i]!;
      const raw = this.raw[l.no - this.firstLine]!;
      if (raw.trim() === '') {
        body.push('');
        this.i++;
        continue;
      }
      const lead = /^ */.exec(raw)![0].length;
      if (contentIndent < 0) {
        if (lead <= indent) break;
        contentIndent = lead;
      }
      if (lead < contentIndent) break;
      body.push(raw.slice(contentIndent));
      this.i++;
    }
    let trailing = 0;
    while (body.length > 0 && body[body.length - 1] === '') {
      body.pop();
      trailing++;
    }
    let value = literal ? body.join('\n') : foldBlock(body);
    if (body.length > 0) {
      if (chomp === '+') value += '\n'.repeat(trailing + 1);
      else if (chomp !== '-') value += '\n';
    }
    return value;
  }
}

function foldBlock(body: readonly string[]): string {
  let out = '';
  for (const [index, l] of body.entries()) {
    if (index === 0) {
      out = l;
      continue;
    }
    const prev = body[index - 1]!;
    if (l === '' || prev === '' || /^\s/.test(l) || /^\s/.test(prev)) out += `\n${l}`;
    else out += ` ${l}`;
  }
  return out;
}

function isSequenceItem(text: string): boolean {
  return text === '-' || text.startsWith('- ') || text.startsWith('-\t');
}

/**
 * The key and the rest of a block mapping entry (`key: rest`), or `null` when the text is not one.
 */
function mappingKey(text: string, line: number): { key: string; rest: string } | null {
  if (text.startsWith('"') || text.startsWith("'")) {
    const read = readQuoted(text, 0, line);
    if (!read) return null;
    const after = text.slice(read[1]);
    const m = /^[ \t]*:(?:[ \t]+|$)/.exec(after);
    if (!m) return null;
    return { key: read[0], rest: after.slice(m[0].length).trim() };
  }
  if (text.startsWith('[') || text.startsWith('{') || text.startsWith('#')) return null;
  if (text.startsWith('? ')) throw new YamlError(line, 'unsupported complex key');
  const m = /:(?:[ \t]+|$)/.exec(text);
  if (!m) return null;
  const key = text.slice(0, m.index);
  if (/(^|[ \t])#/.test(key)) return null;
  return { key: key.trimEnd(), rest: text.slice(m.index + m[0].length).trim() };
}

/** Parses the lines of a YAML document; `firstLine` is the file line of `lines[0]`. */
export function parseYaml(lines: readonly string[], firstLine = 1): YamlValue {
  return new BlockParser(lines, firstLine).parseDocument();
}

export type Frontmatter =
  /** The file does not start with a `---` line. */
  | { readonly kind: 'none' }
  /** The `---` block has no closing `---` or `...` line. */
  | { readonly kind: 'unclosed' }
  /** The block is not YAML; `line` is the file line of the fault. */
  | { readonly kind: 'invalid'; readonly line: number; readonly message: string }
  | {
      readonly kind: 'ok';
      readonly data: YamlValue;
      /** The 1-based file line of the closing fence; the body starts on the next line. */
      readonly closingLine: number;
    };

/** Reads the YAML frontmatter at the top of `lines` (the LF-split lines of a file). */
export function readFrontmatter(lines: readonly string[]): Frontmatter {
  if (lines.length === 0 || lines[0]!.trimEnd() !== '---') return { kind: 'none' };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i]!.trimEnd();
    if (t === '---' || t === '...') {
      close = i;
      break;
    }
  }
  if (close < 0) return { kind: 'unclosed' };
  try {
    return { kind: 'ok', data: parseYaml(lines.slice(1, close), 2), closingLine: close + 1 };
  } catch (error) {
    if (error instanceof YamlError) {
      return { kind: 'invalid', line: error.line, message: error.message };
    }
    throw error;
  }
}

/** The mapping of a frontmatter value, or `null` when it is not a mapping. */
export function asMapping(value: YamlValue): { [key: string]: YamlValue } | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** A scalar frontmatter value as text (`null` for a missing, null, empty or non-scalar value). */
export function scalarText(value: YamlValue | undefined): string | null {
  if (value === undefined || value === null || typeof value === 'object') return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/** The scalar entries of a sequence value as text; a single scalar counts as a sequence of one. */
export function textList(value: YamlValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((v) => {
    const t = scalarText(v);
    return t === null ? [] : [t];
  });
}
