// Spike C001-T-014: `npm run bench -- spike-parse ...`. Runs N cold runs of spikes/parse/run-once.ts
// on one benchmark change (or on a repository named by hand), each in a fresh Node.js process
// timed and memory-sampled by the harness of C001-T-013 (bench/harness/run.ts), evaluates them
// against the pass condition and writes bench/results/parse-spike-<id>-<time>.json and .md.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBytes, formatDuration } from '../../bench/harness/report.js';
import { hostInfo, runCommand, type PhaseRecord, type RunReport } from '../../bench/harness/run.js';
import { evaluate, TASK_LIMITS, verdictWord, type Verdict } from './pass-condition.js';
import { DEFAULT_HEAP_MB, defaultWorkers, type G09Mode, type RunOnceResult } from './run-once.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
/** Output directory of `spikes/parse/tsconfig.json` (inside node_modules so imports resolve). */
export const BUILD_DIR = path.join(repoRoot, 'node_modules', '.cache', 'sdd-parse-spike');

/**
 * Compiles the spike and the core modules it uses to JavaScript (not measured), so that the
 * measured process runs compiled code as the shipped package would, without the tsx loader in the
 * main thread and in every worker. Returns the compiled entry.
 */
export function buildSpike(): string {
  rmSync(BUILD_DIR, { recursive: true, force: true });
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '-p', path.join(here, 'tsconfig.json')], {
    stdio: 'inherit',
  });
  const entry = path.join(BUILD_DIR, 'spikes', 'parse', 'run-once.js');
  if (!existsSync(entry)) throw new Error(`the spike build wrote no ${entry}`);
  return entry;
}

export const COLD_RUN_DEFINITION =
  'Each run is a fresh Node.js process (no module, grammar, worker, git process or analysis ' +
  'result carried over from an earlier run) with a fresh cat-file process. The operating-system ' +
  'file cache is NOT flushed: on Windows that needs administrator rights (for example RAMMap ' +
  '"Empty Standby List"), which the reference set-up does not use, so repository files and git ' +
  'objects read by an earlier run may be served from memory.';

export interface SpikeTarget {
  readonly id: string;
  readonly repo: string;
  readonly base: string;
  readonly head: string;
  /** The branch holding the change, for the check-out hint. */
  readonly ref: string | null;
}

export interface SpikeOptions {
  readonly runs: number;
  readonly workers: number;
  readonly heapMb: number;
  readonly g09: G09Mode;
  readonly eagerGrammars: boolean;
}

export interface SpikeRun {
  readonly run: number;
  readonly exitCode: number | null;
  readonly wallClockMs: number;
  readonly peakResidentBytes: number;
  readonly peakProcessCount: number;
  readonly sampleCount: number;
  readonly maxGapMs: number;
  readonly harnessPhases: PhaseRecord[];
  readonly child: RunOnceResult | null;
  readonly outputTail: string | null;
}

export interface SpikeReport {
  schema: 'sdd-review-parse-spike/1';
  id: string;
  startedAt: string;
  host: RunReport['host'];
  target: SpikeTarget;
  options: SpikeOptions;
  coldRun: string;
  measured: string;
  passCondition: typeof TASK_LIMITS & { source: string };
  runs: SpikeRun[];
  verdict: Verdict;
  result: 'pass' | 'miss' | 'incomplete';
}

interface BenchSetChange {
  id: string;
  baseCommit: string;
  headCommit: string;
  changeLocation: { checkout: string; ref: string };
}

/** The benchmark changes named (`all` for every one) from bench/set/benchmark-set.json. */
export function resolveBenchTargets(
  ids: readonly string[],
  setFile: string,
  benchRoot: string,
): SpikeTarget[] {
  const set = JSON.parse(readFileSync(setFile, 'utf8')) as {
    frozen: boolean;
    benchmarkChanges: BenchSetChange[];
  };
  if (!set.frozen) throw new Error(`${setFile} is not frozen: the spike measures the frozen set`);
  const wanted = ids.includes('all') ? set.benchmarkChanges.map((c) => c.id) : ids;
  return wanted.map((id) => {
    const c = set.benchmarkChanges.find((x) => x.id === id);
    if (!c) {
      throw new Error(
        `unknown benchmark change ${id}; known: ${set.benchmarkChanges.map((x) => x.id).join(', ')}`,
      );
    }
    return {
      id,
      repo: path.join(benchRoot, c.changeLocation.checkout),
      base: c.baseCommit,
      head: c.headCommit,
      ref: c.changeLocation.ref,
    };
  });
}

