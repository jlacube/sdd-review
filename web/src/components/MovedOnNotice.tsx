import type { MovedOnNotice as Notice } from '../api/client';

/**
 * The moved-on notice (C001-REQ-117, ERR-INTAKE-007): the working tree or HEAD no longer matches the
 * snapshot under review. Names each differing file and whether HEAD moved; the review keeps
 * showing the snapshot. Every value is a React text node (C001-CON-20).
 */
export function MovedOnNotice(props: { notice: Notice | null }) {
  const { notice } = props;
  if (!notice) return null;
  return (
    <section className="notice" role="status" aria-label="Moved-on notice">
      <p>{`${notice.notice.code}: ${notice.notice.message}`}</p>
      {notice.filesDiffering.length > 0 ? (
        <ul aria-label="Files that differ from the snapshot">
          {notice.filesDiffering.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      ) : null}
      <p>
        {notice.headMoved
          ? `HEAD moved${notice.currentHead ? ` to ${notice.currentHead}` : ''}.`
          : 'HEAD did not move.'}
      </p>
    </section>
  );
}
