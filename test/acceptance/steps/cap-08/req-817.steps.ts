import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Given, Then } from '@cucumber/cucumber';
import { STUB_MODEL } from '../../support/stub-llm/stub-llm.js';
import type { AcceptanceWorld } from '../../support/world.js';
import {
  CLOUD_HOST,
  baseCommitWith,
  cloudStub,
  configText,
  localStub,
  localStubProvider,
} from './req-801.steps.js';
import { setScenarioEnv } from './req-809.steps.js';
import { stopLocalStub } from './req-816.steps.js';

// C001-TC-817 (C001-T-089): C001-TS-844 to C001-TS-846, C001-TS-854 and C001-TS-855, a configured
// provider that was not used is reported with the cause and the number of items produced in
// model-free mode (C001-REQ-817, C001-IF-010 §7, ERR-MODEL-001 to ERR-MODEL-010). The CLI writes
// each notice as `<code>: <message>` on standard error. The requests are made by the model tasks
// (C001-T-090); the cloud stub is reached by its host name once the isolated network of C001-T-095
// is in place.

/** The words of each cause in its catalogue message (`errors.md`). */
const CAUSE_WORDS: Record<string, { code: string; words: RegExp }> = {
  'cloud opt-in setting missing': {
    code: 'ERR-MODEL-001',
    words: /the cloud opt-in setting is missing/,
  },
  'model-excluded path': { code: 'ERR-MODEL-002', words: /on model-excluded paths/ },
  'provider unreachable': { code: 'ERR-MODEL-003', words: /is unreachable/ },
  timeout: { code: 'ERR-MODEL-004', words: /did not answer within \d+ s/ },
  'unusable output': { code: 'ERR-MODEL-005', words: /returned unusable output/ },
  'provider key not found': { code: 'ERR-MODEL-006', words: /no key found in/ },
};

function causeWords(cause: string): { code: string; words: RegExp } {
  const known = CAUSE_WORDS[cause];
  if (known) return known;
  const status =
    /^(key rejected|rate or quota limit reached|provider server error|provider refused the request) \(HTTP (\d{3})\)$/.exec(
      cause,
    );
  assert.ok(status, `unknown cause in the scenario: ${cause}`);
  const [, kind, code] = status;
  const words: Record<string, [string, string]> = {
    'key rejected': ['ERR-MODEL-007', 'rejected the key'],
    'rate or quota limit reached': ['ERR-MODEL-008', 'rate or quota limit reached'],
    'provider server error': ['ERR-MODEL-009', 'failed with a server error'],
    'provider refused the request': ['ERR-MODEL-010', 'refused the request'],
  };
  const [c, w] = words[kind!]!;
  return { code: c, words: new RegExp(`${w} \\(HTTP ${code}\\)`) };
}

/** The notice lines of the CLI run: `<code>: <message>` on standard error. */
function notices(world: AcceptanceWorld): Array<{ code: string; message: string }> {
  return (world.lastRun?.stderr ?? '')
    .split('\n')
    .map((line) => /^(ERR-[A-Z]+-\d{3}): (.*)$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ code: m[1]!, message: m[2]! }));
}

function noticeOf(world: AcceptanceWorld, code: string): string {
  const found = notices(world).filter((n) => n.code === code);
  assert.equal(found.length, 1, `expected one ${code} notice: ${world.lastRun?.stderr}`);
  return found[0]!.message;
}

// C001-TS-844: the provider of the scenario, completed by its situation.

interface Scene {
  name: string;
  stub: 'local' | 'cloud';
  model: Record<string, unknown>;
}

const scenes = new WeakMap<AcceptanceWorld, Scene>();

async function provider(world: AcceptanceWorld, scene: Scene, extra: Record<string, unknown> = {}) {
  if (scene.stub === 'local')
    return { ...(await localStubProvider(world)), name: scene.name, ...extra };
  const stub = await cloudStub(world);
  return {
    name: scene.name,
    api: 'openai-chat',
    endpoint: `https://${CLOUD_HOST}:${stub.port}/v1`,
    model: STUB_MODEL,
    ...extra,
  };
}

/** Makes the base commit hold the scene's configuration (again, when a situation changes it). */
async function commitScene(
  world: AcceptanceWorld,
  scene: Scene,
  extra: Record<string, unknown> = {},
) {
  const model = { ...scene.model, provider: await provider(world, scene, extra) };
  baseCommitWith(world, configText({ formatVersion: 1, model }));
}

