---
id: C001-T-037
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Language analysis — symbols, definitions, uses and import statements
milestone: C001-M-03
status: todo
depends_on: [C001-T-036]
implements: [C001-REQ-204, C001-REQ-306]
satisfies_ac: [C001-AC-204.1, C001-AC-306.1]
verified_by: [C001-TS-210, C001-TS-212, C001-TS-310]
components: [C001-COMP-007]
risk_refs: [C001-RISK-007]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-037 — Language analysis: symbols, definitions, uses and import statements

## Intent
Extract, per deep ecosystem and on both sides of the change, the symbols with their definitions and
uses and the import and reference statements with their resolved targets, which the architecture
delta (dependencies between components), the link signals of C001-CAP-03 and the walkthrough order
need. The symbol index is derived data per snapshot (architecture §4.1).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/language/symbols.ts › symbols, definitions, uses` | tree-sitter queries per grammar; names resolved within the repository |
| add | `src/core/language/imports.ts › import and reference statements` | module resolution per ecosystem (Node and TypeScript paths, Python packages, .NET namespaces and project references) |
| add | `src/core/language/index.ts › symbol index` | per snapshot, base and snapshot side, optional cache in the store |
| add | `test/unit/language/symbols.test.ts`, `imports.test.ts` | per ecosystem fixtures |

## Preconditions
- C001-T-036 done.

## Step outline
1. Write the queries for definitions and uses per grammar.
2. Write import extraction and resolution per ecosystem; unresolved targets are kept as external.
3. Build the symbol index for both sides; keep it deterministic.

## Verification
- `npm test -- test/unit/language`
- `npm run acceptance -- --scenario C001-TS-210 --scenario C001-TS-212` (with C001-T-040)
- `npm run acceptance -- --scenario C001-TS-310` (with C001-T-045)

## Done when
- [ ] Each deep ecosystem's fixtures resolve definitions, uses and imports as expected.
- [ ] Two builds of the index on the same snapshot are equal.
