---
id: C001-T-061
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Test judgements and clearing by passing tests
milestone: C001-M-04
status: todo
depends_on: [C001-T-057, C001-T-058, C001-T-059, C001-T-055]
implements: [C001-REQ-410, C001-REQ-411, C001-REQ-503, C001-REQ-504, C001-REQ-520]
satisfies_ac: [C001-AC-410.1, C001-AC-411.1, C001-AC-503.1, C001-AC-504.1, C001-AC-520.1]
verified_by: [C001-TS-435, C001-TS-436, C001-TS-437, C001-TS-438, C001-TS-439, C001-TS-440, C001-TS-441, C001-TS-442, C001-TS-484, C001-TS-485, C001-TS-506, C001-TS-507, C001-TS-508, C001-TS-509, C001-TS-510, C001-TS-511, C001-TS-556, C001-TS-557]
components: [C001-COMP-010]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-061 — Test judgements and clearing by passing tests

## Intent
Record the developer's judgement of an intent's tests as a recorded action (refused on an intent
without test hunks), decide from the judgements which tests qualify, clear a hunk whose executable
lines are all executed by qualifying passing tests and by no failing test, under the guard, with an
evidence record; and reopen a test-cleared hunk that loses its evidence.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/triage/test-judgements.ts › record judgement, qualifying tests` | C001-REQ-503, C001-REQ-504, C001-REQ-520 |
| add | `src/core/triage/rules/passing-tests.ts › passing-tests rule` | the fifth clearing rule, through the guard |
| add | `src/core/triage/reopen-on-loss.ts › reopen on lost evidence` | new run, judgement change, surviving mutant (with C001-T-064) |
| modify | `src/core/api/index.ts › judgeTests` | recorded action: checks, identity, append, apply |
| add | `test/unit/triage/passing-tests.test.ts` | orphan tests, failing tests, partial coverage, working-tree execution |

## Preconditions
- C001-T-057, C001-T-058, C001-T-059 and C001-T-055 done.

## Step outline
1. Implement the judgement action and its refusal.
2. Compute qualifying tests from the judgements in effect.
3. Implement the rule and evidence records; working-tree execution never counts (ERR-EVID-008).
4. Reopen hunks whose evidence is lost on each new event; save as a revision.

## Verification
- `npm test -- test/unit/triage`
- `npm run acceptance -- --scenario C001-TS-435 --scenario C001-TS-436 --scenario C001-TS-437 --scenario C001-TS-438 --scenario C001-TS-439 --scenario C001-TS-440 --scenario C001-TS-441`
- `npm run acceptance -- --scenario C001-TS-442 --scenario C001-TS-484 --scenario C001-TS-485`
- `npm run acceptance -- --scenario C001-TS-506 --scenario C001-TS-507 --scenario C001-TS-508 --scenario C001-TS-509 --scenario C001-TS-510 --scenario C001-TS-511 --scenario C001-TS-556 --scenario C001-TS-557`

## Done when
- [ ] The listed scenarios pass in each deep ecosystem.
- [ ] No hunk in a guarded area is ever cleared by this rule.
