---
id: C001-T-099
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Risk-weight calibration run
milestone: C001-M-07
status: todo
depends_on: [C001-T-064, C001-T-073, C001-T-108]
implements: [C001-REQ-401, C001-REQ-402, C001-REQ-610]
satisfies_ac: [C001-AC-401.1, C001-AC-402.1, C001-AC-610.1]
verified_by: [C001-TS-401, C001-TS-404, C001-TS-629, C001-TC-026]
components: [C001-COMP-010, C001-COMP-012]
risk_refs: [C001-RISK-021]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-099 — Risk-weight calibration run

## Intent
Calibrate the risk weights by C001-ADR-009 §4 on the seeded calibration corpus of C001-T-106 to
C001-T-108, which is neither the benchmark set nor the sealed G-8 pool: effort-aware recall at 20 %
of changed lines, grid search with leave-one-change-out cross-validation, and the adoption rule;
the priors stay unless the rule adopts new parameters. The calibration runs before the release
candidate is published (C001-T-105), so every measurement of C001-M-07 and the comparison study
use the release weights.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `bench/calibration/ › signal run, grid search and cross-validation` | suite `npm run bench -- calibration` (C001-TC-026); runs the overlap check of C001-T-106 first and stops before any computation on an overlap with `bench/set/benchmark-set.json` or the G-8 pool; metric at 20 % and 50 % |
| add | `bench/results/calibration-<version>.md` | calibration report of C001-ADR-009 §4 item 6: corpus, labels, metric, chosen parameters, adoption decision, and the commit whose static analysis computed the signals |
| modify | `src/core/triage/risk.ts › release weights` | only if the adoption rule adopts new parameters |

## Preconditions
- C001-T-064 and C001-T-073 done (signals and reading order complete in model-free mode).
- C001-T-108 done: the corpus `bench/calibration/corpus.json` holds at least 12 seeded changes with
  their recorded defects; the calibrator is not the seeder.

## Step outline
1. Run the overlap check of the suite; an overlap stops the task and is reported (C001-RISK-021).
2. Derive the defective hunks of each change from the recorded defect lines with the fixed diff of
   C001-ADR-009 §1 and §2 (a hunk is defective when it holds a defect) and write them into the
   corpus.
3. Compute the signals of C001-ADR-009 §3 with the static analysis of the current main-branch
   commit in model-free mode, with each change's test run, exactly as in a review; record that
   commit. Signals do not depend on the weights; C001-T-105 checks that no signal code changed
   between this commit and the release candidate, otherwise this step runs again.
4. Run the grid with cross-validation; apply the adoption rule.
5. Write the report; a weight change is committed in `src/core/triage/risk.ts`, is a release-note
   item (`75-rollout.md` Communication) and keeps C001-REQ-402 (property test C001-TC-450).

## Verification
- `npm run bench -- calibration`
- `npm test -- test/unit/triage/risk.property.test.ts`

## Done when
- [ ] The calibration report is recorded with the chosen parameters, the adoption decision and the
      signal commit.
- [ ] Property tests of monotonicity pass with the release weights.
- [ ] The release weights are committed before C001-T-105 tags the release candidate.
