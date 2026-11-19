---
id: "C001-OA-009"
artifact: plan/option-analysis
change: "CHG-001"
phase: 20-plan
status: draft
---
# OA-009 — Per-test coverage adapters and mutation tools

## Problem

C001-CON-18 leaves the per-test coverage adapters and the mutation tools of the three deep
ecosystems to an ADR. They must record, for each added line of a deep-ecosystem hunk, the passing
and failing tests that executed it, while the developer's test command runs unchanged and the
adapters act only through environment variables and files outside the working tree and outside
the snapshot's paths in the workspace (C001-REQ-505, C001-REQ-506, C001-IF-013 §4 item 1); run
mutation testing with one tool per deep ecosystem on executed changed lines in descending risk
(C001-REQ-514, C001-IF-013 §5 item 2, scenario C001-TS-539); report surviving mutants and
unavailable results (C001-REQ-515, C001-REQ-516); read property counter-examples (C001-REQ-517);
support the self-containment check (C001-IF-013 §5 item 4); fit C001-NFR-018 (a) ≤ 3.0 and
(b) ≤ 60 min; carry OSI-approved permissive licences only (C001-CON-07, constitution forbidden
technologies); download nothing at run time (C001-CON-11); and run on every operating system of
C001-CON-15. Workspace mechanics are C001-ADR-006.

What separates real alternatives: for TypeScript/JavaScript and C#/.NET the only maintained
permissive mutation tools are StrykerJS and Stryker.NET, and each ecosystem has one permissive way
to get per-test line data without changing the command (load-time instrumentation of the changed
files in Node, coverage.py dynamic contexts in Python, AltCover call-context tracking in .NET).
The candidates therefore differ in where per-test coverage comes from and in the Python mutation
tool.

Searched and not viable as separate candidates: Microsoft code coverage (`Microsoft.CodeCoverage`,
`Microsoft.Testing.Extensions.CodeCoverage`) and JetBrains dotCover, whose licences are not
OSI-approved permissive licences as far as known (to verify); Coverlet, which has no per-test
attribution; V8 precise coverage taken per test, whose counter reset disturbs a project's own V8
coverage and costs a full-isolate snapshot per test; mutatest and poodle for Python, which are
unmaintained or immature; framework-native per-test coverage, which none of Jest, Vitest, pytest or
VSTest offers.

## Criteria

| Criterion | Weight (%) |
|---|---|
| Conformance with the evidence-run contract and the supported OSes | 30 |
| Permissive licences and no download at run time | 15 |
| Fit with C001-NFR-018 (a) and (b) | 25 |
| Maturity and maintenance | 15 |
| Low build effort | 15 |

- **Conformance** — command unchanged, adapters only through environment and outside files, one
  mutation tool per ecosystem, per-test data from the developer's own test run, every OS of
  C001-CON-15.
- **Licences and no download** — C001-CON-07, C001-CON-11, NFR-D-03.
- **Fit with (a) and (b)** — coverage overhead within 3.0 times the test command; per-mutant cost
  with test selection and parallel workers within 60 min.
- **Maturity** — active project, operator quality, supported test frameworks.
- **Low build effort** — code the change must write and keep (constitution principle 1).

## Candidates

All but candidate 4 use the same runtime adapters (C001-ADR-007 §2): load-time instrumentation of
the changed files through a Node preload, coverage.py dynamic contexts through `sitecustomize` and
a pytest plugin, AltCover call-context tracking through an MSBuild import named by an environment
variable; each with a load monitor.

- **1 — Stryker for JS and .NET, own Python engine** — StrykerJS, Stryker.NET, and a mutation
  engine of the analysis core that applies one mutant per process at import time through the
  Python hook of C001-ADR-006 and runs the covering tests.
- **2 — Stryker for JS and .NET, mutmut 3** — as 1 with mutmut 3 (trampolines, forked workers,
  per-test selection) for Python.
- **3 — Stryker for JS and .NET, Cosmic Ray** — as 1 with Cosmic Ray (file rewrite per mutant, one
  test command per session) for Python, sessions grouped by covering tests.
- **4 — Mutation tools as the per-test coverage source** — no separate adapters: per-test coverage
  is read from the mutation tools' initial runs (Stryker `perTest` coverage, mutmut statistics).
- **5 — Own mutation engines in all three ecosystems** — runtime adapters as 1, and engines of the
  analysis core for TypeScript/JavaScript (load-time AST mutation) and C#/.NET (Roslyn rewrite and
  build) as well as Python.

## Scores

| Candidate | Conformance with the evidence-run contract and the supported OSes | Permissive licences and no download at run time | Fit with C001-NFR-018 (a) and (b) | Maturity and maintenance | Low build effort | Weighted |
|---|---|---|---|---|---|---|
| Weights | 30 | 15 | 25 | 15 | 15 | 100 |
| 1 — Stryker for JS and .NET, own Python engine | 5 | 5 | 3 | 3 | 2 | 3.75 |
| 2 — Stryker for JS and .NET, mutmut 3 | 2 | 5 | 4 | 4 | 4 | 3.55 |
| 3 — Stryker for JS and .NET, Cosmic Ray | 4 | 5 | 2 | 3 | 3 | 3.35 |
| 4 — Mutation tools as the per-test coverage source | 1 | 5 | 4 | 4 | 5 | 3.40 |
| 5 — Own mutation engines in all three ecosystems | 5 | 5 | 3 | 1 | 1 | 3.30 |

Justifications (sources: section Sources; none opened in this session):

