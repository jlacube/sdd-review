import { afterEach, describe, expect, it } from 'vitest';
import { ReviewError } from '../../../src/core/api/index.js';
import { LOOPBACK_ADDRESS, newToken, startUiServer } from '../../../src/ui-server/server.js';
import { allowed, closeAll, send, spyCore, start } from './support.js';

afterEach(closeAll);

describe('listening', () => {
  it('binds 127.0.0.1 and nothing else', async () => {
    const server = await start({ core: spyCore().core });
    expect(LOOPBACK_ADDRESS).toBe('127.0.0.1');
    expect(server.address).toBe('127.0.0.1');
    expect(server.origin).toBe(`http://127.0.0.1:${server.port}`);
  });

  it('chooses a free port when none is given and keeps two servers apart', async () => {
    const a = await start({ core: spyCore().core });
    const b = await start({ core: spyCore().core });
    expect(a.port).toBeGreaterThan(0);
    expect(b.port).toBeGreaterThan(0);
    expect(a.port).not.toBe(b.port);
  });

  it('binds the port asked for', async () => {
    const probe = await start({ core: spyCore().core });
    const free = probe.port;
    await probe.close();
    const server = await start({ core: spyCore().core, port: free });
    expect(server.port).toBe(free);
  });

  it('fails with ERR-UI-004 when the port is taken', async () => {
    const first = await start({ core: spyCore().core });
    const failure = await startUiServer({
      core: spyCore().core,
      snapshotId: 's-x',
      port: first.port,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ReviewError);
    expect((failure as ReviewError).code).toBe('ERR-UI-004');
    expect((failure as ReviewError).message).toContain(`127.0.0.1:${first.port}`);
  });

  it('fails with ERR-UI-004 for a port that is no port number', async () => {
    for (const port of [-1, 65536, 1.5, Number.NaN]) {
      const failure = await startUiServer({
        core: spyCore().core,
        snapshotId: 's-x',
        port,
      }).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect((failure as ReviewError | undefined)?.code).toBe('ERR-UI-004');
    }
  });
});

describe('the token', () => {
  it('has at least 128 bits of randomness and is different at every start', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(Buffer.from(token, 'base64url').length).toBeGreaterThanOrEqual(16);
    }
  });

  it('is delivered in the URL fragment only and never in a response', async () => {
    const spy = spyCore({ getSession: () => ({ snapshotId: 's-1' }) });
    const server = await start({ core: spy.core });
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/#token=${server.token}`);
    expect(new URL(server.url).search).toBe('');
    const replies = [
      await send(server.port, { headers: allowed(server) }),
      await send(server.port, { path: '/api/v1/session', headers: allowed(server) }),
      await send(server.port, { path: '/api/v1/nothing', headers: allowed(server) }),
      await send(server.port, { path: '/api/v1/session', headers: { host: allowed(server).host } }),
    ];
    for (const reply of replies) {
      expect(JSON.stringify([reply.text, reply.headers])).not.toContain(server.token);
    }
  });

  it('uses the token a test hands in, and makes a new one otherwise', async () => {
    const own = await start({ core: spyCore().core, token: 'my-token' });
    expect(own.token).toBe('my-token');
    const other = await start({ core: spyCore().core });
    expect(other.token).not.toBe('my-token');
  });
});

describe('close', () => {
  it('stops listening', async () => {
    const server = await start({ core: spyCore().core });
    await server.close();
    await expect(send(server.port, { headers: allowed(server) })).rejects.toThrow();
  });
});
