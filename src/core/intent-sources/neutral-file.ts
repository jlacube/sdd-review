import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import type { DocumentedArchitecture, SpecItem } from '../../generated/analysis-results.js';
import type {
  NeutralIntentAndArchitectureFileC001IF006 as NeutralDocument,
  SpecItem as NeutralItem,
} from '../../generated/workspace.js';
import { WORKSPACE_SCHEMA } from '../../generated/workspace-schema.js';
import { ReviewError } from '../errors/review-error.js';
import type { WorkspaceChange } from './sdd-workspace.js';
import { lineRange, textHash } from './text.js';
import type { LinesRead, SourceTree } from './tree.js';

/**
 * The neutral intent-and-architecture file `.sdd-review/workspace.json` (C001-IF-007 §5,
 * C001-IF-006): validated against its schema, its SDD changes become SDD changes of the intent
 * context and its `architecture` the documented architecture (C001-REQ-111, C001-REQ-207). A file
 * that is not JSON or does not validate stops intake with ERR-SDD-003, which names the file, the
 * line and JSON pointer of the first nonconformity in document order and the reason
 * (C001-REQ-124). The text of the file is data: nothing in it is followed (C001-CON-20).
 */

export const NEUTRAL_FILE = '.sdd-review/workspace.json';

/** The place the error message gives for the document as a whole (JSON pointer ""). */
export const DOCUMENT_ROOT = 'document root';

/** The first nonconformity of a neutral file. */
export interface NeutralFault {
  /** 1-based line of the nonconformity. */
  readonly line: number;
  /** RFC 6901 JSON pointer; `''` for the document root. */
  readonly pointer: string;
  readonly reason: string;
}

/** Offsets in the decoded text of one JSON value: `end` is exclusive. */
interface Span {
  readonly start: number;
  readonly end: number;
  /** The offset of the member name, for a value that is the value of an object member. */
  readonly key?: number;
}

class SyntaxStop {
  constructor(
    readonly at: number,
    readonly reason: string,
  ) {}
}

/** RFC 6901 escaping of one reference token. */
function token(name: string | number): string {
  return String(name).replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Parses JSON text (RFC 8259) and records the span of every value by its JSON pointer. A repeated
 * member name keeps the last value, as `JSON.parse` does. Throws `SyntaxStop` at the first error.
 */
function parseWithSpans(text: string): { value: unknown; spans: Map<string, Span> } {
  const spans = new Map<string, Span>();
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++;
  };
  const describe = () => (i >= text.length ? 'end of file' : JSON.stringify(text[i]));
  const fail = (reason: string): never => {
    throw new SyntaxStop(i, reason);
  };

  const string = (): string => {
    const start = i;
    i++; // opening quote
    for (;;) {
      if (i >= text.length) fail('unterminated string');
      const c = text[i]!;
      if (c === '"') {
        i++;
        return JSON.parse(text.slice(start, i)) as string;
      }
      if (c.charCodeAt(0) < 0x20) fail('control character in string');
      if (c === '\\') {
        const e = text[i + 1];
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail('invalid \\u escape');
          i += 6;
        } else if (e !== undefined && '"\\/bfnrt'.includes(e)) i += 2;
        else fail('invalid escape in string');
      } else i++;
    }
  };

  const value = (pointer: string, key?: number): unknown => {
    ws();
    const start = i;
    const c = text[i];
    let out: unknown;
    if (c === '{') {
      i++;
      const object: Record<string, unknown> = {};
      ws();
      if (text[i] === '}') i++;
      else {
        for (;;) {
          ws();
          if (text[i] !== '"') fail(`expected a member name, found ${describe()}`);
          const at = i;
          const name = string();
          ws();
          if (text[i] !== ':') fail(`expected ":" after a member name, found ${describe()}`);
          i++;
          object[name] = value(`${pointer}/${token(name)}`, at);
          ws();
          if (text[i] === ',') {
            i++;
            continue;
          }
          if (text[i] === '}') {
            i++;
            break;
          }
          fail(`expected "," or "}", found ${describe()}`);
        }
      }
      out = object;
    } else if (c === '[') {
      i++;
      const array: unknown[] = [];
      ws();
      if (text[i] === ']') i++;
      else {
        for (;;) {
          array.push(value(`${pointer}/${array.length}`));
          ws();
          if (text[i] === ',') {
            i++;
            continue;
          }
          if (text[i] === ']') {
            i++;
            break;
          }
          fail(`expected "," or "]", found ${describe()}`);
        }
      }
      out = array;
    } else if (c === '"') {
      out = string();
    } else if (c !== undefined && /[-0-9]/.test(c)) {
      const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (!m) fail('invalid number');
      i += m![0].length;
      out = Number(m![0]);
    } else {
      const literal = (['true', 'false', 'null'] as const).find((l) => text.startsWith(l, i));
      if (!literal) fail(`unexpected ${describe()}`);
      i += literal!.length;
      out = literal === 'null' ? null : literal === 'true';
    }
    spans.set(pointer, key === undefined ? { start, end: i } : { start, end: i, key });
    return out;
  };

  const document = value('');
  ws();
  if (i < text.length) fail(`unexpected ${describe()} after the end of the document`);
  return { value: document, spans };
}

