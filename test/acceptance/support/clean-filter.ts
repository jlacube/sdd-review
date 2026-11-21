import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import type { AcceptanceWorld } from './world.js';

// Helpers of the CAP-01 steps for files under a clean filter (C001-REQ-126 to C001-REQ-128,
// C001-T-028): reading the intake document, notice ERR-INTAKE-009, index entries, and states that
// a scenario makes with git without running the repository's filters at intake.

export interface ListedFile {
  readonly path: string;
  readonly changeType: string;
  readonly changedLines: number;
  readonly binary: boolean;
  readonly contentHash: string | null;
}

export interface IntakeWithFiles {
  snapshot: { snapshotId: string; changedFiles: ListedFile[] };
  notices: Array<{ code: string; message: string }>;
}

export function intakeDoc(world: AcceptanceWorld): IntakeWithFiles {
  const run = world.lastRun;
  assert.ok(run, 'the CLI was not run');
  assert.equal(run.status, 0, `the CLI exited with ${run.status}: ${run.stderr}${run.stdout}`);
  return world.headless!.json<IntakeWithFiles>('intake.json');
}

export function listed(world: AcceptanceWorld, path: string): ListedFile {
  const file = intakeDoc(world).snapshot.changedFiles.find((f) => f.path === path);
  assert.ok(file, `${path} is not listed`);
  return file;
}

export const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Asserts that the snapshot content of a listed file is these bytes (the store names it by hash). */
export function assertSnapshotContent(world: AcceptanceWorld, path: string, bytes: Buffer): void {
  assert.equal(listed(world, path).contentHash, sha256(bytes), `snapshot content of ${path}`);
}

/** "3,000" → 3000. */
export const count = (text: string) => Number(text.replace(/,/g, ''));

// ---- Notice ERR-INTAKE-009 ---------------------------------------------------------------------

export interface CleanFilterNoticeView {
  readonly count: number;
  readonly drivers: string[];
  readonly entries: Array<{ path: string; cause: string }>;
  readonly message: string;
}

const CAUSES = [
  'content matches no Git LFS pointer file',
  "not up to date in git's index",
  "no entry in git's index",
  'index blob missing',
];

export function cleanFilterNotices(world: AcceptanceWorld): CleanFilterNoticeView[] {
  return intakeDoc(world)
    .notices.filter((n) => n.code === 'ERR-INTAKE-009')
    .map((n) => {
      const m =
        /^(\d[\d,]*) files under a clean filter \(([^)]*)\) are listed as changed by their working-tree bytes, because .* git may store the same content for some of them \((.*)\)\.$/s.exec(
          n.message,
        );
      assert.ok(m, `ERR-INTAKE-009 does not have the catalogue form: ${n.message}`);
      const entries: Array<{ path: string; cause: string }> = [];
      const alternatives = CAUSES.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const re = new RegExp(`(?:^|, )(.+?) \\((${alternatives})\\)`, 'g');
      for (let e = re.exec(m[3]!); e; e = re.exec(m[3]!)) {
        entries.push({ path: e[1]!, cause: e[2]! });
      }
      return {
        count: count(m[1]!),
        drivers: m[2]!.split(', '),
        entries,
        message: n.message,
      };
    });
}

/** The one notice ERR-INTAKE-009 of the intake, with the CLI's own report of it. */
export function theCleanFilterNotice(world: AcceptanceWorld): CleanFilterNoticeView {
  const notices = cleanFilterNotices(world);
  assert.equal(notices.length, 1, 'intake reports exactly one notice ERR-INTAKE-009');
  return notices[0]!;
}

export function assertNamed(
  notice: CleanFilterNoticeView,
  path: string,
  cause: string,
  driver?: string,
): void {
  const entry = notice.entries.find((e) => e.path === path);
  assert.ok(entry, `the notice does not name ${path}: ${notice.message}`);
  assert.equal(entry.cause, cause);
  if (driver) assert.ok(notice.drivers.includes(driver), `the notice names no driver ${driver}`);
}

