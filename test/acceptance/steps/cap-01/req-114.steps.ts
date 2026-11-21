import { strict as assert } from 'node:assert';
import { writeFileSync } from 'node:fs';
import { Given, Then, When } from '@cucumber/cucumber';
import { FX_SDD } from '../../../fixtures/repos/fx-sdd.js';
import { HeadlessOutput } from '../../support/headless-output.js';
import { namedPath } from '../../support/named-files.js';
import type { AcceptanceWorld } from '../../support/world.js';
import type { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';

// C001-TC-114: C001-TS-130, C001-TS-131, C001-TS-132 and C001-TS-160 (C001-REQ-114, C001-T-033). The
// intake summary is the text that `analyse --headless` prints on standard output (C001-IF-001
// Output); the review command prints the same text before the review address. The rows of
// C001-TS-131 on `fx-default` are set up by the clauses of req-104.steps.ts.

const HEAD_WARNING = 'only uncommitted edits are reviewed, name another base with --base';

/** The lines of the intake summary of the last run, which must have succeeded. */
function summaryLines(world: AcceptanceWorld): string[] {
  const run = world.lastRun;
  assert.ok(run, 'the CLI was not run');
  assert.equal(run.status, 0, `the CLI exited with ${run.status}: ${run.stderr}${run.stdout}`);
  return run.stdout.split(/\r?\n/);
}

function line(world: AcceptanceWorld, prefix: string): string {
  const found = summaryLines(world).find((l) => l.startsWith(prefix));
  assert.ok(found, `the intake summary has no line "${prefix}…":\n${world.lastRun?.stdout}`);
  return found;
}

function analyse(world: AcceptanceWorld, args: string[]): void {
  const out = world.tempDir();
  world.cli(['analyse', '--headless', '--out', out, ...args]);
  world.headless = new HeadlessOutput(out);
}

// ---- C001-TS-130 -------------------------------------------------------------------------------

const lines = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `export const ${tag}${i} = ${i};\n`).join('');

/** Nine requirements more than the three spec items of fx-sdd's CHG-042: twelve in all. */
const EXTRA_REQUIREMENTS = Array.from({ length: 9 }, (_, i) => {
  const n = String(10 + i).padStart(3, '0');
  return `### C042-REQ-${n} — Cart rule ${n}\n- **Statement:** THE cart SHALL apply rule ${n}.\n`;
}).join('\n');

Given(
  /^the fixture repository "fx-sdd" with the base commit B0 whose subject line is "([^"]+)"$/,
  function (this: AcceptanceWorld, subject: string) {
    const repo = this.fixture('fx-sdd');
    // B0 is the commit on top of the fixture's first commit that carries the subject, with the
    // twelve spec items the scenario states for CHG-042; the working tree is reset to it.
    repo.git('checkout', '-q', '--', 'src/cart/total.ts');
    repo.forget('B0');
    repo.commit('B0', {
      subject,
      files: { [FX_SDD.requirements]: `${repo.read(FX_SDD.requirements)}\n${EXTRA_REQUIREMENTS}` },
    });
    // The agent plan the review names lies in the scenario's folder of named files.
    writeFileSync(namedPath(this, 'plan.md'), '# Plan\n\n1. Compute the cart total.\n');
  },
);

Given(
  /^since B0 the change holds (\d+) changed files with (\d+) changed lines and 2 commits C1 and C2$/,
  function (this: AcceptanceWorld, files: string, changed: string) {
    assert.equal(Number(files), 4, 'only 4 changed files are automated');
    const repo = this.repo!;
    // C1 and C2 add 50 lines each; the working tree replaces the one line of total.ts (2 changed
    // lines) and adds an untracked file with the rest.
    repo.commit('C1', { subject: 'C1: cart lines', files: { 'src/cart/c1.ts': lines(50, 'c1') } });
    repo.commit('C2', { subject: 'C2: cart rules', files: { 'src/cart/c2.ts': lines(50, 'c2') } });
    repo.write(
      'src/cart/total.ts',
      'export const total = (prices: number[]) => prices.length + 0;\n',
    );
    repo.write('src/cart/wip.ts', lines(Number(changed) - 102, 'wip'));
  },
);

