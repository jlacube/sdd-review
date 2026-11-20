---
id: C001-T-069
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Repository safety across all evidence runs — observation, notices and snapshot pinning
milestone: C001-M-04
status: todo
depends_on: [C001-T-060, C001-T-064, C001-T-065, C001-T-018]
implements: [C001-REQ-521, C001-REQ-522, C001-REQ-523, C001-REQ-524, C001-NFR-018]
satisfies_ac: [C001-AC-521.1, C001-AC-522.1, C001-AC-523.1, C001-AC-524.1]
verified_by: [C001-TS-559, C001-TS-560, C001-TS-561, C001-TS-562, C001-TS-563, C001-TS-564, C001-TS-565, C001-TS-566, C001-TS-568, C001-TS-569, C001-TS-570, C001-TS-571, C001-TS-572, C001-TS-573, C001-TS-575, C001-TS-576, C001-TS-577, C001-TS-578, C001-TS-579]
components: [C001-COMP-011, C001-COMP-002]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-069 — Repository safety across all evidence runs

## Intent
Wire the observer into every run kind (test run, mutation run, bundle run) so that changes of the
working tree, index and refs during a run are reported with ERR-EVID-009 and unobserved parts with
ERR-EVID-010, keep every run on the snapshot when the working tree moves on, and show that a
cancelled, failed or killed run leaves the repository unchanged. Re-run W4 on the production path.

## Targets
| Kind | Target | Change |
|---|---|---|
| modify | `src/core/evidence/test-run.ts`, `bundle-run.ts`, `mutation/job.ts › observation windows` | start and end positions, drain, notices in the evidence document |
| add | `test/acceptance/support/repo-manifest.ts › repository manifest` | before-and-after comparison used by the safety scenarios |

## Preconditions
- C001-T-060, C001-T-064, C001-T-065 and C001-T-018 done.

## Step outline
1. Attach a run window to every run kind; drain at the end; map events to notices.
2. Pin each run to the snapshot; working-tree edits during a run change nothing in it.
3. Automate the safety scenarios with the repository manifest.
4. Re-run W4 with the production bundle path, during and after mutation testing.

## Verification
- `npm run acceptance -- --scenario C001-TS-559 --scenario C001-TS-560 --scenario C001-TS-561 --scenario C001-TS-562 --scenario C001-TS-563 --scenario C001-TS-564 --scenario C001-TS-565 --scenario C001-TS-566`
- `npm run acceptance -- --scenario C001-TS-568 --scenario C001-TS-569 --scenario C001-TS-570 --scenario C001-TS-571 --scenario C001-TS-572 --scenario C001-TS-573`
- `npm run acceptance -- --scenario C001-TS-575 --scenario C001-TS-576 --scenario C001-TS-577 --scenario C001-TS-578 --scenario C001-TS-579`
- `npm run bench -- workspace-w4`

## Done when
- [ ] The listed scenarios pass on the three CI operating systems.
- [ ] W4 meets (c) ≤ 1 s per command in both states on the production path.
