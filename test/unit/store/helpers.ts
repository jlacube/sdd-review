import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntakeDocument } from '../../../src/generated/analysis-results.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import { nodeFsOps, type FsOps, type StoreContext } from '../../../src/core/store/fsutil.js';
import { StoreLayout } from '../../../src/core/store/root.js';
import type { EntryInput } from '../../../src/core/store/record.js';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const CHILD_SCRIPT = join(REPO_ROOT, 'test', 'unit', 'store', 'child.ts');

export const SNAPSHOT_ID = `s-${'a'.repeat(64)}`;
export const SNAPSHOT_ID_2 = `s-${'b'.repeat(64)}`;

const created: string[] = [];

/** A fresh temporary directory (canonical path: macOS /private, Windows 8.3 names). */
export function tempDir(label = 'store'): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), `sdd-${label}-`)));
  created.push(dir);
  return dir;
}

export function cleanTempDirs(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

export interface Fixture {
  readonly dir: string;
  readonly snapshotDir: string;
  readonly logFile: string;
  readonly log: ContextualLog;
  readonly layout: StoreLayout;
  ctx(overrides?: Partial<StoreContext>): StoreContext;
}

export function fixture(snapshotId = SNAPSHOT_ID): Fixture {
  const dir = tempDir();
  const layout = new StoreLayout(join(dir, 'root'), 'k'.repeat(64));
  const snapshotDir = join(layout.repositoryDir, snapshotId);
  mkdirSync(snapshotDir, { recursive: true });
  const logFile = join(dir, 'log.jsonl');
  const log = new ContextualLog(logFile);
  return {
    dir,
    snapshotDir,
    logFile,
    log,
    layout,
    ctx: (overrides = {}) => ({ log, lockPollMs: 5, ...overrides }),
  };
}

export function loggedCodes(logFile: string): string[] {
  try {
    return readFileSync(logFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { code: string }).code);
  } catch {
    return [];
  }
}

export function readMark(n: number, surface: 'cli' | 'ui' = 'ui'): EntryInput {
  return {
    kind: 'read-mark',
    surface,
    user: { name: 'Ada', email: 'ada@example.test' },
    hunkIds: [`h-${n.toString(16).padStart(16, '0')}`],
  } as EntryInput;
}

export function errno(code: string, message = code): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Wraps the real file system; `wrap` may replace members to inject faults or record calls. */
export function fsWith(wrap: (real: FsOps) => Partial<FsOps>): FsOps {
  return { ...nodeFsOps, ...wrap(nodeFsOps) };
}

export function intakeDocument(snapshotId = SNAPSHOT_ID, hash = 'c'.repeat(40)): IntakeDocument {
  return {
    document: 'intake',
    formatVersion: 1,
    snapshot: {
      snapshotId,
      baseCommit: { hash: 'd'.repeat(40), subject: 'base' },
      baseChoice: 'named',
      headCommit: hash,
      changedFiles: [],
      changedLines: 0,
      sizeWarning: false,
      configurationSource: { default: true },
      createdAt: '2026-11-20T10:00:00.000Z',
    },
    hunks: [],
    notices: [],
  } as unknown as IntakeDocument;
}

export interface ChildResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs test/unit/store/child.ts in its own Node process (killed by the spec's own fault, or ending normally). */
export function runChild(spec: Record<string, unknown>): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', CHILD_SCRIPT, JSON.stringify(spec)], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

export function confirmedSeqs(file: string): number[] {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((row) => Number(row.split(':')[0]));
  } catch {
    return [];
  }
}
