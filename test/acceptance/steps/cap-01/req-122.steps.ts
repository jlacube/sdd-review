import { Given, Then } from '@cucumber/cucumber';
import { count, writeSizeChange } from '../../../fixtures/repos/fx-size.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-122: C001-TS-149 (C001-REQ-122) on `fx-size`. "Intake completes and creates a snapshot"
// is shared (req-123.steps.ts); the intake of the whole change is checked there and in
// test/integration/intake/size.test.ts.

Given(
  /^the fixture repository "(fx-size)" with a change of ([\d,]+) changed lines in ([\d,]+) hunks over ([\d,]+) changed files$/,
  function (this: AcceptanceWorld, name: string, lines: string, hunks: string, files: string) {
    writeSizeChange(this.fixture(name), {
      lines: count(lines),
      files: count(files),
      hunks: count(hunks),
    });
  },
);

// Component placement is C001-T-039 and the grouping of hunks under intents or orphan code
// C001-T-045; until they exist these steps are pending, so the scenario is not counted as passed.
Then(
  /^the architecture delta assigns each of the ([\d,]+) changed files to a component$/,
  function (_count: string) {
    return 'pending';
  },
);

Then(
  /^the intent map groups each of the ([\d,]+) hunks under an intent or under orphan code$/,
  function (_count: string) {
    return 'pending';
  },
);
