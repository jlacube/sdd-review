// Spike C001-T-020 (spike-grade): the bundle loop of W4 (C001-ADR-006 §11, C001-NFR-018 (c)): 10
// commands that each print a fixed text and exit, run one after another in the test run's
// workspace (already prepared and free), each with the reset, the checks, the observation window,
// the shell start and the save of its result as a revision (C001-COMP-014). The time each step adds
// is reported apart. C001-T-065 replaces it.
import { spawnSync } from 'node:child_process';
import type { BundleRun } from '../../../src/generated/analysis-results.js';
import { saveRevision, type SpikeEvidence } from '../documents.js';
import type { EvidenceSession, WorkspaceRun } from '../session.js';

export interface BundleCommandSpec {
  readonly commandId: string;
  /** The command text, run through the platform shell (C001-IF-013 §1 item 1). */
  readonly command: string;
  /** The same program run without a shell, for its own run time. */
  readonly program: string;
  readonly args: readonly string[];
  readonly expected: string;
}

/** The 10 fixed-text commands: Node.js printing a fixed text (identical on every OS). */
export function bundleCommands(count = 10): BundleCommandSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const text = `sddr-bundle-${String(i + 1).padStart(2, '0')}`;
    const script = `process.stdout.write('${text}\\n')`;
    return {
      commandId: `c${String(i + 1).padStart(2, '0')}`,
      command: `node -e "${script}"`,
      program: 'node',
      args: ['-e', script],
      expected: `${text}\n`,
    };
  });
}

export interface BundleCommandRecord {
  readonly commandId: string;
  readonly state: 'during-mutation' | 'after-mutation' | 'no-mutation';
  /** The command alone, without a shell (median of 3 direct runs). */
  readonly ownMs: number;
  /** From the run action to the recorded output (step plus save). */
  readonly totalMs: number;
  /** totalMs − ownMs: the time compared with the 1 s of C001-NFR-018 (c). */
  readonly overheadMs: number;
  readonly resetMs: number;
  /** Watcher start, watcher drain and the check after the run. */
  readonly checksMs: number;
  /** Observer window start and end. */
  readonly observationMs: number;
  /** runInWorkspace minus the command's own run time: shell, job object, stream drain. */
  readonly shellStartMs: number;
  /** Owner-file state switches. */
  readonly stateMs: number;
  readonly saveMs: number;
  readonly revision: number;
  readonly checkClean: boolean;
  readonly checkScope: string;
  readonly exitCode: number | null;
  readonly outputMatches: boolean;
  readonly observedChanges: number;
  readonly observationIncomplete: number;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Own run time of each command: three direct runs in the workspace, median. */
export function ownRunTimes(specs: readonly BundleCommandSpec[], cwd: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of specs) {
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      spawnSync(s.program, s.args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      times.push(performance.now() - t0);
    }
    out.set(s.commandId, r1(median(times)));
  }
  return out;
}

/** Runs the bundle once; each command's result is saved as a new revision. */
export async function runBundle(
  session: EvidenceSession,
  run: WorkspaceRun,
  evidence: SpikeEvidence,
  state: BundleCommandRecord['state'],
  specs: readonly BundleCommandSpec[] = bundleCommands(),
): Promise<BundleCommandRecord[]> {
  const own = ownRunTimes(specs, run.prepared.handle.root);
  const store = session.revisions();
  for (const s of specs) {
    if (!evidence.bundleCommands.some((c) => c.commandId === s.commandId)) {
      evidence.bundleCommands.push({ commandId: s.commandId, command: s.command });
    }
  }
  const records: BundleCommandRecord[] = [];
  for (const s of specs) {
    const t0 = performance.now();
    const startedAt = new Date();
    const step = await session.runStep(run, s.command);
    const stdout = step.command.stdout.bytes.toString('utf8');
    const previous = [...evidence.bundleRuns].reverse().find((r) => r.commandId === s.commandId);
    const bundleRun: BundleRun = {
      runId: `${s.commandId}-${evidence.bundleRuns.length + 1}`,
      commandId: s.commandId,
      exitStatus: step.command.exitCode,
      stdout,
      stderr: step.command.stderr.bytes.toString('utf8'),
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      snapshotMatch: step.check.clean,
      reference: previous ? { runId: previous.runId } : null,
      differences: previous
        ? {
            exitStatusChanged: previous.exitStatus !== step.command.exitCode,
            stdoutDiff: previous.stdout === stdout ? '' : `- ${previous.stdout}\n+ ${stdout}`,
            stderrDiff: '',
          }
        : null,
    };
    evidence.bundleRuns.push(bundleRun);
    const saved = await saveRevision(store, session.snapshotId, session.hunks, evidence);
    const totalMs = r1(performance.now() - t0);
    const ownMs = own.get(s.commandId) ?? 0;
    const t = step.timings;
    records.push({
      commandId: s.commandId,
      state,
      ownMs,
      totalMs,
      overheadMs: r1(totalMs - ownMs),
      resetMs: t.resetMs,
      checksMs: r1(t.watchStartMs + t.watchStopMs + t.checkMs),
      observationMs: r1(t.observeBeginMs + t.observeEndMs),
      shellStartMs: r1(t.commandMs - ownMs),
      stateMs: t.stateMs,
      saveMs: saved.durationMs,
      revision: saved.revision,
      checkClean: step.check.clean,
      checkScope: step.check.scope,
      exitCode: step.command.exitCode,
      outputMatches: stdout.replace(/\r\n/g, '\n') === s.expected,
      observedChanges: step.observation.changed.length,
      observationIncomplete: step.observation.incomplete.length,
    });
  }
  return records;
}
