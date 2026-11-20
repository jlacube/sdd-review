---
id: C001-T-074
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Coverage statement with covered and uncovered risk and sample results
milestone: C001-M-05
status: todo
depends_on: [C001-T-072, C001-T-073]
implements: [C001-REQ-613, C001-REQ-614]
satisfies_ac: [C001-AC-613.1, C001-AC-614.1]
verified_by: [C001-TS-635, C001-TS-636, C001-TS-637, C001-TS-638]
components: [C001-COMP-012]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-074 — Coverage statement with covered and uncovered risk and sample results

## Intent
Produce the coverage statement that a verdict carries: covered and uncovered risk as sums and shares
of scores (size-weighted hazard, C001-ADR-009 §3), and each rule's sample results (sampled, read,
defects found, escalated), derived from the review record and the current revision.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/review-coverage/statement.ts › coverage statement` | per scope; sample results per rule |
| add | `test/unit/review-coverage/statement.test.ts` | covered and uncovered risk, escalated rules |

## Preconditions
- C001-T-072 and C001-T-073 done.

## Step outline
1. Compute covered and uncovered risk from hunk states and scores.
2. Compute sample results per rule from the record.
3. Expose the statement in views, headless output and verdict entries (C001-T-076).

## Verification
- `npm test -- test/unit/review-coverage`
- `npm run acceptance -- --scenario C001-TS-635 --scenario C001-TS-636 --scenario C001-TS-637 --scenario C001-TS-638`

## Done when
- [ ] The listed scenarios pass.