/** 1-based line of an offset. */
function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let k = 0; k < offset && k < text.length; k++) if (text.charCodeAt(k) === 10) line++;
  return line;
}

let compiled: ValidateFunction | undefined;
function validator(): ValidateFunction {
  // allErrors: every nonconformity is found, so that the first in document order can be named.
  compiled ??= new Ajv2020({ strict: false, allErrors: true }).compile(WORKSPACE_SCHEMA);
  return compiled;
}

/** The place, offset and reason of one schema error. */
function placeOf(error: ErrorObject, spans: ReadonlyMap<string, Span>) {
  const params = error.params as Record<string, unknown>;
  const node = spans.get(error.instancePath);
  let pointer = error.instancePath;
  let at = node?.start ?? 0;
  let reason = error.message ?? 'is not valid';
  if (error.keyword === 'additionalProperties' && typeof params.additionalProperty === 'string') {
    pointer += `/${token(params.additionalProperty)}`;
    at = spans.get(pointer)?.key ?? at;
    reason = 'is not a member of the neutral file format (C001-IF-006)';
  } else if (error.keyword === 'required' && typeof params.missingProperty === 'string') {
    // A missing member has no place of its own: its object is where it is missed.
    pointer += `/${token(params.missingProperty)}`;
    reason = 'is required';
  } else if (error.keyword === 'enum' && Array.isArray(params.allowedValues)) {
    reason = `must be one of ${params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`;
  } else if (error.keyword === 'const') {
    reason = `must be ${JSON.stringify(params.allowedValue)}`;
  }
  return { pointer, at, reason };
}

export type NeutralParse =
  | {
      readonly valid: true;
      readonly document: NeutralDocument;
      readonly text: string;
      readonly spans: ReadonlyMap<string, Span>;
    }
  | { readonly valid: false; readonly fault: NeutralFault };

/**
 * Validates the bytes of a neutral file: UTF-8 (a byte-order mark is removed), JSON, then
 * `formatVersion` (a file of another format version is not judged by this version's schema), then
 * the schema of C001-IF-006. Of several nonconformities the first in document order is given.
 */
export function parseNeutralFile(bytes: Uint8Array): NeutralParse {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return { valid: false, fault: { line: 1, pointer: '', reason: 'the file is not UTF-8 text' } };
  }
  let parsed: { value: unknown; spans: Map<string, Span> };
  try {
    parsed = parseWithSpans(text);
  } catch (error) {
    if (!(error instanceof SyntaxStop)) throw error;
    const reason = `the file is not JSON: ${error.reason}`;
    return { valid: false, fault: { line: lineAt(text, error.at), pointer: '', reason } };
  }
  const { value, spans } = parsed;

  const version =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).formatVersion
      : 1;
  if (version !== undefined && version !== 1) {
    const at = spans.get('/formatVersion')!.start;
    const reason = `must be 1: format version ${JSON.stringify(version)} is not supported`;
    return { valid: false, fault: { line: lineAt(text, at), pointer: '/formatVersion', reason } };
  }

  const validate = validator();
  if (!validate(value)) {
    const places = validate.errors!.map((e) => placeOf(e, spans));
    // Document order; on the same offset the error the validator met first.
    const first = places.reduce((a, b) => (b.at < a.at ? b : a));
    return {
      valid: false,
      fault: { line: lineAt(text, first.at), pointer: first.pointer, reason: first.reason },
    };
  }
  return { valid: true, document: value as NeutralDocument, text, spans };
}

/** The documented architecture of a neutral file with the lines it is read from (§4 item 6). */
export interface NeutralArchitecture {
  readonly documented: DocumentedArchitecture;
  /** Every line of the value of the `architecture` member. */
  readonly linesRead: LinesRead;
  /** The lines of each component's JSON object, by component ID. */
  readonly componentLines: ReadonlyMap<string, LinesRead>;
}

