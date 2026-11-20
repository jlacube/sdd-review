---
id: C001-T-063
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Python mutation engine
milestone: C001-M-04
status: todo
depends_on: [C001-T-058, C001-T-016]
implements: [C001-REQ-514, C001-REQ-515, C001-REQ-516]
satisfies_ac: [C001-AC-514.1, C001-AC-515.1, C001-AC-516.1]
verified_by: [C001-TS-539, C001-TS-543, C001-TS-580, C001-TS-581, C001-TS-585]
components: [C001-COMP-011]
risk_refs: [C001-RISK-006]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-063 — Python mutation engine

## Intent
Mutate the changed Python lines executed by passing tests with the fixed operator set of
C001-ADR-007 §3, applied at import time in the mutation copy only (no source file written), one
process per mutant running the covering passing tests with the interpreter of the test run, in exact
risk order, after a first unmutated run that is also the self-containment check (ERR-EVID-011).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `runtime/python/sddr_mutate/operators.py › operators` | the operator list of C001-ADR-007 §3 |
| add | `runtime/python/sddr_mutate/apply.py › import-time application` | `SDDR_MUTANT` handling in the hook, no bytecode written |
| add | `src/core/evidence/mutation/python-engine.ts › runner` | mutant enumeration, process pool, timeout rule, killed, survived, timeout, error |
| add | `src/core/evidence/mutation/self-containment.ts › first unmutated run` | load-monitor records up to the first mutant result |
| add | `test/unit/evidence/mutation/python/` | each operator, timeout, self-containment failure |

## Preconditions
- C001-T-058 and C001-T-016 done.
- Effort watch (C001-RISK-006): if the task is in progress for more than 2 days, stop and split it
  into "operators and import-time application" (steps 1–2) and "runner and self-containment check"
  (steps 3–5) with `sdd id next T --change 001`, then continue.

## Step outline
1. Implement operators on the syntax tree with stable mutant IDs.
2. Implement import-time application in the hook.
3. Implement the runner with the pool of C001-ADR-006 §8 and the timeout rule.
4. Implement the first unmutated run; files loaded outside the copy give ERR-EVID-011.
5. Measure mean time per mutant on the Python benchmark change (input to W3 re-run).

## Verification
- `npm run lint:py` (Ruff check and format check over `runtime/python/`, `10-strategy.md` §4)
- `npm test -- test/unit/evidence/mutation/python`
- `npm run acceptance -- --scenario C001-TS-539 --scenario C001-TS-543 --scenario C001-TS-580 --scenario C001-TS-581 --scenario C001-TS-585`
- `npm run bench -- workspace-w3 --ecosystem python`

## Done when
- [ ] No source file of the copy is written during mutation testing.
- [ ] (b) ≤ 60 min on the Python benchmark change.
- [ ] The listed scenarios pass on the three CI operating systems.
