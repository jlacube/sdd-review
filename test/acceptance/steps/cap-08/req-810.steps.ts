import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { Given, Then, When } from '@cucumber/cucumber';
import { openCore } from '../../../../src/core/api/open.js';
import type { ModelHunk, TaskResult } from '../../../../src/core/model/gateway.js';
import type { ModelTask } from '../../../../src/core/model/labels.js';
import type { Hunk, IntakeDocument } from '../../../../src/generated/analysis-results.js';
import { intentIdOf } from '../../support/fake-review.js';
import { HeadlessOutput } from '../../support/headless-output.js';
import type { AcceptanceWorld } from '../../support/world.js';
import { baseCommitWith, configText, localStub, localStubProvider } from './req-801.steps.js';

// C001-TC-810 and C001-TC-811 (C001-T-089): C001-TS-828, C001-TS-830 and C001-TS-831, every item a
// model produced is marked as model output with the provider and the model, and has the confidence
// level low (C001-REQ-810, C001-REQ-811, C001-IF-010 §1). The item is asked of the gateway of the
// snapshot as the model tasks of C001-T-090 ask it (C001-IF-010 §2), as in C001-TS-836; the stub's
// answer is the item. C001-TS-829 (deterministic items carry no mark) needs the deterministic
// account of C001-T-046 and the model tasks of C001-T-090.

/** Thirty lines, so that the change holds hunk "src/retry.ts" lines 1-30. */
const RETRY = `${Array.from({ length: 30 }, (_, i) => `export const retry${i + 1} = ${i + 1};`).join('\n')}\n`;

interface Asked {
  readonly task: ModelTask;
  readonly result: TaskResult<ModelTask>;
}

const asked = new WeakMap<AcceptanceWorld, Asked>();

Given(
  'the local stub configured as provider {string} with the model {string}',
  async function (this: AcceptanceWorld, name: string, model: string) {
    const provider = { ...(await localStubProvider(this)), name, model };
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider } }));
  },
);

function hunkText(hunk: Hunk): string {
  return hunk.lines.map((l) => `${l.kind === 'added' ? '+' : '-'}${l.text}`).join('\n');
}

/** Starts the review in this process and returns the snapshot and its hunk of `path`. */
async function reviewWithHunk(world: AcceptanceWorld, path: string) {
  world.repo!.write(path, RETRY);
  const opened = await openCore(world.repo!.dir, { env: world.cliEnv() });
  const started = await opened.core.api.startReview({});
  const out = join(world.tempDir('sddout-'), 'results');
  await opened.core.api.exportResults(started.snapshotId, out);
  const intake = new HeadlessOutput(out).json<IntakeDocument>('intake.json');
  const hunk = intake.hunks.find((h) => h.path === path);
  assert.ok(hunk, `the change has no hunk in ${path}`);
  const modelHunk: ModelHunk = {
    hunkId: hunk.hunkId,
    path: hunk.path,
    firstLine: hunk.newStart,
    text: hunkText(hunk),
  };
  return { opened, snapshotId: started.snapshotId, hunk: modelHunk };
}

When(
  /^the local stub returns (?:an extracted intent(?: "([^"]+)")?|a link of hunk "([^"]+)" lines \d+-\d+ to "([^"]+)"(?: with the text "([^"]+)")?|the walkthrough account of "([^"]+)"|a design critique finding on component "([^"]+)")$/,
  async function (
    this: AcceptanceWorld,
    intentTitle: string | null,
    linkPath: string | null,
    linkTarget: string | null,
    linkText: string | null,
    accountOf: string | null,
    component: string | null,
  ) {
    const stub = await localStub(this);
    const { opened, snapshotId, hunk } = await reviewWithHunk(this, linkPath ?? 'src/retry.ts');
    try {
      const gateway = opened.core.gateway(snapshotId);
      let task: ModelTask;
      let result: TaskResult<ModelTask>;
      if (linkTarget != null) {
        task = 'hunk-linking';
        const intentId = intentIdOf(linkTarget);
        stub.enqueue({
          output: {
            task,
            links: [{ hunkId: hunk.hunkId, intentId, reason: linkText ?? 'Adds the retry.' }],
          },
        });
        result = await gateway.runTask(task, {
          intents: [{ intentId, title: linkTarget, sourceText: linkTarget }],
          hunks: [hunk],
        });
      } else if (accountOf != null) {
        task = 'walkthrough-account';
        const intentId = intentIdOf(accountOf);
        stub.enqueue({ output: { task, intentId, account: 'Retries the request.' } });
        result = await gateway.runTask(task, {
          intent: { intentId, title: accountOf, sourceText: accountOf },
          hunks: [hunk],
        });
      } else if (component != null) {
        task = 'design-critique';
        stub.enqueue({
          output: {
            task,
            findings: [
              {
                hunkIds: [hunk.hunkId],
                componentId: component,
                title: 'Retry policy in the client',
                explanation: 'The retry policy belongs to the transport.',
              },
            ],
          },
        });
        result = await gateway.runTask(task, {
          components: [{ componentName: component, hunks: [hunk] }],
        });
      } else {
        task = 'intent-extraction';
        const hash = this.repo!.label('B0').hash;
        stub.enqueue({
          output: {
            task,
            intents: [
              {
                title: intentTitle ?? 'Add retry to the HTTP client',
                sources: [{ kind: 'commit', reference: hash }],
              },
            ],
          },
        });
        result = await gateway.runTask(task, {
          commits: [{ hash, subject: 'B0', message: 'B0\n' }],
          namedFiles: [],
        });
      }
      asked.set(this, { task, result });
    } finally {
      await opened.close();
    }
  },
);

/** The one item the stub returned, as the gateway accepted and marked it. */
function theItem(world: AcceptanceWorld) {
  const a = asked.get(world);
  assert.ok(a, 'the local stub was not asked for an item');
  assert.equal(a.result.status, 'accepted', JSON.stringify(a.result));
  if (a.result.status !== 'accepted') throw new Error('unreachable');
  assert.equal(a.result.marked.length, 1, 'expected the one item of the answer');
  return a.result.marked[0]!;
}

Then(
  'that item is marked as model output with the provider {string} and the model {string}',
  function (this: AcceptanceWorld, provider: string, model: string) {
    const item = theItem(this);
    assert.deepEqual(item.labels.modelOutput, { provider, model, confidence: 'low' });
  },
);

Then(/^(?:that item|the link) has the confidence level low$/, function (this: AcceptanceWorld) {
  const item = theItem(this);
  assert.equal(item.confidence, 'low');
  assert.equal(item.labels.modelOutput.confidence, 'low');
});
