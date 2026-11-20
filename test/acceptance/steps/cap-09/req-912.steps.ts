import { strict as assert } from 'node:assert';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { HeadlessOutput } from '../../support/headless-output.js';

// C001-TC-912 area: C001-TS-926 (a headless run writes every result file); fails until C001-T-010.

Given(
  'a git repository with a change and an empty directory {string}',
  function (this: AcceptanceWorld, dir: string) {
    const repo = this.fixture('fx-intake');
    repo.write('src/cart.ts', `${repo.read('src/cart.ts')}// edited\n`);
    this.headless = new HeadlessOutput(this.tempDir(`${dir.replace(/\W+/g, '-')}-`));
  },
);

When(
  'the developer runs the analysis command of the CLI in headless mode with the output directory {string}',
  function (this: AcceptanceWorld, _directory: string) {
    this.cli(['analyse', '--headless', '--out', this.headless!.dir]);
  },
);

Then(
  '{string} holds the architecture delta, the intent map, the triage, the evidence and the review record of the snapshot',
  function (this: AcceptanceWorld, _directory: string) {
    assert.deepEqual(this.headless!.missing(), []);
  },
);

Then('the CLI exits with status {int}', function (this: AcceptanceWorld, status: number) {
  assert.equal(this.lastRun?.status, status);
});
