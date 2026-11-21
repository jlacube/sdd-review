import { constants } from 'node:fs';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canCreateSymlinks } from '../../../../src/core/evidence/workspace/fill.js';
import {
  cloneSupport,
  executeCopy,
  planCopy,
  resetCloneSupportCache,
} from '../../../../src/core/evidence/workspace/copier.js';
import {
  copyWindowEnd,
  makeMutationCopy,
  type MutationCopyResult,
} from '../../../../src/core/evidence/workspace/mutation-copy.js';
import { isReviewError, type ReviewError } from '../../../../src/core/errors/review-error.js';
import { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import {
  isWindows,
  manifest,
  prepareFromRepo,
  tempDir,
  type Prepared,
} from '../workspace/support.js';

// C001-TC-554 (C001-T-016): the copier, the ignored paths made available, link retargeting and
// the mutation copy of C001-ADR-006 §3, §4 and §7 on the real file system of each CI runner:
// clone detection, no hard link, manifest equality before and after the copy (K3 precondition),
// links retargeted, the root rewrite, and the removal of a failed copy with ERR-EVID-006.

const logCodes = (file: string) =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map((l) => (JSON.parse(l) as { code: string }).code)
    : [];

function dispose(dir: string | undefined) {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    console.warn(`${dir} not removed: ${(error as Error).message}`);
  }
}

/** A directory link that needs no privilege: a junction on Windows, a symbolic link elsewhere. */
function dirLink(target: string, path: string) {
  symlinkSync(target, path, isWindows ? 'junction' : 'dir');
}

/** Every regular file below `root` (relative, '/' separators), links not followed. */
function filesBelow(root: string, rel = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, ...rel.split('/').filter(Boolean)))) {
    const r = rel === '' ? name : `${rel}/${name}`;
    const st = lstatSync(join(root, ...r.split('/')));
    if (st.isDirectory()) out.push(...filesBelow(root, r));
    else if (st.isFile()) out.push(r);
  }
  return out;
}

const OLD = new Date('2024-03-04T05:06:07.000Z');

/**
 * A `shop-ts`-like repository with a `shop-py` and a .NET corner: package.json files with
 * installed dependencies (ignored), Yarn and NuGet folders, a virtual environment, transform
 * caches, links of every kind, and a snapshot link with an absolute target in the working tree.
 */
function buildShop(outside: string, fileLinks: boolean) {
  const repo = FixtureRepo.create();
  repo
    .write('package.json', '{"name":"shop","workspaces":["packages/*"]}\n')
    .write('packages/b/package.json', '{"name":"b"}\n')
    .write('packages/b/index.js', 'module.exports = 2;\n')
    .write('src/index.ts', 'export const total = 1;\n')
    .write('pyproject.toml', '[project]\nname = "shop"\n')
    .write('shop/__init__.py', 'VAT = 0.2\n')
    .write(
      'nuget.config',
      '<configuration><config><add key="globalPackagesFolder" value="nugetpkgs" /></config></configuration>\n',
    )
    .write(
      '.gitignore',
      'node_modules/\n.pnp.*\n.venv/\nnugetpkgs/\nbuild/\nobj/\n.env\nnot-listed/\n',
    );
  // A snapshot link whose absolute target names the working tree (C001-ADR-006 §4).
  const blob = join(repo.dir, 'tmp-link-blob');
  writeFileSync(blob, join(repo.dir, 'src', 'index.ts'));
  const hash = repo.git('hash-object', '-w', blob);
  rmSync(blob);
  repo.git('add', '-A');
  repo.git('update-index', '--add', '--cacheinfo', `120000,${hash},abs-link`);
  repo.git('checkout', '--', 'abs-link');
  repo.commit('B0', {});
  repo.write('src/index.ts', 'export const total = 2;\n');

  // The working tree's ignored paths.
  repo
    .write('node_modules/left-pad/package.json', '{"name":"left-pad"}\n')
    .write('node_modules/left-pad/index.js', 'module.exports = (s) => s;\n')
    .write('node_modules/left-pad/bin/cli.js', '#!/usr/bin/env node\n')
    .write('node_modules/.cache/babel/x.json', '{"from":"working tree"}\n')
    .write('node_modules/.vite/deps/a.js', 'compiled\n')
    .write('node_modules/.prisma/client/index.js', 'generated\n')
    .write('packages/b/node_modules/dep/index.js', 'module.exports = 3;\n')
    .write('.pnp.cjs', '// pnp\n')
    .write('nugetpkgs/newtonsoft.json/13.0.3/lib/x.dll', Buffer.from([0x4d, 0x5a, 0, 1]))
    .write('.venv/pyvenv.cfg', 'home = /usr/bin\n')
    .write('.env', 'SECRET=1\n')
    .write('not-listed/x.txt', 'ignored but not on the list\n');
  utimesSync(repo.path('node_modules/left-pad/index.js'), OLD, OLD);
  dirLink(repo.path('packages/b'), repo.path('node_modules/b'));
  dirLink(join(repo.dir, '.git', 'hooks'), repo.path('node_modules/hooks'));
  dirLink(outside, repo.path('node_modules/ext'));
  if (fileLinks) {
    mkdirSync(repo.path('node_modules/.bin'), { recursive: true });
    symlinkSync('../left-pad/bin/cli.js', repo.path('node_modules/.bin/left-pad'), 'file');
  }
  return repo;
}

