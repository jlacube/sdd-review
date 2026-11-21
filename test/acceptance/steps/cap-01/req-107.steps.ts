import { strict as assert } from 'node:assert';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Given, Then } from '@cucumber/cucumber';
import { openCore } from '../../../../src/core/api/open.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-107: C001-TS-115, C001-TS-116 (C001-REQ-107) on `fx-upstream` and `fx-local`. The review
// is started by "the developer starts a review without naming a commit" (intake-common.steps.ts)
// and the count of reviews afterwards by "the repository still has {int} reviews recorded"
// (req-105.steps.ts).

async function reviewCount(world: AcceptanceWorld): Promise<number> {
  const opened = await openCore(world.repo!.dir, { env: world.cliEnv() });
  try {
    return (await opened.core.api.listReviews()).length;
  } finally {
    await opened.close();
  }
}

Given(
  'the fixture repository {string} with HEAD at the tip U1 of its upstream branch, a clean working tree and {int} reviews recorded',
  async function (this: AcceptanceWorld, name: string, n: number) {
    const repo = this.fixture(name);
    repo.git('reset', '-q', '--hard', repo.label('U1').hash);
    assert.equal(repo.git('rev-parse', 'agent/cart@{upstream}'), repo.label('U1').hash);
    assert.equal(repo.git('status', '--porcelain', '--untracked-files=all'), '');
    assert.equal(await reviewCount(this), n);
  },
);

Given(
  'the fixture repository {string} with HEAD on {string} at C2, no upstream branch, no remote and no local branch {string} or {string}, so that HEAD is the base commit',
  function (this: AcceptanceWorld, name: string, branch: string, main: string, master: string) {
    const repo = this.fixture(name);
    assert.equal(repo.git('rev-parse', 'HEAD'), repo.label('C2').hash);
    assert.equal(repo.git('symbolic-ref', 'HEAD'), `refs/heads/${branch}`);
    assert.equal(repo.git('remote'), '');
    assert.throws(() => repo.git('rev-parse', '--verify', '-q', `${branch}@{upstream}`));
    for (const b of [main, master]) {
      assert.throws(() => repo.git('rev-parse', '--verify', '-q', `refs/heads/${b}`));
    }
  },
);

Given(
  'no tracked file is edited and {int} reviews are recorded',
  async function (this: AcceptanceWorld, n: number) {
    assert.equal(this.repo!.git('status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(await reviewCount(this), n);
  },
);

Given(
  'the working tree holds only the untracked file {string}, excluded by the ignore rule {string}',
  function (this: AcceptanceWorld, path: string, rule: string) {
    const repo = this.repo!;
    // The rule goes to `.git/info/exclude`: a `.gitignore` file would itself be an untracked file
    // of the change (C001-IF-012 G-07 reads both).
    const info = join(repo.dir, '.git', 'info');
    mkdirSync(info, { recursive: true });
    appendFileSync(join(info, 'exclude'), `\n${rule}\n`);
    repo.write(path, 'console.log("bundle");\n');
    assert.equal(repo.git('status', '--porcelain', '--untracked-files=all'), '');
    assert.match(repo.git('status', '--porcelain', '--ignored'), new RegExp(`!! ${rule}`));
  },
);

Then('intake reports that the change is empty', function (this: AcceptanceWorld) {
  const run = this.lastRun;
  assert.ok(run, 'the CLI was not run');
  assert.equal(run.status, 4, `exit code: ${run.stderr}${run.stdout}`);
  // HEAD is the base commit in both scenarios (TS-115: U1, the upstream tip; TS-116: C2).
  const head = this.repo!.git('rev-parse', 'HEAD');
  assert.ok(run.stderr.includes('ERR-INTAKE-005'), `no ERR-INTAKE-005 in: ${run.stderr}`);
  assert.ok(
    run.stderr.includes(
      `The change is empty: the working tree matches base commit ${head}. No review was created.`,
    ),
    `the message is not the catalogue's: ${run.stderr}`,
  );
  assert.equal(this.headless?.has('intake.json') ?? false, false, 'a snapshot was exported');
});
