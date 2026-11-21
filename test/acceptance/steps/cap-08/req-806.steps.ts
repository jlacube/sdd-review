import { strict as assert } from 'node:assert';
import { isIP } from 'node:net';
import { After, Given, Then } from '@cucumber/cucumber';
import { CONFIGURATION_PATH } from '../../../../src/core/api/index.js';
import { STUB_MODEL, StubLlm } from '../../support/stub-llm/stub-llm.js';
import type { AcceptanceWorld } from '../../support/world.js';
import {
  CLOUD_HOST,
  baseCommitWith,
  cloudStub,
  cloudStubProvider,
  configText,
  localStub,
  nonLoopbackConnections,
  providerMode,
} from './req-801.steps.js';
import { taskOf } from './req-805.steps.js';
import { setScenarioEnv } from './req-809.steps.js';

// C001-TC-806 (C001-T-088): C001-TS-814 to C001-TS-818, C001-TS-848 and C001-TS-849, the endpoint
// locality from the endpoint text and the cloud opt-in (C001-REQ-806, C001-IF-010 §6 checks 2, 3).
// The review start, the stubs and the connection capture are those of req-801.steps.ts.
//
// No fixed port in CI: the scenarios' port 11434 is replaced by the free port the stub listens on
// (an endpoint nobody listens on would do for the refusals, but a stub there shows that nothing
// reached it). The hosts file of C001-TS-849 is stood in for by `listen-spy.mjs`, which answers
// the system resolver of the CLI process for the mapped names (`SDD_ACCEPT_HOSTS`).

const SCENARIO_PORT = '11434';
const addressStubs = new WeakMap<AcceptanceWorld, Map<string, StubLlm>>();

After(async function (this: AcceptanceWorld) {
  for (const stub of addressStubs.get(this)?.values() ?? []) await stub.stop();
  addressStubs.delete(this);
});

const bracketed = (address: string) => (address.includes(':') ? `[${address}]` : address);
const unbracketed = (host: string) => host.replace(/^\[(.*)\]$/, '$1');

/** A stub on one loopback address of the scenario (127.0.0.1, 127.255.255.254, ::1). */
async function stubOn(world: AcceptanceWorld, address: string): Promise<StubLlm | 'skipped'> {
  let stubs = addressStubs.get(world);
  if (!stubs) addressStubs.set(world, (stubs = new Map()));
  const existing = stubs.get(address);
  if (existing) return existing;
  const stub = new StubLlm();
  try {
    await stub.start(0, address);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // macOS configures only 127.0.0.1 of 127.0.0.0/8 on lo0, and some CI hosts have no IPv6
    // loopback: the address cannot be listened on there, which says nothing about the gateway.
    if (code === 'EADDRNOTAVAIL' || code === 'EAFNOSUPPORT') return 'skipped';
    throw error;
  }
  stubs.set(address, stub);
  return stub;
}

/** The endpoint text of the scenario with its port 11434 replaced by `port`. */
const withPort = (endpoint: string, port: number) =>
  endpoint.replace(`:${SCENARIO_PORT}`, `:${port}`);

function configure(world: AcceptanceWorld, provider: Record<string, unknown>, optIn = false) {
  baseCommitWith(
    world,
    configText({ formatVersion: 1, model: { provider, ...(optIn ? { cloudOptIn: true } : {}) } }),
  );
}

const openAiAt = (endpoint: string, name = 'scenario-runtime') => ({
  name,
  api: 'openai-chat',
  endpoint,
  model: STUB_MODEL,
});

// C001-TS-814

Given(
  'a review configuration that names the cloud stub with the provider API {string} and no cloud opt-in setting',
  async function (this: AcceptanceWorld, apiName: string) {
    const api = apiName === 'Anthropic Messages API' ? 'anthropic-messages' : 'openai-chat';
    const stub = await cloudStub(this);
    const base = await cloudStubProvider(this);
    const endpoint =
      api === 'anthropic-messages' ? `https://${CLOUD_HOST}:${stub.port}` : base.endpoint;
    configure(this, { ...base, api, endpoint });
  },
);

// C001-TS-815

Given(
  'a review configuration that names a model runtime at {string} described as local, with no cloud opt-in setting',
  async function (this: AcceptanceWorld, endpoint: string) {
    const stub = await localStub(this);
    configure(this, openAiAt(withPort(endpoint, stub.port), 'local runtime'));
  },
);

// C001-TS-816

Given(
  /^a stub listening on (\S+) port (\d+), named in the review configuration with the OpenAI-compatible chat API and no cloud opt-in setting$/,
  async function (this: AcceptanceWorld, address: string, _port: string) {
    const stub = await stubOn(this, address);
    if (stub === 'skipped') return 'skipped';
    configure(this, openAiAt(`http://${bracketed(address)}:${stub.port}/v1`));
    return undefined;
  },
);

