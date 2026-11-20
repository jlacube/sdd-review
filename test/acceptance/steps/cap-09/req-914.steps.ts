import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Given, Then, When } from '@cucumber/cucumber';
import { ERROR_CATALOGUE } from '../../../../src/core/errors/catalogue.js';
import type { AcceptanceWorld } from '../../support/world.js';
import { HeadlessOutput } from '../../support/headless-output.js';
import { editFixture } from '../../support/fixture-edit.js';

// C001-TC-914 area: C001-TS-929 (a completed command exits with 0), C001-TS-930 (a command that did
// not complete exits with a status listed for the failure) and C001-TS-931 (an interrupted command).

/** The error each situation of C001-TS-930 raises, by the catalogue (`50-interfaces/errors.md`). */
const expectedCode = new WeakMap<AcceptanceWorld, string>();

Given(
  'a git repository with a change and an empty output directory {string}',
  function (this: AcceptanceWorld, dir: string) {
    editFixture(this);
    this.headless = new HeadlessOutput(this.tempDir(`${dir.replace(/\W+/g, '-')}-`));
  },
);

When(
  'the developer runs the headless analysis into {string}',
  function (this: AcceptanceWorld, _directory: string) {
    this.cli(['analyse', '--headless', '--out', this.headless!.dir]);
  },
);

Then(
  '{string} holds every result file of C001-REQ-912',
  function (this: AcceptanceWorld, _directory: string) {
    assert.deepEqual(this.headless!.missing(), []);
  },
);

// C001-TS-930

let outside: string | undefined;

Given('a directory outside any git working tree', function (this: AcceptanceWorld) {
  outside = this.tempDir('sddplain-');
  expectedCode.set(this, 'ERR-INTAKE-001');
});

Given(
  'a repository whose output path {string} is an existing file',
  function (this: AcceptanceWorld, _path: string) {
    editFixture(this);
    const dir = this.tempDir('sddfile-');
    const file = join(dir, 'review');
    writeFileSync(file, 'an existing file');
    this.headless = new HeadlessOutput(file);
    expectedCode.set(this, 'ERR-CLI-002');
  },
);

Given('a review without an intent {string}', function (this: AcceptanceWorld, _id: string) {
  editFixture(this);
  const run = this.cli(['analyse', '--headless', '--out', this.tempDir('sddreview-')]);
  assert.equal(run.status, 0, run.stderr);
  expectedCode.set(this, 'ERR-ACT-004');
});

Given('a repository with a change', function (this: AcceptanceWorld) {
  editFixture(this);
  expectedCode.set(this, 'ERR-CLI-001');
});

When('the developer runs the review command', function (this: AcceptanceWorld) {
  this.cli(['review', '--no-browser'], outside);
});

When(
  'the developer runs the sign command for {string}',
  function (this: AcceptanceWorld, intent: string) {
    this.cli(['sign', intent]);
  },
);

When(
  'the developer runs an unknown command {string}',
  function (this: AcceptanceWorld, command: string) {
    this.cli([command]);
  },
);

/** Every exit code of the table of C001-IF-001 that stands for a failure. */
const FAILURE_EXIT_CODES = new Set(
  ERROR_CATALOGUE.flatMap((e) => (e.kind === 'error' && e.exitCode ? [e.exitCode] : [])),
);

Then('the CLI exits with a non-zero status', function (this: AcceptanceWorld) {
  assert.ok(this.lastRun, 'the CLI was not run');
  assert.ok(this.lastRun.status !== null && this.lastRun.status !== 0, `${this.lastRun.status}`);
});

Then(
  /^that status is listed for this failure in the error catalogue of `50-interfaces\/`$/,
  function (this: AcceptanceWorld) {
    const code = expectedCode.get(this);
    assert.ok(code, 'the scenario names no failure');
    const entry = ERROR_CATALOGUE.find((e) => e.code === code);
    assert.ok(entry, `${code} is not in the catalogue`);
    const printed = this.lastRun!.stderr.split('\n').some((line) => line.startsWith(`${code}: `));
    assert.ok(printed, `standard error does not report ${code}: ${this.lastRun!.stderr}`);
    assert.equal(this.lastRun!.status, entry.exitCode);
  },
);

// C001-TS-931

Given('a git repository with a change of 9,000 changed lines', function (this: AcceptanceWorld) {
  const repo = this.fixture('fx-intake');
  mkdirSync(repo.path('src'), { recursive: true });
  const lines = Array.from({ length: 9000 }, (_, i) => `export const value${i} = ${i};`);
  repo.write('src/bulk.ts', `${lines.join('\n')}\n`);
  this.headless = new HeadlessOutput(this.tempDir('sddint-'));
});

When(
  'the developer interrupts the headless analysis with Ctrl+C before it ends',
  async function (this: AcceptanceWorld) {
    await this.cliInterrupted(['analyse', '--headless', '--out', this.headless!.dir]);
  },
);

Then(
  /^the CLI exits with a non-zero status listed in the error catalogue of `50-interfaces\/`$/,
  function (this: AcceptanceWorld) {
    const run = this.lastRun;
    assert.ok(run, 'the CLI was not run');
    assert.ok(
      run.status !== null && FAILURE_EXIT_CODES.has(run.status),
      `exit status ${run.status} (signal ${run.signal}) is not a failure status of the catalogue: ${run.stderr}`,
    );
    assert.deepEqual(
      this.headless!.missing().length,
      6,
      'an interrupted run leaves no result file',
    );
  },
);
