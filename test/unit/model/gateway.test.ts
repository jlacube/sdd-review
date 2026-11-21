import { request } from 'node:http';
import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeWithBuiltinPolicy,
  type EffectiveConfiguration,
} from '../../../src/core/config/effective.js';
import type { ReviewConfiguration } from '../../../src/core/config/validate.js';
import {
  ModelGateway,
  decideModelUse,
  itemCount,
  providerStatusOf,
  type AdapterRequest,
  type EgressPolicy,
  type ModelGatewayDeps,
  type ProviderAdapter,
  type TaskInputs,
} from '../../../src/core/model/gateway.js';
import {
  MODEL_TASKS,
  REDUCED_FEATURE,
  isReducedFor,
  reducedLabels,
  withReduced,
  type ModelTask,
} from '../../../src/core/model/labels.js';
import { STUB_MODEL, StubLlm } from '../../acceptance/support/stub-llm/stub-llm.js';

// C001-T-085, C001-TC-801 and C001-TC-804 at unit level: the use decision of C001-IF-010 §6 check 1
// (C001-REQ-801, C001-REQ-819), no connection in model-free mode (C001-REQ-803, socket spy), and the
// reduced label of every model-free result (C001-REQ-804).

const BASE = 'a'.repeat(40);

function readable(configuration: ReviewConfiguration | null): EffectiveConfiguration {
  return {
    readable: true,
    source: {
      default: configuration === null,
      commit: BASE,
      path: '.sdd-review/config.json',
      readable: true,
    },
    ignoredSettings: [],
    notices: [],
    settings: mergeWithBuiltinPolicy(configuration),
  };
}

function unreadable(code: 'ERR-CFG-001' | 'ERR-CFG-004'): EffectiveConfiguration {
  return {
    readable: false,
    source: { default: false, commit: BASE, path: '.sdd-review/config.json', readable: false },
    ignoredSettings: [],
    notices: [{ code, message: `${code} message` }],
    error: { code, cause: 'test' },
  };
}

const withProvider = (endpoint = 'http://127.0.0.1:11434/v1'): ReviewConfiguration =>
  ({
    formatVersion: 1,
    model: {
      provider: { name: 'local-stub', api: 'openai-chat', endpoint, model: 'configured-model' },
    },
  }) as ReviewConfiguration;

const allowLocal: EgressPolicy = { check: () => ({ allowed: true, locality: 'local' }) };
const allowCloud: EgressPolicy = { check: () => ({ allowed: true, locality: 'cloud' }) };
const refuseCloud: EgressPolicy = {
  check: () => ({
    allowed: false,
    cause: 'cloud-opt-in-missing',
    code: 'ERR-MODEL-001',
    params: { host: 'llm.cloud.test' },
  }),
};

const INPUTS: { readonly [T in ModelTask]: TaskInputs[T] } = {
  'intent-extraction': {
    commits: [{ hash: BASE, subject: 'Add cart totals', message: 'Add cart totals\n' }],
    namedFiles: [],
  },
  'hunk-linking': {
    intents: [{ intentId: `i-${'1'.repeat(16)}`, title: 'Cart totals', sourceText: 'totals' }],
    hunks: [
      { hunkId: `h-${'1'.repeat(16)}`, path: 'src/a.ts', text: '+a' },
      { hunkId: `h-${'2'.repeat(16)}`, path: 'src/b.ts', text: '+b' },
    ],
  },
  'design-critique': { components: [{ componentName: 'billing', hunks: [] }] },
  'walkthrough-account': {
    intent: { intentId: `i-${'1'.repeat(16)}`, title: 'Cart totals', sourceText: 'totals' },
    hunks: [],
  },
};

/** An adapter that, if ever called, opens a real loopback connection to the stub provider. */
function connectingAdapter(stub: StubLlm, calls: AdapterRequest[]): ProviderAdapter {
  return {
    send: (req) =>
      new Promise((resolve, reject) => {
        calls.push(req);
        const body = JSON.stringify({ model: req.provider.model, messages: [] });
        const r = request(
          `${stub.endpoint}/v1/chat/completions`,
          { method: 'POST', headers: { 'content-type': 'application/json' } },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              const answer = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                model: string;
                choices: Array<{ message: { content: string } }>;
              };
              resolve({
                ok: true,
                output: JSON.parse(answer.choices[0]!.message.content) as unknown,
                model: answer.model,
              });
            });
          },
        );
        r.on('error', reject);
        r.end(body);
      }),
  };
}

