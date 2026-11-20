---
id: C001-T-096
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Fault-injection test of review-state durability
milestone: C001-M-07
status: todo
depends_on: [C001-T-080, C001-T-081, C001-T-105]
implements: [C001-NFR-014]
satisfies_ac: [C001-AC-918.1, C001-AC-920.1]
verified_by: [C001-TS-939, C001-TS-944]
components: [C001-COMP-002, C001-COMP-014]
risk_refs: [C001-RISK-019]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-096 — Fault-injection test of review-state durability

## Intent
Produce the evidence of C001-DOD-025: a scripted session of 200 recorded actions taking each of the
ten kinds at least 5 times, the analysis core killed at a random point, 20 repetitions per supported
operating system; the confirmed entries and the state they set compared with the resumed review.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `test/fault/session-200/ › fault-injection suite` | session generator, random kill, resume, comparison |
| add | `bench/results/fault-<version>.md` | per OS: repetitions, confirmed entries, found entries |

## Preconditions
- C001-T-080 and C001-T-081 done; the release candidate of C001-T-105 is the subject (its tag runs
  the nightly and closing-commit suites, the runner `win11` included).

## Step outline
1. Generate sessions covering the ten action kinds.
2. Kill the core process at a random point; record which actions were confirmed.
3. Resume and compare entries and the state they set.
4. Run 20 repetitions on each OS of C001-NFR-016.

## Verification
- `npm run test:fault -- session-200`

## Done when
- [ ] 100 % of confirmed entries are present with their state in every repetition on every OS.
