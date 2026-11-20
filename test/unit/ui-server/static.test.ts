import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONTENT_TYPES,
  PLACEHOLDER_PAGE,
  StaticFiles,
  safeRelativePath,
} from '../../../src/ui-server/static.js';
import { allowed, closeAll, send, spyCore, start } from './support.js';

let outer: string;
let root: string;

beforeEach(() => {
  outer = mkdtempSync(join(tmpdir(), 'sddui-'));
  root = join(outer, 'web');
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(
    join(root, 'index.html'),
    '<!doctype html><title>t</title><script src="/assets/app.js"></script>',
  );
  writeFileSync(join(root, 'assets', 'app.js'), 'export {};');
  writeFileSync(join(root, 'assets', 'app.css'), 'body{margin:0}');
  writeFileSync(join(root, 'assets', 'data.bin'), 'binary');
  writeFileSync(join(root, 'assets', 'font.woff2'), 'font');
  writeFileSync(join(outer, 'secret.txt'), 'TOP SECRET');
});

afterEach(async () => {
  await closeAll();
  rmSync(outer, { recursive: true, force: true });
});

describe('content types', () => {
  it('are fixed by extension and declare a charset for text', async () => {
    const server = await start({ core: spyCore().core, staticDir: root });
    const type = async (path: string) =>
      (await send(server.port, { path, headers: allowed(server) })).headers['content-type'];
    expect(await type('/')).toBe('text/html; charset=utf-8');
    expect(await type('/assets/app.js')).toBe('text/javascript; charset=utf-8');
    expect(await type('/assets/app.css')).toBe('text/css; charset=utf-8');
    expect(await type('/assets/font.woff2')).toBe('font/woff2');
  });

  it('send nosniff and never serve a file of an extension outside the table', async () => {
    const server = await start({ core: spyCore().core, staticDir: root });
    const js = await send(server.port, { path: '/assets/app.js', headers: allowed(server) });
    expect(js.headers['x-content-type-options']).toBe('nosniff');
    const bin = await send(server.port, { path: '/assets/data.bin', headers: allowed(server) });
    expect(bin.status).toBe(404);
    expect(Object.keys(CONTENT_TYPES).every((ext) => ext.startsWith('.'))).toBe(true);
  });
});

describe('serving', () => {
  it('serves the page for / and for a client route, files by path, and HEAD without a body', async () => {
    const server = await start({ core: spyCore().core, staticDir: root });
    const page = await send(server.port, { headers: allowed(server) });
    expect(page.status).toBe(200);
    expect(page.text).toContain('<title>t</title>');
    const route = await send(server.port, { path: '/intents/i-1', headers: allowed(server) });
    expect(route.text).toBe(page.text);
    const js = await send(server.port, { path: '/assets/app.js', headers: allowed(server) });
    expect(js.text).toBe('export {};');
    const head = await send(server.port, { method: 'HEAD', path: '/', headers: allowed(server) });
    expect(head.status).toBe(200);
    expect(head.text).toBe('');
    expect(head.headers['content-length']).toBe(String(page.text.length));
    const missing = await send(server.port, {
      path: '/assets/missing.js',
      headers: allowed(server),
    });
    expect(missing.status).toBe(404);
  });

  it('answers a plain page that holds no script or style when no client is installed', async () => {
    const server = await start({ core: spyCore().core });
    const page = await send(server.port, { headers: allowed(server) });
    expect(page.status).toBe(200);
    expect(page.text).toBe(PLACEHOLDER_PAGE);
    expect(PLACEHOLDER_PAGE).not.toMatch(/<script|<style|\sstyle=|\son\w+=|javascript:/i);
  });

  it('refuses methods other than GET and HEAD', async () => {
    const server = await start({ core: spyCore().core, staticDir: root });
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const reply = await send(server.port, { method, path: '/', headers: allowed(server) });
      expect(reply.status).toBe(405);
    }
  });

  it('serves no review data under the static paths and keeps /api for the API', async () => {
    const spy = spyCore();
    const server = await start({ core: spy.core, staticDir: root });
    mkdirSync(join(root, 'api'), { recursive: true });
    writeFileSync(join(root, 'api', 'x.json'), '{}');
    const reply = await send(server.port, { path: '/%61pi/x.json', headers: allowed(server) });
    expect(reply.status).toBe(404);
    expect(spy.accessed).toEqual([]);
  });
});

describe('path traversal', () => {
  const attempts = [
    '/../secret.txt',
    '/..%2fsecret.txt',
    '/%2e%2e/secret.txt',
    '/%2e%2e%2fsecret.txt',
    '/assets/..%2f..%2fsecret.txt',
    '/assets/%2e%2e/%2e%2e/secret.txt',
    '/..%5csecret.txt',
    '/assets/..%5c..%5csecret.txt',
    '/%00/secret.txt',
    '/assets/app.js%00.txt',
    '/assets//app.js',
    '/C:/Windows/win.ini',
    '/assets/app.js::$DATA',
    '/assets/app.js.',
    '/assets/app.js%20',
    '/assets/%252e%252e/secret.txt',
  ];

  it.each(attempts)('is refused: %s', async (path) => {
    const server = await start({ core: spyCore().core, staticDir: root });
    const reply = await send(server.port, { path, headers: allowed(server) });
    expect(reply.text).not.toContain('TOP SECRET');
    expect([400, 404]).toContain(reply.status);
    expect(reply.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('refuses the same paths in the file layer, without the page fallback', async () => {
    const files = new StaticFiles(root);
    for (const path of attempts.filter((p) => !p.includes('%252e'))) {
      expect(await files.get(path), path).toBeNull();
    }
  });

  it('refuses a symbolic link that leaves the directory', async () => {
    try {
      symlinkSync(join(outer, 'secret.txt'), join(root, 'assets', 'leak.txt'));
    } catch {
      return; // creating links needs a privilege on some systems; the other cases still hold
    }
    const files = new StaticFiles(root);
    expect(await files.get('/assets/leak.txt')).toBeNull();
  });

  it('has a path check that accepts plain names only', () => {
    expect(safeRelativePath('/assets/app.js')).toEqual(['assets', 'app.js']);
    expect(safeRelativePath('/')).toEqual([]);
    expect(safeRelativePath('/a/../b')).toBeNull();
    expect(safeRelativePath('/a%2Fb')).toEqual(['a', 'b']);
    expect(safeRelativePath('/a%5Cb')).toBeNull();
    expect(safeRelativePath('/%E0%A4%A')).toBeNull();
  });
});
