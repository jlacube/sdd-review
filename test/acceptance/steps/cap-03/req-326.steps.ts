import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import { openCore } from '../../../../src/core/api/open.js';
import type { AcceptanceWorld } from '../../support/world.js';
import { FX_SDD } from '../../../fixtures/repos/fx-sdd.js';
import { intentName, intentsOf } from '../../support/intent-map.js';

// C001-TC-326: C001-TS-353, C001-TS-354 and C001-TS-355 (C001-REQ-326, a named SDD change that is
// not open in the snapshot stops intake with ERR-SDD-002). The review is started by "the developer
// starts a review naming commit B0 and naming the SDD change …" (req-302.steps.ts); the exit code
// and the review count are the shared CAP-01 steps. C001-TS-354 ends on the intents of the intent
// map, which the intent mapper creates (C001-T-044).

const TOTAL = 'src/cart/total.ts';

function openFxSdd(world: AcceptanceWorld, name: string, id: string, folder: string) {
  const repo = world.fixture(name);
  assert.equal(id, FX_SDD.open.id);
  assert.equal(folder.replace(/\/$/, ''), FX_SDD.open.folder);
  assert.match(repo.read(`${FX_SDD.open.folder}/change.md`), /status: active/);
  return repo;
}

Given(
  /^the fixture repository "([^"]+)" whose workspace holds the open SDD change "([^"]+)" in "([^"]+)" and the archived SDD change "([^"]+)" in "([^"]+)", with (\d+) reviews recorded$/,
  async function (
    this: AcceptanceWorld,
    name: string,
    open: string,
    openFolder: string,
    archived: string,
    archivedFolder: string,
    reviews: string,
  ) {
    const repo = openFxSdd(this, name, open, openFolder);
    assert.equal(archived, FX_SDD.archived.id);
    assert.equal(archivedFolder.replace(/\/$/, ''), FX_SDD.archived.folder);
    assert.match(repo.read(`${FX_SDD.archived.folder}/change.md`), /status: archived/);
    const opened = await openCore(repo.dir, { env: this.cliEnv() });
    try {
      // Each review takes in a different working tree, so each is a snapshot of its own.
      for (let i = 1; i <= Number(reviews); i++) {
        repo.write(TOTAL, `${repo.read(TOTAL)}// review ${i}\n`);
        await opened.core.api.startReview({});
      }
      assert.equal((await opened.core.api.listReviews()).length, Number(reviews));
    } finally {
      await opened.close();
    }
    // The review under test takes in the working tree of the last recorded review: the named value
    // is refused before the existing review would be reopened (architecture.md §3, intake flow).
  },
);

Given(
  'the fixture repository {string} whose open SDD change {string} lies in {string}',
  function (this: AcceptanceWorld, name: string, id: string, folder: string) {
    openFxSdd(this, name, id, folder);
  },
);

Given(
  'the fixture repository {string} whose workspace also holds the finished SDD change folder {string} with {string} of status {string}',
  function (this: AcceptanceWorld, name: string, folder: string, file: string, status: string) {
    const repo = this.fixture(name);
    assert.match(repo.read(`${FX_SDD.open.folder}/change.md`), /status: active/);
    assert.match(folder, /^\.sdd\/_archive\//);
    repo.write(
      `${folder.replace(/\/$/, '')}/${file}`,
      `---\nid: "CHG-040"\ntitle: "Promo"\nstatus: ${status}\n---\n`,
    );
  },
);

/** The output of the last CLI run, after checking that it stopped with ERR-SDD-002. */
function stoppedWithSdd002(world: AcceptanceWorld): string {
  const run = world.lastRun;
  assert.ok(run, 'the CLI was not run');
  const output = `${run.stderr}${run.stdout}`;
  assert.equal(run.status, 3, `exit code: ${output}`);
  assert.ok(output.includes('ERR-SDD-002'), `output does not name ERR-SDD-002: ${output}`);
  return output;
}

Then(
  'the error message names {string} and lists the open SDD change {string}',
  function (this: AcceptanceWorld, value: string, id: string) {
    const output = stoppedWithSdd002(this);
    assert.ok(
      output.includes(`No open SDD change "${value}"`),
      `"${value}" is not named: ${output}`,
    );
    assert.ok(output.includes(`Open SDD changes: ${id}.`), `${id} is not listed: ${output}`);
  },
);

Then(
  'intake stops with the error ERR-SDD-002 that names {string}',
  function (this: AcceptanceWorld, value: string) {
    const output = stoppedWithSdd002(this);
    assert.ok(
      output.includes(`No open SDD change "${value}"`),
      `"${value}" is not named: ${output}`,
    );
  },
);

Then('intake completes without the error {word}', function (this: AcceptanceWorld, code: string) {
  const run = this.lastRun;
  assert.ok(run, 'the CLI was not run');
  const output = `${run.stderr}${run.stdout}`;
  assert.equal(run.status, 0, `exit code ${run.status}: ${output}`);
  assert.equal(output.includes(code), false, `output names ${code}: ${output}`);
});

Then(
  'the intents of the review are exactly the {int} requirements of {string}',
  function (this: AcceptanceWorld, n: number, id: string) {
    const intake = this.headless!.json<{
      intentContext: {
        sddChanges: Array<{ id: string; items: Array<{ id: string; kind: string }> }>;
      };
    }>('intake.json');
    const change = intake.intentContext.sddChanges.find((c) => c.id === id);
    assert.ok(change, `${id} is not in the intent context`);
    const requirements = change.items.filter((i) => i.kind === 'requirement').map((i) => i.id);
    assert.equal(requirements.length, n, `requirements of ${id}: ${requirements.join(', ')}`);
    assert.deepEqual(intentsOf(this).map(intentName).sort(), requirements.sort());
  },
);
