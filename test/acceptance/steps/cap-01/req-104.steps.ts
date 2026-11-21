import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import type { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import { DefaultSetup as S } from '../../../fixtures/repos/fx-default.js';

// C001-TC-104: C001-TS-108, C001-TS-109, C001-TS-156 to C001-TS-159 (C001-REQ-104) on `fx-default`.
// The scenarios state the remotes, local branches, tags and the position of HEAD as clauses
// joined by commas and "and"; `arrange` reads them one by one, sets up what a clause names and
// checks what a clause excludes. An unknown clause fails the step, so a new wording is noticed.

const LABEL = '([A-Z]\\d)';
const NAME = '"([^"]+)"';

type Clause = readonly [RegExp, (repo: FixtureRepo, m: RegExpExecArray) => void];

const absent = (repo: FixtureRepo, ...names: string[]) => {
  for (const name of names) {
    assert.equal(repo.git('branch', '--list', name), '', `the local branch "${name}" exists`);
  }
};

const noUpstream = (repo: FixtureRepo) => {
  const branch = repo.git('rev-parse', '--abbrev-ref', 'HEAD');
  assert.throws(
    () => repo.git('rev-parse', '--verify', '-q', `${branch}@{upstream}`),
    `"${branch}" has an upstream branch`,
  );
};

/**
 * HEAD on a local branch that a later clause of the same situation creates (C001-TS-131: "HEAD on
 * "main" and the local branch "main" at C2"): the branch is checked out when that clause creates it.
 */
const pendingHead = new WeakMap<FixtureRepo, string>();

/** Each clause: its pattern (anchored at the start of what is left) and what it does. */
const CLAUSES: readonly Clause[] = [
  [
    new RegExp(`^HEAD (?:is )?on ${NAME}(?: at ${LABEL})?`),
    (repo, m) => {
      if (!m[2] && repo.git('branch', '--list', m[1]!) === '') {
        pendingHead.set(repo, m[1]!);
        return;
      }
      assert.equal(repo.git('symbolic-ref', 'HEAD'), `refs/heads/${m[1]}`);
      if (m[2]) assert.equal(repo.git('rev-parse', 'HEAD'), repo.label(m[2]).hash);
    },
  ],
  [/^(?:(?:which has )?no|without an) upstream branch/, (repo) => noUpstream(repo)],
  [
    /^with no remote(?![s"])/,
    (repo) => assert.equal(repo.git('remote'), '', 'the fixture has a remote'),
  ],
  [
    new RegExp(`^an uncommitted edit of ${NAME}`),
    (repo, m) =>
      assert.ok(
        repo.git('status', '--porcelain', '--', m[1]!).length > 0,
        `"${m[1]}" has no uncommitted edit`,
      ),
  ],
  [new RegExp(`^a detached HEAD at ${LABEL}`), (repo, m) => S.detach(repo, m[1]!)],
  [
    /^no remote(?![s"])/,
    (repo) => assert.equal(repo.git('remote'), '', 'the fixture has a remote'),
  ],
  [
    new RegExp(
      `^(?:only )?the remote ${NAME}, whose symbolic ref "refs/remotes/([^/"]+)/HEAD" names "refs/remotes/([^/"]+)/([^"]+)" at (?:commit )?${LABEL}`,
    ),
    (repo, m) => {
      const [, remote, headOf, of, branch, label] = m;
      assert.ok(remote === headOf && remote === of, `the clause mixes remotes: ${m[0]}`);
      S.remote(repo, remote!);
      S.remoteBranch(repo, remote!, branch!, label!);
      S.remoteHead(repo, remote!, `refs/remotes/${remote}/${branch}`);
    },
  ],
  [
    new RegExp(`^the remote ${NAME} without a symbolic ref "refs/remotes/([^/"]+)/HEAD"`),
    (repo, m) => {
      S.remote(repo, m[1]!);
      // A remote-tracking branch with a merge base, so that only the missing symbolic ref skips it.
      S.remoteBranch(repo, m[1]!, 'main', 'M0');
    },
  ],
  [
    new RegExp(
      `^the remotes ${NAME} and ${NAME}, none named "origin", each with a symbolic ref HEAD naming its branch ${NAME} at ${LABEL}`,
    ),
    (repo, m) => {
      const [, a, b, branch, label] = m;
      for (const remote of [a!, b!]) {
        S.remote(repo, remote);
        S.remoteBranch(repo, remote, branch!, label!);
        S.remoteHead(repo, remote, `refs/remotes/${remote}/${branch}`);
      }
    },
  ],
  [
    new RegExp(`^the local branch ${NAME} at ${LABEL}`),
    (repo, m) => {
      S.localBranch(repo, m[1]!, m[2]!);
      if (pendingHead.get(repo) === m[1]) {
        // The uncommitted edits stay: the branch is created at a commit with the same tree.
        repo.git('checkout', '-q', m[1]!);
        pendingHead.delete(repo);
      }
    },
  ],
  // The second branch of "the local branch "main" at M1 and "master" at M0".
  [new RegExp(`^${NAME} at ${LABEL}`), (repo, m) => S.localBranch(repo, m[1]!, m[2]!)],
  [new RegExp(`^no local branch ${NAME} or ${NAME}`), (repo, m) => absent(repo, m[1]!, m[2]!)],
  [new RegExp(`^no (?:local branch )?${NAME}`), (repo, m) => absent(repo, m[1]!)],
  [new RegExp(`^the tag ${NAME} at ${LABEL}`), (repo, m) => S.tag(repo, m[1]!, m[2]!)],
];

/** Applies every clause of `text` in order; fails on a clause it does not know. */
function arrange(repo: FixtureRepo, text: string): void {
  let rest = text.trim();
  while (rest.length > 0) {
    const found = CLAUSES.map(([pattern, apply]) => [pattern.exec(rest), apply] as const).find(
      ([m]) => m !== null,
    );
    if (!found) throw new Error(`fx-default: no setup for the clause "${rest}"`);
    const [m, apply] = found;
    apply(repo, m!);
    rest = rest.slice(m![0].length).replace(/^(?:, and |, | and )/, '');
  }
  const pending = pendingHead.get(repo);
  assert.equal(pending, undefined, `HEAD on "${pending}": no clause creates that branch`);
}

Given(
  /^the fixture repository "fx-default" with (.+)$/,
  function (this: AcceptanceWorld, situation: string) {
    arrange(this.fixture('fx-default'), situation);
  },
);

Given(
  /^((?:HEAD is on|the local branch|no local branch) .+)$/,
  function (this: AcceptanceWorld, situation: string) {
    arrange(this.repo!, situation);
  },
);

Then(
  'the intake summary states that the base commit is the merge base with the default branch {string}',
  function (this: AcceptanceWorld, branch: string) {
    const run = this.lastRun;
    assert.equal(run?.status, 0, `the CLI exited with ${run?.status}: ${run?.stderr}`);
    const line = run.stdout.split('\n').find((l) => /merge base with default branch /.test(l));
    assert.ok(line, `the intake summary names no default branch:\n${run.stdout}`);
    assert.ok(
      line.endsWith(`merge base with default branch ${branch}`),
      `the intake summary states "${line}"`,
    );
  },
);

Then('the change lists only {string}', function (this: AcceptanceWorld, path: string) {
  const run = this.lastRun;
  assert.equal(run?.status, 0, `the CLI exited with ${run?.status}: ${run?.stderr}`);
  const intake = this.headless!.json<{ snapshot: { changedFiles: Array<{ path: string }> } }>(
    'intake.json',
  );
  assert.deepEqual(
    intake.snapshot.changedFiles.map((f) => f.path),
    [path],
  );
});

interface IntentJson {
  intentContext: { commits: Array<{ hash: string }> };
}

const commitsOf = (world: AcceptanceWorld) => {
  assert.equal(world.lastRun?.status, 0, `the CLI exited with ${world.lastRun?.status}`);
  return world.headless!.json<IntentJson>('intake.json').intentContext.commits.map((c) => c.hash);
};

Then(
  'the intent context in the headless output lists {int} commits',
  function (this: AcceptanceWorld, n: number) {
    assert.equal(commitsOf(this).length, n);
  },
);

Then(
  /^the intent context in the headless output lists the commits ([A-Z]\d) and ([A-Z]\d)$/,
  function (this: AcceptanceWorld, a: string, b: string) {
    assert.deepEqual(commitsOf(this), [this.repo!.label(a).hash, this.repo!.label(b).hash]);
  },
);
