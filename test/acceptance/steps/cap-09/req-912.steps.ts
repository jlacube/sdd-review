import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { HeadlessOutput } from '../../support/headless-output.js';
import { editFixture } from '../../support/fixture-edit.js';
import { FILE_DEFINITIONS, schemaValidator } from '../../../support/schemas.js';

// C001-TC-912 area: C001-TS-926 (a headless run writes every result file) and C001-TS-927 (two
// runs on one snapshot give the same results). The step texts of C001-REQ-914 (req-914.steps.ts)
// share the output directory kept in `this.headless`.

Given(
  'a git repository with a change and an empty directory {string}',
  function (this: AcceptanceWorld, dir: string) {
    editFixture(this);
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

Then(
  /^each file validates against its format in `50-interfaces\/`$/,
  function (this: AcceptanceWorld) {
    const validator = schemaValidator();
    for (const [file, definition] of Object.entries(FILE_DEFINITIONS)) {
      const document: unknown = JSON.parse(readFileSync(join(this.headless!.dir, file), 'utf8'));
      assert.deepEqual(validator.document(definition, document), [], `${file} is not valid`);
    }
    const lines = this.headless!.record();
    assert.ok(lines.length >= 1, 'the review record holds no header line');
    for (const line of lines) assert.deepEqual(validator.recordLine(line), [], 'record line');
  },
);

Then(
  'no process of the review assistant listened on a socket during the run',
  function (this: AcceptanceWorld) {
    assert.ok(this.lastRun, 'the CLI was not run');
    assert.deepEqual(this.listenCalls(), []);
  },
);

Then('the CLI exits with status {int}', function (this: AcceptanceWorld, status: number) {
  assert.equal(this.lastRun?.status, status, `${this.lastRun?.stderr}`);
});

// C001-TS-927

const tworuns = new WeakMap<AcceptanceWorld, { a: HeadlessOutput; b: HeadlessOutput }>();

Given(
  'a git repository with a change, no model provider configured, and two empty directories {string} and {string}',
  function (this: AcceptanceWorld, a: string, b: string) {
    editFixture(this);
    const dir = (name: string) => new HeadlessOutput(this.tempDir(`${name.replace(/\W+/g, '-')}-`));
    tworuns.set(this, { a: dir(a), b: dir(b) });
  },
);

When(
  'the developer runs the headless analysis into {string} and then into {string} without changing the repository',
  function (this: AcceptanceWorld, _a: string, _b: string) {
    const runs = tworuns.get(this)!;
    for (const out of [runs.a, runs.b]) {
      const run = this.cli(['analyse', '--headless', '--out', out.dir]);
      assert.equal(run.status, 0, run.stderr);
    }
  },
);

/** The document without the members that differ between two runs: times and run identifiers. */
function withoutVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutVolatile);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['createdAt', 'at', 'runId', 'startedAt', 'finishedAt'].includes(key))
        .map(([key, member]) => [key, withoutVolatile(member)]),
    );
  }
  return value;
}

Then(
  'the architecture delta, intent map and triage files of {string} and {string} are equal, timestamps and run identifiers excluded',
  function (this: AcceptanceWorld, _a: string, _b: string) {
    const runs = tworuns.get(this)!;
    for (const file of ['architecture-delta.json', 'intent-map.json', 'triage.json'] as const) {
      assert.deepEqual(
        withoutVolatile(runs.b.json(file)),
        withoutVolatile(runs.a.json(file)),
        file,
      );
    }
  },
);
