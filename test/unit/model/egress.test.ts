import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mergeWithBuiltinPolicy,
  type EffectiveConfiguration,
} from '../../../src/core/config/effective.js';
import type { ReviewConfiguration } from '../../../src/core/config/validate.js';
import { PROVIDER_ADAPTERS } from '../../../src/core/model/adapters/index.js';
import { CloudUseAnnouncer, cloudAnnouncement } from '../../../src/core/model/announce.js';
import { createEgressPolicy, excludeModelPaths } from '../../../src/core/model/egress.js';
import {
  ModelGateway,
  decideModelUse,
  providerStatusOf,
  type AdapterRequest,
  type ProviderAdapter,
  type TaskInputs,
} from '../../../src/core/model/gateway.js';
import { STUB_MODEL, StubLlm } from '../../acceptance/support/stub-llm/stub-llm.js';

// C001-T-088 steps 2 to 4, C001-TC-806, C001-TC-808, C001-TC-814 and C001-TC-815 at unit level:
// the cloud opt-in (C001-REQ-806, C001-TS-814, C001-TS-815, C001-TS-817, C001-TS-849), the
// model-excluded paths with marker strings (C001-REQ-814, C001-REQ-815, C001-TS-835 to C001-TS-837,
// C001-TS-850), and the cloud-use event before the first cloud request (C001-REQ-808, C001-TS-822
// to C001-TS-824), through the gateway with the real adapters and the recording stub provider.

const BASE = 'a'.repeat(40);
const H = (n: number) => `h-${String(n).repeat(16)}`;
const I1 = `i-${'1'.repeat(16)}`;
const MARKER = 'MARKER-7f3c';
const MARKER_OK = 'MARKER-a1';
const MARKER_RENAMED = 'MARKER-9d1e';

function configuration(model: Record<string, unknown>): EffectiveConfiguration {
  return {
    readable: true,
    source: { default: false, commit: BASE, path: '.sdd-review/config.json', readable: true },
    ignoredSettings: [],
    notices: [],
    settings: mergeWithBuiltinPolicy({ formatVersion: 1, model } as ReviewConfiguration),
  };
}

const providerAt = (endpoint: string, name = 'stub') => ({
  name,
  api: 'openai-chat',
  endpoint,
  model: STUB_MODEL,
});

const linkingInput = (): TaskInputs['hunk-linking'] => ({
  intents: [{ intentId: I1, title: 'Auth', sourceText: 'REQ-012 sign-in' }],
  hunks: [
    { hunkId: H(1), path: 'src/auth.ts', text: `+const a = '${MARKER_OK}';` },
    { hunkId: H(2), path: 'secrets/tokens.ts', text: `+const t = '${MARKER}';` },
    { hunkId: H(3), path: 'src/secrets/util.ts', text: "+const b = 'MARKER-b2';" },
    // C001-TS-850: renamed out of an excluded path, and into one
    { hunkId: H(4), path: 'src/tokens.ts', basePath: 'secrets/tokens.ts', text: MARKER_RENAMED },
    { hunkId: H(5), path: 'secrets/keys.ts', basePath: 'src/keys.ts', text: MARKER_RENAMED },
  ],
});

describe('the cloud opt-in (C001-IF-010 §6 checks 2 and 3)', () => {
  const policy = createEgressPolicy();
  const settings = (endpoint: string, cloudOptIn?: boolean) =>
    configuration({
      provider: providerAt(endpoint),
      ...(cloudOptIn === undefined ? {} : { cloudOptIn }),
    });

  it.each([
    'http://127.0.0.1:11434/v1',
    'http://[::1]:11434/v1',
    'http://localhost:11434/v1',
    'unix:/run/llm.sock',
  ])('a local endpoint needs no opt-in: %s', (endpoint) => {
    const c = settings(endpoint);
    if (!c.readable) throw new Error('readable');
    expect(policy.check(c.settings.model.provider!, c.settings.model)).toEqual({
      allowed: true,
      locality: 'local',
    });
  });

  it.each([
    ['https://llm.cloud.test/v1', 'llm.cloud.test'],
    ['http://192.168.1.20:11434', '192.168.1.20'],
    ['http://api.localhost:11434/v1', 'api.localhost'],
    ['http://[::2]:11434', '[::2]'],
  ])('a non-local endpoint without the opt-in is refused: %s', (endpoint, host) => {
    for (const optIn of [undefined, false]) {
      const decision = decideModelUse(settings(endpoint, optIn), {
        egress: policy,
        adapters: PROVIDER_ADAPTERS,
      });
      expect(decision).toMatchObject({
        use: false,
        cause: 'cloud-opt-in-missing',
        refusal: { code: 'ERR-MODEL-001', params: { host } },
      });
      expect(providerStatusOf(decision).mode).toBe('model-free');
    }
  });

  it('a non-local endpoint with the opt-in is a cloud provider', () => {
    const decision = decideModelUse(settings('https://llm.cloud.test/v1', true), {
      egress: policy,
      adapters: PROVIDER_ADAPTERS,
    });
    expect(decision).toMatchObject({ use: true, locality: 'cloud' });
    expect(providerStatusOf(decision)).toEqual({
      mode: 'cloud-provider',
      providerName: 'stub',
      contentSentOffMachine: true,
    });
  });
});

