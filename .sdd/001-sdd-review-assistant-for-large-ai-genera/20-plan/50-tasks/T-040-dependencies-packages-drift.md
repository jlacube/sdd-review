---
id: C001-T-040
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Architecture delta — dependencies, packages and drift
milestone: C001-M-03
status: todo
depends_on: [C001-T-039, C001-T-038]
implements: [C001-REQ-204, C001-REQ-205, C001-REQ-208, C001-REQ-222, C001-REQ-224]
satisfies_ac: [C001-AC-204.1, C001-AC-205.1, C001-AC-208.1, C001-AC-222.1, C001-AC-224.1]
verified_by: [C001-TS-210, C001-TS-212, C001-TS-214, C001-TS-218, C001-TS-219, C001-TS-220, C001-TS-251, C001-TS-252, C001-TS-253, C001-TS-254, C001-TS-255, C001-TS-259]
components: [C001-COMP-008]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-040 — Architecture delta: dependencies, packages and drift

## Intent
List the dependencies between components that the change adds or removes and the external
packages it adds, removes or re-versions (labelling those of an unparsable manifest as not
analysed); flag disallowed dependencies and edits of the documented architecture as drift, using
the lines the documented architecture is read from on both sides (C001-IF-007 §4).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/architecture/dependencies.ts › component dependency delta` | from resolved imports on both sides; new couplings marked |
| add | `src/core/architecture/packages.ts › package changes` | from manifests on both sides; not-analysed label (C001-REQ-224) |
| modify | `src/core/architecture/drift.ts › disallowed dependency, architecture edit` | C001-REQ-208, C001-REQ-222 |
| add | `test/unit/architecture/dependencies.test.ts`, `drift.test.ts` | per ecosystem |

## Preconditions
- C001-T-039 and C001-T-038 done.

## Step outline
1. Compute component-level dependency sets on both sides and their difference.
2. Compute package changes from manifests; label unparsable manifests.
3. Check added dependencies against the documented allowed dependencies; flag drift.
4. Flag edits of the lines the documented architecture is read from.

## Verification
- `npm test -- test/unit/architecture`
- `npm run acceptance -- --scenario C001-TS-210 --scenario C001-TS-212 --scenario C001-TS-214 --scenario C001-TS-218 --scenario C001-TS-219 --scenario C001-TS-220`
- `npm run acceptance -- --scenario C001-TS-251 --scenario C001-TS-252 --scenario C001-TS-253 --scenario C001-TS-254 --scenario C001-TS-255 --scenario C001-TS-259`

## Done when
- [ ] All listed scenarios pass once C001-T-042 publishes the document.
