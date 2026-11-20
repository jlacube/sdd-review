---
id: C001-T-084
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Navigation between components, intents and hunks, and keyboard operation
milestone: C001-M-05
status: todo
depends_on: [C001-T-083, C001-T-068, C001-T-048]
implements: [C001-REQ-904, C001-REQ-921, C001-REQ-922, C001-NFR-003]
satisfies_ac: [C001-AC-904.1, C001-AC-921.1, C001-AC-922.1]
verified_by: [C001-TS-904, C001-TS-905, C001-TS-906, C001-TS-948, C001-TS-946, C001-TS-947]
components: [C001-COMP-019]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-084 — Navigation between components, intents and hunks, and keyboard operation

## Intent
Complete the review UI: move between components, intents and hunks in both directions; operate the
whole review with the keyboard alone, every action included; list the keyboard commands in the UI.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `web/src/navigation/ › navigation model` | links and history between the views |
| add | `web/src/keyboard/ › keyboard commands` | one command table used for handling and for the listed commands |
| add | `web/src/views/KeyboardHelp.tsx › command list` | C001-REQ-922 |

## Preconditions
- C001-T-083, C001-T-068 and C001-T-048 done.

## Step outline
1. Implement the navigation model across all views.
2. Implement the keyboard command table and focus handling; every action reachable.
3. Generate the command list from the same table.

## Verification
- `npm run lint`
- `npm run acceptance:browser -- --scenario C001-TS-904 --scenario C001-TS-905 --scenario C001-TS-906 --scenario C001-TS-948 --scenario C001-TS-946 --scenario C001-TS-947`

## Done when
- [ ] A scripted review from first view to verdict completes with the keyboard alone in each supported browser.
- [ ] The listed scenarios pass with no CSP violation.
