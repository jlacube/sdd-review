import type { CoreApi, ReviewListing } from '../../core/api/index.js';
import type { CliIo } from '../io.js';
import type { GlobalOptions } from '../parser.js';

/** One review as text: its snapshot ID, then its commits, times, decision status and record. */
function reviewText(review: ReviewListing): string {
  return [
    `Snapshot: ${review.snapshotId}`,
    `  Base commit: ${review.baseCommit}`,
    `  HEAD commit: ${review.headCommit}`,
    `  Created: ${review.createdAt}`,
    `  Last opened: ${review.lastOpenedAt}`,
    // The decision status is computed with the verdicts (C001-REQ-711, C001-T-078).
    `  Decision status: ${review.decisionStatus ?? 'not computed yet'}`,
    `  Review record: ${review.recordFile}`,
  ].join('\n');
}

/**
 * `reviews` (C001-IF-001, C001-REQ-118, C001-REQ-714): every review of the repository, earlier
 * snapshots included, in the order they were created, each with the path of its review record
 * file. Read-only; with `--format json`, one JSON array.
 */
export async function reviews(
  global: GlobalOptions,
  api: CoreApi,
  io: CliIo,
  exitOk: number,
): Promise<number> {
  const list = await api.listReviews();
  if (global.format === 'json') {
    io.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
  } else if (list.length === 0) {
    io.stdout.write('No reviews in this repository.\n');
  } else {
    io.stdout.write(`${list.map(reviewText).join('\n\n')}\n`);
  }
  return exitOk;
}
