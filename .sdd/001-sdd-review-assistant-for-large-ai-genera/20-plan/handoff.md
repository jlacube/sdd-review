---
id: "C001-PLAN-HANDOFF"
artifact: plan/handoff
change: "CHG-001"
phase: 20-plan
status: draft
---
# C001 — Implementer hand-off

CHG-001 builds the SDD review assistant: 116 tasks in 7 milestones (`10-strategy.md` §5). Paths
below are relative to the repository root. Change folder:
`.sdd/001-sdd-review-assistant-for-large-ai-genera/` (written `<change>/` below).

## Reading order

1. Constitution: `.sdd/_constitution/constitution.md` (principles, forbidden licences, global DoD
   DOD-G-01 to DOD-G-05) and `.sdd/_constitution/toolchain.md`.
2. Spec index: `<change>/10-spec/00-index.md`, then `10-context/scope.md`.
3. Capability files of the task at hand: `<change>/10-spec/20-capabilities/CAP-<nn>-<slug>/`
   (`requirements.md`, `acceptance.md`; `stories.md` for context).
4. NFRs and interfaces: `<change>/10-spec/30-nfr/nfr.md`, `<change>/10-spec/50-interfaces/`
   (`README.md` lists every contract; `errors.md` is the error catalogue).
5. Architecture: `<change>/10-spec/60-architecture/architecture.md` and `constraints.md`.
6. Decisions: `<change>/20-plan/20-decisions/ADR-001` to `ADR-009`, each with its Amendment 1
   where present (the amendment applies where it differs from the original text).
7. Plan: `<change>/20-plan/10-strategy.md`, `40-work-breakdown.md`, `70-risks.md`,
   `75-rollout.md`, `78-observability.md`, `60-test-plan.md`.
8. The task file, read in full before starting it.

## Rules

- Do not change requirements, acceptance criteria, NFR thresholds, interfaces or ADR decisions.
  If one is wrong, contradictory or missing, report a spec defect with
  `sdd defect add --ref <ID> --summary "…"` and stop that part of the task; never work around it.
- Never edit a file under `.sdd/` except through `sdd` commands (task status, defects). The
  specification, the plan, the ADRs and the test plan are approved artifacts; editing one makes the
  plan stale. Measurements and check results go into the result files the task names
  (`spikes/*/RESULTS.md`, `bench/results/`, `docs/compliance/`, `docs/release/`, `study/g8/`).
  A result that needs a decision changed goes to P-01 through DP-1 or `sdd defect add`; a change of
  tasks goes through the conductor's `/architect:revise plan` (`10-strategy.md` §2).
- The specification wins over an ADR; an ADR's Amendment 1 wins over its original text
  (`10-strategy.md` §2).
- Add no dependency before C001-T-002 has confirmed its licence and version; the task order below
  guarantees it. A copyleft licence is never added (constitution, forbidden list).
- Every git read of the tool runs with the repository-locating variables cleared (C001-T-005,
  C001-RISK-005); every evidence command runs in an evidence workspace, never in the working tree
  (C001-IF-013, C001-CON-22).
- The signals of `78-observability.md` are part of the tasks named in their row.
- The task's risks (`risk_refs`, `70-risks.md`) name triggers; when one fires, the owner task
  reports it as a defect.
- DP-1 (C001-T-024) gates C001-T-036 and C001-T-060 and every task that depends on them; do not
  start those before the conductor has acknowledged the outcome. C001-M-02, C001-T-044, the gateway
  foundation C001-T-085 to C001-T-089 and the calibration and study preparation (C001-T-106 to
  C001-T-112) do not wait for DP-1 (`10-strategy.md` §3).
- No task relaxes a threshold. A missed threshold is reported, with the measured values.
- Every code change reaches `main` through a pull request approved by a person other than its
  author (DOD-G-03); `npm run lint` passes for every touched language (DOD-G-04, `10-strategy.md`
  §4).
- Each task's Done-when list and the per-task definition of done of `10-strategy.md` §2 apply.

## Ordered task list

Every task once, in dependency order (no task before a task it depends on). Tasks of different
branches can run in parallel where `40-work-breakdown.md` allows; the calibration and study
preparation tasks are listed early because they can start early.

