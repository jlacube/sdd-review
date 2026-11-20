import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { ReviewError } from '../core/api/index.js';

/**
 * The checks every request passes before any review state is read (C001-IF-002, C001-ADR-002
 * item 4, C001-CON-10): first the Host check (ERR-UI-001), then for `/api` the token check in
 * constant time and the Origin and Sec-Fetch-Site checks (ERR-UI-002). This module imports nothing
 * that can read review state; the router and the static files run only after `guardRequest`
 * returned `ok`.
 */

/** The Content-Security-Policy of C001-IF-002, on every response. */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export const TOKEN_HEADER = 'x-review-token';

/** The path prefix of the API; everything below it needs the token and the origin checks. */
export const API_PREFIX = '/api';

export interface GuardContext {
  /** The port the server listens on. */
  readonly port: number;
  /** The per-start token (C001-REQ-907). */
  readonly token: string;
}

export interface GuardInput {
  readonly method: string;
  /** The request target as received (`req.url`). */
  readonly target: string;
  readonly headers: IncomingHttpHeaders;
}

export type GuardOutcome =
  | { readonly ok: true; readonly pathname: string; readonly search: URLSearchParams }
  | { readonly ok: false; readonly error: ReviewError; readonly status: number };

const HOST_PATTERN = /^(127\.0\.0\.1|\[::1\]|localhost):(\d{1,5})$/i;

/** True when the Host header is a loopback name or address with exactly the server's port. */
export function hostAllowed(host: string | undefined, port: number): boolean {
  if (host === undefined) return false;
  const match = HOST_PATTERN.exec(host);
  return match !== null && Number(match[2]) === port && match[2] === String(port);
}

/**
 * Compares the presented token with the real one in constant time: both are hashed to digests of
 * the same length first, so neither the length nor the content of the real token shows in the time.
 */
export function tokenMatches(presented: string | undefined, token: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  const equal = timingSafeEqual(digest(presented ?? ''), digest(token));
  return equal && presented !== undefined;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(', ') : value;
}

export function isApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}

function refusal(code: 'ERR-UI-001' | 'ERR-UI-002', operation: string): GuardOutcome {
  const error = new ReviewError(code, { operation });
  return { ok: false, error, status: error.httpStatus };
}

/**
 * Runs the checks in order and returns the first refusal. `pathname` of an accepted request is the
 * normalised path (dot segments removed by the URL parser), the same one the router and the static
 * server use, so that a spelling of `/api` cannot pass the guard as a static path.
 */
export function guardRequest(input: GuardInput, context: GuardContext): GuardOutcome {
  const { headers } = input;
  const host = single(headers.host);

  // 1. Host (C001-REQ-906, ERR-UI-001): before anything else, for every path.
  if (!hostAllowed(host, context.port)) return refusal('ERR-UI-001', 'ui-host-check');

  // The request target must be a path: an absolute-form target would name another host.
  if (!input.target.startsWith('/') || input.target.startsWith('//')) {
    return refusal('ERR-UI-001', 'ui-host-check');
  }
  const url = new URL(input.target, `http://${host}`);
  const { pathname } = url;

  if (isApiPath(pathname)) {
    // 2. Token in constant time (C001-REQ-907, ERR-UI-002).
    if (!tokenMatches(single(headers[TOKEN_HEADER]), context.token)) {
      return refusal('ERR-UI-002', 'ui-token-check');
    }
    // 3. Origin: absent, or exactly the origin of the page served at the Host the request names.
    const origin = single(headers.origin);
    if (origin !== undefined && origin.toLowerCase() !== `http://${host}`.toLowerCase()) {
      return refusal('ERR-UI-002', 'ui-origin-check');
    }
    // 4. Fetch metadata: a browser marks a request of another site or origin; same-site (another
    //    port of the same machine, such as the page of another review) is also refused.
    const site = single(headers['sec-fetch-site']);
    if (site !== undefined && site.toLowerCase() !== 'same-origin') {
      return refusal('ERR-UI-002', 'ui-fetch-site-check');
    }
  }
  return { ok: true, pathname, search: url.searchParams };
}