- **1.** Conformance 5: every part runs on all three OSes and acts through environment variables
  and outside files. Licences 5: Apache-2.0 (Stryker), MIT (AltCover), Apache-2.0 (coverage.py),
  BSD-3-Clause (istanbul-lib-instrument), own code. Fit 3: Stryker selects covering tests per
  mutant; the Python engine starts one process per mutant (no fork on Windows), 1 to 3 s each.
  Maturity 3: the Stryker tools are mature; the Python engine is new. Effort 2: the Python engine
  (operators, import-time application, runner) comes on top of the adapters.
- **2.** Conformance 2: mutmut 3 runs mutants in forked processes and, as far as known, documents no
  native Windows support (recommends WSL); that would leave Python on Windows 11 without mutation
  evidence, against C001-CON-15 (to verify). Fit 4: forked workers with per-test selection are the
  fastest Python option. Maturity 4, effort 4.
- **3.** Conformance 4: portable, but one test command per session forces a session per group of
  mutants with the same covering tests. Fit 2: a full process and file rewrite per mutant plus
  session overhead; at 4,000 to 6,000 mutants the 60-minute bound is at risk. Maturity 3, effort 3.
- **4.** Conformance 1: per-test coverage would come from the mutation tool's own run, not from the
  developer's test command (C001-REQ-505, C001-REQ-506, C001-IF-013 §4 item 1), only for lines
  that carry mutants, and only once mutation testing starts; mutmut's Windows gap remains. Fit 4:
  one run fewer. Effort 5.
- **5.** Conformance 5, licences 5. Fit 3: no per-test selection machinery to reuse. Maturity 1:
  three new engines where two mature tools exist. Effort 1.

## Sensitivity

- **1 against 2 (gap 0.20).** The gap rests on one fact: whether mutmut 3 runs natively on
  Windows 11. If it does, candidate 2 scores 5 on conformance and reaches 4.45, leading 1 by 0.70,
  and becomes the recommendation. The fact is to be verified in a research note before the plan
  gate.
- **Weights.** With the fact as assumed, 1 − 2 = 3·w(conformance) − w(fit) − w(maturity) −
  2·w(effort); 2 leads when the effort weight rises at the expense of conformance, for example
  20, 15, 25, 15, 25 (2 at 3.75, 1 at 3.45). Trading a C001-CON-15 gap against build effort is not
  plausible.
- **1 against 3 (gap 0.40).** 1 − 3 = w(conformance) + w(fit) − w(effort). 3 leads only if effort
  outweighs conformance and fit together, or if Cosmic Ray's per-mutant cost matched the engine's,
  which its file rewrite and session model rule out.

## Presented

1. **1 — Stryker for JS and .NET, own Python engine** (3.75) — recommended.
2. **2 — Stryker for JS and .NET, mutmut 3** (3.55) — only if native Windows support of mutmut 3 is
   confirmed; otherwise it violates C001-CON-15 and drops out.
3. **3 — Stryker for JS and .NET, Cosmic Ray** (3.35) — portable external tool, slower.

## Recommendation

**1 — Stryker for JS and .NET, own Python engine**: it is the only candidate that meets the
evidence-run contract on all three operating systems with permissive licences, reuses the mature
Stryker tools where they exist, and builds the Python engine on the import hook that C001-ADR-006
needs anyway. No near tie applies (lead 0.20 over 2); the recommendation flips to 2 if mutmut 3 is
confirmed to run natively on Windows 11.

## Rejected

- **4 — Mutation tools as the per-test coverage source** (3.40) — takes per-test coverage from
  another run than the developer's test command, against the Must requirements C001-REQ-505 and
  C001-REQ-506 and C001-IF-013 §4 item 1.
- **5 — Own mutation engines in all three ecosystems** (3.30) — writes two engines where mature
  permissive tools exist; highest effort and lowest maturity.

## Sources

Not opened in this session (2026-11-18); facts from the architect's knowledge, to be confirmed by a
research note before the plan gate, in particular the starred ones:

- StrykerJS configuration (`mutate` line ranges, `inPlace`, `coverageAnalysis: perTest`,
  `concurrency`, reporter plugins): <https://stryker-mutator.io/docs/stryker-js/configuration/>.
- Stryker.NET configuration (`mutate` filters with line spans, `concurrency`, `coverage-analysis`,
  JSON reporter): <https://stryker-mutator.io/docs/stryker-net/configuration/>.
- mutation-testing report schema (Apache-2.0): <https://github.com/stryker-mutator/mutation-testing-elements>.
- (*) mutmut 3 README, platform support: <https://github.com/boxed/mutmut>.
- Cosmic Ray documentation: <https://cosmic-ray.readthedocs.io/>.
- coverage.py, measurement contexts and subprocess measurement:
  <https://coverage.readthedocs.io/en/latest/contexts.html>,
  <https://coverage.readthedocs.io/en/latest/subprocess.html>.
- pytest, `PYTEST_PLUGINS` environment variable: <https://docs.pytest.org/en/stable/reference/reference.html>.
- AltCover, call-context tracking and MSBuild integration: <https://github.com/SteveGilham/altcover>.
- MSBuild, environment variables as properties; `CustomAfterMicrosoftCommonTargets`:
  <https://learn.microsoft.com/visualstudio/msbuild/how-to-use-environment-variables-in-a-build>.
- .NET startup hooks (`DOTNET_STARTUP_HOOKS`):
  <https://github.com/dotnet/runtime/blob/main/docs/design/features/host-startup-hook.md>.
- (*) Licence terms of `Microsoft.CodeCoverage` and `Microsoft.Testing.Extensions.CodeCoverage`.
- istanbul-lib-instrument (BSD-3-Clause): <https://github.com/istanbuljs/istanbuljs>.
