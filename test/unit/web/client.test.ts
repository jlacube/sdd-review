import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createApiClient,
  DEFAULT_POLL_INTERVAL_MS,
  startSessionPolling,
  tokenFromFragment,
  type SessionInfo,
} from '../../../web/src/api/client';

describe('tokenFromFragment', () => {
  it('reads the token of the page address fragment', () => {
    expect(tokenFromFragment('#token=abc_-123')).toBe('abc_-123');
    expect(tokenFromFragment('token=abc')).toBe('abc');
  });
  it('is null without a token', () => {
    expect(tokenFromFragment('')).toBeNull();
    expect(tokenFromFragment('#other=1')).toBeNull();
    expect(tokenFromFragment('#token=')).toBeNull();
  });
});

describe('createApiClient', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('sends the token header to the session route', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => json({ snapshotId: 's-1' }));
    const session = await createApiClient('tok', fetchFn).getSession();
    expect(session.snapshotId).toBe('s-1');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/v1/session');
    expect((init!.headers as Record<string, string>)['X-Review-Token']).toBe('tok');
    expect(init!.credentials).toBe('omit');
  });

  it('raises the problem details of a refusal', async () => {
    const fetchFn = async () => json({ code: 'ERR-UI-002', detail: 'refused' }, 403);
    await expect(createApiClient('bad', fetchFn).getSession()).rejects.toMatchObject({
      status: 403,
      code: 'ERR-UI-002',
    });
    await expect(createApiClient('bad', fetchFn).getSession()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('startSessionPolling', () => {
  it('polls at the interval, never overlaps, survives errors and stops', async () => {
    const timers: Array<() => void> = [];
    const intervals: number[] = [];
    let calls = 0;
    const seen: unknown[] = [];
    const errors: unknown[] = [];
    const client = {
      getSession: async () => {
        calls += 1;
        if (calls === 2) throw new Error('down');
        return { snapshotId: `s-${calls}` } as SessionInfo;
      },
    };
    const stop = startSessionPolling(
      client,
      (s) => seen.push(s.snapshotId),
      (e) => errors.push(e),
      {
        setTimer: (cb, ms) => (timers.push(cb), intervals.push(ms), timers.length),
        clearTimer: () => undefined,
      },
    );
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    timers.shift()!();
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    timers.shift()!();
    await vi.waitFor(() => expect(seen).toEqual(['s-1', 's-3']));
    stop();
    expect(intervals.every((ms) => ms === DEFAULT_POLL_INTERVAL_MS)).toBe(true);
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    timers.shift()!();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual(['s-1', 's-3']);
  });
});
