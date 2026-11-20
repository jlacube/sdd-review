import { Fragment } from 'react';
import type { IntakeSummary } from '../api/client';

/** The facts of the change the first view shows, as plain strings (C001-CON-20: text only). */
export interface ChangeRow {
  readonly label: string;
  readonly value: string;
}

export function changeRows(snapshotId: string, summary: IntakeSummary): ChangeRow[] {
  return [
    { label: 'Snapshot', value: snapshotId },
    {
      label: 'Base commit',
      value: `${summary.baseCommit.hash} ${summary.baseCommit.subject}`.trim(),
    },
    { label: 'Changed files', value: String(summary.changedFiles) },
    { label: 'Changed lines', value: String(summary.changedLines) },
  ];
}

/**
 * The changed files of the snapshot, as the intake summary states them (a count of files and of
 * lines; no operation of C001-IF-002 lists the file names yet). Every value is a React text node.
 */
export function ChangeList(props: { snapshotId: string; summary: IntakeSummary }) {
  const { snapshotId, summary } = props;
  return (
    <section aria-label="Changed files">
      <h2>Change</h2>
      <dl className="facts">
        {changeRows(snapshotId, summary).map((row) => (
          <Fragment key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </Fragment>
        ))}
      </dl>
      {summary.sizeWarning ? (
        <p className="notice">{`${summary.sizeWarning.code}: ${summary.sizeWarning.message}`}</p>
      ) : null}
    </section>
  );
}
