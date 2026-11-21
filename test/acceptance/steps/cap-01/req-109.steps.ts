import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import type { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import { agentPlan, rebuildAgentCommits } from '../../../fixtures/repos/fx-upstream.js';

// C001-TC-109: C001-TS-118, C001-TS-119, C001-TS-120 (C001-REQ-109). The commits of the change are
// read from `intentContext.commits` of the headless intake file. The steps "the intent context in
// the headless output lists {int} commits" and "... lists the commits C1 and C2" are in
// req-104.steps.ts (C001-T-025).

interface CommitJson {
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorTime: string;
  subject: string;
  message: string;
  changedFiles: string[];
}

interface Stated {
  readonly name: string;
  readonly email: string;
  readonly time: string;
  readonly message: string;
  readonly files: readonly string[];
}

/** What the scenario stated for each commit label, per fixture repository. */
const stated = new WeakMap<FixtureRepo, Map<string, Stated>>();

const commitsOf = (world: AcceptanceWorld): CommitJson[] => {
  const run = world.lastRun;
  assert.equal(run?.status, 0, `the CLI exited with ${run?.status}: ${run?.stderr}`);
  return world.headless!.json<{ intentContext: { commits: CommitJson[] } }>('intake.json')
    .intentContext.commits;
};

/** `"a"`, `"a" and "b"`, `"a", "b" and "c"` → the quoted values. */
const quoted = (text: string) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

const changedBy = (repo: FixtureRepo, hash: string) =>
  repo
    .git('diff-tree', '--no-commit-id', '--name-only', '-r', hash)
    .split('\n')
    .filter(Boolean)
    .sort();

Given(
  'the fixture repository "fx-upstream" with base commit U1 and HEAD at C2',
  function (this: AcceptanceWorld) {
    const repo = this.fixture('fx-upstream');
    assert.equal(repo.git('rev-parse', 'HEAD'), repo.label('C2').hash);
    // The upstream branch is at U1, so the default rule takes U1 as the base commit (C001-REQ-103).
    assert.equal(repo.git('rev-parse', 'agent/cart@{upstream}'), repo.label('U1').hash);
  },
);

Given(
  /^(C1|C2) has the author "([^"<]+) <([^>]+)>", the time (\S+), the message "([^"]*)" and changes (.+)$/,
  function (
    this: AcceptanceWorld,
    label: 'C1' | 'C2',
    name: string,
    email: string,
    time: string,
    message: string,
    files: string,
  ) {
    const repo = this.repo!;
    const plan = agentPlan(repo);
    plan[label] = { ...plan[label], author: { name, email }, date: time, message };
    rebuildAgentCommits(repo, plan);
    const record = { name, email, time, message, files: quoted(files).sort() };
    assert.deepEqual(changedBy(repo, repo.label(label).hash), record.files);
    const map = stated.get(repo) ?? new Map<string, Stated>();
    map.set(label, record);
    stated.set(repo, map);
  },
);

Then(
  /^the intent context in the headless output lists exactly the commits ([A-Z]\d) and ([A-Z]\d)$/,
  function (this: AcceptanceWorld, a: string, b: string) {
    assert.deepEqual(
      commitsOf(this).map((c) => c.hash),
      [this.repo!.label(a).hash, this.repo!.label(b).hash],
    );
  },
);

Then(
  'each of them is listed with its hash, author, time, full message and changed files as stated above',
  function (this: AcceptanceWorld) {
    const repo = this.repo!;
    const commits = new Map(commitsOf(this).map((c) => [c.hash, c]));
    const expected = stated.get(repo);
    assert.ok(expected && expected.size > 0, 'no commit was stated');
    for (const [label, want] of expected) {
      const got = commits.get(repo.label(label).hash);
      assert.ok(got, `${label} is not listed`);
      assert.equal(got.authorName, want.name, `${label} author name`);
      assert.equal(got.authorEmail, want.email, `${label} author e-mail`);
      assert.equal(Date.parse(got.authorTime), Date.parse(want.time), `${label} author time`);
      assert.equal(got.message, want.message, `${label} message`);
      assert.equal(got.subject, want.message.split('\n', 1)[0], `${label} subject`);
      assert.deepEqual([...got.changedFiles].sort(), want.files, `${label} changed files`);
    }
  },
);

Given(
  /^the fixture repository "fx-local" with HEAD at C2, no upstream branch and an uncommitted edit of "([^"]+)"$/,
  function (this: AcceptanceWorld, path: string) {
    const repo = this.fixture('fx-local');
    assert.equal(repo.git('rev-parse', 'HEAD'), repo.label('C2').hash);
    assert.equal(repo.git('remote'), '', 'fx-local has a remote');
    assert.throws(() => repo.git('rev-parse', '--verify', '-q', 'agent/cart@{upstream}'));
    repo.write(path, `${repo.read(path)}// uncommitted\n`);
  },
);

Given(
  /^the fixture repository "fx-branches" with base commit (M1) and HEAD at the merge commit (C\d) "([^"]+)", whose parents are (C\d) and (M\d)$/,
  function (
    this: AcceptanceWorld,
    base: string,
    merge: string,
    message: string,
    first: string,
    second: string,
  ) {
    const repo = this.fixture('fx-branches');
    assert.equal(repo.git('rev-parse', 'HEAD'), repo.label(first).hash);
    repo.merge(merge, repo.label(second).hash, message);
    assert.equal(
      repo.git('rev-list', '--parents', '-n', '1', 'HEAD'),
      [repo.label(merge).hash, repo.label(first).hash, repo.label(second).hash].join(' '),
    );
    assert.equal(repo.git('merge-base', 'HEAD', repo.label(base).hash), repo.label(base).hash);
  },
);

Then(
  /^the intent context in the headless output lists (C\d) with the message "([^"]+)"$/,
  function (this: AcceptanceWorld, label: string, message: string) {
    const commit = commitsOf(this).find((c) => c.hash === this.repo!.label(label).hash);
    assert.ok(commit, `${label} is not listed`);
    assert.equal(commit.message, message);
    assert.equal(commit.parents.length, 2, `${label} is not listed as a merge commit`);
  },
);
