---
id: C001-T-006
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Git access adapter — read operations and working-tree comparison
milestone: C001-M-01
status: todo
depends_on: [C001-T-005]
implements: [C001-REQ-101, C001-REQ-120]
satisfies_ac: [C001-AC-101.1, C001-AC-120.1]
verified_by: [C001-TS-101, C001-TS-102, C001-TS-103, C001-TS-104]
components: [C001-COMP-003]
risk_refs: [C001-RISK-002, C001-RISK-004, C001-RISK-005]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-006 — Git access adapter: read operations and working-tree comparison

## Intent
Implement the operations of C001-IF-012 §3 that intake, configuration, evidence workspaces and the
orchestrator use, including the git identity read (G-10), within the performance rules of §5. Files
under no clean filter are compared by their working-tree bytes whatever the index records, and a
path outside a sparse checkout is read from its index entry (§8). Clean-filter files follow in
C001-T-028.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/git/operations.ts › G-01 … G-16` | each operation of C001-IF-012 §3 on the runner of C001-T-005 |
| add | `src/core/git/worktree-compare.ts › working-tree comparison` | byte comparison of §8 item 1, sparse-checkout rule of §8 item 2, untracked files under the ignore rules |
| add | `test/unit/git/operations.test.ts` | each operation against fixture repositories, SHA-1 and SHA-256 object formats |

## Preconditions
- C001-T-005 done.

## Step outline
1. Implement the operations in the order intake needs them (resolve, merge base, trees, blobs by
   batch, status with untracked files, commits of a range, identity), then the ones of evidence
   workspaces (tree listing with modes, submodule reads).
2. Implement the working-tree comparison so that no index flag (assume-unchanged, skip-worktree)
   or time stamp hides an edit of a file under no clean filter (architecture §6, Change
   completeness).
3. Extend the C001-T-005 integration test: every operation leaves the repository unchanged, and
   every operation runs with the cleaned git read environment of C001-T-005 (the hook-environment
   test covers each operation, C001-RISK-005).
4. Record the read times of G-07 and G-09 on a large fixture for the spike C001-T-014.

## Verification
- `npm test -- test/unit/git`
- `npm run acceptance -- --scenario C001-TS-101 --scenario C001-TS-102 --scenario C001-TS-103 --scenario C001-TS-104` (with C001-T-008)

## Done when
- [ ] Every operation of C001-IF-012 §3 has a passing unit test.
- [ ] An edit hidden by assume-unchanged or skip-worktree appears in the change.
- [ ] The repository is byte-identical before and after each operation.
