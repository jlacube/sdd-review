import { strict as assert } from 'node:assert';
import { readFileSync, utimesSync } from 'node:fs';
import { AfterStep, BeforeStep, Given, Then } from '@cucumber/cucumber';
import { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import { FX_INTAKE_FILES } from '../../../fixtures/repos/fx-intake.js';
import {
  binaryBytes,
  buildFilterFixture,
  filterCalls,
  settleTimes,
} from '../../../fixtures/repos/fx-lfs.js';
import {
  assertNamed,
  assertSnapshotContent,
  blobBytes,
  makeRacy,
  recordedHashes,
  recordHash,
  sha256,
  stageNewContent,
  cleanFilterNotices,
  count,
  intakeDoc,
  listed,
  theCleanFilterNotice,
} from '../../support/clean-filter.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-126: C001-TS-167 (C001-REQ-126) with C001-TS-168 to C001-TS-173, C001-TS-176,
// C001-TS-179, C001-TS-180 and C001-TS-190, on `fx-lfs`, `fx-crypt` and `fx-intake` (C001-T-028).
// The steps shared with C001-REQ-127 and C001-REQ-128 are defined here once.

// ---- The filter stub's log stays as it was during every review (C001-IF-012 §2 item 2) ---------

const callsBefore = new WeakMap<AcceptanceWorld, number>();
const isReviewStep = (text: string) => text.startsWith('the developer starts a review');

BeforeStep(function (this: AcceptanceWorld, { pickleStep }) {
  const calls = this.repo ? filterCalls(this.repo) : undefined;
  if (calls && isReviewStep(pickleStep.text)) callsBefore.set(this, calls.length);
});

AfterStep(function (this: AcceptanceWorld, { pickleStep }) {
  const before = callsBefore.get(this);
  if (before === undefined || !isReviewStep(pickleStep.text)) return;
  callsBefore.delete(this);
  const calls = filterCalls(this.repo!) ?? [];
  assert.deepEqual(calls.slice(before), [], 'the review ran a filter (the filter stub logged it)');
});

// ---- States ------------------------------------------------------------------------------------

Given(
  /^after checkout the agent wrote ([\d,]+) new bytes into "([^"]+)" without staging them$/,
  function (this: AcceptanceWorld, n: string, path: string) {
    this.repo!.write(path, binaryBytes(count(n), 7));
  },
);

Given(
  /^after checkout the agent wrote ([\d,]+) new bytes into "([^"]+)" and then ran `git update-index --assume-unchanged ([^`]+)`$/,
  function (this: AcceptanceWorld, n: string, path: string, flagged: string) {
    this.repo!.write(path, binaryBytes(count(n), 7));
    this.repo!.git('update-index', '--assume-unchanged', '--', flagged);
  },
);

Given(
  /^"([^"]+)" holds the content that the smudge filter wrote at checkout, and its stat data equal its index entry$/,
  function (this: AcceptanceWorld, path: string) {
    // The fixture's state (the builder settles the time stamps before git records the files),
    // checked without running a filter: the entry records the size of the decrypted content.
    const repo = this.repo!;
    const size = readFileSync(repo.path(path)).length;
    assert.match(repo.git('ls-files', '-s', '--debug', '--', path), new RegExp(`size: ${size}\\t`));
  },
);

Given(
  'the modification time of {string} is set 1 hour later with its content unchanged since checkout',
  function (this: AcceptanceWorld, path: string) {
    const later = new Date(Date.now() + 3_600_000);
    utimesSync(this.repo!.path(path), later, later);
  },
);

Given(
  /^the fixture repository "fx-lfs" whose base commit B0 holds the Git LFS pointer files of (\d+) files, numbered from "assets\/f01\.bin" on, checked out with their content$/,
  function (this: AcceptanceWorld, n: string) {
    const base: Record<string, Buffer> = {};
    for (let i = 1; i <= Number(n); i++) {
      base[`assets/f${String(i).padStart(2, '0')}.bin`] = binaryBytes(256 + i, 20 + i);
    }
    this.repo = buildFilterFixture({}, { base });
  },
);

