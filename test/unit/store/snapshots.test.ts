import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StoreLayout } from '../../../src/core/store/root.js';
import { SnapshotStore } from '../../../src/core/store/snapshots.js';
import {
  SNAPSHOT_ID,
  SNAPSHOT_ID_2,
  cleanTempDirs,
  errno,
  fixture,
  fsWith,
  intakeDocument,
  loggedCodes,
  readMark,
  sha256,
  tempDir,
} from './helpers.js';

afterEach(cleanTempDirs);

function store() {
  const dir = tempDir();
  const f = fixture();
  const layout = new StoreLayout(join(dir, 'root'), 'k'.repeat(64));
  return { f, layout, make: (overrides = {}) => new SnapshotStore(f.ctx(overrides), layout) };
}

describe('snapshot folder (architecture §4.1)', () => {
  it('creates snapshot.json, content blobs by SHA-256, review.json, the record header and the index entry', async () => {
    const { layout, make } = store();
    const snapshots = make();
    const blob = Buffer.from('export const x = 1;\n');
    const dir = await snapshots.createSnapshot(intakeDocument(), [blob, blob], '/work/repo');
    expect(dir).toBe(join(layout.repositoryDir, SNAPSHOT_ID));
    expect(readdirSync(join(dir, 'content'))).toEqual([sha256(blob)]); // stored once
    expect(readFileSync(join(dir, 'content', sha256(blob)))).toEqual(blob);
    expect((await snapshots.readSnapshot(SNAPSHOT_ID)).snapshot.snapshotId).toBe(SNAPSHOT_ID);
    expect(await snapshots.readReviewState(SNAPSHOT_ID)).toEqual({
      formatVersion: 1,
      sampleSeed: null,
      jobStates: {},
    });
    const record = await snapshots.record(SNAPSHOT_ID).read();
    expect(record.header).toMatchObject({
      snapshotId: SNAPSHOT_ID,
      repositoryRoot: '/work/repo',
      headCommit: 'c'.repeat(40),
    });
    const index = await snapshots.listReviews();
    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({
      snapshotId: SNAPSHOT_ID,
      baseCommit: 'd'.repeat(40),
      headCommit: 'c'.repeat(40),
    });
    expect(await snapshots.readBlob(SNAPSHOT_ID, sha256(blob))).toEqual(blob);
  });

  it('keeps earlier snapshots when a new one is created (C001-REQ-118) and lists both', async () => {
    const { make } = store();
    const snapshots = make();
    await snapshots.createSnapshot(intakeDocument(SNAPSHOT_ID), [], '/work/repo');
    await snapshots.record(SNAPSHOT_ID).append([readMark(1)]);
    const before = readFileSync(snapshots.record(SNAPSHOT_ID).file);
    await snapshots.createSnapshot(intakeDocument(SNAPSHOT_ID_2, 'e'.repeat(40)), [], '/work/repo');
    expect((await snapshots.listReviews()).map((r) => r.snapshotId).sort()).toEqual([
      SNAPSHOT_ID,
      SNAPSHOT_ID_2,
    ]);
    expect(readFileSync(snapshots.record(SNAPSHOT_ID).file).equals(before)).toBe(true);
  });

  it('keeps the record when the same snapshot is created again', async () => {
    const { make } = store();
    const snapshots = make();
    await snapshots.createSnapshot(intakeDocument(), [], '/work/repo');
    await snapshots.record(SNAPSHOT_ID).append([readMark(1)]);
    await snapshots.createSnapshot(intakeDocument(), [], '/work/repo');
    expect((await snapshots.record(SNAPSHOT_ID).read()).entries).toHaveLength(1);
    expect(await snapshots.listReviews()).toHaveLength(1);
  });

  it('updates the last-opened time', async () => {
    const times = ['2026-11-20T10:00:00.000Z', '2026-11-21T09:00:00.000Z'];
    const { make } = store();
    let n = 0;
    const snapshots = make({ now: () => new Date(times[Math.min(n++, 1)] as string) });
    await snapshots.createSnapshot(intakeDocument(), [], '/work/repo');
    await snapshots.markOpened(SNAPSHOT_ID);
    const [entry] = await snapshots.listReviews();
    expect(entry?.lastOpenedAt).toBe(times[1]);
  });

  it('keeps both entries when two snapshots are created at once', async () => {
    const { make } = store();
    const snapshots = make();
    await Promise.all([
      snapshots.createSnapshot(intakeDocument(SNAPSHOT_ID), [], '/r'),
      snapshots.createSnapshot(intakeDocument(SNAPSHOT_ID_2), [], '/r'),
    ]);
    expect(await snapshots.listReviews()).toHaveLength(2);
  });

  it('writes review.json atomically', async () => {
    const { make } = store();
    const snapshots = make();
    await snapshots.createSnapshot(intakeDocument(), [], '/r');
    await snapshots.writeReviewState(SNAPSHOT_ID, {
      formatVersion: 1,
      sampleSeed: 'seed-1',
      jobStates: { tests: 'running' },
    });
    expect(await snapshots.readReviewState(SNAPSHOT_ID)).toMatchObject({ sampleSeed: 'seed-1' });
  });

  it('rejects with ERR-STORE-004 for a snapshot with no review, and logs it', async () => {
    const { f, make } = store();
    const snapshots = make();
    await expect(snapshots.readSnapshot(SNAPSHOT_ID)).rejects.toMatchObject({
      code: 'ERR-STORE-004',
    });
    await expect(snapshots.readSnapshot('s-nope')).rejects.toMatchObject({ code: 'ERR-STORE-004' });
    expect(loggedCodes(f.logFile)).toContain('ERR-STORE-004');
  });

  it('leaves no index entry when saving the snapshot fails (ERR-STORE-001)', async () => {
    const { f, make } = store();
    const fs = fsWith(() => ({
      writeSync: (() => {
        throw errno('ENOSPC', 'injected');
      }) as never,
    }));
    const snapshots = make({ fs });
    await expect(
      snapshots.createSnapshot(intakeDocument(), [Buffer.from('x')], '/r'),
    ).rejects.toMatchObject({
      code: 'ERR-STORE-001',
    });
    expect(await make().listReviews()).toEqual([]);
    expect(loggedCodes(f.logFile)).toContain('ERR-STORE-001');
  });

  it('does not write temporary files that outlive a failed save', async () => {
    const { layout, make } = store();
    const fs = fsWith(() => ({
      writeSync: (() => {
        throw errno('EACCES', 'injected');
      }) as never,
    }));
    await make({ fs })
      .createSnapshot(intakeDocument(), [Buffer.from('x')], '/r')
      .catch(() => undefined);
    const stray = (dir: string): string[] =>
      existsSync(dir)
        ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? stray(join(dir, e.name)) : e.name.startsWith('.tmp-') ? [e.name] : [],
          )
        : [];
    expect(stray(layout.repositoryDir)).toEqual([]);
  });
});

describe.skipIf(process.platform === 'win32')(
  'owner-only permissions (POSIX; Windows uses inherited rules)',
  () => {
    it('gives every directory 0700 and every file 0600', async () => {
      const { layout, make } = store();
      const snapshots = make();
      await snapshots.createSnapshot(intakeDocument(), [Buffer.from('blob')], '/r');
      await snapshots.record(SNAPSHOT_ID).append([readMark(1)]);
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          expect(statSync(p).mode & 0o777, p).toBe(e.isDirectory() ? 0o700 : 0o600);
          if (e.isDirectory()) walk(p);
        }
      };
      expect(statSync(layout.root).mode & 0o777).toBe(0o700);
      expect(statSync(layout.repositoryDir).mode & 0o777).toBe(0o700);
      walk(layout.repositoryDir);
    });
  },
);
