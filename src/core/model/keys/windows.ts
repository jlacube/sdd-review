import { createRequire } from 'node:module';
import type { CredentialReader, ReaderResult } from './key-source.js';

/**
 * The Windows Credential Manager reader (C001-ADR-008 §1, Windows 11 row): a generic credential
 * (`CRED_TYPE_GENERIC`) whose target name is `<service>/<account>`, read in process with
 * `CredReadW` through koffi (MIT, `docs/compliance/licence-and-version-report.md` N-01, N-03). The
 * blob is decoded as UTF-16LE when every second byte is zero (what `cmdkey /generic` writes), else
 * as UTF-8. `ERROR_NOT_FOUND` is "not found"; every other error is a store that cannot be opened.
 * The credential is freed with `CredFree` at once; the reader never writes to the store.
 */

export const CRED_TYPE_GENERIC = 1;

export const CRED_ERROR = {
  ACCESS_DENIED: 5,
  NOT_FOUND: 1168,
  NO_SUCH_LOGON_SESSION: 1312,
} as const;

/** UTF-16LE when the blob has an even length and every second byte is zero, else UTF-8. */
export function decodeCredentialBlob(blob: Uint8Array): string {
  let utf16 = blob.length > 0 && blob.length % 2 === 0;
  for (let i = 1; utf16 && i < blob.length; i += 2) {
    if (blob[i] !== 0) utf16 = false;
  }
  return Buffer.from(blob.buffer, blob.byteOffset, blob.length).toString(
    utf16 ? 'utf16le' : 'utf8',
  );
}

/** The reader result of a failed `CredReadW` call. */
export function classifyCredReadError(error: number): ReaderResult {
  const detail = `Win32 error ${error}`;
  if (error === CRED_ERROR.NOT_FOUND) return { found: false, cause: 'not found', detail };
  if (error === CRED_ERROR.ACCESS_DENIED) return { found: false, cause: 'access denied', detail };
  return { found: false, cause: 'store unavailable', detail };
}

interface CredApi {
  /** The blob of the generic credential `target`, or the Win32 error code. */
  read(target: string): Uint8Array | number;
}

let api: CredApi | undefined;

/** Binds advapi32 through koffi on first use. Throws when it cannot be loaded. */
function bind(): CredApi {
  if (api) return api;
  const require = createRequire(import.meta.url);
  const koffi = require('koffi') as typeof import('koffi');
  const FILETIME = koffi.struct('SDD_FILETIME', {
    dwLowDateTime: 'uint32_t',
    dwHighDateTime: 'uint32_t',
  });
  const CREDENTIALW = koffi.struct('SDD_CREDENTIALW', {
    Flags: 'uint32_t',
    Type: 'uint32_t',
    TargetName: 'void *',
    Comment: 'void *',
    LastWritten: FILETIME,
    CredentialBlobSize: 'uint32_t',
    CredentialBlob: 'void *',
    Persist: 'uint32_t',
    AttributeCount: 'uint32_t',
    Attributes: 'void *',
    TargetAlias: 'void *',
    UserName: 'void *',
  });
  const advapi32 = koffi.load('advapi32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const CredReadW = advapi32.func('__stdcall', 'CredReadW', 'int', [
    'str16',
    'uint32_t',
    'uint32_t',
    koffi.out(koffi.pointer('void *')),
  ]);
  const CredFree = advapi32.func('void __stdcall CredFree(void *buffer)');
  const GetLastError = kernel32.func('uint32_t __stdcall GetLastError()');
  api = {
    read(target) {
      const out: unknown[] = [null];
      const ok = CredReadW(target, CRED_TYPE_GENERIC, 0, out) as number;
      if (!ok) return GetLastError() as number;
      const pointer = out[0];
      try {
        const cred = koffi.decode(pointer, CREDENTIALW) as {
          CredentialBlobSize: number;
          CredentialBlob: unknown;
        };
        const size = cred.CredentialBlobSize;
        if (size === 0 || cred.CredentialBlob === null) return new Uint8Array(0);
        // Copied out of the credential before CredFree releases it.
        return new Uint8Array(koffi.view(cred.CredentialBlob, size).slice(0));
      } finally {
        CredFree(pointer);
      }
    },
  };
  return api;
}

export class WindowsCredentialReader implements CredentialReader {
  async read(service: string, account: string): Promise<ReaderResult> {
    let cred: CredApi;
    try {
      cred = bind();
    } catch (error) {
      const name = error instanceof Error ? error.name : typeof error;
      return { found: false, cause: 'store unavailable', detail: `CredReadW not bound: ${name}` };
    }
    const blob = cred.read(`${service}/${account}`);
    if (typeof blob === 'number') return classifyCredReadError(blob);
    try {
      return { found: true, secret: decodeCredentialBlob(blob) };
    } finally {
      blob.fill(0);
    }
  }
}
