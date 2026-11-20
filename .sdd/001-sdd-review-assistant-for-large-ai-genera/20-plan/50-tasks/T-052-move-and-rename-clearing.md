---
id: C001-T-052
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Clearing rules — pure moves and pure renames
milestone: C001-M-03
status: todo
depends_on: [C001-T-038, C001-T-008, C001-T-049]
implements: [C001-REQ-406, C001-REQ-407]
satisfies_ac: [C001-AC-406.1, C001-AC-407.1]
verified_by: [C001-TS-419, C001-TS-420, C001-TS-421, C001-TS-422, C001-TS-423, C001-TS-424, C001-TS-425, C001-TS-426]
components: [C001-COMP-010]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-052 — Clearing rules: pure moves and pure renames

## Intent
Clear a hunk by mechanical proof when it is a pure move (code removed in one place and added
unchanged elsewhere, by tree equality and the hashes of C001-T-038) or a pure rename (a symbol
renamed with every use updated, by resolved-name comparison), each with its deterministic-proof
evidence record, under the guard of C001-T-049 and the rule switches of C001-T-050.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/triage/rules/pure-move.ts › pure-move proof` | matching of removed and added blocks across files, C001-ADR-009 rules |
| add | `src/core/triage/rules/pure-rename.ts › pure-rename proof` | resolved names before and after; uses in unchanged files searched |
| add | `test/unit/triage/rules/` | positive and near-miss cases per ecosystem |

## Preconditions
- C001-T-038, C001-T-008 and C001-T-049 (guard) done.

## Step outline
1. Implement the move proof with its search bounds; record the matched counterpart.
2. Implement the rename proof with the rename search set measured in C001-T-014.
3. Emit evidence records of kind deterministic proof; pass every clearing through the guard.

## Verification
- `npm test -- test/unit/triage/rules`
- `npm run acceptance -- --scenario C001-TS-419 --scenario C001-TS-420 --scenario C001-TS-421 --scenario C001-TS-422`
- `npm run acceptance -- --scenario C001-TS-423 --scenario C001-TS-424 --scenario C001-TS-425 --scenario C001-TS-426`

## Done when
- [ ] Near-miss fixtures (one token changed) are never cleared.
- [ ] The listed scenarios pass once C001-T-055 publishes the triage document.
