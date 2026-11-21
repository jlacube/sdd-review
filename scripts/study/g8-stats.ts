/** Descriptive statistics of the G-8 analysis (`nfr.md` §3 item 10: the comparison is descriptive). */

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error('mean: no values');
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Sample standard deviation (n - 1); null for fewer than two values. */
export function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

function samePairs(a: readonly string[], b: readonly string[]): void {
  if (a.length !== b.length) throw new Error('rater label lists must have the same length');
}

/** Share of items both raters labelled the same. */
export function percentAgreement(a: readonly string[], b: readonly string[]): number {
  samePairs(a, b);
  if (a.length === 0) throw new Error('percentAgreement: no items');
  return a.filter((x, i) => x === b[i]).length / a.length;
}

/**
 * Cohen's kappa for two raters over nominal labels: (po - pe) / (1 - pe). Null when chance
 * agreement is total (pe = 1), where kappa is undefined.
 */
export function cohenKappa(a: readonly string[], b: readonly string[]): number | null {
  const po = percentAgreement(a, b);
  const n = a.length;
  const countA = new Map<string, number>();
  const countB = new Map<string, number>();
  for (const x of a) countA.set(x, (countA.get(x) ?? 0) + 1);
  for (const x of b) countB.set(x, (countB.get(x) ?? 0) + 1);
  let pe = 0;
  for (const [label, ca] of countA) pe += (ca / n) * ((countB.get(label) ?? 0) / n);
  if (pe >= 1) return null;
  return (po - pe) / (1 - pe);
}
