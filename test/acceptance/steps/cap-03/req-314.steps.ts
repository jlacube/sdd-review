import { strict as assert } from 'node:assert';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { HeadlessOutput } from '../../support/headless-output.js';
import { intentsOf } from '../../support/intent-map.js';
import { namedPath } from '../../support/named-files.js';
import { FX_NOSDD_PLANS } from '../../../fixtures/repos/fx-nosdd.js';

// C001-TC-314: C001-TS-331 (C001-REQ-314, one extracted intent per plan item of a named agent plan
// in model-free mode), C001-T-044 with the plan-item rule of C001-T-032. The plan lies in the
// scenario's folder of named files outside the repository (support/named-files.ts) and is named by
// its absolute path; its intent sources are compared by file name and line.

Given(
  /^the fixture repository "(fx-nosdd)" in model-free mode with no commit after the base commit$/,
  function (this: AcceptanceWorld, name: string) {
    const repo = this.fixture(name);
    assert.equal(repo.git('ls-files', '--', '.sdd-review'), '');
    assert.equal(repo.git('rev-parse', 'HEAD'), repo.label('B0').hash);
    // The agent's edits are uncommitted (no commit boundary, C001-REQ-314 rationale): an empty
    // change would stop intake with ERR-INTAKE-005 before any intent exists.
    repo.write('src/cart/total.ts', `${repo.read('src/cart/total.ts')}// coupon\n`);
  },
);

Given(
  /^the agent plan "([^"]+)" holds (\d+) plan items under the plan-item rule, starting at lines (\d+), (\d+) and (\d+)$/,
  function (
    this: AcceptanceWorld,
    plan: string,
    count: string,
    l1: string,
    l2: string,
    l3: string,
  ) {
    const lines = [l1, l2, l3];
    const text = FX_NOSDD_PLANS[plan];
    assert.ok(text !== undefined, `no plan text for ${plan}`);
    assert.equal(Number(count), 3);
    assert.deepEqual(lines.map(Number), [3, 7, 12]);
    writeFileSync(namedPath(this, plan), text);
  },
);

When(
  'the developer starts a review without naming a commit and naming {string} as agent plan',
  function (this: AcceptanceWorld, plan: string) {
    const out = this.tempDir();
    this.cli(['analyse', '--headless', '--out', out, '--plan', namedPath(this, plan)]);
    this.headless = new HeadlessOutput(out);
  },
);

Then(
  'the intent map holds exactly {int} extracted intents',
  function (this: AcceptanceWorld, n: number) {
    const intents = intentsOf(this);
    assert.equal(intents.length, n, `intents: ${intents.map((i) => i.title).join(', ')}`);
    assert.ok(
      intents.every((i) => i.kind.startsWith('extracted-')),
      `kinds: ${intents.map((i) => i.kind).join(', ')}`,
    );
  },
);

Then(
  /^their intent sources are "([^"]+)" at lines (\d+), (\d+) and (\d+)$/,
  function (this: AcceptanceWorld, plan: string, l1: string, l2: string, l3: string) {
    const lines = [l1, l2, l3];
    const sources = intentsOf(this).map((i) => i.source);
    assert.ok(
      sources.every((s) => s.type === 'plan-item'),
      JSON.stringify(sources),
    );
    assert.deepEqual(
      sources.map((s) => [basename(s.location?.path ?? ''), s.location?.line]),
      lines.map((line) => [plan, Number(line)]),
    );
  },
);
