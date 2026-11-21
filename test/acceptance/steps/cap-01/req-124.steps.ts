import { strict as assert } from 'node:assert';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import {
  FX_NEUTRAL_FILE,
  fxNeutralDocument,
  neutralText,
} from '../../../fixtures/repos/fx-neutral.js';

// C001-TC-124: C001-TS-154 and C001-TS-155 (a neutral file that does not conform to C001-IF-006 stops
// intake with ERR-SDD-003 naming the file, the place of the first nonconformity and the reason,
// C001-REQ-124) on `fx-neutral`. The nonconforming file is the snapshot's: the working tree's.

type Document = ReturnType<typeof fxNeutralDocument> & Record<string, unknown>;

/** Gives the first entry of "changes" the status "pending", outside the enumeration. */
function pendingFirst(document: Document): void {
  (document.changes[0] as { status: string }).status = 'pending';
}

Given(
  /^the file "([^"]+)" of the snapshot (.+)$/,
  function (this: AcceptanceWorld, file: string, nonconformity: string) {
    assert.equal(file, FX_NEUTRAL_FILE);
    const repo = this.repo!;
    const document = fxNeutralDocument() as Document;
    const text = /^holds the text "(.*)" which is not JSON$/.exec(nonconformity);
    if (text) {
      repo.write(file, `${text[1]}\n`);
    } else if (nonconformity === 'holds "formatVersion": 2') {
      repo.write(file, neutralText({ ...document, formatVersion: 2 }));
    } else if (nonconformity === 'holds "status": "pending" in its first entry of "changes"') {
      pendingFirst(document);
      repo.write(file, neutralText(document));
    } else {
      throw new Error(`nonconformity not automated: ${nonconformity}`);
    }
  },
);

Given(
  /^the fixture repository "([^"]+)" whose "([^"]+)" holds "status": "pending" in its first entry of "changes" and an item without "id" in its third entry of "changes"$/,
  function (this: AcceptanceWorld, name: string, file: string) {
    const repo = this.fixture(name);
    assert.equal(file, FX_NEUTRAL_FILE);
    const document = fxNeutralDocument() as Document;
    pendingFirst(document);
    const changes = document.changes as unknown as Array<Record<string, unknown>>;
    changes.push({ id: 'FEAT-10', title: 'Second change', status: 'open', items: [] });
    changes.push({
      id: 'FEAT-11',
      title: 'Third change',
      status: 'open',
      items: [{ kind: 'requirement', title: 'An item without ID', text: 'No ID.' }],
    });
    repo.write(file, neutralText(document));
  },
);

Then('intake stops with the error {word}', function (this: AcceptanceWorld, code: string) {
  const run = this.lastRun;
  assert.ok(run, 'the CLI was not run');
  assert.notEqual(run.status, 0, `the CLI succeeded: ${run.stdout}`);
  assert.ok(run.stderr.includes(code), `the output does not name ${code}: ${run.stderr}`);
});

/** The ERR-SDD-003 message of the last run (errors.md). */
function messageOf(world: AcceptanceWorld): string {
  const run = world.lastRun;
  assert.ok(run, 'the CLI was not run');
  const line = run.stderr.split('\n').find((l) => l.includes('ERR-SDD-003'));
  assert.ok(line, `no ERR-SDD-003 in: ${run.stderr}`);
  return line;
}

/** The text by which the message names a place: `(<JSON pointer>)`, or `(document root)`. */
const placeText = (place: string) => (place.startsWith('(') ? place : `(${place})`);

Then(
  /^the error message names "([^"]+)", the place "([^"]+)" and a reason$/,
  function (this: AcceptanceWorld, file: string, place: string) {
    const message = messageOf(this);
    assert.ok(message.includes(`"${file}"`), `the message does not name ${file}: ${message}`);
    assert.ok(message.includes(placeText(place)), `the message does not name ${place}: ${message}`);
    assert.match(
      message,
      /is invalid at line \d+ \([^)]*\): \S.*\./,
      'the message gives no reason',
    );
  },
);

Then(
  'the error message names the place {string} and not a place under {string}',
  function (this: AcceptanceWorld, place: string, other: string) {
    const message = messageOf(this);
    assert.ok(message.includes(placeText(place)), `the message does not name ${place}: ${message}`);
    assert.equal(message.includes(`${other}/`) || message.includes(`(${other})`), false, message);
  },
);
