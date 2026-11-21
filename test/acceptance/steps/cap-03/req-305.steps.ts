import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { idList } from '../../support/intent-context.js';
import { expectedHunks, intentName, intentsOf, orphanHunksOf } from '../../support/intent-map.js';
import { FX_SDD_EMPTY } from '../../../fixtures/repos/fx-nosdd.js';

// C001-TC-305: C001-TS-307 and C001-TS-308 (C001-REQ-305, one intent per requirement of the SDD
// change), C001-T-044. The review is started by "the developer starts a review naming commit B0"
// (cap-01/req-101.steps.ts). The steps on the intent count and on orphan code are shared with
// C001-TS-330 (req-313.steps.ts).

Given('the fixture repository {string}', function (this: AcceptanceWorld, name: string) {
  this.fixture(name);
});

Given(
  /^the fixture repository "(fx-sdd-empty)" whose only open SDD change "([^"]+)" holds 0 requirements and whose change has (\d+) hunks$/,
  function (this: AcceptanceWorld, name: string, id: string, hunks: string) {
    const repo = this.fixture(name);
    assert.equal(id, FX_SDD_EMPTY.id);
    assert.match(repo.read(`${FX_SDD_EMPTY.folder}/change.md`), /status: active/);
    assert.equal(
      repo.git('ls-files', '--', '.sdd/*/change.md'),
      `${FX_SDD_EMPTY.folder}/change.md`,
    );
    const specFiles = repo.git('ls-files', '--', '.sdd').split('\n');
    assert.ok(!specFiles.some((f) => /requirements\.md$|spec\.md$/.test(f)), specFiles.join(', '));
    expectedHunks.set(this, Number(hunks));
  },
);

Then(
  /^the intent map holds (\d+) intents, one for each of (".+)$/,
  function (this: AcceptanceWorld, count: string, list: string) {
    const intents = intentsOf(this);
    assert.equal(intents.length, Number(count), `intents: ${intents.map(intentName).join(', ')}`);
    assert.ok(intents.every((i) => i.kind === 'spec-requirement'));
    assert.deepEqual(intents.map(intentName).sort(), idList(list).sort());
  },
);

Then(/^it holds no intent for (".+)$/, function (this: AcceptanceWorld, list: string) {
  const ids = idList(list.replace(/\s+or\s+/g, ', '));
  const intents = intentsOf(this);
  for (const id of ids) {
    assert.ok(
      !intents.some((i) => i.source.reference === id || intentName(i) === id),
      `an intent comes from ${id}`,
    );
  }
});

Then('the intent map holds {int} intents', function (this: AcceptanceWorld, n: number) {
  const intents = intentsOf(this);
  assert.equal(intents.length, n, `intents: ${intents.map(intentName).join(', ')}`);
});

Then('orphan code holds the {int} hunks', function (this: AcceptanceWorld, n: number) {
  const orphans = orphanHunksOf(this);
  const expected = expectedHunks.get(this);
  if (expected !== undefined) assert.equal(n, expected);
  assert.equal(orphans.length, n);
  const hunks = this.headless!.json<{ hunks: Array<{ hunkId: string }> }>('intake.json').hunks;
  assert.deepEqual([...orphans].sort(), hunks.map((h) => h.hunkId).sort());
});
