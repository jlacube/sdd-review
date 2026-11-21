---
id: C001-T-104
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Windows 11 self-hosted runner, nightly and closing-commit triggers
milestone: C001-M-01
status: in-progress
depends_on: [C001-T-001, C001-T-002]
implements: [C001-NFR-016]
satisfies_ac: [C001-AC-901.1]
verified_by: [C001-TC-016, C001-TS-901]
components: [C001-COMP-001]
risk_refs: [C001-RISK-020]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-104 — Windows 11 self-hosted runner, nightly and closing-commit triggers

## Intent
Give the CI pipeline of C001-T-001 its Windows 11 x86-64 leg (P-01's answer to Q-ci-02,
`questions-log.md` Round 5): one Windows 11 machine registered as a self-hosted GitHub Actions
runner that runs the nightly and closing-commit suites. The same machine is the Windows 11 host of
E-LAN for C001-NFR-009 (`60-test-plan.md` §3). Split out of C001-T-001 because provisioning six
toolchains on the machine does not fit in that task. `satisfies_ac` names the criterion whose
cross-platform evidence the runner gates (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | self-hosted runner `win11` (repository settings › Actions › Runners) | one Windows 11 x86-64 machine with the GitHub Actions runner application installed as a service, the default labels `self-hosted`, `Windows`, `X64` and the custom label `win11`; toolchains of E-CI (`60-test-plan.md` §3) |
| modify | `.github/workflows/ci.yml › nightly and closing-commit triggers` | `schedule` (nightly), `workflow_dispatch` (closing commit) and pushes of `v*` tags run the full suites on the hosted runners and on `runs-on: [self-hosted, Windows, X64, win11]`; no `pull_request` or fork-triggered job ever targets the self-hosted runner |
| add | `docs/ci/self-hosted-runner.md` | how the runner is registered, provisioned, updated and restarted; who keeps it online (C001-RISK-020) |

## Preconditions
- C001-T-001 done (pipeline exists); C001-T-002 done (the tool versions installed on the runner
  are the confirmed ones).
- One Windows 11 x86-64 machine available to the team, with administrator access for the runner
  installation (Q-ci-02).

## Step outline
1. Register the machine as a repository-level self-hosted runner: install the runner application as
   a service that starts with the machine and runs under a local non-administrator account; add the
   custom label `win11`.
2. Provision the toolchains of E-CI on it: Node.js 22, Python 3.12 with pytest and Ruff, the SDK of the .NET
   line of `10-strategy.md` §4,
   Go, JDK 21 with Maven, git 2.45.1 first on `PATH` with the other git versions beside it, Chrome,
   Edge and Firefox.
3. Add the nightly and closing-commit triggers; the jobs for the self-hosted runner run only on
   `schedule`, `workflow_dispatch` and pushes of `v*` tags (`75-rollout.md` Publish procedure), so
   code from a pull request never runs on the machine (C001-RISK-020). A first job step prints the
   operating-system name and build, so each run records that it ran on Windows 11.
4. Write `docs/ci/self-hosted-runner.md`: registration, provisioning, runner updates, restart, and
   the person who keeps the machine online.

## Verification
- `gh workflow run ci.yml --ref main` (starts the closing-commit form; its `win11` job runs on the self-hosted runner)
- `gh run list --workflow ci.yml --event schedule` (the nightly run exists and names the `win11` job)

## Done when
- [ ] The runner `win11` is listed as online in the repository settings, and a `workflow_dispatch` run
      of the suite completes on it with Windows 11 x86-64 in its operating-system step.
- [ ] No job triggered by `pull_request` targets the label `win11`.
- [ ] `docs/ci/self-hosted-runner.md` names the person who keeps the machine online.
