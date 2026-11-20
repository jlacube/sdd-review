---
id: "C001-PLAN-TEST"
artifact: plan/test-plan
change: "CHG-001"
phase: 20-plan
status: draft
---
# CHG-001 — Test plan

Inputs: the acceptance scenarios of `10-spec/20-capabilities/*/acceptance.md`, the NFRs of
`10-spec/30-nfr/nfr.md`, the DoD of `10-spec/70-dod.md`, the strategy and toolchain of
`10-strategy.md` §4, the tasks of `50-tasks/`, C001-ADR-004 (hostile-repository test), C001-ADR-006
§11 and Amendment 1 (W1 to W6, K1 to K6), and the CI choice Q-ci-01 (`questions-log.md` Round 4:
GitHub Actions hosted runners).

## 1. Scope and levels

The `Level` column uses the level vocabulary that `sdd lint` checks (unit, integration, e2e, eval,
manual). The `Kind` column gives the finer kind of this plan; each kind maps to one level.

| Kind | Level | Meaning | Count | Runner |
|---|---|---|---|---|
| unit | unit | One module of `src/`, no git process, no browser; property tests with fast-check | 8 | Vitest, `npm test -- <path>` |
| integration | integration | One component against real git, file system, OS services or a kill signal; no UI | 12 | Vitest, `npm test -- test/integration/<area>`, `npm run test:fault -- <suite>` |
| acceptance | e2e | Gherkin scenarios of the acceptance files run by scenario ID against the built CLI and core, outcomes read from the headless output, exit codes and files | 188 | Cucumber.js, `npm run acceptance -- --scenario <TS-ID>`, `npm run test:security -- <suite>` |
| browser | e2e | Gherkin scenarios whose outcome is read from the review UI page, driven by Playwright | 44 | Cucumber.js with Playwright, `npm run acceptance:browser -- --scenario <TS-ID>` |
| benchmark | eval | Timed or measured runs against an NFR threshold on the benchmark set | 9 | `npm run bench -- <suite>` |
| manual | manual | Human sessions of the comparison study (`30-nfr/nfr.md` §3) | 1 | Study moderator, protocol of §6 |

Total: 262 test cases. Every scenario (TS) of the acceptance files maps to at least one TC (§4).

**TC numbering (one block, stated here; no TC was allocated with `sdd id next`).**
C001-TC-<req-seq> is the main test case of requirement C001-REQ-<req-seq> (for example C001-TC-117
for C001-REQ-117); it covers the scenarios of that requirement's acceptance criterion.
The ranges `TC-150…199`, `TC-350…399`, …, `TC-950…999` hold further test cases of capability 1 to 9
(a browser split, a unit or an integration test). The range `TC-001…049` holds cross-cutting test
cases (NFR measurements, ADR test cases); C001-TC-001 to C001-TC-026 are used. Numbers left free in
a range are not used; the CLI continues after the highest defined TC on its next `sdd id next TC`.

**Location conventions.** Step bindings of the acceptance and browser kinds live in
`test/acceptance/steps/cap-<nn>/req-<seq>.steps.ts` (browser: `.ui.steps.ts`); the Gherkin text is
read from the acceptance files by scenario ID (C001-T-004), never copied. Exception: the bindings
of the security scenarios of C001-REQ-905 to C001-REQ-907 live with the security suites of
C001-T-092 (`test/security/sockets/`, `test/security/origin/`). The directory follows the level
(`10-strategy.md` §4): unit tests under `test/unit/<area>/`, integration tests under
`test/integration/<area>/` with the same `<area>` name the task uses for its unit tests (for example
`git`, `evidence/workspace`, `model/keys`), security suites under `test/security/`, kill and fault
tests under `test/fault/`, measurements under `bench/`, spikes under `spikes/`, study material under
`study/g8/`. A test that starts a git process, uses real file-system notification, a credential
store or a kill signal is an integration test, whatever task adds it.

**Per-requirement unit tests (constitution, test levels).** The unit tests of a requirement are the
`test/unit/<area>/` targets of the tasks whose `implements` lists that requirement; the task file is
the link from requirement to test path, and its Verification command runs them. Two rules make the
link checkable in the code as well:
1. The top-level `describe` title of every file under `test/unit/` and `test/integration/` starts
   with the IDs of the requirements whose logic the file tests (for example
   `describe('C001-REQ-402 risk score is monotone', …)`); a file that tests shared code with no
   requirement of its own starts with the component ID (`C001-COMP-010 …`).
2. At the closing commit, the reviewer of C001-T-103 lists the requirements of CAP-01 to CAP-09 that
   no `describe` title names, from the Vitest JSON report of `npm test`; each one is either given a
   unit test or recorded in the review record as having no logic outside what its acceptance
   scenarios exercise (for example a requirement that only shows a stored value), with the reason.

The unit and integration TCs of §4 are the tests whose data set (properties, boundaries, OS
services) this plan fixes; the other unit tests are traced through rule 1 and the task files, not
as TCs.

**Task files.** The task template has no `tc_refs` field. `verified_by` holds the planner's TS IDs
and, in the task files that automate a TC of this plan, that TC's ID as well (for example
C001-T-005, C001-T-015 to C001-T-019, C001-T-086, C001-T-100). Each TC names the task that
automates it in the `Task` column, which `sdd trace` reads; that column is the complete link.

## 2. Fixtures

All fixture repositories are built by the fixture builder of C001-T-004
(`test/fixtures/builder/`) from declarative files in `test/fixtures/repos/<name>/`, on the
developer's git and outside the system under test. Content of each fixture: the file named.

| Fixture | Defined in | Used by |
|---|---|---|
| `fx-intake`, `fx-local`, `fx-default`, `fx-lfs`, `fx-crypt` | CAP-01 acceptance, fixture conventions | CAP-01 |
| `fx-branches`, `fx-upstream`, `fx-empty`, `fx-size`, `plain-folder` (a directory outside any git working tree) | CAP-01 acceptance, the scenarios naming them | CAP-01 |
| git program variants: no `git` on `PATH`, an unstartable `git`, git 2.33, 2.34.0, 2.45.1 (default) and the latest release, an unreadable version text | CAP-01 acceptance (C001-REQ-125 scenarios) | CAP-01, C001-TC-024 |
| `fx-sdd`, `fx-nosdd`, `fx-sdd-archived`, `fx-sdd-empty`, `fx-sdd-007` | CAP-03 acceptance (and CAP-01 for `fx-sdd`) | CAP-01, CAP-02, CAP-03 |
| `fx-neutral`, `fx-shop-ts`, `fx-shop-py`, `fx-shop-cs`, `fx-shop-doc`, `fx-shop-doc-nolayers`, `fx-sdd-nopaths`, `fx-neutral-nopaths` | CAP-02 acceptance | CAP-01, CAP-02, CAP-03 |
| `shop-ts`, `shop-py`, `shop-cs`, `tool-go`, `scored-pairs-ts`, `shop-ts-model` | CAP-04 acceptance, fixtures table | CAP-04, CAP-05, CAP-06 |
| `svc-java`, `agent-log.md`, `shop-lfs`, the repository record | CAP-05 acceptance, fixtures table | CAP-05 |
| `sample-ts` | CAP-06 acceptance | CAP-06 |
| `verdicts`: the repository of the CAP-07 preamble (SDD change whose requirements are the intents `"REQ-012"`, `"REQ-013"`, …) | CAP-07 acceptance, preamble (unnamed there; named here) | CAP-07 |
| `surfaces`: the git repositories of the CAP-09 scenarios; the browser launcher test double | CAP-09 acceptance, preamble (unnamed there; named here) | CAP-09 |
| `stub-llm` (model `stub-model-1`), the local stub (`127.0.0.1:11434`), the cloud stub (`llm.cloud.test`) | CAP-01 and CAP-08 acceptance, preambles | CAP-01 to CAP-04, CAP-08, CAP-09 |
| `fx-hostile`: repository with configured fsmonitor, clean and smudge filters, textconv, external diff, pager, hooks, credential helper and promisor remote, each a probe that records its start | C001-ADR-004 Consequences | C001-TC-024 |
| benchmark set `bench/set/benchmark-set.json` with intake and environment per benchmark change, on the reference repositories of `30-nfr/nfr.md` §0 | `30-nfr/nfr.md` §0, built by C001-T-013 | C001-TC-001 to C001-TC-006, C001-TC-008, C001-TC-011, C001-TC-012, C001-TC-013, C001-TC-015, C001-TC-018, C001-TC-019 |
| calibration corpus `bench/calibration/corpus.json`: at least 12 agent changes (4 per deep ecosystem) of 2,000 to 10,000 changed lines, each produced by a coding agent from a written task description, with its repository and commit range, test command and environment written as `30-nfr/nfr.md` §0 writes them for benchmark changes; at least 8 seeded defects per change covering the six kinds of `30-nfr/nfr.md` §3 item 3, each recorded with file and lines, plus the unseeded defects the seeder notices while seeding, read in a plain diff with no full review of the change (C001-ADR-009 §4 item 1; C001-T-107 step 2); per change, the list of defective hunks (a hunk is defective when it holds a defect), derived from the recorded lines by C001-T-099; the corpus builder and the seeder named. Independence: no change shares a commit range or a task description with a benchmark change of `bench/set/benchmark-set.json` or a change of the G-8 pool record `study/g8/pool.json` (§6), checked by `npm run bench -- calibration --check-overlap`; the seeder is the calibration seeder of C001-T-107 and C001-T-108, appointed by P-01, and is not the calibrator of C001-T-099 | C001-ADR-009 §4 item 1; changes built by C001-T-106, defects seeded and recorded by C001-T-107 (changes 1 to 6) and C001-T-108 (changes 7 to 12 and any beyond), validated by `npm run bench -- calibration --validate-corpus`; calibration run C001-T-099 | C001-TC-026 |
| `bench-lfs`: a benchmark change with added Git LFS files and files of another filter | C001-ADR-006 Amendment 1 (W6) | C001-TC-019, C001-TC-020 |
| study changes A to D and the practice change | `30-nfr/nfr.md` §3, §6 of this plan; produced and frozen by C001-T-110 (`study/g8/pool.json`), seeded by C001-T-111 | C001-TC-007 |

## 3. Environments

