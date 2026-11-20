import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import type { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';

// C001-TC-120: C001-TS-144, C001-TS-145, C001-TS-146 (C001-REQ-120). The repository is read by the
// test with the developer's git, outside the system under test; the test records its state
// before the review starts and compares it after.

interface RepoState {
  status: string;
  indexHash: string;
  refs: string;
  commitCount: string;
  files: Record<string, string>;
  staged: string;
}

/**
 * The scenarios of C001-REQ-120 say "after intake": a run that never reached intake leaves the
 * repository unchanged for the wrong reason, so each check first requires that the review ran.
 */
function assertReviewRan(world: AcceptanceWorld): void {
  const run = world.lastRun;
  assert.ok(run, 'the review was not started');
  assert.equal(
    run.status,
    0,
    `the review did not run to the end (exit ${run.status}): ${run.stderr}`,
  );
}

const before = new WeakMap<AcceptanceWorld, RepoState>();

function git(repo: FixtureRepo, ...args: string[]): string {
  // GIT_OPTIONAL_LOCKS=0: the recording itself must not refresh the index.
  return execFileSync('git', args, {
    cwd: repo.dir,
    env: repo.env({ GIT_OPTIONAL_LOCKS: '0' }),
    encoding: 'utf8',
  });
}

function sha(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function record(repo: FixtureRepo, files: string[] = []): RepoState {
  return {
    status: git(repo, 'status', '--porcelain=v2'),
    indexHash: sha(join(repo.dir, '.git', 'index')),
    refs: git(repo, 'for-each-ref', '--format=%(refname) %(objectname)'),
    commitCount: git(repo, 'rev-list', '--count', '--all'),
    files: Object.fromEntries(files.map((f) => [f, repo.read(f)])),
    staged: git(repo, 'diff', '--cached', '--name-only'),
  };
}

Given(
  'the fixture repository {string} with base commit U1, HEAD at C2 and an uncommitted edit of {string}',
  function (this: AcceptanceWorld, name: string, path: string) {
    const repo = this.fixture(name);
    repo.label('U1');
    repo.label('C2');
    repo.write(path, `${repo.read(path)}// uncommitted\n`);
  },
);

Given(
  /^the test has recorded the output of "git status --porcelain=v2", the hash of "\.git\/index", every branch and tag with its commit, and the count of commits reachable from every ref$/,
  function (this: AcceptanceWorld) {
    before.set(this, record(this.repo!));
  },
);

Then('each of the recorded values is identical after intake', function (this: AcceptanceWorld) {
  assertReviewRan(this);
  const was = before.get(this);
  assert.ok(was, 'nothing was recorded before intake');
  assert.deepEqual(record(this.repo!), was);
});

Given(
  'the fixture repository {string} whose hooks {string}, {string} and {string} each create the file {string}',
  function (this: AcceptanceWorld, name: string, h1: string, h2: string, h3: string, file: string) {
    const repo = this.fixture(name);
    for (const hook of [h1, h2, h3]) {
      const path = repo.path(`.git/hooks/${hook}`);
      writeFileSync(path, `#!/bin/sh\ntouch "${file}"\n`);
      chmodSync(path, 0o755);
    }
    before.set(this, record(repo));
  },
);

Then('no file {string} exists', function (this: AcceptanceWorld, file: string) {
  assertReviewRan(this);
  assert.equal(existsSync(this.repo!.path(file)), false);
});

Then(
  /^the output of "git status --porcelain=v2" is identical to its output before intake$/,
  function (this: AcceptanceWorld) {
    assertReviewRan(this);
    assert.equal(git(this.repo!, 'status', '--porcelain=v2'), before.get(this)!.status);
  },
);

Given(
  'the fixture repository {string} where {string} has a staged edit and {string} has an unstaged edit',
  function (this: AcceptanceWorld, name: string, staged: string, unstaged: string) {
    const repo = this.fixture(name);
    repo.write(staged, `${repo.read(staged)}// staged\n`).stage(staged);
    repo.write(unstaged, `${repo.read(unstaged)}// unstaged\n`);
    before.set(this, record(repo, [staged, unstaged]));
  },
);

Then(
  '{string} is still staged and {string} is still unstaged with the same content',
  function (this: AcceptanceWorld, staged: string, unstaged: string) {
    assertReviewRan(this);
    const repo = this.repo!;
    const was = before.get(this)!;
    const now = record(repo, [staged, unstaged]);
    assert.deepEqual(now.files, was.files);
    assert.equal(now.staged, was.staged);
    assert.ok(now.staged.split('\n').includes(staged), `${staged} is not staged`);
    assert.equal(
      git(repo, 'diff', '--name-only').split('\n').includes(unstaged),
      true,
      `${unstaged} is not an unstaged edit`,
    );
    assert.equal(now.indexHash, was.indexHash);
  },
);
