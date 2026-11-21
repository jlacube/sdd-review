import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Test entries in the real credential store of the machine (C001-ADR-008 §1 and §4), written the
 * way a developer writes them: `cmdkey` on Windows (or `CredWriteW` for a UTF-8 blob), `security`
 * with a temporary keychain added to the search list on macOS, `secret-tool` on Linux. Every entry
 * is removed by the cleanup function the writer returns. Only test keys are ever written.
 */

export type StoreWriter = (service: string, account: string, secret: string) => () => void;

/** A unique account name, so that parallel runs and leftovers never collide. */
export function testAccount(prefix = 't086'): string {
  return `${prefix}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------------------------
// Windows

function cmdkey(args: string[]): void {
  execFileSync('cmdkey', args, { stdio: 'ignore', windowsHide: true });
}

export const windowsWriter: StoreWriter = (service, account, secret) => {
  const target = `${service}/${account}`;
  cmdkey([`/generic:${target}`, `/user:${account}`, `/pass:${secret}`]);
  return () => {
    try {
      cmdkey([`/delete:${target}`]);
    } catch {
      /* already gone */
    }
  };
};

/** Writes a generic credential whose blob holds `blob` as is (for the UTF-8 case). */
export function windowsWriteBlob(service: string, account: string, blob: Buffer): () => void {
  const require = createRequire(import.meta.url);
  const koffi = require('koffi') as typeof import('koffi');
  const FILETIME = koffi.struct('SDD_TEST_FILETIME', { lo: 'uint32_t', hi: 'uint32_t' });
  const CREDENTIALW = koffi.struct('SDD_TEST_CREDENTIALW', {
    Flags: 'uint32_t',
    Type: 'uint32_t',
    TargetName: 'str16',
    Comment: 'str16',
    LastWritten: FILETIME,
    CredentialBlobSize: 'uint32_t',
    CredentialBlob: 'uint8_t *',
    Persist: 'uint32_t',
    AttributeCount: 'uint32_t',
    Attributes: 'void *',
    TargetAlias: 'str16',
    UserName: 'str16',
  });
  const advapi32 = koffi.load('advapi32.dll');
  const CredWriteW = advapi32.func('__stdcall', 'CredWriteW', 'int', [
    koffi.pointer(CREDENTIALW),
    'uint32_t',
  ]);
  const target = `${service}/${account}`;
  const ok = CredWriteW(
    {
      Flags: 0,
      Type: 1, // CRED_TYPE_GENERIC
      TargetName: target,
      Comment: null,
      LastWritten: { lo: 0, hi: 0 },
      CredentialBlobSize: blob.length,
      CredentialBlob: blob,
      Persist: 2, // CRED_PERSIST_LOCAL_MACHINE
      AttributeCount: 0,
      Attributes: null,
      TargetAlias: null,
      UserName: account,
    },
    0,
  ) as number;
  if (!ok) throw new Error('CredWriteW failed');
  return () => {
    try {
      cmdkey([`/delete:${target}`]);
    } catch {
      /* already gone */
    }
  };
}

// ---------------------------------------------------------------------------------------------
// macOS

const KEYCHAIN_PASSWORD = 'sdd-review-test';

function security(args: string[], input?: string): string {
  return execFileSync('/usr/bin/security', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** The user's keychain search list, as `security list-keychains -d user` prints it. */
function searchList(): string[] {
  return security(['list-keychains', '-d', 'user'])
    .split('\n')
    .map((line) => line.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

/** A temporary unlocked keychain added to the search list (C001-ADR-008 §4). */
export interface TemporaryKeychain {
  readonly path: string;
  readonly write: StoreWriter;
  lock(): void;
  /** Removes the keychain from the search list and deletes it. */
  remove(): void;
}

export function createTemporaryKeychain(): TemporaryKeychain {
  const dir = mkdtempSync(join(tmpdir(), 'sddkc-'));
  const path = join(dir, 'sdd-review-test.keychain-db');
  const before = searchList();
  security(['create-keychain', '-p', KEYCHAIN_PASSWORD, path]);
  security(['set-keychain-settings', path]); // no automatic lock
  security(['unlock-keychain', '-p', KEYCHAIN_PASSWORD, path]);
  security(['list-keychains', '-d', 'user', '-s', path, ...before]);
  return {
    path,
    write: (service, account, secret) => {
      security(['add-generic-password', '-U', '-s', service, '-a', account, '-w', secret, path]);
      return () => {
        spawnSync(
          '/usr/bin/security',
          ['delete-generic-password', '-s', service, '-a', account, path],
          {
            stdio: 'ignore',
          },
        );
      };
    },
    lock: () => security(['lock-keychain', path]),
    remove: () => {
      spawnSync('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...before], {
        stdio: 'ignore',
      });
      spawnSync('/usr/bin/security', ['delete-keychain', path], { stdio: 'ignore' });
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Linux

export const linuxWriter: StoreWriter = (service, account, secret) => {
  const r = spawnSync(
    'secret-tool',
    ['store', `--label=sdd-review test ${account}`, 'service', service, 'account', account],
    { input: secret, stdio: ['pipe', 'ignore', 'pipe'], encoding: 'utf8', timeout: 10_000 },
  );
  if (r.status !== 0) throw new Error(`secret-tool store failed: ${r.stderr || r.error?.message}`);
  return () => {
    spawnSync('secret-tool', ['clear', 'service', service, 'account', account], {
      stdio: 'ignore',
      timeout: 10_000,
    });
  };
};

/** Whether `program` can be started at all. */
export function hasProgram(program: string, args: string[] = ['--version']): boolean {
  const r = spawnSync(program, args, { stdio: 'ignore', timeout: 10_000 });
  return r.error === undefined;
}
