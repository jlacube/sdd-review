import { isIPv4, isIPv6 } from 'node:net';
import { isLocalhostName, socketPathOf } from './adapters/transport.js';

/**
 * Endpoint locality of C001-IF-010 §6 check 2 (C001-REQ-806, Q-provider-02, C001-CON-11): decided
 * from the endpoint text alone, without name resolution, so that no DNS answer, hosts-file entry
 * or LAN name can turn a cloud host into a local one.
 *
 * - `unix:` and `npipe:` endpoints are local sockets: local.
 * - An IP literal is local when it lies in 127.0.0.0/8 or is `::1` (written `[::1]`).
 * - The host name `localhost`, case-insensitive, with or without a trailing dot, is local; the
 *   transport (`adapters/transport.ts`) connects it to 127.0.0.1, then ::1, and never passes the
 *   name to the system resolver.
 * - Every other host name is non-local ('cloud'), whatever it resolves to: LAN names, names that
 *   resolve to a loopback address, and subdomains such as `api.localhost`. So is an endpoint whose
 *   text cannot be parsed (fail-safe; the configuration schema rejects it anyway).
 *
 * The host is the one of the WHATWG URL parser, the same parse the transport connects with, so
 * the classified host and the connected host are always the same (`http://127.1` is 127.0.0.1 for
 * both; `http://localhost@llm.example` is `llm.example` for both).
 */

export type Locality = 'local' | 'cloud';

export interface EndpointClass {
  readonly locality: Locality;
  /**
   * The host the endpoint names, as the notices and the cloud announcement show it (`<host>` of
   * ERR-MODEL-001 and of C001-IF-001 §Output): the URL host name (an IPv6 literal in brackets),
   * or the endpoint text of a local socket.
   */
  readonly host: string;
}

/** True when an IP literal (without brackets) lies in 127.0.0.0/8 or is ::1. */
export function isLoopbackLiteral(address: string): boolean {
  if (isIPv4(address)) return address.split('.')[0] === '127';
  if (isIPv6(address)) return ipv6IsLoopback(address);
  return false;
}

/** `::1` in any spelling the URL parser lets through (it normalises to `::1` already). */
function ipv6IsLoopback(address: string): boolean {
  if (address.includes('.')) return false; // IPv4-embedded forms are not ::1
  const halves = address.toLowerCase().split('::');
  if (halves.length > 2) return false;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return false;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  return groups.every((g, i) => Number.parseInt(g, 16) === (i === 7 ? 1 : 0));
}

/** Classifies an endpoint of C001-IF-004 `model.provider.endpoint` (§6 check 2). */
export function classifyEndpoint(endpoint: string): EndpointClass {
  if (socketPathOf(endpoint) !== null) return { locality: 'local', host: endpoint };
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { locality: 'cloud', host: endpoint };
  }
  const host = url.hostname;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { locality: 'cloud', host };
  const bare = host.replace(/^\[(.*)\]$/, '$1');
  if (isLocalhostName(bare) || isLoopbackLiteral(bare)) return { locality: 'local', host };
  return { locality: 'cloud', host };
}
