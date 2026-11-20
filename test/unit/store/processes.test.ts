/**
 * Tests with real child Node processes: lock contention, and kills at each step of the record
 * append and of the revision switch (C001-NFR-014, C001-ADR-005 follow-up).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewError } from '../../../src/core/errors/review-error.js';
import type { StepName } from '../../../src/core/store/fsutil.js';
import { RecordStore } from '../../../src/core/store/record.js';
import { REVISION_DOCUMENTS, RevisionStore } from '../../../src/core/store/revisions.js';
import {
  SNAPSHOT_ID,
  cleanTempDirs,
  confirmedSeqs,
  fixture,
  readMark,
  runChild,
  type Fixture,
} from './helpers.js';

afterEach(cleanTempDirs);

const HEADER = {
  repositoryRoot: '/work/repo',
  baseCommit: 'd'.repeat(40),
  headCommit: 'c'.repeat(40),
  createdAt: '2026-11-20T10:00:00.000Z',
};

const childSpec = (f: Fixture, extra: Record<string, unknown>) => ({
  snapshotDir: f.snapshotDir,
  snapshotId: SNAPSHOT_ID,
  logFile: f.logFile,
  ...extra,
});

async function newRecord(f: Fixture) {
  const store = new RecordStore(f.ctx(), f.snapshotDir, SNAPSHOT_ID);
  await store.create(HEADER);
  return store;
}

describe('two or more processes appending at once (C001-REQ-917)', () => {
  it('produce one valid chain with every entry, each writer in its own order', async () => {
    const f = fixture();
    const store = await newRecord(f);
    const writers = 4;
    const each = 15;
    const confirmFiles = Array.from({ length: writers }, (_, i) => join(f.dir, `confirm-${i}.txt`));
    const results = await Promise.all(
      confirmFiles.map((confirmFile, label) =>
        runChild(childSpec(f, { mode: 'append', label, count: each, confirmFile })),
      ),
    );
    for (const r of results) expect(r.code, r.stderr).toBe(0);

    const { entries } = await store.read(); // verifies the whole chain
    expect(entries.map((e) => e.seq)).toEqual(
      Array.from({ length: writers * each }, (_, i) => i + 1),
    );

    // Every confirmed seq is the seq the entry has on disk, and each writer's entries stay in order.
    const byWriter = new Map<number, number[]>();
    for (const [label, file] of confirmFiles.entries()) {
      const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean);
      expect(rows).toHaveLength(each);
      byWriter.set(
        label,
        rows.map((row) => Number(row.split(':')[0])),
      );
    }
    for (const [label, seqs] of byWriter) {
      expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
      for (const seq of seqs)
        expect((entries[seq - 1] as { user: { name: string } }).user.name).toBe(`Writer ${label}`);
    }
  }, 60_000);

  it('makes a second process wait for the first and then fail with ERR-STORE-003 when the wait runs out', async () => {
    const f = fixture();
    const store = await newRecord(f);
    const readyFile = join(f.dir, 'ready');
    const releaseFile = join(f.dir, 'release');
    const holder = runChild(childSpec(f, { mode: 'hold', readyFile, releaseFile }));
    for (let i = 0; i < 600 && !existsSync(readyFile); i++)
      await new Promise((r) => setTimeout(r, 25));
    expect(existsSync(readyFile)).toBe(true);

    const impatient = new RecordStore(f.ctx({ lockTimeoutMs: 200 }), f.snapshotDir, SNAPSHOT_ID);
    const started = Date.now();
    await expect(impatient.append([readMark(1)])).rejects.toMatchObject({ code: 'ERR-STORE-003' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);

    writeFileSync(releaseFile, 'go');
    expect((await holder).code).toBe(0);
    await store.append([readMark(2)]);
    expect((await store.read()).entries).toHaveLength(1);
  }, 30_000);
});

describe('process killed during a record append: no confirmed entry lost (C001-NFR-014, TS-944)', () => {
  const steps: StepName[] = [
    'lock-acquired',
    'before-write',
    'after-write',
    'after-flush',
    'lock-released',
  ];

  it.each(steps)(
    'kill at step %s of the third append',
    async (killStep) => {
      const f = fixture();
      const store = await newRecord(f);
      const confirmFile = join(f.dir, 'confirm.txt');
      const result = await runChild(
        childSpec(f, {
          mode: 'append',
          label: 7,
          count: 5,
          confirmFile,
          killAt: { step: killStep, nth: 3 },
        }),
      );
      expect(result.code === 0, 'the child must have been killed').toBe(false);

      const confirmed = confirmedSeqs(confirmFile).length;
      expect(confirmed).toBe(2); // the third append never returned, so it was never confirmed

      const { entries, unfinishedTail } = await store.read();
      expect(unfinishedTail).toBe(false);
      // Every confirmed entry is present; the unconfirmed third may or may not be.
      expect(entries.length).toBeGreaterThanOrEqual(confirmed);
      expect(entries.length).toBeLessThanOrEqual(confirmed + 1);
      // Entries that were flushed before the kill are exactly those the step order promises.
      // A killed process does not undo what it handed to the operating system: from
      // after-write on, the unconfirmed line is in the file (an operating-system crash is another matter).
      const flushedBeforeKill = killStep !== 'lock-acquired' && killStep !== 'before-write';
      expect(entries.length).toBe(confirmed + (flushedBeforeKill ? 1 : 0));

      // The next writer is not blocked by the dead holder's lock and extends the same chain.
      const started = Date.now();
      const [next] = await store.append([readMark(99)]);
      expect(Date.now() - started).toBeLessThan(5000);
      expect(next?.seq).toBe(entries.length + 1);
      expect((await store.read()).entries).toHaveLength(entries.length + 1);
    },
    30_000,
  );

  it('kill in the middle of the write leaves an unfinished last line that is ignored, then removed', async () => {
    const f = fixture();
    const store = await newRecord(f);
    const confirmFile = join(f.dir, 'confirm.txt');
    const result = await runChild(
      childSpec(f, {
        mode: 'append',
        label: 7,
        count: 5,
        confirmFile,
        partialWrite: { match: 'review-record.jsonl', nth: 3 },
      }),
    );
    expect(result.code === 0).toBe(false);
    expect(confirmedSeqs(confirmFile)).toHaveLength(2);

    const torn = await store.read();
    expect(torn.entries).toHaveLength(2);
    expect(torn.unfinishedTail).toBe(true);

    await store.append([readMark(50)]);
    const healed = await store.read();
    expect(healed.entries).toHaveLength(3);
    expect(healed.unfinishedTail).toBe(false);
  }, 30_000);

  it('kill right after the tail was removed loses nothing and leaves a valid record', async () => {
    const f = fixture();
    const store = await newRecord(f);
    const confirmFile = join(f.dir, 'confirm.txt');
    // First child dies mid-write of its 2nd append, leaving a torn tail after one confirmed entry.
    await runChild(
      childSpec(f, {
        mode: 'append',
        label: 1,
        count: 3,
        confirmFile,
        partialWrite: { match: 'review-record.jsonl', nth: 2 },
      }),
    );
    // Second child repairs the tail, then dies at once.
    await runChild(
      childSpec(f, {
        mode: 'append',
        label: 2,
        count: 3,
        confirmFile: join(f.dir, 'c2.txt'),
        killAt: { step: 'tail-repaired', nth: 1 },
      }),
    );
    const { entries, unfinishedTail } = await store.read();
    expect(unfinishedTail).toBe(false);
    expect(entries).toHaveLength(confirmedSeqs(confirmFile).length);
  }, 30_000);
});

describe('process killed during a revision switch: current never names an incomplete revision', () => {
  async function seedRevision(f: Fixture) {
    const revisions = new RevisionStore(f.ctx(), f.snapshotDir);
    const documents = Object.fromEntries(REVISION_DOCUMENTS.map((d) => [d, { revision: 1, d }]));
    await revisions.commit(1, 10, documents as never);
    return revisions;
  }

  async function expectComplete(revisions: RevisionStore, revision: number) {
    const loaded = await revisions.load();
    expect(loaded?.revision).toBe(revision);
    expect(loaded?.appliedSeq).toBe(revision * 10);
    for (const d of REVISION_DOCUMENTS) {
      expect((loaded?.documents[d] as { revision: number }).revision).toBe(revision);
    }
  }

  const steps: [StepName, number][] = [
    ['documents-written', 1],
    ['current-tmp-written', 1],
    ['current-switched', 2],
    ['older-removed', 2],
  ];

  it.each(steps)(
    'kill at step %s: revision %i is current and complete',
    async (killStep, expected) => {
      const f = fixture();
      const revisions = await seedRevision(f);
      const confirmFile = join(f.dir, 'confirm.txt');
      const result = await runChild(
        childSpec(f, {
          mode: 'revision',
          fromRevision: 2,
          toRevision: 2,
          confirmFile,
          killAt: { step: killStep, nth: 1 },
        }),
      );
      expect(result.code === 0).toBe(false);
      expect(existsSync(confirmFile)).toBe(false); // the commit never returned
      await expectComplete(revisions, expected);

      // A restarted writer can go on from whatever the crash left behind.
      await revisions.commit(
        revisions.nextRevision(),
        30,
        Object.fromEntries(REVISION_DOCUMENTS.map((d) => [d, { revision: 3, d }])) as never,
      );
      const after = await revisions.load();
      expect(after?.revision).toBe(expected + 1);
      expect(readdirSync(join(f.snapshotDir, 'analysis')).sort()).toEqual(
        [String(expected + 1), 'current'].sort(),
      );
    },
    30_000,
  );

  it.each(['triage.json', '.tmp-'])(
    'kill halfway through writing %s: the previous revision stays current',
    async (match) => {
      const f = fixture();
      const revisions = await seedRevision(f);
      const result = await runChild(
        childSpec(f, {
          mode: 'revision',
          fromRevision: 2,
          toRevision: 2,
          partialWrite: { match, nth: 1 },
        }),
      );
      expect(result.code === 0).toBe(false);
      await expectComplete(revisions, 1);
    },
    30_000,
  );

  it('a reader never sees a mixed or incomplete revision while a writer switches 25 times', async () => {
    const f = fixture();
    await seedRevision(f);
    const resultFile = join(f.dir, 'reader.json');
    const reader = runChild(childSpec(f, { mode: 'reader', durationMs: 2500, resultFile }));
    await new Promise((r) => setTimeout(r, 400)); // let the reader start
    const writer = await runChild(
      childSpec(f, { mode: 'revision', fromRevision: 2, toRevision: 26 }),
    );
    expect(writer.code, writer.stderr).toBe(0);
    expect((await reader).code).toBe(0);
    const outcome = JSON.parse(readFileSync(resultFile, 'utf8')) as {
      reads: number;
      last: number;
      problems: string[];
    };
    expect(outcome.problems).toEqual([]);
    expect(outcome.reads).toBeGreaterThan(0);
    const revisions = new RevisionStore(f.ctx(), f.snapshotDir);
    await expectComplete(revisions, 26);
  }, 60_000);
});

describe('error type', () => {
  it('store errors are ReviewError', () => {
    expect(new ReviewError('ERR-STORE-003', { operation: 'x' }).exitCode).toBe(8);
  });
});