1. C001-T-001 — Package scaffold, build, formatters and linters, and hosted CI matrix — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-001-scaffold-and-ci.md`
2. C001-T-002 — Confirm the licence and version facts of the ADRs — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-002-licence-and-version-check.md`
3. C001-T-003 — Generated interface types, error catalogue and contextual log — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-003-types-errors-logging.md`
4. C001-T-004 — Acceptance harness, fixture repository builder and stub provider — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-004-acceptance-harness.md`
5. C001-T-005 — Git access adapter: program check and hardened read-only execution — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-005-git-process-and-safety.md`
6. C001-T-006 — Git access adapter: read operations and working-tree comparison — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-006-git-read-operations.md`
7. C001-T-007 — Review state store: layout, record append and revision switch — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-007-store-foundation.md`
8. C001-T-008 — Intake: named base commit, histogram diff, hunks and snapshot — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-008-intake-diff-and-snapshot.md`
9. C001-T-009 — Core API and orchestrator skeleton — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-009-core-api-orchestrator.md`
10. C001-T-010 — CLI skeleton, headless analysis output and exit codes — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-010-cli-skeleton-headless.md`
11. C001-T-011 — Local review UI server with host, token, origin and CSP checks — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-011-ui-server-skeleton.md`
12. C001-T-012 — Web client shell and the review command — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-012-web-client-shell-and-review-command.md`
13. C001-T-013 — Benchmark set, reference environment and measurement harness — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-013-benchmark-set.md`
14. C001-T-104 — Windows 11 self-hosted runner, nightly and closing-commit triggers — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-104-windows-11-self-hosted-runner.md`
15. C001-T-106 — Calibration corpus: twelve agent changes with test command and environment — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-106-calibration-corpus-changes.md`
16. C001-T-107 — Calibration corpus: seed and label defects in changes 1 to 6 — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-107-calibration-seeding-part-1.md`
17. C001-T-108 — Calibration corpus: seed and label defects in changes 7 to 12 — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-108-calibration-seeding-part-2.md`
18. C001-T-109 — Comparison study: materials, record layout, assignment and analysis commands — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-109-study-materials-and-analysis.md`
19. C001-T-110 — Comparison study: change pool A to D and the practice change — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-110-study-change-pool.md`
20. C001-T-111 — Comparison study: defect seeding and sealed lists — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-111-study-defect-seeding.md`
21. C001-T-112 — Comparison study: recruitment, consent and assignment draw — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-112-study-recruitment.md`
22. C001-T-014 — Spike: parsing speed and memory at the supported size — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-014-spike-parse-speed-memory.md`
23. C001-T-015 — Evidence workspace: location, fill, reset, check and lifetime — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-015-workspace-fill-reset-check.md`
24. C001-T-016 — Copier, ignored paths made available, link retargeting and mutation copy — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-016-workspace-copier-and-mutation-copy.md`
25. C001-T-017 — Working-tree observer: common model and Linux implementation — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-017-observer-linux.md`
26. C001-T-018 — Working-tree observer: macOS and Windows implementations — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-018-observer-macos-windows.md`
27. C001-T-019 — Command runner for evidence commands — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-019-command-runner.md`
28. C001-T-020 — Spike: coverage and mutation harness for the workspace measurements — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-020-spike-evidence-harness.md`
29. C001-T-021 — Workspace measurements W1 to W6 — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-021-measure-w1-w5.md`
30. C001-T-022 — Workspace kill tests K1 to K6 — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-022-kill-tests-k1-k6.md`
31. C001-T-023 — Spike: hunk list and file context response time — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-023-spike-ui-response.md`
32. C001-T-024 — Decision point DP-1: evaluate the milestone 1 measurements — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-024-decision-point-dp1.md`
33. C001-T-025 — Default base commit and refusals of unusable bases — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-025-base-commit-defaults.md`
34. C001-T-026 — Empty change, binary files and the supported-size warning — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-026-change-classification-size.md`
35. C001-T-027 — Commits of the change and hunk attribution — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-027-commits-and-attribution.md`
36. C001-T-028 — Files under a clean filter at intake — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-028-clean-filter-intake.md`
37. C001-T-029 — Intent source reader: SDD workspace, spec items and documented architecture — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-029-sdd-workspace-reader.md`
38. C001-T-030 — Neutral intent-and-architecture file and named files — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-030-neutral-file-and-named-files.md`
39. C001-T-031 — Selecting the SDD change — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-031-sdd-change-selection.md`
40. C001-T-032 — Plan items, transcript passages, recorded runs and mentions — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-032-plans-transcripts-mentions.md`
41. C001-T-033 — Intake summary, snapshot content and the moved-on notice — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-033-intake-summary-and-moved-on.md`
42. C001-T-034 — Reopen an existing snapshot and keep earlier snapshots — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-034-reopen-and-snapshot-history.md`
43. C001-T-035 — Configuration loader: base-commit configuration, floor and effective policy — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-035-config-loader.md`
44. C001-T-036 — Parser port, tree-sitter grammars, ecosystem assignment and worker pool — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-036-parser-port-tree-sitter.md`
45. C001-T-037 — Language analysis: symbols, definitions, uses and import statements — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-037-symbols-and-imports.md`
46. C001-T-038 — Language analysis: manifests, public API, tree equality and executable lines — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-038-manifests-public-api-ast.md`
47. C001-T-039 — Architecture delta: components, placement and amount of change — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-039-component-placement.md`
48. C001-T-040 — Architecture delta: dependencies, packages and drift — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-040-dependencies-packages-drift.md`
49. C001-T-041 — Design-quality findings: cycles, layer bypasses, duplicated logic — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-041-design-quality-findings.md`
50. C001-T-042 — Publish the architecture-delta document first — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-042-architecture-delta-document.md`
51. C001-T-044 — Intent mapper: intents from requirements, commits and plan items — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-044-intents-from-sources.md`
52. C001-T-045 — Intent mapper: deterministic links, orphan code and unmet intents — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-045-deterministic-linking.md`
53. C001-T-046 — Spec-edit flags and the deterministic account of each intent — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-046-spec-edit-flags-and-accounts.md`
54. C001-T-047 — Hunk moves and developer-named intents as recorded actions — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-047-hunk-moves-and-named-intents.md`
55. C001-T-048 — Intent map view in the review UI — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-048-intent-map-view.md`
56. C001-T-049 — Built-in guarded areas: security, data migration, dependency and build — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-049-guarded-areas-builtin.md`
57. C001-T-050 — Public API area, configured guarded areas and disabled rules — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-050-public-api-and-configured-areas.md`
58. C001-T-051 — Risk score, signal values and intent order — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-051-risk-scoring.md`
59. C001-T-052 — Clearing rules: pure moves and pure renames — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-052-move-and-rename-clearing.md`
60. C001-T-053 — Formatting and generated-file clearing, evidence records and the keep-open guards — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-053-mechanical-clearing-and-guards.md`
61. C001-T-054 — Test hunks and the walkthrough order of an intent — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-054-test-hunks-and-walkthrough-order.md`
62. C001-T-055 — Hunk review states, developer reopen and the triage document — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-055-hunk-reopen-and-triage-document.md`
63. C001-T-043 — Architecture view in the review UI — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-043-architecture-view.md`
64. C001-T-056 — Hunk view: file context, risk signals, cleared hunks collapsed, moves and labels — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-056-triage-hunk-view.md`
65. C001-T-060 — Test run on the snapshot: job, workspace checks, coverage reports and failures — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-060-test-run-orchestration.md`
66. C001-T-057 — Per-test coverage adapter and load monitor for TypeScript/JavaScript — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-057-node-coverage-adapter.md`
67. C001-T-058 — Python import hook, per-test coverage adapter and load monitor — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-058-python-hook-and-coverage-adapter.md`
68. C001-T-059 — Per-test coverage adapter and load monitor for C#/.NET — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-059-dotnet-coverage-adapter.md`
69. C001-T-061 — Test judgements and clearing by passing tests — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-061-passing-tests-clearing-and-judgements.md`
70. C001-T-062 — Mutation testing with StrykerJS and Stryker.NET in the mutation copy — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-062-stryker-integration.md`
71. C001-T-063 — Python mutation engine — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-063-python-mutation-engine.md`
72. C001-T-064 — Mutation job scheduling, copy window and reopen on surviving mutants — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-064-mutation-scheduling-and-reopen.md`
73. C001-T-065 — Evidence bundles: keep, confirm, run and compare — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-065-evidence-bundles.md`
74. C001-T-066 — Property-test counter-examples and evidence strength — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-066-property-examples-and-strength.md`
75. C001-T-067 — Evidence workspaces: clean-filter files, Git LFS files and submodules — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-067-workspace-clean-filter-and-submodules.md`
76. C001-T-068 — Evidence in the review UI: strength, bundles, judgements and comparisons — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-068-evidence-views.md`
77. C001-T-069 — Repository safety across all evidence runs — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-069-repository-safety-integration.md`
78. C001-T-070 — Read marks and the read, cleared and open shares — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-070-read-marks-and-shares.md`
79. C001-T-071 — Random samples of each rule's cleared hunks, stable under population change — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-071-sampling.md`
80. C001-T-072 — Defect reports, rule escalation and reopening — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-072-defect-reports-and-escalation.md`
81. C001-T-073 — Attention budget and the reading queue — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-073-attention-budget.md`
82. C001-T-074 — Coverage statement with covered and uncovered risk and sample results — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-074-coverage-statement.md`
83. C001-T-075 — Shares, samples, defect reports and reading queue in the review UI — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-075-coverage-views.md`
84. C001-T-076 — Sign, reject and defer verdicts with basis and git identity — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-076-verdict-entries-and-identity.md`
85. C001-T-077 — Orphan-hunk rejection and decisions through a later intent — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-077-orphan-decisions.md`
86. C001-T-078 — Current verdict per intent, staleness with causes, and decision status — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-078-verdict-resolution-and-staleness.md`
87. C001-T-079 — Record integrity, reading the record without the UI, repository unchanged on decisions — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-079-record-integrity-and-reader.md`
88. C001-T-080 — Restore of the review state and crash safety — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-080-restore-and-crash-safety.md`
89. C001-T-081 — Concurrent entries from the CLI and the UI, one server per snapshot — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-081-concurrent-surfaces.md`
90. C001-T-082 — CLI verdict commands, intent listing and status — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-082-cli-verdicts-and-listing.md`
91. C001-T-083 — Verdicts, orphan decisions and staleness in the review UI — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-083-verdict-views.md`
92. C001-T-084 — Navigation between components, intents and hunks, and keyboard operation — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-084-navigation-and-keyboard.md`
93. C001-T-085 — Model gateway: model use decision, model-free mode and reduced labels — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-085-gateway-and-model-free-mode.md`
94. C001-T-086 — Provider keys: environment variables and per-OS credential-store readers — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-086-provider-keys-and-credential-readers.md`
95. C001-T-087 — OpenAI-compatible chat and Anthropic Messages adapters — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-087-provider-adapters.md`
96. C001-T-088 — Gateway egress rules: locality, cloud opt-in, excluded paths and announcement — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-088-gateway-egress-rules.md`
97. C001-T-089 — Gateway output validation, model-output marking and failure fallback — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-089-gateway-validation-and-failures.md`
98. C001-T-090 — Model tasks: extracted intents, model links, design critique and accounts — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-090-model-tasks.md`
99. C001-T-091 — Cloud banner and model output in the review UI — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-091-model-output-in-the-ui.md`
100. C001-T-099 — Risk-weight calibration run — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-099-risk-weight-calibration.md`
101. C001-T-105 — Publishing account and release-candidate publication on the public npm registry — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-105-publish-release-candidate.md`
102. C001-T-092 — Security suite: loopback only, cross-origin, DNS rebinding and CSP — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-092-security-test-suite.md`
103. C001-T-093 — Performance benchmarks: static analysis, model analysis, memory and evidence runs — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-093-performance-benchmarks.md`
104. C001-T-094 — Review UI response benchmark over a 500-action session — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-094-ui-response-benchmark.md`
105. C001-T-095 — Network egress tests: model-free, local provider and cloud provider — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-095-network-egress-tests.md`
106. C001-T-096 — Fault-injection test of review-state durability — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-096-fault-injection-test.md`
107. C001-T-097 — Reproducibility comparison and the offline model-free CI run — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-097-reproducibility-and-offline-ci.md`
108. C001-T-098 — Open-share measurement on the benchmark changes — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-098-open-share-measurement.md`
109. C001-T-100 — Operating-system, browser and language coverage runs — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-100-platform-browser-language-matrix.md`
110. C001-T-101 — User documentation — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-101-user-documentation.md`
111. C001-T-113 — Comparison study: sessions of participant rows 1 and 2 — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-113-study-sessions-rows-1-2.md`
112. C001-T-114 — Comparison study: sessions of participant rows 3 and 4 — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-114-study-sessions-rows-3-4.md`
113. C001-T-115 — Comparison study: sessions of participant rows 5 and 6 — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-115-study-sessions-rows-5-6.md`
114. C001-T-116 — Comparison study: sessions of participant rows 7 and 8 — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-116-study-sessions-rows-7-8.md`
115. C001-T-102 — Comparison study: rating and analysis against a standard diff review — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-102-comparison-study.md`
116. C001-T-103 — Release compliance: secrets, vulnerabilities, licences, error logging and the 1.0.0 publication — `.sdd/001-sdd-review-assistant-for-large-ai-genera/20-plan/50-tasks/T-103-release-compliance-check.md`