describe('decideModelUse (C001-IF-010 §6 check 1)', () => {
  const adapters = { 'openai-chat': { send: vi.fn() } as ProviderAdapter };

  it.each([
    ['no review configuration (defaults)', readable(null), 'no-provider'],
    [
      'a configuration that names no provider',
      readable({ formatVersion: 1 } as ReviewConfiguration),
      'no-provider',
    ],
    [
      'an unreadable configuration (ERR-CFG-001)',
      unreadable('ERR-CFG-001'),
      'configuration-unreadable',
    ],
    [
      'a foreign credential-store service (ERR-CFG-004)',
      unreadable('ERR-CFG-004'),
      'configuration-unreadable',
    ],
  ] as const)('%s gives model-free mode', (_name, configuration, cause) => {
    const decision = decideModelUse(configuration, { egress: allowLocal, adapters });
    expect(decision).toMatchObject({ use: false, cause });
  });

  it('an unreadable configuration carries the loader notice of its code', () => {
    for (const code of ['ERR-CFG-001', 'ERR-CFG-004'] as const) {
      const decision = decideModelUse(unreadable(code), { egress: allowLocal, adapters });
      expect(decision.use).toBe(false);
      expect(!decision.use && decision.notices.map((n) => n.code)).toEqual([code]);
    }
  });

  it('a configured provider without the egress policy or the adapter is withheld (fail-safe)', () => {
    expect(decideModelUse(readable(withProvider()), { adapters })).toMatchObject({
      use: false,
      cause: 'gateway-incomplete',
    });
    expect(decideModelUse(readable(withProvider()), { egress: allowLocal })).toMatchObject({
      use: false,
      cause: 'gateway-incomplete',
    });
  });

  it('a refusal of the egress policy gives model-free mode with its cause', () => {
    expect(
      decideModelUse(readable(withProvider()), { egress: refuseCloud, adapters }),
    ).toMatchObject({
      use: false,
      cause: 'cloud-opt-in-missing',
      refusal: { code: 'ERR-MODEL-001' },
    });
  });

  it('a configured provider that passes the checks is used', () => {
    const decision = decideModelUse(readable(withProvider()), { egress: allowLocal, adapters });
    expect(decision).toMatchObject({
      use: true,
      locality: 'local',
      provider: { name: 'local-stub' },
    });
  });

  it('the provider status follows the decision (C001-IF-002 ProviderStatus)', () => {
    const free = decideModelUse(readable(null));
    expect(providerStatusOf(free)).toEqual({
      mode: 'model-free',
      providerName: null,
      contentSentOffMachine: false,
    });
    expect(
      providerStatusOf(decideModelUse(readable(withProvider()), { egress: allowLocal, adapters })),
    ).toEqual({ mode: 'local-provider', providerName: 'local-stub', contentSentOffMachine: false });
    expect(
      providerStatusOf(decideModelUse(readable(withProvider()), { egress: allowCloud, adapters })),
    ).toEqual({ mode: 'cloud-provider', providerName: 'local-stub', contentSentOffMachine: true });
  });
});

