// Spike C001-T-020 (spike-grade): the per-ecosystem injections of the prototype coverage adapters
// (C001-ADR-007 §1 "Injection", §2) and the reading of their results. Values go only through
// environment variables (appended or prepended, never replacing) and files in the runtime
// directory and `<workspace>.aux/`. C001-T-057 to C001-T-060 replace this.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Injection } from '../../../src/core/evidence/runner/environment.js';
import {
  ecosystemOfPath,
  type PerTestCoverage,
  type SpikeEcosystem,
  mergeCoverage,
} from '../changed.js';
import {
  readDotnetResults,
  readNodeLines,
  readPythonResult,
  type PythonResultFile,
} from './readers.js';

export interface CoverageContext {
  readonly ecosystem: SpikeEcosystem;
  /** Real path of the workspace root. */
  readonly workspaceRoot: string;
  readonly auxDir: string;
  /** `<evidence root>/runtime/spike-evidence`. */
  readonly runtimeDir: string;
  /** Changed paths with added lines (repository paths). */
  readonly changedPaths: readonly string[];
  /** Every path of the snapshot (for the load monitors). */
  readonly snapshotPaths: readonly string[];
  /** Roots that count as "outside": the working tree, other workspaces of the snapshot. */
  readonly outsideRoots: readonly string[];
  /** Directory of a vendored coverage.py (C001-ADR-007 §2), used when the environment has none. */
  readonly pythonVendor: string | null;
  /** AltCover executable (developer-installed for the spike). */
  readonly altcover: string | null;
}

export interface CoverageSetup {
  readonly inject: readonly Injection[];
  read(): PerTestCoverage & { notes: string[] };
}

const caseInsensitive = process.platform === 'win32';
const fwd = (p: string) => p.split(path.sep).join('/');
const escapeRegex = (s: string) => s.replace(/[.*+?()[\]{}|\\]/g, '\\$&');

/** Injections every run of the ecosystem gets, baseline included (C001-ADR-006 §6 bytecode). */
export function workspaceInjections(ecosystem: SpikeEcosystem, auxDir: string): Injection[] {
  if (ecosystem !== 'python') return [];
  return [
    {
      name: 'PYTHONPYCACHEPREFIX',
      value: path.join(auxDir, 'pycache'),
      position: 'prepend',
      separator: path.delimiter,
    },
  ];
}

function changedOf(ctx: CoverageContext, eco: SpikeEcosystem): string[] {
  return ctx.changedPaths
    .filter((p) => ecosystemOfPath(p) === eco)
    .map((p) => path.join(ctx.workspaceRoot, ...p.split('/')));
}

function readDir(dir: string, test: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(test)
    .map((n) => path.join(dir, n));
}

/** The Node preload (Jest). */
export function nodeCoverage(
  ctx: CoverageContext,
  options: { monitorOnly?: boolean } = {},
): CoverageSetup {
  const outDir = path.join(ctx.auxDir, options.monitorOnly ? 'node-monitor' : 'node-cov');
  mkdirSync(outDir, { recursive: true });
  const config = path.join(
    ctx.auxDir,
    options.monitorOnly ? 'sddr-node-monitor.json' : 'sddr-node.json',
  );
  writeFileSync(
    config,
    JSON.stringify({
      workspaceRoot: ctx.workspaceRoot,
      files: options.monitorOnly ? [] : changedOf(ctx, 'typescript-javascript'),
      outDir,
      outsideRoots: ctx.outsideRoots,
      snapshotPaths: ctx.snapshotPaths,
      caseInsensitive,
    }),
  );
  const preload = fwd(path.join(ctx.runtimeDir, 'node', 'sddr-preload.cjs'));
  return {
    inject: [
      {
        name: 'NODE_OPTIONS',
        value: `--require "${preload}"`,
        position: 'prepend',
        separator: ' ',
      },
      { name: 'SDDR_NODE_CONFIG', value: config, position: 'prepend', separator: path.delimiter },
    ],
    read() {
      const files = readDir(outDir, (n) => n.endsWith('.jsonl'));
      const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
      const notes = text
        .split('\n')
        .filter((l) => l.includes('"kind":"error"'))
        .slice(0, 5);
      return { ...readNodeLines(text, ctx.workspaceRoot, caseInsensitive), notes };
    },
  };
}

