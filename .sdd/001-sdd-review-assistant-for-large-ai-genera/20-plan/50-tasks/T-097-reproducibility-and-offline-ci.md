---
id: C001-T-097
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Reproducibility comparison and the offline model-free CI run
milestone: C001-M-07
status: todo
depends_on: [C001-T-084, C001-T-055, C001-T-042, C001-T-105]
implements: [C001-NFR-013, C001-NFR-015]
satisfies_ac: [C001-AC-802.1, C001-AC-405.1]
verified_by: [C001-TS-804, C001-TS-805, C001-TS-415, C001-TC-013, C001-TC-015]
components: [C001-COMP-002]
risk_refs: [C001-RISK-017]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-097 — Reproducibility comparison and the offline model-free CI run

## Intent
Produce the evidence of C001-DOD-024 and C001-DOD-026: a CI job with no model provider and network
access disabled that runs every acceptance scenario not requiring a provider and completes the full
review flow on a repository with and one without an SDD workspace; and a CI comparison of 5
model-free analyses of each benchmark change (architecture delta, intent map, static risk scores
equal; timestamps and run identifiers excluded).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `.github/workflows/offline.yml › offline job` | GitHub Actions (Q-ci-01) on `ubuntu-24.04`: build the offline test image with network, then run every step in a container started with `--network none` (loopback only) and no model provider configured (E-OFF of `60-test-plan.md` §3) |
| add | `test/offline/Dockerfile › offline test image` | contents, all fetched while the image is built: Node.js 22, git 2.45.1 and git 2.34.0, Python 3.12 with pytest, the SDK of the .NET line of `10-strategy.md` §4; the review assistant built from the commit under test with its npm dependencies (`npm ci`) and the test tools (Cucumber.js, Playwright with its Chrome build for browser scenarios that list E-OFF); the reference repositories of `30-nfr/nfr.md` §0 at the commits of `bench/set/benchmark-set.json` with every benchmark change of that file (`bench-ts`, `bench-py`, `bench-cs`: agent commits, plan and transcript files, and for `bench-ts` its SDD change); the ignored dependencies of each benchmark change installed as its environment in `bench/set/environments/` names them (`node_modules/`, the Python virtual environment, restored NuGet packages); StrykerJS and Stryker.NET at the versions confirmed by C001-T-002 and the coverage tools of C001-ADR-007 (the Python mutation engine and hook ship with the package). Fixture repositories are built at test time by the fixture builder of C001-T-004 and need no network |
| add | `bench/reproducibility/ › comparison` | the `reproducibility` suite used since C001-T-042, over all three documents, on every benchmark change of `bench/set/benchmark-set.json` |
| add | `test/acceptance/full-flow/ › intake-to-verdict flows` | flow 1 on `bench-ts` (with an SDD workspace, reviewed with its SDD change held in the snapshot) and flow 2 on `bench-py` (without one), each started with its intake and in its environment of `30-nfr/nfr.md` §0 |

## Preconditions
- C001-T-084 (flow to verdict), C001-T-055 and C001-T-042 done; the release candidate of
  C001-T-105 is the subject of the closing-commit runs.

## Step outline
1. Tag scenarios that require a provider; run all others offline.
2. Build the offline test image with the contents of the Targets table; check in the job that a
   network call from the container fails before the first scenario starts.
3. Script the two full flows to a verdict on `bench-ts` (with an SDD workspace) and `bench-py`
   (without one), in their intake and environment, inside the offline image (C001-TC-013 (b), E-OFF
   of `60-test-plan.md` §3).
4. Run the 5-analysis comparison per benchmark change in CI.

## Verification
- `npm run acceptance -- --offline`
- `npm run bench -- reproducibility`

## Done when
- [ ] The offline run passes 100 % of its scenarios and both full flows (`bench-ts`, `bench-py`),
      with the network check of step 2 green.
- [ ] The 5 analyses are equal for each benchmark change.
