import { afterEach, describe, expect, it } from 'vitest';
import {
  mergeWithBuiltinPolicy,
  type EffectiveConfiguration,
} from '../../../../src/core/config/effective.js';
import type { ReviewConfiguration } from '../../../../src/core/config/validate.js';
import { anthropicMessagesAdapter } from '../../../../src/core/model/adapters/anthropic-messages.js';
import { PROVIDER_ADAPTERS } from '../../../../src/core/model/adapters/index.js';
import { openAiChatAdapter } from '../../../../src/core/model/adapters/openai-chat.js';
import {
  connectionCause,
  resolveTarget,
  socketPathOf,
} from '../../../../src/core/model/adapters/transport.js';
import {
  ModelGateway,
  type AdapterRequest,
  type EgressPolicy,
  type ProviderAdapter,
} from '../../../../src/core/model/gateway.js';
import type { EffectiveProvider } from '../../../../src/core/config/effective.js';
import {
  STUB_MODEL,
  StubLlm,
  type ScriptedAnswer,
} from '../../../acceptance/support/stub-llm/stub-llm.js';
import { INPUTS, OUTPUTS, leaks, provider, request } from './support.js';

// C001-T-087: the typed failures of both adapters (C001-IF-010 §7 failure mapping): connection
// failures, HTTP statuses, the provider timeout from connection to last byte (§3 item 5), no retry
// (§3 item 4), and no key or answer body of a failed request in any failure (C001-CON-21).

const KEY = 'test-provider-key-0123456789';
let stub: StubLlm;
const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

async function startStub(): Promise<StubLlm> {
  stub = new StubLlm();
  await stub.start();
  cleanups.push(() => stub.stop());
  return stub;
}

const ADAPTERS: ReadonlyArray<
  [EffectiveProvider['api'], ProviderAdapter, (base: string) => string]
> = [
  ['openai-chat', openAiChatAdapter, (base) => `${base}/v1`],
  ['anthropic-messages', anthropicMessagesAdapter, (base) => base],
];

function send(
  adapter: ProviderAdapter,
  api: EffectiveProvider['api'],
  endpoint: string,
  extra: Partial<AdapterRequest> = {},
) {
  return adapter.send(request(provider(api, endpoint), 'hunk-linking', { key: KEY, ...extra }));
}

describe.each(ADAPTERS)('%s adapter failures (§7)', (api, adapter, endpointOf) => {
  it.each<[number, string]>([
    [401, 'ERR-MODEL-007'],
    [403, 'ERR-MODEL-007'],
    [429, 'ERR-MODEL-008'],
    [500, 'ERR-MODEL-009'],
    [503, 'ERR-MODEL-009'],
    [599, 'ERR-MODEL-009'],
    [400, 'ERR-MODEL-010'],
    [404, 'ERR-MODEL-010'],
    [413, 'ERR-MODEL-010'],
    [201, 'ERR-MODEL-010'],
  ])('HTTP %i gives %s, sent once, with no key and no answer body', async (status, code) => {
    await startStub();
    stub.enqueue({ status });
    const answer = await send(adapter, api, endpointOf(stub.endpoint));
    expect(answer).toEqual({
      ok: false,
      failure: { code, params: { status: String(status) }, cause: `HTTP ${status}` },
    });
    expect(stub.requests).toHaveLength(1); // no retry (§3 item 4)
    expect(leaks(answer, KEY)).toBe(false);
  });

  it('a refused connection gives ERR-MODEL-003', async () => {
    await startStub();
    const endpoint = endpointOf(stub.endpoint);
    await stub.stop();
    const answer = await send(adapter, api, endpoint);
    expect(answer).toEqual({
      ok: false,
      failure: {
        code: 'ERR-MODEL-003',
        params: { cause: 'connection refused' },
        cause: 'connection refused',
      },
    });
  });

  it('a connection closed before the status line gives ERR-MODEL-003', async () => {
    await startStub();
    stub.enqueue({ destroy: true });
    const answer = await send(adapter, api, endpointOf(stub.endpoint));
    expect(answer).toMatchObject({
      ok: false,
      failure: {
        code: 'ERR-MODEL-003',
        params: { cause: 'connection closed before an HTTP status line' },
      },
    });
    expect(stub.requests).toHaveLength(1);
  });

  it('a TLS failure gives ERR-MODEL-003', async () => {
    await startStub();
    // An HTTPS request to a plain-HTTP listener fails in the TLS handshake.
    const answer = await send(adapter, api, endpointOf(stub.endpoint.replace('http:', 'https:')));
    expect(answer).toMatchObject({ ok: false, failure: { code: 'ERR-MODEL-003' } });
    if (!answer.ok) expect(answer.failure.params.cause).toMatch(/^TLS failure|^connection closed/);
  });

  it('a missing local socket gives ERR-MODEL-003', async () => {
    const endpoint =
      process.platform === 'win32' ? 'npipe:sdd-review-absent-pipe' : 'unix:/nonexistent/llm.sock';
    const answer = await send(adapter, api, endpoint);
    expect(answer).toMatchObject({ ok: false, failure: { code: 'ERR-MODEL-003' } });
  });

  it.each<[string, ScriptedAnswer]>([
    ['no answer at all', { hang: true }],
    ['an answer later than the timeout', { output: OUTPUTS['hunk-linking'], delayMs: 1500 }],
  ])('%s gives ERR-MODEL-004 after the provider timeout', async (_name, scripted) => {
    await startStub();
    stub.enqueue(scripted);
    const started = Date.now();
    const answer = await send(adapter, api, endpointOf(stub.endpoint), { timeoutSeconds: 0.3 });
    const elapsed = Date.now() - started;
    expect(answer).toEqual({
      ok: false,
      failure: {
        code: 'ERR-MODEL-004',
        params: { s: '0.3' },
        cause: 'no complete answer within 0.3 s',
      },
    });
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(1400);
    expect(stub.requests).toHaveLength(1);
  });

  it('an answer inside the timeout is accepted', async () => {
    await startStub();
    stub.enqueue({ output: OUTPUTS['hunk-linking'], delayMs: 50 });
    const answer = await send(adapter, api, endpointOf(stub.endpoint), { timeoutSeconds: 2 });
    expect(answer).toEqual({ ok: true, output: OUTPUTS['hunk-linking'], model: STUB_MODEL });
  });

  it('an HTTP 200 body that is not JSON gives ERR-MODEL-005', async () => {
    await startStub();
    stub.enqueue({ body: '<html>gateway</html>' });
    const answer = await send(adapter, api, endpointOf(stub.endpoint));
    expect(answer).toMatchObject({
      ok: false,
      failure: { code: 'ERR-MODEL-005', params: { reason: 'the answer is not JSON' } },
    });
  });
});

