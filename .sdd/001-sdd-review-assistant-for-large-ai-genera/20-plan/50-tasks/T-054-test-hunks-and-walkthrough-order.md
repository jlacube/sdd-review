---
id: C001-T-054
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Test hunks and the walkthrough order of an intent
milestone: C001-M-03
status: todo
depends_on: [C001-T-036, C001-T-045]
implements: [C001-REQ-501, C001-REQ-502, C001-REQ-322, C001-REQ-323]
satisfies_ac: [C001-AC-501.1, C001-AC-502.1, C001-AC-322.1, C001-AC-323.1]
verified_by: [C001-TS-501, C001-TS-502, C001-TS-503, C001-TS-504, C001-TS-505, C001-TS-344, C001-TS-345, C001-TS-346, C001-TS-347, C001-TS-348]
components: [C001-COMP-010]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-054 — Test hunks and the walkthrough order of an intent

## Intent
Recognise test hunks by the test-file conventions of C001-IF-005 §10 and the configuration, and
order the walkthrough of each intent: its tests before its implementation, then definitions before
uses where language analysis gives them; label walkthroughs that order hunks without definitions
and uses.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/triage/test-hunks.ts › classify test hunks` | §10 conventions per ecosystem, configured patterns |
| add | `src/core/triage/walkthrough.ts › walkthrough order` | tests first, definitions before uses, ordered tie-breaks, label when no definition-use data |
| add | `test/unit/triage/walkthrough.test.ts` | per ecosystem and for files outside them |

## Preconditions
- C001-T-036 and C001-T-045 done.

## Step outline
1. Classify test hunks per ecosystem.
2. Order each intent's hunks: tests, then implementation by definitions and uses.
3. Label walkthroughs that fall back to path order.

## Verification
- `npm test -- test/unit/triage`
- `npm run acceptance -- --scenario C001-TS-501 --scenario C001-TS-502 --scenario C001-TS-503 --scenario C001-TS-504 --scenario C001-TS-505`
- `npm run acceptance -- --scenario C001-TS-344 --scenario C001-TS-345 --scenario C001-TS-346 --scenario C001-TS-347 --scenario C001-TS-348`

## Done when
- [ ] The listed scenarios pass once C001-T-055 publishes the triage document (UI scenarios with C001-T-056).
