---
id: C001-T-048
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Intent map view in the review UI
milestone: C001-M-03
status: todo
depends_on: [C001-T-046, C001-T-047, C001-T-012]
implements: [C001-REQ-310, C001-REQ-312, C001-REQ-316, C001-REQ-317, C001-REQ-318, C001-REQ-319, C001-REQ-328]
satisfies_ac: [C001-AC-310.1, C001-AC-312.1, C001-AC-316.1, C001-AC-317.1, C001-AC-318.1, C001-AC-319.1]
verified_by: [C001-TS-321, C001-TS-325, C001-TS-326, C001-TS-334, C001-TS-335, C001-TS-336, C001-TS-337, C001-TS-338, C001-TS-339, C001-TS-360]
components: [C001-COMP-019, C001-COMP-018]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-048 — Intent map view in the review UI

## Intent
Show the intent map: orphan code first, unmet intents after it, then the intents with their source,
spec-edit flags, hunks (with evidence where it exists), and the confidence and reason of every link;
label the map as reduced in model-free mode with its cause; offer hunk moves and naming of new
intents with confirmation and refusal messages.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `web/src/views/IntentMap.tsx › intent map view` | order of C001-REQ-310 and C001-REQ-312, virtualised |
| add | `web/src/components/IntentSource.tsx`, `LinkReason.tsx`, `ReducedLabel.tsx` | source, confidence and reason, reduced label |
| add | `web/src/components/MoveHunkDialog.tsx`, `NameIntentDialog.tsx` | actions with refusal messages |
| modify | `src/ui-server/router.ts › intent-map routes` | views and actions of `openapi.yaml` |

## Preconditions
- C001-T-046, C001-T-047 and C001-T-012 done.

## Step outline
1. Serve the intent-map view model.
2. Build the view in the required order with sources, flags and link reasons.
3. Add the move and naming dialogs; show every refusal with its message.
4. Label the reduced map with each cause of model-free mode.

## Verification
- `npm run lint`
- `npm run acceptance:browser -- --scenario C001-TS-321 --scenario C001-TS-325 --scenario C001-TS-326 --scenario C001-TS-334 --scenario C001-TS-335`
- `npm run acceptance:browser -- --scenario C001-TS-336 --scenario C001-TS-337 --scenario C001-TS-338 --scenario C001-TS-339 --scenario C001-TS-360`

## Done when
- [ ] The listed scenarios pass in Chrome, Edge and Firefox with no CSP violation.
