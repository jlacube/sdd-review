---
id: "C001-PLAN-STRATEGY"
artifact: plan/strategy
change: "CHG-001"
phase: 20-plan
status: draft
---
# C001 — Strategy and milestones

Inputs: the approved specification (`10-spec/00-index.md`, G2 2026-11-19), the decisions
C001-ADR-001 to C001-ADR-009 (`20-decisions/`), the constitution
(`.sdd/_constitution/constitution.md`). Work breakdown and critical path: `40-work-breakdown.md`.
Tasks: `50-tasks/`.

## 1. Approach

1. **Walking skeleton first.** Milestone C001-M-01 builds the thinnest end-to-end path through every
   layer of `10-spec/60-architecture/architecture.md` §8.1: CLI `review` → core API and orchestrator
   → git access adapter → intake with the fixed diff algorithm of C001-ADR-009 → review state store
   → UI server → web client listing the changed files; and `analyse --headless` writing the intake
   document. Every later task extends a component that already runs in that path and is verified
   through the same acceptance harness (C001-T-004).
2. **Measure before the bulk.** C001-M-01 also takes the measurements on which accepted decisions
   rest, before the bulk of the analysis and evidence components is built:
   - the speed and memory spike of C001-ADR-001 (parsing both sides of a benchmark change with the
     tree-sitter parsers of C001-ADR-003, git reads G-07 and G-09 of C001-ADR-004) against
     C001-NFR-001 and C001-NFR-004 (C001-T-014);
   - the response-time prototype of C001-ADR-002 against C001-NFR-003 (C001-T-023);
   - the workspace measurements W1 to W5 and kill tests K1 to K6 of C001-ADR-006 §11 and W6 of its
     Amendment 1 (A1.6), which are preconditions of that ADR (C001-CON-22), on the production workspace, copier, observer and
     command runner of C001-COMP-011 and a spike-grade coverage and mutation harness
     (C001-T-015 to C001-T-022).
3. **Decision point DP-1** (C001-T-024) closes C001-M-01; see §3.
4. **Vertical slices per capability.** C001-M-02 to C001-M-06 each finish a group of capabilities
   end to end: core component, its document of C001-IF-008 or entries of C001-IF-009, the CLI or
   UI surface that shows it, and the acceptance scenarios of the capability. UI views are built in
   the milestone of the capability they show, not in a separate UI milestone.
5. **Model output on top of deterministic results.** Model-free mode is the default and the
   fallback (C001-CON-05, C001-CON-19). Each model task depends on the deterministic component it
   extends (C001-T-090 on C001-T-041, C001-T-045 and C001-T-046; C001-T-091 on C001-T-043 and
   C001-T-048), so model output is only ever added to deterministic results. The gateway foundation
   C001-T-085 to C001-T-089 needs neither and may run early, in parallel with C001-M-02 to C001-M-05
   (§6).
6. **Release evidence last.** C001-M-07 calibrates the risk weights of C001-ADR-009 §4 before the
   release candidate exists, publishes the release candidate (C001-T-105) and then runs the NFR
   measurements, the security, fault-injection and platform suites, the user documentation and the
   comparison study of `10-spec/30-nfr/nfr.md` §3 on it. The human-effort tasks of C001-M-07 that
   need no part of the tool (calibration corpus C001-T-106 to C001-T-108, study preparation
   C001-T-109 to C001-T-112) start early, as soon as their dependencies allow.

## 2. Rules that apply to every task

- **The specification wins over an ADR.** C001-ADR-001, C001-ADR-003, C001-ADR-004, C001-ADR-006
  and C001-ADR-008 carry an Amendment 1 (2026-11-19) that aligns them with the revised
  specification; where an amendment and the original text differ, the amendment applies. Where an
  ADR and the specification still disagree, the task follows the specification, names the passage
  and reports a defect.
