import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mergeWithBuiltinPolicy,
  type EffectiveConfiguration,
  type EffectiveProvider,
} from '../../../../src/core/config/effective.js';
import type { ReviewConfiguration } from '../../../../src/core/config/validate.js';
import { ContextualLog } from '../../../../src/core/log/log.js';
import {
  ModelGateway,
  type AdapterRequest,
  type ProviderAdapter,
} from '../../../../src/core/model/gateway.js';
import {
  createKeySource,
  credentialEntry,
  isAcceptedService,
  keyRequired,
  lookupKey,
  normaliseSecret,
  type CredentialReader,
  type LookupFailureClass,
  type ReaderResult,
} from '../../../../src/core/model/keys/key-source.js';

// C001-T-086 at unit level, without a credential store: the lookup order of C001-IF-010 §7
// (C001-REQ-809), the service-name check (C001-REQ-820, defence in depth behind ERR-CFG-004),
// normalisation (C001-ADR-008 §1), when a key is required, ERR-MODEL-006 with no request sent, no
// cache, and a log scan for the test key (C001-CON-21, C001-ADR-008 §2).

const TEST_KEY = 'sk-test-UNIT-086';

function provider(over: Partial<EffectiveProvider> = {}): EffectiveProvider {
  return {
    name: 'team-model',
    api: 'openai-chat',
    endpoint: 'http://127.0.0.1:11434/v1',
    model: 'm',
    keyEnv: null,
    keyCredential: null,
    responseFormat: 'json_schema',
    maxOutputTokens: 4096,
    ...over,
  } as EffectiveProvider;
}

/** A reader that returns a recorded result and remembers what it was asked for. */
function recordedReader(result: ReaderResult | (() => ReaderResult)) {
  const calls: Array<[string, string]> = [];
  const reader: CredentialReader = {
    read: async (service, account) => {
      calls.push([service, account]);
      return typeof result === 'function' ? result() : result;
    },
  };
  return { reader, calls };
}

describe('C001-IF-010 §7 lookup order (C001-REQ-809)', () => {
  it('uses the environment variable when it is set and not empty, and asks no store', async () => {
    const { reader, calls } = recordedReader({ found: true, secret: 'sk-test-STORE' });
    const result = await lookupKey(provider({ keyEnv: 'TEAM_LLM_KEY' }), {
      env: { TEAM_LLM_KEY: TEST_KEY },
      reader,
    });
    expect(result).toMatchObject({ key: TEST_KEY, required: true });
    expect(calls).toEqual([]);
  });

  it.each([
    ['not set', {}],
    ['empty', { TEAM_LLM_KEY: '' }],
  ])('falls back to the default entry when the variable is %s', async (state, env) => {
    const { reader, calls } = recordedReader({ found: true, secret: 'sk-test-STORE-002\n' });
    const result = await lookupKey(provider({ keyEnv: 'TEAM_LLM_KEY' }), { env, reader });
    expect(result.key).toBe('sk-test-STORE-002');
    expect(calls).toEqual([['sdd-review', 'team-model']]);
    expect(state).toBeTruthy();
  });

  it('reads the configured entry, sdd-review/<name> included', async () => {
    const { reader, calls } = recordedReader({ found: true, secret: 'sk-test-STORE-007' });
    const p = provider({ keyCredential: { service: 'sdd-review/x', account: 'acct' } });
    expect((await lookupKey(p, { env: {}, reader })).key).toBe('sk-test-STORE-007');
    expect(calls).toEqual([['sdd-review/x', 'acct']]);
    expect(credentialEntry(p)).toEqual({ service: 'sdd-review/x', account: 'acct' });
  });

  it('gives no key when neither source holds one, naming the sources and cause classes', async () => {
    const { reader } = recordedReader({ found: false, cause: 'not found', detail: 'exit 44' });
    const result = await lookupKey(provider({ keyEnv: 'TEAM_LLM_KEY' }), { env: {}, reader });
    expect(result).toEqual({
      key: null,
      required: true,
      location:
        'environment variable "TEAM_LLM_KEY" or credential-store entry "sdd-review/team-model"',
      cause:
        'environment variable "TEAM_LLM_KEY": not set; credential-store entry "sdd-review/team-model": not found (exit 44)',
    });
  });

  it.each<LookupFailureClass>([
    'not found',
    'locked',
    'store unavailable',
    'timed out',
    'access denied',
  ])('a store that answers "%s" counts as holding no key', async (cause) => {
    const { reader } = recordedReader({ found: false, cause });
    const result = await lookupKey(provider({ api: 'anthropic-messages' }), { env: {}, reader });
    expect(result.key).toBeNull();
    expect(result.location).toBe('credential-store entry "sdd-review/team-model"');
    expect(result.cause).toContain(cause);
  });

  it('a reader that throws counts as a store that cannot be opened, without its message', async () => {
    const reader: CredentialReader = {
      read: () => Promise.reject(new Error(`store said ${TEST_KEY}`)),
    };
    const result = await lookupKey(provider(), { env: {}, reader });
    expect(result.key).toBeNull();
    expect(result.cause).toContain('store unavailable');
    expect(result.cause).not.toContain(TEST_KEY);
  });

  it('caches nothing: every lookup reads again, so a rotated key is used at once', async () => {
    let secret = 'sk-test-OLD';
    const { reader, calls } = recordedReader(() => ({ found: true, secret }));
    const keys = createKeySource({ env: {}, reader });
    expect((await keys(provider())).key).toBe('sk-test-OLD');
    secret = 'sk-test-NEW';
    expect((await keys(provider())).key).toBe('sk-test-NEW');
    expect(calls).toHaveLength(2);
  });

  it('reads the environment at each lookup, not when the source is made', async () => {
    const env: NodeJS.ProcessEnv = {};
    const { reader } = recordedReader({ found: false, cause: 'not found' });
    const keys = createKeySource({ env, reader });
    const p = provider({ keyEnv: 'TEAM_LLM_KEY' });
    expect((await keys(p)).key).toBeNull();
    env.TEAM_LLM_KEY = TEST_KEY;
    expect((await keys(p)).key).toBe(TEST_KEY);
  });
});

