// Spike C001-T-020: `npm run bench -- spike-evidence ...` (spike-grade, never shipped). Runs one
// workspace measurement protocol (W1 to W4 of C001-ADR-006 §11, W6 of A1.6) on one benchmark change
// with the harness of C001-T-013 (bench/harness: phases, wall-clock, memory) and writes
// bench/results/spike-evidence-<id>-<label>-<time>.json and .md for C001-T-021. See
// spikes/evidence/README.md and RESULTS.md.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { formatDuration } from '../../bench/harness/report.js';
import { BenchRun, hostInfo, type PhaseRecord, type RunReport } from '../../bench/harness/run.js';
import { gitReadEnvironment } from '../../src/core/git/environment.js';
import { runInWorkspace } from '../../src/core/evidence/runner/run-command.js';
import { mutationWorkerCount } from '../../src/core/evidence/runner/priority.js';
import { setState } from '../../src/core/evidence/workspace/lifetime.js';
import { buildW6, W6_DEFAULTS, type W6Options } from '../../bench/fixtures/w6-filtered/build.js';
import { runBundle, type BundleCommandRecord } from './bundle/bundle.js';
import { coverageSummary, type PerTestCoverage, type SpikeEcosystem } from './changed.js';
import { coverageFor, workspaceInjections, type CoverageContext } from './coverage/inject.js';
import { saveRevision, type SpikeEvidence } from './documents.js';
import { CoveredWorkspace, type CoveredPassTimings } from './filtered/covered.js';
import { runMutation, type MutationReport } from './mutation/run.js';
import {
  EvidenceSession,
  type SpikeTarget,
  type StepTimings,
  type WorkspaceRun,
} from './session.js';
import { adapterEcosystem, findTools, loadTargets, type SpikeTools } from './tools.js';

export const SPIKE_EVIDENCE_USAGE = `  spike-evidence <bench-id> <W1|W2|W3|W4> [options]
                               C001-T-020 workspace measurement harness on one benchmark change
                               (spikes/evidence/RESULTS.md); writes bench/results/spike-evidence-*
                               options: --state during|after|both (W4, default both), --workers N
                               (default logical CPUs - 1), --no-wt-baseline (W1), --hunk-limit N
                               (smoke only), --repo <dir> --base <commit> --eco ts|py|cs
                               --test-command "<cmd>" (a manual target instead of a bench id)
  spike-evidence w6 [--state copy|stored] [--resets N]
                               W6 on the fixture of bench/fixtures/w6-filtered (brought to the state
                               first); --base <commit> for a smoke fixture
  spike-evidence build-w6 [--state copy|stored] [--lfs-files N] [--lfs-kib N] [--filtered-files N]
                               build the W6 fixture under <bench root>/fixtures/w6-filtered;
                               --source <checkout> --ref <branch> for a smoke fixture
  spike-evidence --dry-run     check targets, tools and the plan without running anything`;

export type Label = 'W1' | 'W2' | 'W3' | 'W4' | 'W6';

export interface SpikeEvidenceArgs {
  readonly mode: 'measure' | 'w6' | 'build-w6' | 'dry-run';
  readonly target: string | null;
  readonly label: Label | null;
  readonly state: string | null;
  readonly workers: number | null;
  readonly hunkLimit: number | null;
  readonly wtBaseline: boolean;
  readonly resets: number;
  readonly manual: {
    repo: string;
    base: string;
    eco: 'ts' | 'py' | 'cs';
    testCommand: string;
  } | null;
  readonly w6: Partial<Pick<W6Options, 'lfsFiles' | 'lfsSizeKiB' | 'filteredFiles'>> & {
    /** Smoke runs: another source checkout (relative to the bench root) and branch. */
    source?: { checkout: string; ref: string };
    /** Smoke runs: the base commit of the fixture's change (default: bench-ts's base). */
    base?: string;
  };
}

