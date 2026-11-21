---
id: C001-T-034
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Reopen an existing snapshot and keep earlier snapshots
milestone: C001-M-02
status: done
depends_on: [C001-T-009]
implements: [C001-REQ-118, C001-REQ-119]
satisfies_ac: [C001-AC-118.1, C001-AC-119.1]
verified_by: [C001-TS-141, C001-TS-142, C001-TS-143]
components: [C001-COMP-002, C001-COMP-014, C001-COMP-001]
risk_refs: [C001-RISK-008]
estimate: M
report: { commit: f2dba0d, completed_at: 2026-11-21, notes: "Reopen without re-analysis, reviews/open commands; TS-141/143 pass, TS-142 per D-026; restore in T-080; combined tree verified (1,265 tests, 57 CI scenarios); CI green on 4 runners at cad9d3f; shared wiring in ed6f09c; PR at M-01/M-02 merge" }
---
# C001-T-034 — Reopen an existing snapshot and keep earlier snapshots

## Intent
When intake yields the ID of a stored snapshot, reopen its review without recomputing; when it
yields a new ID, store a new snapshot and keep every earlier one with its record. The `reviews`
command lists them with the record path (C001-IF-001). Re-application of unapplied entries on
reopen is completed in C001-T-080.

## Targets
| Kind | Target | Change |
|---|---|---|
| modify | `src/core/api/index.ts › startReview` | reopen on an existing snapshot ID |
| add | `src/core/store/reviews-index.ts › list reviews` | `reviews.json` entries with base, HEAD, created, last opened |
| add | `src/cli/commands/reviews.ts › reviews` | prints the reviews and the record path |

## Preconditions
- C001-T-009 done.

## Step outline
1. Detect an existing snapshot and load its current revision instead of analysing.
2. Store new snapshots beside earlier ones; never remove one.
3. Implement the `reviews` command.

## Verification
- `npm run acceptance -- --scenario C001-TS-141 --scenario C001-TS-142 --scenario C001-TS-143`

## Done when
- [ ] Reopening a snapshot runs no analysis job.
- [ ] All listed scenarios pass.