describe('service-name check (C001-REQ-820)', () => {
  it.each(['sdd-review', 'sdd-review/x', 'sdd-review/team/a'])('accepts %s', (service) => {
    expect(isAcceptedService(service)).toBe(true);
  });

  it.each(['other', 'sdd-reviewer', 'git:https://github.com', 'sdd-review\n', ' sdd-review', ''])(
    'refuses %j',
    (service) => {
      expect(isAcceptedService(service)).toBe(false);
    },
  );

  it.each(['other', 'sdd-reviewer', 'git:https://github.com'])(
    'never asks a reader for an entry of the foreign service %s',
    async (service) => {
      const { reader, calls } = recordedReader({ found: true, secret: 'sk-test-FOREIGN-008' });
      const p = provider({ keyCredential: { service, account: 'team-model' } });
      const result = await lookupKey(p, { env: {}, reader });
      expect(calls).toEqual([]);
      expect(result.key).toBeNull();
      expect(JSON.stringify(result)).not.toContain('sk-test-FOREIGN-008');
    },
  );
});

describe('normalisation (C001-ADR-008 §1)', () => {
  it.each([
    ['sk-test-A\n', 'sk-test-A'],
    ['sk-test-A\r\n', 'sk-test-A'],
    ['sk-test-A \t \n', 'sk-test-A'],
    ['  sk-test-A', '  sk-test-A'],
    ['sk test', 'sk test'],
  ])('%j gives %j', (raw, expected) => {
    expect(normaliseSecret(raw)).toBe(expected);
  });

  it.each(['', '\n', ' \t\r\n'])('%j is no key', (raw) => {
    expect(normaliseSecret(raw)).toBeNull();
  });

  it('an entry whose secret is only white space is no key', async () => {
    const { reader } = recordedReader({ found: true, secret: '\n' });
    const result = await lookupKey(provider({ api: 'anthropic-messages' }), { env: {}, reader });
    expect(result.key).toBeNull();
    expect(result.cause).toContain('empty');
  });
});

describe('when a key is required (§7)', () => {
  it.each([
    ['anthropic-messages without settings', provider({ api: 'anthropic-messages' }), true],
    ['openai-chat with keyEnv', provider({ keyEnv: 'K' }), true],
    [
      'openai-chat with keyCredential',
      provider({ keyCredential: { service: 'sdd-review', account: 'a' } }),
      true,
    ],
    ['openai-chat with neither (local runtime)', provider(), false],
  ])('%s: %s', (_name, p, required) => {
    expect(keyRequired(p)).toBe(required);
  });
});

