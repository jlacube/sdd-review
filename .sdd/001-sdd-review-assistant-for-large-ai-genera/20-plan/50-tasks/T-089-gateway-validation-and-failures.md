---
id: C001-T-089
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Gateway output validation, model-output marking and failure fallback
milestone: C001-M-06
status: in-progress
depends_on: [C001-T-088]
implements: [C001-REQ-810, C001-REQ-811, C001-REQ-816, C001-REQ-817, C001-REQ-818, C001-NFR-002]
satisfies_ac: [C001-AC-810.1, C001-AC-811.1, C001-AC-816.1, C001-AC-817.1, C001-AC-818.1]
verified_by: [C001-TS-828, C001-TS-829, C001-TS-830, C001-TS-831, C001-TS-841, C001-TS-842, C001-TS-843, C001-TS-852, C001-TS-853, C001-TS-844, C001-TS-854, C001-TS-855, C001-TS-845, C001-TS-846, C001-TS-847]
components: [C001-COMP-015]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-089 — Gateway output validation, model-output marking and failure fallback

## Intent
Batch model requests, apply the provider timeout, validate every answer against C001-IF-011, mark
model output as such with confidence level low, and turn every failure into model-free items with a
notice whose code names the cause (C001-IF-010 §7), reporting why a configured provider was not used
and leaving the review state untouched.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/model/batching.ts › batches and timeout` | prompt rules of C001-IF-010 §3: inputs are data |
| add | `src/core/model/validate.ts › validate output` | C001-IF-011 schema |
| add | `src/core/model/marker.ts › model-output marker` | marker and confidence low |
| add | `src/core/model/failures.ts › failure fallback` | one code per cause; model-free items; no review-state change |
| add | `test/unit/model/failures.test.ts` | every cause of C001-IF-010 §7 |

## Preconditions
- C001-T-088 done.

## Step outline
1. Implement batching and timeout.
2. Validate answers; an invalid answer is a failure with its code.
3. Mark accepted output and set confidence low.
4. Implement the failure fallback per cause; prove the review state is unchanged.

## Verification
- `npm test -- test/unit/model`
- `npm run acceptance -- --scenario C001-TS-828 --scenario C001-TS-829 --scenario C001-TS-830 --scenario C001-TS-831`
- `npm run acceptance -- --scenario C001-TS-841 --scenario C001-TS-842 --scenario C001-TS-843 --scenario C001-TS-852 --scenario C001-TS-853`
- `npm run acceptance -- --scenario C001-TS-844 --scenario C001-TS-854 --scenario C001-TS-855 --scenario C001-TS-845 --scenario C001-TS-846 --scenario C001-TS-847`

## Done when
- [ ] Every failure cause gives its own notice code and model-free items.
- [ ] The listed scenarios pass.