## Reporting protocol

Run the commands from the repository root (`sdd` is the workspace CLI).

- Start a task: `sdd task set <T-ID> --status in-progress`.
- Finish a task: `sdd task set <T-ID> --status done --commit <sha> --note "PR #<n> approved by <reviewer>; <evidence or measured values>"`.
  The commit is the merge commit of the task's pull request on `main`; the note names the pull
  request and the approving reviewer, who is not the author. The pull request approval on the
  repository host is the review record of DOD-G-03; the CI run of that commit, with
  `npm run lint` for every touched language, is the evidence of DOD-G-01 and DOD-G-04.
- Blocked task: `sdd task set <T-ID> --status blocked --reason "<what blocks it>"`.
- Reopen a finished task: `sdd task set <T-ID> --status in-progress --note "<why>"`.
- Spec defect (wrong, contradictory or missing requirement, criterion, threshold, interface or
  ADR decision; a triggered risk that needs P-01): `sdd defect add --ref <ID> --summary "…"`.
- Frontmatter fallback for an implementer who cannot run the CLI: edit the task file's frontmatter
  directly — set `status` (todo, in-progress, blocked, done) and fill
  `report: { commit: <sha>, completed_at: <YYYY-MM-DD>, notes: "PR #<n> approved by <reviewer>; <evidence, or the blocking reason>" }`;
  write a spec defect as a note in `report.notes` starting with `DEFECT <ID>:`, and the conductor
  records it with `sdd defect add`. This is the only edit of a `.sdd/` file an implementer makes.
