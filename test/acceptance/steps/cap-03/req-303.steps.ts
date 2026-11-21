import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { idList } from '../../support/intent-context.js';
import { FX_SDD, FX_SDD_ARCHIVED_COMMITS } from '../../../fixtures/repos/fx-sdd.js';
import { intentName, intentsOf } from '../../support/intent-map.js';

// C001-TC-303: C001-TS-304 (the only open SDD change applies) and C001-TS-305 (no open SDD change:
// intent fallback), C001-REQ-303. The review is started by "the developer starts a review naming
// commit B0 without naming an SDD change" (cap-01/req-123.steps.ts). Both scenarios end on the
// intents of the intent map, which the intent mapper creates (C001-T-044).

Given(
  'the fixture repository {string} whose workspace also holds the archived SDD change {string}',
  function (this: AcceptanceWorld, name: string, id: string) {
    const repo = this.fixture(name);
    assert.equal(id, FX_SDD.archived.id);
    assert.match(repo.read(`${FX_SDD.open.folder}/change.md`), /status: active/);
    assert.match(repo.read(`${FX_SDD.archived.folder}/change.md`), /status: archived/);
  },
);

Given(
  /^the fixture repository "([^"]+)" whose workspace holds only the archived SDD change "([^"]+)" and whose change has the commits C1 "([^"]+)" and C2 "([^"]+)"$/,
  function (this: AcceptanceWorld, name: string, id: string, c1: string, c2: string) {
    const repo = this.fixture(name);
    assert.equal(id, FX_SDD.archived.id);
    assert.match(repo.read(`${FX_SDD.archived.folder}/change.md`), /status: archived/);
    assert.equal(
      repo.git('ls-files', '--', '.sdd/*/change.md'),
      `${FX_SDD.archived.folder}/change.md`,
    );
    assert.deepEqual([c1, c2], [FX_SDD_ARCHIVED_COMMITS.C1, FX_SDD_ARCHIVED_COMMITS.C2]);
    assert.equal(repo.git('log', '-1', '--format=%s', repo.label('C2').hash), c2);
  },
);

Then(
  /^the intents of the review are the extracted intents (".+)$/,
  function (this: AcceptanceWorld, list: string) {
    const intents = intentsOf(this);
    assert.ok(
      intents.every((i) => i.kind === 'extracted-commit'),
      `intents of other kinds: ${intents.map((i) => i.kind).join(', ')}`,
    );
    assert.deepEqual(intents.map(intentName).sort(), idList(list).sort());
  },
);
