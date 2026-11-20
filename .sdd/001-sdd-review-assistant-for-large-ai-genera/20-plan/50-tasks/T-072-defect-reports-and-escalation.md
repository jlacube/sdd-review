---
id: C001-T-072
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Defect reports, rule escalation and reopening
milestone: C001-M-05
status: todo
depends_on: [C001-T-071]
implements: [C001-REQ-617, C001-REQ-606, C001-REQ-607, C001-REQ-609]
satisfies_ac: [C001-AC-617.1, C001-AC-606.1, C001-AC-607.1, C001-AC-609.1]
verified_by: [C001-TS-648, C001-TS-649, C001-TS-650, C001-TS-617, C001-TS-618, C001-TS-619, C001-TS-620, C001-TS-621, C001-TS-652, C001-TS-622, C001-TS-623, C001-TS-626, C001-TS-627, C001-TS-628]
components: [C001-COMP-012, C001-COMP-014, C001-COMP-002]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-072 — Defect reports, rule escalation and reopening

## Intent
Record a defect report on any hunk with the rules that had cleared it (possibly none); escalate
those rules in the same write and flush; reopen their unread hunks and remove them from the sample
populations while read hunks keep their memberships; stop an escalated rule from clearing; refill
samples of the rules not escalated (architecture §3, Sampling flow).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/review-coverage/defects.ts › record defect report` | rules that had cleared the hunk |
| add | `src/core/review-coverage/escalation.ts › escalate rules` | reopen unread hunks, population and sample updates, INV-16 |
| modify | `src/core/store/record.ts › report and escalation in one write` | single write and flush |
| modify | `src/core/triage/clearing.ts › escalated rules` | an escalated rule clears nothing |
| modify | `src/core/api/index.ts › reportDefect` | recorded action: checks, identity, append, apply |

## Preconditions
- C001-T-071 done.

## Step outline
1. Implement the defect report with the clearing rules of the hunk.
2. Escalate the rules in the same write as the report.
3. Apply the escalation: reopen, update populations and samples, stop clearing.
4. Test crash windows between write and apply (restore completes the escalation, C001-T-080).

## Verification
- `npm test -- test/unit/review-coverage`
- `npm run acceptance -- --scenario C001-TS-648 --scenario C001-TS-649 --scenario C001-TS-650 --scenario C001-TS-617 --scenario C001-TS-618 --scenario C001-TS-619 --scenario C001-TS-620`
- `npm run acceptance -- --scenario C001-TS-621 --scenario C001-TS-652 --scenario C001-TS-622 --scenario C001-TS-623 --scenario C001-TS-626 --scenario C001-TS-627 --scenario C001-TS-628`

## Done when
- [ ] Report and escalation entries are always written together.
- [ ] The listed scenarios pass.
