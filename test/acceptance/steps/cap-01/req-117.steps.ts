import { strict as assert } from 'node:assert';
import { readFileSync, utimesSync } from 'node:fs';
import { Given, setDefaultTimeout, Then, When } from '@cucumber/cucumber';
import { binaryBytes } from '../../../fixtures/repos/fx-lfs.js';
import { indexEntry, makeRacy, sha256 } from '../../support/clean-filter.js';
import { historyOf, intakeNamingB0, snapshotNamed } from '../../support/review-history.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-117: C001-TS-139, C001-TS-140 and C001-TS-150 (C001-REQ-117) on `fx-intake`, and the
// moved-on side of C001-TS-177 (`fx-crypt`, C001-REQ-127) and C001-TS-188 (`fx-lfs`, C001-REQ-128)
// (C001-T-033). A review is made by the built CLI (`analyse --headless` naming B0); resuming it is
// `sdd-review open <snapshot-id>`, which prints the moved-on notice on standard error before it
// serves the review (C001-IF-001 `open`); asking for the decision status is `sdd-review status`
// (C001-T-082). C001-TS-138 also records a verdict on an intent: its steps come with the verdict
// commands (C001-T-076, C001-T-082).

setDefaultTimeout(90_000);

/** Makes the review S1 of the current fixture (`analyse --headless --base B0`). */
function reviewS1(world: AcceptanceWorld): string {
  const intake = intakeNamingB0(world);
  historyOf(world).names.set('S1', intake.snapshot.snapshotId);
  return intake.snapshot.snapshotId;
}

/** fx-intake with C1 and C2 on top of B0 (neither touches "src/order.ts") and HEAD at C2. */
function intakeAtC2(world: AcceptanceWorld, name: string): void {
  assert.equal(name, 'fx-intake', 'only fx-intake is automated for this step');
  const repo = world.fixture(name);
  repo.commit('C1', {
    subject: 'C1: cart totals',
    files: { 'src/cart.ts': `${repo.read('src/cart.ts')}export const total = 0;\n` },
  });
  repo.commit('C2', {
    subject: 'C2: legacy cleanup',
    files: { 'src/legacy.ts': `${repo.read('src/legacy.ts')}// c2\n` },
  });
  assert.equal(repo.git('rev-parse', 'HEAD'), repo.label('C2').hash);
  reviewS1(world);
}

Given(
  'a review of snapshot S1 of {string} with HEAD at C2',
  function (this: AcceptanceWorld, name: string) {
    intakeAtC2(this, name);
  },
);

Given(
  'a review of snapshot S1 of {string} with HEAD at C2 and no file changed since intake',
  function (this: AcceptanceWorld, name: string) {
    intakeAtC2(this, name);
  },
);

Given(
  'after intake a new commit C3 that changes {string} becomes HEAD',
  function (this: AcceptanceWorld, path: string) {
    const repo = this.repo!;
    repo.commit('C3', {
      subject: 'C3: order',
      files: { [path]: `${repo.read(path)}// c3\n` },
    });
    assert.equal(repo.git('rev-parse', 'HEAD'), repo.label('C3').hash);
  },
);

Given(
  /^after intake "([^"]+)" is edited in the working tree and then restored byte for byte to its content in S1, with a modification time 1 hour later$/,
  function (this: AcceptanceWorld, path: string) {
    const repo = this.repo!;
    const original = readFileSync(repo.path(path));
    repo.write(path, Buffer.concat([original, Buffer.from('// edited\n')]));
    repo.write(path, original);
    const later = new Date(Date.now() + 3_600_000);
    utimesSync(repo.path(path), later, later);
  },
);

// ---- C001-TS-177 and C001-TS-188: snapshots taken while a file under a clean filter was compared
// by its working-tree bytes (C001-IF-012 §7 item 3), then the index changed without a content change.

/** Asserts that S1 lists `path` as modified with these working-tree bytes as its content. */
function assertListedWithBytes(world: AcceptanceWorld, path: string, bytes: Buffer): void {
  const intake = world.headless!.json<{
    snapshot: { changedFiles: Array<{ path: string; changeType: string; contentHash: string }> };
  }>('intake.json');
  const file = intake.snapshot.changedFiles.find((f) => f.path === path);
  assert.ok(file, `S1 does not list ${path}`);
  assert.equal(file.changeType, 'modified');
  assert.equal(
    file.contentHash,
    sha256(bytes),
    `S1 does not hold the working-tree bytes of ${path}`,
  );
}

Given(
  /^a review of snapshot S1 of "(fx-crypt)", taken while the index entry of "([^"]+)" was racy, so that S1 lists "\2" as modified with its working-tree bytes$/,
  function (this: AcceptanceWorld, name: string, path: string) {
    const repo = this.fixture(name);
    makeRacy(repo, path);
    reviewS1(this);
    assertListedWithBytes(this, path, readFileSync(repo.path(path)));
  },
);

