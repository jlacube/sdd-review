import type { ChangeCommit } from '../../generated/analysis-results.js';
import type { GitAccessPort } from '../git/port.js';

/**
 * The commits of the change (C001-REQ-109, C001-IF-007 §11, domain model §2.5): every commit
 * between the base commit and HEAD, read through the git access port (C001-IF-012 G-06), oldest
 * first, merge commits included. The subject line is the first line of the message. When the base
 * commit is HEAD there is no commit to read and the list is empty (C001-TS-119).
 *
 * The range starts at the base commit itself, so a root base commit needs no parent (defect D-016
 * concerns reading the subject of one commit, not this range).
 */
export async function readChangeCommits(
  git: GitAccessPort,
  base: string,
  head: string,
): Promise<ChangeCommit[]> {
  if (base === head) return [];
  const commits = await git.commitsBetween(base, head);
  return commits.map((c) => ({
    hash: c.hash,
    parents: [...c.parents],
    authorName: c.authorName,
    authorEmail: c.authorEmail,
    authorTime: c.authorTime,
    subject: (c.message.split('\n', 1)[0] ?? '').replace(/\r$/, ''),
    message: c.message,
    changedFiles: [...c.changedFiles],
  }));
}
