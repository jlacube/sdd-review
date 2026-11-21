import type { IntakeSummary } from '../generated/analysis-results.js';

/** A full ref name as git shortens it: `refs/heads/main` → `main`, `refs/remotes/origin/main` → `origin/main`. */
export function shortRef(ref: string): string {
  for (const prefix of ['refs/heads/', 'refs/remotes/', 'refs/tags/']) {
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  }
  return ref;
}

/** How the base commit was chosen, one of the cases of C001-IF-012 §4 (C001-IF-001 Output). */
function chosenText(summary: IntakeSummary, namedValue: string | undefined): string {
  const ref = summary.baseRef ? shortRef(summary.baseRef) : '';
  switch (summary.baseChoice) {
    case 'named':
      return `named ${namedValue ?? summary.baseCommit.hash}`;
    case 'upstream-merge-base':
      return `merge base with upstream ${ref}`;
    case 'default-branch-merge-base':
      return `merge base with default branch ${ref}`;
    case 'head':
      return 'HEAD (no upstream branch, no default branch of the remote, no local main or master with a merge base)';
  }
}

/** The intake summary as text (C001-IF-001 Output); the lines grow with the intake tasks. */
export function intakeSummaryText(summary: IntakeSummary, namedValue: string | undefined): string {
  const lines = [
    `Base commit: ${summary.baseCommit.hash} ${summary.baseCommit.subject}`.trimEnd(),
    `Chosen: ${chosenText(summary, namedValue)}`,
  ];
  // The warning whenever the base commit is HEAD itself (C001-REQ-114). The `head` case always is;
  // the other cases that land on HEAD need the HEAD commit, which C001-T-033 brings to the summary.
  if (summary.baseChoice === 'head') {
    lines.push('only uncommitted edits are reviewed, name another base with --base');
  }
  lines.push(
    `Changed files: ${summary.changedFiles}; changed lines: ${summary.changedLines}`,
    `Intent context: ${summary.intentContext.sddChanges.length} SDD changes, ${summary.intentContext.commits} commits, ${summary.intentContext.namedFiles.length} named files, documented architecture: ${summary.intentContext.documentedArchitecture}`,
    `Test command: ${summary.testCommand ? `${summary.testCommand.command} (${summary.testCommand.origin})` : 'none'}`,
  );
  if (summary.sizeWarning)
    lines.push(`${summary.sizeWarning.code}: ${summary.sizeWarning.message}`);
  return `${lines.join('\n')}\n`;
}
