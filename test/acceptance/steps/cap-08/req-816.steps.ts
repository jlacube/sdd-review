import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { ScriptedAnswer } from '../../support/stub-llm/stub-llm.js';
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

// C001-TC-816 (C001-T-089): C001-TS-841 to C001-TS-843, C001-TS-852 and C001-TS-853, a failed
// provider request yields model-free items and none of its output (C001-REQ-816, C001-IF-010 §7).
// The review is started by "the analysis of the snapshot completes" (req-801.steps.ts), which runs
// the CLI without blocking this process so that the stubs can answer. The requests themselves are
// made by the model tasks (C001-T-090); the gateway's failure fallback is C001-T-089.
//
// Every scripted answer holds STUB_TEXT, so that "no extracted intent holds text from the stub's
// answer" can be checked in the intent map.

export const STUB_TEXT = 'STUB-ANSWER-7f3a';

const INTENT_TITLES = [
  `Add retry ${STUB_TEXT}`,
  `Log failures ${STUB_TEXT}`,
  `Cap backoff ${STUB_TEXT}`,
];

/** An intent-extraction output of the stub (C001-IF-011 `IntentExtraction`). */
function stubIntents(world: AcceptanceWorld, titles = INTENT_TITLES) {
  const hash = world.repo!.label('B0').hash;
  return {
    task: 'intent-extraction',
    intents: titles.map((title) => ({ title, sources: [{ kind: 'commit', reference: hash }] })),
  };
}

/** Whether the scenario stopped the local stub (so it can record no request). */
const stopped = new WeakSet<AcceptanceWorld>();

export async function stopLocalStub(world: AcceptanceWorld): Promise<void> {
  await (await localStub(world)).stop();
  stopped.add(world);
}

Given(
  'a review configuration with the local stub as model provider and the provider timeout {int} s',
  async function (this: AcceptanceWorld, seconds: number) {
    const provider = await localStubProvider(this);
    baseCommitWith(
      this,
      configText({ formatVersion: 1, model: { provider, timeoutSeconds: seconds } }),
    );
  },
);

Given(
  'a review configuration with the local stub as model provider',
  async function (this: AcceptanceWorld) {
    const provider = await localStubProvider(this);
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider } }));
  },
);

/** A chat-completions answer body cut off after the first two intents of its content. */
function cutOffAnswer(world: AcceptanceWorld): string {
  const content = JSON.stringify(stubIntents(world));
  const full = JSON.stringify({
    model: STUB_MODEL,
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }],
  });
  const third = full.indexOf(JSON.stringify(INTENT_TITLES[2]).slice(1, -1));
  return full.slice(0, third);
}

Given(
  /^the local stub (.+) on the intent-extraction request$/,
  async function (this: AcceptanceWorld, failure: string) {
    const stub = await localStub(this);
    const status = /^answers HTTP (\d{3})$/.exec(failure);
    let answer: ScriptedAnswer | null;
    if (status) {
      answer = { status: Number(status[1]), body: { error: { message: STUB_TEXT } } };
    } else {
      switch (failure) {
        case 'is not running, so the connection is refused':
          await stopLocalStub(this);
          answer = null;
          break;
        case 'answers after 5 s':
          answer = { output: stubIntents(this), delayMs: 5000 };
          break;
        case 'answers with a body that is not valid JSON':
          answer = { body: `{"choices": [ ${STUB_TEXT}` };
          break;
        case 'answers with valid JSON that lacks the fields of the response format':
          answer = { output: { note: STUB_TEXT } };
          break;
        case 'answers with a response cut off after its first two intents':
          answer = { body: cutOffAnswer(this) };
          break;
        case 'closes the connection after the request, before a status line':
          answer = { destroy: true };
          break;
        default:
          throw new Error(`unknown answer in the scenario: ${failure}`);
      }
    }
    if (answer) stub.enqueueFor('intent-extraction', answer);
  },
);

Given(
  'the local stub answers the intent-extraction request after {int} s in the response format of its provider API',
  async function (this: AcceptanceWorld, seconds: number) {
    (await localStub(this)).enqueueFor('intent-extraction', {
      output: stubIntents(this),
      delayMs: seconds * 1000,
    });
  },
);

