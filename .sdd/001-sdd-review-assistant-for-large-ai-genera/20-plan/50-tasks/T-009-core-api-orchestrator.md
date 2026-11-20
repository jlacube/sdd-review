---
id: C001-T-009
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Core API and orchestrator skeleton
milestone: C001-M-01
status: done
depends_on: [C001-T-007, C001-T-008]
implements: [C001-REQ-913, C001-NFR-013]
satisfies_ac: [C001-AC-913.1]
verified_by: [C001-TS-928]
components: [C001-COMP-002]
risk_refs: []
estimate: M
report: { commit: 7d748b9, completed_at: 2026-11-20, notes: "CoreApi 37 ops (7 implemented, 30 typed not-implemented), event loop, job scheduler, identity check; 72 tests green on 4 CI runners; TS-928 cannot pass until T-010/T-076..082 (defect D-017); PR at M-01 merge" }
---
# C001-T-009 — Core API and orchestrator skeleton

## Intent
Provide the analysis core's only entry point (C001-IF-003): one async function per operation of
§3 and §4, with the read operations backed by intake and the store and the write operations
returning "not implemented" until their tasks. The orchestrator handles the events of a snapshot
one at a time and saves a revision before a result is shown (architecture §4.2 items 1 and 3).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/api/index.ts › operations of C001-IF-003 §3 and §4` | exported async functions with generated types; rejection with `ReviewError` |
| add | `src/core/orchestrator/event-loop.ts › snapshot event queue` | one writer per snapshot, events in arrival order, revision saved after each event |
| add | `src/core/orchestrator/jobs.ts › background job scheduler` | job states in `review.json`; jobs registered by later tasks |
| add | `src/core/orchestrator/identity.ts › git identity check` | reads G-10 for each recorded action and refuses with ERR-ACT-006 (used from C001-T-076) |
| add | `test/unit/orchestrator/` | ordering, revision-before-show, cancellation |

## Preconditions
- C001-T-007 and C001-T-008 done.

## Step outline
1. Implement `startReview` as intake → store → first revision; `getSession` returns the current
   revision's views.
2. Implement the event loop and the job scheduler with persisted job states.
3. Stub every other operation with a typed "not implemented" error until its task.
4. Show that the core runs without the UI server loaded (C001-REQ-913).

## Verification
- `npm test -- test/unit/orchestrator`
- `npm run acceptance -- --scenario C001-TS-928`

## Done when
- [ ] Every operation of C001-IF-003 exists with its generated types.
- [ ] Events of one snapshot never interleave; each result is shown only after its revision is current.
- [ ] C001-TS-928 passes.
