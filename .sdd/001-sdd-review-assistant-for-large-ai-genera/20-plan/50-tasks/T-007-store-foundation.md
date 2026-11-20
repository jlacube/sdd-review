---
id: C001-T-007
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Review state store — layout, record append and revision switch
milestone: C001-M-01
status: todo
depends_on: [C001-T-003]
implements: [C001-REQ-920, C001-REQ-713, C001-NFR-014]
satisfies_ac: [C001-AC-920.1, C001-AC-713.1]
verified_by: [C001-TS-944, C001-TS-945, C001-TS-735, C001-TS-736]
components: [C001-COMP-014]
risk_refs: [C001-RISK-019]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-007 — Review state store: layout, record append and revision switch

## Intent
Build the file-based store of C001-ADR-005 with the layout of architecture §4.1: store root and
repository key, `reviews.json`, per-snapshot folders, an append-only review record written under a
lock and flushed before confirmation, and revisions of analysis results made current by an atomic
switch (§4.2 items 2 and 3). Restore on reopen comes in C001-T-080.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/store/root.ts › store root, repository key` | C001-ADR-005 items 1 to 3, owner-only permissions |
| add | `src/core/store/record.ts › append entries` | C001-IF-009 header, sequence numbers, entry chain, lock file (ADR-005 item 6), LF-terminated line, flush before return (item 4) |
| add | `src/core/store/revisions.ts › write revision, switch current` | complete document set per revision, flush, atomic replace of `analysis/current` with revision and `appliedSeq` (item 5), removal of the older revision |
| add | `src/core/store/snapshots.ts › snapshot folder, content blobs, reviews index` | `snapshot.json`, `content/<sha256>`, `review.json`, `reviews.json` |
| add | `test/unit/store/` | lock contention between processes, flush order, torn-write simulation, atomic switch on each OS |

## Preconditions
- C001-T-003 done (generated C001-IF-008 and C001-IF-009 types, ERR-STORE codes).

## Step outline
1. Implement root resolution per OS and the repository key from the common git directory path.
2. Implement the record writer: take the lock, re-read entries appended by others, append, flush,
   release; a defect report and its escalation go in one write and one flush.
3. Implement the revision writer and the atomic switch; a reader always sees a complete set.
4. Write unit tests that kill a child process at each step and check that no confirmed entry is
   lost and no partial revision becomes current.

## Verification
- `npm test -- test/unit/store`
- `npm run acceptance -- --scenario C001-TS-944 --scenario C001-TS-945 --scenario C001-TS-735 --scenario C001-TS-736` (with C001-T-009)

## Done when
- [ ] An entry is on disk before its append call returns.
- [ ] Two processes appending concurrently produce one valid chain in arrival order.
- [ ] `analysis/current` never names an incomplete revision in the kill tests.
