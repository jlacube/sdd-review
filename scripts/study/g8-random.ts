import { createHash } from 'node:crypto';

/**
 * Seeded, reproducible draw for `g8-assign` (C001-T-109): SHA-256 in counter mode over the seed
 * gives 32-bit words; a Fisher-Yates shuffle takes unbiased indices from them by rejection
 * sampling. Anyone with the seed and the participant codes can repeat the draw.
 */
function* words(seed: string): Generator<number> {
  for (let counter = 0; ; counter++) {
    const digest = createHash('sha256').update(`${seed}\u0000${counter}`).digest();
    for (let i = 0; i < digest.length; i += 4) yield digest.readUInt32BE(i);
  }
}

/** `count` reproducible numbers in [0, 1) from `seed`. */
export function seededUniform(seed: string, count: number): number[] {
  const out: number[] = [];
  const w = words(seed);
  for (let i = 0; i < count; i++) out.push(w.next().value! / 2 ** 32);
  return out;
}

/** Unbiased integer in [0, bound) from the word stream. */
function below(w: Generator<number>, bound: number): number {
  const limit = Math.floor(2 ** 32 / bound) * bound;
  for (;;) {
    const x = w.next().value!;
    if (x < limit) return x % bound;
  }
}

/** A reproducible permutation of `items` (the input is not changed). */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const w = words(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(w, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
