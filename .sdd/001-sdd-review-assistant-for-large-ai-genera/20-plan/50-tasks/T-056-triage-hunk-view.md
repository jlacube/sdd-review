---
id: C001-T-056
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Hunk view — file context, risk signals, cleared hunks collapsed, moves and labels
milestone: C001-M-03
status: todo
depends_on: [C001-T-055, C001-T-023, C001-T-048]
implements: [C001-REQ-420, C001-REQ-421, C001-REQ-909, C001-REQ-910, C001-REQ-911, C001-NFR-003]
satisfies_ac: [C001-AC-420.1, C001-AC-421.1, C001-AC-909.1, C001-AC-910.1, C001-AC-911.1]
verified_by: [C001-TS-462, C001-TS-463, C001-TS-464, C001-TS-465, C001-TS-466, C001-TS-920, C001-TS-921, C001-TS-922, C001-TS-923, C001-TS-924, C001-TS-925]
components: [C001-COMP-019, C001-COMP-018]
risk_refs: [C001-RISK-010]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-056 — Hunk view: file context, risk signals, cleared hunks collapsed, moves and labels

## Intent
Show each hunk with its file context, intent, risk signals and evidence; list cleared hunks
collapsed with their rules, never hidden, and expandable with their evidence; show moved code as a
move; show the labels of each item. The view uses the virtualised list design that C001-T-023
measured.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `web/src/views/HunkList.tsx › hunk list` | walkthrough order, collapsed cleared hunks with rules and strength |
| add | `web/src/views/HunkDetail.tsx › hunk with file context` | file context from snapshot content, risk signals, intent, evidence placeholder filled by C001-T-068 |
| add | `web/src/components/MoveView.tsx`, `Labels.tsx` | move shown as move; labels per item |
| modify | `src/ui-server/router.ts › hunk routes` | hunk views and reopen action |
| add | `web/src/perf/marks.ts › performance marks` | a performance mark at each input event and after the view it updates has rendered, for every review action of the web client; the signal of C001-NFR-003 that C001-T-094 reads (`78-observability.md`); the spike of C001-T-023 used the same mark names |

## Preconditions
- C001-T-055, C001-T-023 and C001-T-048 done.

## Step outline
1. Serve the hunk list and hunk detail view models from memory (architecture §6, Performance).
2. Build the list with memoised rows and the detail view with file context.
3. Show cleared hunks collapsed with rules; expand with evidence; reopen action.
4. Show moves and labels; time the views against the C001-T-023 budget.

## Verification
- `npm run lint`
- `npm run acceptance:browser -- --scenario C001-TS-462 --scenario C001-TS-463 --scenario C001-TS-464 --scenario C001-TS-465 --scenario C001-TS-466`
- `npm run acceptance:browser -- --scenario C001-TS-920 --scenario C001-TS-921 --scenario C001-TS-922 --scenario C001-TS-923 --scenario C001-TS-924 --scenario C001-TS-925`
- `npm run bench -- spike-ui --views production`

## Done when
- [ ] The listed scenarios pass in Chrome, Edge and Firefox with no CSP violation.
- [ ] The production views stay within the budget recorded at DP-1.
