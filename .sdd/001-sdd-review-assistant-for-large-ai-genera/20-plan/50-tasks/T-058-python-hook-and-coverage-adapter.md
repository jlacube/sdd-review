---
id: C001-T-058
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Python import hook, per-test coverage adapter and load monitor
milestone: C001-M-04
status: todo
depends_on: [C001-T-060]
implements: [C001-REQ-506, C001-REQ-509]
satisfies_ac: [C001-AC-506.1, C001-AC-509.1]
verified_by: [C001-TS-574, C001-TS-584, C001-TS-558, C001-TS-951]
components: [C001-COMP-011]
risk_refs: [C001-RISK-016, C001-RISK-006]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-058 — Python import hook, per-test coverage adapter and load monitor

## Intent
Make Python project modules load from the evidence workspace (C001-IF-013 §2 item 7) through the
`sitecustomize` hook of C001-ADR-006 §6, including editable installs from the working tree, and
record per-test line coverage with coverage.py contexts switched per test by the pytest plugin or
the `unittest` wrapper (C001-ADR-007 §2), reporting files loaded from outside the workspace.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `runtime/python/sitecustomize.py › import hook` | path hook and meta-path wrapper of C001-ADR-006 §6, bytecode prefix, chaining to an existing `sitecustomize` |
| add | `runtime/python/sddr_pytest.py › pytest plugin` | context per node ID, outcome, `longrepr`, interpreter recorded |
| add | `runtime/python/sddr_unittest.py › unittest wrapper` | `TestResult` wrapper |
| add | `runtime/python/vendor/coverage/` | vendored coverage.py used only when the environment has none ≥ 5.0 |
| add | `src/core/evidence/adapters/python.ts › adapter configuration and result reading` | `PYTHONPATH`, `SDDR_RUN`, `COVERAGE_PROCESS_START`, `PYTEST_PLUGINS` injection; results to TestResult and line coverage |
| add | `test/fixtures/projects/python-*/` | pytest, unittest, editable install from the working tree, pytest-cov |

## Preconditions
- C001-T-060 done; coverage.py licence and vendoring confirmed by C001-T-002.

## Step outline
1. Implement the hook and prove with K4 fixtures that working-tree modules are not executed.
2. Implement coverage start in every Python process with `include` limited to changed files.
3. Implement the pytest plugin and the unittest wrapper; cooperate with a running pytest-cov.
4. Measure (a) on the Python benchmark change.

## Verification
- `npm run lint:py` (Ruff over `runtime/python/`; the vendored `runtime/python/vendor/` is excluded in `ruff.toml`)
- `npm test -- test/unit/evidence/adapters/python`
- `npm run acceptance -- --scenario C001-TS-574 --scenario C001-TS-584 --scenario C001-TS-558 --scenario C001-TS-951`
- `npm run bench -- workspace-w2 --ecosystem python`

## Done when
- [ ] With an editable install from the working tree, passing tests are recorded for the changed lines and no ERR-EVID-008 is raised.
- [ ] (a) ≤ 3.0 on the Python benchmark change.