Given(
  /^after checkout each of the (\d+) files was rewritten with new content without staging$/,
  function (this: AcceptanceWorld, n: string) {
    for (let i = 1; i <= Number(n); i++) {
      this.repo!.write(`assets/f${String(i).padStart(2, '0')}.bin`, binaryBytes(300 + i, 50 + i));
    }
  },
);

Given(
  /^the fixture repository "fx-intake" whose base commit B0 holds a `\.gitattributes` file that gives "([^"]+)", and whose git configuration sets `filter\.audit\.clean` and `filter\.audit\.smudge` to a program that copies its input to its output and creates the file "([^"]+)" in the working-tree root$/,
  function (this: AcceptanceWorld, attribute: string, marker: string) {
    const repo = FixtureRepo.create();
    this.repo = repo;
    const files: Record<string, string> = {
      ...FX_INTAKE_FILES,
      '.gitattributes': `${attribute}\n`,
      'data/rates.csv': 'currency,rate\nEUR,1\n',
      'data/prices.csv': 'item,price\napple,3\n',
    };
    for (const [path, content] of Object.entries(files)) repo.write(path, content);
    settleTimes(repo, Object.keys(files));
    // Committed before the filter is configured: the program copies, so git stores the same blobs.
    repo.commit('B0', { subject: 'B0: base' });
    const command = `cat; : > "${repo.dir.replace(/\\/g, '/')}/${marker}"`;
    repo.setConfig('filter.audit.clean', command);
    repo.setConfig('filter.audit.smudge', command);
  },
);

Given(
  /^the index records "([^"]+)" as up to date, and "([^"]+)" was edited after checkout without staging$/,
  function (this: AcceptanceWorld, _upToDate: string, edited: string) {
    this.repo!.write(edited, `${this.repo!.read(edited)}pear,5\n`);
  },
);

Given(
  /^the fixture repository "fx-lfs" whose base commit B0 holds "([^"]+)" as its binary content of (\d+) bytes, committed before the `\.gitattributes` line put "\*\.bin" under Git LFS, so that its blob is not a Git LFS pointer file$/,
  function (this: AcceptanceWorld, path: string, n: string) {
    this.repo = buildFilterFixture({}, { raw: { [path]: binaryBytes(Number(n), 3) } });
  },
);

Given(
  /^after checkout the agent wrote (\d+) other binary bytes into "([^"]+)" without staging them$/,
  function (this: AcceptanceWorld, n: string, path: string) {
    this.repo!.write(path, binaryBytes(Number(n), 9));
  },
);

const added = new WeakMap<AcceptanceWorld, Map<string, Buffer>>();

Given(
  /^the agent created "([^"]+)" with ([\d,]+) binary bytes and "([^"]+)" with ([\d,]+) bytes, neither staged nor excluded by an ignore rule, so that B0 holds no file at either path and git's index holds no entry for either$/,
  function (this: AcceptanceWorld, p1: string, n1: string, p2: string, n2: string) {
    const files = new Map<string, Buffer>([
      [p1, binaryBytes(count(n1), 11)],
      [p2, Buffer.from('N'.repeat(count(n2) - 1) + '\n')],
    ]);
    for (const [path, bytes] of files) this.repo!.write(path, bytes);
    added.set(this, files);
  },
);

Given(
  /^after checkout the agent wrote new content of (\d+) bytes into "([^"]+)" and staged it with `git add`, so that the file is up to date in the index$/,
  function (this: AcceptanceWorld, n: string, path: string) {
    stageNewContent(this, path, Number(n));
  },
);

Given(
  /^the loose object of the blob that the index entry of "([^"]+)" names was then deleted from the object database$/,
  function (this: AcceptanceWorld, path: string) {
    const repo = this.repo!;
    const blob = repo.git('rev-parse', `:${path}`);
    repo.remove(`.git/objects/${blob.slice(0, 2)}/${blob.slice(2)}`);
    assert.throws(() => repo.git('cat-file', '-e', blob));
  },
);

