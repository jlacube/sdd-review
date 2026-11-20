import { readFileSync, statSync, utimesSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewError } from '../../../src/core/errors/review-error.js';
import { withFileLock } from '../../../src/core/store/lock.js';
import { RecordStore, parseRecord, type EntryInput } from '../../../src/core/store/record.js';
import {
  SNAPSHOT_ID,
  cleanTempDirs,
  errno,
  fixture,
  fsWith,
  loggedCodes,
  readMark,
  sha256,
  type Fixture,
} from './helpers.js';

afterEach(cleanTempDirs);

const HEADER = {
  repositoryRoot: '/work/repo',
  baseCommit: 'd'.repeat(40),
  headCommit: 'c'.repeat(40),
  createdAt: '2026-11-20T10:00:00.000Z',
};

async function openRecord(f: Fixture, overrides = {}) {
  const store = new RecordStore(f.ctx(overrides), f.snapshotDir, SNAPSHOT_ID);
  await store.create(HEADER);
  return store;
}

const lines = (file: string) => readFileSync(file).toString('utf8').split('\n');

async function rejection(promise: Promise<unknown>): Promise<ReviewError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ReviewError);
    return error as ReviewError;
  }
  throw new Error('expected a rejection');
}

describe('record header and entries (C001-IF-009)', () => {
  it('writes a header as line 1 and is idempotent', async () => {
    const f = fixture();
    const store = await openRecord(f);
    await store.create({ ...HEADER, headCommit: 'e'.repeat(40) });
    const first = lines(store.file);
    expect(JSON.parse(first[0] as string)).toEqual({
      kind: 'header',
      formatVersion: 1,
      snapshotId: SNAPSHOT_ID,
      ...HEADER,
    });
    expect(first).toHaveLength(2); // header line and the empty piece after the final LF
  });

  it('numbers entries 1, 2, 3 and chains each to the hash of the previous line', async () => {
    const f = fixture();
    const store = await openRecord(f);
    for (let n = 1; n <= 5; n++) await store.append([readMark(n)]);
    const all = lines(store.file).slice(0, -1);
    expect(all).toHaveLength(6);
    all.slice(1).forEach((line, index) => {
      const entry = JSON.parse(line) as {
        seq: number;
        prevHash: string;
        snapshotId: string;
        time: string;
      };
      expect(entry.seq).toBe(index + 1);
      expect(entry.prevHash).toBe(sha256(all[index] as string)); // header line for the first entry
      expect(entry.snapshotId).toBe(SNAPSHOT_ID);
      expect(Number.isNaN(Date.parse(entry.time))).toBe(false);
    });
    const read = await store.read();
    expect(read.entries.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(read.unfinishedTail).toBe(false);
  });

  it('ends every line with a single LF and writes UTF-8 (no CRLF translation)', async () => {
    const f = fixture();
    const store = await openRecord(f);
    await store.append([
      { ...readMark(1), user: { name: 'Zoë ☃', email: 'z@example.test' } } as EntryInput,
    ]);
    const bytes = readFileSync(store.file);
    expect(bytes.includes(0x0d)).toBe(false);
    expect(bytes.at(-1)).toBe(0x0a);
    expect(bytes.toString('utf8')).toContain('Zoë ☃');
  });

  it('writes a defect report and its escalation in one write and one flush, escalation naming the report', async () => {
    const f = fixture();
    const calls: string[] = [];
    const fds = new Map<number, string>();
    const fs = fsWith((real) => ({
      openSync: ((p: string, ...rest: unknown[]) => {
        const fd = (real.openSync as (...a: unknown[]) => number)(p, ...rest);
        fds.set(fd, String(p));
        return fd;
      }) as typeof real.openSync,
      writeSync: ((fd: number, ...rest: unknown[]) => {
        if (fds.get(fd)?.endsWith('review-record.jsonl')) calls.push('write');
        return (real.writeSync as (...a: unknown[]) => number)(fd, ...rest);
      }) as typeof real.writeSync,
      fsyncSync: ((fd: number) => {
        if (fds.get(fd)?.endsWith('review-record.jsonl')) calls.push('fsync');
        return real.fsyncSync(fd);
      }) as typeof real.fsyncSync,
    }));
    const store = await openRecord(f, { fs });
    await store.append([readMark(1)]);
    calls.length = 0;
    const user = { name: 'Ada', email: 'ada@example.test' };
    const written = await store.append(
      (firstSeq) =>
        [
          {
            kind: 'defect-report',
            surface: 'ui',
            user,
            hunkId: 'h-0000000000000001',
            text: 'rounding',
            rules: ['formatting'],
          },
          {
            kind: 'escalation',
            surface: 'ui',
            user,
            defectReportSeq: firstSeq,
            rules: ['formatting'],
            reopenedHunkIds: [],
          },
        ] as unknown as EntryInput[],
    );
    expect(calls).toEqual(['write', 'fsync']);
    expect(written.map((e) => e.seq)).toEqual([2, 3]);
    expect((written[1] as { defectReportSeq: number }).defectReportSeq).toBe(2);
    expect((await store.read()).entries).toHaveLength(3);
  });

  it('is on disk, written then flushed, before the append call returns (flush order)', async () => {
    const f = fixture();
    const events: string[] = [];
    const fds = new Map<number, string>();
    const fs = fsWith((real) => ({
      openSync: ((p: string, ...rest: unknown[]) => {
        const fd = (real.openSync as (...a: unknown[]) => number)(p, ...rest);
        fds.set(fd, String(p));
        return fd;
      }) as typeof real.openSync,
      writeSync: ((fd: number, ...rest: unknown[]) => {
        if (fds.get(fd)?.endsWith('review-record.jsonl')) events.push('write');
        return (real.writeSync as (...a: unknown[]) => number)(fd, ...rest);
      }) as typeof real.writeSync,
      fsyncSync: ((fd: number) => {
        if (fds.get(fd)?.endsWith('review-record.jsonl')) events.push('fsync');
        return real.fsyncSync(fd);
      }) as typeof real.fsyncSync,
    }));
    const store = await openRecord(f, { fs });
    events.length = 0;
    const promise = store.append([readMark(1)]).then((written) => {
      events.push('returned');
      return written;
    });
    await promise;
    expect(events).toEqual(['write', 'fsync', 'returned']);
    // Bytes are readable by another reader the moment the call returned.
    expect(lines(store.file)).toHaveLength(3);
  });

  it('keeps earlier entries byte-identical when later entries are appended (C001-REQ-713, TS-735, TS-736)', async () => {
    const f = fixture();
    const store = await openRecord(f);
    for (let n = 1; n <= 3; n++) await store.append([readMark(n)]);
    const copy = readFileSync(store.file);
    const second = await openRecord(f); // a second session
    await second.append([readMark(4, 'cli'), readMark(5, 'cli')]);
    const now = readFileSync(store.file);
    expect(now.subarray(0, copy.length).equals(copy)).toBe(true);
    expect((await second.read()).entries).toHaveLength(5);
  });

  it('refuses to append to a snapshot with no record (ERR-STORE-004)', async () => {
    const f = fixture();
    const store = new RecordStore(f.ctx(), f.snapshotDir, SNAPSHOT_ID);
    expect((await rejection(store.append([readMark(1)]))).code).toBe('ERR-STORE-004');
  });
});

describe('torn writes and damage (ERR-STORE-002)', () => {
  async function recordWith(f: Fixture, n: number) {
    const store = await openRecord(f);
    for (let i = 1; i <= n; i++) await store.append([readMark(i)]);
    return store;
  }

  it('ignores an unfinished last line and removes it under the lock before the next append', async () => {
    const f = fixture();
    const store = await recordWith(f, 3);
    const good = readFileSync(store.file);
    appendFileSync(store.file, '{"kind":"read-mark","seq":4,"ti'); // torn write, no LF
    const read = await store.read();
    expect(read.entries).toHaveLength(3);
    expect(read.unfinishedTail).toBe(true);

    const [entry] = await store.append([readMark(4)]);
    expect(entry?.seq).toBe(4);
    const now = readFileSync(store.file);
    expect(now.subarray(0, good.length).equals(good)).toBe(true);
    expect(parseRecord(now, SNAPSHOT_ID).entries).toHaveLength(4);
  });

  it('treats a complete JSON object without its LF as unfinished, not as an entry', async () => {
    const f = fixture();
    const store = await recordWith(f, 2);
    const all = lines(store.file).slice(0, -1);
    const next = {
      ...JSON.parse(all.at(-1) as string),
      seq: 3,
      prevHash: sha256(all.at(-1) as string),
    };
    appendFileSync(store.file, JSON.stringify(next)); // no LF
    expect((await store.read()).entries).toHaveLength(2);
    expect(await store.removeUnfinishedTail()).toBe(true);
    expect(await store.removeUnfinishedTail()).toBe(false);
    expect((await store.read()).unfinishedTail).toBe(false);
  });

  it('detects a corrupted middle line with its line number and writes nothing', async () => {
    const f = fixture();
    const store = await recordWith(f, 4);
    const all = readFileSync(store.file, 'utf8').split('\n');
    all[2] = (all[2] as string).replace('{"kind"', '{kind'); // line 3: not JSON any more
    writeFileSync(store.file, all.join('\n'));
    const before = readFileSync(store.file);

    const error = await rejection(store.append([readMark(9)]));
    expect(error.code).toBe('ERR-STORE-002');
    expect(error.message).toContain('line 3');
    expect(error.message).toContain(SNAPSHOT_ID);
    expect(readFileSync(store.file).equals(before)).toBe(true);
    expect((await rejection(store.read())).code).toBe('ERR-STORE-002');
    expect(loggedCodes(f.logFile)).toContain('ERR-STORE-002');
  });

  it('detects a changed earlier line by the previous-line hash of the next one', async () => {
    const f = fixture();
    const store = await recordWith(f, 3);
    const all = readFileSync(store.file, 'utf8').split('\n');
    all[1] = (all[1] as string).replace('"ui"', '"cli"'); // line 2 still valid JSON, but altered
    writeFileSync(store.file, all.join('\n'));
    const error = await rejection(store.read());
    expect(error.code).toBe('ERR-STORE-002');
    expect(error.message).toContain('line 3');
  });

  it('detects a removed or repeated entry by its sequence number', async () => {
    const f = fixture();
    const store = await recordWith(f, 3);
    const all = readFileSync(store.file, 'utf8').split('\n');
    all.splice(2, 1); // drop entry 2
    writeFileSync(store.file, all.join('\n'));
    expect((await rejection(store.read())).code).toBe('ERR-STORE-002');
  });

  it('treats an unparsable last line that ends in LF as damage, not as a torn write', async () => {
    const f = fixture();
    const store = await recordWith(f, 2);
    appendFileSync(store.file, 'garbage\n');
    const error = await rejection(store.read());
    expect(error.code).toBe('ERR-STORE-002');
    expect(error.message).toContain('line 4');
  });

  it('starts the header again when its creation was torn', async () => {
    const f = fixture();
    const file = new RecordStore(f.ctx(), f.snapshotDir, SNAPSHOT_ID).file;
    writeFileSync(file, '{"kind":"head');
    const store = await openRecord(f);
    expect((await store.read()).header.kind).toBe('header');
  });
});

describe('write failures (ERR-STORE-001, C001-REQ-920, TS-945)', () => {
  it.each(['ENOSPC', 'EACCES', 'EROFS'])(
    'refuses and logs when the write fails with %s, leaving the record as it was',
    async (code) => {
      const f = fixture();
      let armed = false;
      const fs = fsWith((real) => ({
        writeSync: ((...args: Parameters<typeof real.writeSync>) => {
          if (!armed) return (real.writeSync as (...a: unknown[]) => number)(...args);
          // Half of the data reaches the file before the failure.
          const data = args[1];
          if (typeof data === 'string') {
            return (real.writeSync as (...a: unknown[]) => number)(...args); // the lock file
          }
          real.writeSync(args[0], (data as Buffer).subarray(0, Math.floor(data.length / 2)));
          throw errno(code, 'injected');
        }) as typeof real.writeSync,
      }));
      const store = await openRecord(f, { fs });
      await store.append([readMark(1)]);
      const before = readFileSync(store.file);
      armed = true;

      const error = await rejection(store.append([readMark(2)]));
      expect(error.code).toBe('ERR-STORE-001');
      expect(error.message).toContain(code);
      expect(error.message).toContain('Nothing was recorded');
      expect(readFileSync(store.file).equals(before)).toBe(true);
      expect(loggedCodes(f.logFile)).toContain('ERR-STORE-001');
      armed = false;
      expect((await store.append([readMark(2)]))[0]?.seq).toBe(2);
    },
  );

  it('refuses when the flush fails and removes the written line (nothing was recorded)', async () => {
    const f = fixture();
    let armed = false;
    const fs = fsWith((real) => ({
      fsyncSync: ((fd: number) => {
        if (armed) throw errno('EIO', 'injected');
        return real.fsyncSync(fd);
      }) as typeof real.fsyncSync,
    }));
    const store = await openRecord(f, { fs });
    const before = readFileSync(store.file);
    armed = true;
    expect((await rejection(store.append([readMark(1)]))).code).toBe('ERR-STORE-001');
    expect(readFileSync(store.file).equals(before)).toBe(true);
  });

  it('refuses when the record cannot be opened for appending', async () => {
    const f = fixture();
    let armed = false;
    const fs = fsWith((real) => ({
      openSync: ((p: string, flags: string, ...rest: unknown[]) => {
        if (armed && flags === 'a') throw errno('EACCES', 'injected');
        return (real.openSync as (...a: unknown[]) => number)(p, flags, ...rest);
      }) as typeof real.openSync,
    }));
    const store = await openRecord(f, { fs });
    armed = true;
    expect((await rejection(store.append([readMark(1)]))).code).toBe('ERR-STORE-001');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'refuses on a read-only record file (real EACCES on POSIX)',
    async () => {
      const f = fixture();
      const store = await openRecord(f);
      const { chmodSync } = await import('node:fs');
      chmodSync(store.file, 0o400);
      try {
        expect((await rejection(store.append([readMark(1)]))).code).toBe('ERR-STORE-001');
      } finally {
        chmodSync(store.file, 0o600);
      }
    },
  );
});

describe('record lock (C001-ADR-005 item 6, ERR-STORE-003)', () => {
  it('fails with ERR-STORE-003 after the injected timeout when a live process holds the lock', async () => {
    const f = fixture();
    const store = await openRecord(f, { lockTimeoutMs: 120 });
    let seen: ReviewError | undefined;
    await withFileLock(f.ctx(), store.lockFile, async () => {
      const started = Date.now();
      seen = await rejection(store.append([readMark(1)]));
      expect(Date.now() - started).toBeGreaterThanOrEqual(100);
      expect(Date.now() - started).toBeLessThan(3000);
    });
    expect(seen?.code).toBe('ERR-STORE-003');
    expect(seen?.message).toBe('The review record is busy; the action was not saved.');
    expect(loggedCodes(f.logFile)).toContain('ERR-STORE-003');
    expect((await store.read()).entries).toHaveLength(0);
  });

  it('uses 10 s and 30 s as defaults', () => {
    const src = readFileSync(new URL('../../../src/core/store/fsutil.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/LOCK_TIMEOUT_MS = 10_000/);
    expect(src).toMatch(/LOCK_STALE_MS = 30_000/);
  });

  it('removes the lock after the append and after a failed append', async () => {
    const f = fixture();
    const store = await openRecord(f);
    await store.append([readMark(1)]);
    expect(() => statSync(store.lockFile)).toThrow();
    const failing = await openRecord(f, {
      fs: fsWith(() => ({
        fsyncSync: (() => {
          throw errno('EIO');
        }) as never,
      })),
    });
    await rejection(failing.append([readMark(2)]));
    expect(() => statSync(store.lockFile)).toThrow();
  });

  it('removes a lock whose owner process is gone, at once', async () => {
    const f = fixture();
    const store = await openRecord(f, { lockTimeoutMs: 2000 });
    const dead = spawnSync(process.execPath, ['-e', '']).pid;
    writeFileSync(store.lockFile, JSON.stringify({ pid: dead, token: 'x' }));
    const started = Date.now();
    await store.append([readMark(1)]);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('removes a lock older than the stale limit even when its owner runs', async () => {
    const f = fixture();
    const store = await openRecord(f, { lockTimeoutMs: 2000 });
    writeFileSync(store.lockFile, JSON.stringify({ pid: process.pid, token: 'x' }));
    const old = new Date(Date.now() - 31_000);
    utimesSync(store.lockFile, old, old);
    await store.append([readMark(1)]);
    expect((await store.read()).entries).toHaveLength(1);
  });

  it('waits for an unfinished (empty) lock file until it is older than the stale limit', async () => {
    const f = fixture();
    const store = await openRecord(f, { lockTimeoutMs: 150 });
    writeFileSync(store.lockFile, '');
    expect((await rejection(store.append([readMark(1)]))).code).toBe('ERR-STORE-003');
    const old = new Date(Date.now() - 31_000);
    utimesSync(store.lockFile, old, old);
    await store.append([readMark(1)]);
  });

  it('does not remove a lock it no longer owns when it releases', async () => {
    const f = fixture();
    const store = await openRecord(f);
    await withFileLock(f.ctx(), store.lockFile, () => {
      writeFileSync(store.lockFile, JSON.stringify({ pid: process.pid, token: 'someone-else' }));
    });
    expect(readFileSync(store.lockFile, 'utf8')).toContain('someone-else');
  });
});
