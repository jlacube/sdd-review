import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { Given, Then, When } from '@cucumber/cucumber';
import { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import { CONFIGURATION_PATH } from '../../../../src/core/api/index.js';
import { openCore } from '../../../../src/core/api/open.js';
import type { ModelHunk } from '../../../../src/core/model/gateway.js';
import type { Hunk, IntakeDocument } from '../../../../src/generated/analysis-results.js';
import { intentIdOf } from '../../support/fake-review.js';
import { HeadlessOutput } from '../../support/headless-output.js';
import type { RecordedRequest } from '../../support/stub-llm/stub-llm.js';
import type { AcceptanceWorld } from '../../support/world.js';
import {
  cloudStub,
  cloudStubProvider,
  configText,
  localStub,
  localStubProvider,
} from './req-801.steps.js';
import { taskOf } from './req-805.steps.js';

// C001-TC-814 (C001-T-088): C001-TS-835 to C001-TS-838 and C001-TS-850, no content of a
// model-excluded path reaches any provider (C001-REQ-814, C001-IF-010 §6 check 4). The review
// start is the one of req-801.steps.ts. The base commit holds the files the scenarios modify or
// rename, so that each is a change of an existing file; the change itself is left in the working
// tree, so the base commit is the one holding the configuration.
//
// "No request contains the marker" is checked only once the stub has received a request: a
// scenario whose stub received nothing shows nothing about what a request would have held.

const SEEDED: Record<string, string> = {
  'src/cart.ts': 'export function total(items: number[]): number {\n  return 0;\n}\n',
  'src/auth.ts': 'export function signIn(): boolean {\n  return false;\n}\n',
  'secrets/tokens.ts': 'export const tokens: string[] = [];\n',
  'src/secrets/util.ts': 'export const util = 0;\n',
  'src/keys.ts': 'export const keys: string[] = [];\n',
};

/** Ten lines, so that a hunk of lines 3-9 can be told apart; `marker` sits on line 5. */
function editedText(path: string, marker: string): string {
  const name = path.replace(/\W+/g, '_');
  return `${Array.from({ length: 10 }, (_, i) =>
    i === 4 ? `export const ${name}_marker = '${marker}';` : `export const ${name}_${i} = ${i};`,
  ).join('\n')}\n`;
}

function repoWith(world: AcceptanceWorld, model: Record<string, unknown>): FixtureRepo {
  const repo = FixtureRepo.create();
  world.repo = repo;
  repo.commit('B0', {
    files: { ...SEEDED, [CONFIGURATION_PATH]: configText({ formatVersion: 1, model }) },
  });
  return repo;
}

// C001-TS-835, C001-TS-850

Given(
  'a review configuration with the cloud stub, the cloud opt-in setting and the model-excluded path pattern {string}',
  async function (this: AcceptanceWorld, pattern: string) {
    repoWith(this, {
      provider: await cloudStubProvider(this),
      cloudOptIn: true,
      excludedPaths: [pattern],
    });
  },
);

// C001-TS-836, C001-TS-837

Given(
  'a review configuration with the local stub and the model-excluded path pattern {string}',
  async function (this: AcceptanceWorld, pattern: string) {
    repoWith(this, { provider: await localStubProvider(this), excludedPaths: [pattern] });
  },
);

// C001-TS-838

Given(
  'a base commit whose review configuration names the cloud stub with the cloud opt-in setting and the model-excluded path pattern {string}',
  async function (this: AcceptanceWorld, pattern: string) {
    repoWith(this, {
      provider: await cloudStubProvider(this),
      cloudOptIn: true,
      excludedPaths: [pattern],
    });
  },
);

Given(
  /^the change under review removes "([^"]+)" from the review configuration and modifies "([^"]+)", holding "([^"]+)"$/,
  async function (this: AcceptanceWorld, pattern: string, path: string, marker: string) {
    const repo = this.repo!;
    const config = JSON.parse(repo.read(CONFIGURATION_PATH)) as {
      model: { excludedPaths: string[] };
    };
    config.model.excludedPaths = config.model.excludedPaths.filter((p) => p !== pattern);
    repo.write(CONFIGURATION_PATH, configText(config));
    repo.write(path, editedText(path, marker));
  },
);

Given(
  'the change modifies {string}, which holds the marker string {string}',
  function (this: AcceptanceWorld, path: string, marker: string) {
    this.repo!.write(path, editedText(path, marker));
  },
);

