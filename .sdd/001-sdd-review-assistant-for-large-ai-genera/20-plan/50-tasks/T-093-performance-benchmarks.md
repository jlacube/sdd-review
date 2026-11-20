---
id: C001-T-093
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Performance benchmarks — static analysis, model analysis, memory and evidence runs
milestone: C001-M-07
status: todo
depends_on: [C001-T-069, C001-T-090, C001-T-055, C001-T-105]
implements: [C001-NFR-001, C001-NFR-002, C001-NFR-004, C001-NFR-018]
satisfies_ac: [C001-AC-201.1, C001-AC-505.1]
verified_by: [C001-TS-201, C001-TS-512]
components: [C001-COMP-002, C001-COMP-011, C001-COMP-015]
risk_refs: [C001-RISK-001, C001-RISK-009]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-093 — Performance benchmarks: static analysis, model analysis, memory and evidence runs

## Intent
Produce the benchmark reports of C001-DOD-010, C001-DOD-011, C001-DOD-013 and C001-DOD-014 on the
release candidate with the methods of `10-spec/30-nfr/nfr.md`: 5 cold model-free runs per benchmark
change to the architecture delta shown (≤ 120 s) with memory sampled every 100 ms (≤ 2 GiB); 3 runs
to the last model output with the reference cloud provider (≤ 15 min) and reported times with a
local provider; and C001-NFR-018 (a), (b) and (c) with 3 runs per change.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `bench/nfr/ › suites for C001-NFR-001, C001-NFR-002, C001-NFR-004, C001-NFR-018` | the methods of nfr.md, maximum reported |
| add | `bench/results/release-<version>.md` | benchmark report per DoD item |

## Preconditions
- The release candidate published by C001-T-105 (with the weights of C001-T-099) is the subject;
  every report names its version.
- C001-T-069, C001-T-090 and C001-T-055 done; the reference cloud provider and model named in
  `60-test-plan.md`; benchmark set unchanged since its freeze.

## Step outline
1. Run the static-analysis timing with browser detection of the architecture delta shown.
2. Run memory sampling during those runs.
3. Run the model-assisted timing with the reference cloud provider and with a local provider.
4. Run the evidence timings for (a), (b) and (c) per their protocols.
5. Report each threshold as pass or miss; a miss is reported to P-01 as a defect.

## Verification
- `npm run bench -- nfr-001`
- `npm run bench -- nfr-002`
- `npm run bench -- nfr-004`
- `npm run bench -- nfr-018`

## Done when
- [ ] Each report is recorded with its maximum and pass or miss.
- [ ] Every miss has a defect recorded.
