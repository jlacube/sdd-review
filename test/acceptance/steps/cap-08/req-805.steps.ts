import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { After, Given, Then } from '@cucumber/cucumber';
import { STUB_MODEL, StubLlm, type RecordedRequest } from '../../support/stub-llm/stub-llm.js';
import type { AcceptanceWorld } from '../../support/world.js';
import {
  CLOUD_HOST,
  baseCommitWith,
  cloudStub,
  cloudStubProvider,
  configText,
  localStub,
  localStubProvider,
  nonLoopbackConnections,
} from './req-801.steps.js';
import { KEY_ENV, setScenarioEnv } from './req-809.steps.js';

// C001-TC-805 (C001-T-087): C001-TS-812 and C001-TS-813, model requests go to the configured
// provider through the configured provider API, over loopback HTTP, the cloud stub or a local
// socket (C001-REQ-805, C001-IF-010 §4, §5). The stubs, the review start and the capture are shared
// with req-801.steps.ts. The requests themselves are made by the model tasks (C001-T-090) once the
// egress policy (C001-T-088) lets the gateway send; the cloud stub's isolated network is C001-T-095.

const API_NAMES: Record<string, 'openai-chat' | 'anthropic-messages'> = {
  'OpenAI-compatible chat API': 'openai-chat',
  'Anthropic Messages API': 'anthropic-messages',
};

function apiOf(name: string): 'openai-chat' | 'anthropic-messages' {
  const api = API_NAMES[name];
  assert.ok(api, `unknown provider API in the scenario: ${name}`);
  return api;
}

/** A key for the scenario's provider, from an environment variable (C001-IF-010 §7). */
function withKey(world: AcceptanceWorld, provider: Record<string, unknown>) {
  setScenarioEnv(world, KEY_ENV, 'sk-scenario-key');
  return { ...provider, keyEnv: KEY_ENV };
}

const socketStubs = new WeakMap<AcceptanceWorld, { stub: StubLlm; cleanup: () => void }>();

After(async function (this: AcceptanceWorld) {
  const entry = socketStubs.get(this);
  if (!entry) return;
  await entry.stub.stop();
  entry.cleanup();
  socketStubs.delete(this);
});

/** A stub listening on a local socket: a Unix socket, or a named pipe on Windows. */
async function socketStub(world: AcceptanceWorld): Promise<{ stub: StubLlm; endpoint: string }> {
  const id = `sdd-review-${process.pid}-${Math.random().toString(16).slice(2)}`;
  let listenPath: string;
  let endpoint: string;
  let cleanup = () => {};
  if (process.platform === 'win32') {
    listenPath = `\\\\.\\pipe\\${id}`;
    endpoint = `npipe:${id}`;
  } else {
    // Unix socket paths are limited to about 100 bytes; macOS temporary paths are long.
    const dir = mkdtempSync(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'sdd-'));
    listenPath = join(dir, 'llm.sock');
    endpoint = `unix:${listenPath}`;
    cleanup = () => rmSync(dir, { recursive: true, force: true });
  }
  const stub = new StubLlm();
  await stub.startOnSocket(listenPath);
  socketStubs.set(world, { stub, cleanup });
  return { stub, endpoint };
}

Given(
  'a review configuration that names the local stub with the provider API {string}',
  async function (this: AcceptanceWorld, apiName: string) {
    const provider = { ...(await localStubProvider(this)), api: apiOf(apiName) };
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider } }));
  },
);

Given(
  // The outline writes `"<api>"<opt_in>` with no space before the opt-in column's text.
  /^a review configuration that names the cloud stub with the provider API "([^"]+)" ?and the cloud opt-in setting$/,
  async function (this: AcceptanceWorld, apiName: string) {
    const api = apiOf(apiName);
    const stub = await cloudStub(this);
    const base = await cloudStubProvider(this);
    const endpoint =
      api === 'anthropic-messages' ? `https://${CLOUD_HOST}:${stub.port}` : base.endpoint;
    const provider = withKey(this, { ...base, api, endpoint });
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider, cloudOptIn: true } }));
  },
);