Given(
  /^after intake the developer runs `git status`, which rewrites the index so that "([^"]+)" is up to date with its blob of B0, without a change of its content$/,
  function (this: AcceptanceWorld, path: string) {
    const repo = this.repo!;
    const before = readFileSync(repo.path(path));
    repo.git('status', '--porcelain');
    assert.equal(
      indexEntry(repo, path).blob,
      repo.git('rev-parse', `${repo.label('B0').hash}:${path}`),
    );
    assert.deepEqual(readFileSync(repo.path(path)), before);
  },
);

Given(
  /^a review of snapshot S1 of "(fx-lfs)", taken while "([^"]+)" held ([\d,]+) new bytes that were not staged, so that S1 lists "\2" as modified with its working-tree bytes$/,
  function (this: AcceptanceWorld, name: string, path: string, size: string) {
    const repo = this.fixture(name);
    const bytes = binaryBytes(Number(size.replace(/,/g, '')), 7);
    repo.write(path, bytes);
    reviewS1(this);
    assertListedWithBytes(this, path, bytes);
  },
);

Given(
  /^after intake the agent stages "([^"]+)" with `git add`, without a change of its content$/,
  function (this: AcceptanceWorld, path: string) {
    const repo = this.repo!;
    const before = readFileSync(repo.path(path));
    repo.stage(path);
    assert.deepEqual(readFileSync(repo.path(path)), before);
  },
);

// ---- Resuming the review, and the notice ---------------------------------------------------------

When('the developer resumes the review of S1', async function (this: AcceptanceWorld) {
  const running = this.cliStart(['open', snapshotNamed(this, 'S1'), '--no-browser']);
  await running.waitForStdout(/Review address: http:\/\/127\.0\.0\.1:\d+\//);
  const result = await running.stop();
  assert.equal(result.status, 0, `open exited with ${result.status}: ${result.stderr}`);
  this.lastRun = result;
});

When(
  'the developer asks for the decision status of the review of S1',
  function (this: AcceptanceWorld) {
    const run = this.cli(['status', '--snapshot', snapshotNamed(this, 'S1')]);
    assert.equal(run.status, 0, `status exited with ${run.status}: ${run.stderr}`);
  },
);

interface MovedOnView {
  readonly snapshotId: string;
  readonly files: string[];
  readonly headMoved: { from: string; to: string } | null;
}

const NOTICE =
  /^ERR-INTAKE-007: The working tree has moved on since snapshot (s-[0-9a-f]{64}): (\d+) files differ \((.*?)\)(?:; HEAD moved from ([0-9a-f]+) to ([0-9a-f]+))?\. This review still shows the snapshot\.$/;

/** The moved-on notices the last command printed (standard error, `<code>: <message>`). */
function movedOnNotices(world: AcceptanceWorld): MovedOnView[] {
  const run = world.lastRun;
  assert.ok(run, 'no command was run');
  const lines = `${run.stderr}${run.stdout}`
    .split(/\r?\n/)
    .filter((l) => l.includes('ERR-INTAKE-007'));
  return lines.map((line) => {
    const m = NOTICE.exec(line);
    assert.ok(m, `ERR-INTAKE-007 does not have the catalogue form: ${line}`);
    const files = m[3] === 'none' ? [] : m[3]!.split(', ');
    assert.equal(files.length, Number(m[2]), `the count does not match the list: ${line}`);
    return {
      snapshotId: m[1]!,
      files,
      headMoved: m[4] ? { from: m[4], to: m[5]! } : null,
    };
  });
}

function theNotice(world: AcceptanceWorld): MovedOnView {
  const notices = movedOnNotices(world);
  assert.equal(notices.length, 1, `expected one moved-on notice:\n${world.lastRun?.stderr}`);
  const notice = notices[0]!;
  assert.equal(notice.snapshotId, snapshotNamed(world, 'S1'));
  return notice;
}

Then(
  /^the review assistant shows (?:a moved-on notice|the moved-on notice ERR-INTAKE-007) that names "([^"]+)"$/,
  function (this: AcceptanceWorld, path: string) {
    const notice = theNotice(this);
    assert.ok(notice.files.includes(path), `the notice names ${notice.files.join(', ')}`);
  },
);

Then('the notice states that HEAD did not move', function (this: AcceptanceWorld) {
  assert.equal(theNotice(this).headMoved, null);
});

Then(
  /^the notice states that HEAD moved from ([A-Z]\d) to ([A-Z]\d)$/,
  function (this: AcceptanceWorld, from: string, to: string) {
    assert.deepEqual(theNotice(this).headMoved, {
      from: this.repo!.label(from).hash,
      to: this.repo!.label(to).hash,
    });
  },
);

Then('the review assistant shows no moved-on notice', function (this: AcceptanceWorld) {
  const run = this.lastRun;
  assert.ok(run, 'no command was run');
  assert.deepEqual(movedOnNotices(this), [], run.stderr);
});
