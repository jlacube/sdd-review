// Spike C001-T-023: the prototype's data from a benchmark change. The hunks come from the
// change's intake document (`intake.json` of `sdd-review analyse --headless`, C001-IF-008), the
// file texts from git at the change's head (base for a deleted file). Preparation is not timed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { IntakeDocument } from '../../src/generated/analysis-results.js';
import type { SpikeDataset, SpikeFile, SpikeGroup } from './app/dataset.js';

export interface BenchChange {
  readonly id: string;
  readonly baseCommit: string;
  readonly headCommit: string;
  readonly changedLines: number;
  readonly changeLocation: { readonly checkout: string; readonly ref: string };
}

/** The benchmark changes of `bench/set/benchmark-set.json`. */
export function readBenchChanges(setFile: string): BenchChange[] {
  const set = JSON.parse(readFileSync(setFile, 'utf8')) as { benchmarkChanges: BenchChange[] };
  return set.benchmarkChanges;
}

/** The benchmark change with the most changed lines (task C001-T-023: "the largest"). */
export function largestChange(changes: readonly BenchChange[]): BenchChange {
  if (changes.length === 0) throw new Error('the benchmark set has no benchmark change');
  return [...changes].sort((a, b) => b.changedLines - a.changedLines)[0]!;
}

/** Environment of the spike's git processes: the repository-locating variables cleared. */
export function gitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const key of Object.keys(out)) {
    if (
      /^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|CONFIG.*)$/i.test(
        key,
      )
    ) {
      delete out[key];
    }
  }
  return out;
}

