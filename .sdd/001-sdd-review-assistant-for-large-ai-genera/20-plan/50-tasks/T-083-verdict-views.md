---
id: C001-T-083
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Verdicts, orphan decisions and staleness in the review UI
milestone: C001-M-05
status: todo
depends_on: [C001-T-078, C001-T-077, C001-T-075]
implements: [C001-REQ-702, C001-REQ-703, C001-REQ-709, C001-REQ-710, C001-REQ-718]
satisfies_ac: [C001-AC-702.1, C001-AC-703.1, C001-AC-709.1, C001-AC-710.1, C001-AC-718.1]
verified_by: [C001-TS-704, C001-TS-709, C001-TS-728, C001-TS-729, C001-TS-749]
components: [C001-COMP-019, C001-COMP-018]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-083 — Verdicts, orphan decisions and staleness in the review UI

## Intent
Offer sign, reject and defer on one intent at a time, with the open-hunk confirmation showing the
counts, and orphan-code decisions (name an intent, reject a hunk); show every refusal with its
message, the current verdict of each intent and a stale verdict with its causes.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `web/src/components/VerdictPanel.tsx › verdict actions` | one intent; confirmation with counts; reason and note required |
| add | `web/src/components/OrphanDecisions.tsx › orphan decisions` | name intent, reject hunk |
| add | `web/src/components/StaleBadge.tsx › stale causes` | each cause listed |
| modify | `src/ui-server/router.ts › verdict routes` | actions of `openapi.yaml` |

## Preconditions
- C001-T-078, C001-T-077 and C001-T-075 done.

## Step outline
1. Build the verdict panel with the confirmation flow of architecture §3 (Signing flow).
2. Build the orphan decisions with refusals.
3. Show verdicts and staleness in the intent map and intent view.

## Verification
- `npm run lint`
- `npm run acceptance:browser -- --scenario C001-TS-704 --scenario C001-TS-709 --scenario C001-TS-728 --scenario C001-TS-729 --scenario C001-TS-749`

## Done when
- [ ] The listed scenarios pass in Chrome, Edge and Firefox with no CSP violation.