describe('the copier', () => {
  let dir: string;
  beforeAll(() => {
    dir = tempDir('sddr-copier-');
    resetCloneSupportCache();
  });
  afterAll(() => dispose(dir));

  it('detects clone support once per pair of file systems and never makes a hard link', async () => {
    mkdirSync(join(dir, 'src', 'sub'), { recursive: true });
    mkdirSync(join(dir, 'dst'));
    writeFileSync(join(dir, 'src', 'a.bin'), Buffer.alloc(70_000, 7));
    writeFileSync(join(dir, 'src', 'sub', 'b.txt'), 'bee\n');
    utimesSync(join(dir, 'src', 'a.bin'), OLD, OLD);
    const first = cloneSupport(join(dir, 'src', 'a.bin'), join(dir, 'dst'));
    const method = await first;
    // macOS runners use APFS (clonefile); Windows has no forced clone in Node; Linux runners use
    // ext4 (byte copy) but a Btrfs or XFS host clones, so Linux accepts either.
    if (process.platform === 'darwin') expect(method).toBe('clone');
    if (isWindows) expect(method).toBe('byte-copy');
    expect(['clone', 'byte-copy']).toContain(method);
    expect(readdirSync(join(dir, 'dst'))).toEqual([]);
    expect(readdirSync(join(dir, 'src')).sort()).toEqual(['a.bin', 'sub']);

    const plan = await planCopy(join(dir, 'src'), ['']);
    expect(plan.totalBytes).toBe(70_004);
    const result = await executeCopy(plan, join(dir, 'dst'), {
      rules: {
        platform: process.platform,
        forbidden: [],
        redirects: [],
        destinationRoot: join(dir, 'dst'),
      },
    });
    expect(result.method).toBe(method);
    expect(result.files).toBe(2);
    for (const rel of ['a.bin', 'sub/b.txt']) {
      const s = statSync(join(dir, 'src', ...rel.split('/')), { bigint: true });
      const d = statSync(join(dir, 'dst', ...rel.split('/')), { bigint: true });
      expect(d.nlink, rel).toBe(1n);
      expect(d.ino === s.ino && d.dev === s.dev, rel).toBe(false);
    }
    expect(Math.abs(statSync(join(dir, 'dst', 'a.bin')).mtimeMs - OLD.getTime())).toBeLessThan(2);
    // A write to the copy leaves the source unchanged (clone or copy, never a shared file).
    writeFileSync(join(dir, 'dst', 'sub', 'b.txt'), 'changed\n');
    expect(readFileSync(join(dir, 'src', 'sub', 'b.txt'), 'utf8')).toBe('bee\n');
    // A copy never writes through an existing destination entry.
    await expect(
      executeCopy(plan, join(dir, 'dst'), {
        rules: {
          platform: process.platform,
          forbidden: [],
          redirects: [],
          destinationRoot: join(dir, 'dst'),
        },
      }),
    ).rejects.toThrow();
  });

  it('uses the plain byte copy where no clone is possible', async () => {
    // Forced: the byte-copy path runs on every runner, whatever its file system.
    const plan = await planCopy(join(dir, 'src'), ['sub']);
    mkdirSync(join(dir, 'dst2'));
    let flags = -1;
    await executeCopy(plan, join(dir, 'dst2'), {
      rules: {
        platform: process.platform,
        forbidden: [],
        redirects: [],
        destinationRoot: join(dir, 'dst2'),
      },
      copyFile: async (s, d, mode) => {
        flags = mode ?? 0;
        return copyFile(s, d, mode);
      },
    });
    expect(flags & constants.COPYFILE_EXCL).toBe(constants.COPYFILE_EXCL);
    expect(readFileSync(join(dir, 'dst2', 'sub', 'b.txt'), 'utf8')).toBe('bee\n');
  });
});