/** Parses the arguments after `spike-evidence`. Throws with a message on a usage error. */
export function parseSpikeEvidenceArgs(argv: readonly string[]): SpikeEvidenceArgs {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (['dry-run', 'no-wt-baseline'].includes(name)) flags.set(name, true);
      else {
        const v = argv[i + 1];
        if (v === undefined) throw new Error(`--${name} needs a value`);
        flags.set(name, v);
        i++;
      }
    } else positional.push(a);
  }
  const num = (name: string): number | null => {
    const v = flags.get(name);
    if (v === undefined) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`);
    return n;
  };
  const str = (name: string) => {
    const v = flags.get(name);
    return typeof v === 'string' ? v : null;
  };
  const base = {
    state: str('state'),
    workers: num('workers'),
    hunkLimit: num('hunk-limit'),
    wtBaseline: !flags.has('no-wt-baseline'),
    resets: num('resets') ?? 3,
    w6: {
      ...(num('lfs-files') ? { lfsFiles: num('lfs-files')! } : {}),
      ...(num('lfs-kib') ? { lfsSizeKiB: num('lfs-kib')! } : {}),
      ...(num('filtered-files') ? { filteredFiles: num('filtered-files')! } : {}),
      ...(str('source') && str('ref')
        ? { source: { checkout: str('source')!, ref: str('ref')! } }
        : {}),
      ...(str('base') ? { base: str('base')! } : {}),
    },
  };
  if (flags.has('dry-run'))
    return { ...base, mode: 'dry-run', target: null, label: null, manual: null };
  const [first, second] = positional;
  if (first === 'build-w6' || first === 'w6') {
    const state = base.state ?? 'copy';
    if (state !== 'copy' && state !== 'stored') throw new Error('--state must be copy or stored');
    return {
      ...base,
      state,
      mode: first,
      target: 'w6-filtered',
      label: first === 'w6' ? 'W6' : null,
      manual: null,
    };
  }
  const manualRepo = str('repo');
  if (manualRepo) {
    const label = (first ?? '').toUpperCase();
    if (!['W1', 'W2', 'W3', 'W4'].includes(label))
      throw new Error('with --repo, give the label first: W1|W2|W3|W4');
    const eco = str('eco');
    if (eco !== 'ts' && eco !== 'py' && eco !== 'cs') throw new Error('--eco must be ts, py or cs');
    const baseCommit = str('base');
    const testCommand = str('test-command');
    if (!baseCommit || !testCommand) throw new Error('--repo needs --base and --test-command');
    return {
      ...base,
      mode: 'measure',
      target: `manual-${eco}`,
      label: label as Label,
      manual: { repo: path.resolve(manualRepo), base: baseCommit, eco, testCommand },
    };
  }
  if (!first || !second) throw new Error('give a bench id and a label');
  const label = second.toUpperCase();
  if (!['W1', 'W2', 'W3', 'W4'].includes(label)) throw new Error(`unknown label ${second}`);
  if (label === 'W4' && base.state && !['during', 'after', 'both'].includes(base.state)) {
    throw new Error('--state must be during, after or both');
  }
  return { ...base, mode: 'measure', target: first, label: label as Label, manual: null };
}

// ---------------------------------------------------------------------------------------------
// Report

export interface SpikeEvidenceReport {
  schema: 'sdd-review-spike-evidence/1';
  label: Label;
  target: string;
  startedAt: string;
  host: RunReport['host'];
  /** False for smoke runs (manual target, hunk limit): not a measurement for C001-T-021. */
  validForMeasurement: boolean;
  options: Record<string, unknown>;
  tools: SpikeTools;
  session: Record<string, unknown>;
  phases: PhaseRecord[];
  wallClockMs: number;
  peakResidentBytes: number;
  result: Record<string, unknown>;
  notes: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function spikeReportMarkdown(r: SpikeEvidenceReport): string {
  const lines = [
    `# Spike evidence run: ${r.label} on ${r.target}`,
    '',
    r.validForMeasurement
      ? '- Valid for C001-T-021: yes (full benchmark change, no limit)'
      : '- **Smoke run: NOT a measurement for C001-T-021** (manual target or limited hunks)',
    `- Started: ${r.startedAt}`,
    `- Host: ${r.host.os} ${r.host.release}, ${r.host.cpu}, ${r.host.logicalCpus} logical CPUs, Node ${r.host.node}`,
    `- Wall-clock of the whole protocol: ${formatDuration(r.wallClockMs)}`,
    `- Options: \`${JSON.stringify(r.options)}\``,
    '',
    '## Result',
    '',
    '```json',
    JSON.stringify(r.result, null, 2).slice(0, 20000),
    '```',
    '',
    '## Phases (harness)',
    '',
    '| Phase | Start (ms) | Duration (ms) |',
    '|---|---:|---:|',
    ...r.phases.map((p) => `| ${p.name} | ${p.startMs} | ${p.durationMs} |`),
    '',
    '## Notes',
    '',
    ...(r.notes.length > 0 ? r.notes.map((n) => `- ${n}`) : ['- none']),
    '',
  ];
  return lines.join('\n');
}

