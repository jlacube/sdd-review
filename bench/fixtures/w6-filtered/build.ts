// The W6 fixture of C001-T-020 (C001-ADR-006 A1.6): a benchmark change of C001-NFR-005 with added
// Git LFS files and files under another clean filter. Built outside this repository, under
// `<bench root>/fixtures/w6-filtered`, from the reference checkout of the benchmark change; used by
// W6 in C001-T-021 and by K1 and K2 in C001-T-022. See README.md next to this file.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeLocatingVariables } from '../../../src/core/git/environment.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface W6Options {
  /** Directory holding `ref/<repository>`; the fixture goes to `<benchRoot>/fixtures/w6-filtered`. */
  readonly benchRoot: string;
  /** Reference checkout relative to benchRoot and the branch of the benchmark change. */
  readonly source: { readonly checkout: string; readonly ref: string };
  readonly lfsFiles: number;
  readonly lfsSizeKiB: number;
  readonly filteredFiles: number;
  readonly filteredSizeKiB: number;
  /** `copy`: every covered file can get its working-tree copy; `stored`: none can. */
  readonly state: 'copy' | 'stored';
}

export const W6_DEFAULTS = {
  source: { checkout: 'ref/class-validator', ref: 'bench/bench-ts' },
  lfsFiles: 20,
  lfsSizeKiB: 1024,
  filteredFiles: 40,
  filteredSizeKiB: 16,
  state: 'copy',
} as const;

export const LFS_DIR = 'w6-fixture/lfs';
export const FILTERED_DIR = 'w6-fixture/filtered';
const COMMIT_SUBJECT = 'W6 fixture: Git LFS files and files under the sddr-b64 filter';

/** Deterministic bytes (xorshift32) for file `index` of `kind`. */
export function fixtureBytes(kind: 'lfs' | 'filtered', index: number, size: number): Buffer {
  let x = (kind === 'lfs' ? 0x9e3779b9 : 0x85ebca6b) ^ ((index + 1) * 2654435761);
  x >>>= 0;
  if (x === 0) x = 1;
  const out = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

export const fileName = (kind: 'lfs' | 'filtered', i: number) =>
  kind === 'lfs'
    ? `${LFS_DIR}/asset-${String(i + 1).padStart(3, '0')}.bin`
    : `${FILTERED_DIR}/secret-${String(i + 1).padStart(3, '0')}.dat`;

export interface W6Result {
  readonly dir: string;
  readonly head: string;
  readonly state: 'copy' | 'stored';
  readonly lfsFiles: number;
  readonly filteredFiles: number;
  readonly coveredBytes: number;
  readonly created: boolean;
}

/** Builds (or brings to `state`) the W6 fixture. Idempotent. */
export function buildW6(o: W6Options): W6Result {
  const dir = path.join(o.benchRoot, 'fixtures', 'w6-filtered');
  const env = { ...removeLocatingVariables(process.env), GIT_TERMINAL_PROMPT: '0' };
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', dir, ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  let created = false;
  if (!existsSync(path.join(dir, '.git'))) {
    mkdirSync(path.dirname(dir), { recursive: true });
    execFileSync(
      'git',
      [
        'clone',
        '-q',
        '--no-hardlinks',
        '-b',
        o.source.ref,
        path.join(o.benchRoot, o.source.checkout),
        dir,
      ],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    created = true;
  }
  const filter = path.join(here, 'b64-filter.mjs').split(path.sep).join('/');
  git('lfs', 'install', '--local');
  git('config', 'filter.sddr-b64.clean', `node "${filter}" clean`);
  git('config', 'filter.sddr-b64.smudge', `node "${filter}" smudge`);
  git('config', 'filter.sddr-b64.required', 'true');
  git('config', 'user.name', 'W6 fixture');
  git('config', 'user.email', 'w6-fixture@example.invalid');

  const write = (kind: 'lfs' | 'filtered', i: number, flip: boolean) => {
    const size = (kind === 'lfs' ? o.lfsSizeKiB : o.filteredSizeKiB) * 1024;
    const bytes = fixtureBytes(kind, i, size);
    if (flip) bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
    const abs = path.join(dir, ...fileName(kind, i).split('/'));
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
  };

  const subject = git('log', '-1', '--format=%s');
  if (subject !== COMMIT_SUBJECT) {
    const attrs = path.join(dir, LFS_DIR.split('/')[0]!, '.gitattributes');
    mkdirSync(path.dirname(attrs), { recursive: true });
    writeFileSync(
      attrs,
      'lfs/*.bin filter=lfs diff=lfs merge=lfs -text\nfiltered/*.dat filter=sddr-b64 -text\n',
    );
    for (let i = 0; i < o.lfsFiles; i++) write('lfs', i, false);
    for (let i = 0; i < o.filteredFiles; i++) write('filtered', i, false);
    git('add', '--', LFS_DIR.split('/')[0]!);
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', COMMIT_SUBJECT], {
      env: {
        ...env,
        GIT_AUTHOR_DATE: '2026-11-21T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-11-21T00:00:00Z',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  // Bring the working tree to the requested state.
  for (let i = 0; i < o.lfsFiles; i++) write('lfs', i, o.state === 'stored');
  if (o.state === 'copy') {
    for (let i = 0; i < o.filteredFiles; i++) write('filtered', i, false);
    // Index stat data current again (runs the clean filter on the stat-dirty files).
    git('update-index', '-q', '--refresh');
  } else {
    // Same bytes, newer modification time: the index entry is no longer up to date (G-15).
    for (let i = 0; i < o.filteredFiles; i++) {
      const abs = path.join(dir, ...fileName('filtered', i).split('/'));
      const t = new Date(statSync(abs).mtimeMs + 5000);
      utimesSync(abs, t, t);
    }
  }
  const coveredBytes =
    o.lfsFiles * o.lfsSizeKiB * 1024 + o.filteredFiles * o.filteredSizeKiB * 1024;
  return {
    dir,
    head: git('rev-parse', 'HEAD'),
    state: o.state,
    lfsFiles: o.lfsFiles,
    filteredFiles: o.filteredFiles,
    coveredBytes,
    created,
  };
}
