import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EffectiveProvider } from '../../../../src/core/config/effective.js';
import {
  lookupKey,
  platformReader,
  type CredentialReader,
} from '../../../../src/core/model/keys/key-source.js';
import {
  SECRET_SERVICE_TIMEOUT_MS,
  SecretServiceReader,
} from '../../../../src/core/model/keys/linux.js';
import { MacosKeychainReader } from '../../../../src/core/model/keys/macos.js';
import { WindowsCredentialReader } from '../../../../src/core/model/keys/windows.js';
import {
  createTemporaryKeychain,
  hasProgram,
  linuxWriter,
  testAccount,
  windowsWriteBlob,
  windowsWriter,
  type StoreWriter,
  type TemporaryKeychain,
} from '../../../fixtures/credential-store.js';

// C001-TC-851 (C001-T-086): the real credential store of each CI runner (C001-ADR-008 §1 and §4).
// A test key stored under service `sdd-review` (and `sdd-review/<name>`, Amendment 1) in Windows
// Credential Manager, the macOS Keychain or the Linux Secret Service (gnome-keyring in a D-Bus
// session) is read by the reader of that OS. On Linux without a Secret Service the reader ends
// within its 5 s timeout and the environment variable is used (C001-RISK-018).
//
// A runner that offers no credential store skips the store tests with the reason in the test name.
// CI sets SDD_REQUIRE_CREDENTIAL_STORE=1 where it sets a store up; there a missing store fails.

const REQUIRE_STORE = process.env.SDD_REQUIRE_CREDENTIAL_STORE === '1';
const platform = process.platform;

function provider(name: string, over: Partial<EffectiveProvider> = {}): EffectiveProvider {
  return {
    name,
    api: 'anthropic-messages',
    endpoint: 'https://llm.cloud.test/v1',
    model: 'm',
    keyEnv: null,
    keyCredential: null,
    responseFormat: 'json_schema',
    maxOutputTokens: 4096,
    ...over,
  } as EffectiveProvider;
}

/** Why the store of this runner cannot be used by the tests, or null when it can. */
async function storeUnavailableReason(): Promise<string | null> {
  if (platform === 'win32') {
    // A session without a logon session of its own (some service accounts) has no store.
    const account = testAccount('probe');
    try {
      windowsWriter('sdd-review', account, 'probe')();
      return null;
    } catch (error) {
      return `Credential Manager refused a probe entry (${(error as Error).message.split('\n')[0]})`;
    }
  }
  if (platform === 'darwin') {
    return hasProgram('/usr/bin/security', ['help']) ? null : '/usr/bin/security is missing';
  }
  if (!hasProgram('secret-tool', ['--help'])) return 'secret-tool (libsecret-tools) is missing';
  const probe = await new SecretServiceReader().read('sdd-review', testAccount('probe'));
  if (probe.found || probe.cause === 'not found') return null;
  return `no Secret Service on the session bus (${probe.cause}${probe.detail ? `: ${probe.detail}` : ''})`;
}

const unavailable = await storeUnavailableReason();
const skipStore = unavailable !== null && !REQUIRE_STORE;
const storeTitle = (title: string) => (skipStore ? `${title} — skipped: ${unavailable}` : title);

