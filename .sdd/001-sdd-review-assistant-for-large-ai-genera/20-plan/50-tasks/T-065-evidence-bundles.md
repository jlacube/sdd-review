---
id: C001-T-065
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Evidence bundles — keep, confirm, run and compare
milestone: C001-M-04
status: todo
depends_on: [C001-T-060, C001-T-032]
implements: [C001-REQ-510, C001-REQ-511, C001-REQ-512, C001-REQ-513, C001-NFR-018]
satisfies_ac: [C001-AC-510.1, C001-AC-511.1, C001-AC-512.1, C001-AC-513.1]
verified_by: [C001-TS-526, C001-TS-527, C001-TS-528, C001-TS-529, C001-TS-530, C001-TS-531, C001-TS-555, C001-TS-532, C001-TS-533, C001-TS-534, C001-TS-535, C001-TS-554, C001-TS-582, C001-TS-583, C001-TS-536, C001-TS-538]
components: [C001-COMP-011, C001-COMP-002]
risk_refs: [C001-RISK-001]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-065 — Evidence bundles: keep, confirm, run and compare

## Intent
Keep an evidence bundle for each intent from recorded runs and developer-added commands
(C001-IF-013 §6); run a proposed command only after the developer confirms it (C001-CON-20); run a
bundle in the test run's workspace and record the real outputs; and compute what changed since the
reference run. Adding and confirming bundle commands are recorded actions.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/evidence/bundles.ts › bundle per intent` | commands from recorded runs (C001-T-032) and from the developer |
| modify | `src/core/api/index.ts › addBundleCommand, confirmBundleCommand, runBundle` | recorded actions and the run operation |
| add | `src/core/evidence/bundle-run.ts › bundle run` | reset, check, observer window, shell, output capture, revision save; within (c) |
| add | `src/core/evidence/bundle-diff.ts › changes since the reference run` | output comparison |

## Preconditions
- C001-T-060 and C001-T-032 done.

## Step outline
1. Build bundles from recorded runs; developer-added commands as recorded actions.
2. Refuse to run an unconfirmed command; confirmation is a recorded action.
3. Run a bundle in the free test-run workspace, one command after another, each result a revision.
4. Compute the comparison with the reference run.

## Verification
- `npm run acceptance -- --scenario C001-TS-526 --scenario C001-TS-527 --scenario C001-TS-528 --scenario C001-TS-529 --scenario C001-TS-530 --scenario C001-TS-531 --scenario C001-TS-555`
- `npm run acceptance -- --scenario C001-TS-532 --scenario C001-TS-533 --scenario C001-TS-534 --scenario C001-TS-535 --scenario C001-TS-554 --scenario C001-TS-582 --scenario C001-TS-583`
- `npm run acceptance -- --scenario C001-TS-536 --scenario C001-TS-538`

## Done when
- [ ] No proposed command runs before confirmation.
- [ ] The listed scenarios pass on the three CI operating systems.
