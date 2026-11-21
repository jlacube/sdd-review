import { describe, expect, it } from 'vitest';
import {
  cohenKappa,
  mean,
  percentAgreement,
  sampleStandardDeviation,
} from '../../../scripts/study/g8-stats.js';

describe('descriptive statistics', () => {
  it('computes the mean', () => {
    expect(mean([60, 65, 70, 75])).toBe(67.5);
  });

  it('refuses the mean of nothing', () => {
    expect(() => mean([])).toThrow(/no values/);
  });

  it('computes the sample standard deviation', () => {
    // values 2,4,4,4,5,5,7,9: mean 5, sum of squares 32, n - 1 = 7
    expect(sampleStandardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(sampleStandardDeviation([5])).toBeNull();
  });
});

describe('agreement between two raters', () => {
  it('computes the percent agreement', () => {
    expect(percentAgreement(['a', 'b', 'c', 'd'], ['a', 'b', 'x', 'd'])).toBe(0.75);
  });

  it("computes Cohen's kappa on a two-by-two table", () => {
    // 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no: po = 0.70, pe = 0.5 * 0.6 + 0.5 * 0.4 = 0.50
    const a = [...Array(25).fill('yes'), ...Array(25).fill('no')];
    const b = [
      ...Array(20).fill('yes'),
      ...Array(5).fill('no'),
      ...Array(10).fill('yes'),
      ...Array(15).fill('no'),
    ];
    expect(cohenKappa(a, b)).toBeCloseTo(0.4, 12);
  });

  it("computes Cohen's kappa over more than two labels", () => {
    // po = 5/6; marginals a: x 3, y 2, z 1; b: x 2, y 3, z 1 → pe = (6 + 6 + 1) / 36
    const a = ['x', 'x', 'x', 'y', 'y', 'z'];
    const b = ['x', 'x', 'y', 'y', 'y', 'z'];
    const po = 5 / 6;
    const pe = 13 / 36;
    expect(cohenKappa(a, b)).toBeCloseTo((po - pe) / (1 - pe), 12);
  });

  it('returns null for kappa when chance agreement is total', () => {
    expect(cohenKappa(['x', 'x'], ['x', 'x'])).toBeNull();
  });

  it('refuses label lists of different lengths', () => {
    expect(() => percentAgreement(['a'], ['a', 'b'])).toThrow(/same length/);
    expect(() => cohenKappa(['a'], [])).toThrow(/same length/);
  });
});
