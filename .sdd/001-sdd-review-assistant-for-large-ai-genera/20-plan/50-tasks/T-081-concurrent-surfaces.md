---
id: C001-T-081
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Concurrent entries from the CLI and the UI, one server per snapshot
milestone: C001-M-05
status: todo
depends_on: [C001-T-080, C001-T-012]
implements: [C001-REQ-917]
satisfies_ac: [C001-AC-917.1]
verified_by: [C001-TS-937, C001-TS-938]
components: [C001-COMP-014, C001-COMP-002, C001-COMP-001, C001-COMP-018]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-081 — Concurrent entries from the CLI and the UI, one server per snapshot

## Intent
Let the CLI and the UI of the same review append to the same record in arrival order (architecture
§4.2 item 1, §5 Concurrency): a CLI verdict process applies unapplied entries in memory before it
reads, and only the writer saves revisions; a second `review` of a served snapshot opens the running
server found through `server.lock`.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/store/server-lock.ts › server lock` | port and token, owner-only permissions, stale-lock detection |
| modify | `src/cli/commands/review.ts › reuse running server` | open the address from `server.lock` |
| modify | `src/core/orchestrator/reader-mode.ts › non-writer processes` | apply entries above `appliedSeq` in memory before reading |
| add | `test/unit/store/concurrency.test.ts` | interleaved appends from two processes |

## Preconditions
- C001-T-080 and C001-T-012 done.

## Step outline
1. Implement the server lock and the reuse path.
2. Implement reader mode for non-writer processes.
3. Test interleaved CLI and UI actions for order and completeness.

## Verification
- `npm test -- test/unit/store/concurrency.test.ts`
- `npm run acceptance -- --scenario C001-TS-937 --scenario C001-TS-938`

## Done when
- [ ] Both surfaces' entries appear once each in arrival order.
- [ ] A second `review` of a served snapshot opens the running server.
