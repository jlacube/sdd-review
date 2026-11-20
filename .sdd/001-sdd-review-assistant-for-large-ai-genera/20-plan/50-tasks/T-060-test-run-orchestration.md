---
id: C001-T-060
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Test run on the snapshot — job, workspace checks, coverage reports and failures
milestone: C001-M-04
status: todo
depends_on: [C001-T-024, C001-T-019, C001-T-009]
implements: [C001-REQ-505, C001-REQ-507, C001-REQ-508, C001-REQ-509]
satisfies_ac: [C001-AC-505.1, C001-AC-507.1, C001-AC-508.1, C001-AC-509.1]
verified_by: [C001-TS-512, C001-TS-513, C001-TS-514, C001-TS-515, C001-TS-519, C001-TS-520, C001-TS-521, C001-TS-522, C001-TS-523, C001-TS-524]
components: [C001-COMP-011, C001-COMP-002]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-060 — Test run on the snapshot: job, workspace checks, coverage reports and failures

## Intent
Run the project's test command (from the configuration or the CLI) on the snapshot as a background
job of the orchestrator, in a prepared evidence workspace checked before and after the run
(C001-IF-013 §3, §4), read standard coverage reports for other languages, take evidence only from
runs whose workspace check passed, and continue without test evidence, with a notice, when the
tests cannot run. The per-ecosystem adapters plug into this job (C001-T-057 to C001-T-059).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/evidence/test-run.ts › test-run job` | prepare, check, run, check, read results; TestRun and TestResult |
| add | `src/core/evidence/reports.ts › standard coverage reports` | report formats of C001-IF-013 §4 |
| add | `src/core/evidence/adapter-port.ts › coverage adapter port` | interface the three adapters implement |
| add | `src/core/evidence/document.ts › evidence document` | C001-IF-008 evidence document, saved as a revision |
| modify | `src/core/orchestrator/jobs.ts › test-run job` | scheduled after the static stage |

## Preconditions
- C001-T-024 outcome allows C001-M-04; C001-T-019 and C001-T-009 done.

## Step outline
1. Implement the job with the workspace lifecycle and both checks; a failed check voids the run.
2. Implement the adapter port; run the command with the adapters' injections.
3. Read standard coverage reports where no adapter applies.
4. Handle failures: no test command, command fails to start, no result (codes of `errors.md`);
   the review continues without test evidence.
5. Publish the evidence document as a revision.

## Verification
- `npm test -- test/unit/evidence`
- `npm run acceptance -- --scenario C001-TS-512 --scenario C001-TS-513 --scenario C001-TS-514 --scenario C001-TS-515 --scenario C001-TS-519`
- `npm run acceptance -- --scenario C001-TS-520 --scenario C001-TS-521 --scenario C001-TS-522 --scenario C001-TS-523 --scenario C001-TS-524`

## Done when
- [ ] The listed scenarios pass on the three CI operating systems.
- [ ] No test run's evidence is used when its workspace check failed.
