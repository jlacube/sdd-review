import { afterEach, describe, expect, it } from 'vitest';
import { CORE_OPERATIONS, ReviewError } from '../../../src/core/api/index.js';
import { API_ROUTES } from '../../../src/generated/api-contract.js';
import { ApiRouter } from '../../../src/ui-server/router.js';
import { allowed, closeAll, send, spyCore, start } from './support.js';

afterEach(closeAll);

const HUNK = 'h-0123456789abcdef';
const INTENT = 'i-0123456789abcdef';
const JSON_TYPE = { 'content-type': 'application/json' };

describe('the routes', () => {
  it('serve every operation of C001-IF-002 and each one is an operation of the core API', () => {
    const router = new ApiRouter({ core: spyCore().core, snapshotId: 's-1' });
    expect(router.operations.length).toBeGreaterThanOrEqual(30);
    for (const operation of router.operations) {
      expect(CORE_OPERATIONS as readonly string[]).toContain(operation);
    }
    expect(new Set(router.operations).size).toBe(API_ROUTES.length);
  });

  it('call the core operation of the same name with the path, query and body values', async () => {
    const spy = spyCore({
      cancelJob: () => [{ jobId: 'j 1', kind: 'test-run', status: 'cancelled' }],
    });
    const server = await start({ core: spy.core, snapshotId: 's-snap' });
    const get = (path: string) => send(server.port, { path, headers: allowed(server) });
    const post = (method: string, path: string, body?: unknown) =>
      send(server.port, {
        method,
        path,
        headers: allowed(server, JSON_TYPE),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    expect((await get('/api/v1/intake-summary')).status).toBe(200);
    await get(`/api/v1/intents/${INTENT}`);
    await get(`/api/v1/components/${encodeURIComponent('dir:src/ui')}`);
    await get('/api/v1/files/base?path=src%2Fa%20b.ts');
    expect((await post('POST', '/api/v1/jobs/j%201/cancel')).json()).toMatchObject({
      jobId: 'j 1',
    });
    const verdict = await post('POST', `/api/v1/intents/${INTENT}/verdicts`, {
      kind: 'reject',
      text: 'why',
    });
    const move = await post('POST', `/api/v1/hunks/${HUNK}/move`, { target: { orphan: true } });
    await post('POST', '/api/v1/hunks/read', { hunkIds: [HUNK] });
    await post('PUT', '/api/v1/attention-budget', { minutes: 'ten' });

    expect(spy.calls).toEqual([
      { operation: 'getIntakeSummary', args: ['s-snap'] },
      { operation: 'getIntent', args: ['s-snap', INTENT] },
      { operation: 'getComponent', args: ['s-snap', 'dir:src/ui'] },
      { operation: 'getFileContent', args: ['s-snap', 'src/a b.ts', 'base'] },
      { operation: 'cancelJob', args: ['s-snap', 'j 1'] },
      { operation: 'giveVerdict', args: ['s-snap', INTENT, { kind: 'reject', text: 'why' }] },
      { operation: 'moveHunk', args: ['s-snap', HUNK, { orphan: true }] },
      { operation: 'markRead', args: ['s-snap', [HUNK]] },
      // the budget values reach the core unchecked: the core refuses them with ERR-ACT-008
      { operation: 'setAttentionBudget', args: ['s-snap', 'ten', undefined] },
    ]);
    expect(verdict.status).toBe(201);
    expect(move.status).toBe(200);
  });

  it('answer with the success status of the contract', async () => {
    const server = await start({ core: spyCore().core });
    const created = await send(server.port, {
      method: 'POST',
      path: '/api/v1/intents',
      headers: allowed(server, JSON_TYPE),
      body: JSON.stringify({ name: 'x', hunkIds: [HUNK] }),
    });
    expect(created.status).toBe(201);
    const run = await send(server.port, {
      method: 'POST',
      path: `/api/v1/intents/${INTENT}/evidence-bundle/runs`,
      headers: allowed(server),
    });
    expect(run.status).toBe(202);
  });
});

describe('request bodies', () => {
  const post = (
    server: Awaited<ReturnType<typeof start>>,
    path: string,
    body: string,
    type = 'application/json',
  ) =>
    send(server.port, {
      method: 'POST',
      path,
      headers: allowed(server, { 'content-type': type }),
      body,
    });

  it('are validated against the schemas of the contract before the core is called', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const bad: Array<[string, string]> = [
      ['/api/v1/intents', '{}'],
      ['/api/v1/intents', JSON.stringify({ name: 'x', hunkIds: [] })],
      ['/api/v1/intents', JSON.stringify({ name: 'x', hunkIds: ['not-a-hunk'] })],
      ['/api/v1/intents', JSON.stringify({ name: 3, hunkIds: [HUNK] })],
      ['/api/v1/hunks/read', '[]'],
      [`/api/v1/intents/${INTENT}/verdicts`, JSON.stringify({ kind: 'approve' })],
      [
        `/api/v1/hunks/${HUNK}/move`,
        JSON.stringify({ target: { intentId: INTENT, orphan: true } }),
      ],
      [`/api/v1/hunks/${HUNK}/rejection`, JSON.stringify({ reasons: 'x' })],
    ];
    for (const [path, body] of bad) {
      const reply = await post(server, path, body);
      expect(reply.status, `${path} ${body}`).toBe(400);
      expect(reply.headers['content-type']).toContain('application/problem+json');
      const problem = reply.json() as {
        status: number;
        code: string;
        title: string;
        detail: string;
      };
      expect(problem.status).toBe(400);
      expect(problem.code).toMatch(/^ERR-[A-Z]+-[0-9]{3}$/);
      expect(problem.detail.length).toBeGreaterThan(0);
    }
    expect(spy.calls).toEqual([]);
  });

  it('refuse malformed JSON, another media type and a body that is too large', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core, maxBodyBytes: 100 });
    expect((await post(server, '/api/v1/intents', '{nope')).status).toBe(400);
    expect((await post(server, '/api/v1/intents', '{}', 'text/plain')).status).toBe(415);
    const large = JSON.stringify({ name: 'x'.repeat(200), hunkIds: [HUNK] });
    expect((await post(server, '/api/v1/intents', large)).status).toBe(413);
    expect(spy.calls).toEqual([]);
  });

  it('never repeat a submitted value in the refusal', async () => {
    const server = await start({ core: spyCore().core });
    const reply = await post(
      server,
      '/api/v1/intents',
      JSON.stringify({ name: 'hunter2-secret', hunkIds: [] }),
    );
    expect(reply.status).toBe(400);
    expect(reply.text).not.toContain('hunter2-secret');
  });

  it('accept a verdict with the confirmation of open hunks', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const reply = await post(
      server,
      `/api/v1/intents/${INTENT}/verdicts`,
      JSON.stringify({ kind: 'sign', confirmOpenHunks: { openHunks: 2, changedLines: 30 } }),
    );
    expect(reply.status).toBe(201);
    expect(spy.calls).toHaveLength(1);
  });
});

