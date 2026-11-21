import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { openCore } from '../../../src/core/api/open.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import { RecordStore, type EntryInput } from '../../../src/core/store/record.js';
import type { RevisionDocuments } from '../../../src/core/store/revisions.js';
import { HeadlessOutput } from './headless-output.js';
import type { AcceptanceWorld } from './world.js';

// Helpers of the snapshot-history scenarios (C001-TC-118, C001-TC-119: C001-TS-141 to C001-TS-143).
// A review is made by the built CLI (`analyse --headless`), listed by the `reviews` command, and its
// stored results are read back through the headless output of a later intake of the same snapshot.
// What earlier review work the scenarios start from (verdicts and read marks in the record, an
// intent map with intents) is written as that work would be written: entries through the review
// record store, an analysis result as a revision through the snapshot's event loop. The recorded
// actions (C001-T-076 to C001-T-082) and the intent mapping (C001-T-045 and later) replace neither:
// a reopened review must show whatever its revision holds.

export interface IntakeJson {
  snapshot: { snapshotId: string };
  hunks: Array<{ hunkId: string; path: string }>;
}

export interface ReviewListingJson {
  snapshotId: string;
  baseCommit: string;
  headCommit: string;
  createdAt: string;
  lastOpenedAt: string;
  recordFile: string;
}

interface History {
  /** The scenario's names of snapshots ("S1") → the real snapshot IDs. */
  readonly names: Map<string, string>;
  /** Intakes run so far in the scenario. */
  intakes: number;
  /** S1's record bytes before the intake under test. */
  recordBefore?: Buffer;
  /** S1's revision number before the intake under test. */
  revisionBefore?: number;
}

const histories = new WeakMap<AcceptanceWorld, History>();

export function historyOf(world: AcceptanceWorld): History {
  let history = histories.get(world);
  if (!history) {
    history = { names: new Map(), intakes: 0 };
    histories.set(world, history);
  }
  return history;
}

/** The snapshot ID the scenario calls `name`. */
export function snapshotNamed(world: AcceptanceWorld, name: string): string {
  const id = historyOf(world).names.get(name);
  assert.ok(id, `no snapshot ${name} in this scenario`);
  return id;
}

/** Adds `n` new files of one line each: `n` hunks (one per added file). */
export function addFiles(world: AcceptanceWorld, n: number, tag = 'extra'): void {
  for (let i = 0; i < n; i++) {
    world.repo!.write(
      `src/${tag}-${String(i).padStart(2, '0')}.ts`,
      `export const ${tag}${i} = ${i};\n`,
    );
  }
}

/** Runs one intake naming B0 (`analyse --headless`) and returns its intake document. */
export function intakeNamingB0(world: AcceptanceWorld): IntakeJson {
  const out = world.tempDir();
  world.cli(['analyse', '--headless', '--out', out, '--base', world.repo!.label('B0').hash]);
  world.headless = new HeadlessOutput(out);
  historyOf(world).intakes += 1;
  return lastIntake(world);
}

/** The intake document of the last headless run, which must have succeeded. */
export function lastIntake(world: AcceptanceWorld): IntakeJson {
  const run = world.lastRun;
  assert.equal(run?.status, 0, `the CLI exited with ${run?.status}: ${run?.stderr}`);
  assert.ok(world.headless, 'the CLI was not run with an output directory');
  return world.headless.json<IntakeJson>('intake.json');
}

/** The reviews of the repository as the `reviews` command lists them (`--format json`). */
export function listedReviews(world: AcceptanceWorld): ReviewListingJson[] {
  const run = world.cli(['reviews', '--format', 'json']);
  assert.equal(run.status, 0, `reviews exited with ${run.status}: ${run.stderr}`);
  return JSON.parse(run.stdout) as ReviewListingJson[];
}

/** The review record file of a snapshot, as `reviews` names it. */
export function recordFileOf(world: AcceptanceWorld, snapshotId: string): string {
  const listing = listedReviews(world).find((r) => r.snapshotId === snapshotId);
  assert.ok(listing, `reviews does not list ${snapshotId}`);
  return listing.recordFile;
}

const hex16 = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
export const intentIdOf = (title: string) => `i-${hex16(`intent:${title}`)}`;

const USER = { name: 'Acceptance Reviewer', email: 'reviewer@example.test' };