// ---- Index entries and states --------------------------------------------------------------------

export interface EntryView {
  readonly blob: string;
  readonly mtimeSeconds: number;
  readonly mtimeNanoseconds: number;
}

/** The stage-0 index entry of a path, as `git ls-files --debug` prints it. */
export function indexEntry(repo: FixtureRepo, path: string): EntryView {
  const out = repo.git('ls-files', '-s', '--debug', '--', path);
  const m = /^\d{6} ([0-9a-f]+) 0\t[^\n]*\n\s+ctime: \d+:\d+\n\s+mtime: (\d+):(\d+)/.exec(out);
  assert.ok(m, `no index entry for ${path}: ${out}`);
  return { blob: m[1]!, mtimeSeconds: Number(m[2]), mtimeNanoseconds: Number(m[3]) };
}

/** The bytes of a blob, read without any filter. */
export function blobBytes(repo: FixtureRepo, spec: string): Buffer {
  return execFileSync('git', ['cat-file', 'blob', spec], { cwd: repo.dir, env: repo.env() });
}

/** Whole-second modification time in the past, so that git records an entry that is not racy. */
export function settle(repo: FixtureRepo, path: string, secondsBack = 3600): void {
  const t = Math.floor(Date.now() / 1000) - secondsBack;
  utimesSync(repo.path(path), t, t);
}

/** Sets the modification time of the index file to the one the entry records: a racy entry. */
export function makeRacy(repo: FixtureRepo, path: string): void {
  const entry = indexEntry(repo, path);
  const t = entry.mtimeSeconds + entry.mtimeNanoseconds / 1e9;
  utimesSync(join(repo.dir, '.git', 'index'), t, t);
}

/**
 * Writes the index so that the entry of `path` records `blob` with the stat data of the file as
 * it is now, and is not racy: git refreshes its index with a clean command, given for this one
 * command, that prints that blob (C001-IF-012 §7 item 8). `.git/info/attributes`, which outranks
 * every `.gitattributes` file, assigns that command to the path for the duration of the refresh.
 */
export function forgeIndexEntry(repo: FixtureRepo, path: string, blob: string): void {
  const dir = join(repo.dir, '.git', 'sdd-fixture-forge');
  const content = join(dir, 'blob');
  mkdirSync(dir, { recursive: true });
  writeFileSync(content, blobBytes(repo, blob));
  const info = join(repo.dir, '.git', 'info', 'attributes');
  const saved = existsSync(info) ? readFileSync(info) : null;
  writeFileSync(info, `${path} filter=sddforge\n`);
  settle(repo, path, 600);
  try {
    execFileSync(
      'git',
      [
        '-c',
        `filter.sddforge.clean=cat "${content.replace(/\\/g, '/')}"`,
        'update-index',
        '-q',
        '--really-refresh',
      ],
      { cwd: repo.dir, env: repo.env(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } finally {
    if (saved) writeFileSync(info, saved);
    else rmSync(info, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(indexEntry(repo, path).blob, blob, 'the forged entry records the blob');
}

/** Writes new text content of `n` bytes, settles its time stamp and stages it (filters run here). */
export function stageNewContent(world: AcceptanceWorld, path: string, n: number): Buffer {
  const repo = world.repo!;
  const bytes = Buffer.from(`SECRET=${'s'.repeat(n - 8)}\n`);
  assert.equal(bytes.length, n);
  repo.write(path, bytes);
  settle(repo, path, 600);
  repo.stage(path);
  return bytes;
}

/** Hashes of files recorded before a review (`the test has recorded the hash of …`). */
export const recordedHashes = new WeakMap<AcceptanceWorld, Map<string, string>>();

export function recordHash(world: AcceptanceWorld, file: string): void {
  const map = recordedHashes.get(world) ?? new Map<string, string>();
  map.set(file, sha256(readFileSync(world.repo!.path(file))));
  recordedHashes.set(world, map);
}
