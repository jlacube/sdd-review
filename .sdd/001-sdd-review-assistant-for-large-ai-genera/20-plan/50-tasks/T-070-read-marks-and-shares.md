---
id: C001-T-070
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Read marks and the read, cleared and open shares
milestone: C001-M-05
status: todo
depends_on: [C001-T-055]
implements: [C001-REQ-601, C001-REQ-602, C001-REQ-605]
satisfies_ac: [C001-AC-601.1, C001-AC-602.1, C001-AC-605.1]
verified_by: [C001-TS-601, C001-TS-602, C001-TS-603, C001-TS-604, C001-TS-605, C001-TS-606, C001-TS-607, C001-TS-615, C001-TS-616]
components: [C001-COMP-012, C001-COMP-002]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-070 — Read marks and the read, cleared and open shares

## Intent
Let the developer mark hunks as read (a recorded action), and compute the read, cleared and open
shares of changed lines per scope (change, component, intent), counting unread hunks of a sample as
open. Shares are derived values, never saved on their own (architecture §4.2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/review-coverage/read-marks.ts › apply read mark` | hunk state transition, record entry |
| add | `src/core/review-coverage/shares.ts › shares per scope` | from hunk states, samples and read marks |
| modify | `src/core/api/index.ts › markRead` | recorded action: checks, identity, append, apply |
| add | `test/unit/review-coverage/shares.test.ts` | each scope, sampled unread hunks |

## Preconditions
- C001-T-055 done.

## Step outline
1. Implement the read-mark action.
2. Implement share computation per scope; sampled unread hunks count as open.
3. Include shares in the session view and the headless output.

## Verification
- `npm test -- test/unit/review-coverage`
- `npm run acceptance -- --scenario C001-TS-601 --scenario C001-TS-602 --scenario C001-TS-603 --scenario C001-TS-604`
- `npm run acceptance -- --scenario C001-TS-605 --scenario C001-TS-606 --scenario C001-TS-607 --scenario C001-TS-615 --scenario C001-TS-616`

## Done when
- [ ] The listed scenarios pass (sample scenarios once C001-T-071 is done).