- **Licences and versions are confirmed before use.** The ADRs state licence and version facts
  that were not verified online. C001-T-002 confirms them under C001-CON-07 (NFR-D-02, NFR-D-03)
  before any task adds the dependency: every task other than C001-T-001 and C001-T-002 reaches
  C001-T-002 through `depends_on` (C001-T-003, C001-T-013, C001-T-104 and C001-T-109 depend on it
  directly, every other task through one of them).
  The dev tools that C001-T-001 adds before the check (§4 formatters and linters, the licence,
  audit and secret-scan tools) are confirmed by C001-T-002 retroactively and replaced there if one
  fails. A dependency whose licence is copyleft (constitution, forbidden list) is not added and the
  affected ADR goes back to P-01.
- **No task edits an approved artifact.** After G3 nothing under `.sdd/` (specification, plan,
  ADRs, test plan) is edited by an implementation task; `change.md` changes only through `sdd`
  commands. Measurements and checks are recorded in result files of the repository
  (`spikes/*/RESULTS.md`, `bench/results/`, `docs/compliance/`, `docs/release/`, `study/g8/`). A
  result that requires a decision to change goes to P-01 through DP-1 (§3) or
  `sdd defect add --ref <ID>`; a change of tasks or ADRs goes through `/architect:revise plan`.
- **`implements` names only what the task delivers.** A task lists a functional requirement (REQ)
  in `implements` only when its code or configuration delivers that behaviour; TR-06 counts
  `implements` only, so every REQ keeps a delivering task. An NFR is listed by the tasks that build
  the behaviour or the release measurement that evidences it. A task that only enables, measures or
  decides (harness, benchmark set, spike, measurement suite, decision point, licence check,
  calibration corpus, study, publication, compliance) lists no REQ in `implements`, names in
  `satisfies_ac` the criterion whose implementation or evidence it gates (TR-07 requires one REQ or
  AC link), and lists the scenarios and test cases it runs under `verified_by`.
- **Definition of done of every task:** the global items DOD-G-01 to DOD-G-05 of the constitution,
  with the evidence of `handoff.md` (Reporting protocol, Definition of change done): the merged
  pull request approved by a person other than the author is the review record of DOD-G-03, and
  `npm run lint` over the touched languages (§4) is the tool output of DOD-G-04; every error path
  of the task logs operation, identifying inputs and cause (NFR-D-04, C001-DOD-031); the
  module-boundary rule of C001-CON-09 passes; UI tasks also pass the forbidden-HTML lint rule and
  the CSP violation test of C001-ADR-002.
- **Spec defects are reported, not worked around:** `sdd defect add --ref <ID> --summary "…"`.
- **No production code in the plan.** Signatures live in `10-spec/50-interfaces/` and in the types
  generated from it (C001-T-003).

## 3. Decision point DP-1 (end of C001-M-01)

C001-T-024 reads the results of C001-T-014 (`spikes/parse/RESULTS.md`), C001-T-021
(`bench/results/workspace-<date>.md`), C001-T-022 (`bench/results/kill-tests-<date>.md`) and
C001-T-023 (`spikes/ui/RESULTS.md`), records its outcome in `bench/results/dp-1.md` and takes exactly
one of these outcomes per finding. No outcome edits an approved artifact (§2): a decision change
goes to P-01 with `sdd defect add`, and a change of tasks goes through `/architect:revise plan`.
No outcome relaxes a threshold.

