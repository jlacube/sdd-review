---
id: C001-T-078
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Current verdict per intent, staleness with causes, and decision status
milestone: C001-M-05
status: todo
depends_on: [C001-T-076, C001-T-077, C001-T-061]
implements: [C001-REQ-708, C001-REQ-711, C001-REQ-715, C001-REQ-716, C001-REQ-717, C001-REQ-718]
satisfies_ac: [C001-AC-708.1, C001-AC-711.1, C001-AC-715.1, C001-AC-716.1, C001-AC-717.1, C001-AC-718.1]
verified_by: [C001-TS-724, C001-TS-725, C001-TS-726, C001-TS-730, C001-TS-731, C001-TS-738, C001-TS-739, C001-TS-740, C001-TS-741, C001-TS-751, C001-TS-742, C001-TS-743, C001-TS-744, C001-TS-745, C001-TS-746, C001-TS-747, C001-TS-752, C001-TS-748, C001-TS-749, C001-TS-750]
components: [C001-COMP-013]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-078 — Current verdict per intent, staleness with causes, and decision status

## Intent
Resolve the current verdict of each intent key across the repository's review records (a later
verdict replaces an earlier one); derive staleness when the intent's hunks, its evidence (including
escalations of rules it relied on) or its intent source changed, with every cause; and report the
decision status of the review.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/verdicts/resolve.ts › current verdict per intent key` | across all snapshots of the repository |
| add | `src/core/verdicts/staleness.ts › stale verdicts with causes` | hunks, evidence, intent source |
| add | `src/core/verdicts/status.ts › decision status` | uses C001-T-077 for orphan hunks |
| add | `test/unit/verdicts/staleness.test.ts` | each cause, combined causes, replaced verdicts |

## Preconditions
- C001-T-076, C001-T-077 and C001-T-061 done.

## Step outline
1. Index verdict entries by intent key over all records of the repository.
2. Compare each verdict's basis with the current revision to derive causes.
3. Report status per intent and for the review.

## Verification
- `npm test -- test/unit/verdicts`
- `npm run acceptance -- --scenario C001-TS-724 --scenario C001-TS-725 --scenario C001-TS-726 --scenario C001-TS-730 --scenario C001-TS-731`
- `npm run acceptance -- --scenario C001-TS-738 --scenario C001-TS-739 --scenario C001-TS-740 --scenario C001-TS-741 --scenario C001-TS-751`
- `npm run acceptance -- --scenario C001-TS-742 --scenario C001-TS-743 --scenario C001-TS-744 --scenario C001-TS-745 --scenario C001-TS-746 --scenario C001-TS-747 --scenario C001-TS-752`
- `npm run acceptance -- --scenario C001-TS-748 --scenario C001-TS-749 --scenario C001-TS-750`

## Done when
- [ ] The listed scenarios pass.