Given(
  /^the snapshot holds the open SDD change "([^"]+)" with (\d+) spec items$/,
  function (this: AcceptanceWorld, id: string, n: string) {
    const repo = this.repo!;
    assert.equal(id, FX_SDD.open.id);
    const requirements = (repo.read(FX_SDD.requirements).match(/^### C042-REQ-/gm) ?? []).length;
    const tasks = (repo.read(FX_SDD.task).match(/^id: C042-T-/gm) ?? []).length;
    assert.equal(requirements + tasks, Number(n), 'spec items of CHG-042 in the working tree');
  },
);

Then(
  /^the intake summary states the hash of (B\d) and "([^"]+)"$/,
  function (this: AcceptanceWorld, label: string, subject: string) {
    assert.equal(
      line(this, 'Base commit: '),
      `Base commit: ${this.repo!.label(label).hash} ${subject}`,
    );
  },
);

Then('it states that the developer named the base commit', function (this: AcceptanceWorld) {
  assert.match(line(this, 'Chosen: '), /^Chosen: named \S+$/);
});

Then(
  /^it states (\d+) changed files and (\d+) changed lines$/,
  function (this: AcceptanceWorld, files: string, changed: string) {
    assert.equal(
      line(this, 'Changed files: '),
      `Changed files: ${files}; changed lines: ${changed}`,
    );
  },
);

Then(
  /^it states the SDD change "([^"]+)" with (\d+) spec items, (\d+) commits and the agent plan "([^"]+)"$/,
  function (this: AcceptanceWorld, id: string, items: string, commits: string, plan: string) {
    const context = line(this, 'Intent context: ');
    assert.ok(context.includes(`SDD change ${id} (${items} spec items`), context);
    assert.ok(context.includes(`; ${commits} commits;`), context);
    const named = /agent plan ([^;]+)/.exec(context)?.[1];
    assert.ok(named && named.replace(/\\/g, '/').endsWith(`/${plan}`), context);
  },
);

// ---- C001-TS-131 -------------------------------------------------------------------------------

type Clause = readonly [RegExp, (repo: FixtureRepo, m: RegExpExecArray) => void];

const SITUATION: readonly Clause[] = [
  [
    /^the upstream branch "origin\/agent\/cart" (also )?at ([A-Z]\d)$/,
    (repo, m) => {
      const at = repo.label(m[2]!).hash;
      if (m[1]) repo.git('update-ref', 'refs/remotes/origin/agent/cart', at);
      assert.equal(repo.git('rev-parse', 'agent/cart@{upstream}'), at);
    },
  ],
  [
    /^HEAD at ([A-Z]\d)$/,
    (repo, m) => assert.equal(repo.git('rev-parse', 'HEAD'), repo.label(m[1]!).hash),
  ],
  [
    /^an uncommitted edit of "([^"]+)"$/,
    (repo, m) => repo.write(m[1]!, `${repo.read(m[1]!)}// uncommitted\n`),
  ],
];

Given(
  /^the fixture repository "(fx-upstream|fx-local)" with HEAD on "([^"]+)" and (.+)$/,
  function (this: AcceptanceWorld, name: string, branch: string, situation: string) {
    const repo = this.fixture(name);
    assert.equal(repo.git('symbolic-ref', 'HEAD'), `refs/heads/${branch}`);
    for (const clause of situation.split(/, | and /)) {
      const found = SITUATION.map(([re, apply]) => [re.exec(clause), apply] as const).find(
        ([m]) => m !== null,
      );
      if (!found) throw new Error(`${name}: no setup for the clause "${clause}"`);
      found[1](repo, found[0]!);
    }
  },
);

When(
  /^the developer starts a review naming the commit "([^"]+)"$/,
  function (this: AcceptanceWorld, value: string) {
    analyse(this, ['--base', value]);
  },
);

Then(
  /^the intake summary states the base commit ([A-Z]\d) with its hash and subject line$/,
  function (this: AcceptanceWorld, label: string) {
    const commit = this.repo!.label(label);
    assert.equal(line(this, 'Base commit: '), `Base commit: ${commit.hash} ${commit.subject}`);
  },
);

Then(
  /^it states that the base commit is the merge base with the (upstream|default) branch "([^"]+)"$/,
  function (this: AcceptanceWorld, kind: string, ref: string) {
    const rule =
      kind === 'upstream' ? 'merge base with upstream' : 'merge base with default branch';
    assert.equal(line(this, 'Chosen: '), `Chosen: ${rule} ${ref}`);
  },
);

