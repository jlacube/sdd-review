import { request, type IncomingHttpHeaders } from 'node:http';
import type { CoreApi } from '../../../src/core/api/index.js';
import {
  startUiServer,
  type UiServer,
  type UiServerOptions,
} from '../../../src/ui-server/server.js';

export interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly text: string;
  json(): unknown;
}

export interface Send {
  readonly method?: string;
  readonly path?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

/** A request to 127.0.0.1 on `port` with exactly the headers given (the Host header included). */
export function send(port: number, options: Send = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'GET',
        path: options.path ?? '/',
        headers: options.headers ?? {},
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text,
            json: () => JSON.parse(text) as unknown,
          });
        });
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}

/** The headers of a request that passes every guard. */
export function allowed(server: UiServer, extra: Record<string, string> = {}) {
  return { host: `127.0.0.1:${server.port}`, 'x-review-token': server.token, ...extra };
}

export interface SpyCore {
  readonly core: CoreApi;
  /** Every property of the core API that was read, called or not. */
  readonly accessed: string[];
  /** Every operation that was called, with its arguments. */
  readonly calls: Array<{ operation: string; args: unknown[] }>;
}

/** A core API that records any touch; operations answer `answers[name]` or `{ operation }`. */
export function spyCore(answers: Record<string, (...args: unknown[]) => unknown> = {}): SpyCore {
  const accessed: string[] = [];
  const calls: SpyCore['calls'] = [];
  const core = new Proxy({} as CoreApi, {
    get(_target, name) {
      if (typeof name !== 'string') return undefined;
      accessed.push(name);
      return (...args: unknown[]) => {
        calls.push({ operation: name, args });
        try {
          const answer = answers[name];
          return Promise.resolve(answer ? answer(...args) : { operation: name });
        } catch (error) {
          return Promise.reject(error);
        }
      };
    },
  });
  return { core, accessed, calls };
}

const started: UiServer[] = [];

/** Starts a server for a test; `closeAll` in `afterEach` stops it. */
export async function start(options: Partial<UiServerOptions> & { core: CoreApi }) {
  const server = await startUiServer({ snapshotId: `s-${'a'.repeat(64)}`, ...options });
  started.push(server);
  return server;
}

export async function closeAll(): Promise<void> {
  await Promise.all(started.splice(0).map((s) => s.close()));
}
