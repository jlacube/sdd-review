---
artifact: critic-report
change: CHG-001
phase: 20-plan
reviewed_ids: all
---
# Critic report — CHG-001 20-plan

Scope: `10-strategy.md`, `40-work-breakdown.md`, `50-tasks/` T-001…T-103, `60-test-plan.md`, `70-risks.md`,
`75-rollout.md`, `78-observability.md`, `handoff.md`, `20-decisions/` (OA-003…011, ADR-001…009),
`questions-log.md` rounds 1–6, against `10-spec/` (G2 2026-11-19) and the constitution.
`sdd lint 001 --phase 20-plan --json`: 0 errors, 0 warnings. Critical path recomputed from the graph:
29 tasks, 46.5 days, matches `40-work-breakdown.md` §2; the hand-off order is a valid topological order.

## Summary
| blocker | major | minor |
|---|---|---|
| 0 | 8 | 8 |

After focused re-review 1 (last section): 0 blocker, 0 major, 5 minor open; CR-1 to CR-13, CR-15 and
CR-16 resolved.

## Findings

### CR-1 — Licence check (C001-CON-07) is not a predecessor of the tasks that add the first dependencies
- **Severity:** major
- **Refs:** C001-T-002, C001-T-003, C001-T-004, C001-T-017, C001-CON-07
- **Evidence:** "before any task adds the dependency" — `10-strategy.md:53`; "Add no dependency before C001-T-002 has confirmed its licence and version" — `handoff.md:37`; "(C001-T-002 runs in parallel with equal length; C001-T-005 waits for both)" — `40-work-breakdown.md:362`; "the type generator (C001-ADR-002)" and "the plan's test tools (Vitest, fast-check, Cucumber.js, Playwright)" — `50-tasks/T-002-licence-and-version-check.md:39`, `:48`; T-003 adds `scripts/generate-types.mjs` with "depends_on: [C001-T-001]" — `T-003-types-errors-logging.md:9`, `:29`; "depends_on: [C001-T-001, C001-T-003]" with "Cucumber.js runner" — `T-004-acceptance-harness.md:9`, `:30`; "depends_on: [C001-T-003]" while its precondition says "C001-T-002 confirmed the licence of the watcher binding" — `T-017-observer-linux.md:9`, `:35-36`. T-007 and T-013 also have no T-002 upstream.
- **Why it matters:** The graph lets T-003, T-004, T-007, T-013 and T-017 add dependencies before their licence is confirmed, against the M-01 precondition and the constitution's forbidden list; a copyleft find would then mean rework on the critical path.
- **Suggested fix:** Owner: planner. Add C001-T-002 to `depends_on` of every task that adds a dependency (T-003, T-004, T-007, T-013, T-017 at least), or split T-002 so its first part (toolchain and test tools) precedes them; state that T-001's own dev tools are confirmed by T-002 retroactively. Update §2 of the WBS (the critical path grows by about 1 day).
- **Status:** resolved (focused re-review 1)

### CR-2 — Implementation tasks edit ADRs of the approved plan, which makes the plan stale
- **Severity:** major
- **Refs:** C001-T-021, C001-T-022, C001-T-002, C001-ADR-006, C001-ADR-007, C001-M-01
- **Evidence:** "| modify | `.sdd/001-…/20-decisions/ADR-006-evidence-workspace-mechanics.md › §11 results` |" — `T-021-measure-w1-w5.md:33` (same at `T-022-kill-tests-k1-k6.md:30`); "Mark the "to verify" items of C001-ADR-007 §2 and §3 with their confirmed state." — `T-002-licence-and-version-check.md:56`; "results written into that section" — `60-test-plan.md:119`; M-01 exit "recorded in C001-ADR-006 §11" — `10-strategy.md:136`; "the measurements stay recorded in C001-ADR-006 §11" — `75-rollout.md:91`; "Never consume an artifact whose `status` is not `approved` (or whose approval hash no longer matches its content)." — `.sdd/SDD.md:14-15`.
- **Why it matters:** ADRs are inside the plan's approval hash. The first measurement written after G3 turns the plan `stale`, so implementers may no longer consume it during M-02 to M-07; the M-01 exit criterion forces that edit.
- **Suggested fix:** Owner: planner (architect for the ADR-006 §11 sentence). Record results only in the files the tasks already create (`bench/results/workspace-<date>.md`, `bench/results/kill-tests-<date>.md`, `docs/compliance/licence-and-version-report.md`, `bench/results/dp-1.md`) and let ADR-006 §11 and ADR-007 point to them now; change T-002, T-021, T-022, TC-019, the M-01 exit criterion and C001-RB-003 accordingly. If P-01 wants the results inside the ADR, plan a `/architect:revise plan` step after DP-1.
- **Status:** resolved (focused re-review 1)

### CR-3 — DP-1 cannot decide the parse spike, and the W2 outcome has no end
- **Severity:** major
- **Refs:** C001-T-014, C001-T-024, C001-NFR-001, C001-NFR-004, C001-NFR-018
- **Evidence:** "Leave a budget margin for the remaining static analysis (architecture, intents, triage) and state it" — `T-014-spike-parse-speed-memory.md:43-44`; "The result is stated as pass or miss against C001-NFR-001 and C001-NFR-004 with the margin left" — `:51`; "| The parse spike misses C001-NFR-001 or C001-NFR-004 |" — `10-strategy.md:75`; "| W2 above 3.0 on one ecosystem | Narrow the instrumentation … before C001-T-057 to C001-T-059 start; measured again |" — `10-strategy.md:73`.
- **Why it matters:** The spike measures git reads and parsing only, so "miss" against the whole 120 s / 2 GiB budget is a judgement made after the fact; the outcome that moves the hot path to a native module (or Rust to P-01) has no pass condition. A second W2 miss has no path to P-01, so C001-NFR-018 (a) could be carried forward without anyone deciding.
- **Suggested fix:** Owner: planner. Give T-014 a numeric pass condition set now (for example git reads plus parsing ≤ a stated share of 120 s, and peak memory ≤ a stated share of 2 GiB), and add to the W2 row: "still above 3.0 after narrowing: `sdd defect add --ref C001-NFR-018`, M-04 evidence tasks wait".
- **Status:** resolved (focused re-review 1)

