// Spike C001-T-020 (spike-grade): mutation testing in the mutation copy (C001-ADR-006 §7,
// C001-ADR-007 §3) — the copy of the test run's workspace with root rewrite, then StrykerJS,
// Stryker.NET or the Python engine on the executed changed lines in risk order, with the worker
// count and priority of C001-ADR-006 §8, results converted to MutationResult and saved as
// revisions. Every step is timed for W3 (and the copy end is signalled for W4).
// C001-T-062 to C001-T-064 replace it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type { MutationResult } from '../../../src/generated/analysis-results.js';
import { mutationWorkerCount } from '../../../src/core/evidence/runner/priority.js';
import {
  runInWorkspace,
  type CommandResult,
} from '../../../src/core/evidence/runner/run-command.js';
import type { Injection } from '../../../src/core/evidence/runner/environment.js';
import { mapLimit } from '../../../src/core/evidence/workspace/fill.js';
import type { WorkspaceHandle } from '../../../src/core/evidence/workspace/lifetime.js';
import { makeMutationCopy } from '../../../src/core/evidence/workspace/mutation-copy.js';
import {
  coveringPassingTests,
  executedChangedLines,
  mutationHunks,
  tierRanges,
  twoTiers,
  type MutationHunk,
  type PerTestCoverage,
  type SpikeEcosystem,
} from '../changed.js';
import { nodeCoverage, pythonCoverage, type CoverageContext } from '../coverage/inject.js';
import type { EvidenceSession, WorkspaceRun } from '../session.js';
import type { SpikeTools } from '../tools.js';
import {
  mutantTimeoutMs,
  pytestOutcome,
  pytestPluginArgs,
  recordablePrefix,
  type PlannedMutant,
} from './python-plan.js';
import {
  convertReport,
  lineRangesToCharSpans,
  strykerJsConfig,
  strykerNetConfig,
  strykerNetMutate,
  unavailableFor,
  type MutationTestingReport,
} from './stryker.js';

export interface MutationOptions {
  readonly session: EvidenceSession;
  readonly testRun: WorkspaceRun;
  readonly coverage: PerTestCoverage;
  readonly ecosystem: SpikeEcosystem;
  readonly tools: SpikeTools;
  readonly runtimeDir: string;
  /** Worker count; default one fewer than the logical cores (C001-ADR-006 §8). */
  readonly workers?: number;
  /** Smoke runs only: at most this many hunks (riskiest first). Invalid for C001-T-021. */
  readonly hunkLimit?: number;
  /** Called once the copy window has ended (W4 "during mutation" may start). */
  readonly onCopied?: () => void;
  /** Records results; returns the save time (a revision per tier or per hunk prefix). */
  readonly record: (results: readonly MutationResult[]) => Promise<number>;
}

export interface ToolRun {
  readonly tool: string;
  readonly tier: number;
  readonly hunks: number;
  readonly mutants: number;
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly ending: string;
  readonly observeMs: number;
  readonly notes: string[];
}

export interface MutationReport {
  readonly ecosystem: SpikeEcosystem;
  readonly workers: number;
  readonly hunks: number;
  readonly hunkLimit: number | null;
  readonly copy: {
    ok: boolean;
    cause?: string;
    durationMs: number;
    method?: string;
    files?: number;
    bytes?: number;
    rewrittenFiles?: number;
  };
  readonly toolRuns: ToolRun[];
  readonly firstUnmutatedRunMs: number | null;
  readonly loadedOutside: readonly string[];
  readonly mutants: number;
  readonly outcomes: Record<string, number>;
  readonly unavailable: number;
  readonly saves: { count: number; totalMs: number };
  /** From the end of the test run (call of this function) to the last recorded result: (b). */
  readonly totalMs: number;
  readonly meanPerMutantMs: number | null;
  readonly results: readonly MutationResult[];
}

const ms = (t0: number) => Math.round((performance.now() - t0) * 10) / 10;
const quote = (s: string) => `"${s}"`;
const tail = (r: CommandResult) =>
  (r.stderr.bytes.toString('utf8') + r.stdout.bytes.toString('utf8')).slice(-1500);

/** Runs one tool command in the mutation copy, at low priority, inside an observer window. */
async function runInCopy(
  session: EvidenceSession,
  copy: WorkspaceHandle,
  command: string,
  inject: readonly Injection[],
  timeoutMs?: number,
): Promise<{ result: CommandResult; observeMs: number }> {
  let t0 = performance.now();
  const window = await session.observer.beginRun();
  let observeMs = ms(t0);
  const result = await runInWorkspace({
    command,
    workspace: copy,
    repository: session.location,
    env: session.env,
    inject,
    priority: 'low',
    timeoutMs,
    log: session.log,
    operation: 'mutation-run',
  });
  t0 = performance.now();
  await session.observer.endRun(window);
  observeMs += ms(t0);
  return { result, observeMs };
}

