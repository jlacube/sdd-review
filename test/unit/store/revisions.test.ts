import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewError } from '../../../src/core/errors/review-error.js';
import {
  REVISION_DOCUMENTS,
  RevisionStore,
  type RevisionDocuments,
} from '../../../src/core/store/revisions.js';
import { renameWithRetry } from '../../../src/core/store/fsutil.js';
import { cleanTempDirs, errno, fixture, fsWith, loggedCodes } from './helpers.js';

afterEach(cleanTempDirs);

const docs = (revision: number) =>
  Object.fromEntries(
    REVISION_DOCUMENTS.map((d) => [d, { revision, d }]),
  ) as unknown as RevisionDocuments;

describe('revision write and switch (C001-ADR-005 item 5, architecture §4.2 item 3)', () => {
  it('has no current revision before the first commit', async () => {
    const f = fixture();
    const revisions = new RevisionStore(f.ctx(), f.snapshotDir);
    expect(await revisions.load()).toBeNull();
    expect(revisions.nextRevision()).toBe(1);
  });

  it('writes the complete set, names revision and appliedSeq in current, and removes the older revision', async () => {
    const f = fixture();
    const revisions = new RevisionStore(f.ctx(), f.snapshotDir);
    await revisions.commit(1, 4, docs(1));
    await revisions.commit(2, 9, docs(2));
    const dir = join(f.snapshotDir, 'analysis');
    expect(readdirSync(dir).sort()).toEqual(['2', 'current']);
    expect(readdirSync(join(dir, '2')).sort()).toEqual(
      REVISION_DOCUMENTS.map((d) => `${d}.json`).sort(),
    );
    expect(JSON.parse(readFileSync(join(dir, 'current'), 'utf8'))).toEqual({
      revision: 2,
      appliedSeq: 9,
    });
    const loaded = await revisions.load();
    expect(loaded).toMatchObject({ revision: 2, appliedSeq: 9 });
    expect(loaded?.documents.triage).toEqual({ revision: 2, d: 'triage' });
    expect(revisions.nextRevision()).toBe(3);
  });

  it('refuses an incomplete set and a bad revision number without touching current', async () => {
    const f = fixture();
    const revisions = new RevisionStore(f.ctx(), f.snapshotDir);
    await revisions.commit(1, 1, docs(1));
    const partial = { ...docs(2) } as Record<string, unknown>;
    delete partial.evidence;
    await expect(revisions.commit(2, 2, partial as never)).rejects.toMatchObject({
      code: 'ERR-STORE-001',
    });
    await expect(revisions.commit(0, 2, docs(2))).rejects.toMatchObject({ code: 'ERR-STORE-001' });
    expect((await revisions.load())?.revision).toBe(1);
  });

  it('restarts a revision folder left by a crashed attempt under the same number', async () => {
    const f = fixture();
    const revisions = new RevisionStore(f.ctx(), f.snapshotDir);
    await revisions.commit(1, 1, docs(1));
    await expect(
      new RevisionStore(
        f.ctx({
          onStep: (s) => {
            if (s === 'documents-written') throw new Error('simulated stop');
          },
        }),
        f.snapshotDir,
      ).commit(2, 2, docs(2)),
    ).rejects.toBeInstanceOf(ReviewError);
    expect((await revisions.load())?.revision).toBe(1);
    await revisions.commit(2, 2, docs(2));
    expect((await revisions.load())?.revision).toBe(2);
  });

  it('flushes every document, then the temporary current file, before the rename over current', async () => {
    const f = fixture();
    const events: string[] = [];
    const fds = new Map<number, string>();
    const fs = fsWith((real) => ({
      openSync: ((p: string, ...rest: unknown[]) => {
        const fd = (real.openSync as (...a: unknown[]) => number)(p, ...rest);
        fds.set(fd, String(p));
        return fd;
      }) as typeof real.openSync,
      fsyncSync: ((fd: number) => {
        events.push(`fsync:${(fds.get(fd) ?? '').split(/[\\/]/).slice(-2).join('/')}`);
        return real.fsyncSync(fd);
      }) as typeof real.fsyncSync,
      renameSync: ((from: string, to: string) => {
        events.push(`rename:${to.split(/[\\/]/).slice(-1)[0]}`);
        return real.renameSync(from, to);
      }) as typeof real.renameSync,
    }));
    await new RevisionStore(f.ctx({ fs }), f.snapshotDir).commit(1, 1, docs(1));
    const renameAt = events.indexOf('rename:current');
    expect(renameAt).toBeGreaterThan(0);
    for (const d of REVISION_DOCUMENTS) {
      const at = events.indexOf(`fsync:1/${d}.json`);
      expect(at, d).toBeGreaterThanOrEqual(0);
      expect(at, d).toBeLessThan(renameAt);
    }
    // The temporary file is flushed right before the rename.
    expect(events[renameAt - 1]).toMatch(/^fsync:analysis\/\.tmp-/);
  });

  it('keeps the previous revision current and logs ERR-STORE-001 when a document write fails (ENOSPC)', async () => {
    const f = fixture();
    await new RevisionStore(f.ctx(), f.snapshotDir).commit(1, 1, docs(1));
    const fs = fsWith(() => ({
      writeSync: (() => {
        throw errno('ENOSPC', 'injected');
      }) as never,
    }));
    const revisions = new RevisionStore(f.ctx({ fs }), f.snapshotDir);
    const error = await revisions.commit(2, 2, docs(2)).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'ERR-STORE-001' });
    expect(loggedCodes(f.logFile)).toContain('ERR-STORE-001');
    expect((await new RevisionStore(f.ctx(), f.snapshotDir).load())?.revision).toBe(1);
  });
});