export function writeSpikeEvidenceReport(
  r: SpikeEvidenceReport,
  outDir: string,
): { jsonPath: string; mdPath: string } {
  mkdirSync(outDir, { recursive: true });
  const stamp = r.startedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const base = `spike-evidence-${r.target}-${r.label}-${stamp}`.replace(/[^A-Za-z0-9._-]+/g, '_');
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify(r, null, 2) + '\n', 'utf8');
  writeFileSync(mdPath, spikeReportMarkdown(r), 'utf8');
  return { jsonPath, mdPath };
}

// ---------------------------------------------------------------------------------------------
// Protocol steps

interface Ctx {
  readonly session: EvidenceSession;
  readonly tools: SpikeTools;
  readonly runtimeDir: string;
  readonly ecosystem: SpikeEcosystem;
  readonly notes: string[];
}

async function coverageContext(ctx: Ctx, run: WorkspaceRun): Promise<CoverageContext> {
  return {
    ecosystem: ctx.ecosystem,
    workspaceRoot: await realpath(run.prepared.handle.root),
    auxDir: run.prepared.handle.auxDir,
    runtimeDir: ctx.runtimeDir,
    changedPaths: [...ctx.session.addedLines().keys()],
    snapshotPaths: ctx.session.snapshotPaths(),
    outsideRoots: [ctx.session.location.workTreeRoot],
    pythonVendor: ctx.tools.pythonVendor,
    altcover: ctx.tools.altcover,
  };
}

/** The project's test command alone in a newly prepared workspace (baseline of (a)). */
async function baselineRun(ctx: Ctx): Promise<Record<string, unknown>> {
  const { run, durationMs: preparationMs } = await ctx.session.prepare();
  const handle = run.prepared.handle;
  await setState(handle, 'in-run');
  const t0 = performance.now();
  const result = await runInWorkspace({
    command: ctx.session.target.testCommand,
    workspace: handle,
    repository: ctx.session.location,
    env: ctx.session.env,
    inject: workspaceInjections(ctx.ecosystem, handle.auxDir),
    log: ctx.session.log,
  });
  const commandMs = r1(performance.now() - t0);
  await setState(handle, 'free');
  await ctx.session.registry.release(handle);
  return { preparationMs, commandMs, exitCode: result.exitCode, ending: result.ending };
}

export interface MeasuredRun {
  run: WorkspaceRun;
  preparationMs: number;
  step: StepTimings;
  readMs: number;
  saveMs: number;
  /** Step total plus reading the adapters' results plus the revision save. */
  totalMs: number;
  exitCode: number | null;
  checkClean: boolean;
  checkScope: string;
  differences: number;
  observedChanges: number;
  observationIncomplete: number;
  coverage: PerTestCoverage;
  evidence: SpikeEvidence;
}

