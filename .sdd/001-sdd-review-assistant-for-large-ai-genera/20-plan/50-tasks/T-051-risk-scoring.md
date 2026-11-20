---
id: C001-T-051
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Risk score, signal values and intent order
milestone: C001-M-03
status: todo
depends_on: [C001-T-049, C001-T-040]
implements: [C001-REQ-401, C001-REQ-402, C001-REQ-403, C001-REQ-404, C001-REQ-405, C001-NFR-015]
satisfies_ac: [C001-AC-401.1, C001-AC-402.1, C001-AC-403.1, C001-AC-404.1, C001-AC-405.1]
verified_by: [C001-TS-401, C001-TS-402, C001-TS-403, C001-TS-482, C001-TS-404, C001-TS-405, C001-TS-406, C001-TS-407, C001-TS-408, C001-TS-409, C001-TS-410, C001-TS-483, C001-TS-411, C001-TS-412, C001-TS-413, C001-TS-414, C001-TS-415, C001-TS-416, C001-TS-417, C001-TS-418]
components: [C001-COMP-010]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-051 — Risk score, signal values and intent order

## Intent
Give every hunk the risk score of C001-ADR-009 §3 with its signal values (size, guarded area,
novelty, test coverage, dependency change) and the prior weights of the release, computed without a
model and in a fixed arithmetic order, rounded half-to-even to 3 decimals; unknown coverage counts
as none; order the hunks of an intent by clearing state, then descending score, ties by path and
first changed line.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/triage/risk.ts › risk score` | formula, priors, α restricted to 0.5, 0.75, 1 |
| add | `src/core/triage/order.ts › intent order` | C001-REQ-403 with ordered tie-breaks |
| add | `test/unit/triage/risk.property.test.ts` | property tests of monotonicity for C001-REQ-402 (fast-check) |
| add | `test/unit/triage/risk.golden.test.ts` | identical scores on every CI operating system |

## Preconditions
- C001-T-049 and C001-T-040 done.

## Step outline
1. Compute the signal values per hunk; coverage from evidence when present, else none.
2. Compute the score with the fixed order and rounding.
3. Order hunks per intent; recompute when evidence changes the coverage signal.
4. Write property and golden tests.

## Verification
- `npm test -- test/unit/triage`
- `npm run acceptance -- --scenario C001-TS-401 --scenario C001-TS-402 --scenario C001-TS-403 --scenario C001-TS-482 --scenario C001-TS-404 --scenario C001-TS-405`
- `npm run acceptance -- --scenario C001-TS-406 --scenario C001-TS-407 --scenario C001-TS-408 --scenario C001-TS-409 --scenario C001-TS-410 --scenario C001-TS-483`
- `npm run acceptance -- --scenario C001-TS-411 --scenario C001-TS-412 --scenario C001-TS-413 --scenario C001-TS-414 --scenario C001-TS-415 --scenario C001-TS-416 --scenario C001-TS-417 --scenario C001-TS-418`

## Done when
- [ ] Property tests show each signal moves the score in one direction.
- [ ] Scores are bit-identical on the three CI operating systems.
- [ ] The listed scenarios pass once C001-T-055 publishes the triage document (coverage scenarios with C001-T-060).
