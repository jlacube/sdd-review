import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canCreateSymlinks } from '../../../../src/core/evidence/workspace/fill.js';
import {
  checkAfterRun,
  watchWorkspace,
  workspaceMismatch,
} from '../../../../src/core/evidence/workspace/index.js';
import {
  claimWorkspace,
  setState,
  sweepRepository,
  sweepSnapshot,
  THIS_PROCESS,
  workspaceKeys,
} from '../../../../src/core/evidence/workspace/lifetime.js';
import { resolveEvidenceRoot } from '../../../../src/core/evidence/workspace/root.js';
import { isReviewError, type ReviewError } from '../../../../src/core/errors/review-error.js';
import { ContextualLog } from '../../../../src/core/log/log.js';
import type { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import {
  buildRepo,
  gitCheckoutOfSnapshot,
  isWindows,
  manifest,
  prepareFromRepo,
  tempDir,
  type Prepared,
  type RepoCase,
} from './support.js';

// C001-TC-553 (C001-T-015): the evidence workspace of C001-ADR-006 §1 and §2 against real git and
// the real file system of each CI runner: location and containment, fill equal to a git checkout
// of the snapshot, index, check through the workspace watcher and by full walk, reset, disk-space
// check, removal at process end and the sweep of workspaces left by a process that ended.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

const logCodes = (file: string) =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map((l) => (JSON.parse(l) as { code: string }).code)
    : [];

/**
 * Removes a fixture. On Windows a handle (a git process of the adapter that is still ending, or a
 * virus scanner) can hold the directory for a moment; a directory that stays held is left in the
 * temporary directory with a warning instead of failing the test.
 */
function disposeRepo(repo: FixtureRepo | undefined) {
  if (!repo) return;
  try {
    rmSync(repo.dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    console.warn(`fixture ${repo.dir} not removed: ${(error as Error).message}`);
  }
}

async function rejection(p: Promise<unknown>): Promise<ReviewError> {
  try {
    await p;
  } catch (error) {
    if (isReviewError(error)) return error;
    throw error;
  }
  throw new Error('expected a ReviewError');
}

describe.each<RepoCase & { label: string; noLinks?: boolean }>([
  { label: 'core.autocrlf=false', autocrlf: 'false' },
  { label: 'core.autocrlf=true', autocrlf: 'true' },
  { label: 'core.autocrlf=input', autocrlf: 'input' },
  { label: 'core.autocrlf=false, core.eol=crlf', autocrlf: 'false', eol: 'crlf' },
  // The Windows fallback when the process cannot create links, on every runner.
  { label: 'links written as files (core.symlinks=false)', autocrlf: 'false', noLinks: true },
])('a filled workspace equals a git checkout of the snapshot ($label)', (c) => {
  let repo: FixtureRepo;
  let ws: Prepared;
  let checkout: string;

  beforeAll(async () => {
    repo = buildRepo(c);
    const links = c.noLinks ? false : await canCreateSymlinks(tmpdir());
    ws = await prepareFromRepo(repo, { symlinks: links });
    checkout = gitCheckoutOfSnapshot(repo, links);
  }, 120_000);
  afterAll(async () => {
    await ws?.dispose();
    disposeRepo(repo);
    if (checkout) rmSync(dirname(checkout), { recursive: true, force: true, maxRetries: 3 });
  });

  it('byte for byte, with modes, links and the empty submodule path', () => {
    const root = ws.prepared.handle.root;
    expect(manifest(root)).toEqual(manifest(checkout));
    expect(existsSync(join(root, '.git'))).toBe(false);
    // The change is in the workspace: deleted and renamed-away paths are gone.
    expect(existsSync(join(root, 'src', 'del.ts'))).toBe(false);
    expect(existsSync(join(root, 'src', 'old.ts'))).toBe(false);
    expect(readFileSync(join(root, 'src', 'a.ts'), 'utf8')).toContain('b = 3');
  });

  it('applies the snapshot .gitattributes: README.md and *.txt get CRLF line endings', () => {
    const root = ws.prepared.handle.root;
    expect(readFileSync(join(root, 'README.md'), 'latin1')).toBe('# Shop\r\n\r\nline two\r\n');
    expect(readFileSync(join(root, 'docs', 'added.txt'), 'latin1')).toBe('crlf\r\nexpected\r\n');
  });

  it('the evidence root and the workspace lie outside the working tree and the git directory', () => {
    const root = ws.prepared.handle.root.toLowerCase();
    expect(root.startsWith(ws.evidenceRoot.toLowerCase())).toBe(true);
    expect(root.startsWith(ws.location.workTreeRoot.toLowerCase())).toBe(false);
    expect(root.startsWith(ws.location.gitDir.toLowerCase())).toBe(false);
  });

  it('records every snapshot path in the index and checks clean after the fill', async () => {
    expect(ws.prepared.index.size).toBe(ws.entries.length);
    expect(ws.prepared.handle.state).toBe('free');
    const full = await ws.prepared.index.check({ kind: 'full' }, { ignore: ws.ignore });
    expect(full).toMatchObject({ clean: true, scope: 'full' });
  });
});

describe('evidence root containment (C001-CON-22)', () => {
  let repo: FixtureRepo;
  beforeAll(() => {
    repo = buildRepo({ autocrlf: 'false' });
  });
  afterAll(() => disposeRepo(repo));

  it('refuses a root inside the working tree with ERR-EVID-002 and creates nothing there', () => {
    const logDir = tempDir('sddr-log-');
    const log = new ContextualLog(join(logDir, 'log.jsonl'));
    const inside = repo.path('cache');
    let error: unknown;
    try {
      resolveEvidenceRoot({
        repository: {
          workTreeRoot: repo.dir,
          gitDir: repo.path('.git'),
          commonGitDir: repo.path('.git'),
        },
        env: { LOCALAPPDATA: inside, XDG_CACHE_HOME: inside },
        home: inside,
        tmpdir: repo.path('tmp'),
        log,
        command: 'npm test',
      });
    } catch (e) {
      error = e;
    }
    expect(isReviewError(error)).toBe(true);
    expect((error as ReviewError).code).toBe('ERR-EVID-002');
    expect((error as ReviewError).message).toContain('npm test');
    expect((error as ReviewError).message).toContain('working tree');
    expect(existsSync(repo.path('cache'))).toBe(false);
    expect(existsSync(repo.path('tmp'))).toBe(false);
    expect(logCodes(join(logDir, 'log.jsonl'))).toEqual(['ERR-EVID-002']);
    rmSync(logDir, { recursive: true, force: true });
  });

  it('refuses a root reached through a link into the git directory, and falls back to the temporary directory', () => {
    const outside = tempDir('sddr-root-');
    const linkParent = join(outside, 'home');
    mkdirSync(linkParent);
    let linked = true;
    try {
      // A junction needs no privilege on Windows.
      symlinkSync(repo.path('.git'), join(linkParent, 'cache'), isWindows ? 'junction' : 'dir');
    } catch {
      linked = false;
    }
    const root = resolveEvidenceRoot({
      repository: {
        workTreeRoot: repo.dir,
        gitDir: repo.path('.git'),
        commonGitDir: repo.path('.git'),
      },
      env: {
        LOCALAPPDATA: linked ? join(linkParent, 'cache') : repo.path('x'),
        XDG_CACHE_HOME: linked ? join(linkParent, 'cache') : repo.path('x'),
      },
      home: linked ? linkParent : repo.dir,
      tmpdir: outside,
    });
    expect(root.startsWith(outside)).toBe(true);
    expect(readdirSync(repo.path('.git')).some((n) => n === 'sddr' || n === 'sdd-review')).toBe(
      false,
    );
    rmSync(outside, { recursive: true, force: true });
  });
});

describe('check, watcher and reset', () => {
  let repo: FixtureRepo;
  let ws: Prepared;
  let pristine: Record<string, string>;
  const root = () => ws.prepared.handle.root;
  const at = (p: string) => join(root(), ...p.split('/'));

  beforeAll(async () => {
    repo = buildRepo({ autocrlf: 'false' });
    ws = await prepareFromRepo(repo);
    pristine = manifest(root());
  }, 120_000);
  afterAll(async () => {
    await ws?.dispose();
    disposeRepo(repo);
  });

  /** A run that changes snapshot files and writes allowed and not allowed extra files. */
  function editLikeARun() {
    // Same size, other content, modification time put back: only the hash shows it.
    const a = at('src/a.ts');
    const before = statSync(a);
    writeFileSync(a, readFileSync(a, 'utf8').replace('a = 2', 'a = 9'));
    utimesSync(a, before.atime, before.mtime);
    unlinkSync(at('docs/notes.txt'));
    writeFileSync(at('report-summary.json'), '{}');
    mkdirSync(at('tmp'), { recursive: true });
    writeFileSync(at('tmp/run-output.txt'), 'out');
    mkdirSync(at('dist'), { recursive: true });
    writeFileSync(at('dist/cart.js'), 'built');
    writeFileSync(at('app.log'), 'log');
    if (!isWindows) chmodSync(at('bin/tool.sh'), 0o644);
  }
  const expected = [
    ...(isWindows ? [] : [{ path: 'bin/tool.sh', kind: 'mode' }]),
    { path: 'docs/notes.txt', kind: 'removed' },
    { path: 'report-summary.json', kind: 'added' },
    { path: 'src/a.ts', kind: 'changed' },
    { path: 'tmp/run-output.txt', kind: 'added' },
  ];

  it('the touched paths of the workspace watcher find what a run changed; ignored outputs stay', async () => {
    const watcher = watchWorkspace(root());
    editLikeARun();
    // An edit of the working tree during the run is not a difference (C001-REQ-522, C001-TS-563).
    repo.write('src/a.ts', 'export const a = "edited in the working tree";\n');
    const touched = await watcher.stop();
    const result = await checkAfterRun(ws.prepared.index, touched, { ignore: ws.ignore });
    expect(result.scope).toBe(touched.lost ? 'full' : 'touched');
    if (touched.lost) console.warn(`workspace watcher lost events: ${touched.cause}`);
    expect(result.clean).toBe(false);
    expect(result.differences).toEqual(expected);
    if (!touched.lost) expect(touched.paths.size).toBeGreaterThan(0);
    for (const p of touched.paths) expect(p.startsWith('.sddr-drain-')).toBe(false);

    const logFile = join(tempDir('sddr-log-'), 'log.jsonl');
    const notice = workspaceMismatch(
      new ContextualLog(logFile),
      { command: 'npm test', snapshotId: ws.snapshotId },
      result,
    );
    expect(notice.code).toBe('ERR-EVID-005');
    expect(notice.message).toContain('report-summary.json');
    expect(logCodes(logFile)).toEqual(['ERR-EVID-005']);
  });

  it('the reset restores the snapshot and keeps ignored paths; the next check is clean', async () => {
    const full = await ws.prepared.index.check({ kind: 'full' }, { ignore: ws.ignore });
    expect(full.differences).toEqual(expected);
    await ws.prepared.index.reset(full.differences, ws.prepared.rewrite);
    const after = await ws.prepared.index.check({ kind: 'full' }, { ignore: ws.ignore });
    expect(after).toMatchObject({ clean: true, differences: [] });
    const ignoredOutputs = new Set(['dist', 'app.log', 'tmp']);
    expect(manifest(root(), (r) => ignoredOutputs.has(r))).toEqual(pristine);
    expect(existsSync(at('dist/cart.js'))).toBe(true);
    expect(existsSync(at('app.log'))).toBe(true);
    expect(existsSync(at('report-summary.json'))).toBe(false);
  });

  it('falls back to a full walk when the watcher loses events', async () => {
    // A watcher that also reports a nameless event, as an overflowing buffer does on Windows.
    const lossy = ((path: string, options: object) => {
      const w = watch(path, options);
      setImmediate(() => w.emit('change', 'rename', null));
      return w;
    }) as unknown as typeof watch;
    const watcher = watchWorkspace(root(), { watchFn: lossy });
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(at('src/new.ts'), 'changed during the run\n');
    const touched = await watcher.stop();
    expect(touched.lost).toBe(true);
    const result = await checkAfterRun(ws.prepared.index, touched, { ignore: ws.ignore });
    expect(result.scope).toBe('full');
    expect(result.differences).toEqual([{ path: 'src/new.ts', kind: 'changed' }]);
    await ws.prepared.index.reset(result.differences, ws.prepared.rewrite);
    expect((await ws.prepared.index.check({ kind: 'full' }, { ignore: ws.ignore })).clean).toBe(
      true,
    );
  });

  it('on macOS the watcher always reports lost events, so the check takes the full walk', async () => {
    const watcher = watchWorkspace(root(), { platform: 'darwin' });
    writeFileSync(at('src/mac.ts'), 'changed during the run\n');
    const touched = await watcher.stop();
    expect(touched.lost).toBe(true);
    expect(touched.cause).toContain('C001-T-018');
    const result = await checkAfterRun(ws.prepared.index, touched, { ignore: ws.ignore });
    expect(result.scope).toBe('full');
    expect(result.differences).toContainEqual({ path: 'src/mac.ts', kind: 'added' });
    await ws.prepared.index.reset(result.differences, ws.prepared.rewrite);
  });

  it('a run that replaces a snapshot directory by a file is found and reset', async () => {
    const watcher = watchWorkspace(root());
    rmSync(at('docs'), { recursive: true, force: true });
    writeFileSync(at('docs'), 'now a file');
    const touched = await watcher.stop();
    const result = await checkAfterRun(ws.prepared.index, touched, { ignore: ws.ignore });
    expect(result.differences.map((d) => d.path)).toEqual(
      expect.arrayContaining(['docs', 'docs/added.txt', 'docs/plain.cfg', 'docs/up']),
    );
    await ws.prepared.index.reset(result.differences, ws.prepared.rewrite);
    expect((await ws.prepared.index.check({ kind: 'full' }, { ignore: ws.ignore })).clean).toBe(
      true,
    );
  });
});

describe('disk space and content that cannot be read', () => {
  it('too little free space fails the preparation with ERR-EVID-002 before anything is written', async () => {
    const repo = buildRepo({ autocrlf: 'false' });
    try {
      let captured: { root: string; log: string } | undefined;
      const error = await rejection(
        prepareFromRepo(repo, {
          freeSpace: async (dir) => {
            captured = { root: dir, log: '' };
            expect(readdirSync(dir)).toEqual([]);
            return 100n;
          },
        }),
      );
      expect(error.code).toBe('ERR-EVID-002');
      expect(error.message).toContain('not enough disk space');
      expect(captured).toBeDefined();
      expect(existsSync(captured!.root)).toBe(false);
      expect(existsSync(`${captured!.root}.owner`)).toBe(false);
    } finally {
      disposeRepo(repo);
    }
  }, 120_000);

  it('a changed binary file whose content the snapshot does not hold fails with ERR-EVID-002', async () => {
    const repo = buildRepo({ autocrlf: 'false' });
    try {
      repo.write('assets/new.bin', Buffer.from([0, 0, 1, 2, 3]));
      const error = await rejection(prepareFromRepo(repo));
      expect(error.code).toBe('ERR-EVID-002');
      expect(error.message).toContain('assets/new.bin');
    } finally {
      disposeRepo(repo);
    }
  }, 120_000);
});

describe('removal and sweep', () => {
  const repoKey = 'c0'.repeat(32);
  const snapshotId = `s-${'ab'.repeat(32)}`;

  it('workspaces of a process that ended are removed by the next sweep; live ones stay', async () => {
    const evidenceRoot = tempDir('sddr-sweep-');
    const readyFile = join(evidenceRoot, 'ready.txt');
    try {
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          join(HERE, 'child.ts'),
          JSON.stringify({ evidenceRoot, repositoryKey: repoKey, snapshotId, readyFile }),
        ],
        { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stderr = '';
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      await new Promise<void>((r) => child.on('exit', () => r()));
      expect(existsSync(readyFile), stderr).toBe(true);
      const leftOver = readFileSync(readyFile, 'utf8');
      expect(existsSync(leftOver)).toBe(true);

      // A workspace of this (live) process in the same snapshot directory.
      const keys = workspaceKeys(repoKey, snapshotId);
      const snapshotDir = join(evidenceRoot, keys.repository, keys.snapshot);
      const mine = await claimWorkspace(snapshotDir, 'run');
      await setState(mine, 'free');

      const result = await sweepSnapshot(evidenceRoot, repoKey, snapshotId);
      expect(result.removed).toEqual([leftOver]);
      expect(result.kept).toEqual([mine.root]);
      expect(result.failed).toEqual([]);
      // The repository-wide sweep finds nothing more to remove.
      expect(await sweepRepository(evidenceRoot, repoKey)).toEqual({
        removed: [],
        kept: [mine.root],
        failed: [],
      });
      expect(existsSync(leftOver)).toBe(false);
      expect(existsSync(`${leftOver}.aux`)).toBe(false);
      expect(existsSync(`${leftOver}.owner`)).toBe(false);
      expect(existsSync(mine.root)).toBe(true);
      expect(JSON.parse(readFileSync(mine.ownerFile, 'utf8'))).toMatchObject({
        pid: THIS_PROCESS.pid,
        startedAt: THIS_PROCESS.startedAt,
        state: 'free',
      });
    } finally {
      rmSync(evidenceRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 60_000);

  it('the registry removes the workspaces of this process at its end', async () => {
    const repo = buildRepo({ autocrlf: 'false' });
    const ws = await prepareFromRepo(repo);
    try {
      const { root, auxDir, ownerFile } = ws.prepared.handle;
      expect([root, auxDir, ownerFile].every((p) => existsSync(p))).toBe(true);
      const results = await ws.registry.removeAll();
      expect(results).toEqual([{ removed: true, cause: null }]);
      expect([root, auxDir, ownerFile].some((p) => existsSync(p))).toBe(false);
    } finally {
      await ws.dispose();
      disposeRepo(repo);
    }
  }, 120_000);
});
