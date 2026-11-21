import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import {
  AttributeSet,
  nativeEolOf,
  snapshotEntries,
  type CheckoutSettings,
  type WorkspaceEntry,
} from '../../../../src/core/evidence/workspace/fill.js';
import { IgnoreRules, sourcesNamed } from '../../../../src/core/evidence/workspace/ignore.js';
import {
  prepareWorkspace,
  WorkspaceRegistry,
  type PreparedWorkspace,
} from '../../../../src/core/evidence/workspace/lifetime.js';
import { resolveEvidenceRoot } from '../../../../src/core/evidence/workspace/root.js';
import { GitAdapter } from '../../../../src/core/git/operations.js';
import type { RepositoryLocation } from '../../../../src/core/git/port.js';
import { takeInChange } from '../../../../src/core/intake/snapshot.js';
import { ContextualLog } from '../../../../src/core/log/log.js';
import { repositoryKey, StoreLayout } from '../../../../src/core/store/root.js';
import { SnapshotStore } from '../../../../src/core/store/snapshots.js';

export const isWindows = process.platform === 'win32';

/** Directory with a real path (macOS /var → /private/var), removed by `dispose`. */
export function tempDir(prefix: string): string {
  return realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
}

/**
 * Every path below `root` with what a checkout fixes: file bytes, the executable bit (POSIX),
 * link targets, and empty directories (a submodule path). `.git` at the root is left out.
 */
export function manifest(root: string, skip: (rel: string) => boolean = () => false) {
  const out: Record<string, string> = {};
  const walk = (dir: string, rel: string) => {
    const names = readdirSync(dir);
    if (names.length === 0 && rel !== '') out[rel] = 'empty-dir';
    for (const name of names) {
      const r = rel === '' ? name : `${rel}/${name}`;
      if (r === '.git' || skip(r)) continue;
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) out[r] = `link:${readlinkSync(full)}`;
      else if (st.isDirectory()) walk(full, r);
      else {
        const exec = isWindows ? '' : (st.mode & 0o100) !== 0 ? ' +x' : ' -x';
        out[r] = `${createHash('sha256').update(readFileSync(full)).digest('hex')}${exec}`;
      }
    }
  };
  walk(root, '');
  return out;
}

export interface RepoCase {
  readonly autocrlf: 'true' | 'false' | 'input';
  readonly eol?: 'lf' | 'crlf';
}

/** Builds a repository with every kind of base entry (text, CRLF attribute, binary, executable,
 * symbolic links, a submodule) and a change that adds, modifies, deletes and renames files. */
export function buildRepo(c: RepoCase): FixtureRepo {
  const repo = FixtureRepo.create();
  repo.setConfig('core.autocrlf', c.autocrlf);
  if (c.eol) repo.setConfig('core.eol', c.eol);
  repo
    .write('README.md', '# Shop\n\nline two\n')
    .write('.gitattributes', '*.txt text eol=crlf\n*.bat eol=crlf\n*.bin binary\n')
    .write('docs/notes.txt', 'one\ntwo\n')
    .write('docs/plain.cfg', 'a=1\nb=2\n')
    .write('scripts/run.bat', '@echo off\necho hi\n')
    .write('assets/data.bin', Buffer.from([0, 1, 2, 10, 13, 10, 255, 0, 10]))
    .write('src/a.ts', 'export const a = 1;\n')
    .write('src/del.ts', 'export const gone = true;\n')
    .write(
      'src/old.ts',
      'export function total(lines: number[]) {\n  return lines.reduce((s, x) => s + x, 0);\n}\n',
    )
    .write('bin/tool.sh', '#!/bin/sh\necho tool\n');
  if (!isWindows) chmodSync(repo.path('bin/tool.sh'), 0o755);
  repo.git('add', '-A');
  if (isWindows) repo.git('update-index', '--chmod=+x', 'bin/tool.sh');
  const blob = (text: string) => {
    const f = join(repo.dir, '.git', 'tmp-blob');
    writeFileSync(f, text);
    const hash = repo.git('hash-object', '-w', f);
    rmSync(f);
    return hash;
  };
  repo.git('update-index', '--add', '--cacheinfo', `120000,${blob('README.md')},link-readme`);
  repo.git('update-index', '--add', '--cacheinfo', `120000,${blob('../README.md')},docs/up`);
  repo.git('update-index', '--add', '--cacheinfo', `120000,${blob('src')},link-src`);
  // A gitlink whose commit no repository holds: the workspace gets an empty directory, as an
  // uninitialised submodule in a checkout (C001-T-067 fills submodules through G-16).
  repo.git('update-index', '--add', '--cacheinfo', `160000,${'12345678'.repeat(5)},vendor/sub`);
  repo.git('checkout', '--', 'link-readme', 'docs/up', 'link-src');
  repo.commit('B0', {});

  // The change: modified, deleted, renamed, added files, and new attributes and ignore rules.
  repo
    .write('src/a.ts', 'export const a = 2;\nexport const b = 3;\n')
    .remove('src/del.ts')
    .moveInWorkingTree('src/old.ts', 'src/new.ts')
    .write('src/added.ts', 'export const added = "yes";\n')
    .write('docs/added.txt', 'crlf\nexpected\n')
    .write(
      '.gitattributes',
      '*.txt text eol=crlf\n*.bat eol=crlf\n*.bin binary\n*.md text eol=crlf\n',
    )
    .write('.gitignore', 'dist/\n*.log\n');
  return repo;
}