Then(
  /^the stub on (\S+) has received the intent-extraction requests$/,
  function (this: AcceptanceWorld, address: string) {
    const stub = addressStubs.get(this)?.get(address);
    assert.ok(stub, `no stub on ${address}`);
    const tasks = stub.requests.map((r) => taskOf(r, 'openai-chat'));
    assert.ok(tasks.includes('intent-extraction'), `received: ${tasks.join(', ')}`);
  },
);

// C001-TS-817

Given(
  /^a review configuration that names an endpoint on (\S+) port (\d+) with no cloud opt-in setting$/,
  async function (this: AcceptanceWorld, address: string, _port: string) {
    // A stub on loopback listens on the port, so a connection that went to loopback instead
    // would show; the address itself is outside loopback and nobody listens there.
    const stub = await localStub(this);
    configure(this, openAiAt(`http://${bracketed(address)}:${stub.port}/v1`));
  },
);

/** No connection attempt of the CLI went to `host` (an IPv6 literal with or without brackets). */
function assertNoConnectionTo(world: AcceptanceWorld, host: string): void {
  const wanted = unbracketed(host).toLowerCase();
  const to = world
    .connectCalls()
    .filter((c) => c.host !== null && unbracketed(c.host).toLowerCase() === wanted);
  assert.deepEqual(to, [], `connections to ${host}: ${JSON.stringify(to)}`);
}

Then(
  'network capture records no connection to {string}',
  function (this: AcceptanceWorld, host: string) {
    assertNoConnectionTo(this, host);
  },
);

Then(
  /^network capture records no connection to ([^\s"]+)$/,
  function (this: AcceptanceWorld, host: string) {
    assertNoConnectionTo(this, host);
  },
);

// C001-TS-818

Given(
  'a base commit whose review configuration names the cloud stub and has no cloud opt-in setting',
  async function (this: AcceptanceWorld) {
    configure(this, await cloudStubProvider(this));
  },
);

Given(
  'the change under review adds the cloud opt-in setting to the review configuration',
  async function (this: AcceptanceWorld) {
    const provider = await cloudStubProvider(this);
    this.repo!.write(
      CONFIGURATION_PATH,
      configText({ formatVersion: 1, model: { provider, cloudOptIn: true } }),
    );
  },
);

// C001-TS-848

Given(
  /^(?:a|the local) stub listening on 127\.0\.0\.1 port (\d+)$/,
  async function (this: AcceptanceWorld, _port: string) {
    await localStub(this);
  },
);

Given(
  'a review configuration that names the endpoint {string} with the OpenAI-compatible chat API and no cloud opt-in setting',
  async function (this: AcceptanceWorld, endpoint: string) {
    const stub = await localStub(this);
    configure(this, openAiAt(withPort(endpoint, stub.port)));
  },
);

Given('network capture is running', function (this: AcceptanceWorld) {
  // The capture of `listen-spy.mjs` is armed for every CLI run of the scenario (`cliEnv`).
  assert.ok(this.cliEnv().SDD_CONNECT_LOG);
});

Then(
  'the local stub has received the intent-extraction requests',
  async function (this: AcceptanceWorld) {
    const stub = await localStub(this);
    const tasks = stub.requests.map((r) => taskOf(r, 'openai-chat'));
    assert.ok(tasks.includes('intent-extraction'), `received: ${tasks.join(', ')}`);
  },
);

Then(
  'network capture records {int} DNS queries and {int} connections to non-loopback addresses',
  function (this: AcceptanceWorld, queries: number, connections: number) {
    // A connection asked for by host name goes through the system resolver; one asked for by IP
    // literal does not. The gateway connects `localhost` through 127.0.0.1 or ::1 (§6).
    const byName = this.connectCalls().filter(
      (c) => c.path === null && c.host !== null && isIP(unbracketed(c.host)) === 0,
    );
    assert.equal(byName.length, queries, `connections by host name: ${JSON.stringify(byName)}`);
    assert.equal(nonLoopbackConnections(this).length, connections);
  },
);

// C001-TS-849

Given(
  /^the hosts file of the machine maps "([^"]+)" to 127\.0\.0\.1$/,
  function (this: AcceptanceWorld, host: string) {
    setScenarioEnv(this, 'SDD_ACCEPT_HOSTS', JSON.stringify({ [host.toLowerCase()]: '127.0.0.1' }));
  },
);

Given(
  'a review configuration that names the endpoint {string} with no cloud opt-in setting',
  async function (this: AcceptanceWorld, endpoint: string) {
    const stub = await localStub(this);
    configure(this, openAiAt(withPort(endpoint, stub.port)));
  },
);

Then('the stub receives no request', async function (this: AcceptanceWorld) {
  assert.deepEqual((await localStub(this)).requests, []);
});

Then(
  'the review runs in model-free mode and reports the notice {word} naming {string}',
  async function (this: AcceptanceWorld, code: string, host: string) {
    assert.equal(await providerMode(this), 'model-free');
    const lines = (this.lastRun?.stderr ?? '').split('\n');
    assert.ok(
      lines.some((line) => line.startsWith(`${code}: `) && line.includes(`"${host}"`)),
      `no ${code} naming "${host}" on standard error: ${this.lastRun?.stderr}`,
    );
  },
);
