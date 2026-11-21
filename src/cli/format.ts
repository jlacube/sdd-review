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

const ROLE_TEXT: Readonly<Record<string, string>> = {
  'pull-request-text': 'pull-request text',
  'agent-plan': 'agent plan',
  'agent-transcript': 'agent transcript',
};

/** The intent context found (C001-IF-001 Output): SDD changes with spec items, commits, named files. */
function intentContextText(context: IntakeSummary['intentContext']): string {
  const changes =
    context.sddChanges.length === 0
      ? 'no open SDD change'
      : context.sddChanges
          .map(
            (c) =>
              `SDD change ${c.id} (${c.specItems} spec items${context.sddChanges.length > 1 && c.selected ? ', selected' : ''})`,
          )
          .join(', ');
  const named =
    context.namedFiles.length === 0
      ? 'no named file'
      : context.namedFiles.map((f) => `${ROLE_TEXT[f.role] ?? f.role} ${f.path}`).join(', ');
  const architecture =
    context.documentedArchitecture === 'none'
      ? 'no documented architecture'
      : `documented architecture: ${context.documentedArchitecture}`;
  return `${changes}; ${context.commits} commits; ${named}; ${architecture}`;
}

/** The test command that will run on the snapshot and where it comes from (C001-REQ-114). */
function testCommandText(summary: IntakeSummary): string {
  const test = summary.testCommand;
  if (!test) return 'none';
  return test.origin === 'developer'
    ? `${test.command} (given with --test-command)`
    : `${test.command} (from the review configuration of base commit ${summary.baseCommit.hash})`;
}

/** The warning line whenever the base commit is HEAD itself (C001-REQ-114, C001-IF-001 Output). */
export const HEAD_BASE_WARNING =
  'only uncommitted edits are reviewed, name another base with --base';

/**
 * The intake summary as text (C001-IF-001 Output). `headCommit` is the HEAD commit of the snapshot:
 * whenever the base commit is HEAD itself, whichever rule chose it, the warning follows on the line
 * after the rule.
 */
export function intakeSummaryText(
  summary: IntakeSummary,
  namedValue: string | undefined,
  headCommit?: string,
): string {
  const lines = [
    `Base commit: ${summary.baseCommit.hash} ${summary.baseCommit.subject}`.trimEnd(),
    `Chosen: ${chosenText(summary, namedValue)}`,
  ];
  if (summary.baseChoice === 'head' || summary.baseCommit.hash === headCommit) {
    lines.push(HEAD_BASE_WARNING);
  }
  lines.push(
    `Changed files: ${summary.changedFiles}; changed lines: ${summary.changedLines}`,
    `Intent context: ${intentContextText(summary.intentContext)}`,
    `Test command: ${testCommandText(summary)}`,
  );
  if (summary.sizeWarning)
    lines.push(`${summary.sizeWarning.code}: ${summary.sizeWarning.message}`);
  return `${lines.join('\n')}\n`;
}
