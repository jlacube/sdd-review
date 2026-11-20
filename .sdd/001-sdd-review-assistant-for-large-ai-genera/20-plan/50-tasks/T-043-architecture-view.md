---
id: C001-T-043
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Architecture view in the review UI
milestone: C001-M-03
status: todo
depends_on: [C001-T-042, C001-T-048, C001-T-055]
implements: [C001-REQ-201, C001-REQ-206, C001-REQ-218, C001-REQ-219, C001-REQ-220, C001-REQ-221]
satisfies_ac: [C001-AC-201.1, C001-AC-206.1, C001-AC-218.1, C001-AC-219.1, C001-AC-220.1, C001-AC-221.1]
verified_by: [C001-TS-202, C001-TS-215, C001-TS-240, C001-TS-241, C001-TS-243, C001-TS-244, C001-TS-245, C001-TS-246, C001-TS-247]
components: [C001-COMP-019, C001-COMP-018]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-043 — Architecture view in the review UI

## Intent
Open the review on the architecture delta: components with their amount of change, added and
removed dependencies with new couplings marked, package changes, drift and design-quality findings
(labelled reduced in model-free mode), and links from a component to its intents and open hunks and
from the delta to the unmet intents.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `web/src/views/ArchitectureDelta.tsx › architecture view` | first view after load; virtualised lists |
| add | `web/src/components/CouplingMarker.tsx`, `FindingsList.tsx` | new couplings, findings with reduced labels |
| modify | `src/ui-server/router.ts › architecture-delta view route` | view of `openapi.yaml` |

## Preconditions
- C001-T-042, C001-T-048 and C001-T-055 done; DP-1 did not return the UI stack to P-01.

## Step outline
1. Serve the architecture-delta view model from the current revision.
2. Build the view with text-only rendering and virtualised lists.
3. Add navigation from a component to its intents and open hunks, and to unmet intents.
4. Label findings as reduced in model-free mode (C001-REQ-219).

## Verification
- `npm run lint`
- `npm run acceptance:browser -- --scenario C001-TS-202 --scenario C001-TS-215 --scenario C001-TS-240 --scenario C001-TS-241 --scenario C001-TS-243`
- `npm run acceptance:browser -- --scenario C001-TS-244 --scenario C001-TS-245 --scenario C001-TS-246 --scenario C001-TS-247`

## Done when
- [ ] The listed scenarios pass in Chrome, Edge and Firefox with no CSP violation.
