import { existsSync, mkdirSync, readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixtureRepo, type FixtureOptions } from '../builder/fixture-repo.js';
import { FX_INTAKE_FILES } from './fx-intake.js';

/**
 * `fx-lfs` and `fx-crypt` (CAP-01 acceptance, fixture conventions; C001-T-028).
 *
 * `fx-lfs` is `fx-intake` with Git LFS in its effective git configuration — `filter.lfs.clean`,
 * `filter.lfs.smudge` and `filter.lfs.process` set — and the line
 * `*.bin filter=lfs diff=lfs merge=lfs -text` in the `.gitattributes` file of B0. Git LFS need not
 * be installed: the three commands run `filter-stub.mjs`, which writes the Git LFS pointer files
 * that Git LFS writes. B0 holds the pointer files of "assets/model.bin" (2,048 binary bytes) and
 * "assets/weights.bin"; the working tree holds their content.
 *
 * `fx-crypt` is `fx-lfs` whose `.gitattributes` also holds `secrets/*.env filter=crypt`, with
 * `filter.crypt.clean` and `filter.crypt.smudge` set to the stub's fixed-key cipher. B0 holds the
 * encrypted blobs of "secrets/app.env" (120 bytes, starting with "API_KEY=") and "secrets/db.env";
 * the working tree holds their decrypted content.
 *
 * Every call of the stub is appended to the filter stub's log, `.git/sdd-fixture/filter-calls.log`
 * (outside the working tree), which `filterCalls` reads. The index records every file as up to
 * date: the files get whole-second modification times two hours in the past, decreasing in path
 * order, before git records them, so no entry is racy.
 */

const STUB = fileURLToPath(new URL('./filter-stub.mjs', import.meta.url));
const fwd = (path: string) => path.replace(/\\/g, '/');
const q = (path: string) => `"${fwd(path)}"`;

/** Deterministic binary content: a NUL byte in the first bytes makes it binary for git. */
export function binaryBytes(size: number, seed = 1): Buffer {
  const out = Buffer.alloc(size);
  for (let i = 0; i < size; i++) out[i] = (i * 31 + seed * 17) & 0xff;
  out[0] = 0;
  return out;
}

export const MODEL_BIN = binaryBytes(2048, 1);
export const WEIGHTS_BIN = binaryBytes(1536, 2);
export const APP_ENV = Buffer.from(`API_KEY=${'k'.repeat(104)}\nMODE=1\n`, 'utf8'); // 120 bytes
export const DB_ENV = Buffer.from('DB_URL=postgres://db.example.test/app\n', 'utf8');

export const LFS_ATTRIBUTE = '*.bin filter=lfs diff=lfs merge=lfs -text';
export const CRYPT_ATTRIBUTE = 'secrets/*.env filter=crypt';

export interface FilterFixtureSpec {
  /** Also put `secrets/*.env` under the crypt filter (`fx-crypt`). */
  readonly crypt?: boolean;
  /** Further files of B0, stored through the filters like every file. */
  readonly base?: Readonly<Record<string, string | Buffer>>;
  /**
   * Files of B0 stored as they are: committed first, in a commit P0 before the `.gitattributes`
   * file of B0 put them under a filter.
   */
  readonly raw?: Readonly<Record<string, Buffer>>;
}

interface FilterInfo {
  readonly log: string;
  readonly store: string;
}

const infos = new WeakMap<FixtureRepo, FilterInfo>();

/** The lines of the filter stub's log, or `undefined` for a fixture without the stub. */
export function filterCalls(repo: FixtureRepo): string[] | undefined {
  const info = infos.get(repo);
  if (!info) return undefined;
  return existsSync(info.log)
    ? readFileSync(info.log, 'utf8')
        .split('\n')
        .filter((l) => l.length > 0)
    : [];
}

/** The configuration that runs the stub for `driver`. */
function stubCommand(info: FilterInfo, mode: string, driver: string): string {
  const path = mode === 'process' ? '' : ' %f';
  // NODE_OPTIONS of a test runner (for example `--import tsx`) must not reach the stub.
  return `NODE_OPTIONS= ${q(process.execPath)} ${q(STUB)} ${mode} ${driver} ${q(info.log)} ${q(info.store)}${path}`;
}

/** Whole-second time stamps two hours back, one second apart, decreasing in path order. */
export function settleTimes(repo: FixtureRepo, paths: readonly string[]): void {
  const start = Math.floor(Date.now() / 1000) - 7200;
  [...paths].sort().forEach((path, i) => {
    utimesSync(repo.path(path), start - i, start - i);
  });
}

export function buildFilterFixture(
  options: FixtureOptions = {},
  spec: FilterFixtureSpec = {},
): FixtureRepo {
  const repo = FixtureRepo.create(options);
  const dir = join(repo.dir, '.git', 'sdd-fixture');
  mkdirSync(dir, { recursive: true });
  const info: FilterInfo = { log: join(dir, 'filter-calls.log'), store: join(dir, 'lfs') };
  infos.set(repo, info);
  for (const mode of ['clean', 'smudge', 'process']) {
    repo.setConfig(`filter.lfs.${mode}`, stubCommand(info, mode, 'lfs'));
  }
  if (spec.crypt) {
    repo.setConfig('filter.crypt.clean', stubCommand(info, 'clean', 'crypt'));
    repo.setConfig('filter.crypt.smudge', stubCommand(info, 'smudge', 'crypt'));
  }

  const files: Record<string, string | Buffer> = {
    ...FX_INTAKE_FILES,
    '.gitattributes': `${LFS_ATTRIBUTE}\n${spec.crypt ? `${CRYPT_ATTRIBUTE}\n` : ''}`,
    'assets/model.bin': MODEL_BIN,
    'assets/weights.bin': WEIGHTS_BIN,
    ...(spec.crypt ? { 'secrets/app.env': APP_ENV, 'secrets/db.env': DB_ENV } : {}),
    ...spec.base,
  };
  const raw = Object.entries(spec.raw ?? {});
  if (raw.length > 0) {
    // Committed before any `.gitattributes` file put them under a filter: stored as they are.
    for (const [path, content] of raw) repo.write(path, content);
    settleTimes(
      repo,
      raw.map(([p]) => p),
    );
    repo.commit('P0', { subject: 'P0: before Git LFS' });
  }
  for (const [path, content] of Object.entries(files)) repo.write(path, content);
  settleTimes(repo, Object.keys(files));
  repo.commit('B0', { subject: 'B0: base' });
  return repo;
}

export function buildFxLfs(options: FixtureOptions = {}): FixtureRepo {
  return buildFilterFixture(options);
}

export function buildFxCrypt(options: FixtureOptions = {}): FixtureRepo {
  return buildFilterFixture(options, { crypt: true });
}
