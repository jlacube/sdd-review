import { Fragment } from 'react';
import type { IntakeSummary as Summary } from '../api/client';

/** A full ref name as git shortens it: `refs/heads/main` → `main`. */
function shortRef(ref: string): string {
  for (const prefix of ['refs/heads/', 'refs/remotes/', 'refs/tags/']) {
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  }
  return ref;
}

const ROLE_TEXT: Readonly<Record<string, string>> = {
  'pull-request-text': 'pull-request text',
  'agent-plan': 'agent plan',
  'agent-transcript': 'agent transcript',
};

/** How the base commit was chosen, one of the cases of C001-IF-012 §4. */
export function chosenText(summary: Summary): string {
  const ref = summary.baseRef ? shortRef(summary.baseRef) : '';
  switch (summary.baseChoice) {
    case 'named':
      return 'named by the developer';
    case 'upstream-merge-base':
      return `merge base with upstream ${ref}`;
    case 'default-branch-merge-base':
      return `merge base with default branch ${ref}`;
    case 'head':
      return 'HEAD (no upstream branch, no default branch of the remote, no local main or master with a merge base)';
  }
}

export interface SummaryRow {
  readonly label: string;
  readonly value: string;
}

/** The facts of the intake summary (C001-REQ-114) as plain strings. */
export function summaryRows(summary: Summary): SummaryRow[] {
  const context = summary.intentContext;
  const changes =
    context.sddChanges.length === 0
      ? 'none'
      : context.sddChanges.map((c) => `${c.id} (${c.specItems} spec items)`).join(', ');
  const named =
    context.namedFiles.length === 0
      ? 'none'
      : context.namedFiles.map((f) => `${ROLE_TEXT[f.role] ?? f.role} ${f.path}`).join(', ');
  const test = summary.testCommand;
  return [
    { label: 'Base chosen', value: chosenText(summary) },
    { label: 'SDD changes', value: changes },
    { label: 'Commits', value: String(context.commits) },
    { label: 'Named files', value: named },
    { label: 'Documented architecture', value: context.documentedArchitecture },
    {
      label: 'Test command',
      value: test
        ? `${test.command} (${test.origin === 'developer' ? 'given for the review' : 'from the review configuration of the base commit'})`
        : 'none',
    },
  ];
}

/**
 * The intake summary in the review UI (C001-REQ-114): how the base commit was chosen, the intent
 * context and the test command. The session view carries no HEAD commit, so the warning that only
 * uncommitted edits are reviewed is shown when the rule itself chose HEAD. Text nodes only.
 */
export function IntakeSummary(props: { summary: Summary }) {
  const { summary } = props;
  return (
    <section aria-label="Intake summary">
      <h2>Intake</h2>
      <dl className="facts">
        {summaryRows(summary).map((row) => (
          <Fragment key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </Fragment>
        ))}
      </dl>
      {summary.baseChoice === 'head' ? (
        <p className="notice">
          Only uncommitted edits are reviewed; name another base commit with --base.
        </p>
      ) : null}
    </section>
  );
}
