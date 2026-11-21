import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import type { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import {
  agentPlan,
  LEGACY_LINES,
  rebuildAgentCommits,
} from '../../../fixtures/repos/fx-upstream.js';

// C001-TC-110: C001-TS-121, C001-TS-122, C001-TS-123 (C001-REQ-110) on `fx-upstream` (base commit
// U1, HEAD at C2; "the fixture repository "fx-upstream" with base commit U1 and HEAD at C2" is in
// req-109.steps.ts). Each "hunk Hn of <path>" step rewrites C1, C2 or the working tree so that
// <path> has exactly one hunk, of the stated kind; the outcome steps read `commits` and
// `uncommitted` of that hunk in the headless intake file.

interface HunkJson {
  path: string;
  oldLines: number;
  newLines: number;
  commits: string[];
  uncommitted: boolean;
}

/** The path of each hunk label of the scenario, per fixture repository. */
const hunkPaths = new WeakMap<FixtureRepo, Map<string, string>>();

function name(world: AcceptanceWorld, label: string, path: string): FixtureRepo {
  const repo = world.repo!;
  const map = hunkPaths.get(repo) ?? new Map<string, string>();
  map.set(label, path);
  hunkPaths.set(repo, map);
  return repo;
}

function hunkOf(world: AcceptanceWorld, label: string): HunkJson {
  const run = world.lastRun;
  assert.equal(run?.status, 0, `the CLI exited with ${run?.status}: ${run?.stderr}`);
  const path = hunkPaths.get(world.repo!)?.get(label);
  assert.ok(path, `hunk ${label} was not stated`);
  const hunks = world
    .headless!.json<{ hunks: HunkJson[] }>('intake.json')
    .hunks.filter((h) => h.path === path);
  assert.equal(hunks.length, 1, `${path} has ${hunks.length} hunks, not 1`);
  return hunks[0]!;
}

const lines = (...texts: string[]) => texts.map((t) => `${t}\n`).join('');

Given(
  /^hunk (H\d) of "([^"]+)" holds lines added by C1 and lines modified again by C2$/,
  function (this: AcceptanceWorld, label: string, path: string) {
    const repo = name(this, label, path);
    const before = repo.read(path);
    const plan = agentPlan(repo);
    const added = (count: string) =>
      lines(
        'export const cartTotal = (items: number[]) => items.reduce((s, n) => s + n, 0);',
        `export const cartCount = (items: number[]) => ${count};`,
        'export const cartEmpty = (items: number[]) => items.length === 0;',
      );
    const base = repo.git('show', `${repo.label('U1').hash}:${path}`) + '\n';
    plan.C1 = { ...plan.C1, files: { ...plan.C1.files, [path]: base + added('items.length') } };
    plan.C2 = {
      ...plan.C2,
      files: { ...plan.C2.files, [path]: base + added('items.filter(Boolean).length') },
    };
    rebuildAgentCommits(repo, plan);
    assert.notEqual(repo.read(path), before);
  },
);

Given(
  /^hunk (H\d) of "([^"]+)" holds only uncommitted added lines$/,
  function (this: AcceptanceWorld, label: string, path: string) {
    const repo = name(this, label, path);
    assert.equal(
      repo.git('diff', '--name-only', repo.label('U1').hash, 'HEAD', '--', path),
      '',
      `${path} is changed by a commit`,
    );
    repo.write(
      path,
      repo.read(path) + lines('export const orderSize = 3;', 'export const ok = 1;'),
    );
  },
);

Given(
  /^hunk (H\d) of "([^"]+)" holds (\d+) lines added by C2 and (\d+) adjacent lines added in the working tree$/,
  function (this: AcceptanceWorld, label: string, path: string, byC2: string, byTree: string) {
    const repo = name(this, label, path);
    const base = repo.git('show', `${repo.label('U1').hash}:${path}`) + '\n';
    const added = (from: number, n: number) =>
      Array.from(
        { length: n },
        (_, k) => `export const rate${from + k} = ${from + k} / 100;\n`,
      ).join('');
    const plan = agentPlan(repo);
    plan.C2 = { ...plan.C2, files: { ...plan.C2.files, [path]: base + added(0, Number(byC2)) } };
    rebuildAgentCommits(repo, plan);
    repo.write(path, repo.read(path) + added(Number(byC2), Number(byTree)));
  },
);

Given(
  /^hunk (H\d) of "([^"]+)" only deletes (\d+) lines, deleted by C1$/,
  function (this: AcceptanceWorld, label: string, path: string, count: string) {
    const repo = name(this, label, path);
    const base = repo.git('show', `${repo.label('U1').hash}:${path}`) + '\n';
    assert.equal(base, LEGACY_LINES.join(''), `${path} is not the legacy file of fx-upstream`);
    const n = Number(count);
    const kept = [...LEGACY_LINES.slice(0, 2), ...LEGACY_LINES.slice(2 + n)];
    const plan = agentPlan(repo);
    plan.C1 = { ...plan.C1, files: { ...plan.C1.files, [path]: kept.join('') } };
    rebuildAgentCommits(repo, plan);
  },
);

const assertUncommitted = (hunk: HunkJson, wanted: string) =>
  assert.equal(
    hunk.uncommitted,
    wanted === 'uncommitted changed lines',
    `uncommitted of ${hunk.path}`,
  );

Then(
  /^the headless output records for (H\d) the commits? ([A-Z]\d(?: and [A-Z]\d)*) and (no uncommitted changed line|uncommitted changed lines)$/,
  function (this: AcceptanceWorld, label: string, commits: string, uncommitted: string) {
    const hunk = hunkOf(this, label);
    const labels = commits.split(' and ');
    assert.deepEqual(
      hunk.commits,
      labels.map((l) => this.repo!.label(l).hash),
      `commits of ${hunk.path}`,
    );
    assertUncommitted(hunk, uncommitted);
  },
);

Then(
  /^it records for (H\d) no commit and (no uncommitted changed line|uncommitted changed lines)$/,
  function (this: AcceptanceWorld, label: string, uncommitted: string) {
    const hunk = hunkOf(this, label);
    assert.deepEqual(hunk.commits, [], `commits of ${hunk.path}`);
    assertUncommitted(hunk, uncommitted);
  },
);
