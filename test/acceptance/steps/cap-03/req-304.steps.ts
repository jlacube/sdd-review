import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { idList } from '../../support/intent-context.js';
import { FX_SDD } from '../../../fixtures/repos/fx-sdd.js';
import { addOpenChange } from '../../support/intent-map.js';

// C001-TC-304: C001-TS-306 (C001-REQ-304, two open SDD changes and none named stop intake with
// ERR-SDD-001). "No snapshot is created" is the shared CAP-01 step (cap-01/intake-common.steps.ts).

Given(
  'the fixture repository {string} whose workspace also holds the open SDD change {string}',
  function (this: AcceptanceWorld, name: string, id: string) {
    const repo = this.fixture(name);
    assert.match(repo.read(`${FX_SDD.open.folder}/change.md`), /status: active/);
    addOpenChange(this, id);
  },
);

Then(
  /^intake stops with a message that lists (".+)$/,
  function (this: AcceptanceWorld, list: string) {
    const run = this.lastRun;
    assert.ok(run, 'the CLI was not run');
    const output = `${run.stderr}${run.stdout}`;
    assert.equal(run.status, 3, `exit code: ${output}`);
    assert.ok(output.includes('ERR-SDD-001'), `output does not name ERR-SDD-001: ${output}`);
    for (const id of idList(list)) assert.ok(output.includes(id), `${id} is not listed: ${output}`);
  },
);