Given(
  /^a review configuration that names provider "([^"]+)" at the (local|cloud) stub$/,
  async function (this: AcceptanceWorld, name: string, stub: 'local' | 'cloud') {
    const scene: Scene = { name, stub, model: {} };
    scenes.set(this, scene);
    await commitScene(this, scene);
  },
);

function sceneOf(world: AcceptanceWorld): Scene {
  const scene = scenes.get(world);
  assert.ok(scene, 'the scenario names no provider');
  return scene;
}

Given('the configuration has no cloud opt-in setting', function (this: AcceptanceWorld) {
  assert.equal(sceneOf(this).model.cloudOptIn, undefined);
});

Given(
  /^(\d+) hunks lie on the model-excluded path pattern "([^"]+)"$/,
  async function (this: AcceptanceWorld, n: string, pattern: string) {
    const scene = sceneOf(this);
    scene.model = { ...scene.model, excludedPaths: [pattern] };
    await commitScene(this, scene);
    addFilesUnder(this, pattern.replace(/\/\*\*$/, ''), Number(n));
  },
);

/** Adds `n` new files under `dir`: `n` hunks with no deterministic link signal. */
function addFilesUnder(world: AcceptanceWorld, dir: string, n: number): void {
  for (let i = 0; i < n; i++) {
    world.repo!.write(`${dir}/part-${i + 1}.ts`, `export const part${i + 1} = ${i + 1};\n`);
  }
}

Given('the local stub is not running', async function (this: AcceptanceWorld) {
  await stopLocalStub(this);
});

Given('the local stub answers after the provider timeout', async function (this: AcceptanceWorld) {
  const scene = sceneOf(this);
  scene.model = { ...scene.model, timeoutSeconds: 1 };
  await commitScene(this, scene);
  (await localStub(this)).always = { hang: true };
});

Given(
  'the local stub answers with a body that is not valid JSON',
  async function (this: AcceptanceWorld) {
    (await localStub(this)).always = { body: '{"choices": [' };
  },
);

Given(
  'the cloud opt-in is set and no key is found for the Anthropic Messages API',
  async function (this: AcceptanceWorld) {
    const scene = sceneOf(this);
    scene.model = { ...scene.model, cloudOptIn: true };
    setScenarioEnv(this, 'SDD_T089_ABSENT_KEY', undefined);
    const stub = await cloudStub(this);
    await commitScene(this, scene, {
      api: 'anthropic-messages',
      endpoint: `https://${CLOUD_HOST}:${stub.port}`,
      keyEnv: 'SDD_T089_ABSENT_KEY',
      // An entry no credential store holds, so that a developer's own key is never found.
      keyCredential: { service: 'sdd-review/t089-acceptance', account: `none-${process.pid}` },
    });
  },
);

Given(
  'the cloud opt-in is set and the cloud stub answers HTTP {int}',
  async function (this: AcceptanceWorld, status: number) {
    const scene = sceneOf(this);
    scene.model = { ...scene.model, cloudOptIn: true };
    setScenarioEnv(this, 'SDD_T089_KEY', 'sk-test-t089');
    await commitScene(this, scene, { keyEnv: 'SDD_T089_KEY' });
    (await cloudStub(this)).always = { status };
  },
);

Given('the local stub answers HTTP {int}', async function (this: AcceptanceWorld, status: number) {
  (await localStub(this)).always = { status };
});

Then(
  'the review reports the notice {word} that names {string}, the cause {string} and the number of items produced in model-free mode',
  function (this: AcceptanceWorld, code: string, name: string, cause: string) {
    const expected = causeWords(cause);
    assert.equal(code, expected.code, `the scenario pairs "${cause}" with ${code}`);
    const message = noticeOf(this, code);
    assert.ok(message.includes(`"${name}"`), message);
    assert.match(message, expected.words);
    assert.match(message, /\b\d+ items\b/);
  },
);

// C001-TS-854, C001-TS-855

Given(
  'a review configuration with the local stub as model provider {string}',
  async function (this: AcceptanceWorld, name: string) {
    const provider = { ...(await localStubProvider(this)), name };
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider } }));
  },
);

Given(
  'the local stub answers HTTP {int} on every request',
  async function (this: AcceptanceWorld, status: number) {
    (await localStub(this)).always = { status };
  },
);

Then(
  'the review reports the notice {word} that names {string} and the status {int}',
  async function (this: AcceptanceWorld, code: string, name: string, status: number) {
    assert.ok((await localStub(this)).requests.length > 0, 'the local stub received no request');
    const message = noticeOf(this, code);
    assert.ok(message.includes(`"${name}"`), message);
    assert.ok(message.includes(`HTTP ${status}`), message);
  },
);

