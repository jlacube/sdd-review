import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Given, Then } from '@cucumber/cucumber';
import { openCore } from '../../../../src/core/api/open.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-105: C001-TS-110, C001-TS-111, C001-TS-112 (C001-REQ-105) on `fx-intake`. The named value
// is given with `--base` by "the developer starts a review naming {string}" (req-102.steps.ts).

/** The reviews of the fixture repository, read from the store of the scenario's CLI runs. */
async function reviewCount(world: AcceptanceWorld): Promise<number> {
  const opened = await openCore(world.repo!.dir, { env: world.cliEnv() });
  try {
    return (await opened.core.api.listReviews()).length;
  } finally {
    await opened.close();
  }
}

Given(
  'the fixture repository {string} with {int} reviews recorded',
  async function (this: AcceptanceWorld, name: string, n: number) {
    const repo = this.fixture(name);
    const opened = await openCore(repo.dir, { env: this.cliEnv() });
    try {
      // Each review takes in a different working tree, so each is a snapshot of its own.
      for (let i = 1; i <= n; i++) {
        repo.write('src/cart.ts', `${repo.read('src/cart.ts')}// review ${i}\n`);
        await opened.core.api.startReview({});
      }
    } finally {
      await opened.close();
    }
    assert.equal(await reviewCount(this), n);
  },
);

Given(
  'the fixture repository {string} with the branch {string} created as an orphan branch with no common history with HEAD',
  function (this: AcceptanceWorld, name: string, branch: string) {
    const repo = this.fixture(name);
    const tree = repo.git('mktree', '--missing'); // the empty tree
    const orphan = repo.git('commit-tree', tree, '-m', `${branch}: unrelated history`);
    repo.branch(branch, orphan);
    assert.throws(() => repo.git('merge-base', branch, 'HEAD'), 'the branch shares history');
    // An uncommitted edit, so that only the named value can stop intake.
    repo.write('src/cart.ts', `${repo.read('src/cart.ts')}// edited\n`);
  },
);

Given(
  'the fixture repository {string} with no file {string}',
  function (this: AcceptanceWorld, name: string, file: string) {
    const repo = this.fixture(name);
    assert.equal(existsSync(repo.path(file)), false);
    repo.write('src/cart.ts', `${repo.read('src/cart.ts')}// edited\n`);
  },
);

Then(
  'intake stops with an error message that contains {string}',
  function (this: AcceptanceWorld, value: string) {
    const run = this.lastRun;
    assert.ok(run, 'the CLI was not run');
    assert.notEqual(run.status, 0, `the CLI succeeded: ${run.stdout}`);
    assert.ok(
      run.stderr.includes(value),
      `the error message does not contain ${value}: ${run.stderr}`,
    );
  },
);

Then(
  'the repository still has {int} reviews recorded',
  async function (this: AcceptanceWorld, n: number) {
    assert.equal(await reviewCount(this), n);
  },
);

Then(
  'no file {string} exists in the repository or in the current directory',
  function (this: AcceptanceWorld, file: string) {
    assert.ok(this.lastRun, 'the CLI was not run');
    // The CLI runs in the repository, which is its current directory.
    assert.equal(existsSync(this.repo!.path(file)), false, `${file} exists in the repository`);
    assert.equal(
      existsSync(join(process.cwd(), file)),
      false,
      `${file} exists in ${process.cwd()}`,
    );
  },
);