Given(
  'the change has hunks without a deterministic link signal and no SDD workspace',
  function (this: AcceptanceWorld) {
    // The change of `baseCommitWith` edits one function, with no commit message, intent file or
    // SDD workspace that could link it deterministically.
    assert.ok(this.repo, 'the configuration step creates the repository');
  },
);

Given(
  'a review configuration that names a stub listening on a local socket with the provider API {string} and no cloud opt-in setting',
  async function (this: AcceptanceWorld, apiName: string) {
    const { endpoint } = await socketStub(this);
    const provider = { name: 'socket-stub', api: apiOf(apiName), endpoint, model: STUB_MODEL };
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider } }));
  },
);

/** The task a recorded request asks for, from its system instruction (C001-IF-010 §3 item 1). */
function taskOf(
  request: RecordedRequest,
  api: 'openai-chat' | 'anthropic-messages',
): string | null {
  const body = request.body as Record<string, unknown> | string;
  if (typeof body !== 'object' || body === null) return null;
  let system: unknown;
  if (api === 'openai-chat') {
    const messages = body.messages as Array<{ role?: string; content?: unknown }> | undefined;
    system = messages?.find((m) => m.role === 'system')?.content;
  } else {
    system = body.system;
  }
  return typeof system === 'string' ? (/Task "([a-z-]+)"/.exec(system)?.[1] ?? null) : null;
}

/** Checks that a request has the request format of its provider API (§4, §5). */
function assertFormat(request: RecordedRequest, api: 'openai-chat' | 'anthropic-messages') {
  const body = request.body as Record<string, unknown>;
  assert.equal(request.method, 'POST');
  assert.equal(body.model, STUB_MODEL);
  assert.equal(body.temperature, 0);
  if (api === 'openai-chat') {
    assert.equal(request.path, '/v1/chat/completions');
    const roles = (body.messages as Array<{ role: string }>).map((m) => m.role);
    assert.deepEqual(roles, ['system', 'user']);
    assert.equal(typeof body.max_tokens, 'number');
  } else {
    assert.equal(request.path, '/v1/messages');
    assert.equal(request.headers['anthropic-version'], '2023-06-01');
    assert.equal(typeof request.headers['x-api-key'], 'string');
    assert.deepEqual(body.tool_choice, { type: 'tool', name: 'submit_result' });
    assert.equal((body.messages as unknown[]).length, 1);
  }
}

const FOUR_TASKS = ['intent-extraction', 'hunk-linking', 'walkthrough-account', 'design-critique'];

Then(
  /^the stub at the (local|cloud) stub has received requests in the request format of the (OpenAI-compatible chat API|Anthropic Messages API) for intent extraction, hunk-to-intent grouping, walkthrough accounts and design critique$/,
  async function (this: AcceptanceWorld, which: string, apiName: string) {
    const api = apiOf(apiName);
    const stub = which === 'local' ? await localStub(this) : await cloudStub(this);
    for (const request of stub.requests) assertFormat(request, api);
    const tasks = new Set(stub.requests.map((r) => taskOf(r, api)));
    for (const task of FOUR_TASKS) {
      assert.ok(tasks.has(task), `no ${task} request; received: ${[...tasks].join(', ')}`);
    }
  },
);

Then(
  'network capture records no connection to any other non-loopback address',
  function (this: AcceptanceWorld) {
    const others = nonLoopbackConnections(this).filter((c) => c.host !== CLOUD_HOST);
    assert.deepEqual(others, []);
  },
);

Then(
  'the stub on the local socket has received the intent-extraction requests',
  function (this: AcceptanceWorld) {
    const entry = socketStubs.get(this);
    assert.ok(entry, 'no stub on a local socket');
    const tasks = entry.stub.requests.map((r) => taskOf(r, 'openai-chat'));
    assert.ok(tasks.includes('intent-extraction'), `received: ${tasks.join(', ')}`);
    for (const request of entry.stub.requests) assertFormat(request, 'openai-chat');
  },
);