| Finding | Outcome |
|---|---|
| All measurements pass | C001-M-03 and C001-M-04 continue as planned; the results stay in their result files, to which C001-ADR-006 §11 points |
| C001-NFR-018 (b) ≤ 60 min and (c) ≤ 1 s cannot both hold (W3 against W4, C001-ADR-006 §10) | Stop the evidence tasks of C001-M-04; the conflict goes back to P-01 through the conductor (`sdd defect add --ref C001-NFR-018`); no task relaxes either threshold |
| W1 above 3.0 (C001-AS-08) | The mitigations of C001-ADR-006 §11 are added as tasks in their order through `/architect:revise plan` and measured again; a bound goes to P-01 only if the first test run still exceeds 3.0 |
| W2 above 3.0 on one ecosystem | Narrow the instrumentation (C001-ADR-007 Consequences) through `/architect:revise plan` before C001-T-057 to C001-T-059 start; measured again. Still above 3.0 after narrowing: `sdd defect add --ref C001-NFR-018`, and C001-T-057 to C001-T-059 and the evidence tasks depending on them wait for P-01's decision; the threshold is not relaxed and C001-NFR-018 (a) is not carried forward as a miss without P-01 |
| A kill test K1 to K6 fails | The mechanism goes back to P-01 for a superseding ADR (C001-ADR-006 §11); C001-M-04 waits |
| The parse spike misses its pass condition (C001-T-014: git reads plus parsing plus extraction ≤ 60 s and peak memory ≤ 1 GiB per benchmark change, half of the budgets of C001-NFR-001 and C001-NFR-004) with the WebAssembly grammars, and the native-module alternative measured by C001-T-014 passes it | The hot path moves behind the parser port into a native module (C001-ADR-001); C001-T-036 is revised through `/architect:revise plan` before it starts |
| The native-module alternative also misses the pass condition | Goes back to P-01 with Rust as the alternative (`sdd defect add --ref C001-ADR-001`); C001-M-03 tasks that use the parser port wait |
| The UI prototype misses p95 ≤ 200 ms after virtualisation | The UI stack goes back to P-01 (C001-ADR-002) before C001-T-043 starts |

DP-1 gates exactly the tasks that use its measured mechanisms: C001-T-036 and every task that
depends on it, and C001-T-060 and every task that depends on it. C001-M-02 (intake, intent sources,
configuration) and C001-T-044 of C001-M-03 (intents from requirements, commits and plan items; it
uses no parser) do not wait for DP-1 and run in parallel with the measurements; so do the gateway
foundation C001-T-085 to C001-T-089 and the calibration and study preparation of C001-M-07.

## 4. Toolchain and layout

- **Runtime:** Node.js 22 or later (C001-ADR-001, C001-CON-18). Supported lines at release: Node.js
  22 LTS and Node.js 24 LTS [ASSUMPTION: Node.js 22 and 24 are the supported LTS lines at release;
  C001-T-002 confirms them from the published release schedule]. Git 2.34 or later (C001-ADR-004).