| Code | Environment |
|---|---|
| E-CI | GitHub Actions acceptance workflow, matrix of the four runner kinds of C001-NFR-016: Windows x86-64 in two forms (Q-ci-02): the hosted `windows-2025` image (Windows Server) on every push and pull request, and one Windows 11 x86-64 machine registered as a self-hosted GitHub Actions runner that runs the nightly and closing-commit suites (C001-T-104 registers it under the label `win11` and provisions the toolchains below on it), macOS 14 or later x86-64 (hosted Intel image, at the time of writing `macos-15-intel`; C001-T-001 confirms the label), macOS 14 or later arm64 (`macos-15`), Ubuntu 22.04 or later x86-64 (`ubuntu-24.04`). Node.js 22 on every runner kind, Node.js 24 on `ubuntu-24.04`. Toolchains for the fixtures: Python 3.12 with pytest, the .NET SDK of the .NET line of `10-strategy.md` §4 (confirmed by C001-T-002), Go, JDK 21 with Maven; git 2.45.1 first on `PATH`, other git versions installed beside it. Runs on every push and pull request on the hosted runner kinds, and nightly and at the closing commit on the hosted runner kinds and the Windows 11 self-hosted runner; model-free unless a scenario names a stub. Browser scenarios run here in Chrome headless. |
| E-OFF | Offline job `.github/workflows/offline.yml` (C001-NFR-013, C001-T-097): `ubuntu-24.04`, the test image built with all dependencies, then every run in a container started with `--network none` (loopback only), no model provider configured. (a) Scenario run, `npm run acceptance -- --offline`: every scenario of a TC that lists E-OFF except the scenarios that name `stub-llm`, the local stub, the cloud stub or `shop-ts-model` (tag `@model`, set by the harness from the scenario text); on every push to the main branch and at the closing commit. (b) Full-flow run, `test/acceptance/full-flow/`: the test image also holds the reference repositories of `30-nfr/nfr.md` §0 with the benchmark changes of `bench/set/benchmark-set.json`, the ignored dependencies installed as each benchmark change's environment names them, and the mutation-testing tools of the deep ecosystems, all fetched while the image is built; nightly and at the closing commit. |
| E-BR | Browser workflow (C001-NFR-017): the two latest major versions of Chrome on `ubuntu-24.04` (Chrome for Testing builds), Edge on `windows-2025` (Edge for Business installers of the current and the previous major) and Firefox on `macos-15` (Mozilla release archive); the browser versions are written into each report. Current majors on every push; both majors nightly and at the closing commit. |
| E-NET | Isolated test network for the cloud stub: on `ubuntu-24.04` a Docker network created with `--internal` holds the cloud stub as host `llm.cloud.test`; on the Windows and macOS runners `llm.cloud.test` resolves through a hosts entry to a stub bound to the runner's own non-loopback address. Per-process network capture as in C001-TC-011. |
| E-LAN | Second host on the same network (C001-NFR-009 (b)), one run per operating system of C001-NFR-016, the review assistant running a review in its default configuration on the machine under test and the second host running `npm run test:security -- second-host --target <address>` against every port the review assistant listens on (executor: owner of C001-T-092). Ubuntu 22.04 or later x86-64: in CI on `ubuntu-24.04`, a container on a bridged Docker network as the second host (the alternative the NFR's method names), nightly and at the closing commit. Windows 11 x86-64: at release, the self-hosted runner `win11` of E-CI (Q-ci-02) with a second host on the same LAN. macOS 14 or later x86-64 and macOS 14 or later arm64: once per release candidate, on rented cloud Macs (Q-secondhost-01, `questions-log.md` Round 7), for example an EC2 mac1 dedicated host (x86-64) and an EC2 mac2 dedicated host (arm64) in one virtual network, with a Linux instance in the same network as the second host; the hosted macOS runners offer neither Docker nor nested virtualisation, so neither a container nor a second host can reach them there. Prerequisites: a cloud account able to allocate both Mac dedicated hosts, held by the owner of C001-T-092, and a budget for the minimum billing period of 24 h per Mac dedicated host and use. Each run records the operating system, version and architecture of the machine under test. |
| E-REF | The reference machine of `30-nfr/nfr.md` §0 (8 logical cores, 16 GiB, SSD, no other user workload) running Ubuntu 24.04 LTS x86-64, with the benchmark set and its environments; measurements started with `npm run bench -- <suite>` (or the suite command the TC names) by the owner of the task named in the TC. Model-free unless the TC names a provider. Browsers for C001-NFR-003: the Linux builds of the two latest major versions of Chrome (Chrome for Testing), Edge (Microsoft's Linux package repository keeps the previous major) and Firefox (Mozilla release archive), installed side by side at the freeze of the release candidate; each report records the exact versions. |
| E-REF-CLOUD | E-REF with network access to the reference cloud provider of §5 (C001-NFR-002), the API key in an environment variable (C001-REQ-809), never in a file of the repository. |
| E-STUDY | The study sessions of §6 on the reference machine or a participant machine meeting it. |

**OS-specific scenarios.** A scenario that names an operating system (for example C001-TS-193 on
Linux and macOS, C001-TS-590 on Windows) runs on the runner kinds it names and is reported as not
applicable on the others; C001-TC-016 counts it once per runner kind it applies to.

## 4. Test cases

`TS` is the first scenario covered; `Further TS` lists the other scenarios of the same TC
(short IDs of this change). Fixture names: §2. Environment codes: §3.

### 4.1 Cross-cutting test cases (NFR measurements and ADR test cases)

| TC | TS | Further TS | Level | Kind | Location | Test data | Environment | Task |
|---|---|---|---|---|---|---|---|---|
| C001-TC-001 | C001-TS-201 | — | eval | benchmark | `bench/nfr/` suites `nfr-001` and `nfr-004`; report `bench/results/release-<version>.md` | benchmark set; cold start, 5 runs per benchmark change; memory sampled every 100 ms (C001-NFR-001, C001-NFR-004) | E-REF | C001-T-093 |
| C001-TC-002 | C001-TS-201 | — | eval | benchmark | `spikes/parse/`, `npm run bench -- spike-parse` | benchmark set; both sides of each benchmark change parsed with the tree-sitter parsers; git reads G-07 and G-09 timed (C001-ADR-001 spike) | E-REF | C001-T-014 |
| C001-TC-003 | C001-TS-202 | TS-237, TS-317, TS-332, TS-351 | eval | benchmark | `bench/nfr/` suite `nfr-002`, configuration `bench/nfr/nfr-002.config.json`; report `bench/results/release-<version>.md` | benchmark set; 3 runs per benchmark change with the reference cloud model pinned as §5 states and 3 with the reference local provider (C001-NFR-002) | E-REF-CLOUD | C001-T-093 |
| C001-TC-004 | C001-TS-904 | TS-920, TS-905, TS-921 | eval | benchmark | `bench/ui/session-500.ts`, `npm run bench -- nfr-003`; report `bench/results/ui-<version>.md` | scripted 500-action session per 10,000-line benchmark change; browser performance marks (C001-NFR-003) | E-REF, in each of the two latest major versions of Chrome, Edge and Firefox (six browser versions, §3 E-REF) | C001-T-094 |
| C001-TC-005 | C001-TS-920 | — | eval | benchmark | `spikes/ui/`, `npm run bench -- spike-ui`; report `spikes/ui/RESULTS.md` | hunk list and file context of the largest benchmark change, virtualised list (C001-ADR-002 prototype), scripted session of at least 200 actions | E-REF, in Chrome, Edge and Firefox (latest major each; a spike, not the NFR evidence) | C001-T-023 |
| C001-TC-006 | C001-TS-605 | TS-435, TS-606 | eval | benchmark | `bench/nfr/` suite `nfr-005`; report `bench/results/open-share-<version>.md` | benchmark set with test commands, intake and environment of §0; method steps 1 to 5 of C001-NFR-005 | E-REF | C001-T-098 |
| C001-TC-007 | C001-TS-629 | TS-301 | manual | manual | `study/g8/` (protocol materials), `study/g8/tutorial.md`, `study/g8/record/`, `study/g8/RESULTS.md`; `npm run study -- g8-check-record --rows <list>`, `npm run study -- g8-analyse` | study changes A to D with sealed defect lists; practice change | E-STUDY | C001-T-109, C001-T-110, C001-T-111, C001-T-112, C001-T-113, C001-T-114, C001-T-115, C001-T-116, C001-T-102 |
| C001-TC-008 | C001-TS-226 | TS-227, TS-809 | e2e | acceptance | `.github/workflows/ci.yml` › release matrix (language legs), `test/acceptance/language/`; report `bench/results/matrix-<version>.md` | (a) scenarios tagged `@language` (every scenario whose fixture is an `fx-shop-*` or `shop-*` repository), per deep ecosystem, run with `npm run acceptance -- --tags @language --repo <ecosystem>`: the fixture builder takes the reference repository of that ecosystem at its recorded commit as the base and writes the scenario's declared files on top; (b) one scripted full flow on the reference repository outside the deep ecosystems (C001-NFR-008) | E-CI, E-REF | C001-T-100 |
| C001-TC-009 | C001-TS-907 | TS-908, TS-909 | e2e | acceptance | `test/security/sockets/`, `npm run test:security -- sockets` and `npm run test:security -- second-host --target <address>` | `surfaces`; socket listing of every process of the review assistant; connection attempt to every listening port from the second host (C001-NFR-009) | E-CI (socket listing on every runner kind), E-LAN (second host on each of the four operating systems) | C001-T-092 |
| C001-TC-010 | C001-TS-912 | TS-910, TS-914, TS-915, TS-916 | e2e | browser | `test/security/origin/`, `npm run test:security -- origin` | one request per operation of `10-spec/50-interfaces/openapi.yaml`, sent from a page of another origin and through a host name that resolves to 127.0.0.1 (C001-NFR-010) | E-BR | C001-T-092 |
| C001-TC-011 | C001-TS-806 | TS-807, TS-808, TS-917 | e2e | acceptance | `test/security/egress/`, `npm run test:security -- egress`; report `bench/results/egress-<version>.md` with the capture files | full flow on each benchmark change, once with no provider and once with the reference local provider; eBPF trace of `connect` on the review assistant's process tree and the browser net log (C001-NFR-011) | E-REF | C001-T-095 |
| C001-TC-012 | C001-TS-835 | TS-814, TS-836, TS-837, TS-838, TS-850 | e2e | acceptance | `test/security/egress/cloud-stub/`, `npm run test:security -- egress`; report `bench/results/egress-<version>.md` with the recorded requests | full flow against the recording cloud stub; marker strings in files on model-excluded paths (C001-NFR-012) | E-REF with E-NET | C001-T-095 |
| C001-TC-013 | C001-TS-804 | TS-805 | e2e | acceptance | `.github/workflows/offline.yml`, `test/acceptance/full-flow/`; `npm run acceptance -- --offline` | (a) every scenario without the `@model` tag, each on the repository its Given steps build (§2); (b) full flow, intake to verdict, on the benchmark change with an SDD workspace and on a benchmark change without one (`bench/set/benchmark-set.json`, on the reference repositories of `30-nfr/nfr.md` §0), each started with its intake and in its environment of §0 (C001-NFR-013) | E-OFF | C001-T-097 |
| C001-TC-014 | C001-TS-944 | TS-939, TS-949, TS-945 | e2e | acceptance | `test/fault/session-200/`, `npm run test:fault -- session-200`; report `bench/results/fault-<version>.md` | `surfaces`; scripted session of 200 recorded actions, each of the ten kinds of C001-REQ-721 at least 5 times; kill at a seeded random point; 20 repetitions (C001-NFR-014) | E-CI (nightly and closing commit) | C001-T-096 |
| C001-TC-015 | C001-TS-418 | TS-415, TS-927, TS-941 | e2e | acceptance | `bench/reproducibility/` | 5 model-free analyses of each benchmark change; machine-readable results compared with timestamps and run identifiers removed (C001-NFR-015) | E-CI (`ubuntu-24.04`, nightly and closing commit) | C001-T-097 |
| C001-TC-016 | C001-TS-901 | TS-928 | e2e | acceptance | `.github/workflows/ci.yml` › acceptance matrix report | every scenario on every runner kind (C001-NFR-016); hosted runner kinds set up by C001-T-001, the Windows 11 self-hosted runner `win11` by C001-T-104 | E-CI | C001-T-100, C001-T-001, C001-T-104 |
| C001-TC-017 | C001-TS-904 | TS-920, TS-924 | e2e | browser | `.github/workflows/ci.yml` › release matrix (browser legs), `npm run acceptance:browser -- --all-browsers`; report `bench/results/matrix-<version>.md` | every browser-kind scenario in each browser and major version (C001-NFR-017) | E-BR | C001-T-100 |
| C001-TC-018 | C001-TS-512 | TS-539, TS-532, TS-583 | eval | benchmark | `bench/nfr/` suite `nfr-018`; report `bench/results/release-<version>.md` | benchmark set with test commands; (a), (b) and (c) of C001-NFR-018, 3 runs per benchmark change, at least one (c) run during and one after mutation testing; preparation times reported | E-REF | C001-T-093 |
| C001-TC-019 | C001-TS-512 | TS-539, TS-532 | eval | benchmark | `bench/workspace/`, `npm run bench -- workspace-w<n>`; results `bench/results/workspace-<date>.md`, the results file named in C001-T-021 (C001-ADR-006 Amendment 2 A2.1; no result is written into the ADR) | benchmark set and `bench-lfs`; measurements W1 to W6 of C001-ADR-006 §11 and Amendment 1 | E-REF; reports from every runner kind of E-CI | C001-T-021, C001-T-020 |
| C001-TC-020 | C001-TS-559 | TS-561, TS-562 | integration | integration | `test/fault/workspace/` (K1 to K3), `npm run test:fault -- workspace`; results `bench/results/kill-tests-<date>.md`, the results file named in C001-T-022 (C001-ADR-006 Amendment 2 A2.1; no result is written into the ADR) | benchmark set and `bench-lfs`; kill tests K1 to K3 of C001-ADR-006 §11 (core killed at 20 random points; working tree, `index`, `HEAD`, `packed-refs`, refs and the test run's workspace manifest compared) | E-CI, E-REF | C001-T-022 |
| C001-TC-021 | C001-TS-567 | — | integration | integration | `test/fault/workspace/` (K4), `npm run test:fault -- workspace`; results `bench/results/kill-tests-<date>.md` | Python benchmark change with the project installed in editable mode from the working tree (K4) | E-CI, E-REF | C001-T-022 |
| C001-TC-022 | C001-TS-581 | TS-539 | integration | integration | `test/fault/workspace/` (K5), `npm run test:fault -- workspace`; results `bench/results/kill-tests-<date>.md` | per deep ecosystem, project installed in editable mode in the test run's workspace; a mutant on a line a passing test executes (K5) | E-CI | C001-T-022 |
| C001-TC-023 | C001-TS-575 | TS-576, TS-577, TS-579 | integration | integration | `test/fault/workspace/` (K6), `npm run test:fault -- workspace`; results `bench/results/kill-tests-<date>.md` | lowered `max_user_watches` (Linux), 100,000 files created during a run, an unreadable directory, the working-tree root renamed (K6) | E-CI | C001-T-022 |
| C001-TC-024 | C001-TS-145 | TS-144, TS-173 | integration | integration | `test/integration/git/hostile-repository.test.ts`, `npm test -- test/integration/git` | `fx-hostile` on git 2.34.0 and on the latest git release; asserts no probe starts, no file of the repository changes, no connection opens (C001-ADR-004) | E-CI | C001-T-005 |
| C001-TC-025 | C001-TS-144 | TS-146 | integration | integration | `test/integration/git/hook-environment.test.ts`, `npm test -- test/integration/git` | `fx-intake` with `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE` set as a pre-commit hook sets them, `GIT_INDEX_FILE` naming a temporary index; every git read of the adapter reads the repository's own index (Q-hookenv-01) | E-CI | C001-T-005, C001-T-006 |
| C001-TC-026 | C001-TS-401 | TS-404, TS-629 | eval | benchmark | `bench/calibration/`, `npm run bench -- calibration`; report `bench/results/calibration-<version>.md` | the calibration corpus `bench/calibration/corpus.json` (§2), never the benchmark set and never the G-8 pool (C001-ADR-009 §4 item 1): the suite first runs the overlap check of C001-T-106 and stops before any computation when a corpus change shares a commit range or a task description with an entry of `bench/set/benchmark-set.json` or of `study/g8/pool.json`. Defective hunks derived from the recorded defect lines with the fixed diff of C001-ADR-009 §1 and §2. Signals of C001-ADR-009 §3 computed with the static analysis of the main-branch commit that C001-T-099 records, model-free, with each change's test run; signals do not depend on the weights, so a weight change does not require a new signal run, but a change of signal code between that commit and the release candidate does (checked by C001-T-105). Effort-aware recall at 20 % and 50 % of changed lines, grid of §4 item 4 with leave-one-change-out cross-validation, adoption rule of §4 item 5; the property test C001-TC-450 run with the release weights | E-REF | C001-T-106, C001-T-107, C001-T-108, C001-T-099 |

### 4.2 CAP-01 — Change intake

| TC | TS | Further TS | Level | Kind | Location | Test data | Environment | Task |
|---|---|---|---|---|---|---|---|---|
| C001-TC-101 | C001-TS-101 | TS-102, TS-103, TS-189, TS-191 | e2e | acceptance | `test/acceptance/steps/cap-01/req-101.steps.ts` | `fx-intake` | E-CI, E-OFF | C001-T-004, C001-T-008 |
| C001-TC-102 | C001-TS-104 | TS-105 | e2e | acceptance | `test/acceptance/steps/cap-01/req-102.steps.ts` | `fx-branches` | E-CI, E-OFF | C001-T-008 |
| C001-TC-103 | C001-TS-106 | TS-107 | e2e | acceptance | `test/acceptance/steps/cap-01/req-103.steps.ts` | `fx-upstream` | E-CI, E-OFF | C001-T-025 |
| C001-TC-104 | C001-TS-108 | TS-109, TS-156, TS-157, TS-158, TS-159 | e2e | acceptance | `test/acceptance/steps/cap-01/req-104.steps.ts` | `fx-default` | E-CI, E-OFF | C001-T-025 |
| C001-TC-105 | C001-TS-110 | TS-111, TS-112 | e2e | acceptance | `test/acceptance/steps/cap-01/req-105.steps.ts` | `fx-intake` | E-CI, E-OFF | C001-T-025 |
| C001-TC-106 | C001-TS-113 | TS-114 | e2e | acceptance | `test/acceptance/steps/cap-01/req-106.steps.ts` | `plain-folder`, `fx-empty` | E-CI, E-OFF | C001-T-025 |
| C001-TC-107 | C001-TS-115 | TS-116 | e2e | acceptance | `test/acceptance/steps/cap-01/req-107.steps.ts` | `fx-upstream`, `fx-local` | E-CI, E-OFF | C001-T-026 |
| C001-TC-108 | C001-TS-117 | — | e2e | acceptance | `test/acceptance/steps/cap-01/req-108.steps.ts` | `fx-intake` with binary files | E-CI, E-OFF | C001-T-026 |
| C001-TC-109 | C001-TS-118 | TS-119, TS-120 | e2e | acceptance | `test/acceptance/steps/cap-01/req-109.steps.ts` | `fx-upstream`, `fx-local`, `fx-branches` | E-CI, E-OFF | C001-T-027 |
| C001-TC-110 | C001-TS-121 | TS-122, TS-123 | e2e | acceptance | `test/acceptance/steps/cap-01/req-110.steps.ts` | `fx-upstream` | E-CI, E-OFF | C001-T-027 |
| C001-TC-111 | C001-TS-124 | TS-125, TS-126 | e2e | acceptance | `test/acceptance/steps/cap-01/req-111.steps.ts` | `fx-sdd`, `fx-neutral`, `fx-intake` | E-CI, E-OFF | C001-T-029 |
| C001-TC-112 | C001-TS-127 | TS-128 | e2e | acceptance | `test/acceptance/steps/cap-01/req-112.steps.ts` | `fx-intake` with named Markdown and plain-text files | E-CI, E-OFF | C001-T-030 |
| C001-TC-113 | C001-TS-129 | — | e2e | acceptance | `test/acceptance/steps/cap-01/req-113.steps.ts` | `fx-intake` with unusable named files | E-CI, E-OFF | C001-T-030 |
| C001-TC-114 | C001-TS-130 | TS-131, TS-160, TS-132 | e2e | acceptance | `test/acceptance/steps/cap-01/req-114.steps.ts` | `fx-sdd`, `fx-upstream`, `fx-default`, `fx-local`, `fx-intake` | E-CI, E-OFF | C001-T-033 |
| C001-TC-115 | C001-TS-133 | TS-134, TS-135 | e2e | acceptance | `test/acceptance/steps/cap-01/req-115.steps.ts` | `fx-intake` | E-CI, E-OFF | C001-T-008 |
| C001-TC-116 | C001-TS-136 | TS-137 | e2e | browser | `test/acceptance/steps/cap-01/req-116.ui.steps.ts` | `fx-intake` | E-CI, E-BR, E-OFF | C001-T-033 |
| C001-TC-117 | C001-TS-138 | TS-139, TS-140, TS-150 | e2e | acceptance | `test/acceptance/steps/cap-01/req-117.steps.ts` | `fx-intake` | E-CI, E-OFF | C001-T-033 |
| C001-TC-118 | C001-TS-141 | — | e2e | acceptance | `test/acceptance/steps/cap-01/req-118.steps.ts` | `fx-intake` | E-CI, E-OFF | C001-T-034 |
| C001-TC-119 | C001-TS-142 | TS-143 | e2e | acceptance | `test/acceptance/steps/cap-01/req-119.steps.ts` | `fx-intake`, `stub-llm` | E-CI, E-OFF | C001-T-034 |
| C001-TC-120 | C001-TS-144 | TS-145, TS-146 | e2e | acceptance | `test/acceptance/steps/cap-01/req-120.steps.ts` | `fx-upstream`, `fx-intake` | E-CI, E-OFF | C001-T-005, C001-T-006 |
| C001-TC-121 | C001-TS-147 | TS-148 | e2e | acceptance | `test/acceptance/steps/cap-01/req-121.steps.ts` | `fx-size` | E-CI, E-OFF | C001-T-026 |
| C001-TC-122 | C001-TS-149 | — | e2e | acceptance | `test/acceptance/steps/cap-01/req-122.steps.ts` | `fx-size` | E-CI, E-OFF | C001-T-026 |
| C001-TC-123 | C001-TS-151 | TS-152, TS-153, TS-161 | e2e | acceptance | `test/acceptance/steps/cap-01/req-123.steps.ts` | `fx-sdd`, `fx-shop-doc` | E-CI, E-OFF | C001-T-029 |
| C001-TC-124 | C001-TS-154 | TS-155 | e2e | acceptance | `test/acceptance/steps/cap-01/req-124.steps.ts` | `fx-neutral` | E-CI, E-OFF | C001-T-030 |
| C001-TC-125 | C001-TS-162 | TS-163, TS-164, TS-165, TS-166, TS-178 | e2e | acceptance | `test/acceptance/steps/cap-01/req-125.steps.ts` | `fx-intake`; git program variants | E-CI, E-OFF | C001-T-005 |
| C001-TC-126 | C001-TS-167 | TS-168, TS-169, TS-170, TS-171, TS-172, TS-173, TS-176, TS-179, TS-180, TS-190 | e2e | acceptance | `test/acceptance/steps/cap-01/req-126.steps.ts` | `fx-lfs`, `fx-crypt`, `fx-intake` | E-CI, E-OFF | C001-T-028 |
| C001-TC-127 | C001-TS-177 | TS-181, TS-182, TS-183, TS-184 | e2e | acceptance | `test/acceptance/steps/cap-01/req-127.steps.ts` | `fx-crypt` | E-CI, E-OFF | C001-T-028 |
| C001-TC-128 | C001-TS-174 | TS-175, TS-185, TS-186, TS-187, TS-188 | e2e | acceptance | `test/acceptance/steps/cap-01/req-128.steps.ts` | `fx-lfs` | E-CI, E-OFF | C001-T-028 |
| C001-TC-150 | C001-TS-192 | TS-193, TS-194 | e2e | browser | `test/acceptance/steps/cap-01/req-117.ui.steps.ts` | `fx-intake`, `fx-lfs` | E-CI, E-BR, E-OFF | C001-T-033 |
| C001-TC-151 | C001-TS-133 | TS-101, TS-135 | unit | unit | `test/unit/intake/diff-and-snapshot-id.test.ts`, golden corpus `test/unit/intake/diff-golden/` | in-memory blob pairs; histogram diff and hunk boundaries of C001-ADR-009; snapshot ID from base, HEAD and content only | E-CI | C001-T-008 |

### 4.3 CAP-02 — Architecture delta

| TC | TS | Further TS | Level | Kind | Location | Test data | Environment | Task |
|---|---|---|---|---|---|---|---|---|
| C001-TC-201 | C001-TS-201 | TS-202, TS-203 | e2e | browser | `test/acceptance/steps/cap-02/req-201.ui.steps.ts` | `fx-shop-ts`, `stub-llm` | E-CI, E-BR, E-OFF | C001-T-042, C001-T-043 |
| C001-TC-202 | C001-TS-204 | TS-205, TS-206 | e2e | acceptance | `test/acceptance/steps/cap-02/req-202.steps.ts` | `fx-shop-ts` | E-CI, E-OFF | C001-T-039 |
| C001-TC-203 | C001-TS-207 | TS-208, TS-209 | e2e | acceptance | `test/acceptance/steps/cap-02/req-203.steps.ts` | `fx-shop-doc`, `fx-shop-ts` | E-CI, E-OFF | C001-T-039 |
| C001-TC-204 | C001-TS-210 | TS-211, TS-212 | e2e | acceptance | `test/acceptance/steps/cap-02/req-204.steps.ts` | `fx-shop-doc`, `fx-shop-ts`, `fx-shop-py`, `fx-shop-cs` | E-CI, E-OFF | C001-T-037, C001-T-040 |
| C001-TC-205 | C001-TS-213 | TS-214 | e2e | acceptance | `test/acceptance/steps/cap-02/req-205.steps.ts` | `fx-shop-ts`, `fx-shop-py`, `fx-shop-cs` | E-CI, E-OFF | C001-T-038, C001-T-040 |
| C001-TC-206 | C001-TS-215 | — | e2e | browser | `test/acceptance/steps/cap-02/req-206.ui.steps.ts` | `fx-shop-doc` | E-CI, E-BR, E-OFF | C001-T-043 |
| C001-TC-207 | C001-TS-216 | TS-217 | e2e | acceptance | `test/acceptance/steps/cap-02/req-207.steps.ts` | `fx-shop-doc`, `fx-neutral` | E-CI, E-OFF | C001-T-029, C001-T-039 |
| C001-TC-208 | C001-TS-218 | TS-219, TS-220 | e2e | acceptance | `test/acceptance/steps/cap-02/req-208.steps.ts` | `fx-shop-doc` | E-CI, E-OFF | C001-T-040 |
| C001-TC-209 | C001-TS-221 | TS-222 | e2e | acceptance | `test/acceptance/steps/cap-02/req-209.steps.ts` | `fx-shop-doc` | E-CI, E-OFF | C001-T-039 |
| C001-TC-210 | C001-TS-223 | — | e2e | acceptance | `test/acceptance/steps/cap-02/req-210.steps.ts` | `fx-shop-ts`, `fx-shop-py`, `fx-shop-cs` | E-CI, E-OFF | C001-T-039 |
| C001-TC-211 | C001-TS-224 | TS-225, TS-260 | e2e | browser | `test/acceptance/steps/cap-02/req-211.ui.steps.ts` | `fx-shop-ts`, `fx-shop-doc`, `fx-sdd` | E-CI, E-BR, E-OFF | C001-T-042, C001-T-043 |
| C001-TC-212 | C001-TS-226 | TS-227, TS-248 | e2e | acceptance | `test/acceptance/steps/cap-02/req-212.steps.ts` | `fx-shop-ts`, `fx-shop-doc` | E-CI, E-OFF | C001-T-036, C001-T-039 |
| C001-TC-213 | C001-TS-228 | TS-229, TS-230 | e2e | acceptance | `test/acceptance/steps/cap-02/req-213.steps.ts` | `fx-shop-ts` | E-CI, E-OFF | C001-T-041 |
| C001-TC-214 | C001-TS-231 | TS-232, TS-233 | e2e | acceptance | `test/acceptance/steps/cap-02/req-214.steps.ts` | `fx-shop-doc`, `fx-shop-doc-nolayers` | E-CI, E-OFF | C001-T-041 |
| C001-TC-215 | C001-TS-234 | TS-235, TS-236 | e2e | acceptance | `test/acceptance/steps/cap-02/req-215.steps.ts` | `fx-shop-ts` | E-CI, E-OFF | C001-T-041 |
| C001-TC-216 | C001-TS-237 | — | e2e | acceptance | `test/acceptance/steps/cap-02/req-216.steps.ts` | `fx-shop-ts`, `stub-llm` | E-CI | C001-T-090 |
| C001-TC-217 | C001-TS-238 | TS-239, TS-249 | e2e | acceptance | `test/acceptance/steps/cap-02/req-217.steps.ts` | `fx-shop-doc`, `fx-shop-ts`, `stub-llm` | E-CI, E-OFF | C001-T-053 |
| C001-TC-218 | C001-TS-240 | TS-241, TS-250 | e2e | browser | `test/acceptance/steps/cap-02/req-218.ui.steps.ts` | `fx-shop-doc`, `fx-shop-ts`, `stub-llm` | E-CI, E-BR, E-OFF | C001-T-043 |
| C001-TC-219 | C001-TS-242 | TS-243 | e2e | browser | `test/acceptance/steps/cap-02/req-219.ui.steps.ts` | `fx-shop-ts`, `stub-llm` | E-CI, E-BR, E-OFF | C001-T-043 |
| C001-TC-220 | C001-TS-244 | TS-245 | e2e | browser | `test/acceptance/steps/cap-02/req-220.ui.steps.ts` | `fx-shop-doc` | E-CI, E-BR, E-OFF | C001-T-043 |
| C001-TC-221 | C001-TS-246 | TS-247 | e2e | browser | `test/acceptance/steps/cap-02/req-221.ui.steps.ts` | `fx-shop-doc` | E-CI, E-BR, E-OFF | C001-T-043 |
| C001-TC-222 | C001-TS-251 | TS-252, TS-253, TS-254, TS-255 | e2e | acceptance | `test/acceptance/steps/cap-02/req-222.steps.ts` | `fx-shop-doc`, `fx-neutral` | E-CI, E-OFF | C001-T-040 |
| C001-TC-223 | C001-TS-256 | TS-257 | e2e | acceptance | `test/acceptance/steps/cap-02/req-223.steps.ts` | `fx-sdd-nopaths`, `fx-neutral-nopaths` | E-CI, E-OFF | C001-T-029, C001-T-039 |
| C001-TC-224 | C001-TS-258 | TS-259 | e2e | acceptance | `test/acceptance/steps/cap-02/req-224.steps.ts` | `fx-shop-ts`, `fx-shop-py` | E-CI, E-OFF | C001-T-040 |

### 4.4 CAP-03 — Intent map

| TC | TS | Further TS | Level | Kind | Location | Test data | Environment | Task |
|---|---|---|---|---|---|---|---|---|
| C001-TC-301 | C001-TS-301 | TS-302 | e2e | acceptance | `test/acceptance/steps/cap-03/req-301.steps.ts` | `fx-sdd` | E-CI, E-OFF | C001-T-045 |
| C001-TC-302 | C001-TS-303 | — | e2e | acceptance | `test/acceptance/steps/cap-03/req-302.steps.ts` | `fx-sdd` | E-CI, E-OFF | C001-T-031, C001-T-044 |
| C001-TC-303 | C001-TS-304 | TS-305 | e2e | acceptance | `test/acceptance/steps/cap-03/req-303.steps.ts` | `fx-sdd`, `fx-sdd-archived` | E-CI, E-OFF | C001-T-031 |
| C001-TC-304 | C001-TS-306 | — | e2e | acceptance | `test/acceptance/steps/cap-03/req-304.steps.ts` | `fx-sdd` | E-CI, E-OFF | C001-T-031 |
| C001-TC-305 | C001-TS-307 | TS-308 | e2e | acceptance | `test/acceptance/steps/cap-03/req-305.steps.ts` | `fx-sdd`, `fx-sdd-empty` | E-CI, E-OFF | C001-T-044 |
| C001-TC-306 | C001-TS-309 | TS-310, TS-311, TS-312, TS-313 | e2e | acceptance | `test/acceptance/steps/cap-03/req-306.steps.ts` | `fx-sdd`, `fx-nosdd` | E-CI, E-OFF | C001-T-037, C001-T-045 |
| C001-TC-307 | C001-TS-314 | TS-315, TS-316 | e2e | acceptance | `test/acceptance/steps/cap-03/req-307.steps.ts` | `fx-sdd` | E-CI, E-OFF | C001-T-045 |
| C001-TC-308 | C001-TS-317 | TS-318, TS-319 | e2e | acceptance | `test/acceptance/steps/cap-03/req-308.steps.ts` | `fx-sdd`, `stub-llm` | E-CI | C001-T-090 |
| C001-TC-309 | C001-TS-320 | — | e2e | acceptance | `test/acceptance/steps/cap-03/req-309.steps.ts` | `fx-sdd` | E-CI, E-OFF | C001-T-045 |
| C001-TC-310 | C001-TS-321 | — | e2e | browser | `test/acceptance/steps/cap-03/req-310.ui.steps.ts` | `fx-sdd` | E-CI, E-BR, E-OFF | C001-T-048 |
| C001-TC-311 | C001-TS-322 | TS-323, TS-324 | e2e | acceptance | `test/acceptance/steps/cap-03/req-311.steps.ts` | `fx-sdd`, `fx-sdd-007` | E-CI, E-OFF | C001-T-045 |
| C001-TC-312 | C001-TS-325 | TS-326 | e2e | browser | `test/acceptance/steps/cap-03/req-312.ui.steps.ts` | `fx-sdd-007`, `fx-nosdd` | E-CI, E-BR, E-OFF | C001-T-048 |
| C001-TC-313 | C001-TS-327 | TS-328, TS-329, TS-330 | e2e | acceptance | `test/acceptance/steps/cap-03/req-313.steps.ts` | `fx-nosdd`, `fx-sdd-archived` | E-CI, E-OFF | C001-T-044 |
| C001-TC-314 | C001-TS-331 | — | e2e | acceptance | `test/acceptance/steps/cap-03/req-314.steps.ts` | `fx-nosdd` with Markdown and plain-text plans | E-CI, E-OFF | C001-T-032, C001-T-044 |
| C001-TC-315 | C001-TS-332 | TS-333 | e2e | acceptance | `test/acceptance/steps/cap-03/req-315.steps.ts` | `fx-nosdd`, `fx-sdd`, `stub-llm` | E-CI | C001-T-090 |
| C001-TC-316 | C001-TS-334 | TS-335 | e2e | browser | `test/acceptance/steps/cap-03/req-316.ui.steps.ts` | `fx-sdd`, `stub-llm` | E-CI, E-BR, E-OFF | C001-T-048 |
| C001-TC-317 | C001-TS-336 | — | e2e | browser | `test/acceptance/steps/cap-03/req-317.ui.steps.ts` | `fx-sdd`, `fx-nosdd`, `stub-llm` | E-CI, E-BR, E-OFF | C001-T-048, C001-T-082 |
| C001-TC-318 | C001-TS-337 | TS-338 | e2e | browser | `test/acceptance/steps/cap-03/req-318.ui.steps.ts` | `fx-sdd` | E-CI, E-BR, E-OFF | C001-T-048, C001-T-068 |
| C001-TC-319 | C001-TS-339 | — | e2e | browser | `test/acceptance/steps/cap-03/req-319.ui.steps.ts` | `fx-sdd`, `stub-llm` | E-CI, E-BR, E-OFF | C001-T-045, C001-T-048 |
| C001-TC-320 | C001-TS-340 | TS-341 | e2e | acceptance | `test/acceptance/steps/cap-03/req-320.steps.ts` | `fx-sdd` | E-CI, E-OFF | C001-T-047 |
| C001-TC-321 | C001-TS-342 | TS-343 | e2e | acceptance | `test/acceptance/steps/cap-03/req-321.steps.ts` | `fx-sdd` | E-CI, E-OFF | C001-T-047 |
| C001-TC-322 | C001-TS-344 | TS-345, TS-346 | e2e | browser | `test/acceptance/steps/cap-03/req-322.ui.steps.ts` | `fx-sdd` | E-CI, E-BR, E-OFF | C001-T-054 |
| C001-TC-323 | C001-TS-347 | TS-348 | e2e | browser | `test/acceptance/steps/cap-03/req-323.ui.steps.ts` | `fx-sdd` | E-CI, E-BR, E-OFF | C001-T-054 |
| C001-TC-324 | C001-TS-349 | TS-350 | e2e | browser | `test/acceptance/steps/cap-03/req-324.ui.steps.ts` | `fx-shop-ts`, `fx-shop-py`, `fx-shop-cs` | E-CI, E-BR, E-OFF | C001-T-046 |
| C001-TC-325 | C001-TS-351 | TS-352 | e2e | browser | `test/acceptance/steps/cap-03/req-325.ui.steps.ts` | `fx-sdd`, `stub-llm` | E-CI, E-BR, E-OFF | C001-T-090 |
| C001-TC-326 | C001-TS-353 | TS-354, TS-355 | e2e | acceptance | `test/acceptance/steps/cap-03/req-326.steps.ts` | `fx-sdd` | E-CI, E-OFF | C001-T-031 |
| C001-TC-327 | C001-TS-356 | TS-357, TS-358 | e2e | acceptance | `test/acceptance/steps/cap-03/req-327.steps.ts` | `fx-sdd`, `stub-llm` | E-CI | C001-T-090 |
| C001-TC-328 | C001-TS-359 | TS-361, TS-362 | e2e | browser | `test/acceptance/steps/cap-03/req-328.ui.steps.ts` | `fx-sdd` | E-CI, E-BR, E-OFF | C001-T-046, C001-T-048 |
| C001-TC-350 | C001-TS-360 | — | e2e | acceptance | `test/acceptance/steps/cap-03/req-328.steps.ts` | `fx-sdd` | E-CI, E-OFF | C001-T-046 |

### 4.5 CAP-04 — Risk triage and guarded clearing

| TC | TS | Further TS | Level | Kind | Location | Test data | Environment | Task |
|---|---|---|---|---|---|---|---|---|
| C001-TC-401 | C001-TS-401 | TS-402, TS-403, TS-482 | e2e | acceptance | `test/acceptance/steps/cap-04/req-401.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-051 |
| C001-TC-402 | C001-TS-404 | TS-405 | e2e | acceptance | `test/acceptance/steps/cap-04/req-402.steps.ts` | `scored-pairs-ts` | E-CI, E-OFF | C001-T-051 |
| C001-TC-403 | C001-TS-406 | TS-407, TS-408, TS-409, TS-410, TS-483 | e2e | acceptance | `test/acceptance/steps/cap-04/req-403.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-051 |
| C001-TC-404 | C001-TS-411 | TS-412, TS-413, TS-414 | e2e | acceptance | `test/acceptance/steps/cap-04/req-404.steps.ts` | `shop-ts`, `tool-go` | E-CI, E-OFF | C001-T-051 |
| C001-TC-405 | C001-TS-415 | TS-416, TS-417, TS-418 | e2e | acceptance | `test/acceptance/steps/cap-04/req-405.steps.ts` | `shop-ts`, `shop-ts-model` | E-CI, E-OFF | C001-T-051, C001-T-097 |
| C001-TC-406 | C001-TS-419 | TS-420, TS-421, TS-422 | e2e | acceptance | `test/acceptance/steps/cap-04/req-406.steps.ts` | `shop-ts`, `shop-py`, `shop-cs`, `tool-go` | E-CI, E-OFF | C001-T-038, C001-T-052 |
| C001-TC-407 | C001-TS-423 | TS-424, TS-425, TS-426 | e2e | acceptance | `test/acceptance/steps/cap-04/req-407.steps.ts` | `shop-ts`, `shop-py`, `shop-cs` | E-CI, E-OFF | C001-T-052 |
| C001-TC-408 | C001-TS-427 | TS-428, TS-429 | e2e | acceptance | `test/acceptance/steps/cap-04/req-408.steps.ts` | `shop-ts`, `shop-py`, `shop-cs`, `tool-go` | E-CI, E-OFF | C001-T-053 |
| C001-TC-409 | C001-TS-430 | TS-431, TS-432, TS-433, TS-434 | e2e | acceptance | `test/acceptance/steps/cap-04/req-409.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-053 |
| C001-TC-410 | C001-TS-435 | TS-436, TS-437, TS-438, TS-439, TS-440, TS-441 | e2e | acceptance | `test/acceptance/steps/cap-04/req-410.steps.ts` | `shop-ts`, `shop-py`, `shop-cs`, `tool-go` | E-CI, E-OFF | C001-T-061 |
| C001-TC-411 | C001-TS-442 | TS-484, TS-485 | e2e | acceptance | `test/acceptance/steps/cap-04/req-411.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-061, C001-T-064 |
| C001-TC-412 | C001-TS-443 | TS-444 | e2e | acceptance | `test/acceptance/steps/cap-04/req-412.steps.ts` | `shop-ts`, `shop-ts-model` | E-CI, E-OFF | C001-T-053 |
| C001-TC-413 | C001-TS-445 | — | e2e | acceptance | `test/acceptance/steps/cap-04/req-413.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-049 |
| C001-TC-414 | C001-TS-446 | TS-447, TS-448, TS-449 | e2e | acceptance | `test/acceptance/steps/cap-04/req-414.steps.ts` | `shop-ts`, `shop-py`, `shop-cs`, `tool-go` | E-CI, E-OFF | C001-T-049 |
| C001-TC-415 | C001-TS-450 | TS-451 | e2e | acceptance | `test/acceptance/steps/cap-04/req-415.steps.ts` | `shop-ts`, `shop-py`, `shop-cs` | E-CI, E-OFF | C001-T-049 |
| C001-TC-416 | C001-TS-452 | TS-453 | e2e | acceptance | `test/acceptance/steps/cap-04/req-416.steps.ts` | `shop-ts`, `shop-py`, `shop-cs` | E-CI, E-OFF | C001-T-049 |
| C001-TC-417 | C001-TS-454 | TS-455, TS-456 | e2e | acceptance | `test/acceptance/steps/cap-04/req-417.steps.ts` | `shop-ts`, `shop-py`, `shop-cs` | E-CI, E-OFF | C001-T-038, C001-T-050 |
| C001-TC-418 | C001-TS-457 | TS-458, TS-486 | e2e | acceptance | `test/acceptance/steps/cap-04/req-418.steps.ts` | `shop-ts`, `shop-ts-model` | E-CI, E-OFF | C001-T-053 |
| C001-TC-419 | C001-TS-459 | TS-460, TS-461 | e2e | acceptance | `test/acceptance/steps/cap-04/req-419.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-053 |
| C001-TC-420 | C001-TS-462 | TS-463, TS-464 | e2e | browser | `test/acceptance/steps/cap-04/req-420.ui.steps.ts` | `shop-ts` | E-CI, E-BR, E-OFF | C001-T-056 |
| C001-TC-421 | C001-TS-465 | TS-466 | e2e | browser | `test/acceptance/steps/cap-04/req-421.ui.steps.ts` | `shop-ts` | E-CI, E-BR, E-OFF | C001-T-056 |
| C001-TC-422 | C001-TS-467 | TS-468 | e2e | acceptance | `test/acceptance/steps/cap-04/req-422.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-055 |
| C001-TC-423 | C001-TS-469 | TS-470, TS-471 | e2e | acceptance | `test/acceptance/steps/cap-04/req-423.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-050 |
| C001-TC-424 | C001-TS-472 | TS-473 | e2e | acceptance | `test/acceptance/steps/cap-04/req-424.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-050 |
| C001-TC-425 | C001-TS-474 | TS-475 | e2e | acceptance | `test/acceptance/steps/cap-04/req-425.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-035, C001-T-049 |
| C001-TC-426 | C001-TS-476 | TS-477, TS-478, TS-479 | e2e | acceptance | `test/acceptance/steps/cap-04/req-426.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-035 |
| C001-TC-427 | C001-TS-480 | TS-481 | e2e | acceptance | `test/acceptance/steps/cap-04/req-427.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-053 |
| C001-TC-450 | C001-TS-404 | TS-405 | unit | unit | `test/unit/triage/risk.property.test.ts` | fast-check pairs of signal vectors that differ in one signal, smallest riskier steps included | E-CI | C001-T-051 |

### 4.6 CAP-05 — Test-first reading and executable evidence

| TC | TS | Further TS | Level | Kind | Location | Test data | Environment | Task |
|---|---|---|---|---|---|---|---|---|
| C001-TC-501 | C001-TS-501 | TS-502 | e2e | acceptance | `test/acceptance/steps/cap-05/req-501.steps.ts` | `shop-ts`, `shop-py`, `shop-cs`, `tool-go` | E-CI, E-OFF | C001-T-054 |
| C001-TC-502 | C001-TS-503 | TS-504 | e2e | acceptance | `test/acceptance/steps/cap-05/req-502.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-054 |
| C001-TC-503 | C001-TS-506 | TS-507, TS-508 | e2e | acceptance | `test/acceptance/steps/cap-05/req-503.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-061 |
| C001-TC-504 | C001-TS-509 | TS-510, TS-511 | e2e | acceptance | `test/acceptance/steps/cap-05/req-504.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-061 |
| C001-TC-505 | C001-TS-512 | TS-513, TS-514, TS-515 | e2e | acceptance | `test/acceptance/steps/cap-05/req-505.steps.ts` | `shop-ts`, `shop-py` | E-CI, E-OFF | C001-T-057, C001-T-060 |
| C001-TC-506 | C001-TS-516 | TS-517, TS-518, TS-567, TS-574, TS-584 | e2e | acceptance | `test/acceptance/steps/cap-05/req-506.steps.ts` | `shop-ts`, `shop-py`, `shop-cs` | E-CI, E-OFF | C001-T-057, C001-T-058, C001-T-059 |
| C001-TC-507 | C001-TS-519 | TS-520 | e2e | acceptance | `test/acceptance/steps/cap-05/req-507.steps.ts` | `tool-go`, `svc-java` | E-CI, E-OFF | C001-T-060 |
| C001-TC-508 | C001-TS-521 | TS-522 | e2e | acceptance | `test/acceptance/steps/cap-05/req-508.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-060 |
| C001-TC-509 | C001-TS-523 | TS-524, TS-525, TS-558, TS-951 | e2e | acceptance | `test/acceptance/steps/cap-05/req-509.steps.ts` | `shop-ts`, `shop-lfs` | E-CI, E-OFF | C001-T-060 |
| C001-TC-510 | C001-TS-526 | TS-527, TS-528 | e2e | acceptance | `test/acceptance/steps/cap-05/req-510.steps.ts` | `shop-ts`, `agent-log.md` | E-CI, E-OFF | C001-T-032, C001-T-065 |
| C001-TC-511 | C001-TS-529 | TS-530, TS-531, TS-555 | e2e | acceptance | `test/acceptance/steps/cap-05/req-511.steps.ts` | `shop-ts`, `agent-log.md` | E-CI, E-OFF | C001-T-065 |
| C001-TC-512 | C001-TS-532 | TS-533, TS-534, TS-535, TS-554, TS-582, TS-583 | e2e | acceptance | `test/acceptance/steps/cap-05/req-512.steps.ts` | `shop-ts`, `agent-log.md` | E-CI, E-OFF | C001-T-065 |
| C001-TC-513 | C001-TS-536 | TS-537, TS-538 | e2e | acceptance | `test/acceptance/steps/cap-05/req-513.steps.ts` | `shop-ts`, `agent-log.md` | E-CI, E-OFF | C001-T-065, C001-T-068 |
| C001-TC-514 | C001-TS-539 | TS-540, TS-541, TS-542, TS-581 | e2e | acceptance | `test/acceptance/steps/cap-05/req-514.steps.ts` | `shop-ts`, `shop-py`, `tool-go` | E-CI, E-OFF | C001-T-062, C001-T-063, C001-T-064 |
| C001-TC-515 | C001-TS-543 | TS-544 | e2e | acceptance | `test/acceptance/steps/cap-05/req-515.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-062, C001-T-063 |
| C001-TC-516 | C001-TS-545 | TS-546, TS-580, TS-585 | e2e | acceptance | `test/acceptance/steps/cap-05/req-516.steps.ts` | `shop-ts`, `shop-cs`, `shop-py` | E-CI, E-OFF | C001-T-062, C001-T-063 |
| C001-TC-517 | C001-TS-547 | TS-548, TS-549 | e2e | acceptance | `test/acceptance/steps/cap-05/req-517.steps.ts` | `shop-ts`, `shop-py` | E-CI, E-OFF | C001-T-066 |
| C001-TC-518 | C001-TS-550 | TS-551 | e2e | acceptance | `test/acceptance/steps/cap-05/req-518.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-066 |
| C001-TC-519 | C001-TS-552 | TS-553 | e2e | browser | `test/acceptance/steps/cap-05/req-519.ui.steps.ts` | `shop-ts`, `agent-log.md` | E-CI, E-BR, E-OFF | C001-T-068 |
| C001-TC-520 | C001-TS-556 | TS-557 | e2e | acceptance | `test/acceptance/steps/cap-05/req-520.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-061 |
| C001-TC-521 | C001-TS-559 | TS-560, TS-561, TS-562 | e2e | acceptance | `test/acceptance/steps/cap-05/req-521.steps.ts` | `shop-ts`; repository record | E-CI, E-OFF | C001-T-069 |
| C001-TC-522 | C001-TS-563 | TS-564, TS-565, TS-566 | e2e | acceptance | `test/acceptance/steps/cap-05/req-522.steps.ts` | `shop-ts`; repository record | E-CI, E-OFF | C001-T-069 |
| C001-TC-523 | C001-TS-568 | TS-569, TS-570, TS-571, TS-572, TS-573 | e2e | acceptance | `test/acceptance/steps/cap-05/req-523.steps.ts` | `shop-ts`, `shop-py` | E-CI, E-OFF | C001-T-069 |
| C001-TC-524 | C001-TS-575 | TS-576, TS-577, TS-578, TS-579 | e2e | acceptance | `test/acceptance/steps/cap-05/req-524.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-069 |
| C001-TC-525 | C001-TS-586 | TS-587, TS-588, TS-589, TS-590 | e2e | acceptance | `test/acceptance/steps/cap-05/req-525.steps.ts` | `shop-ts`; repository record | E-CI, E-OFF | C001-T-019 |
| C001-TC-526 | C001-TS-591 | TS-592, TS-593, TS-594, TS-595, TS-596, TS-952 | e2e | acceptance | `test/acceptance/steps/cap-05/req-526.steps.ts` | `shop-ts` with submodules | E-CI, E-OFF | C001-T-067 |
| C001-TC-527 | C001-TS-597 | TS-598, TS-599 | e2e | acceptance | `test/acceptance/steps/cap-05/req-527.steps.ts` | `shop-lfs` | E-CI, E-OFF | C001-T-067 |
| C001-TC-528 | C001-TS-953 | TS-954, TS-955, TS-956, TS-961, TS-962 | e2e | acceptance | `test/acceptance/steps/cap-05/req-528.steps.ts` | `shop-lfs` | E-CI, E-OFF | C001-T-067 |
| C001-TC-529 | C001-TS-957 | TS-958, TS-959 | e2e | acceptance | `test/acceptance/steps/cap-05/req-529.steps.ts` | `shop-lfs` | E-CI, E-OFF | C001-T-067 |
| C001-TC-550 | C001-TS-505 | — | e2e | browser | `test/acceptance/steps/cap-05/req-502.ui.steps.ts` | `shop-ts` | E-CI, E-BR, E-OFF | C001-T-054 |
| C001-TC-551 | C001-TS-568 | TS-569, TS-575, TS-576 | integration | integration | `test/integration/evidence/observer/linux.test.ts` | temporary working trees; inotify with lowered limits | E-CI (`ubuntu-24.04`) | C001-T-017 |
| C001-TC-552 | C001-TS-570 | TS-571, TS-577, TS-578 | integration | integration | `test/integration/evidence/observer/macos.test.ts`, `windows.test.ts` | temporary working trees; FSEvents and ReadDirectoryChangesW | E-CI (macOS and Windows runner kinds) | C001-T-018 |
| C001-TC-553 | C001-TS-523 | TS-524, TS-559, TS-563, TS-564 | integration | integration | `test/integration/evidence/workspace/` | `shop-ts`; workspace location, fill, reset, check and lifetime of C001-ADR-006 §1 and §2 | E-CI | C001-T-015 |
| C001-TC-554 | C001-TS-525 | TS-545, TS-580, TS-585 | integration | integration | `test/integration/evidence/copier/` | `shop-ts`, `shop-py`; ignored paths, link retargeting and mutation copy of C001-ADR-006 §3, §4 and §7; disk-full simulation | E-CI | C001-T-016 |
| C001-TC-555 | C001-TS-586 | TS-587, TS-588, TS-560 | integration | integration | `test/integration/evidence/runner/` | `shop-ts`; environment with every git repository-locating variable set | E-CI | C001-T-019 |

### 4.7 CAP-06 — Review coverage, sampling and attention budget

| TC | TS | Further TS | Level | Kind | Location | Test data | Environment | Task |
|---|---|---|---|---|---|---|---|---|
| C001-TC-601 | C001-TS-601 | TS-602, TS-603, TS-604 | e2e | acceptance | `test/acceptance/steps/cap-06/req-601.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-070 |
| C001-TC-602 | C001-TS-605 | TS-606, TS-607 | e2e | acceptance | `test/acceptance/steps/cap-06/req-602.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-070 |
| C001-TC-603 | C001-TS-608 | TS-609 | e2e | browser | `test/acceptance/steps/cap-06/req-603.ui.steps.ts` | `shop-ts` | E-CI, E-BR, E-OFF | C001-T-075 |
| C001-TC-604 | C001-TS-610 | TS-611, TS-612, TS-613, TS-614, TS-639 | e2e | acceptance | `test/acceptance/steps/cap-06/req-604.steps.ts` | `sample-ts`, `shop-ts` | E-CI, E-OFF | C001-T-071 |
| C001-TC-605 | C001-TS-615 | TS-616 | e2e | acceptance | `test/acceptance/steps/cap-06/req-605.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-070 |
| C001-TC-606 | C001-TS-617 | TS-618, TS-619, TS-620, TS-621, TS-652 | e2e | acceptance | `test/acceptance/steps/cap-06/req-606.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-072 |
| C001-TC-607 | C001-TS-622 | TS-623 | e2e | acceptance | `test/acceptance/steps/cap-06/req-607.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-072 |
| C001-TC-608 | C001-TS-624 | TS-625 | e2e | browser | `test/acceptance/steps/cap-06/req-608.ui.steps.ts` | `shop-ts` | E-CI, E-BR, E-OFF | C001-T-075 |
| C001-TC-609 | C001-TS-626 | TS-627, TS-628 | e2e | acceptance | `test/acceptance/steps/cap-06/req-609.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-072 |
| C001-TC-610 | C001-TS-629 | TS-630, TS-631 | e2e | acceptance | `test/acceptance/steps/cap-06/req-610.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-073 |
| C001-TC-611 | C001-TS-632 | — | e2e | acceptance | `test/acceptance/steps/cap-06/req-611.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-073 |
| C001-TC-612 | C001-TS-633 | TS-634 | e2e | acceptance | `test/acceptance/steps/cap-06/req-612.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-073 |
| C001-TC-613 | C001-TS-635 | TS-636 | e2e | acceptance | `test/acceptance/steps/cap-06/req-613.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-074 |
| C001-TC-614 | C001-TS-637 | TS-638 | e2e | acceptance | `test/acceptance/steps/cap-06/req-614.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-074 |
| C001-TC-615 | C001-TS-645 | TS-646, TS-647 | e2e | acceptance | `test/acceptance/steps/cap-06/req-615.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-073 |
| C001-TC-616 | C001-TS-640 | TS-641, TS-642, TS-643, TS-644, TS-651, TS-653 | e2e | acceptance | `test/acceptance/steps/cap-06/req-616.steps.ts` | `sample-ts`, `shop-ts` | E-CI, E-OFF | C001-T-071 |
| C001-TC-617 | C001-TS-648 | TS-649, TS-650 | e2e | acceptance | `test/acceptance/steps/cap-06/req-617.steps.ts` | `shop-ts` | E-CI, E-OFF | C001-T-072 |
| C001-TC-650 | C001-TS-610 | TS-614, TS-640, TS-641, TS-642, TS-643, TS-644 | unit | unit | `test/unit/review-coverage/sampling.property.test.ts` | fast-check populations that grow and shrink; seeded draws; sample size rounded up to 10 % | E-CI | C001-T-071 |
| C001-TC-651 | C001-TS-632 | TS-634, TS-647 | unit | unit | `test/unit/review-coverage/reading-queue.test.ts` | hunk lists with changed lines, risk scores and budgets at, below and above the queue sums | E-CI | C001-T-073 |

### 4.8 CAP-07 — Verdicts and review record

| TC | TS | Further TS | Level | Kind | Location | Test data | Environment | Task |
|---|---|---|---|---|---|---|---|---|
| C001-TC-701 | C001-TS-701 | TS-702, TS-703 | e2e | acceptance | `test/acceptance/steps/cap-07/req-701.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-076 |
| C001-TC-702 | C001-TS-704 | TS-705, TS-706, TS-707 | e2e | acceptance | `test/acceptance/steps/cap-07/req-702.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-076, C001-T-083 |
| C001-TC-703 | C001-TS-708 | TS-709, TS-710, TS-711, TS-712, TS-713 | e2e | acceptance | `test/acceptance/steps/cap-07/req-703.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-076 |
| C001-TC-704 | C001-TS-714 | TS-715, TS-716 | e2e | acceptance | `test/acceptance/steps/cap-07/req-704.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-076 |
| C001-TC-705 | C001-TS-717 | TS-718 | e2e | acceptance | `test/acceptance/steps/cap-07/req-705.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-076 |
| C001-TC-706 | C001-TS-719 | TS-720, TS-721, TS-764 | e2e | acceptance | `test/acceptance/steps/cap-07/req-706.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-076 |
| C001-TC-707 | C001-TS-722 | TS-723 | e2e | acceptance | `test/acceptance/steps/cap-07/req-707.steps.ts` | `verdicts`; repository record of CAP-05 | E-CI, E-OFF | C001-T-079 |
| C001-TC-708 | C001-TS-724 | TS-725, TS-726 | e2e | acceptance | `test/acceptance/steps/cap-07/req-708.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-078 |
| C001-TC-709 | C001-TS-727 | TS-728 | e2e | acceptance | `test/acceptance/steps/cap-07/req-709.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-047, C001-T-083 |
| C001-TC-710 | C001-TS-729 | — | e2e | acceptance | `test/acceptance/steps/cap-07/req-710.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-077, C001-T-083 |
| C001-TC-711 | C001-TS-730 | TS-731 | e2e | acceptance | `test/acceptance/steps/cap-07/req-711.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-078, C001-T-082 |
| C001-TC-712 | C001-TS-732 | TS-733, TS-734 | e2e | acceptance | `test/acceptance/steps/cap-07/req-712.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-076 |
| C001-TC-713 | C001-TS-735 | TS-736 | e2e | acceptance | `test/acceptance/steps/cap-07/req-713.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-007, C001-T-079 |
| C001-TC-714 | C001-TS-737 | — | e2e | acceptance | `test/acceptance/steps/cap-07/req-714.steps.ts` | `verdicts`; `10-spec/50-interfaces/review-record.schema.json` | E-CI, E-OFF | C001-T-079 |
| C001-TC-715 | C001-TS-738 | TS-739, TS-740, TS-741, TS-751 | e2e | acceptance | `test/acceptance/steps/cap-07/req-715.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-078 |
| C001-TC-716 | C001-TS-742 | TS-743, TS-744 | e2e | acceptance | `test/acceptance/steps/cap-07/req-716.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-078 |
| C001-TC-717 | C001-TS-745 | TS-746, TS-747, TS-752 | e2e | acceptance | `test/acceptance/steps/cap-07/req-717.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-078 |
| C001-TC-718 | C001-TS-748 | TS-749, TS-750 | e2e | acceptance | `test/acceptance/steps/cap-07/req-718.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-078, C001-T-083 |
| C001-TC-719 | C001-TS-753 | TS-754, TS-755 | e2e | acceptance | `test/acceptance/steps/cap-07/req-719.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-047 |
| C001-TC-720 | C001-TS-756 | TS-757 | e2e | acceptance | `test/acceptance/steps/cap-07/req-720.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-077 |
| C001-TC-721 | C001-TS-758 | TS-759, TS-760, TS-761, TS-762, TS-763, TS-765 | e2e | acceptance | `test/acceptance/steps/cap-07/req-721.steps.ts` | `verdicts` with git identity set, missing and blank at system, global, local and included configuration levels | E-CI, E-OFF | C001-T-076 |
| C001-TC-722 | C001-TS-766 | TS-767, TS-768 | e2e | acceptance | `test/acceptance/steps/cap-07/req-722.steps.ts` | `verdicts` | E-CI, E-OFF | C001-T-077 |
| C001-TC-750 | C001-TS-708 | TS-709 | e2e | browser | `test/acceptance/steps/cap-07/req-703.ui.steps.ts` | `verdicts` | E-CI, E-BR, E-OFF | C001-T-083 |
| C001-TC-751 | C001-TS-716 | — | e2e | browser | `test/acceptance/steps/cap-07/req-704.ui.steps.ts` | `verdicts`; markup reason with script and event-handler payloads | E-CI, E-BR, E-OFF | C001-T-083 |
| C001-TC-752 | C001-TS-719 | TS-720, TS-721, TS-764 | unit | unit | `test/unit/verdicts/reason-text.test.ts` | empty, ASCII whitespace, U+00A0 and other Unicode space strings; text between spaces | E-CI | C001-T-076 |
| C001-TC-753 | C001-TS-753 | TS-754, TS-755 | unit | unit | `test/unit/intent-map/intent-name.test.ts` | names that differ by whitespace collapsing and case folding; titles from other sources | E-CI | C001-T-047 |

### 4.9 CAP-08 — Model provider and model-free mode

| TC | TS | Further TS | Level | Kind | Location | Test data | Environment | Task |
|---|---|---|---|---|---|---|---|---|
| C001-TC-801 | C001-TS-801 | TS-802, TS-803 | e2e | acceptance | `test/acceptance/steps/cap-08/req-801.steps.ts` | local stub | E-CI | C001-T-085 |
| C001-TC-802 | C001-TS-804 | TS-805 | e2e | acceptance | `test/acceptance/steps/cap-08/req-802.steps.ts` | `fx-sdd`, `fx-nosdd` | E-CI, E-OFF | C001-T-085, C001-T-097 |
| C001-TC-803 | C001-TS-806 | TS-807, TS-808 | e2e | acceptance | `test/acceptance/steps/cap-08/req-803.steps.ts` | `surfaces`; per-process network capture | E-CI, E-NET | C001-T-085, C001-T-095 |
| C001-TC-804 | C001-TS-809 | TS-810, TS-811 | e2e | acceptance | `test/acceptance/steps/cap-08/req-804.steps.ts` | local stub | E-CI | C001-T-085 |
| C001-TC-805 | C001-TS-812 | TS-813 | e2e | acceptance | `test/acceptance/steps/cap-08/req-805.steps.ts` | local stub (OpenAI-compatible chat, local socket), cloud stub (Anthropic Messages) | E-CI, E-NET | C001-T-087 |
| C001-TC-806 | C001-TS-814 | TS-815, TS-816, TS-817, TS-818, TS-848, TS-849 | e2e | acceptance | `test/acceptance/steps/cap-08/req-806.steps.ts` | local stub, cloud stub; a "local" runtime on another host of the test network | E-CI, E-NET | C001-T-088 |
| C001-TC-807 | C001-TS-819 | TS-820, TS-821 | e2e | browser | `test/acceptance/steps/cap-08/req-807.ui.steps.ts` | local stub, cloud stub | E-CI, E-BR, E-NET | C001-T-091 |
| C001-TC-808 | C001-TS-822 | TS-823, TS-824 | e2e | acceptance | `test/acceptance/steps/cap-08/req-808.steps.ts` | local stub, cloud stub | E-CI, E-NET | C001-T-088 |
| C001-TC-809 | C001-TS-825 | TS-826, TS-827 | e2e | acceptance | `test/acceptance/steps/cap-08/req-809.steps.ts` | cloud stub; key in an environment variable, in the OS credential store, and written into the repository | E-CI, E-NET | C001-T-086 |
| C001-TC-810 | C001-TS-828 | TS-829 | e2e | acceptance | `test/acceptance/steps/cap-08/req-810.steps.ts` | local stub | E-CI | C001-T-089, C001-T-091 |
| C001-TC-811 | C001-TS-830 | TS-831 | e2e | acceptance | `test/acceptance/steps/cap-08/req-811.steps.ts` | local stub | E-CI | C001-T-089 |
| C001-TC-812 | C001-TS-832 | TS-833, TS-834 | e2e | browser | `test/acceptance/steps/cap-08/req-812.ui.steps.ts` | local stub | E-CI, E-BR | C001-T-090, C001-T-091 |
| C001-TC-814 | C001-TS-835 | TS-836, TS-837, TS-838, TS-850 | e2e | acceptance | `test/acceptance/steps/cap-08/req-814.steps.ts` | local stub, cloud stub; marker strings in model-excluded files | E-CI, E-NET | C001-T-088 |
| C001-TC-815 | C001-TS-839 | TS-840, TS-851 | e2e | acceptance | `test/acceptance/steps/cap-08/req-815.steps.ts` | local stub | E-CI | C001-T-088 |
| C001-TC-816 | C001-TS-841 | TS-842, TS-843, TS-852, TS-853 | e2e | acceptance | `test/acceptance/steps/cap-08/req-816.steps.ts` | local stub (unreachable, slow, unusable, non-200 modes), cloud stub | E-CI, E-NET | C001-T-089 |
| C001-TC-817 | C001-TS-844 | TS-845, TS-846, TS-854, TS-855 | e2e | acceptance | `test/acceptance/steps/cap-08/req-817.steps.ts` | local stub, cloud stub | E-CI, E-NET | C001-T-089 |
| C001-TC-818 | C001-TS-847 | — | e2e | acceptance | `test/acceptance/steps/cap-08/req-818.steps.ts` | local stub | E-CI | C001-T-089 |
| C001-TC-819 | C001-TS-856 | TS-857 | e2e | acceptance | `test/acceptance/steps/cap-08/req-819.steps.ts` | local stub, cloud stub | E-CI, E-NET | C001-T-035, C001-T-085 |
| C001-TC-820 | C001-TS-858 | TS-859, TS-860, TS-861, TS-862 | e2e | acceptance | `test/acceptance/steps/cap-08/req-820.steps.ts` | local stub, cloud stub; credential-store service names | E-CI, E-NET | C001-T-035, C001-T-086 |
| C001-TC-850 | C001-TS-816 | TS-817, TS-848, TS-849 | unit | unit | `test/unit/model/endpoint-locality.test.ts` | loopback IPv4 and IPv6 addresses, addresses just outside loopback, `localhost` and other host names | E-CI | C001-T-088 |
| C001-TC-851 | C001-TS-826 | TS-858 | integration | integration | `test/integration/model/keys/credential-store.test.ts` | a test key stored under service `sdd-review` in macOS Keychain, Windows Credential Manager and Linux Secret Service (gnome-keyring in a D-Bus session) | E-CI | C001-T-086 |
| C001-TC-852 | C001-TS-854 | — | unit | unit | `test/unit/model/failures.test.ts` | every HTTP status class and the statuses named in `10-spec/50-interfaces/model-provider.md` | E-CI | C001-T-089 |

### 4.10 CAP-09 — CLI and local review UI

| TC | TS | Further TS | Level | Kind | Location | Test data | Environment | Task |
|---|---|---|---|---|---|---|---|---|
| C001-TC-901 | C001-TS-901 | TS-902 | e2e | browser | `test/acceptance/steps/cap-09/req-901.ui.steps.ts` | `surfaces`; browser launcher double | E-CI, E-BR, E-OFF | C001-T-012 |
| C001-TC-902 | C001-TS-903 | — | e2e | acceptance | `test/acceptance/steps/cap-09/req-902.steps.ts` | `surfaces`; browser launcher double that fails | E-CI, E-OFF | C001-T-012 |
| C001-TC-904 | C001-TS-904 | TS-905, TS-906, TS-948 | e2e | browser | `test/acceptance/steps/cap-09/req-904.ui.steps.ts` | `surfaces` | E-CI, E-BR, E-OFF | C001-T-084 |
| C001-TC-905 | C001-TS-907 | TS-908, TS-909 | e2e | acceptance | `test/security/sockets/req-905.steps.ts` | `surfaces` | E-CI, E-LAN | C001-T-011, C001-T-092 |
| C001-TC-906 | C001-TS-910 | TS-911 | e2e | acceptance | `test/security/origin/req-906.steps.ts` | `surfaces` | E-CI, E-OFF | C001-T-011 |
| C001-TC-907 | C001-TS-913 | TS-914, TS-915, TS-916 | e2e | browser | `test/security/origin/req-907.ui.steps.ts` | `surfaces`; a page of another origin, the page of a second review, a local HTTP client | E-CI, E-BR, E-OFF | C001-T-011, C001-T-092 |
| C001-TC-908 | C001-TS-917 | TS-918, TS-919 | e2e | browser | `test/acceptance/steps/cap-09/req-908.ui.steps.ts` | `surfaces` with remote references in code under review; browser request log | E-CI, E-BR, E-OFF | C001-T-011, C001-T-092, C001-T-095 |
| C001-TC-909 | C001-TS-920 | TS-921 | e2e | browser | `test/acceptance/steps/cap-09/req-909.ui.steps.ts` | `surfaces` | E-CI, E-BR, E-OFF | C001-T-056 |
| C001-TC-910 | C001-TS-922 | TS-923 | e2e | browser | `test/acceptance/steps/cap-09/req-910.ui.steps.ts` | `surfaces` | E-CI, E-BR, E-OFF | C001-T-056 |
| C001-TC-911 | C001-TS-924 | TS-925 | e2e | browser | `test/acceptance/steps/cap-09/req-911.ui.steps.ts` | `surfaces`, `stub-llm` | E-CI, E-BR, E-OFF | C001-T-056 |
| C001-TC-912 | C001-TS-926 | TS-927 | e2e | acceptance | `test/acceptance/steps/cap-09/req-912.steps.ts` | `surfaces` | E-CI, E-OFF | C001-T-004, C001-T-010 |
| C001-TC-913 | C001-TS-928 | — | e2e | acceptance | `test/acceptance/steps/cap-09/req-913.steps.ts` | `surfaces`; package installed without the `web/` bundle | E-CI, E-OFF | C001-T-001, C001-T-009 |
| C001-TC-914 | C001-TS-929 | TS-930, TS-931 | e2e | acceptance | `test/acceptance/steps/cap-09/req-914.steps.ts` | `surfaces` | E-CI, E-OFF | C001-T-003, C001-T-010 |
| C001-TC-915 | C001-TS-933 | TS-934 | e2e | acceptance | `test/acceptance/steps/cap-09/req-915.steps.ts` | `surfaces` | E-CI, E-OFF | C001-T-082 |
| C001-TC-916 | C001-TS-935 | TS-936 | e2e | acceptance | `test/acceptance/steps/cap-09/req-916.steps.ts` | `surfaces` | E-CI, E-OFF | C001-T-082 |
| C001-TC-917 | C001-TS-937 | TS-938 | e2e | browser | `test/acceptance/steps/cap-09/req-917.ui.steps.ts` | `surfaces` with 100 intents | E-CI, E-BR, E-OFF | C001-T-081 |
| C001-TC-918 | C001-TS-939 | TS-940, TS-949 | e2e | acceptance | `test/acceptance/steps/cap-09/req-918.steps.ts` | `surfaces` | E-CI, E-OFF | C001-T-080 |
| C001-TC-919 | C001-TS-941 | TS-942, TS-943 | e2e | acceptance | `test/acceptance/steps/cap-09/req-919.steps.ts` | `surfaces`, `stub-llm` | E-CI, E-OFF | C001-T-080 |
| C001-TC-920 | C001-TS-944 | TS-945 | e2e | acceptance | `test/acceptance/steps/cap-09/req-920.steps.ts` | `surfaces`; store directory made read-only for TS-945 | E-CI, E-OFF | C001-T-007, C001-T-080 |
| C001-TC-921 | C001-TS-946 | — | e2e | browser | `test/acceptance/steps/cap-09/req-921.ui.steps.ts` | `surfaces` | E-CI, E-BR, E-OFF | C001-T-084 |
| C001-TC-922 | C001-TS-947 | — | e2e | browser | `test/acceptance/steps/cap-09/req-922.ui.steps.ts` | `surfaces` | E-CI, E-BR, E-OFF | C001-T-084 |
| C001-TC-950 | C001-TS-912 | — | e2e | browser | `test/security/origin/req-906.ui.steps.ts` | `surfaces`; host name `rebind.attacker.test` resolved to 127.0.0.1 | E-CI, E-BR, E-OFF | C001-T-092 |
| C001-TC-951 | C001-TS-932 | — | e2e | browser | `test/acceptance/steps/cap-09/req-915.ui.steps.ts` | `surfaces` | E-CI, E-BR, E-OFF | C001-T-082 |

### 4.11 Executors of manual test cases

| TC | Executor |
|---|---|
| C001-TC-007 | Study moderator appointed by P-01 (neither a participant, nor the defect seeder, nor a rater); owner of C001-T-110, C001-T-112 and C001-T-113 to C001-T-116. Seeding: the study seeder (C001-T-111). Rating and analysis: the two raters and the owner of C001-T-102 |

## 5. NFR verification

| NFR | Approach | TC | Task | Evidence |
|---|---|---|---|---|
| C001-NFR-001 | Timing harness of C001-T-013: cold start (no cached analysis results, file-system cache dropped), model-free, 5 runs per benchmark change; stop point = the architecture delta rendered in the review UI (Playwright waits for the delta's ready mark); maximum per benchmark change against ≤ 120 s. The spike C001-TC-002 runs first (DP-1). | C001-TC-001, C001-TC-002 | C001-T-093, C001-T-014 | C001-DOD-010 |
| C001-NFR-002 | Same harness, 3 runs per benchmark change; stop point = the last model output (extracted intents, model links, design critique, accounts) recorded for the snapshot. Threshold ≤ 15 min with the reference cloud provider; the local-provider runs are reported without a threshold. Reference providers below. | C001-TC-003 | C001-T-093 | C001-DOD-011 |
| C001-NFR-003 | Playwright replays a scripted session of 500 actions (open component, intent, hunk; mark; move; decide) on each 10,000-line benchmark change; the web client sets performance marks at input and after render; p95 ≤ 200 ms and maximum ≤ 1 s per browser version, on the reference machine (E-REF) in each of the two latest major versions of Chrome, Edge and Firefox, which are the supported browsers of C001-NFR-017; versions recorded. The prototype C001-TC-005 runs first (DP-1). | C001-TC-004, C001-TC-005 | C001-T-094, C001-T-023 | C001-DOD-012 |
| C001-NFR-004 | Memory sampler of C001-T-013 (resident memory of the core's process tree every 100 ms, project commands and local model runtime excluded by process ancestry) during the C001-TC-001 runs; peak ≤ 2 GiB. | C001-TC-001, C001-TC-002 | C001-T-093, C001-T-014 | C001-DOD-013 |
| C001-NFR-005 | Steps 1 to 5 of the NFR method, scripted in `bench/open-share/`: start with intake and environment of §0, wait for the end of the test run and mutation testing, record "expresses" on every intent with test hunks through the CLI, read total and split from the shares and evidence records; validity step 5 repeats an environment-faulted run before any "If wrong" step of C001-AS-07. | C001-TC-006 | C001-T-098 | C001-DOD-015 |
| C001-NFR-006 | Comparison study of §6 (crossover, 8 participants, four seeded changes); ratio of mean review times ≤ 0.50. | C001-TC-007 | C001-T-109, C001-T-110, C001-T-111, C001-T-112, C001-T-113, C001-T-114, C001-T-115, C001-T-116, C001-T-102 | C001-DOD-016, C001-DOD-018 |
| C001-NFR-007 | Same sessions; mean share of seeded defects found with the review assistant minus with the standard diff review ≥ 0 percentage points. | C001-TC-007 | C001-T-109, C001-T-110, C001-T-111, C001-T-112, C001-T-113, C001-T-114, C001-T-115, C001-T-116, C001-T-102 | C001-DOD-017, C001-DOD-018 |
| C001-NFR-008 | (a) per-ecosystem acceptance jobs over the scenarios tagged `@language` (every scenario whose fixture is an `fx-shop-*` or `shop-*` repository of that ecosystem), run on the reference repository of that ecosystem as C001-TC-008 states, 100 % each; (b) one scripted full flow, intake to verdict, on the reference repository outside the deep ecosystems, asserting a reduced label on each reduced result. | C001-TC-008 | C001-T-100 | C001-DOD-019 |
| C001-NFR-009 | (a) the socket listing of every review-assistant process during a review on each runner kind of E-CI, 0 non-loopback sockets; (b) connection attempts to every listening port from a second host (E-LAN) on each operating system of C001-NFR-016: Ubuntu x86-64 (bridged container in CI), Windows 11 x86-64 (`win11` with a LAN host), macOS 14 or later x86-64 and macOS 14 or later arm64 (rented cloud Macs with a Linux instance in the same virtual network as the second host, once per release candidate, Q-secondhost-01); 0 successes on each. | C001-TC-009, C001-TC-905 | C001-T-092 | C001-DOD-020 |
| C001-NFR-010 | One request per operation of `openapi.yaml`, from a page of another origin and through a DNS-rebinding host name, in each browser of E-BR; 0 accepted, review state unchanged (store compared before and after). | C001-TC-010, C001-TC-907, C001-TC-950 | C001-T-092 | C001-DOD-021 |
| C001-NFR-011 | Full review flow on each benchmark change, once model-free and once with the reference local provider; eBPF tracing of `connect` for the review assistant's process tree (the command runner's child trees excluded by ancestry, as the metric excludes project commands) and the browser's net log for the UI page; 0 non-loopback connections. Run on E-REF, the NFR's environment; the per-push CI job "egress" runs the scenario-level checks C001-TC-803 and C001-TC-814 against the stubs and is an early guard, not the C001-NFR-011 evidence. | C001-TC-011, C001-TC-803 | C001-T-095 | C001-DOD-022 |
| C001-NFR-012 | Full flow against the recording cloud stub on an isolated network (E-NET on E-REF), marker strings in files on model-excluded paths; capture as in C001-NFR-011; 0 connections to other destinations, 0 recorded requests holding a marker. | C001-TC-012, C001-TC-814 | C001-T-095 | C001-DOD-023 |
| C001-NFR-013 | E-OFF job (CI): (a) every scenario without the `@model` tag passes with no provider and loopback-only networking, each on the repository its Given steps build, since a scenario fixes its own repository content; (b) the full flow, intake to verdict, completes on the reference repositories of `30-nfr/nfr.md` §0: on the benchmark change with an SDD workspace and on a benchmark change without one, each with its intake and environment of §0. | C001-TC-013 | C001-T-097 | C001-DOD-024 |
| C001-NFR-014 | Fault injection: 200-action session (each of the ten kinds of C001-REQ-721 at least 5 times), core killed at a seeded random point, 20 repetitions per runner kind; every entry confirmed before the kill present with its state after resume. | C001-TC-014, C001-TC-920 | C001-T-096 | C001-DOD-025 |
| C001-NFR-015 | 5 model-free analyses per benchmark change in a nightly CI job and at the closing commit; architecture delta, intent map and static risk scores compared after removing timestamps and run identifiers; per-push guard on fixtures through C001-TS-418 and C001-TS-927. | C001-TC-015, C001-TC-405, C001-TC-912 | C001-T-097 | C001-DOD-026 |
| C001-NFR-016 | E-CI matrix report at the closing commit: every scenario passes on each runner kind. Windows 11 x86-64 evidence (Q-ci-02): the closing-commit run on the Windows 11 self-hosted runner `win11` of E-CI (set up by C001-T-104); its nightly runs surface Windows 11-only faults before then. The hosted `windows-2025` runs on every push (hosted matrix of C001-T-001) are an early guard and do not count as Windows 11 evidence. | C001-TC-016 | C001-T-100, C001-T-001, C001-T-104 | C001-DOD-027 |
| C001-NFR-017 | E-BR matrix report at the closing commit: every browser-kind scenario passes in the two latest majors of Chrome, Edge and Firefox, versions recorded. | C001-TC-017 | C001-T-100 | C001-DOD-028 |
| C001-NFR-018 | (a), (b), (c) as the metric states, 3 runs per benchmark change, each run in a new core process with newly prepared workspaces; (c) with a bundle of 10 fixed-text commands, at least one run during mutation testing (started after the mutation copy) and one after; preparation time and the C001-AS-08 ratio reported. W1 to W6 measured first in C001-M-01 (DP-1). | C001-TC-018, C001-TC-019 | C001-T-093, C001-T-021 | C001-DOD-014 |

**Reference providers of C001-NFR-002 (named here as the NFR's method requires).**
- **Reference cloud provider:** Anthropic, through the Anthropic Messages adapter of C001-REQ-805.
- **Reference cloud model (rule):** the newest generally available Claude Sonnet model, identified
  by its dated snapshot ID (the model ID that names a fixed snapshot, never an alias that the vendor
  moves to newer snapshots), on the day C001-T-093 freezes its benchmark configuration. The dated ID
  cannot be named at G3: it is fixed by the procedure below, and every run of a release uses it.
- **Pinning procedure (owner of C001-T-093, before the first run of C001-TC-003):**
  1. List the models of the account with the Anthropic Models API (`GET /v1/models`) on E-REF-CLOUD
     and take the newest Sonnet entry that the vendor's model overview marks generally available
     (not beta, not deprecated).
  2. Write its dated ID and the date of the listing into the placeholder fields
     `reference_cloud_model` and `reference_cloud_model_pinned_on` of
     `bench/nfr/nfr-002.config.json`; C001-T-093 creates the file with both fields `null`, and the
     suite `nfr-002` refuses to start while a field is `null` or the model ID is an alias.
  3. Copy the ID and date into the NFR-002 section of `bench/results/release-<version>.md`
     together with the account's rate limit.
  4. If the vendor withdraws or deprecates that model before all runs of the release are done,
     repeat steps 1 to 3 and repeat every C001-NFR-002 run of the release with the new ID; runs
     with two different IDs are never combined.

  This test plan is not edited when the ID is pinned (the plan's approval hash stays valid); the
  configuration file and the report are the record of the dated ID.
- **Why this provider and rule.** Reasons: (1) the Anthropic Messages API is one of the two provider APIs of the first
  version, and the only one of the two whose reference endpoint is a cloud service, so the cloud
  measurement exercises that adapter while the local measurement exercises the OpenAI-compatible
  one; (2) the Sonnet tier is the vendor's middle tier for speed and cost, which matches a budget of
  15 minutes for the four request kinds over 10,000 changed lines better than the slowest, largest
  tier; (3) pinning the dated model ID makes the 3 runs per benchmark change comparable. The API key
  is read from an environment variable on E-REF-CLOUD (C001-REQ-809); the account's rate limit is
  recorded in the report so that a miss caused by throttling can be told apart from a miss of the
  tool.
- **Reference local provider** (reported without a threshold): Ollama on the reference machine
  through its OpenAI-compatible endpoint on loopback, model `qwen2.5-coder:7b`, CPU only.

## 6. Comparison study protocol (C001-NFR-006, C001-NFR-007)

Executable form of `30-nfr/nfr.md` §3; the numbered items there stay the rule, this section adds
who does what, in which order and with which record. Protocol materials (forms, record layout,
the commands `g8-assign`, `g8-check-record` and `g8-analyse`) live in `study/g8/` (C001-T-109),
the tutorial script in `study/g8/tutorial.md` (C001-T-101), records in `study/g8/record/`
(C001-T-112 to C001-T-116, ratings by C001-T-102), the result in `study/g8/RESULTS.md`
(C001-T-102, `78-observability.md`). Participants appear in the repository by participant code
only; consent forms and names stay with the moderator, outside the repository.

1. **Roles.** P-01 appoints the moderator, one defect seeder and two raters; none of them is a
   participant, and the seeder is neither moderator nor rater. The seeder of the study is not the
   calibration seeder of C001-T-107 and C001-T-108.
2. **Changes (C001-T-110, record `study/g8/pool.json`).** The moderator takes four agent changes from a coding agent working from written task
   descriptions, labelled A (2,000–3,000 changed lines), B (3,001–5,000), C (5,001–8,000) and
   D (8,001–10,000), covering each deep ecosystem at least once, with at least one SDD workspace and
   one without; plus one practice change outside the pool. No pool change shares a commit range or
   a task description with a benchmark change or a change of the calibration corpus (§2). Changes
   are frozen as commits before seeding.
3. **Seeding (C001-T-111, sealed lists in `study/g8/sealed/`).** The seeder seeds at least 8 defects into each change, at least one of each of the six
   kinds of §3 item 3, and writes the sealed list (file, lines, kind, description) into an encrypted
   file whose key only the seeder holds until the last session has ended.
4. **Recruitment (C001-T-112).** 8 developers who use coding agents, have not worked on the review
   assistant and have not seen the changes, plus 2 reserves who meet the same conditions; each signs
   the consent form and is assigned a participant row below by a seeded random draw
   (`npm run study -- g8-assign --seed <seed>`) recorded in `study/g8/record/assignment.json`. A
   participant who drops out before both sessions are done is replaced by a reserve who takes the
   same row from its first session; the dropped participant's sessions are logged and not counted,
   so the analysis always holds 8 complete rows.
5. **Assignment (counterbalanced crossover).**

   | Row | First session | Second session |
   |---|---|---|
   | 1 | A with the review assistant | B with the standard diff review |
   | 2 | B with the standard diff review | A with the review assistant |
   | 3 | B with the review assistant | A with the standard diff review |
   | 4 | A with the standard diff review | B with the review assistant |
   | 5 | C with the review assistant | D with the standard diff review |
   | 6 | D with the standard diff review | C with the review assistant |
   | 7 | D with the review assistant | C with the standard diff review |
   | 8 | C with the standard diff review | D with the review assistant |

   Each change is reviewed twice with each method; each method comes first four times. The
   sessions of rows 1 and 2, 3 and 4, 5 and 6, 7 and 8 are the tasks C001-T-113, C001-T-114,
   C001-T-115 and C001-T-116, each recorded in `study/g8/record/row-<n>/` and checked with
   `npm run study -- g8-check-record --rows <list>`.
6. **Training.** Directly before the session with the review assistant, the 30-minute tutorial on the
   practice change, from the script `study/g8/tutorial.md` (built on the user documentation of
   C001-T-101).
7. **Session.** The moderator opens the change (standard diff review: the participant's usual diff
   viewer, files in default order, no AI assistance; review assistant: `sdd-review review` with the
   change's intake). The participant decides for the change as a whole and for each requested
   behaviour whether to accept it and writes every defect found into the session form. Self-paced,
   cap 3 hours per change; a capped session counts at the cap with the defects found until then.
8. **Time.** The moderator logs wall-clock time from opening the change to the last decision, with
   breaks recorded and subtracted, in the session log.
9. **Rating (C001-T-102, sheets in `study/g8/record/rating/`).** After the last session the seeder opens the sealed list. Both raters match each
   session form to the list independently, then settle disagreements by discussion; findings outside
   the list are logged and not counted. Agreement before discussion is reported.
10. **Analysis (C001-T-102; command built by C001-T-109).** `npm run study -- g8-analyse` computes per method the mean review time and the
    mean share of seeded defects found over all sessions, and per change; the C001-NFR-006 ratio and
    the C001-NFR-007 difference are reported descriptively with these numbers in
    `study/g8/RESULTS.md` (C001-DOD-016 to C001-DOD-018).
11. **Calendar.** Times are in working weeks of 5 days. S is the first session day: at the earliest
    the day on which the release candidate the sessions use is published and C001-T-093, C001-T-100
    and C001-T-101 are done and the release candidate is published by C001-T-105 (the
    preconditions of C001-T-113). The steps before S need no build of the review assistant and run
    in parallel with the other work of C001-M-06 and C001-M-07.

    | Step | Who | Start | End | Calendar time | Task and effort |
    |---|---|---|---|---|---|
    | Roles confirmed: moderator, seeder, two raters (item 1) | P-01 | S − 6 weeks | S − 5 weeks | 1 week | — (before C001-T-109) |
    | Recruitment of 8 participants and 2 reserves (item 4) | moderator | S − 6 weeks | S − 1 week; at least 8 confirmed by S − 2 weeks (trigger of C001-RISK-015) | 5 weeks | C001-T-112; 1 day |
    | Pool of changes A to D and the practice change produced and frozen (item 2) | moderator | S − 5 weeks | S − 3 weeks | 2 weeks | C001-T-110; 2 days |
    | Seeding and sealing, at least 32 defects (item 3) | seeder | S − 3 weeks | S − 1 week | 2 weeks | C001-T-111; 2 days |
    | Tutorial script and session forms tried with one non-participant on the release candidate (item 6) | moderator | S − 1 week | S | 2 days | C001-T-101 (tutorial), C001-T-109 (forms); 1 day |
    | Sessions: 16 sessions and 8 tutorials (items 5 to 8) | moderator, participants | S | S + 3 weeks | 2 weeks of sessions and 1 week of reserve for rescheduling and replacements | C001-T-113 to C001-T-116; 8 days (moderator) |
    | Rating: sealed list opened, two independent matchings, discussion (item 9) | seeder, two raters | S + 3 weeks | S + 4 weeks | 1 week | C001-T-102; 2 days per rater |
    | Analysis and `study/g8/RESULTS.md` (item 10) | owner of C001-T-102 | S + 4 weeks | S + 4 weeks + 2 days | 2 days | C001-T-102; the `g8-analyse` run |

    Session rules behind the calendar: the moderator runs at most 2 sessions a day and at most 8 a
    week; a participant's two sessions fall on different days, at most 7 calendar days apart, in the
    order of the participant's row. Total calendar time: 10 weeks and 2 days from S − 6 weeks to the
    result, of which 4 weeks and 2 days come after S and delay C001-T-103, which needs the study
    result. If fewer than 8 participants are confirmed at S − 2 weeks, C001-RISK-015 applies and S
    moves by the weeks recruitment needs; no session starts with fewer than 8 confirmed participants.

### 6.1 Calibration corpus roles (C001-T-106 to C001-T-108 and C001-T-099, outside the study)

The calibration corpus of §2 (C001-TC-026) needs people the plan must staff, apart from the study:

| Role | Task | Rules |
|---|---|---|
| Corpus builder (owner of C001-T-106) | C001-T-106 | produces the 12 or more agent changes with a coding agent from written task descriptions, writes test command and environment per change as `30-nfr/nfr.md` §0 writes them, builds the overlap check |
| Calibration seeder (owner of C001-T-107 and C001-T-108) | C001-T-107, C001-T-108 | appointed by P-01; is not the calibrator, not the study seeder, not a study participant or rater (C001-ADR-009 §4 item 1); seeds at least 8 defects per change covering the six kinds of `30-nfr/nfr.md` §3 item 3 and records each with file and lines; the seeder's name is recorded in `bench/calibration/corpus.json` |
| Calibrator (owner of C001-T-099) | C001-T-099 | derives the defective hunks from the seeder's recorded file and lines (C001-T-099 step 2), runs C001-TC-026 on E-REF; never sees the G-8 pool or its sealed list |

The corpus, its seeding and the calibration run end before C001-T-105 publishes the release
candidate that C001-T-093, C001-T-094, C001-T-100 and the study sessions measure, so that every
measurement of the release uses the release weights; the effort, order and calendar of these tasks
are set in the task files and `40-work-breakdown.md`.

## 7. Checks outside the test-case table

| Check | Method | Task | Evidence |
|---|---|---|---|
| Secret scan, including model-provider keys | `npm run secret-scan` at the closing commit | C001-T-103 | C001-DOD-029 |
| Dependency audit and licence check | `npm run audit`, `npm run licence-check` at the closing commit | C001-T-103, C001-T-002 | C001-DOD-030 |
| Contextual log entry on every error path | review of each error code of `10-spec/50-interfaces/errors.md` against its log call | C001-T-103 | C001-DOD-031 |
| User documentation against `10-spec/50-interfaces/` | `npm run docs:check` plus a reviewer's record | C001-T-101 | C001-DOD-032 |
| Decision point DP-1 | reads C001-TC-002, C001-TC-005, C001-TC-019 to C001-TC-023; outcomes of `10-strategy.md` §3 | C001-T-024 | `bench/results/dp-1.md` |
| Requirements without a unit test named in a `describe` title (§1, per-requirement unit tests) | list from the Vitest JSON report of `npm test` at the closing commit; each entry given a unit test or a reason in the review record | C001-T-103 | review record (DOD-G-01) |
| Global DoD items | DOD-G-01 to DOD-G-05 of the constitution apply to every task as `10-strategy.md` §2 states | every task | per task |
