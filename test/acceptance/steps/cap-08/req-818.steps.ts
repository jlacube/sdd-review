import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Given, Then, When } from '@cucumber/cucumber';
import { openCore } from '../../../../src/core/api/open.js';
import { ContextualLog } from '../../../../src/core/log/log.js';
import type { ModelHunk } from '../../../../src/core/model/gateway.js';
import { RecordStore, type Entry, type EntryInput } from '../../../../src/core/store/record.js';
import type { IntakeDocument } from '../../../../src/generated/analysis-results.js';
import { intentIdOf } from '../../support/fake-review.js';
import { HeadlessOutput } from '../../support/headless-output.js';
import { recordFileOf } from '../../support/review-history.js';
import type { AcceptanceWorld } from '../../support/world.js';
import { baseCommitWith, configText, localStub, localStubProvider } from './req-801.steps.js';

// C001-TC-818 (C001-T-089): C001-TS-847, a failed model request leaves the verdicts, read marks and
// hunk moves of the review, and its record, unchanged (C001-REQ-818). The review is made by the
// built CLI; its earlier work is written through the review record store as the recorded actions
// (C001-T-076 to C001-T-082) write it. The failing request is the walkthrough account of one
// intent, asked of the gateway of the snapshot as the model task of C001-T-090 asks it.

const USER = { name: 'Acceptance Reviewer', email: 'reviewer@example.test' };
/** The provider timeout of the scenario's configuration, so that a timeout shows quickly. */
const TIMEOUT_S = 2;

interface ReviewState {
  snapshotId: string;
  recordFile: string;
  bytes: Buffer;
  entries: readonly Entry[];
  hunks: ModelHunk[];
  failure?: { status: string; codes: string[] };
}

const states = new WeakMap<AcceptanceWorld, ReviewState>();

const lines = (tag: string) =>
  `${Array.from({ length: 30 }, (_, i) => `export const ${tag}${i + 1} = ${i + 1};`).join('\n')}\n`;

function verdict(title: string, v: 'sign' | 'defer'): EntryInput {
  return {
    kind: 'verdict',
    surface: 'cli',
    user: USER,
    intent: {
      intentId: intentIdOf(title),
      intentKey: `spec:${title}`,
      title,
      source: { type: 'developer', reference: title, textHash: 'c'.repeat(64) },
    },
    verdict: v,
    note: `${v} ${title}`,
    basis: { hunks: [], evidenceRecordIds: [], evidenceItems: [], bundleRunIds: [], clearings: [] },
    shares: { changedLines: 30, read: 1, cleared: 0, open: 0 },
    coverageStatement: {},
  } as unknown as EntryInput;
}

