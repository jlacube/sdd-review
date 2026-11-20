---
id: C001-T-098
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Open-share measurement on the benchmark changes
milestone: C001-M-07
status: todo
depends_on: [C001-T-069, C001-T-061, C001-T-070, C001-T-105]
implements: [C001-NFR-005]
satisfies_ac: [C001-AC-602.1, C001-AC-410.1]
verified_by: [C001-TS-605, C001-TS-435]
components: [C001-COMP-010, C001-COMP-012, C001-COMP-011]
risk_refs: [C001-RISK-011]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-098 — Open-share measurement on the benchmark changes

## Intent
Produce the evidence of C001-DOD-015: measure the open share of each benchmark change by the method
of C001-NFR-005 (steps 1 to 5, including the validity rule), with the split by first reason, and
test assumption C001-AS-07 (≤ 30 % reachable under the built-in guarded areas).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `bench/nfr/open-share/ › measurement` | steps 1 to 5 of the Method, split per reason in the order of the Metric |
| add | `bench/results/open-share-<version>.md` | total and split per benchmark change; environment-fault reruns |

## Preconditions
- C001-T-069, C001-T-061 and C001-T-070 done; mutation tools installed on the reference machine;
  the release candidate of C001-T-105 is the subject and its version is named in the report.

## Step outline
1. Start each review in its environment and intake; wait for the test run and mutation testing.
2. Record the judgement "expresses" on every intent with test hunks, without other actions.
3. Read the total and the split; check validity (working-tree execution, installed copy) and
   rerun after correcting the environment where §0 was broken.
4. Report pass or miss; a miss follows the "If wrong" path of C001-AS-07 through P-01.

## Verification
- `npm run bench -- nfr-005`

## Done when
- [ ] Each benchmark change has a valid measurement with total and split.
- [ ] The result is pass (≤ 30 %) or a defect is recorded for P-01.
