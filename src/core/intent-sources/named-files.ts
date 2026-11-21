import { readFile } from 'node:fs/promises';
import type { NamedFile } from '../../generated/analysis-results.js';
import { ReviewError } from '../errors/review-error.js';
import { textHash } from './text.js';

/**
 * The pull-request text, agent plans and agent transcripts the developer names at intake
 * (C001-IF-007 §7, C001-REQ-112): each is read from the local disk as data (C001-CON-20) and must
 * meet the text-file rule; a file that does not exist, cannot be read or is not a Markdown or
 * plain-text file stops intake with ERR-CTX-001, ERR-CTX-002 or ERR-CTX-003, naming the file and
 * the reason (C001-REQ-113).
 */

export type NamedFileRole = NamedFile['role'];

/** A file named at intake, by role (C001-IF-003 §3 `startReview`). */
export interface NamedFileRequest {
  readonly role: NamedFileRole;
  /** The path as given; a relative path is resolved against the process's current directory. */
  readonly path: string;
}

/** How the error messages name each role (C001-IF-007 §7 item 1). */
export const ROLE_NAMES: Readonly<Record<NamedFileRole, string>> = {
  'pull-request-text': 'pull-request text',
  'agent-plan': 'agent plan',
  'agent-transcript': 'agent transcript',
};

/** Reads the bytes of a file; the default reads the local disk. Tests pass their own. */
export type ReadBytes = (path: string) => Promise<Uint8Array>;

const OPERATION = 'read-named-files';
const HEAD_BYTES = 8 * 1024;
const MARKDOWN = /\.(md|markdown)$/i;

/**
 * A control character other than tab, line feed, form feed and carriage return: C0, DEL or C1.
 */
function isControl(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) return false;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

/** Why bytes do not meet the text-file rule (§7 item 2), or `null` when they meet it. */
export function textFileFault(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return 'it holds a NUL byte';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return 'it is not valid UTF-8';
  }
  // A character cut at the 8 KiB boundary decodes as U+FFFD, which is not a control character.
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, HEAD_BYTES));
  for (let k = 0; k < head.length; k++) {
    if (isControl(head.charCodeAt(k))) return 'its first 8 KiB hold a control character';
  }
  return null;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function causeText(error: unknown): string {
  const code = errorCode(error);
  if (code === 'EACCES' || code === 'EPERM') return 'permission denied';
  if (code === 'EISDIR') return 'it is a directory';
  return error instanceof Error ? error.message : String(error);
}

/** Reads one named file and checks the text-file rule; throws the ERR-CTX error that applies. */
export async function readNamedFile(
  request: NamedFileRequest,
  read: ReadBytes = (path) => readFile(path),
): Promise<NamedFile> {
  const { role, path } = request;
  const params = { file: path, role: ROLE_NAMES[role] };
  const inputs = { file: path, role };
  let bytes: Uint8Array;
  try {
    bytes = await read(path);
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new ReviewError('ERR-CTX-001', {
        operation: OPERATION,
        inputs,
        params,
        cause: error,
      });
    }
    const cause = causeText(error);
    throw new ReviewError('ERR-CTX-002', {
      operation: OPERATION,
      inputs,
      params: { ...params, cause },
      cause: error,
    });
  }
  const fault = textFileFault(bytes);
  if (fault !== null) {
    throw new ReviewError('ERR-CTX-003', { operation: OPERATION, inputs, params, cause: fault });
  }
  // The byte-order mark is removed (§7 item 2); the text is kept as the file holds it.
  const text = new TextDecoder('utf-8', { ignoreBOM: false }).decode(bytes);
  return {
    role,
    path,
    size: bytes.byteLength,
    format: MARKDOWN.test(path) ? 'markdown' : 'plain-text',
    text,
    textHash: textHash(text),
  } as NamedFile;
}

/**
 * Reads the named files in the order given. The first file that cannot be used stops the reading
 * with its error; nothing has been written at that point.
 */
export async function readNamedFiles(
  requests: readonly NamedFileRequest[],
  read?: ReadBytes,
): Promise<NamedFile[]> {
  const out: NamedFile[] = [];
  for (const request of requests) out.push(await readNamedFile(request, read));
  return out;
}
