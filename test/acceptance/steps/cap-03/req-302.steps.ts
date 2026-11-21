import { strict as assert } from 'node:assert';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { HeadlessOutput } from '../../support/headless-output.js';
import { idList } from '../../support/intent-context.js';
import { addOpenChange, intentName, intentsOf } from '../../support/intent-map.js';
import { FX_SDD } from '../../../fixtures/repos/fx-sdd.js';

// C001-TC-302: C001-TS-303 (C001-REQ-302, the SDD change the developer names). Selection is
// C001-T-031's; the intents themselves are created by the intent mapper (C001-T-044), so the last
// step passes once the intent map of the headless output holds them. The steps on the intents of
// the review and on naming the SDD change are shared by the other CAP-03 selection scenarios.

Given(
  /^the fixture repository "([^"]+)" whose workspace also holds the open SDD change "([^"]+)" with the requirements (.+)$/,
  function (this: AcceptanceWorld, name: string, id: string, list: string) {
    const repo = this.fixture(name);
    assert.match(repo.read(`${FX_SDD.open.folder}/change.md`), /status: active/);
    addOpenChange(this, id, idList(list));
  },
);

When(
  'the developer starts a review naming commit {word} and naming the SDD change {string}',
  function (this: AcceptanceWorld, label: string, value: string) {
    const out = this.tempDir();
    const base = this.repo!.label(label).hash;
    this.cli(['analyse', '--headless', '--out', out, '--base', base, '--sdd-change', value]);
    this.headless = new HeadlessOutput(out);
  },
);

Then(
  /^the intents of the review are exactly (".+)$/,
  function (this: AcceptanceWorld, list: string) {
    const names = intentsOf(this).map(intentName).sort();
    assert.deepEqual(names, idList(list).sort());
  },
);