/** Not measured: the checkout must hold exactly the change, at its head, with nothing else. */
export function preflight(target: SpikeTarget): void {
  if (!existsSync(target.repo)) throw new Error(`no checkout at ${target.repo}`);
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', target.repo, ...args], { encoding: 'utf8' }).trim();
  const head = git('rev-parse', 'HEAD');
  const wanted = git('rev-parse', `${target.head}^{commit}`);
  if (head !== wanted) {
    throw new Error(
      `${target.repo} is at ${head}, not at the head ${wanted} of ${target.id}; run ` +
        `git -C "${target.repo}" checkout ${target.ref ?? wanted}`,
    );
  }
  const status = git('status', '--porcelain');
  if (status !== '') {
    throw new Error(
      `${target.repo} has local changes or untracked files; G-07 would count them:\n${status}`,
    );
  }
}

export async function runParseSpike(
  target: SpikeTarget,
  options: SpikeOptions,
  log: (line: string) => void = console.log,
): Promise<SpikeReport> {
  preflight(target);
  const entry = buildSpike();
  const startedAt = new Date().toISOString();
  const scratch = mkdtempSync(path.join(tmpdir(), 'sdd-parse-spike-'));
  const runs: SpikeRun[] = [];
  try {
    for (let run = 1; run <= options.runs; run++) {
      const out = path.join(scratch, `run-${run}.json`);
      const report = await runCommand({
        name: `parse-spike-${target.id}-run${run}`,
        command: process.execPath,
        args: [
          entry,
          '--repo',
          target.repo,
          '--base',
          target.base,
          '--head',
          target.head,
          '--workers',
          String(options.workers),
          '--heap-mb',
          String(options.heapMb),
          '--g09',
          options.g09,
          '--out',
          out,
          ...(options.eagerGrammars ? ['--eager-grammars'] : []),
        ],
        firstPhase: 'startup',
      });
      const child = existsSync(out)
        ? (JSON.parse(readFileSync(out, 'utf8')) as RunOnceResult)
        : null;
      const exitCode = report.command?.exitCode ?? null;
      runs.push({
        run,
        exitCode,
        wallClockMs: report.wallClockMs,
        peakResidentBytes: report.memory.peakResidentBytes,
        peakProcessCount: report.memory.peakProcessCount,
        sampleCount: report.memory.sampleCount,
        maxGapMs: report.memory.maxGapMs,
        harnessPhases: report.phases,
        child,
        outputTail: exitCode === 0 && child ? null : (report.command?.outputTail ?? null),
      });
      log(
        `${target.id} run ${run}/${options.runs}: ${exitCode === 0 ? 'ok' : `FAILED (exit ${exitCode})`}, ` +
          `${formatDuration(report.wallClockMs)}, peak ${formatBytes(report.memory.peakResidentBytes)}` +
          (child
            ? ` (git ${formatDuration(child.totals.git)}, parse ${formatDuration(child.totals.parse)}, ` +
              `extract ${formatDuration(child.totals.extract)})`
            : ''),
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const verdict = evaluate(
    runs.map((r) => ({
      wallClockMs: r.wallClockMs,
      peakResidentBytes: r.peakResidentBytes,
      ok: r.exitCode === 0 && r.child !== null,
    })),
  );
  return {
    schema: 'sdd-review-parse-spike/1',
    id: target.id,
    startedAt,
    host: hostInfo(),
    target,
    options,
    coldRun: COLD_RUN_DEFINITION,
    measured:
      'Time: wall-clock of the whole run process (compiled JavaScript), from spawn to exit ' +
      '(Node.js start, worker start and grammar loading, git reads G-07, G-09, snapshot and rename-set reads, parsing, ' +
      'extraction, shutdown): an upper bound of "git reads plus parsing plus extraction". Memory: ' +
      'peak of the summed resident set (Windows: working set) of the run process and its child ' +
      'git processes, sampled every 100 ms by bench/harness/sampler.ts; worker threads are inside ' +
      'the run process.',
    passCondition: {
      ...TASK_LIMITS,
      source:
        'C001-T-014: max wall-clock <= 60 s (50 % of C001-NFR-001) and peak resident memory <= ' +
        '1 GiB (50 % of C001-NFR-004) over 5 cold runs, for every benchmark change',
    },
    runs,
    verdict,
    result: verdictWord(verdict),
  };
}

const ms = (v: number) => `${(v / 1000).toFixed(2)} s`;

export function spikeMarkdown(r: SpikeReport): string {
  const v = r.verdict;
  const lines = [
    `# Parse spike (C001-T-014): ${r.id}`,
    '',
    `- Result: **${r.result.toUpperCase()}**` +
      (r.result === 'incomplete'
        ? ` (within the limits, but ${v.runs} run(s) of the ${r.passCondition.requiredRuns} required)`
        : ''),
    `- Max wall-clock: ${ms(v.maxWallClockMs)} of ${ms(r.passCondition.timeLimitMs)} ` +
      `(${v.timePass ? 'pass' : 'MISS'}, margin ${ms(v.timeMarginMs)}, ${v.timeMarginPct} %)`,
    `- Peak resident memory: ${formatBytes(v.maxPeakResidentBytes)} of ` +
      `${formatBytes(r.passCondition.memoryLimitBytes)} (${v.memoryPass ? 'pass' : 'MISS'}, margin ` +
      `${formatBytes(Math.abs(v.memoryMarginBytes))}${v.memoryMarginBytes < 0 ? ' over' : ''}, ` +
      `${v.memoryMarginPct} %)`,
    `- Runs: ${v.runs}, failed: ${v.failedRuns}`,
    `- Started: ${r.startedAt}`,
    `- Host: ${r.host.os} ${r.host.release}, ${r.host.cpu}, ${r.host.logicalCpus} logical CPUs, ` +
      `${formatBytes(r.host.totalMemBytes)} RAM, Node ${r.host.node}`,
    `- Change: \`${r.target.repo}\`, base \`${r.target.base}\`, head \`${r.target.head}\``,
    `- Workers: ${r.options.workers}, heap limit per worker ${r.options.heapMb} MiB ` +
      `(resourceLimits.maxOldGenerationSizeMb), grammars loaded ` +
      `${r.options.eagerGrammars ? 'at worker start (all five)' : 'on first use'}, G-09 read path: ${r.options.g09}`,
    `- Cold run: ${r.coldRun}`,
    `- Measured: ${r.measured}`,
    `- Pass condition: ${r.passCondition.source}`,
    '',
    '## Runs',
    '',
    '| Run | Exit | Wall-clock | Peak memory | Procs at peak | Samples (max gap) | Startup | Git | Parse | Extract | Other |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const run of r.runs) {
    const t = run.child?.totals;
    lines.push(
      `| ${run.run} | ${run.exitCode ?? 'none'} | ${ms(run.wallClockMs)} | ${formatBytes(run.peakResidentBytes)} | ` +
        `${run.peakProcessCount} | ${run.sampleCount} (${run.maxGapMs} ms) | ` +
        (t && run.child
          ? `${ms(run.child.startupMs)} | ${ms(t.git)} | ${ms(t.parse)} | ${ms(t.extract)} | ${ms(t.other)} |`
          : '| | | | |'),
    );
  }
  const first = r.runs.find((x) => x.child)?.child;
  if (first) {
    const c = first.counts;
    lines.push(
      '',
      '## Phases of each run (ms, measured inside the run process)',
      '',
      `| Phase | ${r.runs.map((x) => `Run ${x.run}`).join(' | ')} |`,
      `|---|${r.runs.map(() => '---:').join('|')}|`,
    );
    for (const p of first.phases) {
      lines.push(
        `| ${p.name} | ${r.runs
          .map((x) => x.child?.phases.find((q) => q.name === p.name)?.ms ?? '')
          .join(' | ')} |`,
      );
    }
    lines.push(
      '',
      '## Work of one run (run 1 of those that finished)',
      '',
      `- Changed files (G-07): ${c.changedFiles}, text ${c.changedTextFiles}, of a deep ecosystem ` +
        `${c.changedDeepFiles} (${Object.entries(c.byLanguage)
          .map(([k, n]) => `${k} ${n}`)
          .join(', ')})`,
      `- Sides parsed: ${c.parsedSides} (${c.parsedChars} characters), parse failures ${c.parseFailures}`,
      `- Extraction: ${c.symbols} symbol definitions, ${c.imports} imports, ${c.references} identifier nodes`,
      `- G-09: ${c.g09.files} files, ${c.g09.addedLines} added and ${c.g09.deletedLines} deleted ` +
        `lines attributed (${c.g09.uncommittedLines} uncommitted), about ${c.g09.gitSpawns} git spawn(s)`,
      `- Identifier index: ${c.snapshotFilesIndexed} snapshot files, ${c.indexWords} distinct words`,
      `- Rename search set: ${c.renameOldNames} old and ${c.renameNewNames} new names, ` +
        `${c.renameSearchSetFiles} files parsed (${c.renameSearchSetChars} characters), ` +
        `parse failures ${c.renameSearchSetParseFailures}`,
      `- Worker heap after the run: ${first.workers
        .map((w) => formatBytes(w.heapUsed))
        .join(', ')}; peak trees held per worker: ${first.workers
        .map((w) => w.peakTrees)
        .join(', ')}; grammars loaded per worker: ${first.workers
        .map((w) => w.grammars.join('+') || 'none')
        .join(', ')}`,
      `- Run process's own peak RSS (cross-check, process.memoryUsage): ${formatBytes(first.selfPeakRssBytes)}`,
    );
  }
  const failed = r.runs.filter((x) => x.outputTail);
  if (failed.length > 0) {
    lines.push('', '## Failed runs', '');
    for (const f of failed) lines.push(`Run ${f.run}:`, '', '```', f.outputTail!.trim(), '```', '');
  }
  lines.push('');
  return lines.join('\n');
}

export function writeSpikeReport(
  r: SpikeReport,
  outDir: string,
): { jsonPath: string; mdPath: string } {
  mkdirSync(outDir, { recursive: true });
  const stamp = r.startedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const base = `parse-spike-${r.id.replace(/[^A-Za-z0-9._-]+/g, '_')}-${stamp}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify(r, null, 2) + '\n', 'utf8');
  writeFileSync(mdPath, spikeMarkdown(r), 'utf8');
  return { jsonPath, mdPath };
}

export const SPIKE_USAGE = `  spike-parse <bench-id ...|all> [--runs 5] [--workers N] [--heap-mb ${DEFAULT_HEAP_MB}] [--g09 batched|adapter] [--eager-grammars]
                               C001-T-014: N cold runs (fresh process each) of the parse spike on
                               benchmark changes; writes bench/results/parse-spike-<id>-<time>.json/.md
  spike-parse --repo <dir> --base <commit> [--head <commit>] [--name <id>] [--runs N] ...
                               the same on a repository named by hand (smoke tests)`;

/** Parses the arguments of `spike-parse`; returns the targets and options. */
export function parseSpikeArgs(
  argv: readonly string[],
  setFile: string,
  benchRoot: string,
): { targets: SpikeTarget[]; options: SpikeOptions } {
  const flags = new Map<string, string>();
  const ids: string[] = [];
  let eagerGrammars = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--eager-grammars') eagerGrammars = true;
    else if (a.startsWith('--')) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${a} needs a value`);
      flags.set(a.slice(2), value);
      i++;
    } else ids.push(a);
  }
  const known = new Set(['runs', 'workers', 'heap-mb', 'g09', 'repo', 'base', 'head', 'name']);
  for (const k of flags.keys()) if (!known.has(k)) throw new Error(`unknown option --${k}`);
  const int = (name: string, fallback: number) => {
    const raw = flags.get(name);
    const n = raw === undefined ? fallback : Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`);
    return n;
  };
  const g09 = flags.get('g09') ?? 'batched';
  if (g09 !== 'batched' && g09 !== 'adapter') throw new Error('--g09 must be batched or adapter');
  const options: SpikeOptions = {
    runs: int('runs', TASK_LIMITS.requiredRuns),
    workers: int('workers', defaultWorkers()),
    heapMb: int('heap-mb', DEFAULT_HEAP_MB),
    g09,
    eagerGrammars,
  };
  const repo = flags.get('repo');
  if (repo) {
    const base = flags.get('base');
    if (!base || ids.length > 0) throw new Error('--repo needs --base and no benchmark id');
    return {
      targets: [
        {
          id: flags.get('name') ?? 'custom',
          repo: path.resolve(repo),
          base,
          head: flags.get('head') ?? 'HEAD',
          ref: null,
        },
      ],
      options,
    };
  }
  if (ids.length === 0)
    throw new Error('name a benchmark change (bench-ts, bench-py, bench-cs) or all');
  return { targets: resolveBenchTargets(ids, setFile, benchRoot), options };
}