/** The Python hook with coverage.py contexts and the pytest plugin. */
export function pythonCoverage(
  ctx: CoverageContext,
  options: { coverage?: boolean; tag?: string } = {},
): CoverageSetup {
  const tag = options.tag ?? 'py-cov';
  const outDir = path.join(ctx.auxDir, tag);
  mkdirSync(outDir, { recursive: true });
  const config = path.join(ctx.auxDir, `${tag}.json`);
  writeFileSync(
    config,
    JSON.stringify({
      coverage: options.coverage ?? true,
      files: changedOf(ctx, 'python'),
      outDir,
      vendor: ctx.pythonVendor,
      workspaceRoot: ctx.workspaceRoot,
      outsideRoots: ctx.outsideRoots,
      snapshotPaths: ctx.snapshotPaths,
    }),
  );
  return {
    inject: [
      {
        name: 'PYTHONPATH',
        value: path.join(ctx.runtimeDir, 'python'),
        position: 'prepend',
        separator: path.delimiter,
      },
      { name: 'SDDR_RUN', value: config, position: 'prepend', separator: path.delimiter },
      { name: 'PYTEST_PLUGINS', value: 'sddr_pytest', position: 'append', separator: ',' },
      ...workspaceInjections('python', ctx.auxDir),
    ],
    read() {
      const parts = readDir(outDir, (n) => /^python-\d+\.json$/.test(n)).map((f) =>
        readPythonResult(
          JSON.parse(readFileSync(f, 'utf8')) as PythonResultFile,
          ctx.workspaceRoot,
          caseInsensitive,
        ),
      );
      const merged = mergeCoverage(parts);
      return {
        ...merged,
        ecosystem: 'python',
        notes: parts.length === 0 ? ['no result file of the pytest plugin'] : [],
      };
    },
  };
}

/** Names of the snapshot's C# projects, the assemblies AltCover may instrument. */
export function projectNames(snapshotPaths: readonly string[]): string[] {
  return snapshotPaths
    .filter((p) => p.endsWith('.csproj'))
    .map((p) => path.posix.basename(p, '.csproj'))
    .sort();
}

/** The .NET targets with AltCover and the TRX logger. */
export function dotnetCoverage(ctx: CoverageContext): CoverageSetup {
  const names = changedOf(ctx, 'csharp-dotnet').map((f) => path.basename(f));
  const files = `(?:${[...new Set(names)].map(escapeRegex).join('|') || 'NO_CHANGED_FILE'})`;
  const assemblies = `(?:${projectNames(ctx.snapshotPaths).map(escapeRegex).join('|') || 'NONE'})`;
  const inject: Injection[] = [
    {
      name: 'CustomAfterMicrosoftCommonTargets',
      value: path.join(ctx.runtimeDir, 'dotnet', 'sddr.targets'),
      position: 'prepend',
      separator: ';',
    },
    { name: 'SDDR_AUX_DIR', value: ctx.auxDir, position: 'prepend', separator: ';' },
    { name: 'SDDR_ALTCOVER_FILES', value: files, position: 'prepend', separator: '|' },
    { name: 'SDDR_ALTCOVER_ASSEMBLIES', value: assemblies, position: 'prepend', separator: '|' },
  ];
  if (ctx.altcover) {
    inject.push({
      name: 'SDDR_ALTCOVER',
      value: ctx.altcover,
      position: 'prepend',
      separator: ';',
    });
  }
  return {
    inject,
    read() {
      const notes: string[] = [];
      // Runner mode: merge the raw visits (.acv) into each report (AltCover `runner --collect`).
      for (const dirFile of readDir(path.join(ctx.auxDir, 'altcover'), (n) => n.endsWith('.dir'))) {
        const recorder = readFileSync(dirFile, 'utf8').trim();
        if (!ctx.altcover || !recorder) continue;
        try {
          execFileSync(ctx.altcover, ['runner', '--collect', '-r', recorder], {
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (error) {
          notes.push(`altcover runner --collect failed: ${(error as Error).message.slice(0, 300)}`);
        }
      }
      const xml = readDir(path.join(ctx.auxDir, 'altcover'), (n) => n.endsWith('.xml')).map((f) =>
        readFileSync(f, 'utf8'),
      );
      const trx = readDir(path.join(ctx.auxDir, 'trx'), (n) => n.endsWith('.trx')).map((f) =>
        readFileSync(f, 'utf8'),
      );
      const r = readDotnetResults(xml, trx, ctx.workspaceRoot, caseInsensitive);
      if (!ctx.altcover) notes.push('AltCover not found: no per-test lines');
      if (xml.length === 0) notes.push('no AltCover report');
      if (trx.length === 0) notes.push('no TRX file');
      if (r.unmatchedTrackedTests > 0)
        notes.push(`${r.unmatchedTrackedTests} tracked methods without a TRX result`);
      return { ...r, notes };
    },
  };
}

/** The coverage setup of the target's ecosystem. */
export function coverageFor(ctx: CoverageContext): CoverageSetup {
  switch (ctx.ecosystem) {
    case 'typescript-javascript':
      return nodeCoverage(ctx);
    case 'python':
      return pythonCoverage(ctx);
    case 'csharp-dotnet':
      return dotnetCoverage(ctx);
    default:
      return { inject: [], read: () => ({ ...mergeCoverage([]), notes: ['no adapter'] }) };
  }
}
