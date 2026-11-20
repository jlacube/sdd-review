---
id: C001-T-057
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Per-test coverage adapter and load monitor for TypeScript/JavaScript
milestone: C001-M-04
status: todo
depends_on: [C001-T-060]
implements: [C001-REQ-506, C001-REQ-505]
satisfies_ac: [C001-AC-506.1, C001-AC-505.1]
verified_by: [C001-TS-516, C001-TS-517, C001-TS-518, C001-TS-567]
components: [C001-COMP-011]
risk_refs: [C001-RISK-016]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-057 — Per-test coverage adapter and load monitor for TypeScript/JavaScript

## Intent
Record which passing and failing tests execute each added line of a TypeScript/JavaScript hunk
while the developer's test command runs unchanged, by the preload of C001-ADR-007 §2 (istanbul
instrumentation of the changed files after the framework's transform, source-map mapping, counters
per test from the lifecycle events of Jest, Vitest, Mocha and `node:test`), and report files loaded
from outside the workspace through the Node load monitor (ERR-EVID-008, C001-IF-013 §4 item 2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `runtime/node/sddr-preload.cjs › preload` | `Module.prototype._compile` wrap, ESM `load` hook via `module.register`, `vm` compilation used by Jest and Vitest |
| add | `runtime/node/frameworks/ › Jest, Vitest, Mocha, node:test bindings` | test ID, name, outcome, failure message |
| add | `runtime/node/load-monitor.cjs › load monitor` | resolve hooks recording project files outside the current workspace |
| add | `src/core/evidence/adapters/node.ts › adapter configuration and result reading` | writes configuration to `<workspace>.aux/`, reads results into TestResult and line coverage |
| add | `test/fixtures/projects/node-*/` | one fixture project per supported framework |

## Preconditions
- C001-T-060 done; spike learnings of C001-T-020; versions and framework support confirmed by
  C001-T-002 (Vitest `threads` and `node:test` marked "to verify" in C001-ADR-007).

## Step outline
1. Promote the spike preload to production quality; instrument only changed deep-ecosystem files.
2. Bind each framework's lifecycle; snapshot and reset counters at each test end.
3. Implement the load monitor and the attribution rule of C001-IF-013 §4 item 2.
4. Measure overhead (a) on the TypeScript benchmark change; narrow instrumentation if above 3.0.

## Verification
- `npm test -- test/unit/evidence/adapters/node`
- `npm run acceptance -- --scenario C001-TS-516 --scenario C001-TS-517 --scenario C001-TS-518 --scenario C001-TS-567`
- `npm run bench -- workspace-w2 --ecosystem typescript`

## Done when
- [ ] Each supported framework's fixture yields per-test line data and outcomes.
- [ ] Execution of a working-tree copy of a snapshot file is reported with ERR-EVID-008.
- [ ] (a) ≤ 3.0 on the TypeScript benchmark change.
