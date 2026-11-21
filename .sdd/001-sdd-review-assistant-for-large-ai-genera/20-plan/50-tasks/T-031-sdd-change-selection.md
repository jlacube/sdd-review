---
id: C001-T-031
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Selecting the SDD change
milestone: C001-M-02
status: in-progress
depends_on: [C001-T-029]
implements: [C001-REQ-302, C001-REQ-303, C001-REQ-304, C001-REQ-326]
satisfies_ac: [C001-AC-302.1, C001-AC-303.1, C001-AC-304.1, C001-AC-326.1]
verified_by: [C001-TS-303, C001-TS-304, C001-TS-305, C001-TS-306, C001-TS-355]
components: [C001-COMP-005, C001-COMP-001]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-031 — Selecting the SDD change

## Intent
Select the SDD change whose requirements become intents (C001-IF-007 §6): the change the developer
names, refused when it is not open in the snapshot; else the only open change; stop when more than
one open change qualifies.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intent-sources/select-change.ts › select SDD change` | rules of §6; stop codes of `errors.md` |
| modify | `src/cli/main.ts › SDD change option` | option of C001-IF-001 that names the change |
| add | `test/unit/intent-sources/select-change.test.ts` | named open, named not open, one open, several open, none |

## Preconditions
- C001-T-029 done.

## Step outline
1. Determine open changes from the workspace read by C001-T-029.
2. Apply the selection rules; both stops change nothing.
3. Hand the selected change to the intent mapper (C001-T-044).

## Verification
- `npm test -- test/unit/intent-sources/select-change.test.ts`
- `npm run acceptance -- --scenario C001-TS-303 --scenario C001-TS-304 --scenario C001-TS-305 --scenario C001-TS-306 --scenario C001-TS-355`

## Done when
- [ ] All listed scenarios pass (C001-TS-303 once C001-T-044 creates the intents).