/** The checkout settings of the fixture, as git reads them. */
export function checkoutSettingsOf(repo: FixtureRepo): CheckoutSettings {
  const get = (key: string) => {
    try {
      return repo.git('config', '--get', key).toLowerCase();
    } catch {
      return null;
    }
  };
  const autocrlf = get('core.autocrlf');
  const eol = get('core.eol');
  return {
    autocrlf: autocrlf === 'true' || autocrlf === 'input' ? autocrlf : 'false',
    eol: eol === 'lf' || eol === 'crlf' || eol === 'native' ? eol : null,
    nativeEol: nativeEolOf(),
  };
}

export interface Prepared {
  readonly prepared: PreparedWorkspace;
  readonly entries: readonly WorkspaceEntry[];
  readonly ignore: IgnoreRules;
  readonly evidenceRoot: string;
  readonly location: RepositoryLocation;
  readonly repoKey: string;
  readonly snapshotId: string;
  readonly log: ContextualLog;
  readonly logFile: string;
  readonly registry: WorkspaceRegistry;
  dispose(): Promise<void>;
}

/** Takes the change in through intake and the store, then prepares a workspace of the snapshot. */
export async function prepareFromRepo(
  repo: FixtureRepo,
  options: { symlinks?: boolean; freeSpace?: (dir: string) => Promise<bigint> } = {},
): Promise<Prepared> {
  const scratch = tempDir('sddr-it-');
  const git = new GitAdapter({ baseEnv: repo.env() });
  try {
    const location = await git.discover(repo.dir);
    const logFile = join(scratch, 'log.jsonl');
    const log = new ContextualLog(logFile);
    const repoKey = repositoryKey(location.commonGitDir);
    const store = new SnapshotStore({ log }, new StoreLayout(join(scratch, 'store'), repoKey));
    const intake = await takeInChange(
      { git, store, log, repositoryRoot: location.workTreeRoot },
      { namedBase: repo.label('B0').hash },
    );
    const doc = await store.readSnapshot(intake.snapshotId);
    const base = doc.snapshot.baseCommit.hash;
    const entries = snapshotEntries({
      baseTree: await git.treeEntries(base),
      changedFiles: doc.snapshot.changedFiles,
      readBase: (path) => git.readBlob(base, path),
      readSnapshot: (hash) => store.readBlob(intake.snapshotId, hash),
    });
    const byPath = new Map(entries.map((e) => [e.path, e]));
    const read = (path: string) => byPath.get(path)!.read();
    const paths = entries.filter((e) => e.mode !== 'submodule').map((e) => e.path);
    const attributes = new AttributeSet({
      files: await sourcesNamed('.gitattributes', paths, read),
    });
    const ignore = new IgnoreRules({
      perDirectory: await sourcesNamed('.gitignore', paths, read),
      exclude: null,
      excludesFile: null,
      ignoreCase: false,
    });
    const evidenceRoot = resolveEvidenceRoot({
      repository: location,
      env: { LOCALAPPDATA: join(scratch, 'local'), XDG_CACHE_HOME: join(scratch, 'cache') },
      home: join(scratch, 'home'),
      log,
    });
    const registry = new WorkspaceRegistry();
    const prepared = await prepareWorkspace({
      evidenceRoot,
      repositoryKey: repoKey,
      snapshotId: intake.snapshotId,
      entries,
      checkout: checkoutSettingsOf(repo),
      attributes,
      registry,
      log,
      symlinks: options.symlinks,
      freeSpace: options.freeSpace,
    });
    await git.close();
    return {
      prepared,
      entries,
      ignore,
      evidenceRoot,
      location,
      repoKey,
      snapshotId: intake.snapshotId,
      log,
      logFile,
      registry,
      async dispose() {
        await registry.removeAll();
        rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
      },
    };
  } catch (error) {
    await git.close();
    rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
    throw error;
  }
}

/**
 * The snapshot as git checks it out: commits the working tree in the fixture, clones it with the
 * fixture's line-ending settings and the given `core.symlinks`, and checks that commit out.
 */
export function gitCheckoutOfSnapshot(repo: FixtureRepo, symlinks: boolean): string {
  repo.git('add', '-A');
  repo.git('commit', '-q', '-m', 'snapshot');
  const commit = repo.git('rev-parse', 'HEAD');
  const dir = tempDir('sddr-co-');
  const settings = checkoutSettingsOf(repo);
  const config = [
    '-c',
    `core.autocrlf=${settings.autocrlf}`,
    '-c',
    `core.symlinks=${symlinks}`,
    ...(settings.eol ? ['-c', `core.eol=${settings.eol}`] : []),
  ];
  execFileSync('git', ['clone', '-q', '--no-checkout', ...config, repo.dir, join(dir, 'co')], {
    env: repo.env(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  execFileSync('git', ['checkout', '-q', commit], {
    cwd: join(dir, 'co'),
    env: repo.env(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return join(dir, 'co');
}
