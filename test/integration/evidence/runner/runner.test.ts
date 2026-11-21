import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { getPriority } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REMOVED_GIT_VARIABLES } from '../../../../src/core/git/environment.js';
import {
  runInWorkspace,
  type CommandResult,
  type RunCommandOptions,
  type RunWorkspace,
} from '../../../../src/core/evidence/runner/run-command.js';
import { setState } from '../../../../src/core/evidence/workspace/lifetime.js';
import { isReviewError, type ReviewError } from '../../../../src/core/errors/review-error.js';
import { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import {
  isWindows,
  manifest,
  prepareFromRepo,
  tempDir,
  type Prepared,
} from '../workspace/support.js';

// C001-TC-555 (C001-T-019): the command runner with real processes and real git on each CI runner
// (C001-IF-013 §1, C001-REQ-521, C001-REQ-525, C001-CON-22, C001-ADR-006 §8 and A1.2): a command
// started with every git repository-locating variable set finds no repository and changes
// nothing in it (C001-TS-586 to C001-TS-590 at the runner's level); no command runs in the
// working tree; cancellation and the time limit leave no process of the tree (C001-TS-560 at the
// runner's level); mutation processes run at the lower priority.

const HERE = dirname(fileURLToPath(import.meta.url));
const TREE = resolve(HERE, 'tree.mjs');
const PRINT_ENV = resolve(HERE, 'print-env.mjs');
const q = (path: string) => `"${path}"`;

let repo: FixtureRepo;
let prepared: Prepared;
let workspace: RunWorkspace;
let scratch: string;

/** Every value that a run must leave unchanged (the repository record of C001-AC-521.1). */
function repositoryRecord() {
  const gitDir = join(repo.dir, '.git');
  const sha = (file: string) =>
    existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'absent';
  return {
    workingTree: manifest(repo.dir),
    head: readFileSync(join(gitDir, 'HEAD'), 'utf8'),
    refs: repo.git('for-each-ref', '--format=%(refname) %(objectname)'),
    index: sha(join(gitDir, 'index')),
    packedRefs: sha(join(gitDir, 'packed-refs')),
  };
}

/** The environment of a review started from a git hook of the repository: every variable set. */
function hookEnvironment(): NodeJS.ProcessEnv {
  const gitDir = join(repo.dir, '.git');
  const values: Record<string, string> = {
    GIT_DIR: gitDir,
    GIT_WORK_TREE: repo.dir,
    GIT_IMPLICIT_WORK_TREE: '1',
    GIT_COMMON_DIR: gitDir,
    GIT_INDEX_FILE: join(gitDir, 'index'),
    GIT_OBJECT_DIRECTORY: join(gitDir, 'objects'),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: join(gitDir, 'objects'),
    GIT_GRAFT_FILE: join(gitDir, 'info', 'grafts'),
    GIT_SHALLOW_FILE: join(gitDir, 'shallow'),
    GIT_CONFIG: join(gitDir, 'config'),
    GIT_REPLACE_REF_BASE: 'refs/replace/',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_PREFIX: 'src/',
    GIT_NAMESPACE: 'agent',
    GIT_QUARANTINE_PATH: join(gitDir, 'objects', 'incoming-x1'),
  };
  expect(Object.keys(values).sort()).toEqual([...REMOVED_GIT_VARIABLES].sort());
  return {
    ...repo.env(),
    ...values,
    GIT_CEILING_DIRECTORIES: repo.dir,
    GIT_CONFIG_GLOBAL: join(scratch, 'ci.gitconfig'),
    GIT_AUTHOR_NAME: 'Dev One',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
    SHOP_MODE: 'ci',
  };
}

const run = (command: string, extra: Partial<RunCommandOptions> = {}): Promise<CommandResult> =>
  runInWorkspace({
    command,
    workspace,
    repository: prepared.location,
    env: repo.env(),
    log: prepared.log,
    ...extra,
  });

const text = (r: CommandResult) => r.stdout.bytes.toString('utf8');

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function until(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  for (const end = Date.now() + timeoutMs; Date.now() < end;) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return condition();
}

const pidsIn = (file: string) =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.trim() !== '')
        .map(Number)
    : [];

