---
id: C001-T-044
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Intent mapper — intents from requirements, commits and plan items
milestone: C001-M-03
status: todo
depends_on: [C001-T-031, C001-T-032, C001-T-027]
implements: [C001-REQ-302, C001-REQ-305, C001-REQ-313, C001-REQ-314]
satisfies_ac: [C001-AC-302.1, C001-AC-305.1, C001-AC-313.1, C001-AC-314.1]
verified_by: [C001-TS-303, C001-TS-307, C001-TS-308, C001-TS-327, C001-TS-328, C001-TS-329, C001-TS-330, C001-TS-331]
components: [C001-COMP-009]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-044 — Intent mapper: intents from requirements, commits and plan items

## Intent
Create the deterministic intents of a review: one per requirement of the selected SDD change; in
model-free mode without an SDD change, one extracted intent per commit and one per plan item; each
with its intent source, so that every intent shows where it came from (C001-REQ-317).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intent-map/intents.ts › create intents` | intent keys per `40-domain/domain-model.md` §3, sources, order |
| add | `test/unit/intent-map/intents.test.ts` | SDD change, commits only, plan items, both |

## Preconditions
- C001-T-031, C001-T-032 and C001-T-027 done.

## Step outline
1. Create one intent per requirement of the selected change.
2. Without an SDD change, extract one intent per commit and per plan item (model-free rules).
3. Record each intent's source with its lines.

## Verification
- `npm test -- test/unit/intent-map`
- `npm run acceptance -- --scenario C001-TS-303 --scenario C001-TS-307 --scenario C001-TS-308`
- `npm run acceptance -- --scenario C001-TS-327 --scenario C001-TS-328 --scenario C001-TS-329 --scenario C001-TS-330 --scenario C001-TS-331`

## Done when
- [ ] All listed scenarios pass in the headless output.
- [ ] Intent keys are stable across analyses of the same snapshot.
