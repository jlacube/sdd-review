---
id: C001-T-080
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Restore of the review state and crash safety
milestone: C001-M-05
status: todo
depends_on: [C001-T-079, C001-T-072, C001-T-064]
implements: [C001-REQ-918, C001-REQ-919, C001-REQ-920, C001-NFR-014]
satisfies_ac: [C001-AC-918.1, C001-AC-919.1, C001-AC-920.1]
verified_by: [C001-TS-939, C001-TS-940, C001-TS-949, C001-TS-941, C001-TS-942, C001-TS-943, C001-TS-944, C001-TS-945]
components: [C001-COMP-002, C001-COMP-014]
risk_refs: [C001-RISK-019, C001-RISK-008]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-080 — Restore of the review state and crash safety

## Intent
On reopen, restore exactly the review state the developer saw (architecture §4.2 item 4): verify the
chain, remove an unfinished last line under the lock, load the current revision, re-apply every entry
above `appliedSeq` in sequence order and write a revision, complete an escalation whose report was
written without it, restart unfinished jobs in fresh workspaces, and keep analysis results across
sessions without recomputing.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/orchestrator/restore.ts › restore review state` | the steps of §4.2 item 4 |
| modify | `src/core/store/record.ts › remove unfinished last line` | under the lock |
| modify | `src/core/orchestrator/jobs.ts › restart unfinished jobs` | fresh workspaces; left-over workspaces swept (C001-T-015) |
| add | `test/fault/restore/` | kill at each step of a recorded action and of a revision save |

## Preconditions
- C001-T-079, C001-T-072 and C001-T-064 done.

## Step outline
1. Implement restore in the order of §4.2 item 4.
2. Re-apply entries of every action kind; complete missing escalations with the report's user and surface.
3. Restart jobs; their results become new revisions.
4. Kill tests at every step; compare the restored state with the confirmed actions.

## Verification
- `npm run test:fault -- restore`
- `npm run acceptance -- --scenario C001-TS-939 --scenario C001-TS-940 --scenario C001-TS-949 --scenario C001-TS-941`
- `npm run acceptance -- --scenario C001-TS-942 --scenario C001-TS-943 --scenario C001-TS-944 --scenario C001-TS-945`

## Done when
- [ ] No confirmed action is lost in the kill tests; restored samples equal those shown before the kill.
- [ ] The listed scenarios pass on the three CI operating systems.
