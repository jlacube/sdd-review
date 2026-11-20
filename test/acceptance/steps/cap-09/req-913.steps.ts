import { strict as assert } from 'node:assert';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-913 area: C001-TS-928 (the analysis core works with the UI neither installed nor
// running). It needs the built CLI (`analyse --headless`, C001-T-010) and the `sign` command
// (the verdict tasks of C001-CAP-07), so it fails until they exist.

interface Installation {
  readonly dir: string;
  readonly store: string;
  readonly statuses: number[];
}
const installations = new WeakMap<AcceptanceWorld, Installation>();

Given(
  'an installation of the review assistant from which the local review UI is removed',
  function (this: AcceptanceWorld) {
    const built = resolve('dist');
    assert.ok(existsSync(join(built, 'cli', 'main.js')), 'run `npm run build` first');
    const dir = this.tempDir('sddinst-');
    cpSync(built, join(dir, 'dist'), { recursive: true });
    cpSync(resolve('package.json'), join(dir, 'package.json'));
    // The UI server and the web client are the parts of the installation that are removed.
    rmSync(join(dir, 'dist', 'ui-server'), { recursive: true, force: true });
    rmSync(join(dir, 'web'), { recursive: true, force: true });
    assert.equal(existsSync(join(dir, 'dist', 'ui-server')), false);
    // The review state store is isolated from the developer's own.
    installations.set(this, { dir, store: this.tempDir('sddstore-'), statuses: [] });
    this.fixture('fx-intake');
  },
);

When(
  'the developer runs the headless analysis and then signs intent {string} through the CLI',
  function (this: AcceptanceWorld, intent: string) {
    const install = installations.get(this);
    assert.ok(install, 'no installation');
    const repo = this.repo;
    assert.ok(repo, 'no repository');
    repo.write('src/cart.ts', `${repo.read('src/cart.ts')}// edited\n`);
    const out = this.tempDir('sddout-');
    const env = {
      ...process.env,
      NODE_OPTIONS: '',
      LOCALAPPDATA: install.store,
      XDG_DATA_HOME: install.store,
      HOME: install.store,
    };
    const cli = join(install.dir, 'dist', 'cli', 'main.js');
    for (const args of [
      ['analyse', '--headless', '--out', out],
      ['sign', intent],
    ]) {
      const run = spawnSync(process.execPath, [cli, ...args], {
        cwd: repo.dir,
        encoding: 'utf8',
        env,
      });
      install.statuses.push(run.status ?? -1);
      this.lastRun = { status: run.status, stdout: run.stdout ?? '', stderr: run.stderr ?? '' };
    }
  },
);

Then('both commands exit with status {int}', function (this: AcceptanceWorld, status: number) {
  assert.deepEqual(installations.get(this)?.statuses, [status, status]);
});

function recordFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? recordFiles(join(dir, entry.name))
      : entry.name === 'review-record.jsonl'
        ? [join(dir, entry.name)]
        : [],
  );
}

Then(
  'the review record holds the sign verdict on {string}',
  function (this: AcceptanceWorld, intent: string) {
    const install = installations.get(this);
    assert.ok(install, 'no installation');
    const entries = recordFiles(install.store).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    );
    assert.ok(
      entries.some(
        (entry) =>
          entry.kind === 'verdict' &&
          entry.verdict === 'sign' &&
          JSON.stringify(entry.intent).includes(intent),
      ),
      `no sign verdict on ${intent} in the review record`,
    );
  },
);
