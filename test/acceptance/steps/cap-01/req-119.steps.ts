import { strict as assert } from 'node:assert';
import { Given, setDefaultTimeout, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import {
  addFiles,
  historyOf,
  intakeNamingB0,
  intentIdOf,
  lastIntake,
  listedReviews,
  recordIntentMap,
  revisionOf,
  snapshotNamed,
} from '../../support/review-history.js';

// C001-TC-119: C001-TS-142 and C001-TS-143 (C001-REQ-119, the review of an existing snapshot is
// reopened with its recorded results, not recomputed). The results are read back from the headless
// output of the reopening intake, which exports the snapshot's current revision.
//
// Not bound here: the `stub-llm` steps of C001-TS-142 (the provider configuration, the scripted
// answer for H7 and the count of requests received). The provider configuration and the stub
// wiring come with the model gateway (C001-T-085, C001-T-087) and the configuration loader
// (C001-T-035).

setDefaultTimeout(60_000);

interface IntentMapJson {
  snapshotId: string;
  intents: Array<{ intentId: string; title: string }>;
  links: Array<{ hunkId: string; target: string; signal: string }>;
  orphanHunkIds: string[];
}

const intentMapOf = (world: AcceptanceWorld) => {
  lastIntake(world); // the run succeeded
  return world.headless!.json<IntentMapJson>('intent-map.json');
};

// ---- C001-TS-143 ---------------------------------------------------------------------------

Given(
  'a review of snapshot S1 of {string} in model-free mode with {int} intents and {int} orphan hunks',
  async function (this: AcceptanceWorld, name: string, intents: number, orphans: number) {
    this.fixture(name);
    addFiles(this, intents + orphans, 'part');
    const intake = intakeNamingB0(this);
    const hunkIds = intake.hunks.map((h) => h.hunkId);
    assert.equal(hunkIds.length, intents + orphans, 'one hunk per added file');
    const s1 = intake.snapshot.snapshotId;
    historyOf(this).names.set('S1', s1);
    historyOf(this).revisionBefore = await recordIntentMap(
      this,
      s1,
      hunkIds,
      Array.from({ length: intents }, (_, i) => ({
        title: `Intent ${i + 1}`,
        hunkIds: [hunkIds[i] as string],
      })),
    );
  },
);

When(
  'the developer starts a review naming commit B0 for the third time with the working tree unchanged',
  function (this: AcceptanceWorld) {
    const history = historyOf(this);
    assert.ok(history.intakes < 3, `${history.intakes} intakes ran already`);
    while (history.intakes < 3) intakeNamingB0(this);
  },
);

// ---- C001-TS-142 ---------------------------------------------------------------------------

Given(
  'a review of snapshot S1 whose recorded intent map links hunk H7 to the intent {string} through a model judgement',
  async function (this: AcceptanceWorld, title: string) {
    if (!this.repo) this.fixture('fx-intake');
    addFiles(this, 8, 'tax');
    const intake = intakeNamingB0(this);
    const hunkIds = intake.hunks.map((h) => h.hunkId);
    const h7 = hunkIds[6];
    assert.ok(h7, 'the change has fewer than 7 hunks');
    const s1 = intake.snapshot.snapshotId;
    historyOf(this).names.set('S1', s1);
    historyOf(this).names.set('H7', h7);
    historyOf(this).revisionBefore = await recordIntentMap(this, s1, hunkIds, [
      { title, hunkIds: [h7], signal: 'model-judgement' },
    ]);
  },
);

When(
  'the developer starts a review naming commit B0 with the working tree unchanged',
  function (this: AcceptanceWorld) {
    intakeNamingB0(this);
  },
);

Then('H7 is linked to the intent {string}', function (this: AcceptanceWorld, title: string) {
  const map = intentMapOf(this);
  const h7 = snapshotNamed(this, 'H7');
  const link = map.links.find((l) => l.hunkId === h7);
  assert.ok(link, 'H7 has no link');
  assert.equal(link.target, intentIdOf(title));
  assert.equal(link.signal, 'model-judgement');
  assert.equal(map.intents.find((i) => i.intentId === link.target)?.title, title);
});

// ---- shared by C001-TS-142 and C001-TS-143 ---------------------------------------------------

Then('the review of S1 is reopened', async function (this: AcceptanceWorld) {
  const s1 = snapshotNamed(this, 'S1');
  assert.equal(lastIntake(this).snapshot.snapshotId, s1, 'the intake made another snapshot');
  // Reopened, not recomputed: the intake added no revision to S1's analysis results.
  assert.equal(await revisionOf(this, s1), historyOf(this).revisionBefore);
  assert.equal(intentMapOf(this).snapshotId, s1);
});

Then('the repository lists {int} review(s)', function (this: AcceptanceWorld, n: number) {
  assert.equal(listedReviews(this).length, n);
});

Then(
  'the intent map of S1 holds {int} intents and {int} orphan hunks',
  function (this: AcceptanceWorld, intents: number, orphans: number) {
    const map = intentMapOf(this);
    assert.equal(map.snapshotId, snapshotNamed(this, 'S1'));
    assert.equal(map.intents.length, intents);
    assert.equal(map.orphanHunkIds.length, orphans);
  },
);