/** The analysis core's test run with per-test coverage in a newly prepared workspace. */
async function measuredRun(ctx: Ctx): Promise<MeasuredRun> {
  const { run, durationMs: preparationMs } = await ctx.session.prepare();
  const cctx = await coverageContext(ctx, run);
  const setup = coverageFor(cctx);
  const step = await ctx.session.runStep(run, ctx.session.target.testCommand, {
    inject: setup.inject,
  });
  let t0 = performance.now();
  const coverage = setup.read();
  const readMs = r1(performance.now() - t0);
  for (const n of coverage.notes) ctx.notes.push(`coverage: ${n}`);
  if (step.command.exitCode !== 0) {
    ctx.notes.push(
      `test command exit ${step.command.exitCode}: ${step.command.stderr.bytes.toString('utf8').slice(-800)}`,
    );
  }
  const evidence: SpikeEvidence = {
    testCommand: ctx.session.target.testCommand,
    coverage,
    mutationResults: [],
    bundleRuns: [],
    bundleCommands: [],
  };
  t0 = performance.now();
  const saved = await saveRevision(
    ctx.session.revisions(),
    ctx.session.snapshotId,
    ctx.session.hunks,
    evidence,
  );
  const saveMs = r1(performance.now() - t0);
  return {
    run,
    preparationMs,
    step: step.timings,
    readMs,
    saveMs: saved.durationMs || saveMs,
    totalMs: r1(step.timings.totalMs + readMs + saveMs),
    exitCode: step.command.exitCode,
    checkClean: step.check.clean,
    checkScope: step.check.scope,
    differences: step.check.differences.length,
    observedChanges: step.observation.changed.length,
    observationIncomplete: step.observation.incomplete.length,
    coverage,
    evidence,
  };
}

function measuredSummary(ctx: Ctx, m: MeasuredRun): Record<string, unknown> {
  return {
    preparationMs: m.preparationMs,
    step: m.step,
    readMs: m.readMs,
    saveMs: m.saveMs,
    totalMs: m.totalMs,
    exitCode: m.exitCode,
    checkClean: m.checkClean,
    checkScope: m.checkScope,
    differences: m.differences,
    observedChanges: m.observedChanges,
    observationIncomplete: m.observationIncomplete,
    coverage: coverageSummary(ctx.session.addedLines(), m.coverage),
  };
}

/** The test command run twice in the developer's working tree; the second (warm) run is timed. */
function workingTreeBaseline(
  target: SpikeTarget,
  env: NodeJS.ProcessEnv,
): { firstMs: number; warmMs: number } {
  const once = () => {
    const t0 = performance.now();
    try {
      execSync(target.testCommand, { cwd: target.checkout, env, stdio: 'ignore' });
    } catch {
      /* a failing test command is still timed */
    }
    return r1(performance.now() - t0);
  };
  const firstMs = once();
  return { firstMs, warmMs: once() };
}

function mutationSummary(m: MutationReport): Record<string, unknown> {
  return Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'results'));
}

const maxOf = (xs: number[]) => (xs.length > 0 ? Math.max(...xs) : null);