/** Mutation testing of one snapshot after its test run; see the module comment. */
export async function runMutation(options: MutationOptions): Promise<MutationReport> {
  const started = performance.now();
  const { session } = options;
  const workers = options.workers ?? mutationWorkerCount();
  const executed = executedChangedLines(session.addedLines(), options.coverage);
  let hunks = mutationHunks(session.hunks, executed, options.ecosystem);
  const allHunks = hunks.length;
  if (options.hunkLimit !== undefined) hunks = hunks.slice(0, options.hunkLimit);
  const results: MutationResult[] = [];
  const toolRuns: ToolRun[] = [];
  const saves = { count: 0, totalMs: 0 };
  const record = async (batch: readonly MutationResult[]) => {
    results.push(...batch);
    saves.count++;
    saves.totalMs += await options.record(results);
  };

  const source = options.testRun.prepared;
  const copied = await makeMutationCopy({
    source: { handle: source.handle, index: source.index, available: source.available },
    repository: session.location,
    hunks: hunks.map((h) => ({ path: h.path, line: h.firstLine })),
    registry: session.registry,
    log: session.log,
  });
  options.onCopied?.();
  const finish = (
    copy: MutationReport['copy'],
    firstUnmutatedRunMs: number | null,
    loadedOutside: readonly string[],
  ): MutationReport => {
    const outcomes: Record<string, number> = {};
    let unavailable = 0;
    for (const r of results) {
      if ('outcome' in r) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
      else unavailable++;
    }
    const mutants = results.length - unavailable;
    const totalMs = ms(started);
    // Mean over the mutant runs; the Python engine's first unmutated run (tier 0) is apart.
    const toolMs = toolRuns.filter((t) => t.tier > 0).reduce((s, t) => s + t.durationMs, 0);
    return {
      ecosystem: options.ecosystem,
      workers,
      hunks: allHunks,
      hunkLimit: options.hunkLimit ?? null,
      copy,
      toolRuns,
      firstUnmutatedRunMs,
      loadedOutside,
      mutants,
      outcomes,
      unavailable,
      saves,
      totalMs,
      meanPerMutantMs: mutants > 0 ? Math.round((toolMs / mutants) * 10) / 10 : null,
      results,
    };
  };
  if (!copied.ok) {
    await record(hunks.map((h) => ({ hunkId: h.hunkId, unavailable: copied.cause })));
    return finish({ ok: false, cause: copied.cause, durationMs: ms(started) }, null, []);
  }
  const c = copied.copy;
  const copyInfo: MutationReport['copy'] = {
    ok: true,
    durationMs: Math.round(c.durationMs * 10) / 10,
    method: c.copy.method,
    files: c.copy.files,
    bytes: c.copy.bytes,
    rewrittenFiles: c.rewritten.length,
  };
  const copyRoot = await realpath(c.handle.root);
  const testRunRoot = await realpath(source.handle.root);
  const ctx: CoverageContext = {
    ecosystem: options.ecosystem,
    workspaceRoot: copyRoot,
    auxDir: c.handle.auxDir,
    runtimeDir: options.runtimeDir,
    changedPaths: [...session.addedLines().keys()],
    snapshotPaths: session.snapshotPaths(),
    outsideRoots: [session.location.workTreeRoot, testRunRoot],
    pythonVendor: options.tools.pythonVendor,
    altcover: null,
  };
  const deps: StepDeps = { options, copy: c.handle, copyRoot, ctx, workers, toolRuns, record };
  try {
    if (hunks.length === 0) return finish(copyInfo, null, []);
    if (options.ecosystem === 'typescript-javascript') {
      const outside = await strykerJsTiers(deps, hunks);
      return finish(copyInfo, null, outside);
    }
    if (options.ecosystem === 'csharp-dotnet') {
      await strykerNetTiers(deps, hunks);
      return finish(copyInfo, null, []);
    }
    if (options.ecosystem === 'python') {
      const r = await pythonEngine(deps, hunks);
      return finish(copyInfo, r.firstUnmutatedRunMs, r.loadedOutside);
    }
    return finish(copyInfo, null, []);
  } finally {
    await session.registry.release(c.handle);
  }
}

