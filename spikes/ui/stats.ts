// Spike C001-T-023: the pure part of the evaluation. Percentiles, per-type summaries and the
// pass/miss statement against C001-NFR-003 (p95 <= 200 ms and maximum <= 1 s). No threshold is
// set here that the NFR does not set.

/** C001-NFR-003 threshold, fixed by the specification (Q-perf-01). */
export const NFR_003 = { p95Ms: 200, maxMs: 1000 } as const;

/** The action types of the scripted session (C001-NFR-003: open, mark, move; plus scroll). */
export const ACTION_TYPES = ['open', 'scroll', 'mark', 'move'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface ActionTiming {
  readonly seq: number;
  readonly type: ActionType;
  /** The concrete input (for example `open-click`, `scroll-context-pagedown`). */
  readonly variant: string;
  /** Input event to updated view rendered, in milliseconds (performance.measure duration). */
  readonly ms: number;
  /** The view did not settle within the page's limit; `ms` is the time until the limit. */
  readonly timedOut: boolean;
}

export interface Summary {
  readonly count: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly timedOut: number;
  readonly verdict: 'pass' | 'miss' | 'no-data';
}

/**
 * Nearest-rank percentile: the smallest value such that at least p % of the values are at or
 * below it (index ceil(p/100 * n) - 1 of the sorted values). No interpolation, so the reported
 * p95 is always a measured value. NaN for an empty list.
 */
export function percentile(values: readonly number[], p: number): number {
  if (!(p > 0 && p <= 100)) throw new RangeError(`percentile ${p} is outside (0, 100]`);
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

const round = (ms: number) => Math.round(ms * 10) / 10;

/** Pass when p95 <= 200 ms and maximum <= 1 s, both inclusive (C001-NFR-003); a timeout is a miss. */
export function verdictOf(p95Ms: number, maxMs: number, timedOut = 0): 'pass' | 'miss' {
  return timedOut === 0 && p95Ms <= NFR_003.p95Ms && maxMs <= NFR_003.maxMs ? 'pass' : 'miss';
}

export function summarise(timings: readonly ActionTiming[]): Summary {
  if (timings.length === 0) {
    const nan = Number.NaN;
    return {
      count: 0,
      meanMs: nan,
      p50Ms: nan,
      p95Ms: nan,
      maxMs: nan,
      timedOut: 0,
      verdict: 'no-data',
    };
  }
  const ms = timings.map((t) => t.ms);
  const timedOut = timings.filter((t) => t.timedOut).length;
  const p95 = percentile(ms, 95);
  const max = Math.max(...ms);
  return {
    count: ms.length,
    meanMs: round(ms.reduce((a, b) => a + b, 0) / ms.length),
    p50Ms: round(percentile(ms, 50)),
    p95Ms: round(p95),
    maxMs: round(max),
    timedOut,
    verdict: verdictOf(p95, max, timedOut),
  };
}

export interface Evaluation {
  /** Over every action of the session: the C001-NFR-003 metric, which decides the result. */
  readonly overall: Summary;
  /** Per action type, for diagnosis; each with its own pass/miss against the same threshold. */
  readonly byType: Record<ActionType, Summary>;
}

export function evaluate(timings: readonly ActionTiming[]): Evaluation {
  const byType = Object.fromEntries(
    ACTION_TYPES.map((type) => [type, summarise(timings.filter((t) => t.type === type))]),
  ) as Record<ActionType, Summary>;
  return { overall: summarise(timings), byType };
}
