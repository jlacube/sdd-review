---
id: C001-T-039
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Architecture delta — components, placement and amount of change
milestone: C001-M-03
status: todo
depends_on: [C001-T-037, C001-T-029]
implements: [C001-REQ-202, C001-REQ-203, C001-REQ-207, C001-REQ-209, C001-REQ-210, C001-REQ-212, C001-REQ-223]
satisfies_ac: [C001-AC-202.1, C001-AC-203.1, C001-AC-207.1, C001-AC-209.1, C001-AC-210.1, C001-AC-212.1, C001-AC-223.1]
verified_by: [C001-TS-204, C001-TS-205, C001-TS-206, C001-TS-207, C001-TS-208, C001-TS-209, C001-TS-216, C001-TS-217, C001-TS-221, C001-TS-222, C001-TS-223, C001-TS-226, C001-TS-257]
components: [C001-COMP-008]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-039 — Architecture delta: components, placement and amount of change

## Intent
Place every changed file in exactly one component: a documented component (C001-T-029), a component
derived from the structure of each deep ecosystem when no architecture is documented, or
"Undocumented"; flag files outside the documented components as drift; and count the change per
component.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/architecture/components.ts › documented and derived components` | documented paths; derivation rules per ecosystem (C001-TS-223) |
| add | `src/core/architecture/placement.ts › place files, count change` | one component per file, counts of files, hunks and lines |
| add | `src/core/architecture/drift.ts › outside-component drift` | C001-REQ-209 |
| add | `test/unit/architecture/placement.test.ts` | documented, derived, mixed, reduced files |

## Preconditions
- C001-T-037 and C001-T-029 done.

## Step outline
1. Build the component list from the documented architecture, else derive it.
2. Place each changed file; files outside the deep ecosystems are placed with a reduced result.
3. Count change per component; flag files outside documented components.

## Verification
- `npm test -- test/unit/architecture`
- `npm run acceptance -- --scenario C001-TS-204 --scenario C001-TS-205 --scenario C001-TS-206 --scenario C001-TS-207 --scenario C001-TS-208 --scenario C001-TS-209`
- `npm run acceptance -- --scenario C001-TS-216 --scenario C001-TS-217 --scenario C001-TS-221 --scenario C001-TS-222 --scenario C001-TS-223 --scenario C001-TS-226 --scenario C001-TS-257`

## Done when
- [ ] Every changed file of every fixture is placed in exactly one component.
- [ ] All listed scenarios pass in the headless output once C001-T-042 publishes the document; until then the unit tests assert the same expectations.
