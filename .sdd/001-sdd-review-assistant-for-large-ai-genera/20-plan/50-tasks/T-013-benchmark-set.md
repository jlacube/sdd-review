---
id: C001-T-013
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Benchmark set, reference environment and measurement harness
milestone: C001-M-01
status: todo
depends_on: [C001-T-001, C001-T-002]
implements: [C001-NFR-001, C001-NFR-005, C001-NFR-018]
satisfies_ac: [C001-AC-102.1, C001-AC-505.1]
verified_by: [C001-TS-105, C001-TS-512]
components: [C001-COMP-002, C001-COMP-011]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-013 — Benchmark set, reference environment and measurement harness

## Intent
Fix, before any measurement, the reference repositories, the benchmark changes with their intake
and environment, and the reference machine of `10-spec/30-nfr/nfr.md` §0, so that every spike of
C001-M-01 and every NFR measurement of C001-M-07 runs on the same inputs. Provide the harness that
times runs and samples memory every 100 ms.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `bench/set/benchmark-set.json` | per deep ecosystem: reference repository and commit, benchmark change (9,000 to 10,000 changed lines over 250 to 300 files) with its ID (`bench-ts`, `bench-py`, `bench-cs`) and whether it has an SDD workspace, base commit, named files, test command, environment; plus the repository outside the deep ecosystems and its commit |
| add | `bench/set/environments/` | per benchmark change: dependency installation in the working tree and the active environment, per nfr.md §0 (no editable install from the working tree, no installed copy) |
| add | `bench/harness/ › timing and memory sampler` | wall-clock timings, peak resident memory of the core's processes every 100 ms, report per run |
| add | `bench/README.md` | reference machine description and the rule that the set is fixed before measurement |

## Preconditions
- C001-T-001 done; C001-T-002 confirmed the licences of the harness dependencies.
- A machine matching the reference machine of nfr.md §0 is available.

## Step outline
1. Choose one open-source repository per deep ecosystem (at most 500,000 lines, runnable test
   suite) and one outside the deep ecosystems; record licence and commit.
2. Produce each benchmark change with a coding agent from a written task description; keep the
   agent's commits, plan and transcript files as they are; `bench-ts` is produced from an SDD
   change held in the repository (with an SDD workspace), `bench-py` and `bench-cs` without one
   (C001-GOAL-06; C001-T-097 runs its full flows on `bench-ts` and `bench-py`).
3. Write the intake and environment of each change and freeze the set (commit it) before any
   measurement; record the freeze commit.
4. Build the harness and check it on a small fixture.

## Verification
- `npm run bench -- harness-selftest`
- `npm run bench -- validate-set`

## Done when
- [ ] Each deep ecosystem has at least one benchmark change in the size band, with test command, intake and environment.
- [ ] The set is committed before the first measurement of C001-T-014 or C001-T-021.
- [ ] The harness reports wall-clock time and peak memory for a fixture run.