describe(`C001-TC-851 credential store of this runner (${platform})`, () => {
  let keychain: TemporaryKeychain | undefined;
  let write: StoreWriter;
  let reader: CredentialReader;
  const cleanups: Array<() => void> = [];

  beforeAll(() => {
    if (skipStore) return;
    if (unavailable !== null) throw new Error(`credential store required but ${unavailable}`);
    if (platform === 'win32') {
      write = windowsWriter;
      reader = new WindowsCredentialReader();
    } else if (platform === 'darwin') {
      keychain = createTemporaryKeychain();
      write = keychain.write;
      reader = new MacosKeychainReader();
    } else {
      write = linuxWriter;
      reader = new SecretServiceReader();
    }
  });

  afterAll(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    keychain?.remove();
  });

  it.skipIf(skipStore)(
    storeTitle('C001-TS-826: a test key under service sdd-review is read by the OS reader'),
    async () => {
      const account = testAccount();
      cleanups.push(write('sdd-review', account, 'sk-test-STORE-002'));
      expect(await reader.read('sdd-review', account)).toEqual({
        found: true,
        secret: expect.stringMatching(/^sk-test-STORE-002\n?$/) as unknown as string,
      });
      // Through the lookup of C001-IF-010 §7 with the platform reader and no environment variable.
      const result = await lookupKey(provider(account), { env: {}, reader: platformReader() });
      expect(result.key).toBe('sk-test-STORE-002');
    },
  );

  it.skipIf(skipStore)(
    storeTitle('C001-TS-858: a test key under service sdd-review/x is read'),
    async () => {
      const account = testAccount();
      cleanups.push(write('sdd-review/x', account, 'sk-test-STORE-007'));
      const p = provider(account, { keyCredential: { service: 'sdd-review/x', account } });
      expect((await lookupKey(p, { env: {}, reader })).key).toBe('sk-test-STORE-007');
    },
  );

  it.skipIf(skipStore)(storeTitle('an absent entry is "not found"'), async () => {
    expect(await reader.read('sdd-review', testAccount('absent'))).toMatchObject({
      found: false,
      cause: 'not found',
    });
  });

  it.skipIf(skipStore)(
    storeTitle('C001-TS-859 (A1.3): an entry of a foreign service is never read'),
    async () => {
      const account = testAccount();
      cleanups.push(write('other', account, 'sk-test-FOREIGN-008'));
      const calls: string[] = [];
      const spy: CredentialReader = {
        read: (service, acct) => {
          calls.push(`${service}/${acct}`);
          return reader.read(service, acct);
        },
      };
      const p = provider(account, { keyCredential: { service: 'other', account } });
      const result = await lookupKey(p, { env: {}, reader: spy });
      expect(calls).toEqual([]);
      expect(result.key).toBeNull();
      expect(JSON.stringify(result)).not.toContain('sk-test-FOREIGN-008');
    },
  );

  it.skipIf(skipStore || platform !== 'win32')(
    storeTitle('Windows: a UTF-8 blob is decoded as UTF-8'),
    async () => {
      const account = testAccount();
      cleanups.push(windowsWriteBlob('sdd-review', account, Buffer.from('sk-test-UTF8-é', 'utf8')));
      expect(await reader.read('sdd-review', account)).toEqual({
        found: true,
        secret: 'sk-test-UTF8-é',
      });
    },
  );

  it.skipIf(skipStore || platform !== 'darwin')(
    storeTitle('macOS: an item in a locked keychain gives no key, without blocking'),
    async () => {
      const account = testAccount();
      cleanups.push(keychain!.write('sdd-review', account, 'sk-test-LOCKED'));
      keychain!.lock();
      const result = await new MacosKeychainReader({ timeoutMs: 5_000 }).read(
        'sdd-review',
        account,
      );
      expect(result.found).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// C001-RISK-018: Linux without a Secret Service.

/** A private session bus with no service files, so nothing can be activated on it. */
function privateBus(): { address: Promise<string>; stop(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'sddbusconf-'));
  const config = join(dir, 'session.conf');
  writeFileSync(
    config,
    `<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <listen>unix:dir=${dir}</listen>
  <auth>EXTERNAL</auth>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
`,
  );
  const child: ChildProcess = spawn(
    'dbus-daemon',
    ['--config-file', config, '--nofork', '--print-address'],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const address = new Promise<string>((resolve, reject) => {
    let out = '';
    child.stdout!.on('data', (c: Buffer) => {
      out += c.toString('utf8');
      const nl = out.indexOf('\n');
      if (nl >= 0) resolve(out.slice(0, nl).trim());
    });
    child.on('error', reject);
    child.on('exit', () => reject(new Error('dbus-daemon ended')));
  });
  return {
    address,
    stop: () => {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const hasDbusDaemon =
  platform === 'linux' &&
  spawnSync('dbus-daemon', ['--version'], { stdio: 'ignore' }).error === undefined;

describe.skipIf(platform !== 'linux')('C001-RISK-018: Linux without a Secret Service', () => {
  const bound = SECRET_SERVICE_TIMEOUT_MS + 1_000;

  it('no session bus: the reader ends at once and the environment variable is used', async () => {
    const env = { DBUS_SESSION_BUS_ADDRESS: `unix:path=${join(tmpdir(), 'no-such-bus')}` };
    const started = Date.now();
    const result = await new SecretServiceReader({ env }).read('sdd-review', 'team-model');
    expect(result).toMatchObject({ found: false, cause: 'store unavailable' });
    expect(Date.now() - started).toBeLessThan(bound);

    const p = provider('team-model', { keyEnv: 'TEAM_LLM_KEY' });
    const reader = new SecretServiceReader({ env });
    expect((await lookupKey(p, { env: { TEAM_LLM_KEY: 'sk-test-ENV-001' }, reader })).key).toBe(
      'sk-test-ENV-001',
    );
    const none = await lookupKey(p, { env: {}, reader });
    expect(none.key).toBeNull();
    expect(none.cause).toContain('store unavailable');
  });

  it.skipIf(!hasDbusDaemon)(
    `${hasDbusDaemon ? '' : 'skipped: dbus-daemon is missing — '}a session bus with no org.freedesktop.secrets: the reader ends within 5 s`,
    async () => {
      const bus = privateBus();
      try {
        const env = { DBUS_SESSION_BUS_ADDRESS: await bus.address };
        const started = Date.now();
        const result = await new SecretServiceReader({ env }).read('sdd-review', 'team-model');
        expect(result).toMatchObject({ found: false, cause: 'store unavailable' });
        expect(Date.now() - started).toBeLessThan(bound);
        const p = provider('team-model', { keyEnv: 'TEAM_LLM_KEY' });
        const keyed = await lookupKey(p, {
          env: { TEAM_LLM_KEY: 'sk-test-ENV-001' },
          reader: new SecretServiceReader({ env }),
        });
        expect(keyed.key).toBe('sk-test-ENV-001');
      } finally {
        bus.stop();
      }
    },
  );
});
