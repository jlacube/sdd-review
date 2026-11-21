import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { Given, setDefaultTimeout, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import {
  addFiles,
  appendReviewWork,
  historyOf,
  intakeNamingB0,
  lastIntake,
  listedReviews,
  recordFileOf,
  snapshotNamed,
} from '../../support/review-history.js';

// C001-TC-118: C001-TS-141 (C001-REQ-118, earlier snapshots and their records are kept). The
// intake under test is the shared step "the developer starts a review naming commit B0"
// (req-101.steps.ts); the reviews are listed by the `reviews` command (C001-IF-001).

// Each step runs the built CLI once or twice: more than Cucumber's 5 seconds on a slow runner.
setDefaultTimeout(60_000);

Given(
  'a review of snapshot S1 of {string} whose review record holds {int} verdicts and {int} read marks',
  async function (this: AcceptanceWorld, name: string, verdicts: number, readMarks: number) {
    this.fixture(name);
    addFiles(this, 2, 'earlier');
    const intake = intakeNamingB0(this);
    const s1 = intake.snapshot.snapshotId;
    historyOf(this).names.set('S1', s1);
    await appendReviewWork(
      this,
      s1,
      intake.hunks.map((h) => h.hunkId),
      { verdicts, readMarks },
    );
    historyOf(this).recordBefore = readFileSync(recordFileOf(this, s1));
  },
);

Given(
  'after that review {string} is edited in the working tree',
  function (this: AcceptanceWorld, path: string) {
    this.repo!.write(path, `${this.repo!.read(path)}// edited after the review of S1\n`);
  },
);

Then(
  'intake creates a snapshot S2 whose snapshot ID differs from S1',
  function (this: AcceptanceWorld) {
    const s2 = lastIntake(this).snapshot.snapshotId;
    assert.notEqual(s2, snapshotNamed(this, 'S1'));
    historyOf(this).names.set('S2', s2);
  },
);

Then('the repository lists the reviews of S1 and S2', function (this: AcceptanceWorld) {
  const listed = listedReviews(this);
  const expected = [snapshotNamed(this, 'S1'), snapshotNamed(this, 'S2')];
  assert.deepEqual(listed.map((r) => r.snapshotId).sort(), [...expected].sort());
  for (const review of listed) {
    assert.ok(existsSync(review.recordFile), `no record file at ${review.recordFile}`);
  }
  // The text listing names each review with the path of its record file (C001-IF-001 `reviews`).
  const text = this.cli(['reviews']);
  assert.equal(text.status, 0, text.stderr);
  for (const review of listed) {
    assert.ok(text.stdout.includes(review.snapshotId), `text listing lacks ${review.snapshotId}`);
    assert.ok(text.stdout.includes(review.recordFile), `text listing lacks ${review.recordFile}`);
  }
});

Then(
  'the review record of S1 is byte-identical to its content before the intake, with {int} verdicts and {int} read marks',
  function (this: AcceptanceWorld, verdicts: number, readMarks: number) {
    const before = historyOf(this).recordBefore;
    assert.ok(before, 'the record of S1 was not saved before the intake');
    const now = readFileSync(recordFileOf(this, snapshotNamed(this, 'S1')));
    assert.ok(now.equals(before), 'the review record of S1 changed');
    const kinds = now
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { kind: string }).kind);
    assert.equal(kinds.filter((k) => k === 'verdict').length, verdicts);
    assert.equal(kinds.filter((k) => k === 'read-mark').length, readMarks);
  },
);
