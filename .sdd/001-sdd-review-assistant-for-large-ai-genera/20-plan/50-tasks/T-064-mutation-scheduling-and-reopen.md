---
id: C001-T-064
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Mutation job scheduling, copy window and reopen on surviving mutants
milestone: C001-M-04
status: todo
depends_on: [C001-T-062, C001-T-063, C001-T-061]
implements: [C001-REQ-514, C001-REQ-515, C001-REQ-411, C001-NFR-018]
satisfies_ac: [C001-AC-514.1, C001-AC-515.1, C001-AC-411.1]
verified_by: [C001-TS-541, C001-TS-544, C001-TS-442, C001-TS-484]
components: [C001-COMP-002, C001-COMP-011, C001-COMP-010]
risk_refs: [C001-RISK-001, C001-RISK-006]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-064 — Mutation job scheduling, copy window and reopen on surviving mutants

## Intent
Schedule mutation testing as an orchestrator job after a passing workspace check of the test run:
open the copy window (a run asking for that workspace waits for the copy), run the engine of the
hunk's ecosystem, save each result as a revision before it is shown, reopen a test-cleared hunk
when a mutant of it survives, and remove the copy when mutation testing ends.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/evidence/mutation/job.ts › mutation job` | copy window, engine dispatch per ecosystem, removal |
| modify | `src/core/orchestrator/jobs.ts › mutation job events` | each result an event; revision before show |
| modify | `src/core/triage/reopen-on-loss.ts › surviving mutant` | reopen with the mutant as cause |

## Preconditions
- C001-T-062, C001-T-063 and C001-T-061 done.

## Step outline
1. Implement the job and its interaction with the workspace states (copying, mutation).
2. Dispatch to the Stryker tools or the Python engine per hunk ecosystem.
3. Turn each result into an orchestrator event; reopen test-cleared hunks with surviving mutants.
4. Re-run W3 on the production path.

## Verification
- `npm run acceptance -- --scenario C001-TS-541 --scenario C001-TS-544 --scenario C001-TS-442 --scenario C001-TS-484`
- `npm run bench -- workspace-w3`

## Done when
- [ ] The listed scenarios pass.
- [ ] W3 on the production path meets (b); W4 is re-run by C001-T-069.