describe('the gateway with the egress policy', () => {
  const stubs: StubLlm[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const s of stubs.splice(0)) await s.stop();
  });

  async function stub(): Promise<StubLlm> {
    const s = new StubLlm();
    await s.start();
    stubs.push(s);
    return s;
  }

  it('sends nothing to a non-local endpoint without the opt-in: no connection, ERR-MODEL-001', async () => {
    const connect = vi.spyOn(net.Socket.prototype, 'connect');
    const s = await stub();
    const announcer = new CloudUseAnnouncer();
    const heard = vi.fn();
    announcer.subscribe(heard);
    const gateway = new ModelGateway({
      configuration: () =>
        configuration({ provider: providerAt(`http://llm.loopback.test:${s.port}/v1`) }),
      egress: createEgressPolicy(),
      adapters: PROVIDER_ADAPTERS,
      cloudUse: announcer,
    });
    const result = await gateway.runTask('hunk-linking', linkingInput());
    expect(result).toMatchObject({ status: 'model-free', cause: 'cloud-opt-in-missing', items: 5 });
    expect(result.notices).toEqual([
      {
        code: 'ERR-MODEL-001',
        message:
          'Model provider "stub" was not used: its endpoint "llm.loopback.test" is not on this machine and the cloud opt-in setting is missing. 5 items were produced in model-free mode.',
      },
    ]);
    expect(connect).not.toHaveBeenCalled();
    expect(s.requests).toEqual([]);
    expect(heard).not.toHaveBeenCalled();
  });

  it('sends to a local provider without the opt-in, and announces nothing (C001-TS-824)', async () => {
    const s = await stub();
    s.enqueue({ output: { task: 'hunk-linking', links: [] } });
    const announcer = new CloudUseAnnouncer();
    const heard = vi.fn();
    announcer.subscribe(heard);
    const gateway = new ModelGateway({
      configuration: () => configuration({ provider: providerAt(`${s.endpoint}/v1`) }),
      egress: createEgressPolicy(),
      adapters: PROVIDER_ADAPTERS,
      cloudUse: announcer,
    });
    const result = await gateway.runTask('hunk-linking', {
      intents: linkingInput().intents,
      hunks: [linkingInput().hunks[0]!],
    });
    expect(result.status).toBe('accepted');
    expect(s.requests).toHaveLength(1);
    expect(heard).not.toHaveBeenCalled();
    expect(announcer.events()).toEqual([]);
  });

  it('no recorded request holds a marker string of an excluded path (C001-TS-835, -837, -850)', async () => {
    const s = await stub();
    s.enqueue({ output: { task: 'hunk-linking', links: [] } });
    const gateway = new ModelGateway({
      configuration: () =>
        configuration({ provider: providerAt(`${s.endpoint}/v1`), excludedPaths: ['secrets/**'] }),
      egress: createEgressPolicy(),
      adapters: PROVIDER_ADAPTERS,
    });
    const result = await gateway.runTask('hunk-linking', linkingInput());
    expect(s.requests).toHaveLength(1);
    const sent = JSON.stringify(s.requests[0]);
    expect(sent).not.toContain(MARKER);
    expect(sent).not.toContain(MARKER_RENAMED);
    expect(sent).not.toContain('secrets/tokens.ts');
    expect(sent).not.toContain('basePath');
    // C001-TS-837: patterns are matched from the repository root.
    expect(sent).toContain('MARKER-b2');
    expect(sent).toContain(MARKER_OK);
    expect(result).toMatchObject({
      status: 'accepted',
      excluded: { hunkIds: [H(2), H(4), H(5)], namedFiles: [] },
    });
    expect(result.notices).toEqual([
      {
        code: 'ERR-MODEL-002',
        message:
          'Model provider "stub" was not used for 3 items on model-excluded paths; they were produced in model-free mode.',
      },
    ]);
  });

  it('an intent with excluded and non-excluded hunks sends only the non-excluded ones (C001-TS-836)', async () => {
    const s = await stub();
    s.enqueue({ output: { task: 'walkthrough-account', intentId: I1, account: 'Signs in.' } });
    const gateway = new ModelGateway({
      configuration: () =>
        configuration({ provider: providerAt(`${s.endpoint}/v1`), excludedPaths: ['secrets/**'] }),
      egress: createEgressPolicy(),
      adapters: PROVIDER_ADAPTERS,
    });
    const hunks = linkingInput().hunks.slice(0, 2);
    const result = await gateway.runTask('walkthrough-account', {
      intent: linkingInput().intents[0]!,
      hunks,
    });
    expect(result.status).toBe('accepted');
    const sent = JSON.stringify(s.requests);
    expect(sent).toContain(MARKER_OK);
    expect(sent).not.toContain(MARKER);
  });

  it('a request whose every hunk is excluded is not sent: model-free, ERR-MODEL-002 (C001-REQ-815)', async () => {
    const connect = vi.spyOn(net.Socket.prototype, 'connect');
    const s = await stub();
    const gateway = new ModelGateway({
      configuration: () =>
        configuration({ provider: providerAt(`${s.endpoint}/v1`), excludedPaths: ['secrets/**'] }),
      egress: createEgressPolicy(),
      adapters: PROVIDER_ADAPTERS,
    });
    const result = await gateway.runTask('hunk-linking', {
      intents: linkingInput().intents,
      hunks: [linkingInput().hunks[1]!],
    });
    expect(result).toMatchObject({
      status: 'model-free',
      cause: 'model-excluded-path',
      labels: { reduced: ['hunk-to-intent grouping'] },
      excluded: { hunkIds: [H(2)] },
    });
    expect(result.notices.map((n) => n.code)).toEqual(['ERR-MODEL-002']);
    expect(connect).not.toHaveBeenCalled();
    expect(s.requests).toEqual([]);
  });

  it('named files inside the repository on excluded paths are not sent', async () => {
    const s = await stub();
    s.enqueue({ output: { task: 'intent-extraction', intents: [] } });
    const gateway = new ModelGateway({
      configuration: () =>
        configuration({ provider: providerAt(`${s.endpoint}/v1`), excludedPaths: ['secrets/**'] }),
      egress: createEgressPolicy(),
      adapters: PROVIDER_ADAPTERS,
    });
    const result = await gateway.runTask('intent-extraction', {
      commits: [{ hash: BASE, subject: 'Sign-in', message: 'Sign-in for REQ-012\n' }],
      namedFiles: [
        {
          role: 'agent-plan',
          path: '/work/repo/secrets/plan.md',
          repositoryPath: 'secrets/plan.md',
          lines: [MARKER],
        },
        { role: 'agent-plan', path: 'docs/plan.md', repositoryPath: 'docs/plan.md', lines: ['ok'] },
      ],
    });
    expect(result).toMatchObject({
      status: 'accepted',
      excluded: { namedFiles: ['/work/repo/secrets/plan.md'] },
    });
    const sent = JSON.stringify(s.requests);
    expect(sent).not.toContain(MARKER);
    expect(sent).not.toContain('repositoryPath');
    expect(sent).toContain('docs/plan.md');
  });

  it('the cloud-use event comes once, before the first cloud request (C001-TS-822)', async () => {
    const order: string[] = [];
    const calls: AdapterRequest[] = [];
    const recording: ProviderAdapter = {
      send: (req) => {
        calls.push(req);
        order.push(`request ${calls.length}`);
        return Promise.resolve({
          ok: true,
          output: { task: 'hunk-linking', links: [] },
          model: null,
        });
      },
    };
    const announcer = new CloudUseAnnouncer();
    announcer.subscribe((event) => order.push(cloudAnnouncement(event)));
    const config = configuration({
      provider: providerAt('https://llm.cloud.test:4443/v1', 'team-cloud'),
      cloudOptIn: true,
    });
    const deps = {
      configuration: () => config,
      egress: createEgressPolicy(),
      adapters: { 'openai-chat': recording },
      cloudUse: announcer,
    };
    // Two gateways of one core (two snapshots) share the process's cloud-use state.
    await new ModelGateway(deps).runTask('hunk-linking', linkingInput());
    await new ModelGateway(deps).runTask('hunk-linking', linkingInput());
    expect(order).toEqual([
      'Repository content is sent to model provider "team-cloud" at llm.cloud.test.',
      'request 1',
      'request 2',
    ]);
    expect(announcer.events()).toEqual([{ provider: 'team-cloud', host: 'llm.cloud.test' }]);
  });

  it('no announcement when no request is sent: every hunk excluded, or no key', async () => {
    const heard = vi.fn();
    const announcer = new CloudUseAnnouncer();
    announcer.subscribe(heard);
    const send = vi.fn();
    const gateway = new ModelGateway({
      configuration: () =>
        configuration({
          provider: providerAt('https://llm.cloud.test/v1'),
          cloudOptIn: true,
          excludedPaths: ['**'],
        }),
      egress: createEgressPolicy(),
      adapters: { 'openai-chat': { send } },
      cloudUse: announcer,
    });
    await gateway.runTask('hunk-linking', linkingInput());
    const noKey = new ModelGateway({
      configuration: () =>
        configuration({ provider: providerAt('https://llm.cloud.test/v1'), cloudOptIn: true }),
      egress: createEgressPolicy(),
      adapters: { 'openai-chat': { send } },
      keys: () =>
        Promise.resolve({
          key: null,
          required: true,
          location: 'environment variable "K"',
          cause: 'unset',
        }),
      cloudUse: announcer,
    });
    await noKey.runTask('hunk-linking', linkingInput());
    expect(send).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('excludeModelPaths (C001-IF-010 §6 check 4)', () => {
  it('matches the base path and the snapshot path, case-sensitively, from the root', () => {
    const out = excludeModelPaths('hunk-linking', linkingInput(), ['secrets/**']);
    expect(out.send).toBe(true);
    expect(out.excluded.hunkIds).toEqual([H(2), H(4), H(5)]);
    const upper = excludeModelPaths(
      'hunk-linking',
      {
        intents: [],
        hunks: [{ hunkId: H(1), path: 'Secrets/tokens.ts', text: MARKER }],
      },
      ['secrets/**'],
    );
    expect(upper.excluded.hunkIds).toEqual([]);
  });

  it('design critique: components whose every hunk is excluded are left out', () => {
    const out = excludeModelPaths(
      'design-critique',
      {
        components: [
          { componentName: 'vault', hunks: [{ hunkId: H(2), path: 'secrets/a.ts', text: MARKER }] },
          { componentName: 'auth', hunks: [{ hunkId: H(1), path: 'src/auth.ts', text: 'ok' }] },
        ],
      },
      ['secrets/**'],
    );
    expect(out).toEqual({
      send: true,
      input: {
        components: [
          { componentName: 'auth', hunks: [{ hunkId: H(1), path: 'src/auth.ts', text: 'ok' }] },
        ],
      },
      excluded: { hunkIds: [H(2)], namedFiles: [] },
    });
  });

  it('without patterns nothing is excluded and the input is sent with the fields of §2 only', () => {
    const out = excludeModelPaths('hunk-linking', linkingInput(), []);
    expect(out.send).toBe(true);
    if (!out.send) return;
    expect(out.excluded).toEqual({ hunkIds: [], namedFiles: [] });
    expect(out.input.hunks.map((h) => Object.keys(h).sort())).toEqual(
      Array(5).fill(['hunkId', 'path', 'text']),
    );
  });

  it('a pattern that does not compile throws, and the gateway then sends nothing', async () => {
    expect(() => excludeModelPaths('hunk-linking', linkingInput(), ['secrets/[x'])).toThrow();
    const send = vi.fn();
    const gateway = new ModelGateway({
      configuration: () => {
        const c = configuration({ provider: providerAt('http://127.0.0.1:1/v1') });
        if (!c.readable) throw new Error('readable');
        return {
          ...c,
          settings: {
            ...c.settings,
            model: { ...c.settings.model, excludedPaths: ['secrets/[x'] },
          },
        };
      },
      egress: createEgressPolicy(),
      adapters: { 'openai-chat': { send } },
    });
    const result = await gateway.runTask('hunk-linking', linkingInput());
    expect(result).toMatchObject({ status: 'model-free', cause: 'model-excluded-path' });
    expect(send).not.toHaveBeenCalled();
  });
});