### CR-4 — No task publishes the release candidate that M-07 measures
- **Severity:** major
- **Refs:** C001-M-07, C001-T-103, C001-T-092, C001-T-099, C001-RB-001
- **Evidence:** "published to the public npm registry under the dist-tag `next` … once C001-T-084, C001-T-090 and C001-T-091 are done" — `75-rollout.md:24-26`; "Run by the maintainer who owns C001-M-07, for every release candidate" — `75-rollout.md:50`; "The package name check and the npm account with two-factor authentication … are done (they precede `1.0.0-rc.1`)." — `T-103-release-compliance-check.md:37-38`; "Compute signals with the release candidate" — `T-099-risk-weight-calibration.md:40`; T-092 depends only on "C001-T-084, C001-T-011" — `40-work-breakdown.md:491`.
- **Why it matters:** The name check, the 2FA account, the `rc.<n>` publish and its dist-tag check have no owner, no done-check and no place in the graph; T-092 to T-100 and T-099 can start before T-091, although their subject (the RC) needs it. T-102 participants install from npm.
- **Suggested fix:** Owner: planner. Add a task "Publish release candidate" (depends on T-084, T-090, T-091; publish procedure steps 1–5 of `75-rollout.md`; done when `npm view <package> dist-tags` shows `next: 1.0.0-rc.1`) and make T-092 to T-100 and T-099 depend on it.
- **Status:** resolved (focused re-review 1)

### CR-5 — Several tasks are not sized credibly; the study's calendar time is referenced but not stated
- **Severity:** major
- **Refs:** C001-T-102, C001-T-099, C001-T-103, C001-T-001, C001-RISK-015
- **Evidence:** "S ≤ ½ day, M ≤ 1 day, L ≤ 2 days of one implementer" — `40-work-breakdown.md:10-11`; "The study calendar time of C001-T-102 comes on top (`60-test-plan.md`)." — `:359`; "the calendar time is longer and is set in `60-test-plan.md`" — `T-102-comparison-study.md:24` (estimate L, `:15`); §6 of the test plan states no duration, only "cap 3 hours per change" — `60-test-plan.md:493`; T-099 (L) needs "at least 12 agent changes … of 2,000 to 10,000 changed lines with at least 8 seeded defects each" — `T-099-risk-weight-calibration.md:22`; T-103 (S) includes "Review every code of `errors.md` against its log call" (66 codes) plus tag, full CI with `win11` and publish — `T-103-release-compliance-check.md:42-51`; T-001 (M) includes provisioning the Windows 11 runner with six toolchains — `T-001-scaffold-and-ci.md:54-58`; trigger "2 weeks before C001-T-100 ends" — `70-risks.md:33`.
- **Why it matters:** T-102 and T-103 lie on the critical path; 16 moderated sessions of up to 3 h, 8 tutorials, seeding at least 32 defects and two raters do not fit 2 days, so the 46.5-day path is understated and RISK-015's trigger refers to a calendar the plan does not have.
- **Suggested fix:** Owner: planner; test designer for the calendar. Split T-102 (pool and seeding; recruitment; sessions; rating and analysis) and T-099 (corpus and seeding; calibration run), re-estimate T-103 and T-001, and state the study calendar (sessions per week, start and end relative to T-100) in `60-test-plan.md` §6; recompute §2 of the WBS.
- **Status:** resolved (focused re-review 1; the calendar defects left are CR-17)

### CR-6 — Calibration corpus: TC-026 names the benchmark set, nothing budgets the corpus, and T-099 is not ordered before the measurements
- **Severity:** major
- **Refs:** C001-TC-026, C001-T-099, C001-ADR-009, C001-REQ-610, C001-T-102
- **Evidence:** "| C001-TC-026 | … | benchmark set; calibration of the risk weights of C001-ADR-009 §4 |" — `60-test-plan.md:126`; "agent changes … that are neither benchmark changes (`30-nfr/nfr.md` §0) nor in the sealed G-8 pool" — `ADR-009-diff-algorithm-and-risk-weights.md:130-131`; "the calibration corpus needs at least 12 agent changes and a person to seed defects, which the test plan must budget" — `:156-157`; the fixtures table `60-test-plan.md:57-73` has no calibration corpus; "risk_refs: []" and "| modify | `src/core/triage/risk.ts › release weights` |" — `T-099-risk-weight-calibration.md:14`, `:33`; "depends_on: [C001-T-100, C001-T-101, C001-T-093]" — `T-102-comparison-study.md:9`.
- **Why it matters:** Following TC-026 would tune the weights on the measurement set, which ADR-009 forbids. A weight change at T-099 alters intent order and the attention budget after T-094 and T-102 may have measured the earlier RC.
- **Suggested fix:** Owner: test designer (TC-026 test data, a corpus fixture row, the seeder role in §6); planner (a risk for corpus and seeder availability; T-099 before the RC used by T-093, T-094, T-100 and T-102).
- **Status:** resolved (focused re-review 1; the signal-code check is CR-19)