/** What a valid neutral file gives the intent context. */
export interface NeutralReading {
  readonly file: string;
  /** The name and version of the tool that wrote the file, when it says. */
  readonly producer: string | null;
  /** Its SDD changes, open and archived, with their spec items (§5 item 2). */
  readonly changes: readonly WorkspaceChange[];
  readonly architecture: NeutralArchitecture | null;
}

/** The SDD changes and the architecture of a valid neutral file. */
export function neutralReading(parse: Extract<NeutralParse, { valid: true }>): NeutralReading {
  const { document, text, spans } = parse;
  const file = NEUTRAL_FILE;
  const linesOf = (pointer: string): number[] => {
    const span = spans.get(pointer)!;
    return lineRange(lineAt(text, span.start), lineAt(text, span.end - 1));
  };

  const changes = document.changes.map((change, c): WorkspaceChange => {
    const items: SpecItem[] = [];
    const linesRead = new Map<string, LinesRead>();
    change.items.forEach((item: NeutralItem, k) => {
      const pointer = `/changes/${c}/items/${k}`;
      if (linesRead.has(item.id)) return; // a repeated ID within the change: the first is kept
      const lines = linesOf(pointer);
      const itemText = item.text ?? '';
      items.push({
        id: item.id,
        kind: item.kind,
        title: item.title,
        text: itemText,
        textHash: textHash(itemText),
        links: (item.links ?? []).map((l) => ({ to: l.to, type: l.type })),
        files: [...(item.files ?? [])],
        location: { path: file, line: lines[0]! },
      } as SpecItem);
      linesRead.set(item.id, { path: file, lines });
    });
    return {
      id: change.id,
      title: change.title,
      origin: 'neutral-file',
      folder: file,
      status: change.status,
      profile: null,
      phase: null,
      phases: {},
      open: change.status === 'open',
      items,
      linesRead,
    };
  });

  let architecture: NeutralArchitecture | null = null;
  if (document.architecture) {
    const componentLines = new Map<string, LinesRead>();
    const components: DocumentedArchitecture['components'] = [];
    document.architecture.components.forEach((component, k) => {
      if (componentLines.has(component.id)) return; // a repeated ID: the first component is kept
      componentLines.set(component.id, {
        path: file,
        lines: linesOf(`/architecture/components/${k}`),
      });
      components.push({
        id: component.id,
        name: component.name,
        layer: component.layer ?? null,
        paths: [...new Set(component.paths)],
        allowedDependencies: [...new Set(component.dependsOn ?? [])].filter(
          (d) => d !== component.id,
        ),
      });
    });
    architecture = {
      documented: {
        origin: 'neutral-file',
        location: file,
        layers: [...(document.architecture.layers ?? [])],
        components,
      },
      linesRead: { path: file, lines: linesOf('/architecture') },
      componentLines,
    };
  }
  return { file, producer: document.producer ?? null, changes, architecture };
}

/** ERR-SDD-003 for the first nonconformity of the neutral file. */
export function invalidNeutralFile(fault: NeutralFault, file = NEUTRAL_FILE): ReviewError {
  const place = fault.pointer === '' ? DOCUMENT_ROOT : fault.pointer;
  return new ReviewError('ERR-SDD-003', {
    operation: 'read-neutral-file',
    inputs: { file, line: fault.line, pointer: fault.pointer },
    params: { path: file, n: fault.line, 'JSON pointer': place, reason: fault.reason },
    cause: `${place}: ${fault.reason}`,
  });
}

/**
 * Reads the neutral file of a tree, `null` when the tree holds none. On the snapshot side
 * (`strict`), a file that cannot be read or does not conform throws ERR-SDD-003; at the base commit,
 * which is read only for the lines read there, such a file counts as absent.
 */
export async function readNeutralFile(
  tree: SourceTree,
  strict: boolean,
): Promise<NeutralReading | null> {
  if (!tree.paths.includes(NEUTRAL_FILE)) return null;
  const bytes = await tree.read(NEUTRAL_FILE);
  const parse: NeutralParse =
    bytes === null
      ? { valid: false, fault: { line: 1, pointer: '', reason: 'the file cannot be read' } }
      : parseNeutralFile(bytes);
  if (!parse.valid) {
    if (strict) throw invalidNeutralFile(parse.fault);
    return null;
  }
  return neutralReading(parse);
}