beforeAll(async () => {
  scratch = tempDir('sddr-runner-it-');
  repo = FixtureRepo.create();
  repo.write('src/total.ts', 'export const atLeast = (a: number, b: number) => a >= b;\n');
  repo.write('package.json', '{ "name": "shop-ts", "private": true }\n');
  repo.git('add', '-A');
  repo.commit('B0', {});
  repo.write('src/coupon.ts', 'export const coupon = (p: number) => p * 0.9;\n');
  prepared = await prepareFromRepo(repo);
  await setState(prepared.prepared.handle, 'in-run');
  workspace = prepared.prepared.handle;
});

afterAll(async () => {
  await prepared?.dispose();
  repo?.dispose();
  rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
});

describe('working directory (C001-CON-22, C001-IF-013 §1 item 1)', () => {
  it('runs the command with the workspace root as working directory', async () => {
    const r = await run('node -e "process.stdout.write(process.cwd())"');
    expect(r.ending).toBe('exited');
    expect(r.exitCode).toBe(0);
    expect(text(r)).toBe(prepared.prepared.handle.root);
    expect(r.workingDirectory).toBe(text(r));
  });

  it.each([
    ['the working-tree root', () => repo.dir],
    ['a directory of the working tree', () => repo.path('src')],
    ['the git directory', () => join(repo.dir, '.git')],
  ])('never starts a command in %s (ERR-EVID-002)', async (_label, dir) => {
    const marker = join(dir(), 'marker.txt');
    const error = await run("node -e \"require('fs').writeFileSync('marker.txt', 'x')\"", {
      workspace: { root: dir(), kind: 'run', state: 'in-run' },
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isReviewError(error)).toBe(true);
    expect((error as ReviewError).code).toBe('ERR-EVID-002');
    // Give a wrongly started process the time to write.
    await new Promise((r) => setTimeout(r, 300));
    expect(existsSync(marker)).toBe(false);
    const logged = readFileSync(prepared.logFile, 'utf8');
    expect(logged).toContain('"code":"ERR-EVID-002"');
  });
});

describe('git repository-locating variables (C001-REQ-525)', () => {
  it('removes every listed variable, replaces the ceiling and keeps the rest (C001-TS-588, 589)', async () => {
    const names = [
      ...REMOVED_GIT_VARIABLES,
      'GIT_CEILING_DIRECTORIES',
      'GIT_CONFIG_GLOBAL',
      'GIT_AUTHOR_NAME',
      'GIT_SSH_COMMAND',
      'SHOP_MODE',
    ];
    const r = await run(`node ${q(PRINT_ENV)} ${names.join(' ')}`, { env: hookEnvironment() });
    expect(r.exitCode).toBe(0);
    const expected = [
      ...REMOVED_GIT_VARIABLES.map((n) => `${n}=unset`),
      `GIT_CEILING_DIRECTORIES=${dirname(r.workingDirectory)}`,
      `GIT_CONFIG_GLOBAL=${join(scratch, 'ci.gitconfig')}`,
      'GIT_AUTHOR_NAME=Dev One',
      'GIT_SSH_COMMAND=ssh -o BatchMode=yes',
      'SHOP_MODE=ci',
    ];
    expect(text(r).split(/\r?\n/).filter(Boolean)).toEqual(expected);
  });

  it('removes a variable whatever the letter case of its name on Windows (C001-TS-590)', async () => {
    if (!isWindows) return; // Linux and macOS names are case-sensitive: Git_Dir is not GIT_DIR
    for (const spelled of ['Git_Dir', 'git_dir']) {
      const r = await run(`node ${q(PRINT_ENV)} GIT_DIR`, {
        env: { ...repo.env(), [spelled]: join(repo.dir, '.git') },
      });
      expect(text(r)).toBe('GIT_DIR=unset\n');
    }
  });

  it('a git command started from a hook environment finds no repository (C001-TS-586)', async () => {
    const r = await run('git rev-parse --git-dir', { env: hookEnvironment() });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.bytes.toString('utf8')).toMatch(/not a git repository/i);
  });

  it('a test that commits and tags through git changes nothing in the repository (C001-TS-587)', async () => {
    const before = repositoryRecord();
    const r = await run('git add -A && git commit -q -m release && git tag v9.9.9', {
      env: hookEnvironment(),
    });
    expect(r.exitCode).not.toBe(0);
    expect(repositoryRecord()).toEqual(before);
    expect(repo.git('tag', '--list', 'v9.9.9')).toBe('');
  });

  it('stops git discovery at the workspace even inside another repository', async () => {
    // As when the home directory that holds the evidence root is itself a working tree.
    const outer = join(scratch, 'outer');
    mkdirSync(outer);
    execFileSync('git', ['init', '-q', outer], { env: repo.env() });
    const root = join(outer, 'evidence', '0123456789ab', 'w00');
    mkdirSync(root, { recursive: true });
    const r = await run('git rev-parse --show-toplevel', {
      workspace: { root, kind: 'run', state: 'in-run' },
      env: hookEnvironment(),
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.bytes.toString('utf8')).toMatch(/not a git repository/i);
  });
});

describe('output and exit status (C001-IF-013 §1 item 2)', () => {
  it('captures up to 1 MiB of a stream and flags the rest as truncated', async () => {
    const r = await run(
      "node -e \"process.stdout.write('x'.repeat(1572864)); process.stderr.write('err')\"",
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.bytes.length).toBe(1024 * 1024);
    expect(r.stdout.truncated).toBe(true);
    expect(r.stdout.totalBytes).toBe(1572864);
    expect(r.stderr).toEqual({ bytes: Buffer.from('err'), truncated: false, totalBytes: 3 });
  });

  it('gives the exit status of the command', async () => {
    const r = await run('node -e "process.exit(3)"');
    expect(r).toMatchObject({ ending: 'exited', exitCode: 3 });
  });
});

describe('cancellation and time limit end the process tree (C001-IF-013 §1 item 3)', () => {
  it('leaves no process of the tree when cancelled, and no write in the working tree', async () => {
    const before = repositoryRecord();
    const pidFile = join(scratch, 'pids-cancel.txt');
    const controller = new AbortController();
    const running = run(`node ${q(TREE)} root ${q(pidFile)}`, {
      signal: controller.signal,
      killGraceMs: 300,
    });
    expect(await until(() => pidsIn(pidFile).length === 3, 20_000)).toBe(true);
    controller.abort();
    const r = await running;
    expect(r.ending).toBe('cancelled');
    const pids = pidsIn(pidFile);
    // POSIX: resolved only once the group is gone. Windows: the job ends them asynchronously.
    expect(await until(() => pids.every((p) => !alive(p)), isWindows ? 5000 : 500)).toBe(true);
    expect(repositoryRecord()).toEqual(before);
    // The tree wrote in its workspace only.
    expect(existsSync(join(r.workingDirectory, 'run-output-leaf.txt'))).toBe(true);
  });

  it('ends the tree when the time limit is reached', async () => {
    const pidFile = join(scratch, 'pids-limit.txt');
    const startedAt = Date.now();
    const r = await run(`node ${q(TREE)} root ${q(pidFile)}`, {
      timeoutMs: 4000,
      killGraceMs: 300,
    });
    expect(r.ending).toBe('timed-out');
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(4000);
    const pids = pidsIn(pidFile);
    expect(pids).toHaveLength(3);
    expect(await until(() => pids.every((p) => !alive(p)), isWindows ? 5000 : 500)).toBe(true);
  });
});

describe('priority of mutation processes (C001-ADR-006 §8)', () => {
  const printPriority = 'node -e "process.stdout.write(String(require(\'os\').getPriority()))"';

  it('runs a low-priority command and the processes it starts below the core', async () => {
    const r = await run(printPriority, { priority: 'low' });
    expect(r.exitCode).toBe(0);
    // POSIX: nice raised by 10 (at most 19); Windows: the below-normal class, which Node reports
    // as PRIORITY_BELOW_NORMAL (10).
    const expected = isWindows ? 10 : Math.min(19, getPriority() + 10);
    expect(Number(text(r))).toBe(expected);
  });

  it('runs a normal command at the priority of the core', async () => {
    const r = await run(printPriority);
    expect(Number(text(r))).toBe(getPriority());
  });

  it('sets the I/O class best-effort 7 on Linux', async () => {
    if (process.platform !== 'linux') return; // ionice is a Linux utility (ADR-006 §8)
    const probe = await run('command -v ionice');
    if (probe.exitCode !== 0) return; // util-linux not installed: the prelude skips ionice
    const r = await run('ionice -p $$', { priority: 'low' });
    expect(text(r)).toMatch(/best-effort: prio 7/);
  });
});
