import { describe, expect, it } from 'vitest';
import {
  LOW_PRIORITY_NICE,
  lowPriorityPrelude,
  mutationWorkerCount,
} from '../../../../src/core/evidence/runner/priority.js';

// C001-T-019, C001-IF-013 §1 item 4 and C001-ADR-006 §8: one worker fewer than the logical CPU
// cores and at least one; nice 10 (and I/O best-effort 7 on Linux) for mutation processes.

describe('mutation worker count', () => {
  it.each([
    [8, 7],
    [16, 15],
    [2, 1],
    [1, 1],
    [0, 1],
  ])('with %i logical cores gives %i workers', (cores, workers) => {
    expect(mutationWorkerCount(cores)).toBe(workers);
  });

  it('defaults to the cores of this machine', () => {
    expect(mutationWorkerCount()).toBeGreaterThanOrEqual(1);
  });
});

describe('low-priority shell prelude', () => {
  it('raises the nice value by 10 before the command runs on Linux and macOS', () => {
    expect(LOW_PRIORITY_NICE).toBe(10);
    for (const platform of ['linux', 'darwin'] as const) {
      const prelude = lowPriorityPrelude(platform);
      expect(prelude).toContain('exec nice -n 10 /bin/sh -c "$1"');
    }
  });

  it('sets the I/O class best-effort 7 on Linux only', () => {
    expect(lowPriorityPrelude('linux')).toContain('ionice -c 2 -n 7 -p $$');
    expect(lowPriorityPrelude('darwin')).not.toContain('ionice');
  });

  it('runs the command through /bin/sh -c even when nice is missing', () => {
    expect(lowPriorityPrelude('linux')).toMatch(/exec \/bin\/sh -c "\$1"$/);
  });
});
