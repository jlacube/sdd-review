---
id: C001-T-047
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Hunk moves and developer-named intents as recorded actions
milestone: C001-M-03
status: todo
depends_on: [C001-T-045, C001-T-007]
implements: [C001-REQ-320, C001-REQ-321, C001-REQ-709, C001-REQ-719]
satisfies_ac: [C001-AC-320.1, C001-AC-321.1, C001-AC-709.1, C001-AC-719.1]
verified_by: [C001-TS-340, C001-TS-341, C001-TS-342, C001-TS-343, C001-TS-727, C001-TS-728, C001-TS-753, C001-TS-754, C001-TS-755]
components: [C001-COMP-009, C001-COMP-002, C001-COMP-014]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-047 — Hunk moves and developer-named intents as recorded actions

## Intent
Let the developer move a hunk to another intent and name a new intent for orphan code (refusing a
blank or taken name and hunks not in orphan code). Both are recorded actions of C001-IF-003 §4:
checked, appended to the review record with the git user and flushed before confirmation, then
applied to the intent map in the next revision.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intent-map/moves.ts › apply hunk move` | move rules; grouping invariant kept |
| add | `src/core/intent-map/named-intents.ts › name intent` | blank or taken name refused; only orphan hunks |
| modify | `src/core/api/index.ts › moveHunk, nameIntent` | checks, identity, record append, apply, confirm |
| add | `test/unit/intent-map/moves.test.ts` | moves, refusals, replay from the record |

## Preconditions
- C001-T-045 and C001-T-007 done; identity check of C001-T-009 available.

## Step outline
1. Implement the validation of both actions with their refusal codes.
2. Append the entry under the record lock before confirming (C001-REQ-920).
3. Apply the entry to the intent map; replaying the record gives the same map.

## Verification
- `npm test -- test/unit/intent-map`
- `npm run acceptance -- --scenario C001-TS-340 --scenario C001-TS-341 --scenario C001-TS-342 --scenario C001-TS-343`
- `npm run acceptance -- --scenario C001-TS-727 --scenario C001-TS-728 --scenario C001-TS-753 --scenario C001-TS-754 --scenario C001-TS-755`

## Done when
- [ ] All listed scenarios pass through the core API and the CLI or HTTP API.
- [ ] Replaying the record entries reproduces the moved and named state.
