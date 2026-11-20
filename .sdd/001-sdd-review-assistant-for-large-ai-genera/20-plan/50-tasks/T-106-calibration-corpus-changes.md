---
id: C001-T-106
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Calibration corpus — twelve agent changes with test command and environment
milestone: C001-M-07
status: todo
depends_on: [C001-T-013]
implements: []
satisfies_ac: [C001-AC-401.1]
verified_by: [C001-TC-026]
components: [C001-COMP-010]
risk_refs: [C001-RISK-021]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-106 — Calibration corpus: twelve agent changes with test command and environment

## Intent
Build the change part of the calibration corpus of C001-ADR-009 §4 item 1 (fixture row of
`60-test-plan.md` §2): at least 12 agent changes, 4 per deep ecosystem, of 2,000 to 10,000 changed
lines, each produced by a coding agent from a written task description, with repository, commit
range, test command and environment written as `30-nfr/nfr.md` §0 writes them for benchmark
changes. Split out of C001-T-099 (C001-RISK-021). The task needs only the benchmark set, so it
starts as soon as C001-T-013 is done and runs in parallel with C001-M-01 to C001-M-05. It implements no requirement;
`satisfies_ac` names the criterion whose weights the corpus calibrates (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `bench/calibration/corpus.json › changes` | per change: ecosystem, repository and commit range, task description file, changed-line count, test command, environment, corpus builder; seeded defects follow in C001-T-107 and C001-T-108 |
| add | `bench/calibration/tasks/` | the written task description of each change |
| add | `bench/calibration/environments/` | per change, the environment recipe (reused from `bench/set/environments/` where the repository is a reference repository) |
| add | `bench/calibration/ › overlap check` | `npm run bench -- calibration --check-overlap`: fails when a corpus change shares a commit range or a task description with `bench/set/benchmark-set.json` or with the G-8 pool record `study/g8/pool.json` once it exists; the suite of C001-T-099 runs it first |

## Preconditions
- C001-T-013 done: the benchmark set is frozen, so overlaps can be excluded.
- A coding agent and the reference repositories of C001-T-013 (or other open-source repositories
  of at most 500,000 lines with a runnable test suite) are available.

## Step outline
1. Write 12 task descriptions, 4 per deep ecosystem, none equal to a benchmark-change task or a
   G-8 pool task; aim at 2,000 to 10,000 changed lines each.
2. Run the coding agent per task; keep its commits as they are; reject a run outside the size band
   and run again.
3. Write test command and environment per change, reusing the recipes of `bench/set/environments/`
   where the repository is the same; check that the test command runs.
4. Record each change in `bench/calibration/corpus.json`; build the overlap check and run it
   against the benchmark set (the G-8 pool of C001-T-110 is chosen after this task and is checked
   against the corpus there).

## Verification
- `npm run bench -- calibration --check-overlap`

## Done when
- [ ] 12 changes or more, 4 per deep ecosystem, each within 2,000 to 10,000 changed lines with a
      test command that runs in its environment.
- [ ] No change shares a commit range or a task description with the benchmark set or the G-8 pool.
