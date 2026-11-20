import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ReviewError, type CoreApi } from '../core/api/index.js';
import { CONTENT_SECURITY_POLICY, guardRequest, isApiPath } from './guards.js';
import {
  ApiRouter,
  DEFAULT_MAX_BODY_BYTES,
  problem,
  type ApiResponse,
  type ErrorSink,
} from './router.js';
import { StaticFiles } from './static.js';

/**
 * The local review UI server (C001-COMP-018, C001-ADR-002 item 4): `node:http` on 127.0.0.1 only,
 * serving the web client's static files and the HTTP API of one review. Every request passes the
 * guards before the router or the static files run, and every response, errors and not-found
 * included, carries the Content-Security-Policy and no CORS header.
 */

/** The only address the server binds (C001-REQ-905, C001-CON-10). */
export const LOOPBACK_ADDRESS = '127.0.0.1';

export interface UiServerOptions {
  /** The core API of the review's repository, called through the router only. */
  readonly core: CoreApi;
  readonly snapshotId: string;
  /**
   * The port to listen on. Absent or 0: a free port chosen by the operating system
   * (C001-IF-001 `--port`). A port that cannot be bound fails with ERR-UI-004.
   */
  readonly port?: number;
  /** Directory of the built web client; the server serves a plain page when it is absent. */
  readonly staticDir?: string;
  /** The token; a random 256-bit token per start when absent (tests pass their own). */
  readonly token?: string;
  readonly log?: ErrorSink;
  readonly maxBodyBytes?: number;
}

export interface UiServer {
  readonly port: number;
  /** The address the socket is bound to, always 127.0.0.1. */
  readonly address: string;
  readonly token: string;
  /** `http://127.0.0.1:<port>` */
  readonly origin: string;
  /** The address to open or print: the token travels only in the fragment (C001-IF-002). */
  readonly url: string;
  close(): Promise<void>;
}

/** A per-start token of 256 random bits, URL-safe. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Headers of every response. No `Access-Control-*` header is ever added. */
function baseHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
}

function send(
  res: ServerResponse,
  head: boolean,
  status: number,
  contentType: string,
  body: Buffer | string,
  extra: Readonly<Record<string, string>> = {},
): void {
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  res.writeHead(status, {
    ...baseHeaders(),
    ...extra,
    'Content-Type': contentType,
    'Content-Length': String(payload.length),
  });
  res.end(head ? undefined : payload);
}

function sendApi(res: ServerResponse, head: boolean, response: ApiResponse): void {
  send(
    res,
    head,
    response.status,
    response.problem
      ? 'application/problem+json; charset=utf-8'
      : 'application/json; charset=utf-8',
    JSON.stringify(response.body),
    response.headers,
  );
}

function sendProblem(
  res: ServerResponse,
  head: boolean,
  status: number,
  body: unknown,
  extra?: Readonly<Record<string, string>>,
): void {
  send(res, head, status, 'application/problem+json; charset=utf-8', JSON.stringify(body), extra);
}

/** Reads a request body up to `limit` bytes; null when it is larger. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(tooLarge ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function startUiServer(options: UiServerOptions): Promise<UiServer> {
  const token = options.token ?? newToken();
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const router = new ApiRouter({
    core: options.core,
    snapshotId: options.snapshotId,
    ...(options.log ? { log: options.log } : {}),
    maxBodyBytes: maxBody,
  });
  const files = new StaticFiles(options.staticDir);
  // The port is known only after listening; the guard reads it through this binding.
  const state = { port: 0 };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const head = req.method === 'HEAD';
    // Every request passes the guards first: no review state is read before they pass.
    const guard = guardRequest(
      { method: req.method ?? 'GET', target: req.url ?? '', headers: req.headers },
      { port: state.port, token },
    );
    if (!guard.ok) {
      sendProblem(res, head, guard.status, guard.error.toProblem());
      return;
    }
    if (isApiPath(guard.pathname)) {
      const body = await readBody(req, maxBody);
      if (body === null) {
        sendProblem(
          res,
          head,
          413,
          problem(413, 'ERR-ACT-003', 'Request too large', `The body exceeds ${maxBody} bytes.`),
        );
        return;
      }
      const type = req.headers['content-type'];
      sendApi(
        res,
        head,
        await router.handle({
          method: req.method ?? 'GET',
          pathname: guard.pathname,
          query: guard.search,
          body,
          contentType: Array.isArray(type) ? type[0] : type,
        }),
      );
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendProblem(res, head, 405, problem(405, 'ERR-ACT-003', 'Method not allowed', 'Use GET.'), {
        Allow: 'GET, HEAD',
      });
      return;
    }
    const file = await files.get(guard.pathname);
    if (!file) {
      sendProblem(res, head, 404, problem(404, 'ERR-ACT-004', 'Not found', 'No such file.'));
      return;
    }
    send(res, head, 200, file.contentType, file.body);
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      const internal = new ReviewError('ERR-CLI-003', {
        operation: 'ui-request',
        params: { operation: 'ui-request', cause: 'request failed' },
        cause: error,
      });
      try {
        options.log?.recordError(internal, 'ui-request');
      } catch {
        // A failing log never changes the answer.
      }
      if (!res.headersSent) sendProblem(res, false, 500, internal.toProblem());
      else res.destroy();
    });
  });
  // A malformed request never reaches the handler; its answer still carries the policy.
  server.on('clientError', (_error, socket) => {
    if (socket.writable) {
      socket.end(
        'HTTP/1.1 400 Bad Request\r\n' +
          `Content-Security-Policy: ${CONTENT_SECURITY_POLICY}\r\n` +
          'Content-Length: 0\r\nConnection: close\r\n\r\n',
      );
    } else socket.destroy();
  });

  const wanted = options.port ?? 0;
  await new Promise<void>((resolve, reject) => {
    const failed = (cause: unknown) =>
      reject(
        new ReviewError('ERR-UI-004', {
          operation: 'ui-listen',
          inputs: { port: wanted },
          params: {
            port: wanted,
            cause: cause instanceof Error ? cause.message : String(cause),
          },
          cause,
        }),
      );
    if (!Number.isInteger(wanted) || wanted < 0 || wanted > 65535) {
      failed(new Error(`${String(wanted)} is not a port number`));
      return;
    }
    server.once('error', failed);
    // Bound to the loopback address and to nothing else; never `::`, 0.0.0.0 or a host name.
    server.listen({ host: LOOPBACK_ADDRESS, port: wanted, exclusive: true }, () => {
      server.off('error', failed);
      resolve();
    });
  });
  const bound = server.address() as AddressInfo;
  state.port = bound.port;
  const origin = `http://${LOOPBACK_ADDRESS}:${bound.port}`;

  return {
    port: bound.port,
    address: bound.address,
    token,
    origin,
    url: `${origin}/#token=${token}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
