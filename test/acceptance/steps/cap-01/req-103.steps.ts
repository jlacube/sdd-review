import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-103: C001-TS-106, C001-TS-107 (C001-REQ-103) on `fx-upstream`, whose builder sets HEAD on
// "agent/cart" at C2 with the upstream branch "origin/agent/cart" at U1. The scenarios then run
// the CLI without naming a commit (intake-common.steps.ts).

interface IntakeJson {
  snapshot: { changedFiles: Array<{ path: string }> };
}

/** The upstream branch moved ahead to U2, a child of U1 that changes `path`. */
function moveUpstreamAhead(world: AcceptanceWorld, path: string): void {
  const repo = world.repo!;
  repo.git('checkout', '-q', '-b', 'fixture-upstream', repo.label('U1').hash);
  repo.commit('U2', {
    subject: 'U2: shipping',
    files: { [path]: 'export const shipping = () => 7;\n' },
  });
  repo.git('update-ref', 'refs/remotes/origin/agent/cart', repo.label('U2').hash);
  repo.checkout('agent/cart');
  repo.git('branch', '-q', '-D', 'fixture-upstream');
}

Given(
  /^the fixture repository "fx-upstream" with HEAD on "agent\/cart"(?: at (C2))?, whose upstream branch "origin\/agent\/cart" is at commit (U1|U2)$/,
  function (this: AcceptanceWorld, _at: string | undefined, label: string) {
    const repo = this.fixture('fx-upstream');
    if (label === 'U2') moveUpstreamAhead(this, 'src/shipping.ts');
    assert.equal(repo.git('symbolic-ref', 'HEAD'), 'refs/heads/agent/cart');
    assert.equal(repo.git('rev-parse', 'HEAD'), repo.label('C2').hash);
    assert.equal(repo.git('rev-parse', 'agent/cart@{upstream}'), repo.label(label).hash);
  },
);

Given(
  'HEAD holds {int} commits C1 and C2 after U1 that change {string} and {string}',
  function (this: AcceptanceWorld, n: number, a: string, b: string) {
    const repo = this.repo!;
    const listed = repo.git('rev-list', '--reverse', `${repo.label('U1').hash}..HEAD`).split('\n');
    assert.deepEqual(listed, [repo.label('C1').hash, repo.label('C2').hash]);
    assert.equal(listed.length, n);
    const files = repo.git('diff', '--name-only', repo.label('U1').hash, 'HEAD').split('\n');
    assert.deepEqual(files.sort(), [a, b].sort());
  },
);

Given(
  /^U2 is a child of U1, U1 is the merge base of U2 and HEAD, and U2 changes "([^"]+)"$/,
  function (this: AcceptanceWorld, path: string) {
    const repo = this.repo!;
    const [u1, u2] = [repo.label('U1').hash, repo.label('U2').hash];
    assert.equal(repo.git('rev-parse', `${u2}^`), u1);
    assert.equal(repo.git('merge-base', u2, 'HEAD'), u1);
    assert.equal(repo.git('diff', '--name-only', u1, u2), path);
  },
);

Given(
  'the working tree holds an uncommitted edit of {string}',
  function (this: AcceptanceWorld, path: string) {
    this.repo!.write(path, `${this.repo!.read(path)}// uncommitted\n`);
  },
);

Then(
  'the change lists {string}, {string} and {string}',
  function (this: AcceptanceWorld, a: string, b: string, c: string) {
    assert.equal(
      this.lastRun?.status,
      0,
      `the CLI exited with ${this.lastRun?.status}: ${this.lastRun?.stderr}`,
    );
    const listed = this.headless!.json<IntakeJson>('intake.json').snapshot.changedFiles.map(
      (f) => f.path,
    );
    for (const path of [a, b, c])
      assert.ok(listed.includes(path), `${path} not listed in ${listed.join(', ')}`);
  },
);
