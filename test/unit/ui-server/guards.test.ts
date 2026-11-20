import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  guardRequest,
  hostAllowed,
} from '../../../src/ui-server/guards.js';
import { allowed, closeAll, send, spyCore, start, type Reply } from './support.js';

afterEach(closeAll);

const CSP =
  "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function expectSecureHeaders(reply: Reply): void {
  expect(reply.headers['content-security-policy']).toBe(CSP);
  const names = Object.keys(reply.headers);
  expect(names.filter((n) => n.startsWith('access-control-'))).toEqual([]);
}

function rawRequest(port: number, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port }, () => socket.write(text));
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (d: string) => (data += d));
    socket.on('close', () => resolve(data));
    socket.on('error', reject);
  });
}

const codeOf = (reply: Reply) => (reply.json() as { code: string }).code;

describe('the policy constant', () => {
  it('is the Content-Security-Policy of C001-IF-002', () => {
    expect(CONTENT_SECURITY_POLICY).toBe(CSP);
  });
});

describe('hostAllowed', () => {
  const port = 49152;
  it.each([
    [`127.0.0.1:${port}`, true],
    [`localhost:${port}`, true],
    [`LOCALHOST:${port}`, true],
    [`[::1]:${port}`, true],
    ['127.0.0.1', false],
    [`127.0.0.1:${port + 1}`, false],
    [`127.0.0.1:0${port}`, false],
    [`rebind.attacker.test:${port}`, false],
    [`localhost.attacker.test:${port}`, false],
    [`192.168.1.20:${port}`, false],
    [`0.0.0.0:${port}`, false],
    [`[::]:${port}`, false],
    [`127.0.0.1.attacker.test:${port}`, false],
    [`user@127.0.0.1:${port}`, false],
    [`127.0.0.1:${port}, evil.test`, false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (host, expected) => {
    expect(hostAllowed(host, port)).toBe(expected);
  });
});

describe('guardRequest order', () => {
  const context = { port: 5000, token: 'secret-token-value' };
  const good = { host: '127.0.0.1:5000', 'x-review-token': 'secret-token-value' };
  const run = (target: string, headers: Record<string, string | string[]>) =>
    guardRequest({ method: 'GET', target, headers }, context);
  const code = (outcome: ReturnType<typeof run>) => (outcome.ok ? 'ok' : outcome.error.code);

  it('checks the Host before the token, for every path', () => {
    expect(code(run('/api/v1/session', { host: 'evil.test:5000' }))).toBe('ERR-UI-001');
    expect(code(run('/', { host: 'evil.test:5000' }))).toBe('ERR-UI-001');
    expect(code(run('/', {}))).toBe('ERR-UI-001');
  });

  it('checks the token only for the API and refuses a missing, wrong or repeated token', () => {
    expect(code(run('/', { host: good.host }))).toBe('ok');
    expect(code(run('/api/v1/session', { host: good.host }))).toBe('ERR-UI-002');
    expect(code(run('/api/v1/session', { ...good, 'x-review-token': 'nope' }))).toBe('ERR-UI-002');
    expect(code(run('/api/v1/session', { ...good, 'x-review-token': '' }))).toBe('ERR-UI-002');
    const twice = { ...good, 'x-review-token': ['secret-token-value', 'x'] };
    expect(code(run('/api/v1/session', twice))).toBe('ERR-UI-002');
    expect(code(run('/api/v1/session', good))).toBe('ok');
  });

  it('refuses a foreign or null Origin and accepts the own origin or none', () => {
    const foreign = [
      'https://attacker.test',
      'null',
      'http://127.0.0.1:5001',
      'http://localhost:5000',
    ];
    for (const origin of foreign) {
      expect(code(run('/api/v1/session', { ...good, origin }))).toBe('ERR-UI-002');
    }
    expect(code(run('/api/v1/session', { ...good, origin: 'http://127.0.0.1:5000' }))).toBe('ok');
  });

  it('refuses every Sec-Fetch-Site except same-origin', () => {
    for (const site of ['cross-site', 'same-site', 'none']) {
      expect(code(run('/api/v1/session', { ...good, 'sec-fetch-site': site }))).toBe('ERR-UI-002');
    }
    expect(code(run('/api/v1/session', { ...good, 'sec-fetch-site': 'same-origin' }))).toBe('ok');
  });

  it('judges the normalised path, so no spelling of /api escapes the API checks', () => {
    const bare = { host: good.host };
    const targets = [
      '/api/v1/session',
      '/./api/v1/session',
      '/x/../api/v1/session',
      '/api/../api/v1/session',
    ];
    for (const target of targets) expect(code(run(target, bare))).toBe('ERR-UI-002');
  });

  it('refuses a request target that is not a path', () => {
    expect(code(run('http://evil.test/api/v1/session', good))).toBe('ERR-UI-001');
    expect(code(run('//evil.test/x', good))).toBe('ERR-UI-001');
  });
});

describe('no review state is read before the guards pass', () => {
  it('refuses foreign hosts on every path without touching the core', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const hosts = [
      `rebind.attacker.test:${server.port}`,
      `localhost.attacker.test:${server.port}`,
      `192.168.1.20:${server.port}`,
    ];
    const paths = ['/', '/api/v1/session', '/api/v1/intents/i-0000000000000001', '/index.html'];
    for (const host of hosts) {
      for (const path of paths) {
        const reply = await send(server.port, {
          path,
          headers: { host, 'x-review-token': server.token },
        });
        expect(reply.status).toBe(403);
        expect(codeOf(reply)).toBe('ERR-UI-001');
        expectSecureHeaders(reply);
      }
    }
    expect(spy.accessed).toEqual([]);
  });

  it('refuses a wrong host port and a missing Host header', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const wrongPort = await send(server.port, {
      headers: { host: `127.0.0.1:${server.port + 1}` },
    });
    expect(codeOf(wrongPort)).toBe('ERR-UI-001');
    // HTTP/1.0 allows no Host header at all.
    const raw = await rawRequest(server.port, 'GET /api/v1/session HTTP/1.0\r\n\r\n');
    expect(raw).toMatch(/^HTTP\/1\.[01] 403 /);
    expect(raw).toContain('ERR-UI-001');
    expect(raw).toContain('Content-Security-Policy');
    expect(spy.accessed).toEqual([]);
  });

  it('refuses a missing or wrong token without touching the core', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const host = `127.0.0.1:${server.port}`;
    const attempts = [
      { host },
      { host, 'x-review-token': 'wrong' },
      { host, 'x-review-token': `${server.token}x` },
    ];
    for (const headers of attempts) {
      const reply = await send(server.port, { path: '/api/v1/session', headers });
      expect(reply.status).toBe(403);
      expect(codeOf(reply)).toBe('ERR-UI-002');
      expectSecureHeaders(reply);
    }
    expect(spy.accessed).toEqual([]);
  });

  it('refuses a foreign Origin or cross-site request that carries the right token', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const attempts = [
      { origin: 'https://attacker.test' },
      { origin: 'http://127.0.0.1:1' },
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
    ];
    const requests = [
      ['GET', '/api/v1/session', undefined],
      ['POST', '/api/v1/intents/i-0000000000000001/verdicts', '{"kind":"sign"}'],
      ['POST', '/api/v1/intents/i-0000000000000001/evidence-bundle/runs', undefined],
      ['POST', '/api/v1/jobs/j1/cancel', undefined],
      ['OPTIONS', '/api/v1/session', undefined],
    ] as const;
    for (const extra of attempts) {
      for (const [method, path, body] of requests) {
        const reply = await send(server.port, {
          method,
          path,
          ...(body ? { body } : {}),
          headers: allowed(server, { 'content-type': 'application/json', ...extra }),
        });
        expect(reply.status).toBe(403);
        expect(codeOf(reply)).toBe('ERR-UI-002');
        expectSecureHeaders(reply);
      }
    }
    expect(spy.accessed).toEqual([]);
  });

  it('reaches the core once every check passes', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const reply = await send(server.port, {
      path: '/api/v1/session',
      headers: allowed(server, { origin: server.origin, 'sec-fetch-site': 'same-origin' }),
    });
    expect(reply.status).toBe(200);
    expect(spy.calls.map((c) => c.operation)).toEqual(['getSession']);
    expectSecureHeaders(reply);
  });

  it('never echoes the token in a refusal', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const reply = await send(server.port, {
      path: '/api/v1/session',
      headers: { host: `localhost.attacker.test:${server.port}`, 'x-review-token': server.token },
    });
    expect(reply.status).toBe(403);
    expect(JSON.stringify([reply.text, reply.headers])).not.toContain(server.token);
    expect(spy.accessed).toEqual([]);
  });
});

