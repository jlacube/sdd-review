import { strict as assert } from 'node:assert';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { HeadlessOutput } from '../../support/headless-output.js';

// C001-TC-101: C001-TS-101 (first scenario of the harness; fails until C001-T-008 exists).

interface ChangedFile {
  path: string;
  oldPath?: string | null;
  changeType: string;
}

Given(
  'the fixture repository {string} with the base commit labelled {word}',
  function (this: AcceptanceWorld, name: string, label: string) {
    const repo = this.fixture(name);
    repo.label(label); // fails when the fixture records no such label
  },
);

Given(
  'since B0 the working tree modifies {string}, deletes {string} and renames {string} to {string}',
  function (this: AcceptanceWorld, modify: string, del: string, from: string, to: string) {
    const repo = this.repo!;
    repo.write(modify, `${repo.read(modify)}// edited\n`);
    repo.remove(del);
    repo.moveInWorkingTree(from, to);
  },
);

Given(
  'the working tree holds the untracked file {string}, which no ignore rule excludes',
  function (this: AcceptanceWorld, path: string) {
    this.repo!.write(path, 'export const promo = true;\n');
  },
);

When(
  'the developer starts a review naming commit {word}',
  function (this: AcceptanceWorld, label: string) {
    const out = this.tempDir();
    this.cli(['analyse', '--headless', '--out', out, '--base', this.repo!.label(label).hash]);
    this.headless = new HeadlessOutput(out);
  },
);

Then('the change lists exactly {int} changed files', function (this: AcceptanceWorld, n: number) {
  assert.equal(this.lastRun?.status, 0, `the CLI exited with ${this.lastRun?.status}`);
  const files = this.headless!.json<{ snapshot: { changedFiles: ChangedFile[] } }>('intake.json')
    .snapshot.changedFiles;
  assert.equal(files.length, n);
});

Then(
  '{string} is listed as modified, {string} as deleted, {string} to {string} as renamed and {string} as added',
  function (
    this: AcceptanceWorld,
    modified: string,
    deleted: string,
    from: string,
    to: string,
    added: string,
  ) {
    const files = this.headless!.json<{ snapshot: { changedFiles: ChangedFile[] } }>('intake.json')
      .snapshot.changedFiles;
    const find = (p: string) => files.find((f) => f.path === p);
    assert.equal(find(modified)?.changeType, 'modified');
    assert.equal(find(deleted)?.changeType, 'deleted');
    assert.equal(find(to)?.changeType, 'renamed');
    assert.equal(find(to)?.oldPath, from);
    assert.equal(find(added)?.changeType, 'added');
  },
);
