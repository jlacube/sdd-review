import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-108: C001-TS-117 (C001-REQ-108) on `fx-intake` with binary files. The base commit B0 of
// `fx-intake` is rebuilt with the files a scenario needs in it (a binary file to modify or delete,
// lines to delete), the way `fx-upstream` rebuilds its agent commits; the working-tree edits of
// the scenario are then made again on top of it.

/** Binary content: a NUL byte in the first 8,000 bytes makes git (and intake) treat it as binary. */
const BINARY: Record<string, Buffer> = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48]),
  ico: Buffer.from([0, 0, 1, 0, 1, 0, 0x10, 0x10, 0, 0, 1, 0, 0x20, 0]),
  gif: Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0]),
};
const binaryOf = (path: string) => BINARY[path.split('.').pop() ?? ''] ?? Buffer.from([0, 1, 2]);

interface Plan {
  /** Files that B0 holds besides those of `fx-intake`. */
  readonly base: Record<string, string | Buffer>;
  /** The working-tree edits of the scenario, in order. */
  readonly edits: Array<(repo: FixtureRepo) => void>;
}

const plans = new WeakMap<FixtureRepo, Plan>();

function planOf(repo: FixtureRepo): Plan {
  let plan = plans.get(repo);
  if (!plan) {
    plan = { base: {}, edits: [] };
    plans.set(repo, plan);
  }
  return plan;
}

/**
 * Brings the repository to the plan: B0 again with the extra files (a root commit labelled B0,
 * HEAD on it), then every working-tree edit. Only B0 exists in these scenarios.
 */
function apply(repo: FixtureRepo, plan: Plan, rebuildBase: boolean): void {
  repo.git('reset', '-q', '--hard', repo.label('B0').hash);
  repo.git('clean', '-q', '-fdx');
  if (rebuildBase) {
    const subject = repo.label('B0').subject;
    repo.git('update-ref', '-d', 'HEAD'); // the index keeps the files of B0
    repo.forget('B0');
    repo.commit('B0', { subject, files: plan.base });
  }
  for (const edit of plan.edits) edit(repo);
}

Given(
  /^since B0 the binary file "([^"]+)" is (added|modified|deleted)$/,
  function (this: AcceptanceWorld, path: string, type: string) {
    const repo = this.repo!;
    const plan = planOf(repo);
    const bytes = binaryOf(path);
    if (type === 'added') {
      plan.edits.push((r) => r.write(path, bytes));
      apply(repo, plan, false);
      return;
    }
    plan.base[path] = bytes;
    plan.edits.push(
      type === 'modified'
        ? (r) => r.write(path, Buffer.concat([bytes, Buffer.from([0, 0xff, 0xfe])]))
        : (r) => r.remove(path),
    );
    apply(repo, plan, true);
  },
);

Given(
  '{string} adds {int} lines and deletes {int} lines',
  function (this: AcceptanceWorld, path: string, added: number, deleted: number) {
    const repo = this.repo!;
    const plan = planOf(repo);
    const kept = repo.read(path);
    const tag = path.replace(/\W/g, '_');
    const lines = (n: number, kind: string) =>
      Array.from({ length: n }, (_, i) => `export const ${tag}_${kind}${i} = ${i};\n`).join('');
    // B0 holds the lines to delete after the file's own lines; the working tree replaces them
    // with the added lines: one hunk of `deleted` deleted and `added` added lines.
    plan.base[path] = `${kept}${lines(deleted, 'old')}`;
    plan.edits.push((r) => r.write(path, `${kept}${lines(added, 'new')}`));
    apply(repo, plan, true);
  },
);

interface ListedFile {
  readonly path: string;
  readonly changeType: string;
  readonly changedLines: number;
  readonly hunkIds: readonly string[];
}

function intakeOf(world: AcceptanceWorld) {
  assert.equal(
    world.lastRun?.status,
    0,
    `the CLI exited with ${world.lastRun?.status}: ${world.lastRun?.stderr}`,
  );
  return world.headless!.json<{
    snapshot: { changedFiles: ListedFile[]; changedLines: number };
    hunks: Array<{ path: string }>;
  }>('intake.json');
}

Then(
  /^the change lists "([^"]+)" as (added|modified|deleted|renamed) with (\d+) changed lines$/,
  function (this: AcceptanceWorld, path: string, type: string, lines: string) {
    const intake = intakeOf(this);
    const file = intake.snapshot.changedFiles.find((f) => f.path === path);
    assert.ok(file, `${path} is not listed`);
    assert.equal(file.changeType, type);
    assert.equal(file.changedLines, Number(lines));
    // The file's hunks add up to its changed lines: none for a binary file (C001-REQ-108).
    assert.equal(file.hunkIds.length, intake.hunks.filter((h) => h.path === path).length);
  },
);

Then(
  'the change counts {int} changed lines in total',
  function (this: AcceptanceWorld, total: number) {
    const intake = intakeOf(this);
    assert.equal(intake.snapshot.changedLines, total);
    const summary = this.headless!.json<{ intakeSummary: { changedLines: number } }>('intake.json');
    assert.equal(summary.intakeSummary.changedLines, total);
  },
);
