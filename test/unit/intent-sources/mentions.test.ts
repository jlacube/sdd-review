import { describe, expect, it } from 'vitest';
import { FileMentions, IdMentions, shortIdOf } from '../../../src/core/intent-sources/mentions.js';

// The mention rules of C001-IF-007 §10 behind the link signals of C001-CAP-03 §1 (C001-TC-314 and
// C001-TC-510 at unit level): ID mentions as whole tokens with the short form for the selected SDD
// change, and file mentions by path or unique file name with their boundaries and positions.

describe('ID mentions (§10 item 1)', () => {
  const ids = new IdMentions([
    { id: 'C001-REQ-314', short: true },
    { id: 'C001-AC-314.1', short: true },
    { id: 'C002-REQ-001' },
    { id: 'C001-T-032', short: true },
  ]);

  it('finds full IDs as whole tokens with their positions', () => {
    const text = 'Implements C001-REQ-314\n(see C001-AC-314.1).';
    expect(ids.find(text)).toEqual([
      { id: 'C001-REQ-314', text: 'C001-REQ-314', offset: 11, line: 1, column: 12 },
      { id: 'C001-AC-314.1', text: 'C001-AC-314.1', offset: 29, line: 2, column: 6 },
    ]);
  });

  it('refuses IDs preceded or followed by a letter, a digit, - or _', () => {
    for (const text of [
      'XC001-REQ-314',
      'C001-REQ-3145',
      'C001-REQ-314a',
      'C001-REQ-314-x',
      '_C001-REQ-314',
      'C001-REQ-314_',
      '1C001-REQ-314',
      'éC001-REQ-314',
    ]) {
      expect(ids.names(text), text).toEqual([]);
    }
    expect(ids.names('[C001-REQ-314]: test "C001-T-032"')).toEqual(['C001-REQ-314', 'C001-T-032']);
  });

  it('prefers the longest ID: an AC ID is not read as a shorter one', () => {
    const both = new IdMentions([{ id: 'C001-AC-314.1' }, { id: 'C001-AC-314.10' }]);
    expect(both.names('C001-AC-314.10')).toEqual(['C001-AC-314.10']);
  });

  it('counts the short form only for items of the selected SDD change', () => {
    expect(ids.find('test for REQ-314 and T-032')).toMatchObject([
      { id: 'C001-REQ-314', text: 'REQ-314' },
      { id: 'C001-T-032', text: 'T-032' },
    ]);
    expect(ids.names('REQ-001')).toEqual([]);
    // The short form inside the full ID is not a second mention.
    expect(ids.find('C001-REQ-314')).toHaveLength(1);
  });

  it('names each ID once, in the order of first mention', () => {
    expect(ids.names('T-032 C001-REQ-314 C001-T-032')).toEqual(['C001-T-032', 'C001-REQ-314']);
  });

  it('has no mention without items', () => {
    expect(new IdMentions([]).find('C001-REQ-314')).toEqual([]);
    expect(shortIdOf('C001-REQ-314')).toBe('REQ-314');
    expect(shortIdOf('CHG-001')).toBeNull();
  });
});

describe('file mentions (§10 item 2)', () => {
  const files = new FileMentions([
    'src/cart/coupon.ts',
    'src/cart/index.ts',
    'lib/index.ts',
    'README',
  ]);

  it('finds repository-relative paths with / or \\ separators, optionally after ./', () => {
    expect(files.names('edit src/cart/coupon.ts')).toEqual(['src/cart/coupon.ts']);
    expect(files.names('edit src\\cart\\coupon.ts')).toEqual(['src/cart/coupon.ts']);
    expect(files.names('edit ./src/cart/coupon.ts')).toEqual(['src/cart/coupon.ts']);
    expect(files.names('edit .\\lib\\index.ts')).toEqual(['lib/index.ts']);
  });

  it('finds a file name with its extension only when no other changed file has that name', () => {
    expect(files.names('see coupon.ts')).toEqual(['src/cart/coupon.ts']);
    expect(files.names('see index.ts')).toEqual([]);
    expect(files.names('update README')).toEqual(['README']);
    expect(files.names('see coupon')).toEqual([]);
  });

  it('accepts the start and end boundaries of the rule', () => {
    for (const text of [
      'coupon.ts',
      ' coupon.ts ',
      '`coupon.ts`',
      "'coupon.ts'",
      '"coupon.ts"',
      '(coupon.ts)',
      '[coupon.ts]',
      '<coupon.ts>',
      'coupon.ts, x',
      'coupon.ts; x',
      'coupon.ts: x',
      'coupon.ts!',
      'coupon.ts?',
      'Done in coupon.ts.',
      'Done in coupon.ts. Next',
    ]) {
      expect(files.names(text), text).toEqual(['src/cart/coupon.ts']);
    }
  });

  it('refuses a match that does not start or end at a boundary', () => {
    for (const text of [
      'xcoupon.ts',
      'my/coupon.ts',
      'coupon.tsx',
      'coupon.ts.bak',
      'src/cart/coupon.ts/x',
      'a-coupon.ts',
      'coupon.ts-old',
    ]) {
      expect(files.names(text), text).toEqual([]);
    }
  });

  it('gives positions and the text as written', () => {
    expect(files.find('one\n  `./src\\cart\\coupon.ts` and lib/index.ts')).toEqual([
      {
        path: 'src/cart/coupon.ts',
        text: './src\\cart\\coupon.ts',
        offset: 7,
        line: 2,
        column: 4,
      },
      { path: 'lib/index.ts', text: 'lib/index.ts', offset: 33, line: 2, column: 30 },
    ]);
  });

  it('prefers the longest path when one changed path extends another', () => {
    const both = new FileMentions(['a/b.ts', 'a/b.ts.snap']);
    expect(both.names('a/b.ts.snap')).toEqual(['a/b.ts.snap']);
    expect(both.names('a/b.ts.')).toEqual(['a/b.ts']);
  });

  it('has no mention without changed files', () => {
    expect(new FileMentions([]).find('src/a.ts')).toEqual([]);
  });
});
