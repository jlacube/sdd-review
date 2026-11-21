import { strict as assert } from 'node:assert';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { After, Given, setDefaultTimeout, Then, When } from '@cucumber/cucumber';
import type { Page } from 'playwright';
import { openCore } from '../../../../src/core/api/open.js';
import { intentIdOf } from '../../support/fake-review.js';
import { browserKindsFor, launchBrowser } from '../../support/browser.js';
import { watchCspViolations } from '../../support/csp-violations.js';
import type { AcceptanceWorld, RunningCli } from '../../support/world.js';
import { session as uiSession } from './req-905-908.steps.js';

// C001-TC-901 to C001-TC-903 areas: C001-TS-901 (the review command opens the review),
// C001-TS-902 (the same snapshot again), C001-TS-903 (no browser can be opened), and the
// browser half of C001-TS-913 (a verdict from the page served by the review's own UI).
//
// The scenarios run the built CLI (`dist/cli/main.js`) as a process. "The browser launcher" is a
// test double: the CLI's launcher is the program named by the BROWSER environment variable, here a
// script that records the address it is asked to open, or one that fails. The page is then opened
// with Playwright in each browser of `browserKindsFor` (SDD_ACCEPT_BROWSERS, SDD_BROWSER).

// The steps of these scenarios start a process and a browser: more than Cucumber's 5 seconds.
setDefaultTimeout(120_000);

interface ReviewRun {
  cli: RunningCli;
  /** The file the launcher double writes its address to. */
  launcherLog: string;
  address?: string;
  snapshotId?: string;
}

const runs = new WeakMap<AcceptanceWorld, ReviewRun[]>();
/** The scenario's own name of a snapshot ("s-4f1a") → the real snapshot ID. */
const names = new WeakMap<AcceptanceWorld, Map<string, string>>();
const failingLauncher = new WeakSet<AcceptanceWorld>();

const runsOf = (world: AcceptanceWorld) => runs.get(world) ?? [];
export const lastRun = (world: AcceptanceWorld): ReviewRun => {
  const run = runsOf(world).at(-1);
  assert.ok(run, 'the review command was not run');
  return run;
};

/** Writes the launcher double: a program that records its first argument, or fails. */
function writeLauncher(world: AcceptanceWorld, fails: boolean): { path: string; log: string } {
  const dir = world.tempDir('sddlauncher-');
  const log = join(dir, 'opened.txt');
  if (process.platform === 'win32') {
    const path = join(dir, 'launcher.cmd');
    writeFileSync(path, fails ? '@exit /b 1\r\n' : `@>> "${log}" echo %~1\r\n@exit /b 0\r\n`);
    return { path, log };
  }
  const path = join(dir, 'launcher.sh');
  writeFileSync(
    path,
    fails ? '#!/bin/sh\nexit 1\n' : `#!/bin/sh\nprintf '%s\\n' "$1" >> '${log}'\n`,
  );
  chmodSync(path, 0o755);
  return { path, log };
}

async function startReview(world: AcceptanceWorld, args: string[] = []): Promise<ReviewRun> {
  const launcher = writeLauncher(world, failingLauncher.has(world));
  const cli = world.cliStart(['review', ...args], { BROWSER: launcher.path });
  const run: ReviewRun = { cli, launcherLog: launcher.log };
  runs.set(world, [...runsOf(world), run]);
  const match = await cli.waitForStdout(/^Review address: (http:\/\/\S+)$/m);
  run.address = match[1];
  run.snapshotId = /^Snapshot: (s-[0-9a-f]{64})$/m.exec(cli.stdout())?.[1];
  assert.ok(run.snapshotId, `no snapshot ID in: ${cli.stdout()}`);
  return run;
}

/** Waits until the launcher double has recorded an address (it runs after the address is printed). */
async function openedByLauncher(run: ReviewRun): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (existsSync(run.launcherLog)) {
      const line = readFileSync(run.launcherLog, 'utf8').split(/\r?\n/).find(Boolean);
      if (line) return line.trim();
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('the browser launcher was not asked to open an address');
}

function assertLoopbackPort(address: string): number {
  const url = new URL(address);
  assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), `address host: ${url.hostname}`);
  const port = Number(url.port);
  assert.ok(Number.isInteger(port) && port > 0, `address port: ${url.port}`);
  return port;
}

