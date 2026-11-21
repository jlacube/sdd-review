// Spike C001-T-020 (spike-grade): pure parts of the Python mutation runner (C001-ADR-007 §3
// "Runner"). C001-T-063 replaces it.
import type { RunEnding } from '../../../src/core/evidence/runner/run-command.js';

/**
 * The `-p <plugin>` options of the test command, which each mutant's pytest needs to collect the
 * same tests (for example faker's `-p faker.contrib.pytest.plugin`); `-p no:cacheprovider` is
 * added by the runner itself.
 */
export function pytestPluginArgs(testCommand: string): string[] {
  const words = testCommand.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    let value: string | null = null;
    if (w === '-p' && i + 1 < words.length) value = words[++i]!;
    else if (w.startsWith('-p') && w.length > 2) value = w.slice(2);
    if (value !== null && value.replace(/["']/g, '') !== 'no:cacheprovider') out.push('-p', value);
  }
  return out;
}

/** Outcome of one mutant's process (pytest exit codes 0 to 5). */
export function pytestOutcome(
  ending: RunEnding,
  exitCode: number | null,
): 'killed' | 'survived' | 'timeout' | 'error' {
  if (ending === 'timed-out') return 'timeout';
  if (ending !== 'exited' || exitCode === null) return 'error';
  if (exitCode === 0) return 'survived';
  // 1: tests failed; 2: interrupted, which collection errors of a broken module give.
  if (exitCode === 1 || exitCode === 2) return 'killed';
  return 'error'; // 3 internal error, 4 usage error, 5 no tests collected
}

/** Twice the recorded duration of the mutant's tests plus 10 s. */
export function mutantTimeoutMs(durationsMs: ReadonlyArray<number | undefined>): number {
  const sum = durationsMs.reduce<number>((s, d) => s + (d ?? 0), 0);
  return Math.ceil(2 * sum + 10_000);
}

export interface PlannedMutant {
  readonly path: string;
  readonly site: number;
  readonly line: number;
  readonly desc: string;
  readonly hunkId: string;
  readonly tests: readonly string[];
}

/**
 * The hunks whose results can be recorded after `done` mutants finished: a hunk is recorded once
 * all its mutants and those of every riskier hunk have results (C001-ADR-007 §1 "Risk order").
 * `order` is the hunk order; returns the hunk IDs newly recordable.
 */
export function recordablePrefix(
  order: readonly string[],
  pending: ReadonlyMap<string, number>,
  recorded: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const id of order) {
    if ((pending.get(id) ?? 0) > 0) break;
    if (!recorded.has(id)) out.push(id);
  }
  return out;
}
