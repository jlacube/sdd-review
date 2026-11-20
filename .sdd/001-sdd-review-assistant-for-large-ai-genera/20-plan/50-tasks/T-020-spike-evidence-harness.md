---
id: C001-T-020
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Spike — coverage and mutation harness for the workspace measurements
milestone: C001-M-01
status: todo
depends_on: [C001-T-016, C001-T-019, C001-T-017, C001-T-013]
implements: [C001-NFR-018]
satisfies_ac: [C001-AC-506.1, C001-AC-514.1, C001-AC-512.1]
verified_by: [C001-TS-516, C001-TS-539, C001-TS-532]
components: [C001-COMP-011, C001-COMP-014]
risk_refs: [C001-RISK-001, C001-RISK-016]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-020 — Spike: coverage and mutation harness for the workspace measurements

## Intent
W2 to W4 of C001-ADR-006 §11 need a test run with per-test coverage, mutation testing in the copy
and bundle commands in the workspace. This spike builds the smallest harness that reproduces their
cost on the production workspace, copier, observer, runner and store: prototype per-test coverage
injection per ecosystem as C001-ADR-007 §2 describes, StrykerJS and Stryker.NET runs in the
mutation copy, a minimal Python mutation engine with the operators of C001-ADR-007 §3, and a bundle
loop that saves each result as a revision.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `spikes/evidence/coverage/ › prototype injections` | Node preload, Python hook with coverage.py contexts, .NET targets with AltCover; enough to give per-test line data on the benchmark changes |
| add | `spikes/evidence/mutation/ › tool runs` | StrykerJS and Stryker.NET configuration in the copy with line ranges and the worker count of C001-ADR-006 §8; Python engine prototype, one process per mutant |
| add | `spikes/evidence/bundle/ › bundle loop` | 10 fixed-text commands in the test run's workspace, each result saved through C001-COMP-014 |
| add | `spikes/evidence/filtered/ › covered-file fill and reset` | for W6 (C001-ADR-006 A1.6): copier of C001-T-016 applied to one file, SHA-256 hash and size check of the copy, G-15 read before and after the copy, in the order of C001-ADR-006 A1.4 |
| add | `bench/fixtures/w6-filtered/ › W6 fixture` | a benchmark change of C001-NFR-005 with added Git LFS files and files under another clean filter; used by W6 in C001-T-021 and by K1 and K2 in C001-T-022 |
| add | `spikes/evidence/README.md` | what is spike-grade, what C001-T-057 to C001-T-065 and C001-T-067 must replace |

## Preconditions
- C001-T-013, C001-T-016, C001-T-017, C001-T-019 done; Stryker tools installed on the reference
  machine; C001-T-002 confirmed tool licences and versions.

## Step outline
1. Build the prototype injections and check that per-test data appears for the changed files of
   each benchmark change.
2. Run the mutation tools in the copy on the executed changed lines in two tiers.
3. Build the bundle loop with reset, check, observation window and revision save per command.
4. Build the W6 fixture and the covered-file fill and reset of the spike.
5. Instrument every step with timings that W1 to W6 need.

## Verification
- `npm run bench -- spike-evidence --dry-run`

## Done when
- [ ] Each benchmark change yields per-test coverage, mutant results and bundle results through the harness.
- [ ] Every step reports its own timing for C001-T-021.