describe('a workspace with the ignored paths made available', () => {
  let outside: string;
  let repo: FixtureRepo;
  let p: Prepared;
  let fileLinks: boolean;
  let workTree: string;

  beforeAll(async () => {
    outside = tempDir('sddr-outside-');
    writeFileSync(join(outside, 'tool.js'), 'outside\n');
    fileLinks = await canCreateSymlinks(outside);
    repo = buildShop(outside, fileLinks);
    workTree = realpathSync.native(repo.dir);
    p = await prepareFromRepo(repo, { withRepository: true });
  }, 120_000);
  afterAll(async () => {
    await p?.dispose();
    dispose(repo?.dir);
    dispose(outside);
  }, 120_000);

  const ws = () => p.prepared.handle.root;
  const at = (rel: string) => join(ws(), ...rel.split('/'));

  it('makes available node_modules, Yarn and NuGet folders the ignore rules exclude', () => {
    const paths = p.prepared.available!.paths.map((c) => c.path);
    expect(paths).toEqual(['.pnp.cjs', 'node_modules', 'nugetpkgs', 'packages/b/node_modules']);
    expect(readFileSync(at('node_modules/left-pad/index.js'), 'utf8')).toBe(
      'module.exports = (s) => s;\n',
    );
    expect(existsSync(at('node_modules/left-pad/bin/cli.js'))).toBe(true);
    expect(existsSync(at('packages/b/node_modules/dep/index.js'))).toBe(true);
    expect(existsSync(at('nugetpkgs/newtonsoft.json/13.0.3/lib/x.dll'))).toBe(true);
    expect(existsSync(at('.pnp.cjs'))).toBe(true);
  });

  it('leaves out transform caches, virtual environments, local settings and unlisted paths', () => {
    for (const rel of [
      'node_modules/.cache',
      'node_modules/.vite',
      'node_modules/.prisma',
      '.venv',
      '.env',
      'not-listed',
    ]) {
      expect(existsSync(at(rel)), rel).toBe(false);
    }
    expect([...p.prepared.available!.leftOut].sort()).toEqual([
      'node_modules/.cache',
      'node_modules/.prisma',
      'node_modules/.vite',
    ]);
  });

  it('keeps modification times and makes no hard link to a working-tree file', () => {
    expect(
      Math.abs(statSync(at('node_modules/left-pad/index.js')).mtimeMs - OLD.getTime()),
    ).toBeLessThan(2);
    for (const rel of filesBelow(ws())) {
      const d = statSync(at(rel), { bigint: true });
      expect(d.nlink, rel).toBe(1n);
      const source = join(workTree, ...rel.split('/'));
      if (existsSync(source)) {
        const s = statSync(source, { bigint: true });
        expect(d.ino === s.ino && d.dev === s.dev, rel).toBe(false);
      }
    }
  });

  it('retargets links into the working tree, keeps links elsewhere and drops links into .git', () => {
    expect(realpathSync.native(at('node_modules/b'))).toBe(realpathSync.native(at('packages/b')));
    expect(realpathSync.native(at('node_modules/ext'))).toBe(realpathSync.native(outside));
    expect(existsSync(at('node_modules/hooks'))).toBe(false);
    expect(lstatSync(at('node_modules/hooks'), { throwIfNoEntry: false })).toBeUndefined();
    const dropped = p.prepared.available!.copy!.links.filter((l) => l.decision.action === 'drop');
    expect(dropped.map((l) => l.path)).toEqual(['node_modules/hooks']);
    if (fileLinks) {
      expect(readFileSync(at('node_modules/.bin/left-pad'), 'utf8')).toBe('#!/usr/bin/env node\n');
      expect(lstatSync(at('node_modules/.bin/left-pad')).isSymbolicLink()).toBe(true);
    }
  });

  it('writes the snapshot link with an absolute working-tree target as its workspace equivalent', () => {
    const st = lstatSync(at('abs-link'));
    const text = st.isSymbolicLink()
      ? realpathSync.native(at('abs-link'))
      : readFileSync(at('abs-link'), 'utf8');
    const expected = join(realpathSync.native(ws()), 'src', 'index.ts');
    expect(st.isSymbolicLink() ? text : realpathSync.native(text)).toBe(expected);
    expect(text.startsWith(workTree)).toBe(false);
  });

  it('keeps the made-available paths out of the workspace check', async () => {
    const check = await p.prepared.index.check({ kind: 'full' }, { ignore: p.ignore });
    expect(check.differences).toEqual([]);
  });

  it('wrote nothing in the working tree', () => {
    expect(existsSync(join(workTree, 'node_modules', '.cache', 'babel', 'x.json'))).toBe(true);
    expect(readdirSync(join(workTree, 'node_modules')).sort()).toEqual(
      [
        '.cache',
        '.prisma',
        '.vite',
        'b',
        'ext',
        'hooks',
        'left-pad',
        ...(fileLinks ? ['.bin'] : []),
      ].sort(),
    );
  });
});

