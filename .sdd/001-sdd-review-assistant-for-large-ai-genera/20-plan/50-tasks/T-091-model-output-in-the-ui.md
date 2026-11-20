---
id: C001-T-091
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Cloud banner and model output in the review UI
milestone: C001-M-06
status: todo
depends_on: [C001-T-090, C001-T-043, C001-T-048]
implements: [C001-REQ-807, C001-REQ-812, C001-REQ-810]
satisfies_ac: [C001-AC-807.1, C001-AC-812.1, C001-AC-810.1]
verified_by: [C001-TS-819, C001-TS-820, C001-TS-821, C001-TS-833, C001-TS-828]
components: [C001-COMP-019, C001-COMP-018]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-091 — Cloud banner and model output in the review UI

## Intent
Show a banner while a cloud provider is in use, show model output marked as such with its low
confidence, always after the deterministic results, and render model output as text only
(C001-CON-20).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `web/src/components/CloudBanner.tsx › cloud banner` | from the cloud-use state of C001-T-088 |
| add | `web/src/components/ModelOutputMark.tsx › model output mark` | marker and confidence |
| modify | `web/src/views/IntentMap.tsx`, `ArchitectureDelta.tsx › model items after deterministic items` | ordering and marks |

## Preconditions
- C001-T-090, C001-T-043 and C001-T-048 done.

## Step outline
1. Add the banner bound to the session's cloud-use state.
2. Mark model items and keep them after deterministic items in every view.
3. Test hostile model output for text-only rendering.

## Verification
- `npm run lint`
- `npm run acceptance:browser -- --scenario C001-TS-819 --scenario C001-TS-820 --scenario C001-TS-821 --scenario C001-TS-833 --scenario C001-TS-828`

## Done when
- [ ] The listed scenarios pass in Chrome, Edge and Firefox with no CSP violation.
- [ ] Model output holding HTML or script text is shown as text.