Then('it reports no notice of another ERR-MODEL code', function (this: AcceptanceWorld) {
  const codes = new Set(
    notices(this)
      .map((n) => n.code)
      .filter((c) => c.startsWith('ERR-MODEL-')),
  );
  assert.equal(codes.size, 1, `ERR-MODEL notices: ${[...codes].join(', ')}`);
});

Given(
  'a review configuration with the local stub as model provider {string} and a change whose file {string} holds the marker string {string}',
  async function (this: AcceptanceWorld, name: string, path: string, marker: string) {
    const provider = { ...(await localStubProvider(this)), name };
    const repo = baseCommitWith(this, configText({ formatVersion: 1, model: { provider } }));
    repo.write(path, `export const marker = '${marker}';\n`);
  },
);

Given(
  'the local stub answers the intent-extraction request with HTTP {int} and a body that repeats the request, {string} included',
  async function (this: AcceptanceWorld, status: number, marker: string) {
    (await localStub(this)).enqueueFor('intent-extraction', {
      status,
      body: { error: { message: `invalid request: ${marker}` } },
    });
  },
);

/** Every file under `dir` named `name`. */
function filesNamed(dir: string, name: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesNamed(path, name));
    else if (entry === name) out.push(path);
  }
  return out;
}

Then(
  'neither the notices, the CLI output nor the log of the review assistant contain {string}',
  function (this: AcceptanceWorld, marker: string) {
    const run = this.lastRun;
    assert.ok(run, 'the CLI did not run');
    assert.ok(!run.stdout.includes(marker), 'the CLI output contains the marker');
    assert.ok(!run.stderr.includes(marker), 'the CLI output contains the marker');
    for (const file of [
      'intake.json',
      'architecture-delta.json',
      'intent-map.json',
      'triage.json',
      'evidence.json',
    ] as const) {
      if (!this.headless?.has(file)) continue;
      const doc = this.headless.json<{ notices?: unknown }>(file);
      assert.ok(!JSON.stringify(doc.notices ?? []).includes(marker), `notices of ${file}`);
    }
    // The per-repository logs of the scenario's store (NFR-D-04).
    const home = this.cliEnv().LOCALAPPDATA!;
    const logs = filesNamed(home, 'log.jsonl');
    assert.ok(logs.length > 0, 'no log of the review assistant');
    for (const log of logs) assert.ok(!readFileSync(log, 'utf8').includes(marker), log);
  },
);

// C001-TS-845

Given(
  'a review configuration with the local stub, the model-excluded path pattern {string} and the provider timeout {int} s',
  async function (this: AcceptanceWorld, pattern: string, seconds: number) {
    const provider = await localStubProvider(this);
    baseCommitWith(
      this,
      configText({
        formatVersion: 1,
        model: { provider, excludedPaths: [pattern], timeoutSeconds: seconds },
      }),
    );
  },
);

Given(
  /^(\d+) hunks without a deterministic link signal lie under "([^"]+)", and the design-critique request for (\d+) components times out$/,
  async function (this: AcceptanceWorld, n: string, dir: string, components: string) {
    addFilesUnder(this, dir.replace(/\/$/, ''), Number(n));
    // One changed file in each of the components' folders.
    for (let i = 0; i < Number(components); i++) {
      this.repo!.write(`src/component-${i + 1}/index.ts`, `export const c${i + 1} = ${i + 1};\n`);
    }
    (await localStub(this)).enqueueFor('design-critique', { hang: true });
  },
);

Then(
  'the review reports the cause {string} with {int} items and the cause {string} with {int} items',
  function (this: AcceptanceWorld, first: string, n1: number, second: string, n2: number) {
    for (const [cause, n] of [
      [first, n1],
      [second, n2],
    ] as const) {
      const { code, words } = causeWords(cause);
      const message = noticeOf(this, code);
      assert.match(message, words);
      assert.match(message, new RegExp(`\\b${n} items\\b`), message);
    }
  },
);

// C001-TS-846

Given('a review configuration that names no model provider', function (this: AcceptanceWorld) {
  baseCommitWith(this, configText({ formatVersion: 1, clearing: { rules: { formatting: true } } }));
});

Then('the review reports no notice about an unused provider', function (this: AcceptanceWorld) {
  const unused = notices(this).filter((n) => /^ERR-MODEL-0(0\d|10)$/.test(n.code));
  assert.deepEqual(unused, []);
});
