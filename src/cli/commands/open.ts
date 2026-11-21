import { mostRecentlyOpened, ReviewError, type CoreApi } from '../../core/api/index.js';
import { noticeLine } from '../exit-codes.js';
import { intakeSummaryText } from '../format.js';
import type { CliIo } from '../io.js';
import type { Command, GlobalOptions } from '../parser.js';
import { serveReview, type ReviewDeps } from './review.js';

type OpenCommand = Extract<Command, { name: 'open' }>;

/** The snapshot ID given, or that of the review opened most recently (C001-IF-001 `open`). */
async function snapshotOf(command: OpenCommand, api: CoreApi): Promise<string> {
  if (command.snapshotId !== undefined) return command.snapshotId;
  const recent = mostRecentlyOpened(await api.listReviews());
  if (recent) return recent.snapshotId;
  // No review to default to: the unknown-review refusal, naming what was asked for.
  throw new ReviewError('ERR-STORE-004', {
    operation: 'open',
    inputs: { snapshotId: null },
    params: { value: '(most recent)' },
  });
}

/**
 * `open` (C001-IF-001, C001-REQ-119): reopens an existing review without intake and serves it
 * like `review` does. Unknown snapshot: ERR-STORE-004, exit 5. The review shows the results
 * recorded for the snapshot; nothing is analysed again. Re-applying record entries after an
 * unexpected end (C001-REQ-918) is C001-T-080. Resuming runs the moved-on check: when the working
 * tree or HEAD no longer matches the snapshot, the notice ERR-INTAKE-007 is printed on standard
 * error before the review is served (C001-REQ-117, C001-IF-001 `open`).
 */
export async function open(
  command: OpenCommand,
  global: GlobalOptions,
  api: CoreApi,
  io: CliIo,
  exitOk: number,
  deps: ReviewDeps = {},
): Promise<number> {
  const snapshotId = await snapshotOf(command, api);
  io.stderr.write(`open: reopening the review of ${snapshotId}\n`);
  const session = await api.openReview(snapshotId); // ERR-STORE-004
  if (session.movedOn)
    io.stderr.write(`${noticeLine(session.movedOn.notice)}
`);
  const intakeSummary = await api.getIntakeSummary(snapshotId);
  const listed = (await api.listReviews()).find((r) => r.snapshotId === snapshotId);
  if (io.signal.aborted) return exitOk;
  await serveReview(
    {
      snapshotId,
      port: command.port,
      noBrowser: command.noBrowser,
      json: { snapshotId, intakeSummary, movedOn: session.movedOn },
      text: intakeSummaryText(intakeSummary, intakeSummary.baseCommit.hash, listed?.headCommit),
      label: 'open',
    },
    global,
    api,
    io,
    deps,
  );
  return exitOk;
}