describe('atomic replace of current on each operating system (ADR-005 item 5)', () => {
  function renameFaults(failures: number, code: string, platform: NodeJS.Platform) {
    const f = fixture();
    const state = { renames: 0, sleeps: [] as number[] };
    const fs = fsWith((real) => ({
      renameSync: ((from: string, to: string) => {
        if (to.endsWith('current')) {
          state.renames++;
          if (state.renames <= failures) throw errno(code, 'injected');
        }
        return real.renameSync(from, to);
      }) as typeof real.renameSync,
    }));
    const ctx = f.ctx({
      fs,
      platform,
      sleep: async (ms) => {
        state.sleeps.push(ms);
      },
    });
    return { f, state, ctx };
  }

  it.each(['EPERM', 'EBUSY', 'EACCES'])(
    'on Windows retries a rename refused with %s and then succeeds',
    async (code) => {
      const { f, state, ctx } = renameFaults(3, code, 'win32');
      const revisions = new RevisionStore(ctx, f.snapshotDir);
      await revisions.commit(1, 5, docs(1));
      expect(state.renames).toBe(4);
      expect(state.sleeps).toHaveLength(3);
      expect(await revisions.load()).toMatchObject({ revision: 1, appliedSeq: 5 });
    },
  );

  it('on Windows gives up after the 2 s budget: the revision does not become current, ERR-STORE-001 is logged', async () => {
    const { f, state, ctx } = renameFaults(Infinity, 'EPERM', 'win32');
    await new RevisionStore(f.ctx(), f.snapshotDir).commit(1, 1, docs(1));
    const revisions = new RevisionStore(ctx, f.snapshotDir);
    const error = await revisions.commit(2, 2, docs(2)).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'ERR-STORE-001' });
    expect(state.sleeps.reduce((a, b) => a + b, 0)).toBe(2000);
    expect(loggedCodes(f.logFile)).toContain('ERR-STORE-001');
    expect((await new RevisionStore(f.ctx(), f.snapshotDir).load())?.revision).toBe(1);
    // no temporary file is left behind
    expect(
      readdirSync(join(f.snapshotDir, 'analysis')).filter((n) => n.startsWith('.tmp-')),
    ).toEqual([]);
  });

  it('on macOS and Linux a refused rename is not retried', async () => {
    const f = fixture();
    let renames = 0;
    const sleeps: number[] = [];
    const ctx = f.ctx({
      platform: 'linux',
      fs: fsWith(() => ({
        renameSync: (() => {
          renames++;
          throw errno('EPERM', 'injected');
        }) as never,
      })),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await expect(renameWithRetry(ctx, 'a', 'b')).rejects.toMatchObject({ code: 'EPERM' });
    expect(renames).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('replaces an existing current file on this operating system with the real rename', async () => {
    const f = fixture();
    const revisions = new RevisionStore(f.ctx(), f.snapshotDir);
    for (let r = 1; r <= 5; r++) await revisions.commit(r, r, docs(r));
    expect((await revisions.load())?.revision).toBe(5);
  });
});

describe.skipIf(process.platform === 'win32')('owner-only permissions (POSIX)', () => {
  it('creates analysis folders with 0700 and documents and current with 0600', async () => {
    const f = fixture();
    await new RevisionStore(f.ctx(), f.snapshotDir).commit(1, 1, docs(1));
    const dir = join(f.snapshotDir, 'analysis');
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, '1')).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'current')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, '1', 'triage.json')).mode & 0o777).toBe(0o600);
  });
});