describe('loopback host names are served', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('%s', async (name) => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const reply = await send(server.port, {
      path: '/',
      headers: { host: `${name}:${server.port}` },
    });
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toContain('text/html');
    expectSecureHeaders(reply);
    expect(spy.accessed).toEqual([]);
  });
});

describe('every response carries the policy and no CORS header', () => {
  it('holds for pages, API answers, problems, 404 and 405', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core });
    const ok = allowed(server);
    const replies = await Promise.all([
      send(server.port, { headers: ok }),
      send(server.port, { path: '/missing.js', headers: ok }),
      send(server.port, { method: 'POST', path: '/', headers: ok }),
      send(server.port, { path: '/api/v1/session', headers: ok }),
      send(server.port, { path: '/api/v1/nope', headers: ok }),
      send(server.port, { method: 'DELETE', path: '/api/v1/session', headers: ok }),
      send(server.port, { path: '/api/v1/session', headers: { host: 'evil.test' } }),
      send(server.port, { path: '/api/v1/session', headers: { host: ok.host } }),
      send(server.port, {
        method: 'OPTIONS',
        path: '/api/v1/session',
        headers: {
          ...ok,
          origin: 'https://attacker.test',
          'access-control-request-method': 'POST',
        },
      }),
    ]);
    expect(replies.map((r) => r.status)).toEqual([200, 404, 405, 200, 404, 405, 403, 403, 403]);
    for (const reply of replies) expectSecureHeaders(reply);
  });

  it('holds for a malformed request that never reaches the handler', async () => {
    const server = await start({ core: spyCore().core });
    const raw = await rawRequest(server.port, 'GARBAGE\r\n\r\n');
    expect(raw).toMatch(/^HTTP\/1\.1 400 /);
    expect(raw).toContain(`Content-Security-Policy: ${CSP}`);
    expect(raw.toLowerCase()).not.toContain('access-control-');
  });

  it('holds for an internal failure', async () => {
    const spy = spyCore({
      getSession: () => {
        throw new Error('boom');
      },
    });
    const server = await start({ core: spy.core });
    const reply = await send(server.port, { path: '/api/v1/session', headers: allowed(server) });
    expect(reply.status).toBe(500);
    expect(reply.headers['content-type']).toContain('application/problem+json');
    expect(codeOf(reply)).toBe('ERR-CLI-003');
    expectSecureHeaders(reply);
  });
});
