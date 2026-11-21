import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { After, Given, Then, When } from '@cucumber/cucumber';
import { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import { openCore } from '../../../../src/core/api/open.js';
import { CONFIGURATION_PATH } from '../../../../src/core/api/index.js';
import { HeadlessOutput } from '../../support/headless-output.js';
import { STUB_MODEL, StubLlm } from '../../support/stub-llm/stub-llm.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-801 (C001-T-085): C001-TS-801 to C001-TS-803, model-free mode when the base commit's
// review configuration names no provider (C001-REQ-801). Shared by the CAP-08 steps: the local and
// cloud stubs, the review start and the model-free and capture checks (also C001-TS-856, -857).
//
// The local stub listens on a free loopback port (no fixed port in CI) instead of 127.0.0.1:11434;
// the configuration names its actual endpoint. The cloud stub is named by the host
// `llm.cloud.test`; until the isolated test network of C001-T-095 it listens on loopback, and a
// connection attempt to that host shows in the connection capture of `listen-spy.mjs`.

export const CLOUD_HOST = 'llm.cloud.test';
const cloudStubs = new WeakMap<AcceptanceWorld, StubLlm>();

export async function localStub(world: AcceptanceWorld): Promise<StubLlm> {
  if (!world.stub) {
    world.stub = new StubLlm();
    await world.stub.start();
  }
  return world.stub;
}

export async function cloudStub(world: AcceptanceWorld): Promise<StubLlm> {
  let stub = cloudStubs.get(world);
  if (!stub) {
    stub = new StubLlm();
    await stub.start();
    cloudStubs.set(world, stub);
  }
  return stub;
}

After(async function (this: AcceptanceWorld) {
  await cloudStubs.get(this)?.stop();
  cloudStubs.delete(this);
});

/** The provider entry of C001-IF-004 for the local stub (OpenAI-compatible chat API). */
export async function localStubProvider(world: AcceptanceWorld): Promise<Record<string, unknown>> {
  const stub = await localStub(world);
  return {
    name: 'local-stub',
    api: 'openai-chat',
    endpoint: `${stub.endpoint}/v1`,
    model: STUB_MODEL,
  };
}

/** The provider entry for the cloud stub, reached by a non-loopback host name. */
export async function cloudStubProvider(world: AcceptanceWorld): Promise<Record<string, unknown>> {
  const stub = await cloudStub(world);
  return {
    name: 'cloud-stub',
    api: 'openai-chat',
    endpoint: `https://${CLOUD_HOST}:${stub.port}/v1`,
    model: STUB_MODEL,
  };
}

export const configText = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** A repository whose base commit B0 holds `config` (or no configuration), and an edit to review. */
export function baseCommitWith(world: AcceptanceWorld, config: string | null): FixtureRepo {
  const repo = FixtureRepo.create();
  world.repo = repo;
  repo.commit('B0', {
    files: {
      'src/cart.ts': 'export function total(items: number[]): number {\n  return 0;\n}\n',
      ...(config === null ? {} : { [CONFIGURATION_PATH]: config }),
    },
  });
  repo.write(
    'src/cart.ts',
    'export function total(items: number[]): number {\n  return items.reduce((a, b) => a + b, 0);\n}\n',
  );
  return repo;
}

const isLoopback = (host: string | null) =>
  host === null ||
  /^localhost\.?$/i.test(host) ||
  /^127\.\d+\.\d+\.\d+$/.test(host) ||
  host === '::1' ||
  host === '[::1]';

export function nonLoopbackConnections(world: AcceptanceWorld) {
  return world.connectCalls().filter((c) => c.path === null && !isLoopback(c.host));
}

Given(
  'a base commit whose review configuration sets clearing rules and names no model provider',
  function (this: AcceptanceWorld) {
    baseCommitWith(
      this,
      configText({
        formatVersion: 1,
        clearing: { rules: { passingTests: false, pureRename: true } },
      }),
    );
  },
);

Given(
  'a base commit whose review configuration names no model provider',
  function (this: AcceptanceWorld) {
    baseCommitWith(
      this,
      configText({ formatVersion: 1, clearing: { rules: { formatting: true } } }),
    );
  },
);

Given('a base commit that holds no review configuration', function (this: AcceptanceWorld) {
  baseCommitWith(this, null);
});

Given('the local stub is running', async function (this: AcceptanceWorld) {
  await localStub(this);
});

Given(
  'the change under review adds the local stub as model provider to the review configuration',
  async function (this: AcceptanceWorld) {
    const provider = await localStubProvider(this);
    this.repo!.write(CONFIGURATION_PATH, configText({ formatVersion: 1, model: { provider } }));
  },
);

Given(
  'the local stub and the cloud stub are running and network capture is running',
  async function (this: AcceptanceWorld) {
    await localStub(this);
    await cloudStub(this);
    // The capture of `listen-spy.mjs` is armed for every CLI run of the scenario (`cliEnv`).
    assert.ok(this.cliEnv().SDD_CONNECT_LOG);
  },
);

/**
 * Starts a review of the working-tree change headless: intake, the jobs, the results written. The
 * CLI runs as a process that does not block this one, so that the stubs of this process can answer
 * the model requests it makes (C001-T-089).
 */
async function startReview(world: AcceptanceWorld): Promise<void> {
  const out = join(world.tempDir('sddout-'), 'results');
  await world.cliAsync(['analyse', '--headless', '--out', out]);
  assert.equal(world.lastRun?.status, 0, world.lastRun?.stderr);
  world.headless = new HeadlessOutput(out);
}

When('the developer starts a review of the change', async function (this: AcceptanceWorld) {
  await startReview(this);
});

When('the analysis of the snapshot completes', async function (this: AcceptanceWorld) {
  await startReview(this);
});

Then('the local stub receives no request', function (this: AcceptanceWorld) {
  assert.deepEqual(this.stub?.requests ?? [], []);
});

Then(
  'neither the local stub nor the cloud stub receives a request',
  function (this: AcceptanceWorld) {
    assert.deepEqual(this.stub?.requests ?? [], [], 'the local stub received a request');
    assert.deepEqual(cloudStubs.get(this)?.requests ?? [], [], 'the cloud stub received a request');
  },
);

/** The provider status of the review's session, read through the core API (C001-IF-002). */
export async function providerMode(world: AcceptanceWorld): Promise<string> {
  const opened = await openCore(world.repo!.dir, { env: world.cliEnv() });
  try {
    const reviews = await opened.core.api.listReviews();
    assert.equal(reviews.length, 1, 'expected the one review of the scenario');
    return (await opened.core.api.getSession(reviews[0]!.snapshotId)).providerStatus.mode;
  } finally {
    await opened.close();
  }
}

Then('the review runs in model-free mode', async function (this: AcceptanceWorld) {
  assert.equal(await providerMode(this), 'model-free');
});

Then(
  'the review runs in model-free mode and reports the notice {word}',
  async function (this: AcceptanceWorld, code: string) {
    assert.equal(await providerMode(this), 'model-free');
    const lines = (this.lastRun?.stderr ?? '').split('\n');
    assert.ok(
      lines.some((line) => line.startsWith(`${code}: `)),
      `no ${code} on standard error: ${this.lastRun?.stderr}`,
    );
  },
);

Then('the review reports no notice {word}', function (this: AcceptanceWorld, code: string) {
  const lines = (this.lastRun?.stderr ?? '').split('\n');
  assert.ok(!lines.some((line) => line.startsWith(`${code}: `)), this.lastRun?.stderr);
});

Then(
  'network capture records no connection to a non-loopback address',
  function (this: AcceptanceWorld) {
    assert.deepEqual(nonLoopbackConnections(this), []);
  },
);

Then(
  'network capture records {int} connections to non-loopback addresses',
  function (this: AcceptanceWorld, n: number) {
    assert.equal(nonLoopbackConnections(this).length, n, JSON.stringify(this.connectCalls()));
  },
);
