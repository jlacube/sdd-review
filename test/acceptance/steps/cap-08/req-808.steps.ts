import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { After, Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { lastRun as lastReviewRun } from '../cap-09/req-901-903.steps.js';
import {
  baseCommitWith,
  cloudStub,
  cloudStubProvider,
  configText,
  localStubProvider,
} from './req-801.steps.js';

// C001-TC-808 (C001-T-088): C001-TS-822 to C001-TS-824, the CLI announces a cloud provider before
// its first request (C001-REQ-808, C001-IF-001 §Output, C001-IF-010 §6 check 5). The review command
// is the one of cap-09/req-901-903.steps.ts; the headless analysis runs as a process here, not with
// the blocking `world.cli`, so that the stub of this process can answer while the CLI runs.
//
// "Before the first request": the cloud stub holds its first answer until the announcement shows
// on the CLI's standard error. The CLI waits for that answer, so the line can only arrive in that
// time if the CLI wrote it before it sent the request.

const ANNOUNCEMENT = /^Repository content is sent to model provider "([^"]+)" at (\S+)\.$/m;
const HOLD_MS = 10_000;

interface Announced {
  /** Whether the announcement was on standard error when the first request arrived. */
  beforeFirstRequest: boolean | undefined;
}

const announced = new WeakMap<AcceptanceWorld, Announced>();
/** A headless analysis started here, as a process that does not block this one. */
interface HeadlessRun {
  stdout: string;
  stderr: string;
  status: number | null | undefined;
}

const CLI = resolve('dist/cli/main.js');
const LISTEN_SPY = pathToFileURL(resolve('test/acceptance/support/listen-spy.mjs')).href;
const headlessRuns = new WeakMap<AcceptanceWorld, HeadlessRun>();

After(function (this: AcceptanceWorld) {
  headlessRuns.delete(this);
  announced.delete(this);
});

/** The standard output and error of the scenario's CLI run so far. */
function cliOutput(world: AcceptanceWorld): { stdout: string; stderr: string } {
  const headless = headlessRuns.get(world);
  if (headless) return { stdout: headless.stdout, stderr: headless.stderr };
  try {
    const { cli } = lastReviewRun(world);
    return { stdout: cli.stdout(), stderr: cli.stderr() };
  } catch {
    return { stdout: world.lastRun?.stdout ?? '', stderr: world.lastRun?.stderr ?? '' };
  }
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
}

Given(
  'a review configuration that names the cloud stub as provider {string} with the cloud opt-in setting',
  async function (this: AcceptanceWorld, name: string) {
    const provider = { ...(await cloudStubProvider(this)), name };
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider, cloudOptIn: true } }));
    const state: Announced = { beforeFirstRequest: undefined };
    announced.set(this, state);
    const stub = await cloudStub(this);
    stub.onRequest = async () => {
      if (state.beforeFirstRequest !== undefined) return;
      state.beforeFirstRequest = false;
      state.beforeFirstRequest = await waitFor(
        () => ANNOUNCEMENT.test(cliOutput(this).stderr),
        HOLD_MS,
      );
    };
  },
);

Given('the local stub configured as model provider', async function (this: AcceptanceWorld) {
  baseCommitWith(
    this,
    configText({ formatVersion: 1, model: { provider: await localStubProvider(this) } }),
  );
});

When(
  'the developer runs the analysis command of the CLI in headless mode',
  async function (this: AcceptanceWorld) {
    const out = join(this.tempDir('sddout-'), 'results');
    const run: HeadlessRun = { stdout: '', stderr: '', status: undefined };
    headlessRuns.set(this, run);
    const child = spawn(
      process.execPath,
      ['--import', LISTEN_SPY, CLI, 'analyse', '--headless', '--out', out],
      { cwd: this.repo!.dir, env: this.cliEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout.on('data', (chunk: Buffer) => (run.stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (run.stderr += chunk.toString('utf8')));
    const killer = setTimeout(() => child.kill('SIGKILL'), 110_000);
    run.status = await new Promise<number | null>((resolveRun, reject) => {
      child.on('error', reject);
      child.on('close', (status) => resolveRun(status));
    }).finally(() => clearTimeout(killer));
    assert.equal(run.status, 0, run.stderr);
  },
);

function assertAnnounced(world: AcceptanceWorld, name: string): void {
  const { stderr } = cliOutput(world);
  const match = ANNOUNCEMENT.exec(stderr);
  assert.ok(match, `no cloud announcement on standard error: ${stderr}`);
  assert.equal(match[1], name);
}

async function assertBeforeFirstRequest(world: AcceptanceWorld): Promise<void> {
  const stub = await cloudStub(world);
  // Not vacuous: the order can only be seen when the cloud stub received a request.
  assert.ok(stub.requests.length > 0, 'the cloud stub received no request');
  assert.equal(
    announced.get(world)?.beforeFirstRequest,
    true,
    'the announcement was not on standard error when the first request arrived',
  );
}

Then(
  'the CLI output holds the provider name {string} and a notice that repository content is sent to it',
  function (this: AcceptanceWorld, name: string) {
    assertAnnounced(this, name);
  },
);

Then(
  'the CLI printed that notice before the cloud stub recorded its first request',
  async function (this: AcceptanceWorld) {
    await assertBeforeFirstRequest(this);
  },
);

Then(
  "the CLI output holds the provider name {string} and a notice that repository content is sent to it, before the cloud stub's first request",
  async function (this: AcceptanceWorld, name: string) {
    assertAnnounced(this, name);
    await assertBeforeFirstRequest(this);
  },
);

Then(
  'the CLI output holds no notice that repository content is sent to a provider',
  function (this: AcceptanceWorld) {
    const { stdout, stderr } = cliOutput(this);
    assert.ok(!/Repository content is sent to/i.test(stdout + stderr), stdout + stderr);
  },
);
