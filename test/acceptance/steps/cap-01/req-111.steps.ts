import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { allItems, idList, intakeOf } from '../../support/intent-context.js';
import { FX_SDD, FX_SDD_TEXT } from '../../../fixtures/repos/fx-sdd.js';

// C001-TC-111: C001-TS-124 (`.sdd/` workspace) and C001-TS-126 (no workspace); C001-TS-125 (the
// neutral file) needs C001-T-030. Steps on the intent context that C001-TC-123 reuses live here.

Given(
  /^the fixture repository "([^"]+)" whose snapshot holds a `\.sdd\/` workspace with the open SDD change "([^"]+)" and the archived SDD change "([^"]+)"$/,
  function (this: AcceptanceWorld, name: string, open: string, archived: string) {
    const repo = this.fixture(name);
    assert.equal(open, FX_SDD.open.id);
    assert.equal(archived, FX_SDD.archived.id);
    assert.match(repo.read(`${FX_SDD.open.folder}/change.md`), /status: active/);
    assert.match(repo.read(`${FX_SDD.archived.folder}/change.md`), /status: archived/);
  },
);

Given(
  /^"([^"]+)" holds the requirements (\S+) and (\S+) and the task (\S+) that implements (\S+)$/,
  function (this: AcceptanceWorld, change: string, r1: string, r2: string, t: string, to: string) {
    const repo = this.repo!;
    assert.equal(change, FX_SDD.open.id);
    const requirements = repo.read(FX_SDD.requirements);
    assert.ok(requirements.includes(`### ${r1} — `) && requirements.includes(`### ${r2} — `));
    const task = repo.read(FX_SDD.task);
    assert.ok(task.includes(`id: ${t}`) && task.includes(`implements: [${to}]`));
  },
);

Given(
  /^the fixture repository "([^"]+)" with no `\.sdd\/` folder and no neutral intent-and-architecture file$/,
  function (this: AcceptanceWorld, name: string) {
    const repo = this.fixture(name);
    assert.equal(existsSync(repo.path('.sdd')), false);
    assert.equal(existsSync(repo.path('.sdd-review/workspace.json')), false);
    // A review needs a change against B0.
    repo.write('src/cart.ts', `${repo.read('src/cart.ts')}// edited\n`);
  },
);

Then(
  /^the intent context in the headless output holds (.+) with their text$/,
  function (this: AcceptanceWorld, list: string) {
    const items = allItems(intakeOf(this));
    for (const id of idList(list)) {
      const item = items.find((i) => i.id === id);
      assert.ok(item, `${id} is not in the intent context: ${items.map((i) => i.id).join(', ')}`);
      const expected = FX_SDD_TEXT[id];
      if (expected !== undefined) assert.equal(item.text, expected, `text of ${id}`);
      else assert.ok(item.text.length > 0, `${id} has no text`);
    }
  },
);

Then(
  /^it holds the link from "?([^"\s]+)"? to "?([^"\s]+)"?$/,
  function (this: AcceptanceWorld, from: string, to: string) {
    const item = allItems(intakeOf(this)).find((i) => i.id === from);
    assert.ok(item, `${from} is not in the intent context`);
    assert.ok(
      item.links.some((l) => l.to === to),
      `${from} links to ${JSON.stringify(item.links)}, not to ${to}`,
    );
  },
);

Then('it holds no spec item of {string}', function (this: AcceptanceWorld, change: string) {
  const intake = intakeOf(this);
  assert.equal(
    intake.intentContext.sddChanges.some((c) => c.id === change),
    false,
    `${change} is in the intent context`,
  );
  const ids = allItems(intake).map((i) => i.id);
  if (change === FX_SDD.archived.id) {
    for (const id of FX_SDD.archived.items) assert.equal(ids.includes(id), false, id);
  }
});

Then(
  'the intent context in the headless output holds {int} spec items',
  function (this: AcceptanceWorld, n: number) {
    assert.equal(allItems(intakeOf(this)).length, n);
  },
);
