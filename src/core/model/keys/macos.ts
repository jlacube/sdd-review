import { spawn } from 'node:child_process';
import type { CredentialReader, ReaderResult } from './key-source.js';

/**
 * The macOS Keychain reader (C001-ADR-008 §1, macOS 14+ row): a generic password item with
 * service `<service>` and account `<account>` in any keychain of the user's search list, read with
 * `/usr/bin/security find-generic-password -s <service> -a <account> -w`, started without a shell,
 * the values passed as separate arguments. The secret is read from standard output, which is never
 * logged; standard error holds only the program's error text.
 *
 * Exit status 44 is "not found" (errSecItemNotFound, -25300, as the program's 8-bit status). Any
 * other non-zero status, including a locked keychain in an SSH session, is a store that cannot be
 * opened; no answer within 30 s (a dialog for an item that does not trust `security`) ends the
 * process and also counts as no key.
 */

export const SECURITY_PROGRAM = '/usr/bin/security';
export const SECURITY_TIMEOUT_MS = 30_000;

/** `security` exits with the low 8 bits of the Security framework's OSStatus. */
export const SECURITY_EXIT = {
  /** errSecItemNotFound (-25300). */
  ITEM_NOT_FOUND: 44,
  /** errSecInteractionNotAllowed (-25308): a locked keychain without a user interface. */
  INTERACTION_NOT_ALLOWED: 36,
  /** errSecAuthFailed (-25293). */
  AUTH_FAILED: 51,
} as const;

/** What one run of the program gave; recorded results drive the unit tests. */
export interface SecurityRun {
  /** Exit status, or null when the process was ended (timeout) or could not start. */
  readonly status: number | null;
  readonly stdout: string;
  readonly timedOut: boolean;
  /** The start error's code (for example ENOENT), when the program could not start. */
  readonly startError?: string;
}

/** The reader result of one run of `security find-generic-password -w`. */
export function classifySecurityRun(run: SecurityRun): ReaderResult {
  if (run.timedOut) {
    return {
      found: false,
      cause: 'timed out',
      detail: `no answer within ${SECURITY_TIMEOUT_MS} ms`,
    };
  }
  if (run.startError !== undefined) {
    return { found: false, cause: 'store unavailable', detail: `cannot start: ${run.startError}` };
  }
  const detail = `exit status ${run.status}`;
  switch (run.status) {
    case 0:
      return { found: true, secret: run.stdout };
    case SECURITY_EXIT.ITEM_NOT_FOUND:
      return { found: false, cause: 'not found', detail };
    case SECURITY_EXIT.INTERACTION_NOT_ALLOWED:
      return { found: false, cause: 'locked', detail };
    case SECURITY_EXIT.AUTH_FAILED:
      return { found: false, cause: 'access denied', detail };
    default:
      return { found: false, cause: 'store unavailable', detail };
  }
}

export interface MacosKeychainReaderOptions {
  readonly program?: string;
  /** Arguments put before the program's own (tests stand in another program for `security`). */
  readonly prefixArgs?: readonly string[];
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
}

export class MacosKeychainReader implements CredentialReader {
  constructor(private readonly options: MacosKeychainReaderOptions = {}) {}

  async read(service: string, account: string): Promise<ReaderResult> {
    return classifySecurityRun(await this.run(service, account));
  }

  private run(service: string, account: string): Promise<SecurityRun> {
    const program = this.options.program ?? SECURITY_PROGRAM;
    const timeoutMs = this.options.timeoutMs ?? SECURITY_TIMEOUT_MS;
    const args = [
      ...(this.options.prefixArgs ?? []),
      'find-generic-password',
      '-s',
      service,
      '-a',
      account,
      '-w',
    ];
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let timedOut = false;
      let settled = false;
      const done = (run: SecurityRun) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(run);
      };
      const child = spawn(program, args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: this.options.env ?? process.env,
        windowsHide: true,
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.on('error', (error: NodeJS.ErrnoException) =>
        done({ status: null, stdout: '', timedOut: false, startError: error.code ?? error.name }),
      );
      child.on('close', (status) => {
        const out = Buffer.concat(chunks);
        const stdout = out.toString('utf8');
        out.fill(0);
        for (const chunk of chunks) chunk.fill(0);
        done({ status: timedOut ? null : status, stdout: timedOut ? '' : stdout, timedOut });
      });
    });
  }
}