describe('routes and methods', () => {
  it('answer 404 for an unknown route and 405 with Allow for a method the route does not take', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const unknown = await send(server.port, { path: '/api/v1/nothing', headers: allowed(server) });
    expect(unknown.status).toBe(404);
    const other = await send(server.port, { path: '/api/v2/session', headers: allowed(server) });
    expect(other.status).toBe(404);
    const wrong = await send(server.port, {
      method: 'DELETE',
      path: '/api/v1/session',
      headers: allowed(server),
    });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.allow).toBe('GET');
    expect(spy.calls).toEqual([]);
  });

  it('refuse a path value that is not valid percent-encoding', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const reply = await send(server.port, {
      path: '/api/v1/intents/%E0%A4%A',
      headers: allowed(server),
    });
    expect(reply.status).toBe(400);
    expect(spy.calls).toEqual([]);
  });

  it('require the query value of getFileContent', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const reply = await send(server.port, { path: '/api/v1/files/base', headers: allowed(server) });
    expect(reply.status).toBe(400);
    expect(spy.calls).toEqual([]);
  });
});

describe('core failures', () => {
  it('answer problem details with the catalogue code and HTTP status', async () => {
    const spy = spyCore({
      getIntent: () => {
        throw new ReviewError('ERR-ACT-004', {
          operation: 'getIntent',
          params: { kind: 'intent', value: 'x', 'snapshot-id': 's-1' },
        });
      },
    });
    const server = await start({ core: spy.core });
    const reply = await send(server.port, {
      path: `/api/v1/intents/${INTENT}`,
      headers: allowed(server),
    });
    expect(reply.status).toBe(404);
    expect(reply.headers['content-type']).toContain('application/problem+json');
    expect(reply.json()).toMatchObject({ status: 404, code: 'ERR-ACT-004' });
  });

  it('answer operations that are not built yet with problem details, not a crash', async () => {
    // The real core stubs reject with ERR-CLI-003; the router turns that into RFC 9457.
    const { NotImplementedError } = await import('../../../src/core/api/index.js');
    const spy = spyCore({
      getHunk: () => {
        throw new NotImplementedError('getHunk');
      },
    });
    const server = await start({ core: spy.core });
    const reply = await send(server.port, {
      path: `/api/v1/hunks/${HUNK}`,
      headers: allowed(server),
    });
    expect(reply.status).toBe(500);
    expect(reply.headers['content-type']).toContain('application/problem+json');
    const problem = reply.json() as { code: string; detail: string; type: string; title: string };
    expect(problem.code).toBe('ERR-CLI-003');
    expect(problem.detail).toContain('not implemented');
    expect(problem.type).toBeTruthy();
    expect(problem.title).toBeTruthy();
  });
});
