import { describe, expect, it } from 'vitest';
import { intakeSummaryText } from '../../../src/cli/format.js';
import type { IntakeSummary } from '../../../src/generated/analysis-results.js';

// C001-T-026: the size warning is printed with the intake summary (C001-REQ-121, C001-IF-001
// Output) by `review` and `analyse`.

const summary = (sizeWarning: IntakeSummary['sizeWarning']): IntakeSummary =>
  ({
    baseCommit: { hash: 'b'.repeat(40), subject: 'B0: base' },
    baseChoice: 'named',
    changedFiles: 340,
    changedLines: 12_500,
    intentContext: {
      sddChanges: [],
      commits: 0,
      namedFiles: [],
      documentedArchitecture: false,
    },
    sizeWarning,
  }) as unknown as IntakeSummary;

describe('intakeSummaryText', () => {
  it('prints the size warning with its code after the counts', () => {
    const message =
      'This change has 12,500 changed lines in 340 files; the supported size is 10,000 changed lines and 300 files. Results and response times may fall outside the stated limits.';
    const lines = intakeSummaryText(summary({ code: 'ERR-INTAKE-006', message }), 'B0').split('\n');
    const counts = lines.findIndex((l) => l.startsWith('Changed files: 340; changed lines: 12500'));
    const warning = lines.indexOf(`ERR-INTAKE-006: ${message}`);
    expect(counts).toBeGreaterThanOrEqual(0);
    expect(warning).toBeGreaterThan(counts);
  });

  it('prints no warning at or below the supported size', () => {
    expect(intakeSummaryText(summary(null), 'B0')).not.toContain('ERR-INTAKE-006');
  });
});
