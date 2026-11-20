import { describe, expect, it, vi } from 'vitest';

// The token check must run in constant time (C001-ADR-002 item 4): the module compares digests of
// equal length with `timingSafeEqual`, whatever the length of what the request presented.
const compared: Array<[number, number]> = [];
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      compared.push([a.byteLength, b.byteLength]);
      return actual.timingSafeEqual(a, b);
    },
  };
});

const { tokenMatches } = await import('../../../src/ui-server/guards.js');

describe('tokenMatches', () => {
  const token = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

  it('accepts exactly the token', () => {
    expect(tokenMatches(token, token)).toBe(true);
  });

  it('refuses everything else, whatever its length or characters', () => {
    const others = [
      undefined,
      '',
      'a',
      token.slice(1),
      `${token}x`,
      token.toUpperCase(),
      'é'.repeat(5000),
    ];
    for (const value of others) expect(tokenMatches(value, token)).toBe(false);
  });

  it('always compares two buffers of the same length with timingSafeEqual', () => {
    compared.length = 0;
    for (const value of [undefined, '', 'a', token, `${token}${token}`, 'x'.repeat(100_000)]) {
      tokenMatches(value, token);
    }
    expect(compared).toHaveLength(6);
    for (const [a, b] of compared) expect(a).toBe(b);
  });
});
