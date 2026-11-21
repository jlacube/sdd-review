---
id: C001-T-033
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Intake summary, snapshot content and the moved-on notice
milestone: C001-M-02
status: in-progress
depends_on: [C001-T-012, C001-T-025]
implements: [C001-REQ-114, C001-REQ-116, C001-REQ-117]
satisfies_ac: [C001-AC-114.1, C001-AC-116.1, C001-AC-117.1]
verified_by: [C001-TS-130, C001-TS-131, C001-TS-132, C001-TS-136, C001-TS-137, C001-TS-139, C001-TS-140, C001-TS-150]
components: [C001-COMP-004, C001-COMP-001, C001-COMP-019]
risk_refs: [C001-RISK-004]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-033 — Intake summary, snapshot content and the moved-on notice

## Intent
Show the intake summary in the CLI and the UI, naming the rule and branch that chose the base
commit and warning whenever the base is HEAD; show every hunk from the snapshot content, not the
current working tree; and notice when the working tree or HEAD moved on after the snapshot
(C001-IF-012 §7 item 5, §8 item 3).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intake/summary.ts › intake summary` | counts, base rule and branch, notices |
| add | `src/core/intake/moved-on.ts › moved-on check` | HEAD and working-tree comparison against the snapshot, cheap enough to run before each action |
| modify | `src/cli/commands/review.ts › print summary` | C001-IF-001 Output |
| add | `web/src/views/IntakeSummary.tsx`, `web/src/components/MovedOnNotice.tsx` | summary and notice in the UI |

## Preconditions
- C001-T-012 and C001-T-025 done.

## Step outline
1. Build the summary from the intake document.
2. Serve all hunk text from stored snapshot content.
3. Implement the moved-on check and expose it in the session view; run it before recorded actions.
4. Show summary and notice in CLI and UI.

## Verification
- `npm run acceptance -- --scenario C001-TS-130 --scenario C001-TS-131 --scenario C001-TS-132`
- `npm run acceptance:browser -- --scenario C001-TS-136 --scenario C001-TS-137`
- `npm run acceptance -- --scenario C001-TS-139 --scenario C001-TS-140 --scenario C001-TS-150`

## Done when
- [ ] All listed scenarios pass.