/** Opens the address in each browser of the run, checks the CSP and calls `check` on the page. */
async function inEachBrowser(address: string, check: (page: Page) => Promise<void>): Promise<void> {
  for (const kind of browserKindsFor()) {
    const browser = await launchBrowser(kind);
    try {
      const page = await browser.newPage();
      const csp = await watchCspViolations(page);
      await page.goto(address);
      await check(page).catch((error: unknown) => {
        throw new Error(`in ${kind}: ${error instanceof Error ? error.message : String(error)}`);
      });
      await csp.assertNone();
    } finally {
      await browser.close();
    }
  }
}

async function showsSnapshot(page: Page, snapshotId: string): Promise<void> {
  await page.getByText(`Review of snapshot ${snapshotId}`, { exact: false }).waitFor({
    timeout: 30_000,
  });
}

/** A repository change of `files` new files with `lines` added lines in all. */
function writeChange(world: AcceptanceWorld, files: number, lines: number): void {
  const repo = world.fixture('fx-intake');
  mkdirSync(repo.path('src/gen'), { recursive: true });
  for (let i = 0; i < files; i++) {
    const count = Math.floor(lines / files) + (i < lines % files ? 1 : 0);
    const body = Array.from({ length: count }, (_, n) => `export const v${i}_${n} = ${n};`);
    repo.write(`src/gen/file${i}.ts`, `${body.join('\n')}\n`);
  }
  repo.stage('src/gen');
}

After(async function (this: AcceptanceWorld) {
  // `review` exits 0 when it is interrupted (C001-REQ-914): a run that does not fails its scenario.
  const failures: string[] = [];
  for (const run of runsOf(this)) {
    const result = run.cli.result ?? (await run.cli.stop());
    if (result.status !== 0) failures.push(`review exited ${result.status}: ${result.stderr}`);
  }
  assert.deepEqual(failures, []);
});

// C001-TS-901

Given(
  'a git repository whose change has {int} changed files and {int} changed lines',
  function (this: AcceptanceWorld, files: number, lines: number) {
    writeChange(this, files, lines);
  },
);

When(
  'the developer runs the review command of the CLI in that repository',
  async function (this: AcceptanceWorld) {
    await startReview(this);
  },
);

Then(
  'intake creates snapshot {string} and the analysis of {string} completes',
  async function (this: AcceptanceWorld, name: string, again: string) {
    assert.equal(name, again);
    const run = lastRun(this);
    names.set(this, new Map(names.get(this)).set(name, run.snapshotId!));
    // The command prints its address only after the analysis ended: no job is left running.
    assert.match(run.cli.stderr(), /review: running the analysis/);
    const opened = await openCore(this.repo!.dir, { env: this.cliEnv() });
    try {
      const reviews = await opened.core.api.listReviews();
      assert.deepEqual(
        reviews.map((r) => r.snapshotId),
        [run.snapshotId],
      );
      const jobs = await opened.core.api.listJobs(run.snapshotId!);
      assert.deepEqual(
        jobs.filter((j) => ['pending', 'running'].includes(j.status)),
        [],
      );
      const summary = await opened.core.api.getIntakeSummary(run.snapshotId!);
      assert.ok(summary.changedFiles >= 1);
    } finally {
      await opened.close();
    }
  },
);

Then(
  'the browser launcher is asked to open an address on 127.0.0.1 or ::1 port <port>',
  async function (this: AcceptanceWorld) {
    const run = lastRun(this);
    const opened = await openedByLauncher(run);
    assertLoopbackPort(opened);
    assert.equal(opened, run.address, 'the launcher got another address than the one printed');
  },
);

Then(
  'the page at that address shows the review of snapshot {string}',
  async function (this: AcceptanceWorld, name: string) {
    const run = lastRun(this);
    const id = names.get(this)?.get(name) ?? run.snapshotId!;
    await inEachBrowser(run.address!, async (page) => {
      await showsSnapshot(page, id);
      // The 12 files and 640 lines of the scenario's change.
      await page.getByText('Changed files', { exact: true }).waitFor();
      assert.match(await page.locator('main').innerText(), /Changed files\s*12/);
      assert.match(await page.locator('main').innerText(), /Changed lines\s*640/);
    });
  },
);