describe('ModelGateway.runTask', () => {
  let stub: StubLlm;
  let connect: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    stub = new StubLlm();
    await stub.start();
    connect = vi.spyOn(net.Socket.prototype, 'connect');
  });

  afterEach(async () => {
    connect.mockRestore();
    await stub.stop();
  });

  const gatewayFor = (configuration: EffectiveConfiguration, extra: Partial<ModelGatewayDeps>) =>
    new ModelGateway({ configuration: () => configuration, ...extra });

  describe.each([
    ['no review configuration', readable(null), 'no-provider', []],
    ['no provider named', readable({ formatVersion: 1 } as ReviewConfiguration), 'no-provider', []],
    [
      'an unreadable configuration',
      unreadable('ERR-CFG-001'),
      'configuration-unreadable',
      ['ERR-CFG-001'],
    ],
    ['a foreign service', unreadable('ERR-CFG-004'), 'configuration-unreadable', ['ERR-CFG-004']],
    [
      'a provider withheld by the egress policy',
      readable(withProvider('https://llm.cloud.test/v1')),
      'cloud-opt-in-missing',
      ['ERR-MODEL-001'],
    ],
  ] as const)('model-free mode: %s', (_name, configuration, cause, codes) => {
    it.each(MODEL_TASKS)(
      '%s sends nothing and is labelled reduced with its feature',
      async (task) => {
        const calls: AdapterRequest[] = [];
        const keys = vi.fn(async () => 'sk-test-NEVER');
        const gateway = gatewayFor(configuration, {
          egress: refuseCloud,
          adapters: { 'openai-chat': connectingAdapter(stub, calls) },
          keys,
        });
        const result = await gateway.runTask(task, INPUTS[task]);
        expect(result).toMatchObject({ status: 'model-free', task, cause });
        expect(result.labels).toEqual({ reduced: [REDUCED_FEATURE[task]] });
        expect(result.notices.map((n) => n.code)).toEqual(codes);
        expect(calls).toEqual([]);
        expect(keys).not.toHaveBeenCalled(); // no key is read for a request that is not sent
        expect(connect).not.toHaveBeenCalled();
        expect(stub.requests).toEqual([]);
      },
    );
  });

  it('the ERR-MODEL-001 notice names the provider and the number of model-free items', async () => {
    const gateway = gatewayFor(readable(withProvider('https://llm.cloud.test/v1')), {
      egress: refuseCloud,
      adapters: { 'openai-chat': connectingAdapter(stub, []) },
    });
    const result = await gateway.runTask('hunk-linking', INPUTS['hunk-linking']);
    expect(result.notices[0]?.message).toBe(
      'Model provider "local-stub" was not used: its endpoint "llm.cloud.test" is not on this machine and the cloud opt-in setting is missing. 2 items were produced in model-free mode.',
    );
  });

  it('decides per request: a configuration that changes between requests changes the decision', async () => {
    let configuration = readable(withProvider());
    const calls: AdapterRequest[] = [];
    const gateway = new ModelGateway({
      configuration: () => configuration,
      egress: allowLocal,
      adapters: { 'openai-chat': connectingAdapter(stub, calls) },
    });
    stub.enqueue({
      output: { task: 'walkthrough-account', intentId: `i-${'1'.repeat(16)}`, account: 'A' },
    });
    expect(
      (await gateway.runTask('walkthrough-account', INPUTS['walkthrough-account'])).status,
    ).toBe('accepted');
    configuration = unreadable('ERR-CFG-001');
    expect(
      (await gateway.runTask('walkthrough-account', INPUTS['walkthrough-account'])).status,
    ).toBe('model-free');
    expect(calls).toHaveLength(1);
    expect(stub.requests).toHaveLength(1);
  });

  it('positive control: a used provider is reached, so the socket spy sees connections', async () => {
    const calls: AdapterRequest[] = [];
    const gateway = gatewayFor(readable(withProvider()), {
      egress: allowLocal,
      adapters: { 'openai-chat': connectingAdapter(stub, calls) },
      keys: async () => null,
    });
    const output = { task: 'intent-extraction', intents: [] };
    stub.enqueue({ output });
    const result = await gateway.runTask('intent-extraction', INPUTS['intent-extraction']);
    expect(result).toMatchObject({
      status: 'accepted',
      output,
      labels: { modelOutput: { provider: 'local-stub', model: STUB_MODEL, confidence: 'low' } },
    });
    expect(result.labels.reduced).toBeUndefined();
    expect(connect).toHaveBeenCalled();
    expect(stub.requests).toHaveLength(1);
    expect(calls[0]).toMatchObject({ task: 'intent-extraction', key: null, timeoutSeconds: 120 });
  });

  it('a failed request gives model-free items with the notice of its code, and never throws', async () => {
    const record = vi.fn();
    const gateway = gatewayFor(readable(withProvider()), {
      egress: allowLocal,
      adapters: {
        'openai-chat': {
          send: async () => ({
            ok: false,
            failure: { code: 'ERR-MODEL-009', params: { status: '503' }, cause: 'HTTP 503' },
          }),
        },
      },
      log: { record, recordError: vi.fn() },
    });
    const result = await gateway.runTask('design-critique', INPUTS['design-critique']);
    expect(result).toMatchObject({ status: 'model-free', cause: 'provider-failure' });
    expect(result.labels).toEqual({ reduced: ['design critique'] });
    expect(result.notices).toEqual([
      {
        code: 'ERR-MODEL-009',
        message:
          'Model provider "local-stub" failed with a server error (HTTP 503). 1 items were produced in model-free mode.',
      },
    ]);
    expect(record).toHaveBeenCalledWith(
      'ERR-MODEL-009',
      expect.objectContaining({ operation: 'model-request' }),
    );
  });

  it('an adapter or key lookup that throws is logged and still gives a labelled model-free result', async () => {
    const recordError = vi.fn();
    const key = 'sk-test-SECRET-085';
    const gateway = gatewayFor(readable(withProvider()), {
      egress: allowLocal,
      adapters: { 'openai-chat': { send: async () => Promise.reject(new Error('boom')) } },
      keys: async () => key,
      log: { record: vi.fn(), recordError },
    });
    const result = await gateway.runTask('hunk-linking', INPUTS['hunk-linking']);
    expect(result).toMatchObject({ status: 'model-free', cause: 'provider-failure', items: 2 });
    expect(result.labels).toEqual({ reduced: ['hunk-to-intent grouping'] });
    expect(recordError).toHaveBeenCalledOnce();
    expect(JSON.stringify(recordError.mock.calls)).not.toContain(key); // C001-CON-21
  });

  it('output the validation seam rejects is unusable output (ERR-MODEL-005)', async () => {
    const gateway = gatewayFor(readable(withProvider()), {
      egress: allowLocal,
      adapters: { 'openai-chat': connectingAdapter(stub, []) },
      validate: () => ({ ok: false, reason: 'not an object of the task' }),
    });
    const result = await gateway.runTask('intent-extraction', INPUTS['intent-extraction']);
    expect(result).toMatchObject({ status: 'model-free', cause: 'provider-failure' });
    expect(result.notices.map((n) => n.code)).toEqual(['ERR-MODEL-005']);
  });

  it('a configuration that cannot be obtained at all gives model-free mode, not an exception', async () => {
    const connectCount = connect.mock.calls.length;
    const gateway = new ModelGateway({
      configuration: () => Promise.reject(new Error('store gone')),
      egress: allowLocal,
      adapters: { 'openai-chat': connectingAdapter(stub, []) },
      log: { record: vi.fn(), recordError: vi.fn() },
    });
    const result = await gateway.runTask('walkthrough-account', INPUTS['walkthrough-account']);
    expect(result).toMatchObject({ status: 'model-free', cause: 'configuration-unreadable' });
    expect(await gateway.status()).toMatchObject({ mode: 'model-free' });
    expect(connect.mock.calls.length).toBe(connectCount);
  });
});