function bundleSummary(records: readonly BundleCommandRecord[]): Record<string, unknown> {
  const states = [...new Set(records.map((r) => r.state))];
  return Object.fromEntries(
    states.map((s) => {
      const rs = records.filter((r) => r.state === s);
      return [
        s,
        {
          commands: rs.length,
          maxOverheadMs: maxOf(rs.map((r) => r.overheadMs)),
          maxSplitMs: {
            reset: maxOf(rs.map((r) => r.resetMs)),
            checks: maxOf(rs.map((r) => r.checksMs)),
            observation: maxOf(rs.map((r) => r.observationMs)),
            shellStart: maxOf(rs.map((r) => r.shellStartMs)),
            save: maxOf(rs.map((r) => r.saveMs)),
            state: maxOf(rs.map((r) => r.stateMs)),
          },
          allChecksClean: rs.every((r) => r.checkClean),
          allOutputsMatch: rs.every((r) => r.outputMatches),
          records: rs,
        },
      ];
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Main entry

function targetOf(args: SpikeEvidenceArgs, repoRoot: string, benchRoot: string): SpikeTarget {
  if (args.manual) {
    const eco =
      args.manual.eco === 'ts' ? 'typescript' : args.manual.eco === 'py' ? 'python' : 'csharp';
    return {
      id: args.target!,
      ecosystem: eco,
      checkout: args.manual.repo,
      base: args.manual.base,
      head: null,
      testCommand: args.manual.testCommand,
      envSet: {},
      envUnset: [],
      pathPrepend: null,
    };
  }
  const targets = loadTargets(repoRoot, benchRoot);
  if (args.mode === 'w6') {
    const ts = targets.find((t) => t.id === 'bench-ts')!;
    return {
      ...ts,
      id: 'w6-filtered',
      ecosystem: 'fixture',
      checkout: path.join(benchRoot, 'fixtures', 'w6-filtered'),
      base: args.w6.base ?? ts.base,
      head: null,
      covered: true,
    };
  }
  const t = targets.find((x) => x.id === args.target);
  if (!t)
    throw new Error(
      `unknown bench id ${args.target} (known: ${targets.map((x) => x.id).join(', ')})`,
    );
  return t;
}

/** Runs one protocol and writes its report; returns the report and its paths. */
export async function runSpikeEvidence(
  args: SpikeEvidenceArgs,
  repoRoot: string,
  benchRoot: string,
): Promise<{ report: SpikeEvidenceReport; jsonPath: string; mdPath: string }> {
  const target = targetOf(args, repoRoot, benchRoot);
  const tools = findTools(benchRoot);
  const notes: string[] = [];
  const bench = new BenchRun({ name: `spike-evidence-${target.id}-${args.label}` });
  await bench.start();
  const startedAt = new Date().toISOString();
  let session: EvidenceSession | null = null;
  let result: Record<string, unknown> | undefined;
  let sessionInfo: Record<string, unknown> | undefined;
  if (args.mode === 'w6') {
    const fixture = runBuildW6(args, benchRoot);
    notes.push(`W6 fixture ${fixture.dir} at ${fixture.head}, state ${fixture.state}`);
  }
  try {
    session = await bench.phase('intake-and-observer-start', () => EvidenceSession.open(target));
    if (session.observerNote) notes.push(session.observerNote);
    sessionInfo = {
      snapshotId: session.snapshotId,
      timing: session.timing,
      changedFiles: session.intake.snapshot.changedFiles.length,
      changedLines: session.intake.snapshot.changedLines,
      hunks: session.hunks.length,
      snapshotPaths: session.snapshotPaths().length,
      evidenceRoot: session.evidenceRoot,
    };
    const runtimeDir = session.installRuntime();
    const ctx: Ctx = {
      session,
      tools,
      runtimeDir,
      ecosystem:
        target.ecosystem === 'fixture' ? 'typescript-javascript' : adapterEcosystem(target),
      notes,
    };
    const workers = args.workers ?? mutationWorkerCount();
    switch (args.label) {
      case 'W1': {
        const measured = await bench.phase('first-test-run', () => measuredRun(ctx));
        const firstResultsMs = r1(measured.preparationMs + measured.totalMs);
        const wt = args.wtBaseline
          ? await bench.phase('working-tree-baseline', () =>
              workingTreeBaseline(target, session!.env),
            )
          : null;
        result = {
          preparationMs: measured.preparationMs,
          firstResultsMs,
          workingTreeBaseline: wt,
          ratioToWarmWorkingTree: wt
            ? Math.round((firstResultsMs / wt.warmMs) * 1000) / 1000
            : null,
          firstTestRun: measuredSummary(ctx, measured),
        };
        break;
      }
      case 'W2': {
        const baseline = await bench.phase('baseline-run', () => baselineRun(ctx));
        const measured = await bench.phase('measured-run', () => measuredRun(ctx));
        result = {
          baseline,
          measured: measuredSummary(ctx, measured),
          ratioA: Math.round((measured.totalMs / (baseline.commandMs as number)) * 1000) / 1000,
        };
        break;
      }
      case 'W3': {
        const measured = await bench.phase('test-run', () => measuredRun(ctx));
        const mutation = await bench.phase('mutation', () =>
          runMutation({
            session: session!,
            testRun: measured.run,
            coverage: measured.coverage,
            ecosystem: ctx.ecosystem,
            tools,
            runtimeDir,
            workers,
            hunkLimit: args.hunkLimit ?? undefined,
            record: async (results) => {
              measured.evidence.mutationResults = [...results];
              return (
                await saveRevision(
                  session!.revisions(),
                  session!.snapshotId,
                  session!.hunks,
                  measured.evidence,
                )
              ).durationMs;
            },
          }),
        );
        result = {
          testRun: measuredSummary(ctx, measured),
          mutation: mutationSummary(mutation),
          bMinutes: Math.round(mutation.totalMs / 600) / 100,
        };
        break;
      }
      case 'W4': {
        const state = args.state ?? 'both';
        const measured = await bench.phase('test-run', () => measuredRun(ctx));
        const records: BundleCommandRecord[] = [];
        let mutation: MutationReport | null = null;
        if (state === 'after' && !args.hunkLimit) {
          notes.push(
            'state "after" without a mutation run: mutation testing never ran in this process',
          );
        }
        if (state === 'during' || state === 'both') {
          let copied!: () => void;
          const copyDone = new Promise<void>((r) => (copied = r));
          const mutationRun = runMutation({
            session,
            testRun: measured.run,
            coverage: measured.coverage,
            ecosystem: ctx.ecosystem,
            tools,
            runtimeDir,
            workers,
            hunkLimit: args.hunkLimit ?? undefined,
            onCopied: () => copied(),
            record: async (results) => {
              measured.evidence.mutationResults = [...results];
              return (
                await saveRevision(
                  session!.revisions(),
                  session!.snapshotId,
                  session!.hunks,
                  measured.evidence,
                )
              ).durationMs;
            },
          });
          await copyDone;
          records.push(
            ...(await bench.phase('bundle-during-mutation', () =>
              runBundle(session!, measured.run, measured.evidence, 'during-mutation'),
            )),
          );
          mutation = await bench.phase('mutation-rest', () => mutationRun);
          const ended = mutation.totalMs;
          if (records.length > 0 && ended < 1)
            notes.push('mutation ended before the bundle finished');
        }
        if (state === 'after' || state === 'both') {
          records.push(
            ...(await bench.phase('bundle-after-mutation', () =>
              runBundle(
                session!,
                measured.run,
                measured.evidence,
                mutation ? 'after-mutation' : 'no-mutation',
              ),
            )),
          );
        }
        result = {
          testRun: measuredSummary(ctx, measured),
          bundle: bundleSummary(records),
          mutation: mutation ? mutationSummary(mutation) : null,
        };
        break;
      }
      case 'W6': {
        const s = session;
        if (s.covered.length === 0)
          throw new Error('the W6 fixture has no covered file: build it with build-w6');
        const prep = await bench.phase('prepare', () => s.prepare());
        const head = await s.git.resolveCommit('HEAD');
        const ws = new CoveredWorkspace(
          s.git,
          s.location.workTreeRoot,
          await realpath(prep.run.prepared.handle.root),
          s.covered,
          async (f) => (await s.git.readBlob(head, f.path))!,
        );
        const fill = await bench.phase('covered-fill', () => ws.pass(false));
        const resets: CoveredPassTimings[] = [];
        for (let i = 0; i < args.resets; i++)
          resets.push(await bench.phase(`covered-reset-${i + 1}`, () => ws.pass(true)));
        // A production touched-path step around an empty command, to set the covered reset
        // against the reset and check of (a) and (c).
        const step = await bench.phase('step-reference', () => s.runStep(prep.run, 'node -e "0"'));
        result = {
          fixtureState: args.state,
          coveredFiles: s.covered.length,
          byDriver: Object.fromEntries(
            [...new Set(s.covered.map((c) => c.driver))].map((d) => [
              d,
              s.covered.filter((c) => c.driver === d).length,
            ]),
          ),
          preparationMs: prep.durationMs,
          coveredFill: fill,
          coveredResets: resets,
          contents: [...ws.records.values()].reduce<Record<string, number>>((acc, r) => {
            acc[`${r.driver}:${r.content}`] = (acc[`${r.driver}:${r.content}`] ?? 0) + 1;
            return acc;
          }, {}),
          storedCauses: [...new Set([...ws.records.values()].map((r) => r.cause).filter(Boolean))],
          referenceStep: step.timings,
        };
        break;
      }
      default:
        throw new Error('no label');
    }
  } finally {
    if (session) await session.close();
  }
  const run = await bench.finish();
  const report: SpikeEvidenceReport = {
    schema: 'sdd-review-spike-evidence/1',
    label: args.label!,
    target: target.id,
    startedAt,
    host: hostInfo(),
    validForMeasurement: !args.manual && !args.hunkLimit && !args.w6.source && !args.w6.base,
    options: {
      state: args.state,
      workers: args.workers ?? mutationWorkerCount(),
      hunkLimit: args.hunkLimit,
      wtBaseline: args.wtBaseline,
      resets: args.label === 'W6' ? args.resets : undefined,
      testCommand: target.testCommand,
    },
    tools,
    session: sessionInfo ?? {},
    phases: run.phases,
    wallClockMs: run.wallClockMs,
    peakResidentBytes: run.memory.peakResidentBytes,
    result: result ?? {},
    notes,
  };
  const out = writeSpikeEvidenceReport(report, path.join(repoRoot, 'bench', 'results'));
  return { report, ...out };
}

/** `build-w6`: builds the fixture. */
export function runBuildW6(args: SpikeEvidenceArgs, benchRoot: string) {
  return buildW6({
    benchRoot,
    source: args.w6.source ?? W6_DEFAULTS.source,
    lfsFiles: args.w6.lfsFiles ?? W6_DEFAULTS.lfsFiles,
    lfsSizeKiB: args.w6.lfsSizeKiB ?? W6_DEFAULTS.lfsSizeKiB,
    filteredFiles: args.w6.filteredFiles ?? W6_DEFAULTS.filteredFiles,
    filteredSizeKiB: W6_DEFAULTS.filteredSizeKiB,
    state: (args.state as 'copy' | 'stored') ?? 'copy',
  });
}

/** `--dry-run`: what would run, and whether targets and tools are in place. Runs nothing. */
export function dryRun(repoRoot: string, benchRoot: string): { lines: string[]; problems: number } {
  const lines: string[] = [];
  let problems = 0;
  const tools = findTools(benchRoot);
  lines.push(`bench root: ${benchRoot}`);
  for (const [name, value] of Object.entries(tools)) {
    lines.push(`tool ${name}: ${value ?? 'MISSING'}`);
  }
  const env = gitReadEnvironment(process.env);
  for (const t of loadTargets(repoRoot, benchRoot)) {
    const present = existsSync(path.join(t.checkout, '.git'));
    let head = '';
    if (present) {
      try {
        head = execFileSync('git', ['-C', t.checkout, 'rev-parse', 'HEAD'], {
          env,
          encoding: 'utf8',
        }).trim();
      } catch {
        head = '';
      }
    }
    const atHead = head !== '' && head === t.head;
    const venvOk = t.pathPrepend === null || existsSync(t.pathPrepend);
    if (!present || !atHead || !venvOk) problems++;
    lines.push(
      `${t.id}: checkout ${present ? t.checkout : 'MISSING'}; head ${atHead ? 'ok' : `${head || '?'} (expected ${t.head})`}` +
        `${t.pathPrepend ? `; venv ${venvOk ? 'ok' : 'MISSING'}` : ''}; test command: ${t.testCommand}`,
    );
    for (const label of ['W1', 'W2', 'W3', 'W4']) {
      lines.push(`  would run: npm run bench -- spike-evidence ${t.id} ${label}`);
    }
  }
  const w6 = path.join(benchRoot, 'fixtures', 'w6-filtered');
  lines.push(
    `w6 fixture: ${existsSync(path.join(w6, '.git')) ? w6 : 'not built (npm run bench -- spike-evidence build-w6)'}`,
  );
  lines.push('  would run: npm run bench -- spike-evidence w6 --state copy; ... w6 --state stored');
  return { lines, problems };
}
