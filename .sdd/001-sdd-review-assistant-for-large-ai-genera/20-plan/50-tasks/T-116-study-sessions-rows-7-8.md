---
id: C001-T-116
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Comparison study — sessions of participant rows 7 and 8
milestone: C001-M-07
status: todo
depends_on: [C001-T-115]
implements: []
satisfies_ac: [C001-AC-610.1, C001-AC-301.1]
verified_by: [C001-TC-007]
components: [C001-COMP-019, C001-COMP-001]
risk_refs: [C001-RISK-015]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-116 — Comparison study: sessions of participant rows 7 and 8

## Intent
The moderator runs the four sessions of participant rows 7 and 8 of `60-test-plan.md` §6 item 5
(changes C and D), exactly as C001-T-113 states, on the same release candidate. This is the last
session block; after it the seeder may open the sealed lists (C001-T-102). `satisfies_ac` names the
criteria whose value the study measures (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `study/g8/record/row-7/`, `study/g8/record/row-8/` | per session: moderator log, session form, release-candidate version, method, change label |

## Preconditions
- C001-T-115 done; the release candidate is unchanged since C001-T-113.

## Step outline
1. Run the sessions of rows 7 and 8 with the steps of C001-T-113.
2. File the records under the participant rows; tell the seeder that the last session has ended.

## Verification
- `npm run study -- g8-check-record --rows 1,2,3,4,5,6,7,8`

## Done when
- [ ] The four sessions of rows 7 and 8 are recorded, and all 16 sessions pass the record check.