Given(
  'the local stub answers the intent-extraction request and refuses the connection of the design-critique request',
  async function (this: AcceptanceWorld) {
    const stub = await localStub(this);
    stub.enqueueFor('intent-extraction', { output: stubIntents(this) });
    stub.enqueueFor('design-critique', { destroy: true });
  },
);

interface IntentJson {
  kind: string;
  title: string;
  labels?: { modelOutput?: { provider: string; model: string; confidence: string } };
}

interface Documented {
  intents?: IntentJson[];
  labels?: { reduced?: string[] };
}

function intentMap(world: AcceptanceWorld): Documented {
  assert.ok(world.headless?.has('intent-map.json'), 'the headless output holds no intent-map.json');
  return world.headless.json<Documented>('intent-map.json');
}

/** Not vacuous: unless the stub was stopped, the intent-extraction request must have been made. */
async function assertAsked(world: AcceptanceWorld, task: string): Promise<void> {
  if (stopped.has(world)) return;
  const asked = (await localStub(world)).requestsFor(task);
  assert.ok(asked.length > 0, `the local stub received no ${task} request`);
}

Then(
  'the extracted intents are produced in model-free mode and labelled reduced naming {string}',
  async function (this: AcceptanceWorld, feature: string) {
    await assertAsked(this, 'intent-extraction');
    const map = intentMap(this);
    assert.ok(
      map.labels?.reduced?.includes(feature),
      `not labelled reduced: ${JSON.stringify(map.labels)}`,
    );
    const model = (map.intents ?? []).filter(
      (i) => i.kind === 'extracted-model' || i.labels?.modelOutput,
    );
    assert.deepEqual(model, [], 'model-extracted intents in a model-free intent map');
  },
);

Then("no extracted intent holds text from the stub's answer", function (this: AcceptanceWorld) {
  assert.ok(!JSON.stringify(intentMap(this).intents ?? []).includes(STUB_TEXT));
});

Then(
  /^the local stub has recorded exactly (\d+) intent-extraction requests?$/,
  async function (this: AcceptanceWorld, n: string) {
    assert.equal((await localStub(this)).requestsFor('intent-extraction').length, Number(n));
  },
);

Then(
  "the extracted intents are the stub's intents, marked as model output",
  async function (this: AcceptanceWorld) {
    await assertAsked(this, 'intent-extraction');
    const model = (intentMap(this).intents ?? []).filter((i) => i.kind === 'extracted-model');
    assert.deepEqual(
      model.map((i) => i.title).sort(),
      [...INTENT_TITLES].sort(),
      'the extracted intents are not the stub intents',
    );
    for (const intent of model) {
      assert.equal(intent.labels?.modelOutput?.model, STUB_MODEL);
      assert.equal(intent.labels?.modelOutput?.confidence, 'low');
    }
  },
);

Then(
  'the design-quality findings are produced in model-free mode',
  async function (this: AcceptanceWorld) {
    await assertAsked(this, 'design-critique');
    assert.ok(this.headless?.has('architecture-delta.json'), 'no architecture-delta.json');
    const delta = this.headless.json<{
      designFindings?: Array<{ labels?: { modelOutput?: unknown } }>;
      labels?: { reduced?: string[] };
    }>('architecture-delta.json');
    assert.ok(delta.labels?.reduced?.includes('design critique'), JSON.stringify(delta.labels));
    assert.ok(!(delta.designFindings ?? []).some((f) => f.labels?.modelOutput));
  },
);

// C001-TS-853

Given(
  'a review configuration that names the cloud stub with the provider API {string}, the cloud opt-in setting and the key environment variable {string}',
  async function (this: AcceptanceWorld, apiName: string, keyEnv: string) {
    assert.equal(apiName, 'Anthropic Messages API');
    const stub = await cloudStub(this);
    const provider = {
      // A name no credential store holds an entry for (the default entry's account, §7).
      name: `cloud-stub-no-key-${process.pid}`,
      api: 'anthropic-messages',
      endpoint: `https://${CLOUD_HOST}:${stub.port}`,
      model: STUB_MODEL,
      keyEnv,
    };
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider, cloudOptIn: true } }));
  },
);

Given(
  /^"([A-Z][A-Z0-9_]*)" is not set and the credential store holds no entry for that provider$/,
  function (this: AcceptanceWorld, name: string) {
    setScenarioEnv(this, name, undefined);
  },
);
