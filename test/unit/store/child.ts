/**
 * Child process of the store tests. Runs one scripted job against a snapshot folder and, when the
 * spec says so, kills itself (SIGKILL; TerminateProcess on Windows) at a named step or in the middle
 * of a write, so the parent can check what survived.
 */
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { ContextualLog } from '../../../src/core/log/log.js';
import {
  nodeFsOps,
  type FsOps,
  type StepName,
  type StoreContext,
} from '../../../src/core/store/fsutil.js';
import { withFileLock } from '../../../src/core/store/lock.js';
import { RecordStore, type EntryInput } from '../../../src/core/store/record.js';
import { RevisionStore, REVISION_DOCUMENTS } from '../../../src/core/store/revisions.js';

interface Spec {
  mode: 'append' | 'revision' | 'hold' | 'reader';
  snapshotDir: string;
  snapshotId: string;
  logFile: string;
  /** Confirmation file: one line per confirmed append / committed revision. */
  confirmFile?: string;
  label?: number;
  count?: number;
  killAt?: { step: StepName; nth: number };
  /** Write only half of the nth write to a file whose path contains `match`, then die. */
  partialWrite?: { match: string; nth: number };
  fromRevision?: number;
  toRevision?: number;
  readyFile?: string;
  releaseFile?: string;
  durationMs?: number;
  resultFile?: string;
}

const spec = JSON.parse(process.argv[2] ?? '{}') as Spec;
const die = (): never => {
  process.kill(process.pid, 'SIGKILL');
  for (;;) {
    /* wait for the kill */
  }
};

const paths = new Map<number, string>();
let partialCalls = 0;
const fs: FsOps = {
  ...nodeFsOps,
  openSync: ((path: string, ...rest: unknown[]) => {
    const fd = (nodeFsOps.openSync as (...a: unknown[]) => number)(path, ...rest);
    paths.set(fd, String(path));
    return fd;
  }) as FsOps['openSync'],
  writeSync: ((fd: number, data: Buffer, ...rest: number[]) => {
    const partial = spec.partialWrite;
    if (
      partial &&
      typeof data !== 'string' && // the lock file's content is a string: not a document write
      paths.get(fd)?.includes(partial.match) &&
      ++partialCalls === partial.nth
    ) {
      nodeFsOps.writeSync(fd, data.subarray(0, Math.max(1, Math.floor(data.length / 2))));
      nodeFsOps.fsyncSync(fd);
      die();
    }
    return (nodeFsOps.writeSync as (...a: unknown[]) => number)(fd, data, ...rest);
  }) as FsOps['writeSync'],
};

const counts = new Map<StepName, number>();
const ctx: StoreContext = {
  log: new ContextualLog(spec.logFile),
  fs,
  lockPollMs: 5,
  onStep: (step) => {
    const n = (counts.get(step) ?? 0) + 1;
    counts.set(step, n);
    if (spec.killAt?.step === step && spec.killAt.nth === n) die();
  },
};

const confirm = (line: string) => {
  if (spec.confirmFile) appendFileSync(spec.confirmFile, `${line}\n`);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  if (spec.mode === 'append') {
    const record = new RecordStore(ctx, spec.snapshotDir, spec.snapshotId);
    for (let i = 1; i <= (spec.count ?? 1); i++) {
      const entry: EntryInput = {
        kind: 'read-mark',
        surface: 'cli',
        user: { name: `Writer ${spec.label ?? 0}`, email: 'w@example.test' },
        hunkIds: [`h-${((spec.label ?? 0) * 1000 + i).toString(16).padStart(16, '0')}`],
      } as EntryInput;
      const [written] = await record.append([entry]);
      confirm(`${written?.seq}:${spec.label ?? 0}:${i}`);
    }
  } else if (spec.mode === 'revision') {
    const revisions = new RevisionStore(ctx, spec.snapshotDir);
    for (let r = spec.fromRevision ?? 1; r <= (spec.toRevision ?? 1); r++) {
      const documents = Object.fromEntries(REVISION_DOCUMENTS.map((d) => [d, { revision: r, d }]));
      await revisions.commit(r, r * 10, documents as never);
      confirm(String(r));
    }
  } else if (spec.mode === 'hold') {
    await withFileLock(ctx, `${spec.snapshotDir}/review-record.jsonl.lock`, async () => {
      writeFileSync(spec.readyFile as string, 'ready');
      while (!existsSync(spec.releaseFile as string)) await sleep(10);
    });
  } else {
    const revisions = new RevisionStore(ctx, spec.snapshotDir);
    const until = Date.now() + (spec.durationMs ?? 1000);
    let reads = 0;
    let last = 0;
    const problems: string[] = [];
    while (Date.now() < until) {
      try {
        const loaded = await revisions.load();
        if (!loaded) continue;
        reads++;
        for (const d of REVISION_DOCUMENTS) {
          if ((loaded.documents[d] as { revision: number }).revision !== loaded.revision) {
            problems.push(`document ${d} of revision ${loaded.revision} is from another revision`);
          }
        }
        if (loaded.revision < last)
          problems.push(`revision went back from ${last} to ${loaded.revision}`);
        last = loaded.revision;
      } catch (error) {
        problems.push(String(error));
      }
    }
    writeFileSync(spec.resultFile as string, JSON.stringify({ reads, last, problems }));
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(3);
  },
);