describe('a snapshot link into the git directory', () => {
  it('fails the preparation with ERR-EVID-002 and leaves no workspace', async () => {
    const repo = FixtureRepo.create();
    try {
      repo.write('a.txt', 'a\n');
      const blob = join(repo.dir, 'tmp-blob');
      writeFileSync(blob, '.git/config');
      const hash = repo.git('hash-object', '-w', blob);
      rmSync(blob);
      repo.git('add', '-A');
      repo.git('update-index', '--add', '--cacheinfo', `120000,${hash},cfg`);
      repo.git('checkout', '--', 'cfg');
      repo.commit('B0', {});
      repo.write('a.txt', 'b\n');
      let error: ReviewError | null = null;
      try {
        const p = await prepareFromRepo(repo, { withRepository: true });
        await p.dispose();
      } catch (e) {
        if (!isReviewError(e)) throw e;
        error = e;
      }
      expect(error?.code).toBe('ERR-EVID-002');
      expect(error?.message).toMatch(/git directory/);
    } finally {
      dispose(repo.dir);
    }
  });
});

describe('the mutation copy', () => {
  let outside: string;
  let repo: FixtureRepo;
  let p: Prepared;
  let source: string;
  let before: Record<string, string>;
  let result: MutationCopyResult;
  let stateDuringCopy: string | null = null;
  const hunks = [
    { path: 'src/index.ts', line: 1 },
    { path: 'shop/__init__.py', line: 1 },
  ];

  beforeAll(async () => {
    outside = tempDir('sddr-outside-');
    repo = buildShop(outside, false);
    p = await prepareFromRepo(repo, { withRepository: true });
    source = realpathSync.native(p.prepared.handle.root);
    const at = (rel: string) => join(source, ...rel.split('/'));
    // What a test run leaves in ignored paths: an editable install and a script header that name
    // the workspace root, a binary build output with the root at a fixed offset, a link into the
    // workspace, a changed dependency file, and (Windows) a UTF-16LE file.
    mkdirSync(at('.venv/lib/site-packages'), { recursive: true });
    writeFileSync(at('.venv/lib/site-packages/_shop.pth'), `${source}\n`);
    mkdirSync(at('.venv/bin'), { recursive: true });
    writeFileSync(
      at('.venv/bin/pytest'),
      `#!${join(source, '.venv', 'bin', 'python')}\nimport sys\n`,
    );
    mkdirSync(at('build'), { recursive: true });
    const bin = Buffer.alloc(300, 0);
    Buffer.from(source).copy(bin, 100);
    writeFileSync(at('build/out.bin'), bin);
    writeFileSync(at('node_modules/left-pad/.cache-state.json'), JSON.stringify({ root: source }));
    dirLink(join(source, 'src'), at('build/src-link'));
    if (isWindows) {
      mkdirSync(at('obj'), { recursive: true });
      writeFileSync(
        at('obj/project.assets.json'),
        Buffer.concat([
          Buffer.from([0xff, 0xfe]),
          Buffer.from(`{"p":"${source}\\obj"}`, 'utf16le'),
        ]),
      );
    }
    before = manifest(source);
    result = await makeMutationCopy({
      source: p.prepared,
      repository: p.location,
      hunks,
      registry: p.registry,
      log: p.log,
      copyFile: async (s, d, mode) => {
        stateDuringCopy ??= p.prepared.handle.state;
        return copyFile(s, d, mode);
      },
    });
  }, 120_000);
  afterAll(async () => {
    await p?.dispose();
    dispose(repo?.dir);
    dispose(outside);
  }, 120_000);

  const copyRoot = () => {
    if (!result.ok) throw new Error(result.cause);
    return realpathSync.native(result.copy.handle.root);
  };
  const inCopy = (rel: string) => join(copyRoot(), ...rel.split('/'));

  it('copies into m<nn> next to w<nn>, with a root of the same byte length', () => {
    expect(result.ok).toBe(true);
    expect(Buffer.byteLength(copyRoot())).toBe(Buffer.byteLength(source));
    expect(copyRoot().endsWith(`m${source.slice(-2)}`)).toBe(true);
    if (result.ok) expect(result.copy.handle.state).toBe('mutation');
  });

  it('holds the test run workspace in the copy window during the copy, and frees it after', async () => {
    expect(stateDuringCopy).toBe('copying');
    expect(p.prepared.handle.state).toBe('free');
    await copyWindowEnd(p.prepared.handle);
  });

  it('leaves the test run workspace unchanged, ignored paths included (K3 precondition)', () => {
    expect(manifest(source)).toEqual(before);
  });

  it('copies every file, and rewrites only the files that name the source root', () => {
    if (!result.ok) throw new Error(result.cause);
    const rewritten = result.copy.rewritten.map((r) => r.path).sort();
    expect(rewritten).toEqual(
      [
        '.venv/bin/pytest',
        '.venv/lib/site-packages/_shop.pth',
        'build/out.bin',
        'node_modules/left-pad/.cache-state.json',
        ...(isWindows ? ['obj/project.assets.json'] : []),
      ].sort(),
    );
    const after = manifest(copyRoot());
    const links = (m: Record<string, string>) =>
      Object.keys(m).filter((k) => m[k]!.startsWith('link:'));
    for (const [rel, value] of Object.entries(before)) {
      if (rewritten.includes(rel) || links(before).includes(rel)) continue;
      expect(after[rel], rel).toBe(value);
    }
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  it('names the copy root instead of the source root, keeping sizes and offsets', () => {
    expect(readFileSync(inCopy('.venv/lib/site-packages/_shop.pth'), 'utf8')).toBe(
      `${copyRoot()}\n`,
    );
    const bin = readFileSync(inCopy('build/out.bin'));
    expect(bin.length).toBe(300);
    expect(bin.subarray(100, 100 + Buffer.byteLength(copyRoot())).toString()).toBe(copyRoot());
    // Done when: no file of the copy names the source workspace root.
    const needles = [Buffer.from(source)];
    if (isWindows) {
      needles.push(Buffer.from(source, 'utf16le'), Buffer.from(source.replace(/\\/g, '/')));
    }
    for (const rel of filesBelow(copyRoot())) {
      const bytes = readFileSync(inCopy(rel));
      for (const n of needles) expect(bytes.includes(n), rel).toBe(false);
    }
  });

  it('points links into the copy, never into the test run workspace or the working tree', () => {
    expect(realpathSync.native(inCopy('build/src-link'))).toBe(join(copyRoot(), 'src'));
    expect(realpathSync.native(inCopy('node_modules/b'))).toBe(join(copyRoot(), 'packages', 'b'));
    expect(realpathSync.native(inCopy('abs-link'))).toBe(join(copyRoot(), 'src', 'index.ts'));
  });

  it('makes no hard link to a file of the test run workspace', () => {
    for (const rel of filesBelow(copyRoot())) {
      const d = statSync(inCopy(rel), { bigint: true });
      const s = statSync(join(source, ...rel.split('/')), { bigint: true });
      expect(d.nlink, rel).toBe(1n);
      expect(d.ino === s.ino && d.dev === s.dev, rel).toBe(false);
    }
  });
});

describe('the mutation copy of a workspace whose links are written as files', () => {
  it('names the source root in no file (Windows without the right to create links)', async () => {
    const outside = tempDir('sddr-outside-');
    const repo = buildShop(outside, false);
    const p = await prepareFromRepo(repo, { withRepository: true, symlinks: false });
    try {
      const source = realpathSync.native(p.prepared.handle.root);
      expect(lstatSync(join(source, 'abs-link')).isFile()).toBe(true);
      const result = await makeMutationCopy({
        source: p.prepared,
        repository: p.location,
        hunks: [{ path: 'src/index.ts', line: 1 }],
        registry: p.registry,
      });
      if (!result.ok) throw new Error(result.cause);
      const copy = realpathSync.native(result.copy.handle.root);
      for (const rel of filesBelow(copy)) {
        expect(readFileSync(join(copy, ...rel.split('/'))).includes(Buffer.from(source)), rel).toBe(
          false,
        );
      }
    } finally {
      await p.dispose();
      dispose(repo.dir);
      dispose(outside);
    }
  }, 120_000);
});

describe('a failed mutation copy', () => {
  let outside: string;
  let repo: FixtureRepo;
  let p: Prepared;
  const hunks = [
    { path: 'src/coupon/rules.ts', line: 1 },
    { path: 'src/cart/total.ts', line: 4 },
  ];

  beforeAll(async () => {
    outside = tempDir('sddr-outside-');
    repo = buildShop(outside, false);
    p = await prepareFromRepo(repo, { withRepository: true });
    // A build output of the test run makes the workspace larger than the free space below.
    mkdirSync(join(p.prepared.handle.root, 'build'), { recursive: true });
    writeFileSync(
      join(p.prepared.handle.root, 'build', 'large.bin'),
      Buffer.alloc(2 * 1024 * 1024, 1),
    );
  }, 120_000);
  afterAll(async () => {
    await p?.dispose();
    dispose(repo?.dir);
    dispose(outside);
  }, 120_000);

  const snapshotEntries = () => readdirSync(p.prepared.handle.snapshotDir).sort();

  it('for lack of disk space leaves no copy, frees the source and raises ERR-EVID-006 per hunk', async () => {
    const before = manifest(p.prepared.handle.root);
    const result = await makeMutationCopy({
      source: p.prepared,
      repository: p.location,
      hunks,
      registry: p.registry,
      log: p.log,
      freeSpace: async () => 1024n * 1024n,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cause).toMatch(/not enough disk space/);
    expect(result.notices.map((n) => n.code)).toEqual(['ERR-EVID-006', 'ERR-EVID-006']);
    expect(result.notices[0]!.message).toContain('src/coupon/rules.ts:1');
    expect(result.notices[1]!.message).toContain('src/cart/total.ts:4');
    expect(result.notices[0]!.message).toContain(
      "the copy of the test run's workspace could not be made",
    );
    expect(snapshotEntries()).toEqual(['w00', 'w00.aux', 'w00.owner']);
    expect(p.prepared.handle.state).toBe('free');
    expect(manifest(p.prepared.handle.root)).toEqual(before);
    expect(logCodes(p.logFile).filter((c) => c === 'ERR-EVID-006')).toHaveLength(2);
  });

  it('when the disk fills during the copy, removes the partial copy', async () => {
    let n = 0;
    const result = await makeMutationCopy({
      source: p.prepared,
      repository: p.location,
      hunks,
      registry: p.registry,
      log: p.log,
      copyFile: async (s, d, mode) => {
        if (++n > 3) {
          throw Object.assign(new Error('ENOSPC: no space left on device, copyfile'), {
            code: 'ENOSPC',
          });
        }
        return copyFile(s, d, mode);
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cause).toMatch(/ENOSPC/);
    expect(result.notices).toHaveLength(2);
    expect(snapshotEntries()).toEqual(['w00', 'w00.aux', 'w00.owner']);
    expect(p.prepared.handle.state).toBe('free');
    // The workspace can be copied again once the cause is gone.
    const again = await makeMutationCopy({
      source: p.prepared,
      repository: p.location,
      hunks,
      registry: p.registry,
    });
    expect(again.ok).toBe(true);
  });
});
