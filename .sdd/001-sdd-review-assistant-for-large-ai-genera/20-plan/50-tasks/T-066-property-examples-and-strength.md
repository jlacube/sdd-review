---
id: C001-T-066
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Property-test counter-examples and evidence strength
milestone: C001-M-04
status: todo
depends_on: [C001-T-060]
implements: [C001-REQ-517, C001-REQ-518]
satisfies_ac: [C001-AC-517.1, C001-AC-518.1]
verified_by: [C001-TS-547, C001-TS-548, C001-TS-549, C001-TS-550, C001-TS-551]
components: [C001-COMP-011]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-066 — Property-test counter-examples and evidence strength

## Intent
Read property-test counter-examples from the failure messages that the adapters record (Hypothesis,
fast-check, FsCheck, CsCheck output formats of C001-ADR-007 §4) and attach them to the hunks whose
lines the failing test executed; rank the strength of every evidence item by C001-IF-013 §7.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/evidence/counter-examples.ts › parse counter-examples` | one parser per library output, fixed by tests against current output |
| add | `src/core/evidence/strength.ts › evidence strength` | ranking of C001-IF-013 §7 |
| add | `test/unit/evidence/counter-examples/` | recorded outputs of each library |

## Preconditions
- C001-T-060 done.

## Step outline
1. Record current output samples of each library in fixtures.
2. Implement the parsers without depending on the libraries.
3. Attach counter-examples to hunks; rank every evidence item.

## Verification
- `npm test -- test/unit/evidence/counter-examples`
- `npm run acceptance -- --scenario C001-TS-547 --scenario C001-TS-548 --scenario C001-TS-549 --scenario C001-TS-550 --scenario C001-TS-551`

## Done when
- [ ] The listed scenarios pass.