Given(
  /^the change modifies "([^"]+)", holding "([^"]+)", and "([^"]+)", holding "([^"]+)", and neither hunk has a deterministic link signal$/,
  function (this: AcceptanceWorld, a: string, markerA: string, b: string, markerB: string) {
    // No commit message, intent file or SDD workspace names either file: the change is left
    // uncommitted in a repository without an SDD workspace.
    this.repo!.write(a, editedText(a, markerA));
    this.repo!.write(b, editedText(b, markerB));
  },
);

Given(
  'the change renames {string} to {string} and edits it so that it holds the marker string {string}',
  function (this: AcceptanceWorld, from: string, to: string, marker: string) {
    const repo = this.repo!;
    repo.moveInWorkingTree(from, to);
    // The edit keeps most lines, so that git still pairs the two paths as a rename.
    const lines = repo.read(to).split('\n');
    lines.splice(1, 0, `export const renamed_marker = '${marker}';`);
    repo.write(to, lines.join('\n'));
    repo.stage(from, to);
  },
);

// C001-TS-836: the walkthrough account of one intent, asked of the gateway of the snapshot as the
// model task of C001-T-090 asks it: the intent with its hunks in intent order (C001-IF-010 §2).

const walkthroughRequests = new WeakMap<AcceptanceWorld, RecordedRequest[]>();
const intentFiles = new WeakMap<AcceptanceWorld, { intent: string; paths: string[] }>();

Given(
  /^intent "([^"]+)" with hunks in "([^"]+)", holding the marker "([^"]+)", and in "([^"]+)", holding the marker "([^"]+)"$/,
  function (
    this: AcceptanceWorld,
    intent: string,
    a: string,
    markerA: string,
    b: string,
    markerB: string,
  ) {
    this.repo!.write(a, editedText(a, markerA));
    this.repo!.write(b, editedText(b, markerB));
    intentFiles.set(this, { intent, paths: [a, b] });
  },
);

function hunkText(hunk: Hunk): string {
  return hunk.lines.map((l) => `${l.kind === 'added' ? '+' : '-'}${l.text}`).join('\n');
}

When(
  'the local stub is asked for the walkthrough account of {string}',
  async function (this: AcceptanceWorld, intent: string) {
    const files = intentFiles.get(this);
    assert.equal(files?.intent, intent, `the scenario gave no hunks for intent ${intent}`);
    const stub = await localStub(this);
    const opened = await openCore(this.repo!.dir, { env: this.cliEnv() });
    try {
      const started = await opened.core.api.startReview({});
      const out = join(this.tempDir('sddout-'), 'results');
      await opened.core.api.exportResults(started.snapshotId, out);
      const intake = new HeadlessOutput(out).json<IntakeDocument>('intake.json');
      const basePathOf = new Map(
        intake.snapshot.changedFiles.map((f) => [f.path, f.oldPath ?? null] as const),
      );
      const hunks: ModelHunk[] = files!.paths.flatMap((path) =>
        intake.hunks
          .filter((h) => h.path === path)
          .map((h) => ({
            hunkId: h.hunkId,
            path: h.path,
            basePath: basePathOf.get(h.path) ?? null,
            text: hunkText(h),
          })),
      );
      assert.equal(new Set(hunks.map((h) => h.path)).size, 2, 'expected hunks in both files');
      stub.enqueue({
        output: { task: 'walkthrough-account', intentId: intentIdOf(intent), account: 'Account.' },
      });
      const before = stub.requests.length;
      await opened.core.gateway(started.snapshotId).runTask('walkthrough-account', {
        intent: { intentId: intentIdOf(intent), title: intent, sourceText: intent },
        hunks,
      });
      walkthroughRequests.set(this, stub.requests.slice(before));
    } finally {
      await opened.close();
    }
  },
);

function theRecordedRequest(world: AcceptanceWorld): string {
  const requests = walkthroughRequests.get(world) ?? [];
  assert.equal(requests.length, 1, `expected one recorded request, got ${requests.length}`);
  return JSON.stringify(requests[0]);
}

Then('the recorded request contains {string}', function (this: AcceptanceWorld, text: string) {
  assert.ok(theRecordedRequest(this).includes(text), `the request does not contain ${text}`);
});

Then('it does not contain {string}', function (this: AcceptanceWorld, text: string) {
  assert.ok(!theRecordedRequest(this).includes(text), `the request contains ${text}`);
});

// Checks on every request of the analysis.

function assertNoneContains(requests: readonly RecordedRequest[], text: string): void {
  assert.ok(requests.length > 0, 'the stub received no request');
  for (const request of requests) {
    assert.ok(!JSON.stringify(request).includes(text), `a request contains ${text}`);
  }
}

Then(
  'no request recorded by the cloud stub contains {string}',
  async function (this: AcceptanceWorld, text: string) {
    assertNoneContains((await cloudStub(this)).requests, text);
  },
);

Then('no recorded request contains {string}', async function (this: AcceptanceWorld, text: string) {
  assertNoneContains((await localStub(this)).requests, text);
});

Then(
  'the hunk-to-intent grouping requests recorded by the local stub contain {string}',
  async function (this: AcceptanceWorld, text: string) {
    const linking = (await localStub(this)).requests.filter(
      (r) => taskOf(r, 'openai-chat') === 'hunk-linking',
    );
    assert.ok(linking.length > 0, 'the local stub received no hunk-to-intent grouping request');
    assert.ok(
      linking.some((r) => JSON.stringify(r).includes(text)),
      `no grouping request contains ${text}`,
    );
  },
);
