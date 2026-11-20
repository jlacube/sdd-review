---
id: C001-T-071
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Random samples of each rule's cleared hunks, stable under population change
milestone: C001-M-05
status: todo
depends_on: [C001-T-070]
implements: [C001-REQ-604, C001-REQ-616]
satisfies_ac: [C001-AC-604.1, C001-AC-616.1]
verified_by: [C001-TS-610, C001-TS-611, C001-TS-612, C001-TS-613, C001-TS-614, C001-TS-639, C001-TS-640, C001-TS-641, C001-TS-642, C001-TS-643, C001-TS-644, C001-TS-651, C001-TS-653]
components: [C001-COMP-012]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-071 — Random samples of each rule's cleared hunks, stable under population change

## Intent
Keep, per clearing rule, its sample population and a random sample for reading drawn with the
review's sample seed (C001-CON-17); keep the sample stable when the population changes, refill a
rule that is not escalated up to its target, and take no new hunk into the sample of an escalated
rule, even below its target (C001-INV-16). Samples are saved with every revision.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/review-coverage/sampling.ts › sample per rule` | population, target, seeded draw, stable update, refill rule |
| modify | `src/core/triage/document.ts › RuleStatus` | populations and samples in the triage document |
| add | `test/unit/review-coverage/sampling.property.test.ts` | stability and INV-16 as properties |

## Preconditions
- C001-T-070 done.

## Step outline
1. Store the sample seed in `review.json` at review creation.
2. Draw and update samples as populations change with each event.
3. Encode INV-16 for escalated rules (escalation itself in C001-T-072).
4. Save samples with every revision; restore gives the samples the developer saw.

## Verification
- `npm test -- test/unit/review-coverage`
- `npm run acceptance -- --scenario C001-TS-610 --scenario C001-TS-611 --scenario C001-TS-612 --scenario C001-TS-613 --scenario C001-TS-614 --scenario C001-TS-639`
- `npm run acceptance -- --scenario C001-TS-640 --scenario C001-TS-641 --scenario C001-TS-642 --scenario C001-TS-643 --scenario C001-TS-644 --scenario C001-TS-651 --scenario C001-TS-653`

## Done when
- [ ] Property tests hold for stability and INV-16.
- [ ] The listed scenarios pass.