Given(
  /^a review with (\d+) read marks, 1 hunk move of "([^"]+)" lines \d+-\d+ to "([^"]+)", a sign verdict on "([^"]+)" and a defer verdict on "([^"]+)"$/,
  async function (
    this: AcceptanceWorld,
    readMarks: string,
    movedPath: string,
    moveTarget: string,
    signed: string,
    deferred: string,
  ) {
    const provider = await localStubProvider(this);
    const repo = baseCommitWith(
      this,
      configText({ formatVersion: 1, model: { provider, timeoutSeconds: TIMEOUT_S } }),
    );
    for (const path of [movedPath, 'src/client.ts', 'src/backoff.ts']) {
      repo.write(path, lines(path.replace(/\W+/g, '_')));
    }
    const out = join(this.tempDir('sddout-'), 'results');
    this.cli(['analyse', '--headless', '--out', out]);
    assert.equal(this.lastRun?.status, 0, this.lastRun?.stderr);
    const intake = new HeadlessOutput(out).json<IntakeDocument>('intake.json');
    const snapshotId = intake.snapshot.snapshotId;
    const hunks = intake.hunks;
    const moved = hunks.find((h) => h.path === movedPath);
    assert.ok(moved, `no hunk in ${movedPath}`);
    assert.ok(hunks.length >= Number(readMarks), 'fewer hunks than read marks');

    const recordFile = recordFileOf(this, snapshotId);
    const log = new ContextualLog(join(this.tempDir('sddlog-'), 'log.jsonl'));
    const record = new RecordStore({ log }, dirname(recordFile), snapshotId);
    await record.append([
      ...hunks
        .slice(0, Number(readMarks))
        .map(
          (h) =>
            ({ kind: 'read-mark', surface: 'cli', user: USER, hunkIds: [h.hunkId] }) as EntryInput,
        ),
      {
        kind: 'hunk-move',
        surface: 'cli',
        user: USER,
        hunkId: moved.hunkId,
        from: { orphan: true },
        to: { intentId: intentIdOf(moveTarget) },
      } as EntryInput,
      verdict(signed, 'sign'),
      verdict(deferred, 'defer'),
    ]);
    const { entries } = await record.read();
    states.set(this, {
      snapshotId,
      recordFile,
      bytes: readFileSync(recordFile),
      entries,
      hunks: hunks.map((h) => ({
        hunkId: h.hunkId,
        path: h.path,
        firstLine: h.newStart,
        text: h.lines.map((l) => `${l.kind === 'added' ? '+' : '-'}${l.text}`).join('\n'),
      })),
    });
  },
);

Given('the local stub is the model provider', async function (this: AcceptanceWorld) {
  // The review's configuration names the local stub (the step before); it must be running.
  await localStub(this);
  assert.ok(states.get(this), 'the review is made by the step before');
});

const EXPECTED: Record<string, string> = {
  'the connection is refused': 'ERR-MODEL-003',
  'no answer arrives within the timeout': 'ERR-MODEL-004',
  'the answer does not match the format': 'ERR-MODEL-005',
};

When(
  /^a request to the local stub for the walkthrough account of "([^"]+)" fails because (.+)$/,
  async function (this: AcceptanceWorld, intent: string, failure: string) {
    const state = states.get(this);
    assert.ok(state, 'no review in this scenario');
    const expected = EXPECTED[failure];
    assert.ok(expected, `unknown failure in the scenario: ${failure}`);
    const stub = await localStub(this);
    if (expected === 'ERR-MODEL-003') await stub.stop();
    else if (expected === 'ERR-MODEL-004') stub.enqueue({ hang: true });
    else stub.enqueue({ output: { task: 'walkthrough-account', text: 'not the format' } });

    const opened = await openCore(this.repo!.dir, { env: this.cliEnv() });
    try {
      const intentId = intentIdOf(intent);
      const result = await opened.core.gateway(state.snapshotId).runTask('walkthrough-account', {
        intent: { intentId, title: intent, sourceText: intent },
        hunks: state.hunks,
      });
      state.failure = { status: result.status, codes: result.notices.map((n) => n.code) };
    } finally {
      await opened.close();
    }
    // The request failed, with the code of its cause (C001-IF-010 §7).
    assert.deepEqual(state.failure, { status: 'model-free', codes: [expected] });
  },
);

Then(
  /^the review holds the same (\d+) read marks, the same hunk move and the same verdicts$/,
  async function (this: AcceptanceWorld, readMarks: string) {
    const state = states.get(this)!;
    const log = new ContextualLog(join(this.tempDir('sddlog-'), 'log.jsonl'));
    const { entries } = await new RecordStore(
      { log },
      dirname(state.recordFile),
      state.snapshotId,
    ).read();
    const of = (kind: string, list: readonly Entry[]) => list.filter((e) => e.kind === kind);
    assert.equal(of('read-mark', entries).length, Number(readMarks));
    assert.deepEqual(of('read-mark', entries), of('read-mark', state.entries));
    assert.deepEqual(of('hunk-move', entries), of('hunk-move', state.entries));
    assert.deepEqual(of('verdict', entries), of('verdict', state.entries));
    assert.equal(entries.length, state.entries.length);
  },
);

Then('the review record is unchanged', function (this: AcceptanceWorld) {
  const state = states.get(this)!;
  assert.ok(readFileSync(state.recordFile).equals(state.bytes), 'the review record changed');
});
