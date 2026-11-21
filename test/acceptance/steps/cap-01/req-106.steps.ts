import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { HeadlessOutput } from '../../support/headless-output.js';

// C001-TC-106: C001-TS-113, C001-TS-114 (C001-REQ-106). The directories are made in the system's
// temporary folder; the test checks with the developer's git that the first lies outside every
// working tree, so a temporary folder inside one is reported and not passed by accident.

const directories = new WeakMap<AcceptanceWorld, Map<string, string>>();

function remember(world: AcceptanceWorld, name: string, dir: string): void {
  const known = directories.get(world) ?? new Map<string, string>();
  known.set(name, dir);
  directories.set(world, known);
}

function directoryOf(world: AcceptanceWorld, name: string): string {
  const dir = directories.get(world)?.get(name);
  assert.ok(dir, `no directory "${name}" was made`);
  return dir;
}

/** Git and Node may name one directory differently: macOS /private, Windows 8.3 names, slashes. */
function spellings(dir: string): string[] {
  const forms = new Set([dir, realpathSync.native(dir)]);
  for (const form of [...forms]) forms.add(form.replace(/\\/g, '/'));
  return [...forms];
}

Given(
  'the directory {string} that lies outside every git working tree and holds the file {string}',
  function (this: AcceptanceWorld, name: string, file: string) {
    const dir = this.tempDir(`${name}-`);
    writeFileSync(join(dir, file), 'export const a = 1;\n');
    const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.notEqual(
      probe.status,
      0,
      `the temporary folder lies in a working tree: ${probe.stdout}`,
    );
    remember(this, name, dir);
  },
);

Given(
  'the directory {string} initialised as a git repository with no commit and with the untracked file {string}',
  function (this: AcceptanceWorld, name: string, file: string) {
    const dir = this.tempDir(`${name}-`);
    execFileSync('git', ['init', '-q', dir]);
    writeFileSync(join(dir, file), 'export const a = 1;\n');
    remember(this, name, dir);
  },
);

When('the developer starts a review in {string}', function (this: AcceptanceWorld, name: string) {
  const out = this.tempDir();
  this.cli(['analyse', '--headless', '--out', out], directoryOf(this, name));
  this.headless = new HeadlessOutput(out);
});

Then(
  'intake stops with an error message that contains the path of {string}',
  function (this: AcceptanceWorld, name: string) {
    const run = this.lastRun;
    assert.ok(run, 'the CLI was not run');
    assert.notEqual(run.status, 0, `the CLI succeeded: ${run.stdout}`);
    const forms = spellings(directoryOf(this, name));
    assert.ok(
      forms.some((form) => run.stderr.includes(form)),
      `the error message names none of ${forms.join(', ')}: ${run.stderr}`,
    );
  },
);
