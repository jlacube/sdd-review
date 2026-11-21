import { describe, expect, it } from 'vitest';
import {
  availableCandidates,
  isLeftOut,
  nodeCandidates,
  nugetCandidates,
  parseNugetConfig,
  selectAvailable,
  type AvailableCandidate,
} from '../../../../src/core/evidence/workspace/available-paths.js';
import { IgnoreRules } from '../../../../src/core/evidence/workspace/ignore.js';

// C001-T-016, C001-ADR-006 §3 and §3.2, C001-IF-013 §2 item 4: the built-in list of ignored paths
// made available per ecosystem and the paths left out of every copy, without a file system.

const rules = (gitignore: string) =>
  new IgnoreRules({
    perDirectory: [{ directory: '', content: gitignore }],
    exclude: null,
    excludesFile: null,
    ignoreCase: false,
  });

const paths = (cs: readonly AvailableCandidate[]) => cs.map((c) => c.path).sort();

describe('TypeScript/JavaScript', () => {
  it('names node_modules next to every package.json of the snapshot', () => {
    const cs = nodeCandidates(['package.json', 'packages/a/package.json', 'src/index.ts']);
    expect(paths(cs.filter((c) => c.path.endsWith('node_modules')))).toEqual([
      'node_modules',
      'packages/a/node_modules',
    ]);
    expect(cs.every((c) => c.ecosystem === 'typescript-javascript')).toBe(true);
  });

  it('names the Yarn Plug-n-Play files and directories next to a package.json', () => {
    const cs = nodeCandidates(['package.json']);
    expect(paths(cs)).toEqual([
      '.pnp.cjs',
      '.pnp.data.json',
      '.pnp.loader.mjs',
      '.yarn/cache',
      '.yarn/install-state.gz',
      '.yarn/unplugged',
      'node_modules',
    ]);
    expect(cs.find((c) => c.path === '.yarn/cache')?.kind).toBe('dir');
    expect(cs.find((c) => c.path === '.pnp.cjs')?.kind).toBe('file');
  });

  it('names nothing without a package.json, and nothing for a package.json inside node_modules', () => {
    expect(nodeCandidates(['src/a.ts', 'pyproject.toml'])).toEqual([]);
    expect(paths(nodeCandidates(['vendor/node_modules/x/package.json']))).toEqual([]);
  });
});

describe('Python', () => {
  it('makes nothing available: a virtual environment stays where it is', () => {
    const cs = availableCandidates(['pyproject.toml', 'shop/__init__.py', '.venv/pyvenv.cfg'], []);
    expect(cs).toEqual([]);
  });
});

describe('C#/.NET', () => {
  it('reads globalPackagesFolder, repositoryPath and local feed directories', () => {
    const parsed = parseNugetConfig(`<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <config>
    <add key="globalPackagesFolder" value="packages" />
    <add value='legacy\\repo' key='repositoryPath'/>
  </config>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" />
    <add key="local" value="./feeds/local" />
  </packageSources>
</configuration>`);
    expect(parsed).toEqual({
      globalPackagesFolder: 'packages',
      repositoryPath: 'legacy\\repo',
      sources: ['https://api.nuget.org/v3/index.json', './feeds/local'],
    });
  });

  it('places the folders relative to the nuget.config and keeps only those under the root', () => {
    const cs = nugetCandidates(
      [
        {
          path: 'src/NuGet.Config',
          content:
            '<configuration><config><add key="globalPackagesFolder" value="../.nuget/packages"/></config>' +
            '<packageSources><add key="a" value="feed"/><add key="b" value="https://x/y"/>' +
            '<add key="c" value="../../outside"/><add key="d" value="%USERPROFILE%\\feed"/></packageSources></configuration>',
        },
      ],
      { workTreeRoot: '/repo', platform: 'linux' },
    );
    expect(paths(cs)).toEqual(['.nuget/packages', 'src/feed']);
    expect(cs.every((c) => c.ecosystem === 'csharp-dotnet' && c.kind === 'dir')).toBe(true);
  });

  it('maps an absolute folder under the working-tree root to its relative path', () => {
    const posix = nugetCandidates(
      [
        {
          path: 'nuget.config',
          content:
            '<configuration><config><add key="globalPackagesFolder" value="/repo/pkgs"/></config></configuration>',
        },
      ],
      { workTreeRoot: '/repo', platform: 'linux' },
    );
    expect(paths(posix)).toEqual(['pkgs']);
    const win = nugetCandidates(
      [
        {
          path: 'nuget.config',
          content:
            '<configuration><config><add key="repositoryPath" value="c:\\Repo\\Pkgs"/>' +
            '<add key="globalPackagesFolder" value="D:\\elsewhere"/></config></configuration>',
        },
      ],
      { workTreeRoot: 'C:\\repo', platform: 'win32' },
    );
    expect(paths(win)).toEqual(['Pkgs']);
  });

  it('decodes XML entities and ignores comments', () => {
    const parsed = parseNugetConfig(
      '<configuration><!-- <config><add key="globalPackagesFolder" value="no"/></config> -->' +
        '<config><add key="globalPackagesFolder" value="a&amp;b"/></config></configuration>',
    );
    expect(parsed.globalPackagesFolder).toBe('a&b');
  });

  it('names nothing without a nuget.config', () => {
    expect(availableCandidates(['src/Shop/Shop.csproj'], [])).toEqual([]);
  });
});

