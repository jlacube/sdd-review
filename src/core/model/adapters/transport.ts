import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import type { AdapterAnswer, ProviderFailure } from '../gateway.js';

/**
 * The HTTP transport of the provider adapters (C001-COMP-016, C001-COMP-017): one POST of a JSON
 * body over HTTP, HTTPS or a local socket (C001-IF-010 §4, §5), bounded by the provider timeout
 * from connection to the last byte of the answer (§3 item 5), with no retry (§3 item 4), and the
 * failure mapping of §7: one catalogue code per cause.
 *
 * Nothing here logs: the gateway logs the failure with its code and cause. A failure carries
 * neither the answer body of a failed request (§7, it can echo the request content) nor any
 * request header, so the key never reaches a log (C001-CON-21). No proxy, no telemetry
 * (C001-CON-11): the only connection is the one to the configured endpoint.
 */

/** Where a request goes: a base URL, or a local socket (`unix:/path`, `npipe:name`). */
export type Endpoint =
  | { readonly kind: 'url'; readonly url: URL }
  | { readonly kind: 'socket'; readonly socketPath: string };

/** The socket path of a local-socket endpoint, or null for a URL (C001-IF-004 `endpoint`). */
export function socketPathOf(endpoint: string): string | null {
  if (endpoint.startsWith('unix:')) return endpoint.slice('unix:'.length);
  if (endpoint.startsWith('npipe:')) {
    // `npipe:name` names the pipe `\\.\pipe\name`; a full pipe path (`\\.\pipe\name` or
    // `//./pipe/name`, with any number of leading slashes) is taken as that pipe.
    const name = endpoint.slice('npipe:'.length).replace(/\//g, '\\');
    const full = /^\\{2,}([^\\]+)\\pipe\\(.+)$/.exec(name);
    return full ? `\\\\${full[1]}\\pipe\\${full[2]}` : `\\\\.\\pipe\\${name}`;
  }
  return null;
}

/**
 * The target of a request: `urlPath` is appended to the configured base URL, `socketRequestPath`
 * is the request path over a local socket (§4: `/v1/chat/completions`, §5: `/v1/messages`).
 */
export function resolveTarget(
  endpoint: string,
  urlPath: string,
  socketRequestPath: string,
): { readonly endpoint: Endpoint; readonly path: string } {
  const socketPath = socketPathOf(endpoint);
  if (socketPath !== null)
    return { endpoint: { kind: 'socket', socketPath }, path: socketRequestPath };
  const base = new URL(endpoint);
  const prefix = base.pathname.replace(/\/+$/, '');
  return { endpoint: { kind: 'url', url: base }, path: `${prefix}${urlPath}${base.search}` };
}

/** `localhost`, case-insensitive, with or without a trailing dot (§6 check 2). */
export function isLocalhostName(hostname: string): boolean {
  return /^localhost\.?$/i.test(hostname);
}

export interface PostRequest {
  readonly endpoint: Endpoint;
  readonly path: string;
  /** Request headers; may hold the key, so never logged or copied into a failure. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly timeoutSeconds: number;
}

/** The outcome of a POST: the complete 200 answer body, or a failure of §7. */
export type PostOutcome =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly failure: ProviderFailure };

/** The connection attempts of a URL endpoint: `localhost` goes to 127.0.0.1, then to ::1 (§6). */
function attempts(url: URL): Array<{ host: string; hostHeader?: string; servername?: string }> {
  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (!isLocalhostName(hostname)) return [{ host: hostname }];
  // Never passed to the system resolver or DNS; the Host header and the TLS name stay localhost.
  const hostHeader = url.port ? `localhost:${url.port}` : 'localhost';
  return [
    { host: '127.0.0.1', hostHeader, servername: 'localhost' },
    { host: '::1', hostHeader, servername: 'localhost' },
  ];
}

const TLS_CODE = /^(ERR_SSL_|ERR_TLS_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|HOSTNAME_MISMATCH)/;

/** The `<cause>` of ERR-MODEL-003 from a connection error: its kind and code, no body. */
export function connectionCause(error: NodeJS.ErrnoException): string {
  const code = error.code ?? '';
  if (code === 'ECONNREFUSED') return 'connection refused';
  if (code === 'ECONNRESET' || code === 'EPIPE' || error.message === 'socket hang up') {
    return 'connection closed before an HTTP status line';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `host not found (${code})`;
  if (code === 'ENOENT') return 'local socket not found';
  if (TLS_CODE.test(code) || /\b(ssl|tls)\b/i.test(error.message)) {
    return `TLS failure (${code || 'handshake'})`;
  }
  return `connection failed (${code || error.name})`;
}

const failure = (
  code: ProviderFailure['code'],
  params: Record<string, string>,
  cause: string,
): { ok: false; failure: ProviderFailure } => ({ ok: false, failure: { code, params, cause } });

/** The failure of a status other than 200 (§7); the answer body is not read. */
export function statusFailure(status: number): { ok: false; failure: ProviderFailure } {
  const params = { status: String(status) };
  const cause = `HTTP ${status}`;
  if (status === 401 || status === 403) return failure('ERR-MODEL-007', params, cause);
  if (status === 429) return failure('ERR-MODEL-008', params, cause);
  if (status >= 500 && status <= 599) return failure('ERR-MODEL-009', params, cause);
  return failure('ERR-MODEL-010', params, cause);
}

/** ERR-MODEL-005: an HTTP 200 answer that the adapter cannot use (§4, §5). */
export function unusable(reason: string): { ok: false; failure: ProviderFailure } {
  return failure('ERR-MODEL-005', { reason }, reason);
}

/**
 * Sends one POST and reads the answer, within `timeoutSeconds` from the first connection attempt
 * to the last byte (§3 item 5). No retry: the second attempt for `localhost` is the connection to
 * ::1 of §6 after 127.0.0.1 refused it, under the same deadline.
 */
export function postJson(req: PostRequest): Promise<PostOutcome> {
  return new Promise<PostOutcome>((resolve) => {
    let settled = false;
    let current: ClientRequest | undefined;
    const seconds = String(req.timeoutSeconds);
    const timer = setTimeout(() => {
      finish(failure('ERR-MODEL-004', { s: seconds }, `no complete answer within ${seconds} s`));
    }, req.timeoutSeconds * 1000);

    function finish(outcome: PostOutcome): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      current?.destroy();
      resolve(outcome);
    }

    const headers: Record<string, string> = {
      ...req.headers,
      'content-length': String(Buffer.byteLength(req.body)),
    };

    const onResponse = (res: IncomingMessage): void => {
      const status = res.statusCode ?? 0;
      if (status !== 200) {
        // The body of a failed request is neither read nor kept (§7).
        res.resume();
        finish(statusFailure(status));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if (!res.complete) finish(unusable('the answer ended before its last byte'));
        else finish({ ok: true, body: Buffer.concat(chunks).toString('utf8') });
      });
      res.on('aborted', () => finish(unusable('the answer ended before its last byte')));
      res.on('error', () => finish(unusable('the answer ended before its last byte')));
    };

    const send = (options: RequestOptions, secure: boolean, onRefused?: () => void): void => {
      const r = (secure ? httpsRequest : httpRequest)(options, onResponse);
      current = r;
      r.on('error', (error: NodeJS.ErrnoException) => {
        if (settled) return;
        if (error.code === 'ECONNREFUSED' && onRefused) {
          onRefused();
          return;
        }
        finish(failure('ERR-MODEL-003', { cause: connectionCause(error) }, connectionCause(error)));
      });
      r.end(req.body);
    };

    const common = { method: 'POST', path: req.path, agent: false } as const;
    if (req.endpoint.kind === 'socket') {
      send({ ...common, socketPath: req.endpoint.socketPath, headers }, false);
      return;
    }
    const url = req.endpoint.url;
    const secure = url.protocol === 'https:';
    const port = url.port ? Number(url.port) : secure ? 443 : 80;
    const tries = attempts(url);
    const attempt = (i: number): void => {
      const t = tries[i]!;
      const options: RequestOptions = {
        ...common,
        host: t.host,
        port,
        headers: t.hostHeader ? { ...headers, host: t.hostHeader } : headers,
        ...(secure && t.servername ? { servername: t.servername } : {}),
      };
      send(options, secure, i + 1 < tries.length ? () => attempt(i + 1) : undefined);
    };
    attempt(0);
  });
}

/** Parses a complete 200 answer body as a JSON object, or the unusable-output failure. */
export function parseAnswer(
  body: string,
):
  | { readonly ok: true; readonly answer: Record<string, unknown> }
  | Extract<AdapterAnswer, { ok: false }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return unusable('the answer is not JSON');
  }
  if (!isObject(parsed)) return unusable('the answer is not a JSON object');
  return { ok: true, answer: parsed };
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A provider-written word for a reason (finish or stop reason), only when it is a plain token. */
export function quoted(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value)
    ? `"${value}"`
    : 'another value';
}

/** The model name of an answer's `model` member, or null (§1). */
export function answerModel(answer: Record<string, unknown>): string | null {
  return typeof answer.model === 'string' && answer.model.length > 0 ? answer.model : null;
}
