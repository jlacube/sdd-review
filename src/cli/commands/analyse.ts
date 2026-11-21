import { resolve } from 'node:path';
import type { CoreApi, StartReviewOptions } from '../../core/api/index.js';
import { ReviewError } from '../../core/api/index.js';
import { noticeLine } from '../exit-codes.js';
import { intakeSummaryText } from '../format.js';
import type { CliIo } from '../io.js';
import type { Command, GlobalOptions, IntakeOptions } from '../parser.js';

type AnalyseCommand = Extract<Command, { name: 'analyse' }>;

/**
 * The named files of the intake options, by role (C001-IF-003 §3 `startReview`, C001-REQ-112),
 * each path resolved against the current directory of the command.
 */
function namedFilesOf(
  intake: IntakeOptions,
  cwd: string,
): NonNullable<StartReviewOptions['namedFiles']> {
  return [
    ...(intake.prText !== undefined
      ? [{ role: 'pull-request-text' as const, path: intake.prText }]
      : []),
    ...intake.plans.map((path) => ({ role: 'agent-plan' as const, path })),
    ...intake.transcripts.map((path) => ({ role: 'agent-transcript' as const, path })),
  ].map((file) => ({ ...file, path: resolve(cwd, file.path) }));
}

/** The core's intake options from the command's (shared by `review` and `analyse`). */
export function startOptionsOf(intake: IntakeOptions, cwd: string): StartReviewOptions {
  return {
    ...(intake.base !== undefined ? { namedBase: intake.base } : {}),
    ...(intake.sddChange !== undefined ? { sddChange: intake.sddChange } : {}),
    namedFiles: namedFilesOf(intake, cwd),
    ...(intake.testCommand !== undefined ? { testCommand: intake.testCommand } : {}),
  };
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** Starts the jobs of the snapshot and waits until none is pending or running. */
export async function runJobsToEnd(
  api: CoreApi,
  snapshotId: string,
  check: () => void,
): Promise<void> {
  await api.startJobs(snapshotId);
  const running = async () =>
    (await api.listJobs(snapshotId)).some((j) => ['pending', 'running'].includes(j.status));
  while (await running()) {
    check();
    await sleep(50);
  }
  check();
}

/** The interrupt (Ctrl+C) before the results are written: nothing is written (ERR-CLI-002). */
function interrupted(directory: string): ReviewError {
  return new ReviewError('ERR-CLI-002', {
    operation: 'analyse',
    inputs: { directory },
    params: { directory, cause: 'interrupted' },
    cause: 'interrupted',
  });
}

/**
 * `analyse --headless` (C001-IF-001, C001-REQ-912, C001-REQ-914): intake, the analysis available
 * so far, then the files of the headless output. Starts no server. Returns the exit code.
 */
export async function analyse(
  command: AnalyseCommand,
  global: GlobalOptions,
  api: CoreApi,
  io: CliIo,
  exitOk: number,
): Promise<number> {
  const check = () => {
    if (io.signal.aborted) throw interrupted(command.out);
  };
  io.stderr.write('analyse: taking in the change\n');
  const started = await api.startReview(startOptionsOf(command.intake, io.cwd));
  for (const notice of started.notices) io.stderr.write(`${noticeLine(notice)}\n`);
  check();

  // The static analysis (C001-T-036 and later) and the test run, mutation testing and model tasks
  // register with the job scheduler; until they exist there is nothing to run or to wait for.
  io.stderr.write('analyse: running the analysis\n');
  await runJobsToEnd(api, started.snapshotId, check);

  io.stderr.write(`analyse: writing the results to ${command.out}\n`);
  await api.exportResults(started.snapshotId, command.out);

  if (global.format === 'json') {
    io.stdout.write(`${JSON.stringify(started.intakeSummary, null, 2)}\n`);
  } else {
    io.stdout.write(intakeSummaryText(started.intakeSummary, command.intake.base));
    io.stdout.write(`Snapshot: ${started.snapshotId}\nResults written to ${command.out}\n`);
  }
  return exitOk;
}
