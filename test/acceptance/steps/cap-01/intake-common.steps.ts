import { Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import type { AcceptanceWorld } from '../../support/world.js';
import { HeadlessOutput } from '../../support/headless-output.js';

// Steps that several CAP-01 scenarios share. A later task that needs one of these steps uses it;
// it never defines the same text again (Cucumber reports the duplicate as ambiguous).

When('the developer starts a review without naming a commit', function (this: AcceptanceWorld) {
  const out = this.tempDir();
  this.cli(['analyse', '--headless', '--out', out]);
  this.headless = new HeadlessOutput(out);
});

Then(
  'intake stops with the error {word} and exit code {int}',
  function (this: AcceptanceWorld, code: string, exit: number) {
    const run = this.lastRun;
    assert.ok(run, 'the CLI was not run');
    assert.equal(run.status, exit, `exit code: ${run.stderr}${run.stdout}`);
    assert.ok(`${run.stderr}${run.stdout}`.includes(code), `output does not name ${code}`);
  },
);

Then('no snapshot is created', function (this: AcceptanceWorld) {
  // Until the review store exists (C001-T-007), the snapshot of a run is the intake file of its
  // headless output directory.
  assert.ok(this.headless, 'the CLI was not run with an output directory');
  assert.equal(this.headless.has('intake.json'), false);
});