describe('itemCount', () => {
  it('counts the items a request produces', () => {
    expect(itemCount('hunk-linking', INPUTS['hunk-linking'])).toBe(2);
    expect(itemCount('design-critique', INPUTS['design-critique'])).toBe(1);
    expect(itemCount('intent-extraction', INPUTS['intent-extraction'])).toBe(1);
    expect(itemCount('walkthrough-account', INPUTS['walkthrough-account'])).toBe(1);
  });
});

describe('reduced labels (C001-REQ-804, C001-TS-809 features)', () => {
  it.each([
    ['intent-extraction', 'intent extraction'],
    ['hunk-linking', 'hunk-to-intent grouping'],
    ['walkthrough-account', 'walkthrough account'],
    ['design-critique', 'design critique'],
  ] as const)('%s is labelled reduced naming "%s"', (task, feature) => {
    expect(reducedLabels(task)).toEqual({ reduced: [feature] });
    expect(isReducedFor(reducedLabels(task), task)).toBe(true);
  });

  it('adds a feature to existing labels once, keeping the other entries and the marker', () => {
    const marker = { provider: 'p', model: 'm', confidence: 'low' as const };
    const labels = withReduced(
      { reduced: ['definition-before-use order'], modelOutput: marker },
      'design-critique',
    );
    expect(labels).toEqual({
      reduced: ['definition-before-use order', 'design critique'],
      modelOutput: marker,
    });
    expect(withReduced(labels, 'design-critique').reduced).toEqual(labels.reduced);
    expect(isReducedFor(undefined, 'hunk-linking')).toBe(false);
  });
});