// C001-TS-902

Given(
  'the developer ran the review command, which created snapshot {string}',
  async function (this: AcceptanceWorld, name: string) {
    writeChange(this, 3, 30);
    const first = await startReview(this);
    names.set(this, new Map(names.get(this)).set(name, first.snapshotId!));
    const result = await first.cli.stop();
    assert.equal(result.status, 0, result.stderr);
  },
);

Given('the working tree and HEAD have not changed since', function (this: AcceptanceWorld) {
  // Nothing touches the fixture repository between the two runs of the scenario.
  assert.ok(this.repo, 'no repository');
});

When('the developer runs the review command again', async function (this: AcceptanceWorld) {
  await startReview(this);
});

Then(
  'the browser launcher opens the review of snapshot {string}',
  async function (this: AcceptanceWorld, name: string) {
    const run = lastRun(this);
    const id = names.get(this)?.get(name);
    assert.ok(id, `snapshot "${name}" was not created`);
    assert.equal(run.snapshotId, id, 'the second run opened another snapshot');
    const opened = await openedByLauncher(run);
    assertLoopbackPort(opened);
    await inEachBrowser(opened, (page) => showsSnapshot(page, id));
  },
);

Then(
  'the repository has a single review of snapshot {string}',
  async function (this: AcceptanceWorld, name: string) {
    const id = names.get(this)?.get(name);
    const opened = await openCore(this.repo!.dir, { env: this.cliEnv() });
    try {
      const reviews = await opened.core.api.listReviews();
      assert.deepEqual(
        reviews.map((r) => r.snapshotId),
        [id],
      );
    } finally {
      await opened.close();
    }
  },
);

// C001-TS-903

Given(
  'a git repository with a change and a machine on which the browser launcher fails to start a browser',
  function (this: AcceptanceWorld) {
    writeChange(this, 3, 30);
    failingLauncher.add(this);
  },
);

When('the developer runs the review command of the CLI', async function (this: AcceptanceWorld) {
  await startReview(this);
});

Then(
  'the CLI prints an address on 127.0.0.1 or ::1 port <port>',
  async function (this: AcceptanceWorld) {
    const run = lastRun(this);
    assertLoopbackPort(run.address!);
    // The notice ERR-UI-003 names the address too (it is on standard error, exit status 0).
    const deadline = Date.now() + 30_000;
    while (!run.cli.stderr().includes('ERR-UI-003') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.match(run.cli.stderr(), /^ERR-UI-003: .*\bhttp:\/\/127\.0\.0\.1:\d+\//m);
  },
);

Then(
  'a browser opened later at that address shows the review of the snapshot',
  async function (this: AcceptanceWorld) {
    const run = lastRun(this);
    await inEachBrowser(run.address!, (page) => showsSnapshot(page, run.snapshotId!));
  },
);

// C001-TS-913 — the page's own request. The sign action of the page is built by C001-T-076; until
// then the request is made by the script of the page served by the UI, in the browser, with the
// token of the page address, so the server sees what it will see from the real button: the
// browser's Origin and Sec-Fetch-Site headers of its own page.

When(
  'the developer signs intent {string} from the page served by that UI',
  async function (this: AcceptanceWorld, intent: string) {
    const s = uiSession(this);
    const kind = browserKindsFor()[0]!;
    const browser = await launchBrowser(kind);
    try {
      const page = await browser.newPage();
      await page.goto(`${s.server.origin}/#token=${s.server.token}`);
      const status = await page.evaluate(
        async ([id]) => {
          const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
          const response = await fetch(`/api/v1/intents/${id}/verdicts`, {
            method: 'POST',
            headers: { 'X-Review-Token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'sign' }),
          });
          return response.status;
        },
        [intentIdOf(intent)],
      );
      assert.equal(status, 201, `the page's own request answered ${status}`);
    } finally {
      await browser.close();
    }
  },
);

Then(
  'the review record holds a sign verdict on {string}',
  function (this: AcceptanceWorld, intent: string) {
    assert.equal(uiSession(this).review.verdicts.get(intentIdOf(intent)), 'sign');
  },
);
