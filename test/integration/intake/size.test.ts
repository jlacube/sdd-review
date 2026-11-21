import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildFxSize, writeSizeChange } from '../../fixtures/repos/fx-size.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import { StoreLayout } from '../../../src/core/store/root.js';
import { SnapshotStore } from '../../../src/core/store/snapshots.js';
import { takeInChange } from '../../../src/core/intake/snapshot.js';

// C001-T-026, C001-TC-122: a change above the supported size is taken in whole (C001-REQ-122,
// the intake part of C001-TS-149) and carries the size warning (C001-REQ-121, C001-TS-147).

const scratch = mkdtempSync(join(tmpdir(), 'sddr-size-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 3 }));

describe('intake above the supported size', () => {
  it('takes in every file and hunk of 12,500 changed lines in 1,050 hunks over 340 files', async () => {
    const repo = buildFxSize();
    const git = new GitAdapter({ baseEnv: repo.env() });
    try {
      writeSizeChange(repo, { lines: 12_500, files: 340, hunks: 1_050 });
      const log = new ContextualLog(join(scratch, 'log.jsonl'));
      const store = new SnapshotStore(
        { log },
        new StoreLayout(join(scratch, 'store'), 'k'.repeat(64)),
      );
      const location = await git.discover(repo.dir);
      const result = await takeInChange(
        { git, store, log, repositoryRoot: location.workTreeRoot },
        { namedBase: repo.label('B0').hash },
      );
      if (result.status !== 'created') throw new Error('expected a new snapshot');
      const { snapshot, hunks, intakeSummary } = result.intake;
      expect(snapshot.changedFiles).toHaveLength(340);
      expect(hunks).toHaveLength(1_050);
      expect(snapshot.changedLines).toBe(12_500);
      expect(snapshot.sizeWarning).toBe(true);
      expect(intakeSummary).toMatchObject({ changedFiles: 340, changedLines: 12_500 });
      expect(intakeSummary.sizeWarning?.code).toBe('ERR-INTAKE-006');
      expect(intakeSummary.sizeWarning?.message).toContain('12,500 changed lines in 340 files');
      // every changed file's content is stored with the snapshot
      for (const file of snapshot.changedFiles) {
        expect((await store.readBlob(result.snapshotId, file.contentHash!)).length).toBeGreaterThan(
          0,
        );
      }
    } finally {
      await git.close();
      repo.dispose();
    }
  }, 240_000);

  it('raises no warning at exactly 10,000 changed lines over 300 files', async () => {
    const repo = buildFxSize();
    const git = new GitAdapter({ baseEnv: repo.env() });
    try {
      writeSizeChange(repo, { lines: 10_000, files: 300 });
      const log = new ContextualLog(join(scratch, 'log2.jsonl'));
      const store = new SnapshotStore(
        { log },
        new StoreLayout(join(scratch, 'store2'), 'k'.repeat(64)),
      );
      const location = await git.discover(repo.dir);
      const result = await takeInChange(
        { git, store, log, repositoryRoot: location.workTreeRoot },
        { namedBase: repo.label('B0').hash },
      );
      if (result.status !== 'created') throw new Error('expected a new snapshot');
      expect(result.intake.snapshot).toMatchObject({ changedLines: 10_000, sizeWarning: false });
      expect(result.intake.snapshot.changedFiles).toHaveLength(300);
      expect(result.intake.intakeSummary.sizeWarning).toBeNull();
    } finally {
      await git.close();
      repo.dispose();
    }
  }, 240_000);
});