/** Appends read marks and verdicts to a snapshot's record through the record store. */
export async function appendReviewWork(
  world: AcceptanceWorld,
  snapshotId: string,
  hunkIds: readonly string[],
  counts: { verdicts: number; readMarks: number },
): Promise<void> {
  const file = recordFileOf(world, snapshotId);
  const log = new ContextualLog(join(world.tempDir('sddlog-'), 'log.jsonl'));
  const record = new RecordStore({ log }, dirname(file), snapshotId);
  const entries: EntryInput[] = [];
  for (let i = 0; i < counts.readMarks; i++) {
    entries.push({
      kind: 'read-mark',
      surface: 'cli',
      user: USER,
      hunkIds: [hunkIds[i % hunkIds.length] as string],
    } as EntryInput);
  }
  for (let i = 0; i < counts.verdicts; i++) {
    const title = `Intent ${i + 1}`;
    entries.push({
      kind: 'verdict',
      surface: 'cli',
      user: USER,
      intent: {
        intentId: intentIdOf(title),
        intentKey: `developer:${title}`,
        title,
        source: { type: 'developer', reference: title, textHash: sha(title) },
      },
      verdict: 'defer',
      note: `deferred ${i + 1}`,
      basis: {
        hunks: [],
        evidenceRecordIds: [],
        evidenceItems: [],
        bundleRunIds: [],
        clearings: [],
      },
      shares: { changedLines: 1, read: 0, cleared: 0, open: 1 },
      coverageStatement: {},
    } as unknown as EntryInput);
  }
  await record.append(entries);
}

export interface SeededIntent {
  readonly title: string;
  readonly hunkIds: readonly string[];
  /** The link signal; `model-judgement` for a model-assisted link. */
  readonly signal?: 'model-judgement' | 'developer-move';
}

/**
 * Writes an intent map as the snapshot's next revision, through the snapshot's event loop (the
 * way an analysis job delivers its result), with the given intents and every other hunk orphan.
 */
export async function recordIntentMap(
  world: AcceptanceWorld,
  snapshotId: string,
  allHunkIds: readonly string[],
  intents: readonly SeededIntent[],
): Promise<number> {
  const linked = new Set(intents.flatMap((i) => i.hunkIds));
  const orphan = allHunkIds.filter((h) => !linked.has(h));
  const intentMap = {
    document: 'intent-map',
    formatVersion: 1,
    snapshotId,
    mode: 'intent-fallback',
    sddChangeId: null,
    intents: intents.map((intent, index) => ({
      intentId: intentIdOf(intent.title),
      intentKey: `developer:${intent.title}`,
      title: intent.title,
      kind: 'developer-named',
      source: {
        type: 'developer',
        reference: intent.title,
        location: null,
        text: intent.title,
        textHash: sha(intent.title),
      },
      sourceOrder: index,
      unmet: false,
    })),
    links: [
      ...intents.flatMap((intent) =>
        intent.hunkIds.map((hunkId) => ({
          hunkId,
          target: intentIdOf(intent.title),
          signal: intent.signal ?? 'developer-move',
          confidence: intent.signal === 'model-judgement' ? 'low' : null,
          reason: `recorded for ${intent.title}`,
          alternatives: [],
        })),
      ),
      ...orphan.map((hunkId) => ({
        hunkId,
        target: 'orphan',
        signal: 'none',
        confidence: null,
        reason: 'no link signal',
        alternatives: [],
      })),
    ],
    specEdits: [],
    orphanHunkIds: orphan,
    unmetIntentIds: [],
    displayOrder: ['orphan', ...intents.map((i) => intentIdOf(i.title))],
    labels: {},
    notices: [],
  };
  const opened = await openCore(world.repo!.dir, { env: world.cliEnv() });
  try {
    await opened.core.loops.get(snapshotId).submit({
      kind: 'job-result',
      run: ({ current }) => {
        assert.ok(current, `snapshot ${snapshotId} has no revision`);
        const documents: RevisionDocuments = { ...current.documents, 'intent-map': intentMap };
        return { result: undefined, documents };
      },
    });
    return (await opened.core.api.getSession(snapshotId)).revision;
  } finally {
    await opened.close();
  }
}

/** The current revision number of a snapshot's analysis results. */
export async function revisionOf(world: AcceptanceWorld, snapshotId: string): Promise<number> {
  const opened = await openCore(world.repo!.dir, { env: world.cliEnv() });
  try {
    return (await opened.core.api.getSession(snapshotId)).revision;
  } finally {
    await opened.close();
  }
}
