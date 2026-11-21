import { strict as assert } from 'node:assert';
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Given, Then } from '@cucumber/cucumber';
import { filterCalls } from '../../../fixtures/repos/fx-lfs.js';
import {
  assertSnapshotContent,
  blobBytes,
  forgeIndexEntry,
  indexEntry,
  recordHash,
  stageNewContent,
} from '../../support/clean-filter.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-127: C001-TS-181 to C001-TS-184 (C001-REQ-127) on `fx-crypt` (C001-T-028).
// C001-TS-177 resumes a review and expects the moved-on notice: its steps come with the moved-on
// check (C001-T-033); the G-12 side of it is covered by test/integration/git/clean-filter.test.ts.

const logLines = new WeakMap<AcceptanceWorld, number>();

Given(
  /^the test has recorded the hash of "\.git\/index" and the number of lines of the filter stub's log$/,
  function (this: AcceptanceWorld) {
    recordHash(this, '.git/index');
    logLines.set(this, filterCalls(this.repo!)?.length ?? 0);
  },
);

Then("the filter stub's log holds the recorded number of lines", function (this: AcceptanceWorld) {
  const lines = logLines.get(this);
  assert.ok(lines !== undefined, 'nothing was recorded');
  assert.equal(filterCalls(this.repo!)?.length ?? 0, lines);
});

// ---- C001-TS-182 ---------------------------------------------------------------------------------

const stagedBlob = new WeakMap<AcceptanceWorld, string>();

Given(
  /^after checkout the agent wrote new content of (\d+) bytes into "([^"]+)" and staged it with `git add`, so that the index records the encrypted blob E1 of that content and the file is up to date in the index$/,
  function (this: AcceptanceWorld, n: string, path: string) {
    const repo = this.repo!;
    stageNewContent(this, path, Number(n));
    const e1 = indexEntry(repo, path).blob;
    assert.notEqual(e1, repo.git('rev-parse', `${repo.label('B0').hash}:${path}`));
    stagedBlob.set(this, e1);
  },
);

Then(
  /^the headless output holds blob E1 as the snapshot content of "([^"]+)"$/,
  function (this: AcceptanceWorld, path: string) {
    const e1 = stagedBlob.get(this);
    assert.ok(e1, 'blob E1 was not recorded');
    assertSnapshotContent(this, path, blobBytes(this.repo!, e1));
  },
);

// ---- C001-TS-183 ---------------------------------------------------------------------------------

const PLATFORMS: Record<string, readonly NodeJS.Platform[]> = {
  'Linux or macOS': ['linux', 'darwin'],
  'Windows 11': ['win32'],
  Linux: ['linux'],
  macOS: ['darwin'],
};

Given(
  /^the fixture repository "([^"]+)" with the base commit labelled (\w+), on (Linux or macOS|Windows 11|Linux|macOS)$/,
  function (this: AcceptanceWorld, name: string, label: string, system: string) {
    // The scenario states the system it runs on; on another system it is not run.
    if (!PLATFORMS[system]!.includes(process.platform)) return 'skipped';
    this.fixture(name).label(label);
    return undefined;
  },
);

Given(
  /^the repository's git configuration sets neither `core\.checkStat` nor `core\.trustctime`$/,
  function (this: AcceptanceWorld) {
    const repo = this.repo!;
    for (const key of ['core.checkStat', 'core.trustctime']) {
      assert.throws(() => repo.git('config', '--get', key), `${key} is set`);
    }
  },
);

Given(
  /^the repository's git configuration sets `(core\.\w+)` to "([^"]+)"$/,
  function (this: AcceptanceWorld, key: string, value: string) {
    this.repo!.setConfig(key, value);
  },
);

Given(
  /^the index entry of "([^"]+)" is marked with `git update-index (--assume-unchanged|--skip-worktree) ([^`]+)`$/,
  function (this: AcceptanceWorld, _path: string, flag: string, target: string) {
    this.repo!.git('update-index', flag, '--', target);
  },
);

Given(
  /^after checkout the agent rewrote "([^"]+)" in place with other bytes of the same size and set its modification time back to the value that its index entry records, so that of the compared stat fields only its change time differs from the entry$/,
  function (this: AcceptanceWorld, path: string) {
    const repo = this.repo!;
    const entry = indexEntry(repo, path);
    const old = readFileSync(repo.path(path));
    const edited = Buffer.from(old);
    edited[0] = edited[0] === 0x5a ? 0x59 : 0x5a; // same size, other bytes
    writeFileSync(repo.path(path), edited); // in place: same file, same inode
    const t = entry.mtimeSeconds + entry.mtimeNanoseconds / 1e9;
    utimesSync(repo.path(path), t, t);
  },
);

// ---- C001-TS-184 ---------------------------------------------------------------------------------

Given(
  /^"\.git\/info\/attributes" holds the line "([^"]+)"$/,
  function (this: AcceptanceWorld, line: string) {
    const dir = this.repo!.path('.git/info');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'attributes'), `${line}\n`);
  },
);

Given(
  /^the file that `core\.attributesFile` of the developer's global git configuration names holds the line "([^"]+)"$/,
  function (this: AcceptanceWorld, line: string) {
    // The CLI runs with HOME (and USERPROFILE) in a folder of the scenario: its global
    // configuration is the `.gitconfig` there.
    const home = this.cliEnv().HOME!;
    const attributes = join(home, 'global-attributes');
    writeFileSync(attributes, `${line}\n`);
    writeFileSync(
      join(home, '.gitconfig'),
      `[core]\n\tattributesFile = ${attributes.replace(/\\/g, '/')}\n`,
    );
  },
);

Given(
  /^the working tree's "\.gitattributes", edited by the change and not committed, adds the line "([^"]+)"$/,
  function (this: AcceptanceWorld, line: string) {
    this.repo!.attribute(line);
  },
);

Given(
  /^after checkout the agent added (\d+) lines to "([^"]+)" without staging them$/,
  function (this: AcceptanceWorld, n: string, path: string) {
    const repo = this.repo!;
    const lines = Array.from({ length: Number(n) }, (_, i) => `export const extra${i} = ${i};\n`);
    repo.write(path, `${repo.read(path)}${lines.join('')}`);
  },
);

Given(
  /^the (?:test|agent) then wrote "\.git\/index" so that the entry of "([^"]+)" records the (?:blob of "[^"]+" in B0|pointer blob of B0) together with the stat data of the edited file, not racy$/,
  function (this: AcceptanceWorld, path: string) {
    const repo = this.repo!;
    forgeIndexEntry(repo, path, repo.git('rev-parse', `${repo.label('B0').hash}:${path}`));
  },
);

Then(
  'the change lists {string} as modified with {int} added lines',
  function (this: AcceptanceWorld, path: string, n: number) {
    const intake = this.headless!.json<{
      snapshot: { changedFiles: Array<{ path: string; changeType: string }> };
      hunks: Array<{ path: string; lines: Array<{ kind: string }> }>;
    }>('intake.json');
    assert.equal(this.lastRun?.status, 0, this.lastRun?.stderr);
    assert.equal(intake.snapshot.changedFiles.find((f) => f.path === path)?.changeType, 'modified');
    const lines = intake.hunks.filter((h) => h.path === path).flatMap((h) => h.lines);
    assert.equal(lines.filter((l) => l.kind === 'added').length, n);
    assert.equal(lines.filter((l) => l.kind === 'deleted').length, 0);
  },
);
