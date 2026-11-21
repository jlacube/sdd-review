import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import { count, writeSizeChange } from '../../../fixtures/repos/fx-size.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-121: C001-TS-147, C001-TS-148 (C001-REQ-121) on `fx-size`. The review is started by
// "the developer starts a review naming commit {word}" (req-101.steps.ts).

Given(
  /^the fixture repository "(fx-size)" with a change of ([\d,]+) changed lines over ([\d,]+) changed files$/,
  function (this: AcceptanceWorld, name: string, lines: string, files: string) {
    writeSizeChange(this.fixture(name), { lines: count(lines), files: count(files) });
  },
);

interface SizeSummary {
  snapshot: { changedLines: number; changedFiles: unknown[]; sizeWarning: boolean };
  intakeSummary: {
    changedLines: number;
    changedFiles: number;
    sizeWarning: { code: string; message: string } | null;
  };
}

function intakeOf(world: AcceptanceWorld): SizeSummary {
  const run = world.lastRun;
  assert.equal(run?.status, 0, `the CLI exited with ${run?.status}: ${run?.stderr}`);
  return world.headless!.json<SizeSummary>('intake.json');
}

Then(
  /^the intake summary shows a size warning stating ([\d,]+) changed lines, ([\d,]+) changed files and the supported size of 10,000 changed lines and 300 changed files$/,
  function (this: AcceptanceWorld, lines: string, files: string) {
    const intake = intakeOf(this);
    assert.equal(intake.intakeSummary.changedLines, count(lines));
    assert.equal(intake.intakeSummary.changedFiles, count(files));
    assert.equal(intake.snapshot.sizeWarning, true);
    const message = `This change has ${lines} changed lines in ${files} files; the supported size is 10,000 changed lines and 300 files. Results and response times may fall outside the stated limits.`;
    assert.deepEqual(intake.intakeSummary.sizeWarning, { code: 'ERR-INTAKE-006', message });
    // The intake summary the CLI prints (C001-IF-001 Output) carries the same warning.
    assert.ok(
      this.lastRun!.stdout.includes(`ERR-INTAKE-006: ${message}`),
      `the printed summary has no size warning: ${this.lastRun!.stdout}`,
    );
  },
);

Then('the intake summary shows no size warning', function (this: AcceptanceWorld) {
  const intake = intakeOf(this);
  assert.equal(intake.snapshot.sizeWarning, false);
  assert.equal(intake.intakeSummary.sizeWarning, null);
  assert.ok(!this.lastRun!.stdout.includes('ERR-INTAKE-006'), this.lastRun!.stdout);
});

// The architecture delta view is built by C001-T-043; until then these steps are pending, so the
// scenarios are not counted as passed. The warning it will show is the session's `sizeWarning`
// (C001-IF-002 SessionInfo), filled from the intake summary.
Then('the architecture delta view shows the same size warning', function () {
  return 'pending';
});

Then('the architecture delta view shows no size warning', function () {
  return 'pending';
});
