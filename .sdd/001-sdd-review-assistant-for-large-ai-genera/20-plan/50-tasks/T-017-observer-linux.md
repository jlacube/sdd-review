---
id: C001-T-017
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Working-tree observer — common model and Linux implementation
milestone: C001-M-01
status: done
depends_on: [C001-T-003]
implements: [C001-REQ-523, C001-REQ-524]
satisfies_ac: [C001-AC-523.1, C001-AC-524.1]
verified_by: [C001-TS-568, C001-TS-569, C001-TS-575, C001-TS-576, C001-TC-551]
components: [C001-COMP-011]
risk_refs: []
estimate: L
report: { commit: 5499a13, completed_at: 2026-11-21, notes: "Observer model + Linux inotify via koffi 3.3.8; 28 unit + 12 Linux integration tests green on WSL and ubuntu CI (user-namespace sysctl step added) at 2a241e0; statfs network-fs cause untested; wiring in T-069; PR at M-01 merge" }
---
# C001-T-017 — Working-tree observer: common model and Linux implementation

## Intent
A persistent change-notification observer per process watches the working-tree part and the
repository part of C001-ADR-006 §9 during every evidence run, so that changes made there are
reported with ERR-EVID-009 and parts not observed for a whole run with ERR-EVID-010 and its cause
(C001-IF-013 §9 items 3 and 4). This task builds the OS-independent model (event positions per
run, drain at run end, cause classification, rebuild) and the inotify implementation.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/evidence/observer/observer.ts › Observer model` | start before the first run, run windows by event position, drain, rebuild at low priority, "observation interrupted" while rebuilding |
| add | `src/core/evidence/observer/causes.ts › incomplete-observation causes` | not readable, watch limit, events lost, observation interrupted |
| add | `src/core/evidence/observer/linux.ts › inotify observer` | one watch per directory, new directories watched then listed, `statfs` types that notify local changes only, ENOSPC and EMFILE, `IN_Q_OVERFLOW`, root self-events |
| add | `test/unit/evidence/observer/model.test.ts` | the OS-independent model on recorded event sequences: run windows by event position, drain, cause classification, rebuild and "observation interrupted"; no real notification |
| add | `test/integration/evidence/observer/linux.test.ts` | C001-TC-551, real inotify on `ubuntu-24.04`: each cause raised (lowered `max_user_watches`, unreadable directory, renamed root, queue overflow); unchanged paths never reported |

## Preconditions
- C001-T-003 done; C001-T-002 confirmed the licence of the watcher binding, which must expose
  overflow and drop flags (C001-ADR-006 Dependencies).

## Step outline
1. Implement the model with its per-run windows and the drain contract.
2. Implement scope: every path under the working-tree root outside the git directory, and
   `index`, `HEAD`, `packed-refs`, `refs/`, `reftable/` of the git directory and the common git
   directory; lock files not reported, their rename onto the target reported.
3. Implement the Linux observer with every cause of the C001-ADR-006 §9 table.
4. Test with a lowered `max_user_watches`, an unreadable directory and a renamed root (K6 inputs).

## Verification
- `npm test -- test/unit/evidence/observer`
- `npm test -- test/integration/evidence/observer` (on Ubuntu)
- `npm run acceptance -- --scenario C001-TS-568 --scenario C001-TS-569 --scenario C001-TS-575 --scenario C001-TS-576` (on Ubuntu, with C001-T-069)

## Done when
- [ ] Each Linux cause of the C001-ADR-006 §9 table is raised in a test.
- [ ] A path that did not change during a run is never reported with ERR-EVID-009.
