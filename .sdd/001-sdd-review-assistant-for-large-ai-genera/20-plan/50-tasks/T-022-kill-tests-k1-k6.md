---
id: C001-T-022
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Workspace kill tests K1 to K6
milestone: C001-M-01
status: todo
depends_on: [C001-T-020, C001-T-018]
implements: []
satisfies_ac: [C001-AC-521.1, C001-AC-523.1, C001-AC-524.1, C001-AC-509.1]
verified_by: [C001-TS-559, C001-TS-561, C001-TS-562, C001-TS-572, C001-TS-579, C001-TS-951]
components: [C001-COMP-011]
risk_refs: [C001-RISK-013]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-022 — Workspace kill tests K1 to K6

## Intent
Prove the guarantee of C001-REQ-521 and the detection of C001-REQ-523 and C001-REQ-524 under the
kill and stress conditions of C001-ADR-006 §11 K1 to K6, on every benchmark change and every
operating system of C001-CON-15, and record the results in `bench/results/kill-tests-<date>.md`
(C001-ADR-006 §11 points to that file; the approved ADR is not edited, `10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `test/fault/workspace/ › K1 to K6` | each kill test as an automated suite with a repository manifest (every working-tree path with existence, mode and SHA-256, ignored paths included; `index`, `HEAD`, `packed-refs`, refs) before and after |
| add | `bench/results/kill-tests-<date>.md` | results per label, OS and benchmark change, and a summary with one result line per label and its pass or fail |

## Preconditions
- C001-T-020 and C001-T-018 done.

## Step outline
1. K1: kill the core process (SIGKILL, `TerminateProcess`) at 20 random points during mutation
   testing; compare manifests.
2. K2: as K1 during a test run and during a bundle run. K1 and K2 also run on the W6 fixture of
   C001-T-020, so the kill tests cover the copier's reads of files under a clean filter
   (C001-ADR-006 A1.6).
3. K3: manifest of the test run's workspace before the copy and after mutation testing.
4. K4: Python benchmark with the project installed in editable mode from the working tree; passing
   tests recorded for its changed lines and no ERR-EVID-008.
5. K5: per deep ecosystem, editable install in the workspace; a mutant on a line a passing test
   executes is killed and the self-containment check reports no file.
6. K6: lowered `max_user_watches`, 100,000 files created during a run, an unreadable directory, a
   renamed working-tree root; each cause raised, no ERR-EVID-009 for unchanged paths.

## Verification
- `npm run test:fault -- workspace`

## Done when
- [ ] K1 to K3 show identical manifests in every repetition.
- [ ] K4 to K6 meet their pass conditions.
- [ ] The summary of `bench/results/kill-tests-<date>.md` holds one result line per label, and no
      file under `.sdd/` is changed; a failed label goes to C001-T-024.
