---
id: C001-T-046
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Spec-edit flags and the deterministic account of each intent
milestone: C001-M-03
status: todo
depends_on: [C001-T-045, C001-T-029]
implements: [C001-REQ-328, C001-REQ-324]
satisfies_ac: [C001-AC-328.1, C001-AC-324.1]
verified_by: [C001-TS-360, C001-TS-361, C001-TS-362, C001-TS-350]
components: [C001-COMP-009]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-046 — Spec-edit flags and the deterministic account of each intent

## Intent
Flag the spec items that the change edits, from the lines each item is read from on both sides
(C001-T-029), so that a reviewer sees when the agent changed the requirement it implements; and
write the deterministic account that opens each intent's walkthrough.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intent-map/spec-edits.ts › spec-edit flags` | compare lines read at the base and in the snapshot |
| add | `src/core/intent-map/accounts.ts › deterministic account` | template of C001-REQ-324 from intent data only |
| modify | `src/core/intent-map/document.ts › flags and accounts` | added to the intent-map document |

## Preconditions
- C001-T-045 and C001-T-029 done.

## Step outline
1. Compare the source lines of each spec item on both sides and flag edits.
2. Generate the deterministic account per intent.
3. Add both to the document.

## Verification
- `npm test -- test/unit/intent-map`
- `npm run acceptance -- --scenario C001-TS-360 --scenario C001-TS-361 --scenario C001-TS-362 --scenario C001-TS-350`

## Done when
- [ ] All listed scenarios pass.
