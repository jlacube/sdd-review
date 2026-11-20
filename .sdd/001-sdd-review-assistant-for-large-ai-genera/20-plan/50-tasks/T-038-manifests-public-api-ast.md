---
id: C001-T-038
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Language analysis — manifests, public API, tree equality and executable lines
milestone: C001-M-03
status: todo
depends_on: [C001-T-036]
implements: [C001-REQ-205, C001-REQ-417, C001-REQ-406]
satisfies_ac: [C001-AC-205.1, C001-AC-417.1, C001-AC-406.1]
verified_by: [C001-TS-214, C001-TS-454, C001-TS-419]
components: [C001-COMP-007]
risk_refs: [C001-RISK-007]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-038 — Language analysis: manifests, public API, tree equality and executable lines

## Intent
Provide the remaining language facts: package manifests per ecosystem (with an unparsable-manifest
state), public API symbols and declaration heads (C001-IF-005 §7.1, §7.2), abstract-syntax-tree
equality and structural hashes with name resolution for the move and rename proofs (C001-ADR-009),
and executable lines for coverage and mutation.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/language/manifests.ts › package manifests` | `package.json` and lock files, `pyproject.toml` and requirement files, project files and NuGet references; parse failure state |
| add | `src/core/language/public-api.ts › public API symbols, declaration heads` | C001-IF-005 §7.1 and §7.2 per ecosystem |
| add | `src/core/language/tree-equality.ts › equality, structural hash` | whitespace- and comment-insensitive equality, hashes, resolved-name comparison |
| add | `src/core/language/executable-lines.ts › executable lines` | per grammar |
| add | `test/unit/language/` | per ecosystem fixtures for each fact |

## Preconditions
- C001-T-036 done.

## Step outline
1. Implement manifest parsing; report an unparsable manifest as a state, not an error.
2. Implement public API extraction per C001-IF-005 §7.
3. Implement tree equality and hashing with the determinism rules of C001-CON-17.
4. Implement executable-line detection.

## Verification
- `npm test -- test/unit/language`
- `npm run acceptance -- --scenario C001-TS-214` (with C001-T-040)
- `npm run acceptance -- --scenario C001-TS-454` (with C001-T-050)
- `npm run acceptance -- --scenario C001-TS-419` (with C001-T-052)

## Done when
- [ ] Each fact has passing fixtures in each deep ecosystem.
- [ ] Equal trees hash equally on every CI operating system.
