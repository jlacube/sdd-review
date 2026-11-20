---
id: C001-T-008
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Intake — named base commit, histogram diff, hunks and snapshot
milestone: C001-M-01
status: done
depends_on: [C001-T-006, C001-T-007]
implements: [C001-REQ-101, C001-REQ-102, C001-REQ-115]
satisfies_ac: [C001-AC-101.1, C001-AC-102.1, C001-AC-115.1]
verified_by: [C001-TS-101, C001-TS-102, C001-TS-103, C001-TS-105, C001-TS-133, C001-TS-135]
components: [C001-COMP-004]
risk_refs: []
estimate: L
report: { commit: 7aa5d03, completed_at: 2026-11-20, notes: "Histogram diff+slider, hunks, snapshot ID; 77 intake unit tests + 31-case golden corpus green on 4 CI runners; TS-101..135 await CLI (T-009/T-010); defects D-015, D-016; PR at M-01 merge" }
---
# C001-T-008 — Intake: named base commit, histogram diff, hunks and snapshot

## Intent
Take in the change against a named base commit: list the changed files with their change types,
cut hunks with the fixed histogram diff and slider rule of C001-ADR-009 (C001-CON-17), compute the
snapshot ID, and store the snapshot document and the snapshot-side content. The default base rules
follow in C001-T-025; this task is the intake of the walking skeleton.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intake/diff/histogram.ts › histogram diff, slider rule` | C001-ADR-009 diff algorithm, deterministic tie-breaks |
| add | `src/core/intake/change.ts › compute change` | added, deleted, modified, renamed and untracked files from the git port (C001-T-006) |
| add | `src/core/intake/hunks.ts › cut hunks` | hunk identity per `40-domain/domain-model.md` §3 |
| add | `src/core/intake/snapshot.ts › snapshot ID, store snapshot` | IntakeDocument of C001-IF-008 written through C001-COMP-014 |
| add | `test/unit/intake/diff-golden/` | golden diff corpus (C001-ADR-009 follow-up) |

## Preconditions
- C001-T-006 and C001-T-007 done.

## Step outline
1. Implement the histogram diff with the slider rule; build the golden corpus and compare.
2. Compute the change from the base tree and the working-tree content.
3. Cut hunks and give each its identifier; compute the snapshot ID from base commit and content.
4. Store the intake document and content blobs; an existing snapshot ID is reported to the
   orchestrator, which reopens it (C001-T-034).

## Verification
- `npm test -- test/unit/intake`
- `npm run acceptance -- --scenario C001-TS-101 --scenario C001-TS-102 --scenario C001-TS-103`
- `npm run acceptance -- --scenario C001-TS-105 --scenario C001-TS-133 --scenario C001-TS-135`

## Done when
- [ ] The golden corpus passes on all CI operating systems with identical hunks.
- [ ] The same content gives the same snapshot ID on every run.
- [ ] The listed scenarios pass.