Then(
  'it states that HEAD is the base commit because no branch of the default rule qualified',
  function (this: AcceptanceWorld) {
    assert.equal(
      line(this, 'Chosen: '),
      'Chosen: HEAD (no upstream branch, no default branch of the remote, no local main or master with a merge base)',
    );
  },
);

Then(
  /^it states that the developer named the base commit "([^"]+)"$/,
  function (this: AcceptanceWorld, value: string) {
    assert.equal(line(this, 'Chosen: '), `Chosen: named ${value}`);
  },
);

Then(
  'it holds no warning that only uncommitted edits are reviewed',
  function (this: AcceptanceWorld) {
    assert.ok(!summaryLines(this).includes(HEAD_WARNING), this.lastRun?.stdout);
  },
);

Then(
  'it warns on the next line that only uncommitted edits are reviewed and that another base can be named with --base',
  function (this: AcceptanceWorld) {
    const all = summaryLines(this);
    const chosen = all.findIndex((l) => l.startsWith('Chosen: '));
    assert.ok(chosen >= 0, this.lastRun?.stdout);
    assert.equal(all[chosen + 1], HEAD_WARNING);
  },
);

// ---- C001-TS-132 -------------------------------------------------------------------------------

Given(
  /^the fixture repository "fx-local" with HEAD at C2, no upstream branch, no SDD workspace and an uncommitted edit of "([^"]+)"$/,
  function (this: AcceptanceWorld, path: string) {
    const repo = this.fixture('fx-local');
    assert.equal(repo.git('rev-parse', 'HEAD'), repo.label('C2').hash);
    assert.throws(() => repo.git('rev-parse', '--verify', '-q', 'agent/cart@{upstream}'));
    assert.equal(repo.git('ls-files', '--', '.sdd'), '', 'fx-local holds an SDD workspace');
    repo.write(path, `${repo.read(path)}// uncommitted\n`);
  },
);

When(
  'the developer starts a review without naming a commit and without naming a file',
  function (this: AcceptanceWorld) {
    analyse(this, []);
  },
);

Then(
  /^the intake summary states (\d+) changed files?$/,
  function (this: AcceptanceWorld, n: string) {
    assert.match(line(this, 'Changed files: '), new RegExp(`^Changed files: ${n};`));
  },
);

Then(
  /^it states that the intent context holds (\d+) commits, no SDD workspace and no named file$/,
  function (this: AcceptanceWorld, commits: string) {
    assert.equal(
      line(this, 'Intent context: '),
      `Intent context: no open SDD change; ${commits} commits; no named file; no documented architecture`,
    );
  },
);

// ---- C001-TS-160 -------------------------------------------------------------------------------

Given(
  /^the fixture repository "(fx-intake)" with the base commit labelled B0, whose review configuration (?:sets the test command `([^`]+)`|sets no test command)$/,
  function (this: AcceptanceWorld, name: string, command: string | undefined) {
    const repo = this.fixture(name);
    // B0 is the commit on top of the fixture's base that adds the review configuration.
    repo.forget('B0');
    repo.commit('B0', {
      subject: 'B0: base with a review configuration',
      files: {
        '.sdd-review/config.json': JSON.stringify(
          command ? { formatVersion: 1, tests: { command } } : { formatVersion: 1 },
        ),
      },
    });
    repo.write('src/cart.ts', `${repo.read('src/cart.ts')}// edited\n`);
  },
);

When(
  /^the developer starts a review naming commit (B\d) (?:and the test command `([^`]+)`|without a test command)$/,
  function (this: AcceptanceWorld, label: string, command: string | undefined) {
    analyse(this, [
      '--base',
      this.repo!.label(label).hash,
      ...(command ? ['--test-command', command] : []),
    ]);
  },
);

Then(
  /^the intake summary states that the test command `([^`]+)`, (?:given for the review|from the review configuration of (B\d)), will run$/,
  function (this: AcceptanceWorld, command: string, label: string | undefined) {
    const where = label
      ? `from the review configuration of base commit ${this.repo!.label(label).hash}`
      : 'given with --test-command';
    assert.equal(line(this, 'Test command: '), `Test command: ${command} (${where})`);
  },
);

Then('the intake summary states that no test command will run', function (this: AcceptanceWorld) {
  assert.equal(line(this, 'Test command: '), 'Test command: none');
});
