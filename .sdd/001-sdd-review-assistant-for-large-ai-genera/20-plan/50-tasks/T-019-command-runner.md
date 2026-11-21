---
id: C001-T-019
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Command runner for evidence commands
milestone: C001-M-01
status: in-progress
depends_on: [C001-T-015]
implements: [C001-REQ-525, C001-REQ-521]
satisfies_ac: [C001-AC-525.1, C001-AC-521.1]
verified_by: [C001-TS-586, C001-TS-587, C001-TS-588, C001-TS-560, C001-TC-555]
components: [C001-COMP-011]
risk_refs: [C001-RISK-005]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-019 — Command runner for evidence commands

## Intent
Run every evidence command (test command, mutation tool, bundle command) with an evidence
workspace as working directory, never the working tree, with the per-OS shell and environment
rules of C001-IF-013 §1: the developer's environment with the git repository-locating variables
removed (§1 item 7, C001-REQ-525 — this overrides C001-ADR-006 §5), `GIT_CEILING_DIRECTORIES` set
to the workspace parent, injected values appended or prepended only, and lower priority with one
core kept free for mutation processes (C001-ADR-006 §8).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/evidence/runner/run-command.ts › run in workspace` | per-OS shell, working directory, output capture with limits, exit status, cancellation and kill of the process tree |
| add | `src/core/evidence/runner/environment.ts › evidence environment` | removal of the variables of C001-IF-013 §1 item 7, `GIT_CEILING_DIRECTORIES`, injection rules of C001-ADR-007 §1 |
| add | `src/core/evidence/runner/priority.ts › worker count and priority` | `nice` 10 and I/O class on Linux, `nice` on macOS, job object with below-normal priority on Windows |
| add | `test/unit/evidence/runner/` | logic without starting a process: environment built from a given map (variables removed, ceiling set, injected values appended or prepended only), working-directory check refusing the working tree, worker count |
| add | `test/integration/evidence/runner/` | C001-TC-555, real processes and git on each CI runner: a command started with every repository-locating variable set finds no repository; no run in the working tree; process tree killed on cancel; priority applied |

## Preconditions
- C001-T-015 done.

## Step outline
1. Implement the run with the shell of each OS and the working directory check (workspace only).
2. Build the environment: copy, remove the repository-locating variables (the list constant that
   C001-T-005 added for the git adapter, so the two lists never differ), set the ceiling.
3. Implement priority and worker count for mutation runs.
4. Implement cancellation that kills the whole process tree on each OS.

## Verification
- `npm test -- test/unit/evidence/runner`
- `npm test -- test/integration/evidence/runner`
- `npm run acceptance -- --scenario C001-TS-586 --scenario C001-TS-587 --scenario C001-TS-588 --scenario C001-TS-560` (with C001-T-060)

## Done when
- [ ] A command started from a git hook environment finds no repository (C001-REQ-525).
- [ ] No evidence command ever has the working tree as its working directory.
- [ ] Cancelling leaves no child process on any CI operating system.
