---
id: C001-T-041
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Design-quality findings — cycles, layer bypasses, duplicated logic
milestone: C001-M-03
status: todo
depends_on: [C001-T-040]
implements: [C001-REQ-213, C001-REQ-214, C001-REQ-215]
satisfies_ac: [C001-AC-213.1, C001-AC-214.1, C001-AC-215.1]
verified_by: [C001-TS-228, C001-TS-229, C001-TS-230, C001-TS-231, C001-TS-232, C001-TS-233, C001-TS-234, C001-TS-236]
components: [C001-COMP-008]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-041 — Design-quality findings: cycles, layer bypasses, duplicated logic

## Intent
Report the deterministic design-quality findings of C001-CAP-02: dependency cycles that the change
creates, layer bypasses against the documented layering, and duplicated logic by the rule and
thresholds of C001-IF-005 and the review configuration, each attached to the hunks that cause it so
that triage keeps those hunks open (C001-T-053).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/architecture/cycles.ts › new cycles` | cycles present in the snapshot and absent at the base |
| add | `src/core/architecture/layers.ts › layer bypasses` | from the documented architecture |
| add | `src/core/architecture/duplication.ts › duplicated logic` | structural hashes of C001-T-038; thresholds of C001-IF-005 and C001-IF-004 |
| add | `test/unit/architecture/findings.test.ts` | each finding kind, with and without documented architecture |

## Preconditions
- C001-T-040 done.

## Step outline
1. Detect new cycles on the component and module graphs.
2. Detect layer bypasses where layers are documented.
3. Detect duplicated logic with the configured thresholds.
4. Attach each finding to its causing hunks.

## Verification
- `npm test -- test/unit/architecture`
- `npm run acceptance -- --scenario C001-TS-228 --scenario C001-TS-229 --scenario C001-TS-230 --scenario C001-TS-231`
- `npm run acceptance -- --scenario C001-TS-232 --scenario C001-TS-233 --scenario C001-TS-234 --scenario C001-TS-236`

## Done when
- [ ] All listed scenarios pass once C001-T-042 publishes the document.
- [ ] Each finding names its causing hunks.
