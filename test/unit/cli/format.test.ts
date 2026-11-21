import { describe, expect, it } from 'vitest';
import { HEAD_BASE_WARNING, intakeSummaryText } from '../../../src/cli/format.js';
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

// C001-T-033: the rule and branch that chose the base commit, the warning whenever the base commit
// is HEAD itself (C001-TS-131), the intent context (C001-TS-130, C001-TS-132) and the test command
// with where it comes from (C001-TS-160).
describe('intakeSummaryText (C001-REQ-114)', () => {
  const head = 'c'.repeat(40);
  const base = (over: Partial<IntakeSummary>): IntakeSummary =>
    ({ ...summary(null), ...over }) as IntakeSummary;

  it('warns on the line after the rule whenever the base commit is HEAD, whatever chose it', () => {
    const named = base({ baseCommit: { hash: head, subject: 'C2' }, baseChoice: 'named' });
    const lines = intakeSummaryText(named, 'HEAD', head).split('\n');
    expect(lines[1]).toBe('Chosen: named HEAD');
    expect(lines[2]).toBe(HEAD_BASE_WARNING);
    const upstream = base({
      baseCommit: { hash: head, subject: 'C2' },
      baseChoice: 'upstream-merge-base',
      baseRef: 'refs/remotes/origin/agent/cart',
    });
    expect(intakeSummaryText(upstream, undefined, head).split('\n')[2]).toBe(HEAD_BASE_WARNING);
  });

  it('holds no warning when the base commit is not HEAD', () => {
    const text = intakeSummaryText(
      base({ baseChoice: 'upstream-merge-base', baseRef: 'refs/remotes/origin/agent/cart' }),
      undefined,
      head,
    );
    expect(text).toContain('Chosen: merge base with upstream origin/agent/cart');
    expect(text).not.toContain(HEAD_BASE_WARNING);
  });

  it('states the intent context with SDD changes, commits and named files by role', () => {
    const text = intakeSummaryText(
      base({
        intentContext: {
          sddChanges: [{ id: 'CHG-042', specItems: 12, selected: true }],
          commits: 2,
          namedFiles: [{ role: 'agent-plan', path: '/x/plan.md' }],
          documentedArchitecture: 'sdd-folder',
        },
      }),
      'B0',
    );
    expect(text).toContain(
      'Intent context: SDD change CHG-042 (12 spec items); 2 commits; agent plan /x/plan.md; documented architecture: sdd-folder',
    );
    expect(
      intakeSummaryText(
        base({
          intentContext: {
            sddChanges: [],
            commits: 0,
            namedFiles: [],
            documentedArchitecture: 'none',
          },
        }),
        'B0',
      ),
    ).toContain(
      'Intent context: no open SDD change; 0 commits; no named file; no documented architecture',
    );
  });

  it('states the test command and where it comes from, or none', () => {
    expect(
      intakeSummaryText(base({ testCommand: { command: 'npx jest', origin: 'developer' } }), 'B0'),
    ).toContain('Test command: npx jest (given with --test-command)');
    expect(
      intakeSummaryText(
        base({ testCommand: { command: 'npm test', origin: 'configuration' } }),
        'B0',
      ),
    ).toContain(
      `Test command: npm test (from the review configuration of base commit ${'b'.repeat(40)})`,
    );
    expect(intakeSummaryText(base({ testCommand: null }), 'B0')).toContain('Test command: none');
  });
});