Given(
  /^the agent then ran `git rm --cached ([^`]+)`, so that the index holds no entry for it$/,
  function (this: AcceptanceWorld, path: string) {
    this.repo!.git('rm', '-q', '--cached', '--', path);
  },
);

// ---- Outcomes ----------------------------------------------------------------------------------

Then('the change lists {string} as modified', function (this: AcceptanceWorld, path: string) {
  assert.equal(listed(this, path).changeType, 'modified');
});

Then(
  'the change lists {string} and {string} as added',
  function (this: AcceptanceWorld, p1: string, p2: string) {
    assert.equal(listed(this, p1).changeType, 'added');
    assert.equal(listed(this, p2).changeType, 'added');
  },
);

Then(
  /^the change lists "([^"]+)" as modified, with its (?:decrypted|rewritten) working-tree bytes as its snapshot content$/,
  function (this: AcceptanceWorld, path: string) {
    assert.equal(listed(this, path).changeType, 'modified');
    assertSnapshotContent(this, path, readFileSync(this.repo!.path(path)));
  },
);

Then(
  /^the headless output holds the (?:edited )?([\d,]+) working-tree bytes as the snapshot content of "([^"]+)"$/,
  function (this: AcceptanceWorld, n: string, path: string) {
    const bytes = readFileSync(this.repo!.path(path));
    assert.equal(bytes.length, count(n));
    assertSnapshotContent(this, path, bytes);
  },
);

Then(
  /^the headless output holds the ([\d,]+) and the ([\d,]+) working-tree bytes as the snapshot content of "([^"]+)" and "([^"]+)"$/,
  function (this: AcceptanceWorld, n1: string, n2: string, p1: string, p2: string) {
    for (const [n, path] of [
      [n1, p1],
      [n2, p2],
    ] as const) {
      const bytes = added.get(this)?.get(path) ?? readFileSync(this.repo!.path(path));
      assert.equal(bytes.length, count(n));
      assertSnapshotContent(this, path, bytes);
    }
  },
);

Then(
  /^intake reports the notice ERR-INTAKE-009 that names the count (\d+), the filter driver "([^"]+)" and "([^"]+)" with the cause "([^"]+)"$/,
  function (this: AcceptanceWorld, n: string, driver: string, path: string, cause: string) {
    const notice = theCleanFilterNotice(this);
    assert.equal(notice.count, Number(n));
    assert.deepEqual(notice.drivers, [driver]);
    assertNamed(notice, path, cause, driver);
  },
);

Then(
  /^intake reports the notice ERR-INTAKE-009 that names "([^"]+)" with the filter driver "([^"]+)" and the cause "([^"]+)"$/,
  function (this: AcceptanceWorld, path: string, driver: string, cause: string) {
    assertNamed(theCleanFilterNotice(this), path, cause, driver);
  },
);

Then(
  /^intake reports the notice ERR-INTAKE-009 that names "([^"]+)" with the cause "([^"]+)"$/,
  function (this: AcceptanceWorld, path: string, cause: string) {
    assertNamed(theCleanFilterNotice(this), path, cause);
  },
);

Then(
  /^intake reports the notice ERR-INTAKE-009 that names the filter driver "([^"]+)" and "([^"]+)" with the cause "([^"]+)"$/,
  function (this: AcceptanceWorld, driver: string, path: string, cause: string) {
    assertNamed(theCleanFilterNotice(this), path, cause, driver);
  },
);

Then(
  /^intake reports one notice ERR-INTAKE-009 that names the count (\d+), the filter driver "([^"]+)" and (?:each of the|exactly 10 of the) (\d+) paths, each with the cause "([^"]+)"$/,
  function (this: AcceptanceWorld, n: string, driver: string, total: string, cause: string) {
    const notice = theCleanFilterNotice(this);
    assert.equal(notice.count, Number(n));
    assert.deepEqual(notice.drivers, [driver]);
    const all = Array.from(
      { length: Number(total) },
      (_, i) => `assets/f${String(i + 1).padStart(2, '0')}.bin`,
    );
    assert.equal(notice.entries.length, 10);
    for (const entry of notice.entries) {
      assert.ok(all.includes(entry.path), `unexpected path ${entry.path}`);
      assert.equal(entry.cause, cause);
    }
    assert.equal(new Set(notice.entries.map((e) => e.path)).size, 10);
  },
);

Then(
  /^the change lists each of the (\d+) files as modified$/,
  function (this: AcceptanceWorld, n: string) {
    for (let i = 1; i <= Number(n); i++) {
      assert.equal(
        listed(this, `assets/f${String(i).padStart(2, '0')}.bin`).changeType,
        'modified',
      );
    }
  },
);

Then(
  /^intake reports one notice ERR-INTAKE-009 that names the count (\d+) and the filter drivers "([^"]+)" and "([^"]+)"$/,
  function (this: AcceptanceWorld, n: string, d1: string, d2: string) {
    const notice = theCleanFilterNotice(this);
    assert.equal(notice.count, Number(n));
    assert.deepEqual([...notice.drivers].sort(), [d1, d2].sort());
  },
);

Then(
  /^the notice names "([^"]+)" with the cause "([^"]+)" and "([^"]+)" with the cause "([^"]+)"$/,
  function (this: AcceptanceWorld, p1: string, c1: string, p2: string, c2: string) {
    const notice = theCleanFilterNotice(this);
    assertNamed(notice, p1, c1);
    assertNamed(notice, p2, c2);
  },
);

Then(
  /^intake reports one notice ERR-INTAKE-009 that names the count (\d+), only the filter driver "([^"]+)" and "([^"]+)" with the cause "([^"]+)"$/,
  function (this: AcceptanceWorld, n: string, driver: string, path: string, cause: string) {
    const notice = theCleanFilterNotice(this);
    assert.equal(notice.count, Number(n));
    assert.deepEqual(notice.drivers, [driver]);
    assert.equal(notice.entries.length, 1);
    assertNamed(notice, path, cause);
  },
);

Then(
  /^the notice names neither "([^"]+)" nor "([^"]+)"$/,
  function (this: AcceptanceWorld, p1: string, p2: string) {
    for (const notice of cleanFilterNotices(this)) {
      assert.equal(notice.message.includes(p1), false);
      assert.equal(notice.message.includes(p2), false);
    }
  },
);

Then(
  /^the change lists exactly (\d+) changed file, "([^"]+)"$/,
  function (this: AcceptanceWorld, n: string, path: string) {
    const files = intakeDoc(this).snapshot.changedFiles.map((f) => f.path);
    assert.deepEqual(files, [path].slice(0, Number(n)), `listed: ${files.join(', ')}`);
  },
);

Given(/^"([^"]+)" adds (\d+) lines$/, function (this: AcceptanceWorld, path: string, n: string) {
  const repo = this.repo!;
  const lines = Array.from({ length: Number(n) }, (_, i) => `export const added${i} = ${i};\n`);
  repo.write(path, `${repo.read(path)}${lines.join('')}`);
});

Given('the test has recorded the hash of {string}', function (this: AcceptanceWorld, file: string) {
  recordHash(this, file);
});

Then(
  'the hash of {string} is identical to the recorded hash',
  function (this: AcceptanceWorld, file: string) {
    const recorded = recordedHashes.get(this)?.get(file);
    assert.ok(recorded, `no hash of ${file} was recorded`);
    assert.equal(sha256(readFileSync(this.repo!.path(file))), recorded);
  },
);

Given(
  /^the modification time that the index entry of "([^"]+)" records is equal to the modification time of the index file, so that the entry is racy$/,
  function (this: AcceptanceWorld, path: string) {
    makeRacy(this.repo!, path);
  },
);

Given(
  /^the fixture repository "(fx-lfs)" whose "([^"]+)" was checked out without running the smudge filter, so that the working tree holds the pointer file that B0 holds$/,
  function (this: AcceptanceWorld, name: string, path: string) {
    const repo = this.fixture(name);
    repo.write(path, blobBytes(repo, `${repo.label('B0').hash}:${path}`));
  },
);

Given(
  /^the modification time of "([^"]+)" is set 1 hour later, so that its index entry is not up to date$/,
  function (this: AcceptanceWorld, path: string) {
    const later = new Date(Date.now() + 3_600_000);
    utimesSync(this.repo!.path(path), later, later);
  },
);

Then(
  'the change lists {string} as modified and does not list {string}',
  function (this: AcceptanceWorld, modified: string, absent: string) {
    assert.equal(listed(this, modified).changeType, 'modified');
    const files = intakeDoc(this).snapshot.changedFiles.map((f) => f.path);
    assert.equal(files.includes(absent), false, `${absent} is listed`);
  },
);
