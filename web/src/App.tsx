import { useEffect, useState } from 'react';
import {
  ApiError,
  createApiClient,
  startSessionPolling,
  type ApiClient,
  type IntakeSummary,
  type SessionInfo,
} from './api/client';
import { ChangeList } from './views/ChangeList';

/** The text shown for a failed call: the code of the error catalogue when the server sent one. */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return `${error.code ?? `HTTP ${error.status}`}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export function App(props: { token: string | null; client?: ApiClient }) {
  const { token } = props;
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [summary, setSummary] = useState<IntakeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token === null && !props.client) return;
    const client = props.client ?? createApiClient(token ?? '');
    let alive = true;
    client
      .getIntakeSummary()
      .then((s) => alive && setSummary(s))
      .catch((e: unknown) => alive && setError(errorText(e)));
    const stop = startSessionPolling(
      client,
      (s) => {
        setSession(s);
        setError(null);
      },
      (e) => setError(errorText(e)),
    );
    return () => {
      alive = false;
      stop();
    };
  }, [token, props.client]);

  if (token === null && !props.client) {
    return (
      <main>
        <h1>Review</h1>
        <p role="alert">
          This page has no review token. Open the address that the review command printed.
        </p>
      </main>
    );
  }
  return (
    <main>
      <h1>Review</h1>
      {error ? <p role="alert">{error}</p> : null}
      {session ? (
        <p>
          {`Review of snapshot ${session.snapshotId}, revision ${session.revision}; ${session.jobs.length} jobs.`}
        </p>
      ) : (
        <p>Loading the review.</p>
      )}
      {session && summary ? <ChangeList snapshotId={session.snapshotId} summary={summary} /> : null}
    </main>
  );
}