interface StepDeps {
  readonly options: MutationOptions;
  readonly copy: WorkspaceHandle;
  readonly copyRoot: string;
  readonly ctx: CoverageContext;
  readonly workers: number;
  readonly toolRuns: ToolRun[];
  readonly record: (batch: readonly MutationResult[]) => Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// StrykerJS

async function strykerJsTiers(d: StepDeps, hunks: MutationHunk[]): Promise<string[]> {
  const { tools, session } = d.options;
  const tiers = twoTiers(hunks).filter((t) => t.length > 0);
  const outside = new Set<string>();
  for (const [i, tier] of tiers.entries()) {
    if (!tools.strykerJs || !tools.strykerJsModules) {
      await d.record(unavailableFor(tier, [], 'mutation tool not installed'));
      continue;
    }
    const report = path.join(d.copy.auxDir, `stryker-js-tier${i + 1}.json`);
    const config = path.join(d.copy.auxDir, `stryker-js-tier${i + 1}.conf.json`);
    writeFileSync(
      config,
      JSON.stringify(
        strykerJsConfig({
          ranges: tierRanges(tier),
          concurrency: d.workers,
          jsonReport: report,
          // Resolved from the StrykerJS installation's own node_modules (sibling of the core).
          plugins: ['@stryker-mutator/jest-runner'],
          testRunner: 'jest',
        }),
        null,
        2,
      ),
    );
    // The load monitor rides on the tool's own processes: its first unmutated run is the
    // self-containment check (C001-ADR-006 §7 item 5).
    const monitor = nodeCoverage(d.ctx, { monitorOnly: true });
    const t0 = performance.now();
    const { result, observeMs } = await runInCopy(
      session,
      d.copy,
      `${quote(process.execPath)} ${quote(tools.strykerJs)} run ${quote(config)}`,
      monitor.inject,
    );
    const durationMs = ms(t0);
    for (const f of monitor.read().loadedOutside) outside.add(f);
    const notes: string[] = [];
    let batch: MutationResult[] = [];
    if (existsSync(report)) {
      batch = convertReport(
        JSON.parse(readFileSync(report, 'utf8')) as MutationTestingReport,
        tier,
        d.copyRoot,
      );
    } else notes.push(`no report; ${tail(result)}`);
    const reason =
      result.exitCode === 0
        ? "the hunk's mutants did not complete"
        : 'the tool ended with an error';
    batch.push(...unavailableFor(tier, batch, reason));
    d.toolRuns.push({
      tool: 'StrykerJS',
      tier: i + 1,
      hunks: tier.length,
      mutants: batch.filter((r) => 'outcome' in r).length,
      durationMs,
      exitCode: result.exitCode,
      ending: result.ending,
      observeMs,
      notes,
    });
    await d.record(batch);
  }
  return [...outside];
}

// ---------------------------------------------------------------------------------------------
// Stryker.NET

/** The project directory (nearest `.csproj`) of each path. */
function projectOf(snapshotPaths: readonly string[], file: string): string | null {
  const projects = snapshotPaths.filter((p) => p.endsWith('.csproj'));
  let best: string | null = null;
  for (const p of projects) {
    const dir = path.posix.dirname(p);
    if (
      (dir === '.' || file.startsWith(`${dir}/`)) &&
      (!best || dir.length > path.posix.dirname(best).length)
    ) {
      best = p;
    }
  }
  return best;
}

/** Test projects of the snapshot: projects that reference Microsoft.NET.Test.Sdk or xunit/NUnit/MSTest. */
function testProjects(root: string, snapshotPaths: readonly string[]): string[] {
  return snapshotPaths.filter((p) => {
    if (!p.endsWith('.csproj')) return false;
    try {
      const text = readFileSync(path.join(root, ...p.split('/')), 'utf8');
      return (
        /Microsoft\.NET\.Test\.Sdk|IsTestProject>true|xunit|NUnit|MSTest/i.test(text) &&
        !/Benchmark/i.test(p)
      );
    } catch {
      return false;
    }
  });
}

async function strykerNetTiers(d: StepDeps, hunks: MutationHunk[]): Promise<void> {
  const { tools, session } = d.options;
  const tiers = twoTiers(hunks).filter((t) => t.length > 0);
  const snapshotPaths = session.snapshotPaths();
  const tests = testProjects(d.copyRoot, snapshotPaths);
  const framework =
    /(?:^|\s)(?:-f|--framework)\s+(\S+)/.exec(session.target.testCommand)?.[1] ?? null;
  let invocation = 0;
  for (const [i, tier] of tiers.entries()) {
    if (!tools.strykerNet) {
      await d.record(unavailableFor(tier, [], 'mutation tool not installed'));
      continue;
    }
    const byProject = new Map<string, MutationHunk[]>();
    for (const h of tier) {
      const p = projectOf(snapshotPaths, h.path);
      if (p) byProject.set(p, [...(byProject.get(p) ?? []), h]);
    }
    for (const [project, projectHunks] of byProject) {
      invocation++;
      const projectDir = path.posix.dirname(project);
      const mutate: string[] = [];
      for (const [file, ranges] of tierRanges(projectHunks)) {
        const text = readFileSync(path.join(d.copyRoot, ...file.split('/')), 'utf8');
        const rel = projectDir === '.' ? file : file.slice(projectDir.length + 1);
        mutate.push(...strykerNetMutate(rel, lineRangesToCharSpans(text, ranges)));
      }
      const config = path.join(d.copy.auxDir, `stryker-net-${invocation}.json`);
      const output = path.join(d.copy.auxDir, `stryker-net-${invocation}`);
      mkdirSync(output, { recursive: true });
      writeFileSync(
        config,
        JSON.stringify(
          strykerNetConfig({
            project: path.posix.basename(project),
            testProjects: tests,
            mutate,
            concurrency: d.workers,
            targetFramework: framework,
          }),
          null,
          2,
        ),
      );
      const t0 = performance.now();
      const { result, observeMs } = await runInCopy(
        session,
        d.copy,
        `${quote(tools.strykerNet)} --config-file ${quote(config)} --output ${quote(output)} --skip-version-check`,
        [],
      );
      const durationMs = ms(t0);
      const report = path.join(output, 'reports', 'mutation-report.json');
      const notes: string[] = [];
      let batch: MutationResult[] = [];
      if (existsSync(report)) {
        batch = convertReport(
          JSON.parse(readFileSync(report, 'utf8')) as MutationTestingReport,
          projectHunks,
          d.copyRoot,
        );
      } else notes.push(`no report; ${tail(result)}`);
      batch.push(...unavailableFor(projectHunks, batch, 'the tool ended with an error'));
      d.toolRuns.push({
        tool: `Stryker.NET (${path.posix.basename(project)})`,
        tier: i + 1,
        hunks: projectHunks.length,
        mutants: batch.filter((r) => 'outcome' in r).length,
        durationMs,
        exitCode: result.exitCode,
        ending: result.ending,
        observeMs,
        notes,
      });
      await d.record(batch);
    }
    const covered = new Set([...byProject.values()].flat().map((h) => h.hunkId));
    const orphan = tier.filter((h) => !covered.has(h.hunkId));
    if (orphan.length > 0) await d.record(unavailableFor(orphan, [], 'no project of the hunk'));
  }
}

// ---------------------------------------------------------------------------------------------
// Python engine

async function pythonEngine(
  d: StepDeps,
  hunks: MutationHunk[],
): Promise<{ firstUnmutatedRunMs: number; loadedOutside: string[] }> {
  const { session, coverage, runtimeDir } = d.options;
  const python = coverage.interpreter ?? 'python';
  // List the mutants of the executed changed lines (not timed apart: part of (b)).
  const plan = path.join(d.copy.auxDir, 'py-mutants-plan.json');
  const listed = path.join(d.copy.auxDir, 'py-mutants.json');
  const files: Record<string, number[]> = {};
  for (const h of hunks) files[h.path] = [...(files[h.path] ?? []), ...h.lines];
  writeFileSync(plan, JSON.stringify({ root: d.copyRoot, files }));
  execFileSync(python, [path.join(runtimeDir, 'python', 'sddr_mutate.py'), 'list', plan, listed], {
    cwd: d.copyRoot,
    env: session.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const byFile = JSON.parse(readFileSync(listed, 'utf8')) as Record<
    string,
    Array<{ id: number; line: number; desc: string }> | { error: string }
  >;
  const durations = new Map(coverage.tests.map((t) => [t.testId, t.durationMs]));
  const mutants: PlannedMutant[] = [];
  for (const h of hunks) {
    const list = byFile[h.path];
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (!h.lines.includes(m.line)) continue;
      mutants.push({
        path: h.path,
        site: m.id,
        line: m.line,
        desc: m.desc,
        hunkId: h.hunkId,
        tests: coveringPassingTests(coverage, h.path, m.line),
      });
    }
  }
  const pluginArgs = pytestPluginArgs(session.target.testCommand).join(' ');
  const pytestCmd = (argsFile: string) =>
    `${quote(python)} -m pytest -x -q -p no:cacheprovider ${pluginArgs} @${quote(argsFile)}`;

  // First unmutated run: the union of the covering tests, with the load monitor (C001-ADR-007 §3).
  const union = [...new Set(mutants.flatMap((m) => m.tests))];
  const unionFile = path.join(d.copy.auxDir, 'py-union-tests.txt');
  writeFileSync(unionFile, union.join('\n') + '\n');
  const monitor = pythonCoverage(d.ctx, { coverage: false, tag: 'py-monitor' });
  let t0 = performance.now();
  const first = await runInCopy(session, d.copy, pytestCmd(unionFile), monitor.inject);
  const firstUnmutatedRunMs = ms(t0);
  const loadedOutside = [...monitor.read().loadedOutside];
  d.toolRuns.push({
    tool: 'Python engine: first unmutated run',
    tier: 0,
    hunks: hunks.length,
    mutants: 0,
    durationMs: firstUnmutatedRunMs,
    exitCode: first.result.exitCode,
    ending: first.result.ending,
    observeMs: first.observeMs,
    notes: first.result.exitCode === 0 ? [] : [tail(first.result)],
  });
  if (first.result.exitCode !== 0) {
    await d.record(
      hunks.map((h) => ({
        hunkId: h.hunkId,
        unavailable: "the tool's initial run failed in the mutation workspace",
      })),
    );
    return { firstUnmutatedRunMs, loadedOutside };
  }

  // One process per mutant, exact risk order, `workers` at a time.
  const order = hunks.map((h) => h.hunkId);
  const pending = new Map<string, number>();
  for (const m of mutants) pending.set(m.hunkId, (pending.get(m.hunkId) ?? 0) + 1);
  const byHunk = new Map<string, MutationResult[]>();
  const recorded = new Set<string>();
  const runConfig = path.join(d.copy.auxDir, 'py-mutant-run.json');
  writeFileSync(runConfig, JSON.stringify({ coverage: false, workspaceRoot: d.copyRoot }));
  t0 = performance.now();
  let observeMs = 0;
  let flushing = Promise.resolve();
  const flush = () => {
    const ready = recordablePrefix(order, pending, recorded);
    if (ready.length === 0) return;
    for (const id of ready) recorded.add(id);
    const batch = ready.flatMap((id) => byHunk.get(id) ?? []);
    flushing = flushing.then(() => d.record(batch));
  };
  // Hunks without any mutant site are recordable at once with no result.
  flush();
  await mapLimit(mutants, d.workers, async (m, i) => {
    const argsFile = path.join(d.copy.auxDir, 'py-mutant-tests', `${i}.txt`);
    mkdirSync(path.dirname(argsFile), { recursive: true });
    writeFileSync(argsFile, m.tests.join('\n') + '\n');
    const inject: Injection[] = [
      {
        name: 'PYTHONPATH',
        value: path.join(runtimeDir, 'python'),
        position: 'prepend',
        separator: path.delimiter,
      },
      { name: 'SDDR_RUN', value: runConfig, position: 'prepend', separator: path.delimiter },
      { name: 'SDDR_MUTANT', value: `${m.path}::${m.site}`, position: 'prepend', separator: ':' },
    ];
    const timeout = mutantTimeoutMs(m.tests.map((t) => durations.get(t)));
    const r = await runInCopy(session, d.copy, pytestCmd(argsFile), inject, timeout);
    observeMs += r.observeMs;
    const outcome =
      m.tests.length === 0 ? 'no-coverage' : pytestOutcome(r.result.ending, r.result.exitCode);
    byHunk.set(m.hunkId, [
      ...(byHunk.get(m.hunkId) ?? []),
      { hunkId: m.hunkId, line: m.line, mutation: m.desc, outcome },
    ]);
    pending.set(m.hunkId, (pending.get(m.hunkId) ?? 1) - 1);
    flush();
  });
  flush();
  await flushing;
  const noSite = hunks.filter((h) => !byHunk.has(h.hunkId));
  if (noSite.length > 0)
    await d.record(
      noSite.map((h) => ({ hunkId: h.hunkId, unavailable: 'no mutant on the executed lines' })),
    );
  d.toolRuns.push({
    tool: 'Python engine: mutants',
    tier: 1,
    hunks: hunks.length,
    mutants: mutants.length,
    durationMs: ms(t0),
    exitCode: null,
    ending: 'exited',
    observeMs: Math.round(observeMs),
    notes: [],
  });
  return { firstUnmutatedRunMs, loadedOutside };
}