describe('endpoints', () => {
  it.each([
    ['http://127.0.0.1:11434/v1', '/chat/completions', 'url', '/v1/chat/completions'],
    ['http://127.0.0.1:11434/v1/', '/chat/completions', 'url', '/v1/chat/completions'],
    ['https://api.anthropic.com', '/v1/messages', 'url', '/v1/messages'],
    ['https://api.anthropic.com/', '/v1/messages', 'url', '/v1/messages'],
    ['unix:/run/llm.sock', '/chat/completions', 'socket', '/v1/chat/completions'],
  ])('%s + %s', (endpoint, urlPath, kind, path) => {
    const target = resolveTarget(endpoint, urlPath, '/v1/chat/completions');
    expect(target.endpoint.kind).toBe(kind);
    expect(target.path).toBe(path);
  });

  it.each([
    ['unix:/run/llm.sock', '/run/llm.sock'],
    ['npipe:ollama', '\\\\.\\pipe\\ollama'],
    ['npipe:\\\\.\\pipe\\ollama', '\\\\.\\pipe\\ollama'],
    ['npipe:////./pipe/ollama', '\\\\.\\pipe\\ollama'],
    ['http://localhost:11434/v1', null],
  ])('socket path of %s', (endpoint, path) => {
    expect(socketPathOf(endpoint)).toBe(path);
  });

  it('names the cause of a connection error without its message text', () => {
    const e = (code: string, message = 'x') => Object.assign(new Error(message), { code });
    expect(connectionCause(e('ENOTFOUND'))).toBe('host not found (ENOTFOUND)');
    expect(connectionCause(e('DEPTH_ZERO_SELF_SIGNED_CERT'))).toBe(
      'TLS failure (DEPTH_ZERO_SELF_SIGNED_CERT)',
    );
    expect(connectionCause(e('EHOSTUNREACH'))).toBe('connection failed (EHOSTUNREACH)');
  });
});

describe('gateway with the adapters (C001-IF-010 §1)', () => {
  const allowLocal: EgressPolicy = { check: () => ({ allowed: true, locality: 'local' }) };

  function configuration(endpoint: string): EffectiveConfiguration {
    const config = {
      formatVersion: 1,
      model: { provider: { name: 'local-stub', api: 'openai-chat', endpoint, model: 'cfg-model' } },
    } as ReviewConfiguration;
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
      settings: mergeWithBuiltinPolicy(config),
    };
  }

  it('sends nothing while no egress policy is registered (fail-safe of C001-T-085)', async () => {
    await startStub();
    const gateway = new ModelGateway({
      configuration: () => configuration(`${stub.endpoint}/v1`),
      adapters: PROVIDER_ADAPTERS,
    });
    const result = await gateway.runTask('hunk-linking', INPUTS['hunk-linking']);
    expect(result).toMatchObject({ status: 'model-free', cause: 'gateway-incomplete' });
    expect(stub.requests).toEqual([]);
  });

  it('accepts the answer with the marker of the provider and the answer model', async () => {
    await startStub();
    stub.enqueue({ output: OUTPUTS['hunk-linking'] });
    const gateway = new ModelGateway({
      configuration: () => configuration(`${stub.endpoint}/v1`),
      adapters: PROVIDER_ADAPTERS,
      egress: allowLocal,
    });
    const result = await gateway.runTask('hunk-linking', INPUTS['hunk-linking']);
    expect(result).toMatchObject({
      status: 'accepted',
      output: OUTPUTS['hunk-linking'],
      labels: { modelOutput: { provider: 'local-stub', model: STUB_MODEL, confidence: 'low' } },
    });
  });

  it('turns an adapter failure into the notice of its code', async () => {
    await startStub();
    stub.enqueue({ status: 503 });
    const gateway = new ModelGateway({
      configuration: () => configuration(`${stub.endpoint}/v1`),
      adapters: PROVIDER_ADAPTERS,
      egress: allowLocal,
    });
    const result = await gateway.runTask('hunk-linking', INPUTS['hunk-linking']);
    expect(result).toMatchObject({
      status: 'model-free',
      cause: 'provider-failure',
      notices: [
        {
          code: 'ERR-MODEL-009',
          message:
            'Model provider "local-stub" failed with a server error (HTTP 503). 1 items were produced in model-free mode.',
        },
      ],
    });
  });
});
