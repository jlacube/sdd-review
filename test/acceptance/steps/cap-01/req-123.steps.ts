import { strict as assert } from 'node:assert';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { HeadlessOutput } from '../../support/headless-output.js';
import { allItems, intakeOf } from '../../support/intent-context.js';
import { FX_SDD } from '../../../fixtures/repos/fx-sdd.js';

// C001-TC-123: C001-TS-151, C001-TS-152, C001-TS-153 (an unreadable `.sdd/` entry is left out with
// notice ERR-SDD-005). C001-TS-161 needs the architecture delta (C001-T-039).

function openFxSdd(world: AcceptanceWorld, name: string, change: string, folder?: string) {
  const repo = world.fixture(name);
  assert.equal(change, FX_SDD.open.id);
  if (folder !== undefined) assert.equal(folder.replace(/\/$/, ''), FX_SDD.open.folder);
  assert.match(repo.read(`${FX_SDD.open.folder}/change.md`), /status: active/);
  return repo;
}

Given(
  /^the fixture repository "([^"]+)" whose snapshot holds the open SDD change "([^"]+)" in the folder "([^"]+)" with the requirements (\S+) and (\S+)$/,
  function (
    this: AcceptanceWorld,
    name: string,
    change: string,
    folder: string,
    r1: string,
    r2: string,
  ) {
    const repo = openFxSdd(this, name, change, folder);
    const requirements = repo.read(FX_SDD.requirements);
    assert.ok(requirements.includes(`### ${r1} — `) && requirements.includes(`### ${r2} — `));
  },
);

Given(
  'the fixture repository {string} whose snapshot holds the open SDD change {string} in {string}',
  function (this: AcceptanceWorld, name: string, change: string, folder: string) {
    openFxSdd(this, name, change, folder);
  },
);

Given(
  'the fixture repository {string} whose snapshot holds the open SDD change {string}',
  function (this: AcceptanceWorld, name: string, change: string) {
    openFxSdd(this, name, change);
  },
);

Given(
  'the task file {string} starts with a frontmatter block whose line 2 is {string}',
  function (this: AcceptanceWorld, file: string, line2: string) {
    this.repo!.write(
      file,
      `---\n${line2}\ntitle: Cart total\nimplements: [C042-REQ-003]\n---\nbody\n`,
    );
  },
);

Given(
  'the task file {string} starts with a YAML frontmatter block that has no {string} key',
  function (this: AcceptanceWorld, file: string, key: string) {
    assert.equal(key, 'id');
    this.repo!.write(file, '---\ntitle: Cart rounding\nimplements: [C042-REQ-003]\n---\nbody\n');
  },
);

Given(
  'the snapshot holds the folder {string} whose {string} starts with a frontmatter block that is not YAML',
  function (this: AcceptanceWorld, folder: string, file: string) {
    // Line 1 opens the block; line 2 is not YAML (a flow sequence that is never closed).
    this.repo!.write(
      `${folder.replace(/\/$/, '')}/${file}`,
      '---\nid: [CHG-043\ntitle: Promo\nstatus: active\n---\n\n# CHG-043 — Promo\n',
    );
    this.repo!.write(
      `${folder.replace(/\/$/, '')}/10-spec/20-capabilities/CAP-01-promo/requirements.md`,
      '### C043-REQ-001 — Promo codes\n- **Statement:** THE cart SHALL take promo codes.\n',
    );
  },
);

Given(
  /^its "([^"]+)" holds, besides (\S+) and (\S+), the heading "([^"]+)"$/,
  function (this: AcceptanceWorld, file: string, r1: string, r2: string, heading: string) {
    assert.equal(file, 'requirements.md');
    const repo = this.repo!;
    const text = repo.read(FX_SDD.requirements);
    assert.ok(text.includes(`### ${r1} — `) && text.includes(`### ${r2} — `));
    repo.write(FX_SDD.requirements, `${text}\n${heading}\n\nTo be settled with the shop owner.\n`);
  },
);

When(
  'the developer starts a review naming commit {word} without naming an SDD change',
  function (this: AcceptanceWorld, label: string) {
    const out = this.tempDir();
    this.cli(['analyse', '--headless', '--out', out, '--base', this.repo!.label(label).hash]);
    this.headless = new HeadlessOutput(out);
  },
);

Then('intake completes and creates a snapshot', function (this: AcceptanceWorld) {
  const intake = intakeOf(this) as unknown as { snapshot?: { snapshotId?: string } };
  assert.match(intake.snapshot?.snapshotId ?? '', /^s-[0-9a-f]{64}$/);
});

Then(
  'intake completes with {string} as the selected SDD change and without the error {word}',
  function (this: AcceptanceWorld, change: string, code: string) {
    const intake = intakeOf(this);
    const selected = intake.intakeSummary.intentContext.sddChanges.filter((c) => c.selected);
    assert.deepEqual(
      selected.map((c) => c.id),
      [change],
    );
    assert.equal(`${this.lastRun!.stderr}${this.lastRun!.stdout}`.includes(code), false);
  },
);

Then(
  'the intent context in the headless output holds no spec item of {string}',
  function (this: AcceptanceWorld, folder: string) {
    const prefix = folder.endsWith('/') ? folder : `${folder}/`;
    const intake = intakeOf(this);
    for (const change of intake.intentContext.sddChanges) {
      assert.equal(`${change.location}/`.startsWith(prefix), false, `${change.id} is read`);
    }
    for (const item of allItems(intake)) {
      assert.equal(item.location?.path.startsWith(prefix) ?? false, false, `${item.id} is read`);
    }
  },
);

Then('it holds no spec item read from {string}', function (this: AcceptanceWorld, file: string) {
  for (const item of allItems(intakeOf(this))) {
    assert.notEqual(item.location?.path, file, `${item.id} is read from ${file}`);
  }
});

function noticeNaming(world: AcceptanceWorld, code: string, file: string, line: number) {
  const notices = intakeOf(world).notices.filter((n) => n.code === code);
  const notice = notices.find((n) => n.message.includes(`"${file}" line ${line}:`));
  assert.ok(notice, `no ${code} naming "${file}" line ${line}: ${JSON.stringify(notices)}`);
  // The CLI prints the intake notices on standard error too.
  assert.ok(world.lastRun!.stderr.includes(notice.message), 'the notice is not printed');
  return notice;
}

Then(
  'intake reports the notice {word} that names {string}, line {int} and a reason',
  function (this: AcceptanceWorld, code: string, file: string, line: number) {
    const notice = noticeNaming(this, code, file, line);
    assert.match(notice.message, /line \d+: \S.*\.$/);
  },
);

Then(
  'intake reports the notice {word} that names {string}, line {int} and the reason {string}',
  function (this: AcceptanceWorld, code: string, file: string, line: number, reason: string) {
    const notice = noticeNaming(this, code, file, line);
    assert.ok(notice.message.includes(`line ${line}: ${reason}`), notice.message);
  },
);

Then('intake reports no notice {word}', function (this: AcceptanceWorld, code: string) {
  const intake = intakeOf(this);
  assert.deepEqual(
    intake.notices.filter((n) => n.code === code),
    [],
  );
  assert.equal(this.lastRun!.stderr.includes(`${code}:`), false);
});

Then(
  /^the intent context in the headless output holds exactly the requirements (\S+) and (\S+)$/,
  function (this: AcceptanceWorld, r1: string, r2: string) {
    const ids = allItems(intakeOf(this))
      .filter((i) => i.kind === 'requirement')
      .map((i) => i.id)
      .sort();
    assert.deepEqual(ids, [r1, r2].sort());
  },
);
