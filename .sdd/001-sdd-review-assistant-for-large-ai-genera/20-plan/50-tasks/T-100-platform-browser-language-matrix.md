---
id: C001-T-100
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Operating-system, browser and language coverage runs
milestone: C001-M-07
status: todo
depends_on: [C001-T-084, C001-T-091, C001-T-069, C001-T-104, C001-T-105]
implements: [C001-NFR-008, C001-NFR-016, C001-NFR-017]
satisfies_ac: [C001-AC-212.1, C001-AC-804.1]
verified_by: [C001-TS-226, C001-TS-227, C001-TS-809, C001-TC-008, C001-TC-016, C001-TC-017]
components: [C001-COMP-001, C001-COMP-007, C001-COMP-019]
risk_refs: [C001-RISK-007, C001-RISK-014, C001-RISK-017, C001-RISK-020]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-100 — Operating-system, browser and language coverage runs

## Intent
Produce the evidence of C001-DOD-019, C001-DOD-027 and C001-DOD-028: the full acceptance suite on
Windows 11 x86-64, macOS 14+ x86-64 and arm64, and Ubuntu 22.04+ x86-64; the review UI scenarios in
the two latest major versions of Chrome, Edge and Firefox at release; the language-specific
scenarios on the reference repository of each deep ecosystem; and one full flow on the repository
outside the deep ecosystems with each reduced result labelled. The Windows 11 evidence is the
closing-commit run on the self-hosted runner `win11` of C001-T-104 (Q-ci-02); the hosted
`windows-2025` runs do not count as Windows 11 evidence (`60-test-plan.md` §5, C001-NFR-016 row).

## Targets
| Kind | Target | Change |
|---|---|---|
| modify | `.github/workflows/ci.yml › release matrix` | GitHub Actions (Q-ci-01, Q-ci-02): the Windows 11 x86-64 leg runs on `runs-on: [self-hosted, Windows, X64, win11]`, the other kinds on hosted runners; browser versions pinned to the two latest majors at release; hostile-repository test of C001-T-005 on the latest git release |
| add | `test/acceptance/language/ › reference-repository runs` | tagged language-specific scenarios per ecosystem |
| add | `bench/results/matrix-<version>.md` | pass share per OS, browser and ecosystem |

## Preconditions
- C001-T-084, C001-T-091 and C001-T-069 done; the release candidate of C001-T-105 is the subject
  (the runs start on its tag).
- The self-hosted runner `win11` is online and its nightly runs of the last week are green or their
  failures are reported as defects (C001-RISK-020).

## Step outline
1. Tag the scenarios that depend on language-specific signals with `@language` (every scenario
   whose fixture is an `fx-shop-*` or `shop-*` repository; C001-TC-008).
2. Run them on each deep-ecosystem reference repository with the fixture builder's base option of
   C001-T-004 (`--repo typescript`, `--repo python`, `--repo csharp`): the builder starts from the
   reference repository at the commit recorded in `bench/set/benchmark-set.json` and writes each
   scenario's declared files on top.
3. Run the full flow on the repository outside the deep ecosystems; check every reduced label.
4. Run the full suite on each OS and the UI scenarios in each browser. For Windows 11 x86-64, start
   the closing-commit run with `workflow_dispatch` on the tag of the release candidate published by
   C001-T-105 (`75-rollout.md` Migration step 2); it runs on the runner `win11`, and its
   operating-system step (C001-T-104) is copied into the matrix record. The CI run
   of the tag `v1.0.0` (C001-T-103) repeats the suites on the runner `win11` before publication.
5. Run the hostile-repository test of C001-T-005 on the latest git release at release time
   (C001-RISK-014); a runner kind that is no longer offered is run on a self-hosted runner and
   reported to P-01 (C001-RISK-017).

## Verification
- `npm run acceptance -- --tags @language --repo typescript --repo python --repo csharp`
- `npm run acceptance -- --scenario C001-TS-226 --scenario C001-TS-227 --scenario C001-TS-809`
- `npm run acceptance:browser -- --all-browsers`
- `gh workflow run ci.yml --ref v1.0.0-rc.<n>` (closing-commit run on the tag of the release candidate, including the `win11` job)

## Done when
- [ ] 100 % pass on each OS, each browser and each deep ecosystem; the outside-language flow completes.
- [ ] The Windows 11 x86-64 row of `bench/results/matrix-<version>.md` comes from the closing-commit
      run on the runner `win11` and names the Windows 11 build it ran on.
