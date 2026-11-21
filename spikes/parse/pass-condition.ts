// Spike C001-T-014: the pass condition of the task, fixed by the plan before the spike runs.
// For every benchmark change, over 5 cold runs: maximum wall-clock time of git reads (G-07, G-09),
// parsing and extraction <= 60 s (50 % of C001-NFR-001), and peak resident memory of the core
// process <= 1 GiB (50 % of C001-NFR-004). Either value above its limit is a miss.

export const TIME_LIMIT_MS = 60_000;
export const MEMORY_LIMIT_BYTES = 1024 * 1024 * 1024;
export const REQUIRED_RUNS = 5;

export interface RunMeasure {
  readonly wallClockMs: number;
  readonly peakResidentBytes: number;
  /** The run ended without an error. A failed run is never a pass. */
  readonly ok: boolean;
}

export interface Verdict {
  readonly runs: number;
  readonly failedRuns: number;
  readonly maxWallClockMs: number;
  readonly maxPeakResidentBytes: number;
  readonly timePass: boolean;
  readonly memoryPass: boolean;
  /** Both limits held on every run, no run failed and at least `requiredRuns` runs were made. */
  readonly pass: boolean;
  /** `pass` without the run-count rule: what the runs measured, whatever their number. */
  readonly withinLimits: boolean;
  readonly enoughRuns: boolean;
  /** Limit minus maximum; negative on a miss. */
  readonly timeMarginMs: number;
  readonly memoryMarginBytes: number;
  /** Margin as a share of the limit, in percent (one decimal). */
  readonly timeMarginPct: number;
  readonly memoryMarginPct: number;
}

export interface Limits {
  readonly timeLimitMs: number;
  readonly memoryLimitBytes: number;
  readonly requiredRuns: number;
}

export const TASK_LIMITS: Limits = {
  timeLimitMs: TIME_LIMIT_MS,
  memoryLimitBytes: MEMORY_LIMIT_BYTES,
  requiredRuns: REQUIRED_RUNS,
};

const pct = (margin: number, limit: number) => Math.round((margin / limit) * 1000) / 10;

/** Evaluates the runs of one benchmark change against the pass condition. */
export function evaluate(runs: readonly RunMeasure[], limits: Limits = TASK_LIMITS): Verdict {
  if (runs.length === 0) throw new Error('no runs to evaluate');
  const maxWallClockMs = Math.max(...runs.map((r) => r.wallClockMs));
  const maxPeakResidentBytes = Math.max(...runs.map((r) => r.peakResidentBytes));
  const failedRuns = runs.filter((r) => !r.ok).length;
  const timePass = maxWallClockMs <= limits.timeLimitMs;
  const memoryPass = maxPeakResidentBytes <= limits.memoryLimitBytes;
  const enoughRuns = runs.length >= limits.requiredRuns;
  const withinLimits = timePass && memoryPass && failedRuns === 0;
  const timeMarginMs = limits.timeLimitMs - maxWallClockMs;
  const memoryMarginBytes = limits.memoryLimitBytes - maxPeakResidentBytes;
  return {
    runs: runs.length,
    failedRuns,
    maxWallClockMs,
    maxPeakResidentBytes,
    timePass,
    memoryPass,
    pass: withinLimits && enoughRuns,
    withinLimits,
    enoughRuns,
    timeMarginMs,
    memoryMarginBytes,
    timeMarginPct: pct(timeMarginMs, limits.timeLimitMs),
    memoryMarginPct: pct(memoryMarginBytes, limits.memoryLimitBytes),
  };
}

/** One word for a verdict: `pass`, `miss`, or `incomplete` (within limits, too few runs). */
export function verdictWord(v: Verdict): 'pass' | 'miss' | 'incomplete' {
  if (v.pass) return 'pass';
  return v.withinLimits ? 'incomplete' : 'miss';
}
