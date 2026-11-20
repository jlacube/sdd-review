import { strict as assert } from 'node:assert';
import { utimesSync } from 'node:fs';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { HeadlessOutput } from '../../support/headless-output.js';

// C001-TC-101 to C001-TC-115 area: C001-TS-102, C001-TS-103 (C001-REQ-101), C001-TS-105
// (C001-REQ-102), C001-TS-133 and C001-TS-135 (C001-REQ-115). They run the CLI, which C001-T-010
// builds; until then they fail at the first step that runs it. The core module they exercise is
// `takeInChange` (src/core/intake/snapshot.ts), covered by test/unit/intake.

interface IntakeJson {
  snapshot: {
    snapshotId: string;
    baseCommit: { hash: string };
    changedFiles: Array<{ path: string; changeType: string; changedLines: number }>;
  };
}

const intake = (w: AcceptanceWorld) => {
  assert.equal(
    w.lastRun?.status,
    0,
    `the CLI exited with ${w.lastRun?.status}: ${w.lastRun?.stderr}`,
  );
  return w.headless!.json<IntakeJson>('intake.json');
};

const lines = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `export const ${tag}${i} = ${i};\n`).join('');

// ---- C001-TS-102 ---------------------------------------------------------------------------

Given(
  '{string} has an edit staged in the index that adds {int} lines',
  function (this: AcceptanceWorld, path: string, n: number) {
    this.repo!.write(path, `${this.repo!.read(path)}${lines(n, 'staged')}`).stage(path);
  },
);

Given(
  '{string} has an edit that is not staged and adds {int} lines',
  function (this: AcceptanceWorld, path: string, n: number) {
    this.repo!.write(path, `${this.repo!.read(path)}${lines(n, 'loose')}`);
  },
);

Then(
  'the change lists {string} with {int} changed lines and {string} with {int} changed lines',
  function (this: AcceptanceWorld, a: string, na: number, b: string, nb: number) {
    const files = intake(this).snapshot.changedFiles;
    assert.equal(files.find((f) => f.path === a)?.changedLines, na);
    assert.equal(files.find((f) => f.path === b)?.changedLines, nb);
  },
);

// ---- C001-TS-103 ---------------------------------------------------------------------------

Given(
  'the fixture repository {string} with the base commit labelled {word} and the ignore rule {string}',
  function (this: AcceptanceWorld, name: string, label: string, rule: string) {
    const repo = this.fixture(name);
    repo.label(label);
    repo.ignore(rule);
  },
);

Given(
  'the working tree holds the untracked files {string} and {string}',
  function (this: AcceptanceWorld, a: string, b: string) {
    this.repo!.write(a, 'generated\n').write(b, '- todo\n');
  },
);

Then('the change lists {string} as added', function (this: AcceptanceWorld, path: string) {
  const file = intake(this).snapshot.changedFiles.find((f) => f.path === path);
  assert.equal(file?.changeType, 'added', `${path} is not listed as added`);
});

Then('the change does not list {string}', function (this: AcceptanceWorld, path: string) {
  assert.equal(
    intake(this).snapshot.changedFiles.some((f) => f.path === path),
    false,
  );
});

// ---- C001-TS-105 ---------------------------------------------------------------------------

Given(
  'the fixture repository {string} where {string} branched off {string} at commit {word}',
  function (this: AcceptanceWorld, name: string, _branch: string, _main: string, label: string) {
    const repo = this.fixture(name);
    repo.label(label); // fx-branches branches "agent/cart" off "main" at M1
  },
);

Given(
  '{string} has {int} later commits M2 and M3 that change {string} only',
  function (this: AcceptanceWorld, _branch: string, _n: number, _path: string) {
    this.repo!.label('M2');
    this.repo!.label('M3');
  },
);

Given(
  '{string} has commits C1 to C3 that change {string}',
  function (this: AcceptanceWorld, _branch: string, _path: string) {
    for (const label of ['C1', 'C2', 'C3']) this.repo!.label(label);
  },
);

When(
  'the developer starts a review naming {string}',
  function (this: AcceptanceWorld, ref: string) {
    const out = this.tempDir();
    this.cli(['analyse', '--headless', '--out', out, '--base', ref]);
    this.headless = new HeadlessOutput(out);
  },
);

Then('the base commit of the snapshot is {word}', function (this: AcceptanceWorld, label: string) {
  assert.equal(intake(this).snapshot.baseCommit.hash, this.repo!.label(label).hash);
});

Then('the change lists {string}', function (this: AcceptanceWorld, path: string) {
  assert.ok(
    intake(this).snapshot.changedFiles.some((f) => f.path === path),
    `${path} not listed`,
  );
});

// ---- C001-TS-133 and C001-TS-135 -----------------------------------------------------------

const firstId = new WeakMap<AcceptanceWorld, string>();

Given(
  'the fixture repository {string} with base commit B0, HEAD at C2 and an uncommitted edit of {string}',
  function (this: AcceptanceWorld, name: string, path: string) {
    const repo = this.fixture(name);
    repo.label('B0');
    repo.commit('C1', {
      subject: 'C1: cart',
      files: { 'src/cart.ts': `${repo.read('src/cart.ts')}// c1\n` },
    });
    repo.commit('C2', {
      subject: 'C2: order',
      files: { 'src/order.ts': `${repo.read('src/order.ts')}// c2\n` },
    });
    repo.write(path, `${repo.read(path)}// uncommitted\n`);
  },
);

Given('a first intake naming B0 produced the snapshot ID S1', function (this: AcceptanceWorld) {
  const out = this.tempDir();
  this.cli(['analyse', '--headless', '--out', out, '--base', this.repo!.label('B0').hash]);
  this.headless = new HeadlessOutput(out);
  firstId.set(this, intake(this).snapshot.snapshotId);
});

When(
  'the developer starts a second review naming commit B0 without changing any file',
  function (this: AcceptanceWorld) {
    const out = this.tempDir();
    this.cli(['analyse', '--headless', '--out', out, '--base', this.repo!.label('B0').hash]);
    this.headless = new HeadlessOutput(out);
  },
);

Then('the snapshot ID of the second intake is S1', function (this: AcceptanceWorld) {
  assert.equal(intake(this).snapshot.snapshotId, firstId.get(this));
});

Given(
  'the modification time of {string} is set 1 hour later with its content unchanged',
  function (this: AcceptanceWorld, path: string) {
    const later = new Date(Date.now() + 3_600_000);
    utimesSync(this.repo!.path(path), later, later);
  },
);

Then('the snapshot ID of that intake is S1', function (this: AcceptanceWorld) {
  assert.equal(intake(this).snapshot.snapshotId, firstId.get(this));
});
