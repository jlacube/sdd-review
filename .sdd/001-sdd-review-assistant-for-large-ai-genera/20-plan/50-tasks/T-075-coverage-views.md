---
id: C001-T-075
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Shares, samples, defect reports and reading queue in the review UI
milestone: C001-M-05
status: todo
depends_on: [C001-T-074, C001-T-056]
implements: [C001-REQ-603, C001-REQ-608]
satisfies_ac: [C001-AC-603.1, C001-AC-608.1]
verified_by: [C001-TS-608, C001-TS-609, C001-TS-624, C001-TS-625]
components: [C001-COMP-019, C001-COMP-018]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-075 — Shares, samples, defect reports and reading queue in the review UI

## Intent
Show the read, cleared and open shares throughout the review; mark sampled hunks; let the developer
mark hunks read and report a defect on any hunk; show reopened hunks with the defect that reopened
them; and show the reading queue under the attention budget with what does not fit.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `web/src/components/SharesBar.tsx › shares` | visible on every view |
| add | `web/src/components/DefectReportDialog.tsx`, `ReopenedBy.tsx` | report and reopen cause |
| add | `web/src/views/ReadingQueue.tsx › reading queue and budget` | budget form with refusals |
| modify | `src/ui-server/router.ts › coverage routes` | views and actions of `openapi.yaml` |

## Preconditions
- C001-T-074 and C001-T-056 done.

## Step outline
1. Add the shares bar to the shell.
2. Add read marking, sample markers and the defect dialog to the hunk views.
3. Build the reading-queue view with the budget form.

## Verification
- `npm run lint`
- `npm run acceptance:browser -- --scenario C001-TS-608 --scenario C001-TS-609 --scenario C001-TS-624 --scenario C001-TS-625`

## Done when
- [ ] The listed scenarios pass in Chrome, Edge and Firefox with no CSP violation.
