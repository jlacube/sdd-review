---
id: C001-T-036
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Parser port, tree-sitter grammars, ecosystem assignment and worker pool
milestone: C001-M-03
status: todo
depends_on: [C001-T-024, C001-T-014]
implements: [C001-REQ-212, C001-NFR-008, C001-NFR-004]
satisfies_ac: [C001-AC-212.1]
verified_by: [C001-TS-226, C001-TS-227]
components: [C001-COMP-007]
risk_refs: [C001-RISK-007, C001-RISK-009]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-036 — Parser port, tree-sitter grammars, ecosystem assignment and worker pool

## Intent
Build the parser port of C001-ADR-003 with one tree-sitter WebAssembly grammar per deep ecosystem
at versions fixed per release (C001-CON-17), the ecosystem assignment of C001-IF-005 §8, the
fallback to the language-agnostic core with a reduced label for other files, and the worker pool
with heap limits measured in C001-T-014 (C001-ADR-001 item 4). Any change the DP-1 outcome requires
(native module behind the port) is applied here.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/language/port.ts › ParserPort` | parse, query, tree equality hooks; one adapter per grammar |
| add | `src/core/language/grammars/ › TypeScript/JavaScript, Python, C#` | pinned grammar files shipped with the package |
| add | `src/core/language/ecosystem.ts › assign ecosystem` | C001-IF-005 §8 |
| add | `src/core/language/pool.ts › worker pool` | worker threads with heap limits, deterministic result order |
| add | `test/unit/language/port.test.ts` | parse of each grammar, parse failure labelled, unknown language reduced |

## Preconditions
- C001-T-024 outcome recorded; grammar licences confirmed by C001-T-002.

## Step outline
1. Implement the port and the three adapters; pin and ship the grammar files.
2. Implement the ecosystem assignment and the reduced label for other files.
3. Implement the pool; results are ordered by path so that output does not depend on scheduling
   (C001-CON-17).
4. Re-run the spike harness of C001-T-014 against the production port.

## Verification
- `npm test -- test/unit/language`
- `npm run bench -- spike-parse`
- `npm run acceptance -- --scenario C001-TS-226 --scenario C001-TS-227` (with C001-T-039)

## Done when
- [ ] The production port meets the time and memory budget recorded at DP-1.
- [ ] A file outside the deep ecosystems gets the language-agnostic result with its reduced label.
