import dns from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyEndpoint, isLoopbackLiteral } from '../../../src/core/model/locality.js';

// C001-T-088 step 1, C001-TC-806 at unit level: endpoint locality of C001-IF-010 §6 check 2, from
// the endpoint text alone, without name resolution (C001-REQ-806, Q-provider-02, C001-CON-11).
// Mirrors C001-TS-815, C001-TS-816, C001-TS-817, C001-TS-848 and C001-TS-849.

describe('endpoint locality (C001-IF-010 §6 check 2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    // C001-TS-816: loopback literals
    ['http://127.0.0.1:11434/v1', '127.0.0.1'],
    ['http://127.255.255.254:11434/v1', '127.255.255.254'],
    ['http://[::1]:11434/v1', '[::1]'],
    ['https://[0:0:0:0:0:0:0:1]:8443', '[::1]'],
    // C001-TS-848: localhost, any case, with or without the trailing dot
    ['http://localhost:11434/v1', 'localhost'],
    ['http://LocalHost:11434/v1', 'localhost'],
    ['http://localhost.:11434/v1', 'localhost.'],
    ['https://localhost', 'localhost'],
    // WHATWG IPv4 shorthands are the same address for the transport
    ['http://127.1:11434/v1', '127.0.0.1'],
  ])('%s is local', (endpoint, host) => {
    expect(classifyEndpoint(endpoint)).toEqual({ locality: 'local', host });
  });

  it.each([['unix:/run/ollama.sock'], ['npipe:ollama'], ['npipe://./pipe/ollama']])(
    'the local socket %s is local',
    (endpoint) => {
      expect(classifyEndpoint(endpoint)).toEqual({ locality: 'local', host: endpoint });
    },
  );

  it.each([
    // C001-TS-815: a "local" runtime on another machine
    ['http://192.168.1.20:11434', '192.168.1.20'],
    // C001-TS-817: just outside loopback
    ['http://128.0.0.1:11434', '128.0.0.1'],
    ['http://126.255.255.255:11434', '126.255.255.255'],
    ['http://0.0.0.0:11434', '0.0.0.0'],
    ['http://[::2]:11434', '[::2]'],
    ['http://[::]:11434', '[::]'],
    ['http://[::ffff:127.0.0.1]:11434', '[::ffff:7f00:1]'],
    // C001-TS-849: every other host name, whatever it resolves to
    ['http://api.localhost:11434/v1', 'api.localhost'],
    ['http://devbox.lan:11434/v1', 'devbox.lan'],
    ['http://llm.loopback.test:11434/v1', 'llm.loopback.test'],
    ['http://localhost.localdomain:11434', 'localhost.localdomain'],
    ['http://127.0.0.1.nip.io:11434', '127.0.0.1.nip.io'],
    ['https://api.anthropic.com', 'api.anthropic.com'],
    ['https://llm.cloud.test:4443/v1', 'llm.cloud.test'],
    // The user-info part is not the host: the URL parser and the transport agree on the host.
    ['http://localhost@llm.example:11434/v1', 'llm.example'],
    ['http://127.0.0.1@llm.example/v1', 'llm.example'],
  ])('%s is non-local', (endpoint, host) => {
    expect(classifyEndpoint(endpoint)).toEqual({ locality: 'cloud', host });
  });

  it('an endpoint that cannot be parsed counts as non-local (fail-safe)', () => {
    expect(classifyEndpoint('not a url').locality).toBe('cloud');
    expect(classifyEndpoint('ftp://127.0.0.1/').locality).toBe('cloud');
  });

  it('never asks the system resolver or DNS', () => {
    const lookup = vi.spyOn(dns, 'lookup');
    const resolve = vi.spyOn(dns, 'resolve');
    const resolve4 = vi.spyOn(dns.promises, 'lookup');
    for (const endpoint of [
      'http://localhost:11434/v1',
      'http://api.localhost:11434/v1',
      'http://devbox.lan:11434/v1',
      'https://api.anthropic.com',
    ]) {
      classifyEndpoint(endpoint);
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(resolve4).not.toHaveBeenCalled();
  });

  it('loopback literals: 127.0.0.0/8 and ::1 only', () => {
    expect(isLoopbackLiteral('127.0.0.0')).toBe(true);
    expect(isLoopbackLiteral('127.255.255.255')).toBe(true);
    expect(isLoopbackLiteral('::1')).toBe(true);
    expect(isLoopbackLiteral('0:0:0:0:0:0:0:1')).toBe(true);
    expect(isLoopbackLiteral('::0:1')).toBe(true);
    expect(isLoopbackLiteral('1::')).toBe(false);
    expect(isLoopbackLiteral('::2')).toBe(false);
    expect(isLoopbackLiteral('::ffff:127.0.0.1')).toBe(false);
    expect(isLoopbackLiteral('localhost')).toBe(false);
    expect(isLoopbackLiteral('10.0.0.1')).toBe(false);
  });
});
