import type { components } from '../../../src/generated/openapi';

/**
 * Client of the local review HTTP API (C001-IF-002). Types come from `openapi.yaml` through the
 * generated `src/generated/openapi.ts`; this module imports no code of the core.
 */
export type SessionInfo = components['schemas']['SessionInfo'];
export type IntakeSummary = components['schemas']['IntakeSummary'];
export type MovedOnNotice = components['schemas']['MovedOnNotice'];

export const API_BASE = '/api/v1';
export const TOKEN_HEADER = 'X-Review-Token';

/**
 * How often the page calls `getSession` to learn of a new revision (C001-ADR-002 item 3: the API
 * has no push channel). The default is 2 seconds: one small request per interval while a review
 * is open, and a change shows within two seconds.
 */
export const DEFAULT_POLL_INTERVAL_MS = 2000;

/** The token of the page address: `#token=<value>` (C001-IF-002); null when there is none. */
export function tokenFromFragment(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const token = params.get('token');
  return token ? token : null;
}

/** A refused or failed API call: the problem details of the server, when it sent them. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClient {
  getSession(): Promise<SessionInfo>;
  getIntakeSummary(): Promise<IntakeSummary>;
  /** Compares the working tree and HEAD with the snapshot (C001-REQ-117); null when nothing moved. */
  checkMovedOn(): Promise<MovedOnNotice | null>;
}

export function createApiClient(token: string, fetchFn: FetchLike = fetch): ApiClient {
  async function get<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
    const response = await fetchFn(`${API_BASE}${path}`, {
      method,
      headers: { [TOKEN_HEADER]: token, Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) {
      let code: string | null = null;
      let detail = `HTTP ${response.status}`;
      try {
        const problem = (await response.json()) as { code?: string; detail?: string };
        code = problem.code ?? null;
        detail = problem.detail ?? detail;
      } catch {
        /* a body that is not problem details */
      }
      throw new ApiError(response.status, code, detail);
    }
    return (await response.json()) as T;
  }
  return {
    getSession: () => get<SessionInfo>('/session'),
    getIntakeSummary: () => get<IntakeSummary>('/intake-summary'),
    checkMovedOn: () => get<MovedOnNotice | null>('/checks/moved-on', 'POST'),
  };
}

export interface PollingOptions {
  readonly intervalMs?: number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

/**
 * Calls `getSession` now and then every `intervalMs` after the previous call ended (calls never
 * overlap). A failed call is reported and polling goes on. Returns the function that stops it.
 */
export function startSessionPolling(
  client: Pick<ApiClient, 'getSession'>,
  onSession: (session: SessionInfo) => void,
  onError: (error: unknown) => void,
  options: PollingOptions = {},
): () => void {
  const interval = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let stopped = false;
  let handle: unknown;
  const tick = async () => {
    try {
      const session = await client.getSession();
      if (!stopped) onSession(session);
    } catch (error) {
      if (!stopped) onError(error);
    }
    if (!stopped) handle = setTimer(() => void tick(), interval);
  };
  void tick();
  return () => {
    stopped = true;
    if (handle !== undefined) clearTimer(handle);
  };
}