### CR-7 — No formatter or linter recorded for the languages the plan introduces (constitution, DOD-G-04)
- **Severity:** major
- **Refs:** C001-T-001, C001-T-058, C001-T-059, C001-T-063
- **Evidence:** "**Code style:** the standard formatter and linter of each language used (chosen when the language is introduced, recorded in the change's plan)." — `.sdd/_constitution/constitution.md:93-94`; "Configure TypeScript strict mode and the formatter." — `T-001-scaffold-and-ci.md:48`; "`runtime/node/`, `runtime/python/`, `runtime/dotnet/` | adapters, hooks and the Python mutation engine shipped with the package" — `10-strategy.md:111`; "`runtime/python/sddr_mutate/operators.py`" — `T-063-python-mutation-engine.md:29`; "`runtime/dotnet/StartupHook/ › load monitor` | `DOTNET_STARTUP_HOOKS` assembly" — `T-059-dotnet-coverage-adapter.md:30`.
- **Why it matters:** The TypeScript formatter is unnamed, and the shipped Python and C# code has no linter or formatter, so DOD-G-04 cannot be evidenced for them. How the .NET startup-hook assembly is built and packed is not stated either.
- **Suggested fix:** Owner: planner. Name the formatter and linter per language in `10-strategy.md` §4 (TypeScript, Python, C#); add them to T-001's `npm run lint` and CI; state in T-059 how the startup hook is compiled and included in the package.
- **Status:** resolved (focused re-review 1)

### CR-8 — Three NFRs are verified in a narrower environment than the NFR states
- **Severity:** major
- **Refs:** C001-NFR-013, C001-TC-013, C001-NFR-003, C001-TC-004, C001-NFR-009, C001-TC-009
- **Evidence:** NFR-013 "**Environment:** CI, reference repositories (§0)." — `10-spec/30-nfr/nfr.md:244` vs "full flow on `fx-sdd` and on `fx-nosdd`" — `60-test-plan.md:113`; NFR-003 "reference machine, each supported browser (C001-NFR-017)" — `nfr.md:95` vs "E-REF, each browser of E-BR (current major)" — `60-test-plan.md:104`; NFR-009 "each supported operating system (C001-NFR-016)" — `nfr.md:202` vs second host "in CI on `ubuntu-24.04`, a container …; at release, on a Windows 11 x86-64 machine … and a macOS machine" — `60-test-plan.md:83`.
- **Why it matters:** C001-DOD-024, C001-DOD-012 and C001-DOD-020 would rest on evidence that does not match the approved method: fixtures instead of reference repositories, one of the two supported majors, one macOS architecture of two.
- **Suggested fix:** Owner: test designer. TC-013: run flow (b) on the SDD and non-SDD benchmark changes of T-013 in E-OFF. TC-004: both majors of E-BR. E-LAN/TC-009: name the second-host run for macOS x86-64 and arm64.
- **Status:** resolved (focused re-review 1)

### CR-9 — The reference cloud model of NFR-002 is named by a rule, not by name
- **Severity:** minor
- **Refs:** C001-NFR-002, C001-TC-003
- **Evidence:** "the reference cloud provider and model are named in `20-plan/60-test-plan.md`" — `nfr.md:84`; "model: the newest generally available Claude Sonnet model on the day C001-T-093 freezes its benchmark configuration." — `60-test-plan.md:440-441`.
- **Why it matters:** The model in the threshold's environment is unknown at G3 and its ID ends up only in `bench/model-analysis/config.json`.
- **Suggested fix:** Owner: test designer. Name the current model ID, with the substitution rule as the fallback if that model is withdrawn before T-093.
- **Status:** resolved (focused re-review 1: accepted as a rule with a pinning procedure; see the gate notes)

### CR-10 — Strategy contradicts itself on sequencing
- **Severity:** minor
- **Refs:** C001-M-06, C001-T-085, C001-T-090, C001-T-044
- **Evidence:** "The model-free flow (C001-CON-05, C001-CON-19) is complete before the model provider work of C001-M-06 starts" — `10-strategy.md:38-39`; "the model-provider foundation (C001-T-085 to C001-T-089) … can run in parallel with the measurements of C001-M-01 and with C001-M-03" — `:149-151`; "C001-M-03 and C001-M-04 start only after DP-1." — `:79` vs "| C001-M-03 | C001-T-044 | … | C001-T-031, C001-T-032, C001-T-027 |" — `40-work-breakdown.md:443`.
- **Why it matters:** An implementer cannot tell whether M-06 may start early. T-090 does not depend on M-05, and T-044 is not gated by DP-1.
- **Suggested fix:** Owner: planner. Rephrase §1 item 5 to match the graph (for example "model output is added only on top of deterministic results") and say that T-044 does not wait for DP-1.
- **Status:** resolved (focused re-review 1)

### CR-11 — Test plan, tasks and observability disagree on locations, commands and environments
- **Severity:** minor
- **Refs:** C001-TC-007, C001-T-102, C001-TC-005, C001-T-023, C001-TC-024, C001-T-005, C001-TC-011, C001-T-092
- **Evidence:** "`docs/study/protocol.md`, `docs/study/record/`" and "`npm run study -- analyse`" — `60-test-plan.md:107`, `:499` vs "`study/g8/`" and "`npm run study -- g8-analyse`" — `T-102-comparison-study.md:29-30`, `:43`, and "`study/g8/RESULTS.md`" — `78-observability.md:30`; "E-REF, Chrome" — `60-test-plan.md:105` vs "Run in Chrome, Edge and Firefox on the reference machine." — `T-023-spike-ui-response.md:38`; "`test/security/git-hostile-repository.test.ts`" — `60-test-plan.md:124` vs "`test/unit/git/hardening.test.ts`" — `T-005-git-process-and-safety.md:35`; NFR-011 read in "CI job "egress"" — `78-observability.md:35` vs TC-011 on "E-REF" — `60-test-plan.md:111`; "container on a bridged network as the second host" — `T-092-security-test-suite.md:29` vs the release E-LAN machines — `60-test-plan.md:83`.
- **Why it matters:** Two sources of truth for where evidence lives and how it is produced; `sdd trace` reads TC locations that the tasks will not create.
- **Suggested fix:** Owner: test designer and planner. Pick one path or command per item and align the other file.
- **Status:** resolved (focused re-review 1)

### CR-12 — User documentation and release notes miss items the rollout and ADR-005 promise
- **Severity:** minor
- **Refs:** C001-T-101, C001-RISK-008, C001-RB-002, C001-RB-006, C001-ADR-005
- **Evidence:** release notes list "accepted limits of C001-RISK-003, C001-RISK-004 and the residual of C001-RISK-005" — `75-rollout.md:104` (no C001-RISK-008); user docs promise "store and workspace locations, … how to downgrade (C001-RB-002) and clean up (C001-RB-006)" — `75-rollout.md:107-109`; T-101 pages "getting-started, cli, configuration, intent-sources, neutral-file, provider-keys, evidence-environment, limits" — `T-101-user-documentation.md:32`; "on macOS, `fsync` does not force the drive's cache … the limit is stated in the user documentation" — `ADR-005-review-state-store.md:82-84`.
- **Why it matters:** C001-RB-006 tells users to clean up "as the user documentation describes", but no T-101 page or done-check covers it; the Q-filterreopen-01 limit and the macOS durability limit would not reach users through the release notes or the limits page.
- **Suggested fix:** Owner: planner. Add C001-RISK-008 to the release notes. Add install, locations, downgrade and clean-up pages and the ADR-005 macOS limit to T-101 targets and done-checks.
- **Status:** resolved (focused re-review 1)

### CR-13 — The Q-hookenv-01 decision lives in a task, not in ADR-004
- **Severity:** minor
- **Refs:** C001-ADR-004, C001-T-005, C001-RISK-005
- **Evidence:** "Plan decision under Q-hookenv-01; no requirement of the specification changes." — `T-005-git-process-and-safety.md:52-53`; Amendment 1 of ADR-004 changes the profile ("It adds `core.untrackedCache=false`" — `ADR-004-git-access.md:183`) but never mentions the repository-locating variables or hooks.
- **Why it matters:** P7: a lasting git-access decision (clearing `GIT_DIR`, `GIT_INDEX_FILE` and the rest on every adapter read, with its residual) is recorded only in a task and a risk.
- **Suggested fix:** Owner: architect. Add the decision and its residual to ADR-004, as an item of Amendment 1 or as Amendment 2 before G3, citing Q-hookenv-01.
- **Status:** resolved (focused re-review 1)

### CR-14 — Spikes and harness tasks claim requirements they do not implement
- **Severity:** minor
- **Refs:** C001-T-002, C001-T-004, C001-T-023, C001-T-024, C001-T-103
- **Evidence:** "implements: [C001-REQ-505, C001-REQ-514, C001-REQ-805]" — `T-002-licence-and-version-check.md:10`; "implements: [C001-REQ-101, C001-REQ-912]" — `T-004-acceptance-harness.md:10`; "implements: [C001-NFR-003, C001-REQ-909]" — `T-023-spike-ui-response.md:10`; "implements: [… C001-REQ-514, C001-REQ-512]" — `T-024-decision-point-dp1.md:10`; "implements: [C001-REQ-809]" — `T-103-release-compliance-check.md:10`.
- **Why it matters:** TR coverage of 100 % then also counts tasks that only measure or scan, so a requirement could lose its production task and the trace would not show it.
- **Suggested fix:** Owner: planner. Keep `implements` and `satisfies_ac` for tasks that deliver the behaviour; list measured NFRs and scenarios only under `verified_by`.
- **Status:** open — partly resolved in focused re-review 1 (the REQ claims of C001-T-101 and the NFR claims of C001-T-013, C001-T-014, C001-T-020 and C001-T-021 remain)

### CR-15 — Constitution unit-test rule and DOD-G-03/G-05 have no traceable producer
- **Severity:** minor
- **Refs:** C001-T-059, C001-TC-151, C001-M-07
- **Evidence:** "unit tests for the logic behind each requirement" — `constitution.md:34`; unit kind "| 8 |" — `60-test-plan.md:23`; T-059 verifies "`npm test -- test/unit/evidence/adapters/dotnet`" — `T-059-dotnet-coverage-adapter.md:45`, but its Targets (`:29-32`) add no unit test; "DOD-G-01 to DOD-G-05 of the constitution has its evidence recorded" — `handoff.md:181-182`, while no plan file names the peer-review record (DOD-G-03) or `sdd archive` for `_living/` (DOD-G-05).
- **Why it matters:** The test plan does not say that per-requirement unit tests come from the tasks' `test/unit/` targets, and two global DoD items have no step that produces their evidence.
- **Suggested fix:** Owner: test designer (a sentence in §1 that names the task targets as the unit tests of each requirement); planner (a unit-test target in T-059; a review-record step in the reporting protocol; `sdd archive` in the Definition of change done).
- **Status:** resolved (focused re-review 1)

### CR-16 — Plan IDs are not in the ledger
- **Severity:** minor
- **Refs:** C001-TC-001, C001-ADR-001, C001-OA-003
- **Evidence:** "no TC was allocated with `sdd id next`" — `60-test-plan.md:32`; `"allocated": { "R": 3, "OA": 2, … "RB": 7 }` with no TC or ADR counter — `ids.json:3`.
- **Why it matters:** This goes against the convention that new IDs are allocated with `sdd id next`. The CLI resumes after the highest ID in use, so nothing collides, but the ledger does not record ADR-001…009, OA-003…011 or the TCs.
- **Suggested fix:** Owner: conductor. Bring the ledger in line before G3, or record that plan IDs are exempt.
- **Status:** resolved (focused re-review 1: accepted, no collision possible, no change needed)

## Rubric
| Rubric | Item | Result |
|---|---|---|
| plan | P1 Every requirement covered by a task | CR-14 (coverage 100 % by trace, partly through non-implementing tasks) |
| plan | P2 Each task has targets, verification and done-checks | CR-3, CR-5, CR-7, CR-15 |
| plan | P3 Dependency graph acyclic, milestones coherent | CR-1, CR-4, CR-10 (acyclic and critical path verified) |
| plan | P4 Every scenario maps to a planned test | CR-6, CR-11 (TS → TC mapping complete) |
| plan | P5 Risks cover the hotspots touched | CR-6 (residuals Q-nonlfs-01, Q-movedon-01, Q-filterreopen-01 covered with owners) |
| plan | P6 Rollout and rollback stated | CR-4, CR-12 |
| plan | P7 ADRs for every remaining technical decision | CR-2, CR-13 |
| NFRs | N1–N3 Category, metric, threshold | n/a: set by the approved spec |
| NFRs | N4 Feasible method and environment | CR-8, CR-9 |
| NFRs | N5 Covered by a DoD item | pass: every row of `60-test-plan.md` §5 names its DoD item |
| DoD | O2 Evidence types fit | pass |
| DoD | O3 Global items referenced | CR-7, CR-15 |
| architecture | D5 Decisions with alternatives recorded | pass: OA-003…011 each with ≥ 2 options; ADR-005, ADR-009 proposed for acceptance at G3 |
| observability | One signal per NFR, no telemetry (C001-CON-11) | pass (18 of 18; path drift in CR-11) |
| stories, requirements, acceptance, D1–D4, O1, X1 | — | n/a: spec-phase rubrics, approved at G2 |

## Gate notes for P-01
- Approving G3 also accepts C001-ADR-005 and C001-ADR-009 (now `proposed`). Their status must read `accepted` before the approval hash is taken, otherwise the flip itself makes the plan stale (see CR-2).
- DP-1 (C001-T-024) can send C001-NFR-018 (b)/(c), an ADR-006 mechanism, the UI stack or the language (Rust) back to you. The plan relaxes no threshold, apart from the gap noted in CR-3.
- You are asked for resources: one Windows 11 x86-64 machine with admin access (Q-ci-02), the reference machine (8 cores, 16 GiB, Ubuntu 24.04), an Anthropic API key and budget for the NFR-002 runs (open-source benchmark content leaves the machine for that measurement only), a moderator, a seeder, two raters and 8 participants for the study, a second seeder for the calibration corpus, and an npm account with 2FA. The package becomes public at `1.0.0-rc.1` (Q-release-01).
- Accepted limits you will see in the user documentation: C001-RISK-003 (Q-nonlfs-01), C001-RISK-004 (Q-movedon-01), the residual of C001-RISK-005 (Q-hookenv-01) and C001-RISK-008 (Q-filterreopen-01).
- 22 open items stay open, among them the Node.js 22/24 LTS assumption that C001-T-002 confirms.

## Focused re-review 1 — 2026-11-20

Scope: the fixes for CR-1 to CR-16 and the IDs linked to them; nothing else. `sdd lint 001 --phase
20-plan --json`: 0 errors, 0 warnings, 0 info. `sdd trace 001`: TR-01 to TR-08 100 %, TR-11 acyclic,
22 open items. Recomputed from the graph of `40-work-breakdown.md` §1: every task after C001-T-001
has C001-T-002 as an ancestor; the critical path is 35 tasks and 60 days of effort, 72 working days
with the 22-day study part, as §2 states; the estimates in the task files are 2 S, 48 M and 66 L
(181 person-days), as the WBS header states. The hand-off order is still a valid topological order.

Reviewed set: C001-T-001 to C001-T-005, C001-T-007, C001-T-013, C001-T-014, C001-T-017, C001-T-020 to
C001-T-024, C001-T-040, C001-T-050, C001-T-059, C001-T-092 to C001-T-116; C001-ADR-004
(Amendment 2), C001-ADR-006 (Amendment 2), C001-ADR-007 (Amendment 1), C001-ADR-009 (§3, §4);
C001-TC-004, C001-TC-005, C001-TC-007, C001-TC-009, C001-TC-011, C001-TC-013, C001-TC-016,
C001-TC-019, C001-TC-020, C001-TC-024, C001-TC-025, C001-TC-026; C001-RISK-005, C001-RISK-009,
C001-RISK-015, C001-RISK-016, C001-RISK-020, C001-RISK-021, C001-RISK-022; C001-RB-001, C001-RB-003,
C001-RB-006; C001-M-01, C001-M-07; C001-NFR-002, C001-NFR-003, C001-NFR-009, C001-NFR-011,
C001-NFR-013; the files `10-strategy.md`, `40-work-breakdown.md`, `60-test-plan.md` §1 to §3, §4.1,
§5 and §6, `70-risks.md`, `75-rollout.md`, `78-observability.md`, `handoff.md`, `questions-log.md`
Round 7 and `ids.json`.

### Summary (open after this re-review)
| blocker | major | minor |
|---|---|---|
| 0 | 0 | 5 |

Open: CR-14 (partly resolved), CR-17 to CR-20 (new). Resolved: CR-1 to CR-13, CR-15, CR-16.

### Status of the findings of the initial review

| Finding | Severity | Status | Evidence of the fix |
|---|---|---|---|
| CR-1 | major | resolved | "every task other than C001-T-001 and C001-T-002 reaches C001-T-002 through `depends_on`" — `10-strategy.md:60-61`; "depends_on: [C001-T-001, C001-T-002]" — `50-tasks/T-003-types-errors-logging.md:9`; C001-T-004, C001-T-007 and C001-T-017 reach it through C001-T-003 and C001-T-106 through C001-T-013 (`40-work-breakdown.md:466`, `:469`, `:479`, `:555`); checked over the whole graph |
| CR-2 | major | resolved | "No task writes a result into this ADR." — `20-decisions/ADR-006-evidence-workspace-mechanics.md:525`; "is recorded in the report named in C001-T-002, not in this ADR" — `20-decisions/ADR-007-coverage-and-mutation-tools.md:217-218`; "no file under `.sdd/` is changed" — `50-tasks/T-021-measure-w1-w5.md:69`; M-01 exit "and no approved artifact was edited" — `10-strategy.md:199`; no task targets a file under `.sdd/` except through `sdd defect add` (C001-T-024) |
| CR-3 | major | resolved | "is ≤ 60 s (50 % of the 120 s of C001-NFR-001)" and "is ≤ 1 GiB (50 % of the 2 GiB of C001-NFR-004)" — `50-tasks/T-014-spike-parse-speed-memory.md:30-31`; "Still above 3.0 after narrowing: `sdd defect add --ref C001-NFR-018`" — `10-strategy.md:106`; the same path in C001-RISK-016 (`70-risks.md:34`) |
| CR-4 | major | resolved | "depends_on: [C001-T-084, C001-T-090, C001-T-091, C001-T-099, C001-T-104]" — `50-tasks/T-105-publish-release-candidate.md:9`; done-check "`npm view <package> dist-tags` shows `next: 1.0.0-rc.<n>`" — `:74`; C001-T-092 to C001-T-098 and C001-T-100 depend on C001-T-105 (`40-work-breakdown.md:564-571`) |
| CR-5 | major | resolved; the calendar defects left are CR-17 | study split into C001-T-109 to C001-T-116 and C001-T-102, calibration into C001-T-106 to C001-T-108 and C001-T-099; "The single source of the study calendar" — `10-strategy.md:209-211`; calendar table `60-test-plan.md:565-574`; "the chain takes about 72 working days" — `40-work-breakdown.md:411`; C001-T-103 "estimate: L" with "about 1 day for the error-path review" and "about 1 day for the scans" — `50-tasks/T-103-release-compliance-check.md:15`, `:27-28`; the Windows 11 runner moved out of C001-T-001 into C001-T-104 |
| CR-6 | major | resolved; the signal-code check is CR-19 | "never the benchmark set and never the G-8 pool (C001-ADR-009 §4 item 1)" — `60-test-plan.md:150`; corpus fixture row "calibration corpus `bench/calibration/corpus.json`" — `:95`; roles — `:583-596`; C001-RISK-021 — `70-risks.md:39`; C001-T-105 depends on C001-T-099 (`40-work-breakdown.md:563`), so every measurement of C001-M-07 uses the release weights |
| CR-7 | major | resolved | "`npm run lint` runs all three" — `10-strategy.md:146`, after the table of formatter and linter per language (`:140-144`); Prettier, Ruff and .NET analyser targets — `50-tasks/T-001-scaffold-and-ci.md:34-36`; "`build:dotnet` runs `dotnet build runtime/dotnet/StartupHook -c Release`" — `50-tasks/T-059-dotnet-coverage-adapter.md:31` |
| CR-8 | major | resolved | TC-013 "(b) full flow, intake to verdict, on the benchmark change with an SDD workspace and on a benchmark change without one" — `60-test-plan.md:137`; TC-004 "six browser versions" — `:128`; E-LAN "macOS 14 or later x86-64 and macOS 14 or later arm64: once per release candidate, on rented cloud Macs" — `:107`; "**Answer:** Rented cloud Macs" — `questions-log.md:175` |
| CR-9 | minor | resolved: accepted as a rule with a pinning procedure | "The dated ID cannot be named at G3: it is fixed by the procedure below, and every run of a release uses it." — `60-test-plan.md:466-467`; "suite `nfr-002` refuses to start while a field is `null` or the model ID is an alias" — `:475`; the rule is deterministic, the pinned ID is recorded in the configuration file and the release report, and the plan is not edited (gate note below) |
| CR-10 | minor | resolved | "so model output is only ever added to deterministic results" — `10-strategy.md:41`; "C001-T-044 of C001-M-03 (intents from requirements, commits and plan items; it uses no parser) do not wait for DP-1" — `:114-115` |
| CR-11 | minor | resolved | TC-007 "`npm run study -- g8-analyse`" — `60-test-plan.md:131`, as in `50-tasks/T-109-study-materials-and-analysis.md:34` and `78-observability.md:30`; TC-005 "latest major each; a spike, not the NFR evidence" — `60-test-plan.md:129`, matching `50-tasks/T-023-spike-ui-response.md:26-27`; TC-024 "`test/integration/git/hostile-repository.test.ts`" — `60-test-plan.md:148`, matching `50-tasks/T-005-git-process-and-safety.md:36`; NFR-011 "egress run on the reference machine (E-REF" — `78-observability.md:35`; second host per E-LAN — `50-tasks/T-092-security-test-suite.md:29` |
| CR-12 | minor | resolved | "C001-RISK-005 and C001-RISK-008 (Q-filterreopen-01), and the macOS durability limit of" — `75-rollout.md:109`; pages "data-locations, downgrade, uninstall-and-clean-up, limits" — `50-tasks/T-101-user-documentation.md:35`; done-checks — `:73-77` |
| CR-13 | minor | resolved | "## Amendment 2 — 2026-11-19: environment of the adapter's git processes (Q-hookenv-01)" — `20-decisions/ADR-004-git-access.md:268`; residual "a review started inside a git hook reads the repository's own index, not the hook's temporary index" — `:297-298` |
| CR-14 | minor | open, partly resolved | "implements: []" in C001-T-002, C001-T-004, C001-T-023, C001-T-024 and C001-T-103 (each at `:10`), with the rule at `10-strategy.md:73-80`; what remains is stated below |
| CR-15 | minor | resolved | "The unit tests of a requirement are the `test/unit/<area>/` targets of the tasks whose `implements` lists that requirement" — `60-test-plan.md:52-53`; "unit tests of C001-REQ-506 for this adapter" — `50-tasks/T-059-dotnet-coverage-adapter.md:33`; "The pull request approval on the repository host is the review record of DOD-G-03" — `handoff.md:191-192`; "the conductor runs `sdd archive 001`" — `handoff.md:221` |
| CR-16 | minor | resolved: accepted, no change needed | the CLI allocates with "let seq = Math.max(counter, ...defined, block ? block.from - 1 : 0) + 1;" — `C:/Sandbox/runs/t073/architect-0.1.0-marketplace/plugins/architect/scripts/sdd.mjs:10362`, where `defined` are the IDs defined in the change graph (`:10360`), so an ID in use is never handed out again and tombstoned IDs are skipped (`:10365`); the TC numbering rule is recorded ("no TC was allocated with `sdd id next`" — `60-test-plan.md:32`); the ledger now holds `"M": 7, "T": 116, "RISK": 22, "RB": 7` — `ids.json:3`. The counters of OA (2), ADR and TC still understate the IDs in use; that is harmless because a retired ID goes through a tombstone, and the CLI has no command to register hand-numbered IDs |

**CR-14, what remains.**
- **Evidence:** "implements: [C001-REQ-111, C001-REQ-207, C001-REQ-426, C001-REQ-809]" —
  `50-tasks/T-101-user-documentation.md:10`, a documentation task, while the rule reads "A task lists
  a functional requirement (REQ) in `implements` only when its code or configuration delivers that
  behaviour" — `10-strategy.md:73-74`; C001-T-029, C001-T-039, C001-T-035 and C001-T-086 deliver
  those behaviours. "implements: [C001-NFR-001, C001-NFR-004]" —
  `50-tasks/T-014-spike-parse-speed-memory.md:10`; "implements: [C001-NFR-018]" —
  `50-tasks/T-020-spike-evidence-harness.md:10` and `50-tasks/T-021-measure-w1-w5.md:10`;
  "implements: [C001-NFR-001, C001-NFR-005, C001-NFR-018]" — `50-tasks/T-013-benchmark-set.md:10`;
  while "An NFR is listed by the tasks that build the behaviour or the release measurement that
  evidences it" — `10-strategy.md:75-76`.
- **Why it matters:** The plan breaks the rule it set for this fix; the trace names a documentation
  page as an implementer of four behaviours and spikes as implementers of NFRs. TR-06 still holds
  through the delivering tasks, so the impact is on the reading of the trace only.
- **Suggested fix:** Owner: planner. Empty `implements` of C001-T-101 (keep `satisfies_ac` and
  `verified_by`); drop the NFRs from `implements` of C001-T-013, C001-T-014, C001-T-020 and
  C001-T-021, or widen the rule of `10-strategy.md` §2 to name enablers and the C001-M-01
  measurements.

### New findings

### CR-17 — Study calendar: roles, recruitment start and the tutorial trial do not fit the dependencies
- **Severity:** minor
- **Refs:** C001-T-109, C001-T-112, C001-T-101, C001-T-113, C001-RISK-015
- **Evidence:** "| Roles confirmed: moderator, seeder, two raters (item 1) | P-01 | S − 6 weeks | S − 5 weeks | 1 week | — (before C001-T-109) |" — `60-test-plan.md:567`, while recruitment starts at "S − 6 weeks" (`:568`) in C001-T-112, which has "depends_on: [C001-T-109]" — `50-tasks/T-112-study-recruitment.md:9`, and C001-T-109 needs "P-01 has appointed the moderator, the study seeder and the two raters" — `50-tasks/T-109-study-materials-and-analysis.md:39`; "the calendar time is about 6 weeks, set in `10-strategy.md` §5" — `50-tasks/T-112-study-recruitment.md:24`, against "| 5 weeks | C001-T-112; 1 day |" — `60-test-plan.md:568` and "Recruitment (C001-T-112, 5 weeks)" — `40-work-breakdown.md:412`; "Tutorial script and session forms tried with one non-participant on the release candidate (item 6) | moderator | S − 1 week | S | 2 days" — `60-test-plan.md:571`, but the only related done-check is "the moderator has walked through it once on the practice change" — `50-tasks/T-101-user-documentation.md:78-79`, and "C001-T-100 and C001-T-101 end 1 day earlier" than C001-T-093 — `40-work-breakdown.md:443`.
- **Why it matters:** Followed as written, recruitment cannot start at S − 6 weeks: C001-T-109 waits for the roles until S − 5 weeks, so recruitment gets about 4 weeks or S moves, and the task contradicts the calendar that the plan calls its single source. On the critical path the release candidate is published 2 days before S and the tutorial script is done 1 day before S, so the 2-day trial on the release candidate does not fit before S, and no task owns it.
- **Suggested fix:** Owner: test designer (calendar), planner (tasks). Confirm the roles before C001-T-109 starts, for example from S − 7 weeks; replace "about 6 weeks, set in `10-strategy.md` §5" in C001-T-112 by the 5 weeks of `60-test-plan.md` §6 item 11; give the trial an owner and a done-check (for example a precondition of C001-T-113 after C001-T-105 and C001-T-101) and a window after the publication, or let S move by it.
- **Status:** open

### CR-18 — The study can start on a release candidate that the remaining release suites may force to change
- **Severity:** minor
- **Refs:** C001-T-113, C001-T-092, C001-T-105, C001-T-103, C001-RISK-015, C001-NFR-006
- **Evidence:** "| C001-M-07 | C001-T-113 | Comparison study: sessions of participant rows 1 and 2 | L | C001-T-093, C001-T-100, C001-T-101, C001-T-105, C001-T-111, C001-T-112 |" — `40-work-breakdown.md:573`; "C001-T-092, C001-T-094 to C001-T-098 wait for C001-T-105 and have about 10 days of slack before C001-T-103." — `:452-453`; "A fix during C001-M-07 gives the next `rc.<n>`, published under `next` in the same way by reopening C001-T-105; measurements whose subject changed are taken again." — `75-rollout.md:30-32`; "a release candidate is not changed during a participant's sessions" — `75-rollout.md:118`; "The sessions C001-T-113 to C001-T-116 run on one release candidate" — `70-risks.md:33`; "Every session of this block ran on the same release candidate." — `50-tasks/T-113-study-sessions-rows-1-2.md:52`; "a fix gives a new release candidate (C001-T-105 reopened) before this task continues" — `50-tasks/T-103-release-compliance-check.md:50-51`.
- **Why it matters:** A security, UI response, egress, fault-injection, reproducibility or open-share failure found during the session window, or a compliance finding after it, produces a new release candidate. The plan does not say whether the remaining sessions move to it, whether the study counts as a measurement "whose subject changed" and is repeated (4 weeks and 2 days after S), or whether the fix waits. The rules quoted bind per participant, per block or to "one release candidate", so the study could mix candidates or delay `1.0.0` without a decision by P-01.
- **Suggested fix:** Owner: planner. Add C001-T-092 and C001-T-094 to C001-T-098 to `depends_on` of C001-T-113 (on the critical path they end by S, so the 72 days do not move); state in `75-rollout.md` what a fix between S and C001-T-102, and after it, does to the study (for example: sessions stay on the candidate they started on, and the study is repeated only when P-01 decides so after a fix to a flow the sessions used); align C001-RISK-015 and C001-T-113 with that rule.
- **Status:** open

### CR-19 — The signal-code check of C001-T-105 misses code that computes risk signals
- **Severity:** minor
- **Refs:** C001-T-105, C001-T-099, C001-ADR-009, C001-TC-026, C001-REQ-401
- **Evidence:** "`git diff --stat <signal-commit> HEAD -- src/core/intake src/core/language src/core/triage src/core/evidence`" and "lists no file other than `src/core/triage/risk.ts`; otherwise C001-T-099 step 3 runs again first." — `50-tasks/T-105-publish-release-candidate.md:51-52`; signal D "1 when the hunk adds, removes or changes a dependency on an external package or between components" — `20-decisions/ADR-009-diff-algorithm-and-risk-weights.md:109`, computed in "`src/core/architecture/dependencies.ts › component dependency delta`" — `50-tasks/T-040-dependencies-packages-drift.md:29`; configured guarded areas (signal G) from "patterns from the effective configuration" — `50-tasks/T-050-public-api-and-configured-areas.md:29`, which the loader in "`src/core/config/`" provides — `10-strategy.md:158`; "**Signals:** computed by the release candidate's static analysis in model-free mode" — `20-decisions/ADR-009-diff-algorithm-and-risk-weights.md:140`.
- **Why it matters:** A change after the calibration commit in `src/core/architecture/`, `src/core/config/` or `src/core/git/`, or a new pin of a grammar or coverage tool, passes the check, so the release weights can rest on signals that the release candidate no longer computes. That departs from ADR-009 §4 item 2, which G3 accepts.
- **Suggested fix:** Owner: planner. In C001-T-105 step 2, either recompute the corpus signals with the tagged release candidate and compare them with the values C001-T-099 recorded (any difference: C001-T-099 steps 3 to 5 again), or widen the check to `src/` and `runtime/` except `src/core/triage/risk.ts`, plus `package-lock.json`; align the sentence of C001-TC-026 (`60-test-plan.md:150`).
- **Status:** open

### CR-20 — Strategy and hand-off name only the first amendments of the ADRs
- **Severity:** minor
- **Refs:** C001-ADR-004, C001-ADR-006, C001-ADR-007, C001-T-005, C001-T-021
- **Evidence:** "C001-ADR-001, C001-ADR-003, C001-ADR-004, C001-ADR-006 and C001-ADR-008 carry an Amendment 1 (2026-11-19)" — `10-strategy.md:53-54`; "each with its Amendment 1 where present" — `handoff.md:24-25`; "an ADR's Amendment 1 wins over its original text" — `handoff.md:41`; the revision added "## Amendment 2 — 2026-11-19: environment of the adapter's git processes (Q-hookenv-01)" — `20-decisions/ADR-004-git-access.md:268`, "## Amendment 2 — 2026-11-19: measurement results recorded outside this ADR" — `20-decisions/ADR-006-evidence-workspace-mechanics.md:509`, and "## Amendment 1 — 2026-11-19: confirmed facts and measurement results recorded outside this ADR" — `20-decisions/ADR-007-coverage-and-mutation-tools.md:205`.
- **Why it matters:** The implementer's reading order and precedence rule skip the three amendments that carry the fixes of CR-2 and CR-13: where results are recorded (ADR-006, ADR-007) and the environment of every git read (ADR-004). ADR-006 Amendment 2 and ADR-007 Amendment 1 state their own precedence, so the risk is low, but the hand-off is the implementer's entry point.
- **Suggested fix:** Owner: planner. In `10-strategy.md` §2 and `handoff.md` (reading order item 6 and Rules) name every amendment (Amendment 1 of ADR-001, ADR-003, ADR-007 and ADR-008; Amendments 1 and 2 of ADR-004 and ADR-006) and state that a later amendment wins over earlier text.
- **Status:** open

### Rubric (focused re-review 1, reviewed set only)
| Rubric | Item | Result |
|---|---|---|
| plan | P1 Every requirement covered by a task | CR-14 (TR-06 215 of 215 through delivering tasks; residual claims of C001-T-101 and the M-01 spikes) |
| plan | P2 Each task has targets, verification and done-checks | pass: C001-T-104 to C001-T-116 each have targets, verification and done-checks; C001-T-014 has a numeric pass condition |
| plan | P3 Dependency graph acyclic, milestones coherent | CR-17, CR-18 (TR-11 acyclic; critical path of 35 tasks and 60 days recomputed; C001-T-002 upstream of every task after C001-T-001) |
| plan | P4 Every scenario maps to a planned test | pass: TR-08 644 of 644; the TC locations of §4.1 match the tasks that automate them |
| plan | P5 Risks cover the hotspots touched | pass: C001-RISK-020 to C001-RISK-022 cover the Windows 11 runner, the corpus and the rented Macs; the second W2 miss is in C001-RISK-016 |
| plan | P6 Rollout and rollback stated | CR-18 (C001-T-105 and the publish procedure close the gap of CR-4) |
| plan | P7 ADRs for every remaining technical decision | CR-19, CR-20 (ADR-004 Amendment 2, ADR-006 Amendment 2 and ADR-007 Amendment 1 record the decisions of CR-2 and CR-13) |
| NFRs | N4 Feasible method and environment | pass: C001-NFR-003, C001-NFR-009 and C001-NFR-013 run in the environments the NFRs state; C001-NFR-002 by rule with pinning (CR-9) |
| NFRs | N5 Covered by a DoD item | pass: every row of `60-test-plan.md` §5 names its DoD item |
| DoD | O2 Evidence types fit | pass |
| DoD | O3 Global items referenced | pass: DOD-G-01 to DOD-G-05 each have their evidence in `handoff.md` (Definition of change done) |
| architecture | D5 Decisions with alternatives recorded | pass: Q-secondhost-01 with 5 candidates, 3 options and 2 rejections; the new amendments state that their option analyses are unchanged |
| observability | One signal per NFR, no telemetry (C001-CON-11) | pass: 18 of 18; study, egress and second-host paths match the test plan |

### Gate notes for G3 (focused re-review 1)
- No blocker and no major finding is open. The five open findings (CR-14, CR-17 to CR-20) are minor
  corrections of dependencies and text inside the plan; none needs a decision by P-01, so P-01 can
  approve G3 with them open or have the planner fix them first.
- Approving G3 accepts C001-ADR-005 and C001-ADR-009, which stay `proposed` in their files (the
  conductor's ruling for this gate); this replaces the first gate note of the initial review.
  ADR-009 §4 item 1 now defines the noticed defects of the calibration corpus; CR-19 concerns item 2.
- New since the initial review: P-01 provides a cloud account able to allocate an EC2 mac1 and an
  EC2 mac2 dedicated host, and a budget for at least 24 h per host for each release candidate
  (about USD 45 per run, the planner's estimate, not verified online), both before C001-T-105
  publishes `1.0.0-rc.1` (Q-secondhost-01, C001-RISK-022). The other resources are unchanged: the
  Windows 11 machine of C001-T-104, the reference machine, an Anthropic API key and budget, a
  moderator, a study seeder, two raters, 8 participants and 2 reserves, a calibration seeder who is
  neither the calibrator nor the study seeder, an npm account with two-factor authentication, and a
  reviewer other than the author for every pull request.
- The reference cloud model of C001-NFR-002 is fixed by a rule (the newest generally available
  Claude Sonnet model, its dated snapshot ID pinned by the owner of C001-T-093), not by name.
  Approving G3 approves the rule; the ID is recorded in `bench/nfr/nfr-002.config.json` and the
  release report, not in the plan (CR-9).
- Duration: about 72 working days from C001-T-001 to `1.0.0` along the critical path, of which 22
  working days are the study after its first session day; the study roles are needed before
  C001-T-109 starts (CR-17).
- Assumptions that C001-T-002 confirms: Node.js 22 and 24 as the supported LTS lines, and .NET 10 as
  the oldest .NET line in support (the planner's assumption that support for .NET 8 and .NET 9
  ended on 2026-11-10).
- DP-1 can still return C001-NFR-018, a mechanism of C001-ADR-006, the UI stack or the language
  (Rust) to P-01; a second W2 miss after narrowing now also goes to P-01. No task relaxes a
  threshold.
- The accepted limits reach users through the limits page of C001-T-101 and the release notes:
  C001-RISK-003, C001-RISK-004, the residual of C001-RISK-005, C001-RISK-008 and the macOS durability
  limit of C001-ADR-005.
- 22 open items stay open (`sdd trace 001`).
