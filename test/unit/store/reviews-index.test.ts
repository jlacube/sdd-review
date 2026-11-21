import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { mostRecentlyOpened, ReviewsIndex } from '../../../src/core/store/reviews-index.js';
import { SnapshotStore } from '../../../src/core/store/snapshots.js';
import {
  SNAPSHOT_ID,
  SNAPSHOT_ID_2,
  cleanTempDirs,
  fixture,
  intakeDocument,
  loggedCodes,
} from './helpers.js';

// C001-TC-118 / C001-TC-119 unit level: the repository's `reviews.json` (architecture §4.1) keeps
// every review (C001-REQ-118) and records reopens (C001-REQ-119).

afterEach(cleanTempDirs);

const T1 = '2026-11-20T10:00:00.000Z';
const T2 = '2026-11-21T09:00:00.000Z';
const T3 = '2026-11-22T08:00:00.000Z';

function index(times: string[] = [T1, T2, T3]) {
  const f = fixture();
  let n = 0;
  const ctx = f.ctx({ now: () => new Date(times[Math.min(n++, times.length - 1)] as string) });
  return { f, ctx, index: new ReviewsIndex(ctx, f.layout) };
}

const entry = (snapshotId: string, createdAt = T1) => ({
  snapshotId,
  baseCommit: 'd'.repeat(40),
  headCommit: 'c'.repeat(40),
  createdAt,
});

describe('reviews.json index', () => {
  it('is empty when the repository has no review', () => {
    expect(index().index.list()).toEqual([]);
  });

  it('adds a new snapshot beside the earlier ones, in creation order, with base, HEAD, created and last opened', async () => {
    const { index: idx } = index();
    await idx.add(entry(SNAPSHOT_ID));
    await idx.add(entry(SNAPSHOT_ID_2, T2));
    expect(idx.list()).toEqual([
      { ...entry(SNAPSHOT_ID), lastOpenedAt: T1 },
      { ...entry(SNAPSHOT_ID_2, T2), lastOpenedAt: T2 },
    ]);
    expect(idx.find(SNAPSHOT_ID_2)?.createdAt).toBe(T2);
    expect(idx.find(`s-${'f'.repeat(64)}`)).toBeUndefined();
  });

  it('keeps the creation and last-opened times when the same snapshot is added again', async () => {
    const { index: idx } = index();
    await idx.add(entry(SNAPSHOT_ID));
    await idx.add(entry(SNAPSHOT_ID, T3));
    expect(idx.list()).toEqual([{ ...entry(SNAPSHOT_ID), lastOpenedAt: T1 }]);
  });

  it('a reopen changes only the last-opened time of that review', async () => {
    const { f, index: idx } = index();
    await idx.add(entry(SNAPSHOT_ID));
    await idx.add(entry(SNAPSHOT_ID_2));
    const other = JSON.stringify(idx.find(SNAPSHOT_ID_2));
    await idx.markOpened(SNAPSHOT_ID);
    expect(idx.find(SNAPSHOT_ID)).toEqual({ ...entry(SNAPSHOT_ID), lastOpenedAt: T3 });
    expect(JSON.stringify(idx.find(SNAPSHOT_ID_2))).toBe(other);
    expect(JSON.parse(readFileSync(f.layout.reviewsIndexFile, 'utf8'))).toMatchObject({
      formatVersion: 1,
    });
  });

  it('keeps every entry when several snapshots are added at once', async () => {
    const { index: idx } = index();
    const ids = Array.from({ length: 6 }, (_, i) => `s-${String(i).repeat(64)}`);
    await Promise.all(ids.map((id) => idx.add(entry(id))));
    expect(
      idx
        .list()
        .map((r) => r.snapshotId)
        .sort(),
    ).toEqual(ids.sort());
  });

  it('names the review opened most recently, the one listed last on equal times', () => {
    const a = { ...entry(SNAPSHOT_ID), lastOpenedAt: T2 };
    const b = { ...entry(SNAPSHOT_ID_2), lastOpenedAt: T1 };
    expect(mostRecentlyOpened([a, b])).toBe(a);
    expect(mostRecentlyOpened([a, { ...b, lastOpenedAt: T2 }])?.snapshotId).toBe(SNAPSHOT_ID_2);
    expect(mostRecentlyOpened([])).toBeUndefined();
  });
});

describe('snapshot store over the index', () => {
  it('requireReview refuses a snapshot whose folder exists but whose index entry was never written (ERR-STORE-004)', async () => {
    const { f, ctx } = index();
    const store = new SnapshotStore(ctx, f.layout);
    await store.createSnapshot(intakeDocument(), [], '/r');
    expect(store.requireReview(SNAPSHOT_ID)).toBe(store.snapshotDir(SNAPSHOT_ID));
    // A creation that ended before its index entry: snapshot.json is there, the entry is not.
    await store.createSnapshot(intakeDocument(SNAPSHOT_ID_2), [], '/r');
    const file = f.layout.reviewsIndexFile;
    const doc = JSON.parse(readFileSync(file, 'utf8')) as {
      reviews: Array<{ snapshotId: string }>;
    };
    writeFileSync(
      file,
      JSON.stringify({ ...doc, reviews: doc.reviews.filter((r) => r.snapshotId === SNAPSHOT_ID) }),
    );
    expect(() => store.requireReview(SNAPSHOT_ID_2)).toThrow(
      expect.objectContaining({ code: 'ERR-STORE-004' }),
    );
    expect(() => store.requireReview(`s-${'f'.repeat(64)}`)).toThrow(
      expect.objectContaining({ code: 'ERR-STORE-004' }),
    );
    expect(loggedCodes(f.logFile)).toContain('ERR-STORE-004');
  });
});