function git(repo: string, args: string[], input?: string): Buffer {
  const r = spawnSync('git', ['-C', repo, ...args], {
    env: gitEnv(),
    input,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} in ${repo}: ${r.stderr?.toString().trim() || r.error}`);
  }
  return r.stdout;
}

/** Reads blobs through one `git cat-file --batch`; a missing object gives null. */
export function readBlobs(repo: string, specs: readonly string[]): (Buffer | null)[] {
  if (specs.length === 0) return [];
  const out = git(repo, ['cat-file', '--batch'], `${specs.join('\n')}\n`);
  const blobs: (Buffer | null)[] = [];
  let at = 0;
  for (let i = 0; i < specs.length; i++) {
    const nl = out.indexOf(0x0a, at);
    const header = out.subarray(at, nl).toString('utf8');
    at = nl + 1;
    if (header.endsWith(' missing') || header.endsWith(' ambiguous')) {
      blobs.push(null);
      continue;
    }
    const size = Number(header.split(' ')[2]);
    blobs.push(out.subarray(at, at + size));
    at += size + 1;
  }
  return blobs;
}

/** Stand-in intent groups (2 to 10): by leading directory, the largest nine and "Other". */
export function groupsByDirectory(
  hunks: readonly { hunkId: string; path: string; lines: readonly unknown[] }[],
): { groups: SpikeGroup[]; assignment: Record<string, string> } {
  const keyOf = (p: string) => {
    const dirs = p.split('/').slice(0, -1);
    return dirs.length === 0 ? '(root)' : dirs.slice(0, 2).join('/');
  };
  const weight = new Map<string, number>();
  for (const h of hunks)
    weight.set(keyOf(h.path), (weight.get(keyOf(h.path)) ?? 0) + h.lines.length);
  const keys = [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const named = keys.slice(0, keys.length > 10 ? 9 : 10).map(([k]) => k);
  const groups: SpikeGroup[] = named.map((k, i) => ({ id: `g${i + 1}`, name: k }));
  if (keys.length > 10) groups.push({ id: 'g10', name: 'Other' });
  if (groups.length < 2) groups.push({ id: `g${groups.length + 1}`, name: 'Second group' });
  const idOf = new Map(named.map((k, i) => [k, `g${i + 1}`]));
  const assignment: Record<string, string> = {};
  for (const h of hunks) assignment[h.hunkId] = idOf.get(keyOf(h.path)) ?? 'g10';
  return { groups, assignment };
}

/** The dataset from an intake document and the repository it was taken from. */
export function datasetFromIntake(id: string, intake: IntakeDocument, repo: string): SpikeDataset {
  const { baseCommit, headCommit, changedFiles, changedLines } = intake.snapshot;
  const text = changedFiles.filter((f) => !f.binary);
  const specs = text.map((f) =>
    f.changeType === 'deleted'
      ? `${baseCommit.hash}:${f.oldPath ?? f.path}`
      : `${headCommit}:${f.path}`,
  );
  const blobs = readBlobs(repo, specs);
  const byPath = new Map(text.map((f, i) => [f.path, blobs[i]]));
  const files: SpikeFile[] = changedFiles.map((f) => {
    const blob = byPath.get(f.path);
    return {
      path: f.path,
      changeType: f.changeType,
      binary: f.binary || blob === null,
      side: f.changeType === 'deleted' ? 'old' : 'new',
      text: f.binary || !blob ? null : blob.toString('utf8'),
    };
  });
  const hunks = intake.hunks.map((h) => ({
    hunkId: h.hunkId,
    path: h.path,
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines.map((l) => ({ kind: l.kind, text: l.text })),
  }));
  return {
    schema: 'sdd-review-ui-spike-data/1',
    id,
    source: 'benchmark',
    changedLines,
    files,
    hunks,
    ...groupsByDirectory(hunks),
  };
}

/**
 * Takes in the benchmark change with the built CLI (`dist/cli/main.js analyse --headless`), with
 * the review store under the spike's cache, and returns its intake document. Refuses a checkout
 * that is not at the change's head or not clean.
 */
export function intakeOfChange(
  change: BenchChange,
  checkout: string,
  repoRoot: string,
  cacheDir: string,
): IntakeDocument {
  const cached = path.join(cacheDir, 'intake', change.id, 'intake.json');
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')) as IntakeDocument;
  if (!existsSync(checkout)) {
    throw new Error(`no checkout of ${change.id} at ${checkout} (bench/README.md: restoring)`);
  }
  const head = git(checkout, ['rev-parse', 'HEAD']).toString().trim();
  if (head !== change.headCommit) {
    throw new Error(
      `${checkout} is at ${head}, not at the head ${change.headCommit} of ${change.id} ` +
        `(git -C ${checkout} checkout ${change.changeLocation.ref})`,
    );
  }
  if (git(checkout, ['status', '--porcelain']).length > 0) {
    throw new Error(`${checkout} has uncommitted changes; the intake must see the change only`);
  }
  const cli = path.join(repoRoot, 'dist', 'cli', 'main.js');
  if (!existsSync(cli)) throw new Error(`${cli} is missing: run npm run build first`);
  const out = path.join(cacheDir, 'intake', change.id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.dirname(out), { recursive: true });
  const store = path.join(cacheDir, 'store');
  mkdirSync(store, { recursive: true });
  const r = spawnSync(
    process.execPath,
    [cli, 'analyse', '--headless', '--out', out, '--base', change.baseCommit],
    {
      cwd: checkout,
      env: { ...gitEnv(), LOCALAPPDATA: store, XDG_DATA_HOME: store },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
  if (r.status !== 0) throw new Error(`analyse --headless of ${change.id} exited ${r.status}`);
  return JSON.parse(readFileSync(cached, 'utf8')) as IntakeDocument;
}

/** The dataset of a benchmark change, cached in `<cacheDir>/data/<id>.json`. */
export function prepareBenchDataset(
  change: BenchChange,
  benchRoot: string,
  repoRoot: string,
  cacheDir: string,
): string {
  const file = path.join(cacheDir, 'data', `${change.id}.json`);
  if (existsSync(file)) return file;
  const checkout = path.join(benchRoot, change.changeLocation.checkout);
  const intake = intakeOfChange(change, checkout, repoRoot, cacheDir);
  const data = datasetFromIntake(change.id, intake, checkout);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data), 'utf8');
  return file;
}