- Measurement tasks (C001-T-014, C001-T-021 to C001-T-024, C001-T-093 to C001-T-100, C001-T-102)
  put their measured values in the note and in the result file their task names.

## Definition of change done

- Every task of the ordered list is `done` with its commit recorded (no task `blocked`, none
  `todo`); a dropped task names the task that took over its scope.
- Every item C001-DOD-001 to C001-DOD-032 of `10-spec/70-dod.md` has its evidence recorded with a
  passing result (C001-M-07 exit criterion).
- The global items of the constitution have their evidence:
  - DOD-G-01 (test report): the green CI run of the closing commit `v1.0.0` on every runner kind,
    `win11` included (C001-T-103);
  - DOD-G-02 (trace report): `sdd trace 001 --write` with every requirement linked to a passing
    acceptance scenario;
  - DOD-G-03 (review record): every task's `report.notes` names its approved pull request, and
    branch protection of `main` (C001-T-001) shows that no change was merged without approval;
  - DOD-G-04 (tool output): `npm run lint` for TypeScript, Python and C# green in that CI run;
  - DOD-G-05 (diff): the user documentation of C001-T-101 in the `v1.0.0` diff, and, as the last
    step after the final gate, the conductor runs `sdd archive 001`, which writes the change's
    living specs into `.sdd/_living/`; the diff of `.sdd/_living/` produced by that command is the
    evidence.
- Every NFR signal of `78-observability.md` has its result for the released version.
- No open defect in `change.md`; every DP-1 finding and every triggered risk is closed or accepted
  by P-01.
- `sdd lint 001` and `sdd trace 001` report no error.