describe('the gateway with the key source (ERR-MODEL-006, C001-CON-21)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function configurationWith(p: Record<string, unknown>): EffectiveConfiguration {
    const configuration = {
      formatVersion: 1,
      model: { provider: { endpoint: 'http://127.0.0.1:11434/v1', model: 'm', ...p } },
    } as unknown as ReviewConfiguration;
    return {
      readable: true,
      source: {
        default: false,
        commit: 'a'.repeat(40),
        path: '.sdd-review/config.json',
        readable: true,
      },
      ignoredSettings: [],
      notices: [],
      settings: mergeWithBuiltinPolicy(configuration),
    };
  }

  function gateway(configuration: EffectiveConfiguration, reader: CredentialReader, env = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'sddkeys-'));
    dirs.push(dir);
    const logFile = join(dir, 'log.jsonl');
    const calls: AdapterRequest[] = [];
    const adapter: ProviderAdapter = {
      send: async (req) => {
        calls.push(req);
        return {
          ok: true,
          output: { task: 'intent-extraction', intents: [] },
          model: 'm',
        };
      },
    };
    const g = new ModelGateway({
      configuration: () => configuration,
      egress: { check: () => ({ allowed: true, locality: 'local' }) },
      adapters: { 'openai-chat': adapter, 'anthropic-messages': adapter },
      keys: createKeySource({ env, reader }),
      log: new ContextualLog(logFile),
    });
    const log = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');
    return { g, calls, log };
  }

  const INPUT = { commits: [], namedFiles: [] };

  it.each<LookupFailureClass>(['not found', 'locked', 'store unavailable', 'timed out'])(
    'a required key that is not found (%s) sends no request and reports ERR-MODEL-006',
    async (cause) => {
      const { reader } = recordedReader({ found: false, cause });
      const { g, calls, log } = gateway(
        configurationWith({ name: 'team-model', api: 'openai-chat', keyEnv: 'TEAM_LLM_KEY' }),
        reader,
      );
      const result = await g.runTask('intent-extraction', INPUT);
      expect(calls).toEqual([]);
      expect(result).toMatchObject({ status: 'model-free', cause: 'provider-failure' });
      expect(result.notices).toEqual([
        {
          code: 'ERR-MODEL-006',
          message:
            'Model provider "team-model" was not used: no key found in environment variable "TEAM_LLM_KEY" or credential-store entry "sdd-review/team-model". 1 items were produced in model-free mode.',
          count: 1,
        },
      ]);
      const entry = JSON.parse(log().trim()) as { code: string; cause: string; inputs: object };
      expect(entry.code).toBe('ERR-MODEL-006');
      expect(entry.inputs).toEqual({
        provider: 'team-model',
        api: 'openai-chat',
        task: 'intent-extraction',
      });
      expect(entry.cause).toContain(`credential-store entry "sdd-review/team-model": ${cause}`);
    },
  );

  it('names only the entry when no environment variable is configured', async () => {
    const { reader } = recordedReader({ found: false, cause: 'not found' });
    const { g } = gateway(configurationWith({ name: 'claude', api: 'anthropic-messages' }), reader);
    const result = await g.runTask('intent-extraction', INPUT);
    expect(result.notices[0]?.message).toBe(
      'Model provider "claude" was not used: no key found in credential-store entry "sdd-review/claude". 1 items were produced in model-free mode.',
    );
  });

  it('an optional key that is not found still sends the request, without a key', async () => {
    const { reader } = recordedReader({ found: false, cause: 'store unavailable' });
    const { g, calls } = gateway(
      configurationWith({ name: 'local-stub', api: 'openai-chat' }),
      reader,
    );
    expect((await g.runTask('intent-extraction', INPUT)).status).toBe('accepted');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.key).toBeNull();
  });

  it('log scan: a key found in the store or the environment appears in no log or result', async () => {
    const { reader } = recordedReader({ found: true, secret: `${TEST_KEY}\n` });
    const failing: ProviderAdapter = {
      send: async () => ({
        ok: false,
        failure: { code: 'ERR-MODEL-007', params: { status: '401' }, cause: 'HTTP 401' },
      }),
    };
    for (const env of [{}, { TEAM_LLM_KEY: TEST_KEY }]) {
      const { g, calls, log } = gateway(
        configurationWith({ name: 'team-model', api: 'openai-chat', keyEnv: 'TEAM_LLM_KEY' }),
        reader,
        env,
      );
      const accepted = await g.runTask('intent-extraction', INPUT);
      expect(calls[0]?.key).toBe(TEST_KEY); // handed to the request, and only there
      expect(JSON.stringify(accepted)).not.toContain(TEST_KEY);
      const g2 = new ModelGateway({
        configuration: () =>
          configurationWith({ name: 'team-model', api: 'openai-chat', keyEnv: 'TEAM_LLM_KEY' }),
        egress: { check: () => ({ allowed: true, locality: 'local' }) },
        adapters: { 'openai-chat': failing },
        keys: createKeySource({ env, reader }),
        log: {
          record: (code, context) => {
            expect(JSON.stringify({ code, context })).not.toContain(TEST_KEY);
            return undefined as never;
          },
          recordError: vi.fn(),
        },
      });
      const failed = await g2.runTask('intent-extraction', INPUT);
      expect(JSON.stringify(failed)).not.toContain(TEST_KEY);
      expect(log()).not.toContain(TEST_KEY);
    }
  });
});