describe('selection', () => {
  const kinds: Record<string, 'dir' | 'file'> = {
    node_modules: 'dir',
    'packages/a/node_modules': 'dir',
    '.pnp.cjs': 'file',
    '.yarn/cache': 'dir',
    'bin/packages': 'dir',
  };
  const probe = async (p: string) => kinds[p] ?? null;

  it('keeps candidates that exist with the right kind and that the ignore rules exclude', async () => {
    const cs = nodeCandidates(['package.json', 'packages/a/package.json']);
    const chosen = await selectAvailable(cs, { ignore: rules('node_modules/\n.pnp.*\n'), probe });
    expect(paths(chosen)).toEqual(['.pnp.cjs', 'node_modules', 'packages/a/node_modules']);
  });

  it('never makes available a path the ignore rules do not exclude', async () => {
    const cs = nodeCandidates(['package.json']);
    const chosen = await selectAvailable(cs, { ignore: rules('dist/\n'), probe });
    expect(chosen).toEqual([]);
  });

  it('never makes available obj/ or bin/, nor a path below another chosen path', async () => {
    const cs: AvailableCandidate[] = [
      { path: 'bin/packages', kind: 'dir', ecosystem: 'csharp-dotnet', source: 'nuget.config' },
      { path: 'node_modules', kind: 'dir', ecosystem: 'typescript-javascript', source: 'x' },
      {
        path: 'node_modules/inner/node_modules',
        kind: 'dir',
        ecosystem: 'typescript-javascript',
        source: 'x',
      },
    ];
    const chosen = await selectAvailable(cs, {
      ignore: rules('*\n'),
      probe: async () => 'dir',
    });
    expect(paths(chosen)).toEqual(['node_modules']);
  });

  it('refuses unsafe paths', async () => {
    const cs: AvailableCandidate[] = [
      { path: '../x', kind: 'dir', ecosystem: 'csharp-dotnet', source: 'n' },
      { path: '.git/x', kind: 'dir', ecosystem: 'csharp-dotnet', source: 'n' },
    ];
    expect(await selectAvailable(cs, { ignore: rules('*\n'), probe: async () => 'dir' })).toEqual(
      [],
    );
  });
});

describe('left out of every copy (§3.2)', () => {
  it('leaves out transform caches and generated code directly inside a node_modules', () => {
    for (const p of [
      'node_modules/.cache',
      'node_modules/.cache/babel/x.json',
      'node_modules/.vite',
      'node_modules/.vite-temp/a',
      'node_modules/.vitest/results.json',
      'node_modules/.prisma/client/index.js',
      'packages/a/node_modules/.vite',
      'node_modules/x/node_modules/.cache/y',
    ]) {
      expect(isLeftOut(p), p).toBe(true);
    }
  });

  it('keeps everything else, bin directories of packages included', () => {
    for (const p of [
      'node_modules',
      'node_modules/.bin/tsc',
      'node_modules/typescript/bin/tsc',
      'node_modules/@prisma/client/index.js',
      'node_modules/x/.cache-like',
      '.cache/x',
      'node_modules/.pnpm/a@1/node_modules/a/index.js',
    ]) {
      expect(isLeftOut(p), p).toBe(false);
    }
  });
});
