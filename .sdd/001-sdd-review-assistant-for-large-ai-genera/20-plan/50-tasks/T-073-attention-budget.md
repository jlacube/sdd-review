---
id: C001-T-073
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Attention budget and the reading queue
milestone: C001-M-05
status: todo
depends_on: [C001-T-070, C001-T-051]
implements: [C001-REQ-610, C001-REQ-611, C001-REQ-612, C001-REQ-615]
satisfies_ac: [C001-AC-610.1, C001-AC-611.1, C001-AC-612.1, C001-AC-615.1]
verified_by: [C001-TS-629, C001-TS-630, C001-TS-631, C001-TS-632, C001-TS-633, C001-TS-634, C001-TS-645, C001-TS-646, C001-TS-647]
components: [C001-COMP-012]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-073 — Attention budget and the reading queue

## Intent
Validate the developer's time budget and reading rate (refusing values that are not positive), set
them as a recorded action, estimate reading time per hunk from the rate, order the reading queue by
risk per reading minute (C001-ADR-009 §3, score × rate / (60 × L)), and report what fits in the
budget and what does not.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/review-coverage/budget.ts › validate and set budget` | refusal codes of `errors.md` |
| add | `src/core/review-coverage/queue.ts › reading queue` | risk per reading minute, ordered tie-breaks, fits and does-not-fit lists |
| modify | `src/core/api/index.ts › setAttentionBudget` | recorded action |

## Preconditions
- C001-T-070 and C001-T-051 done.

## Step outline
1. Validate and record budget and rate.
2. Estimate reading time per hunk; compute risk per minute.
3. Build the queue and the fit report.

## Verification
- `npm test -- test/unit/review-coverage`
- `npm run acceptance -- --scenario C001-TS-629 --scenario C001-TS-630 --scenario C001-TS-631 --scenario C001-TS-632 --scenario C001-TS-633 --scenario C001-TS-634`
- `npm run acceptance -- --scenario C001-TS-645 --scenario C001-TS-646 --scenario C001-TS-647`

## Done when
- [ ] The listed scenarios pass.
