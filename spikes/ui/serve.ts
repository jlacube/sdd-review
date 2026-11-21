// Spike C001-T-023: builds the prototype page with Vite (production mode, hashed files, nothing
// inlined) into the spike's cache, and serves it with the dataset on 127.0.0.1 under the
// Content-Security-Policy of the UI server (C001-IF-002). Never shipped: the output is under
// node_modules/.cache, outside the package `files`.
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { CONTENT_SECURITY_POLICY } from '../../src/ui-server/guards.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.join(here, 'app');

export async function buildPage(outDir: string): Promise<void> {
  await build({
    configFile: false,
    root: APP_DIR,
    base: '/',
    logLevel: 'warn',
    mode: 'production',
    plugins: [react()],
    build: {
      outDir,
      emptyOutDir: true,
      assetsInlineLimit: 0,
      cssCodeSplit: true,
      modulePreload: { polyfill: false },
      sourcemap: false,
      target: 'es2022',
    },
  });
  if (!existsSync(path.join(outDir, 'index.html'))) {
    throw new Error(`the page build wrote no ${outDir}/index.html`);
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export interface PageServer {
  readonly url: string;
  close(): Promise<void>;
}

/** Serves `pageDir` and `/data.json` (the dataset file) on 127.0.0.1, port chosen by the system. */
export async function servePage(pageDir: string, dataFile: string): Promise<PageServer> {
  const root = path.resolve(pageDir);
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const file =
      url.pathname === '/data.json'
        ? dataFile
        : path.resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
    const inside = file === dataFile || file.startsWith(root + path.sep);
    const headers = {
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.method !== 'GET' || !inside || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      ...headers,
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}
