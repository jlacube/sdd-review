---
id: C001-T-085
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Model gateway — model use decision, model-free mode and reduced labels
milestone: C001-M-06
status: in-progress
depends_on: [C001-T-035, C001-T-009]
implements: [C001-REQ-801, C001-REQ-802, C001-REQ-803, C001-REQ-804, C001-REQ-819]
satisfies_ac: [C001-AC-801.1, C001-AC-802.1, C001-AC-803.1, C001-AC-804.1, C001-AC-819.1]
verified_by: [C001-TS-801, C001-TS-802, C001-TS-803, C001-TS-804, C001-TS-805, C001-TS-806, C001-TS-807, C001-TS-808, C001-TS-809, C001-TS-810, C001-TS-811, C001-TS-856, C001-TS-857]
components: [C001-COMP-015]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-085 — Model gateway: model use decision, model-free mode and reduced labels

## Intent
Make the model gateway the single egress to model providers (C001-CON-12): decide model use per
request from the effective configuration (none configured, or configuration unreadable, means
model-free mode), keep repository content on the machine in model-free mode, and label every reduced
result with its cause, so that the full review flow completes without a model.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/model/gateway.ts › ModelGateway` | the port of C001-IF-010 §1; decision per request; no other module opens a network connection |
| add | `src/core/model/labels.ts › reduced labels` | causes of model-free mode |
| add | `eslint.config.js › outbound network rule` | only `src/core/model/` may import outbound network clients; `src/ui-server/` may only listen (C001-CON-12) |
| add | `test/unit/model/gateway.test.ts` | decision table, no request in model-free mode |

## Preconditions
- C001-T-035 and C001-T-009 done.

## Step outline
1. Implement the port and the use decision from the effective configuration.
2. Add the lint rule that keeps network access inside the gateway.
3. Implement reduced labels and attach them to every result a model would have improved.
4. Check with the per-process capture of C001-T-095 later; here, a unit-level spy on sockets.

## Verification
- `npm test -- test/unit/model`
- `npm run lint`
- `npm run acceptance -- --scenario C001-TS-801 --scenario C001-TS-802 --scenario C001-TS-803 --scenario C001-TS-804 --scenario C001-TS-805 --scenario C001-TS-806 --scenario C001-TS-807`
- `npm run acceptance -- --scenario C001-TS-808 --scenario C001-TS-809 --scenario C001-TS-810 --scenario C001-TS-811 --scenario C001-TS-856 --scenario C001-TS-857`

## Done when
- [ ] No module outside `src/core/model/` imports an outbound network client.
- [ ] The listed scenarios pass with network access disabled.