- **.NET line** (build of the C# startup hook of C001-T-059, `lint:cs`, the C#/.NET fixtures): the
  .NET 10 SDK, and target framework `net10.0` for the startup hook. .NET 8 (LTS) and .NET 9 (STS,
  extended to 24 months) left Microsoft support on 2026-11-10, which leaves .NET 10 (LTS, released
  November 2025, supported until November 2028) as the oldest line in support
  [ASSUMPTION: .NET 10 is the oldest .NET line in Microsoft support at release and .NET 8 support
  ended on 2026-11-10; planner's knowledge, not verified online; C001-T-002 confirms both from the
  .NET support policy and records the confirmed line in
  `docs/compliance/licence-and-version-report.md`; if it differs, that recorded line applies to every
  task that names the .NET line of this section]. Tasks name "the .NET line of `10-strategy.md` §4", never a
  version of their own.
- **Plan choices of test tooling** (no ADR needed; licences confirmed by C001-T-002): Vitest for
  unit and property tests with fast-check for C001-REQ-402; Cucumber.js running the Gherkin
  scenarios of the acceptance files by scenario ID; Playwright for browser tests in Chrome, Edge and
  Firefox (C001-NFR-017).
- **Formatters and linters per language** (constitution, code-style rule; evidence of DOD-G-04;
  set up by C001-T-001, licences confirmed by C001-T-002; plan choices, no ADR needed):

  | Language | Where | Formatter | Linter | Script |
  |---|---|---|---|---|
  | TypeScript and JavaScript (with JSON, YAML, Markdown of the package) | `src/`, `web/`, `scripts/`, `test/`, `bench/` | Prettier | ESLint with typescript-eslint, including the module-boundary rule of C001-CON-09 and the forbidden-HTML rule of C001-ADR-002 | `npm run lint:ts` |
  | Python | `runtime/python/` (import hook, pytest plugin, mutation engine; `runtime/python/vendor/` excluded) | Ruff formatter (`ruff format --check`) | Ruff linter (`ruff check`) | `npm run lint:py` |
  | C# | `runtime/dotnet/` (startup hook of C001-T-059) | `dotnet format` (whitespace and style, `--verify-no-changes`) | .NET analysers with `EnforceCodeStyleInBuild` and warnings as errors | `npm run lint:cs` |

  `npm run lint` runs all three; CI runs it on every push. The C# startup hook is built by
  `npm run build:dotnet` inside `npm run build` and shipped in `runtime/dotnet/dist/` (C001-T-059);
  the Python code ships as source.
- **Source layout** (one npm package, C001-ADR-001 item 2):

| Path | Content |
|---|---|
| `src/cli/` | C001-COMP-001 |
| `src/core/api/`, `src/core/orchestrator/` | C001-COMP-002 |
| `src/core/git/` | C001-COMP-003 |
| `src/core/intake/` | C001-COMP-004 |
| `src/core/intent-sources/` | C001-COMP-005 |
| `src/core/config/` | C001-COMP-006 |
| `src/core/language/` | C001-COMP-007 |
| `src/core/architecture/` | C001-COMP-008 |
| `src/core/intent-map/` | C001-COMP-009 |
| `src/core/triage/` | C001-COMP-010 |
| `src/core/evidence/` | C001-COMP-011 |
| `src/core/review-coverage/` | C001-COMP-012 |
| `src/core/verdicts/` | C001-COMP-013 |
| `src/core/store/` | C001-COMP-014 |
| `src/core/model/` | C001-COMP-015; adapters C001-COMP-016 and C001-COMP-017 in `src/core/model/adapters/` |
| `src/ui-server/` | C001-COMP-018 |
| `web/` | C001-COMP-019 |
| `runtime/node/`, `runtime/python/`, `runtime/dotnet/` | adapters, hooks and the Python mutation engine shipped with the package (C001-ADR-006 §1, C001-ADR-007) |
| `src/generated/` | types generated from `10-spec/50-interfaces/` (C001-ADR-001 item 3) |
| `test/unit/`, `test/integration/`, `test/acceptance/`, `test/fixtures/`, `test/security/`, `test/fault/` | tests by level (`60-test-plan.md` §1) |
| `bench/` | benchmark set, timing and memory harness (C001-NFR-001 to C001-NFR-005, C001-NFR-018) |
| `spikes/` | spike-grade code of C001-M-01, never shipped |
| `docs/` | user documentation (C001-DOD-032), compliance reports, release records |
| `study/g8/` | comparison-study materials, pseudonymised records and results (C001-T-109 to C001-T-116, C001-T-102); never shipped |
| `scripts/` | build and study scripts |

- **Commands** (created by C001-T-001 and C001-T-004; used in every task's Verification):
  `npm run build`, `npm run lint` (`lint:ts`, `lint:py`, `lint:cs`), `npm test -- <path>`, `npm run acceptance -- --scenario <TS-ID>`
  (repeatable), `npm run acceptance:browser -- --scenario <TS-ID>`, `npm run bench -- <suite>`,
  `npm run test:fault -- <suite>`, `npm run test:security -- <suite>`, `npm run docs:check`,
  `npm run study -- <step>`, `npm run licence-check`, `npm run audit`, `npm run secret-scan`.
- **CI host:** GitHub Actions (P-01's answer to Q-ci-01, `questions-log.md` Round 4): hosted
  runners for Windows (`windows-2025`, every push), macOS x86-64 and arm64 and Ubuntu x86-64
  (C001-T-001); one Windows 11 x86-64 machine registered as a self-hosted runner for the nightly and
  closing-commit suites (Q-ci-02, Round 5; C001-T-104). Pull requests to `main` need one approving
  review by another person (DOD-G-03, C001-T-001). Runner availability is C001-RISK-017 and
  C001-RISK-020.
- **Release channel:** the public npm registry, dist-tag `next` for release candidates and `latest`
  for releases (Q-release-01, Round 6; `75-rollout.md`).
- **Risks, rollout, observability:** `70-risks.md`, `75-rollout.md`, `78-observability.md`;
  implementer entry point: `handoff.md`.

## 5. Milestones

| ID | Goal | Exit criterion | Tasks |
|---|---|---|---|
| C001-M-01 | Walking skeleton end to end, and the measurements that accepted decisions depend on | `sdd-review review` on fixture `fx-intake` opens a browser page listing the changed files (C001-TS-101, C001-TS-901 pass on the three CI operating systems); `analyse --headless` writes the intake document; the results of the ADR-001 spike (`spikes/parse/RESULTS.md`), the ADR-002 prototype (`spikes/ui/RESULTS.md`), W1 to W6 (`bench/results/workspace-<date>.md`) and K1 to K6 (`bench/results/kill-tests-<date>.md`) are recorded with pass or miss, the outcome of DP-1 is recorded in `bench/results/dp-1.md`, and no approved artifact was edited | C001-T-001, C001-T-002, C001-T-003, C001-T-004, C001-T-005, C001-T-006, C001-T-007, C001-T-008, C001-T-009, C001-T-010, C001-T-011, C001-T-012, C001-T-013, C001-T-014, C001-T-015, C001-T-016, C001-T-017, C001-T-018, C001-T-019, C001-T-020, C001-T-021, C001-T-022, C001-T-023, C001-T-024, C001-T-104 |
| C001-M-02 | Complete change intake, intent sources and review configuration | every scenario of `CAP-01-change-intake/acceptance.md` passes, and the scenarios of C001-REQ-302 to C001-REQ-304, C001-REQ-326 and C001-REQ-426 pass, on the three CI operating systems | C001-T-025, C001-T-026, C001-T-027, C001-T-028, C001-T-029, C001-T-030, C001-T-031, C001-T-032, C001-T-033, C001-T-034, C001-T-035 |
| C001-M-03 | Model-free static analysis: architecture delta, deterministic intent map, risk triage and mechanical clearing, with their views | every scenario of CAP-02, CAP-03 and CAP-04 that requires neither a model provider nor a test run passes; 5 model-free analyses of each benchmark change give equal results (C001-NFR-015 check run once) | C001-T-036, C001-T-037, C001-T-038, C001-T-039, C001-T-040, C001-T-041, C001-T-042, C001-T-043, C001-T-044, C001-T-045, C001-T-046, C001-T-047, C001-T-048, C001-T-049, C001-T-050, C001-T-051, C001-T-052, C001-T-053, C001-T-054, C001-T-055, C001-T-056 |
| C001-M-04 | Executable evidence: test runs with per-test coverage, passing-test clearing, mutation testing, evidence bundles, in evidence workspaces only | every scenario of `CAP-05-review-evidence/acceptance.md` and the test-evidence scenarios of CAP-04 (C001-REQ-410, C001-REQ-411) pass in each deep ecosystem on the three CI operating systems | C001-T-057, C001-T-058, C001-T-059, C001-T-060, C001-T-061, C001-T-062, C001-T-063, C001-T-064, C001-T-065, C001-T-066, C001-T-067, C001-T-068, C001-T-069 |
| C001-M-05 | Review coverage, sampling, verdicts and a durable review record across surfaces and sessions | every scenario of CAP-06 and CAP-07 and of C001-REQ-904, C001-REQ-915 to C001-REQ-922 passes; the full model-free review flow from intake to verdict completes on a repository with and one without an SDD workspace | C001-T-070, C001-T-071, C001-T-072, C001-T-073, C001-T-074, C001-T-075, C001-T-076, C001-T-077, C001-T-078, C001-T-079, C001-T-080, C001-T-081, C001-T-082, C001-T-083, C001-T-084 |
| C001-M-06 | Model provider through one gateway, with model-free fallback | every scenario of `CAP-08-model-provider/acceptance.md` and the model scenarios of CAP-02 and CAP-03 pass against `stub-llm` and the recording cloud stub | C001-T-085, C001-T-086, C001-T-087, C001-T-088, C001-T-089, C001-T-090, C001-T-091 |
| C001-M-07 | Release evidence for every NFR and DoD item, on a published release candidate with calibrated risk weights | C001-DOD-001 to C001-DOD-032 each have their evidence recorded with a passing result, or the failed item is reported to P-01 as a defect; every record names the release candidate published by C001-T-105; `1.0.0` is published under `latest` | C001-T-092, C001-T-093, C001-T-094, C001-T-095, C001-T-096, C001-T-097, C001-T-098, C001-T-099, C001-T-100, C001-T-101, C001-T-102, C001-T-103, C001-T-105, C001-T-106, C001-T-107, C001-T-108, C001-T-109, C001-T-110, C001-T-111, C001-T-112, C001-T-113, C001-T-114, C001-T-115, C001-T-116 |

### Study calendar (C001-NFR-006, C001-NFR-007)

The estimates of the study tasks are person-days; the study's calendar time is longer. The single
source of the study calendar (steps, owners, start and end relative to the first session day S,
session rules) is `60-test-plan.md` §6 item 11. For the critical path it fixes two things: the
study steps from S to `study/g8/RESULTS.md` (C001-T-113 to C001-T-116 and C001-T-102) delay
C001-T-103, and the steps before S (C001-T-109 to C001-T-112) start no later than S − 6 weeks and
run in parallel with the other work; `40-work-breakdown.md` §2 applies both. The release candidate
is not changed during the sessions (`75-rollout.md` Communication).

## 6. Sequencing rationale

- C001-M-01 front-loads the components on the critical path of every later milestone (git access,
  store, intake, orchestrator) and the components whose measurements decide whether C001-ADR-006
  and C001-NFR-018 stand (workspace, copier, observer, command runner).
- C001-T-002 runs right after C001-T-001 and before every task that adds a dependency (§2); this
  puts it on the critical path.
- C001-M-02 and the model-provider foundation (C001-T-085 to C001-T-089) need neither the parsers
  nor the evidence runner and can run in parallel with the measurements of C001-M-01 and with
  C001-M-03.
- C001-M-03 starts with the parser port after DP-1, since language analysis feeds the architecture
  delta, intent linking, guarded areas, risk and the move and rename proofs; C001-T-044 needs no
  parser and may start before DP-1 (§3).
- C001-M-04 depends on DP-1 and on the triage engine of C001-M-03 (passing-test clearing extends
  the clearing rules).
- C001-M-05 needs the hunk states of C001-M-03 and the evidence of C001-M-04 (staleness on evidence
  change, restore of running jobs).
- C001-M-07 orders its work around one release candidate: the calibration corpus (C001-T-106 to
  C001-T-108) is built early; the calibration run C001-T-099 commits the release weights; C001-T-105
  publishes the release candidate; C001-T-092 to C001-T-098 and C001-T-100 measure it; the study
  sessions run on it after C001-T-093 and C001-T-100 passed, so it is not expected to change during
  the sessions; C001-T-103 closes with `1.0.0`. The comparison study runs last because it needs the
  complete tool and documentation.

## 7. Open points carried into the plan

- DP-1 may return C001-NFR-018, a mechanism of C001-ADR-006, the UI stack or the language (Rust)
  to P-01 (§3); a second W2 miss after narrowing also goes to P-01.
- P-01 provides the people the plan needs: moderator, study seeder, two raters and 8 participants
  for the study, a calibration seeder who does not calibrate (C001-RISK-021), a reviewer other than
  the author for every pull request (DOD-G-03), and the npm account of C001-T-105.
- P-01 provides the resources the plan needs: the cloud account held by the owner of C001-T-092
  that can allocate EC2 mac1 and mac2 dedicated hosts, and the budget for the minimum billing of
  24 h per Mac dedicated host and run, once per release candidate (Q-secondhost-01, Round 7;
  C001-RISK-022), both in place before C001-T-105 publishes the first release candidate.
- C001-AS-07 (≤ 30 % open share reachable under the guarded areas) and C001-AS-08 (workspace cost)
  are tested by C001-T-098 and C001-T-021; a miss follows the "If wrong" path of the assumption.
- The reference cloud provider and model of C001-NFR-002 are named by the test designer in
  `60-test-plan.md`.
- A filter-driver configuration changed between intake and a reopen of the snapshot
  (C001-RISK-008) is accepted by P-01 as a documented limit (Q-filterreopen-01, Round 6);
  C001-T-067 records the behaviour and C001-T-101 states the limit.
