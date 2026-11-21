import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { idList } from '../../support/intent-context.js';
import { expectedHunks, intentsOf, type IntentView } from '../../support/intent-map.js';
import { FX_SDD, FX_SDD_ARCHIVED_COMMITS } from '../../../fixtures/repos/fx-sdd.js';
import type { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';

// C001-TC-313: C001-TS-327 to C001-TS-330 (C001-REQ-313, one extracted intent per commit in
// model-free mode), C001-T-044. No model provider is configured unless a scenario states one
// (CAP-01 acceptance conventions), so "in model-free mode" holds for every fixture here; the step
// checks that the repository configures no provider. The review is started by the shared CAP-01
// steps ("naming commit B0", "without naming a commit"); "the intent map holds 0 intents" and
// "orphan code holds the 3 hunks" are in req-305.steps.ts.

/** Model-free mode: the fixture's base commit holds no review configuration (`.sdd-review/config.json`, C001-T-035). */
function modelFree(repo: FixtureRepo): void {
  assert.equal(repo.git('ls-files', '--', '.sdd-review'), '');
}

const extracted = (intents: IntentView[]) =>
  intents.filter((i) => i.kind === 'extracted-commit' || i.kind === 'extracted-plan-item');

Given(
  /^the fixture repository "(fx-nosdd)" in model-free mode with the commits C1 "([^"]+)" and C2 "([^"]+)"$/,
  function (this: AcceptanceWorld, name: string, c1: string, c2: string) {
    const repo = this.fixture(name);
    modelFree(repo);
    repo.commit('C1', {
      subject: c1,
      files: {
        'src/cart/total.ts':
          'export const total = (p: number[]) => p.reduce((a, b) => a + b, 0);\n',
      },
    });
    repo.commit('C2', {
      subject: c2,
      files: { 'src/cart/tax.ts': 'export const tax = (a: number) => Math.round(a * 20) / 100;\n' },
    });
  },
);

Given(
  /^the fixture repository "(fx-sdd-archived)" in model-free mode whose workspace holds only the archived SDD change "([^"]+)" and whose change has the commit C1 "([^"]+)"$/,
  function (this: AcceptanceWorld, name: string, id: string, c1: string) {
    const repo = this.fixture(name);
    modelFree(repo);
    assert.equal(id, FX_SDD.archived.id);
    assert.equal(
      repo.git('ls-files', '--', '.sdd/*/change.md'),
      `${FX_SDD.archived.folder}/change.md`,
    );
    assert.equal(c1, FX_SDD_ARCHIVED_COMMITS.C1);
    assert.equal(repo.git('log', '-1', '--format=%s', repo.label('C1').hash), c1);
  },
);

Given(
  /^the fixture repository "(fx-nosdd)" in model-free mode with the commit C3 whose message is "([^"]+)", an empty line and the body "([^"]+)"$/,
  function (this: AcceptanceWorld, name: string, subject: string, body: string) {
    const repo = this.fixture(name);
    modelFree(repo);
    repo.commit('C3', {
      message: `${subject}\n\n${body}`,
      files: {
        'src/cart/pricing.ts': 'export { price, discount, label } from "./rules.js";\n',
        'src/cart/rules.ts': 'export const price = (amount: number) => amount;\n',
      },
    });
    assert.equal(repo.git('log', '-1', '--format=%B').trim(), `${subject}\n\n${body}`);
  },
);

Given(
  /^the fixture repository "(fx-nosdd)" in model-free mode with HEAD as base commit, (\d+) hunks of uncommitted edits and no named agent plan$/,
  function (this: AcceptanceWorld, name: string, hunks: string) {
    const repo = this.fixture(name);
    modelFree(repo);
    assert.equal(Number(hunks), 3);
    // One hunk in each of the three files of B0.
    for (const path of ['src/cart/total.ts', 'src/cart/tax.ts', 'src/cart/pricing.ts']) {
      repo.write(path, `${repo.read(path)}// edited\n`);
    }
    expectedHunks.set(this, Number(hunks));
  },
);

Then(
  /^the intent map holds exactly (\d+) extracted intents, titled (".+)$/,
  function (this: AcceptanceWorld, count: string, list: string) {
    const intents = intentsOf(this);
    assert.equal(
      intents.length,
      Number(count),
      `intents: ${intents.map((i) => i.title).join(', ')}`,
    );
    assert.equal(extracted(intents).length, intents.length);
    assert.deepEqual(
      intents.map((i) => i.title),
      idList(list),
      'titled by the subject lines, oldest commit first (source order)',
    );
  },
);

Then(
  'the intent map holds the extracted intent {string}',
  function (this: AcceptanceWorld, title: string) {
    const found = intentsOf(this).filter((i) => i.title === title);
    assert.equal(
      found.length,
      1,
      `intents: ${intentsOf(this)
        .map((i) => i.title)
        .join(', ')}`,
    );
    assert.equal(found[0]!.kind, 'extracted-commit');
    assert.equal(found[0]!.source.type, 'commit');
    assert.equal(found[0]!.source.reference, this.repo!.label('C1').hash);
  },
);

Then(
  'the intent map holds an extracted intent titled {string}',
  function (this: AcceptanceWorld, title: string) {
    const intents = intentsOf(this);
    const found = extracted(intents).filter((i) => i.title === title);
    assert.equal(
      found.length,
      1,
      `intents: ${intents.map((i) => JSON.stringify(i.title)).join(', ')}`,
    );
  },
);
