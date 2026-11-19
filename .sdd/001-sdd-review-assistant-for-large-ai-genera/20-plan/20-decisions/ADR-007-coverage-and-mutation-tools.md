---
id: "C001-ADR-007"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: accepted
date: 2026-11-18
deciders: ["P-01"]
---
# C001-ADR-007 — Per-test coverage adapters and mutation tools

## Context and problem

The evidence runner (C001-COMP-011) must record which passing and failing tests executed each added
line of a deep-ecosystem hunk while the developer's test command runs unchanged (C001-REQ-505,
C001-REQ-506, C001-IF-013 §4 item 1), run one mutation tool per deep ecosystem on the executed
changed lines, riskiest hunk first (C001-REQ-514, C001-TS-539, C001-IF-013 §5), record surviving
mutants and unavailable results (C001-REQ-515, C001-REQ-516), read property counter-examples
(C001-REQ-517 open item) and feed the self-containment check (C001-IF-013 §5 item 4), within
C001-NFR-018 (a) ≤ 3.0 and (b) ≤ 60 min, with permissive licences only (C001-CON-07), no download
at run time (C001-CON-11) and on every OS of C001-CON-15. C001-CON-18 leaves the choice to this
ADR. The adapters run inside the project's own processes, so each is written in the ecosystem's
language whatever the implementation language of the analysis core.

## Considered options

Options analysis: `OA-009-coverage-and-mutation-tools.md` (C001-OA-009).

- **Stryker for JS and .NET, own Python engine** (3.75).
- **Stryker for JS and .NET, mutmut 3** (3.55) — only if mutmut 3 runs natively on Windows 11.
- **Stryker for JS and .NET, Cosmic Ray** (3.35).

Rejected there: mutation tools as the per-test coverage source (3.40, against C001-REQ-505 and
C001-REQ-506) and own engines in all three ecosystems (3.30).

Q-mutation-01 presented the first two options and, in place of Cosmic Ray, a third option added by
the conductor: verify mutmut 3's Windows support and the tool licences first, then ask again.

## Decision outcome

**Accepted by P-01 on 2026-11-18.** Question Q-mutation-01 (`20-plan/questions-log.md`, round 2),
answer: "Stryker + own Python engine (Recommended)".

Chosen: **StrykerJS and Stryker.NET for TypeScript/JavaScript and C#/.NET, a mutation engine of
the analysis core for Python, and the runtime adapters below for per-test coverage.** It is the
only set that meets the evidence-run contract on all three operating systems with permissive
licences; it reuses the mature Stryker tools and builds the Python engine on the import hook of
C001-ADR-006. P-01 chose it without first verifying mutmut 3's Windows support (the option "Verify
mutmut first" was not taken), so that fact no longer decides this ADR. If a later research note
confirms that mutmut 3 runs natively on Windows 11, moving Python to mutmut 3 needs a new ADR that
supersedes the Python part of this one.

## Design

### 1. Rules common to all ecosystems

- **Only changed files are measured per test.** Per-test line data is collected for the
  deep-ecosystem files that the change adds or modifies (at most 300), which is all that
  C001-REQ-506 and the coverage signal of C001-REQ-401 need; this keeps per-test overhead low.
- **Load monitors in every test run and mutation run** record each project file loaded from
  outside the current workspace (the working-tree root, another workspace of the snapshot, any other
  path): Node resolve hooks, the Python import hook, a .NET startup hook. They serve ERR-EVID-008
  (C001-IF-013 §4 item 2), ERR-EVID-011 (§5 item 4, records up to the first mutant result) and the
  installed-copy check of the C001-NFR-005 measurement.
- **Injection** only through environment variables and through files in `<evidence
  root>/runtime/<release>/` and `<workspace>.aux/` (C001-ADR-006 §1): values are appended to or
  prepended to the developer's values, never replacing them; no variable names a working-tree path.
- **Tool discovery:** StrykerJS and its runner plugin from the copy's `node_modules/` or the
  developer's global installation; Stryker.NET as a local tool of the snapshot's
  `.config/dotnet-tools.json` restored in the NuGet global packages folder, or as a global tool.
  They are optional dependencies (`10-context/scope.md` §5): absent means ERR-EVID-006 per hunk
  with reason "mutation tool not installed". The adapters and the Python engine ship with the
  review assistant.
- **Risk order** (C001-TS-539): hunks are passed to the tool in descending risk order in two
  tiers, the hunks holding the first 25 % of the candidate mutants first, then the rest (each tier
  repeats the tool's initial run, so more tiers would cost (b)); results are recorded hunk by hunk
  in strict descending risk, ties by path and first line, a hunk being recorded once all its
  mutants and those of every riskier hunk have results. The Python engine runs in exact risk
  order.
- **Results** are converted to `MutationResult` (C001-IF-008): from the mutation-testing report
  schema of the Stryker tools (Killed → killed, Survived → survived, NoCoverage → no-coverage,
  Timeout → timeout, CompileError and RuntimeError → error; Ignored is dropped), mutation text from
  the report's replacement, line from the mutant's start line.
- **Unavailable reasons** (C001-REQ-516, ERR-EVID-006): mutation tool not installed; no runner of
  the tool for the project's test framework; the tool's initial run failed in the mutation
  workspace; the tool ended with an error; the hunk's mutants did not complete; the copy failed
  (C001-ADR-006 §7). Files loaded outside the copy: ERR-EVID-011 instead.
- **Workers and priority:** the worker count and priority of C001-ADR-006 §8 are passed to each
  tool (`concurrency` for both Stryker tools, the engine's own pool).

### 2. Per-test coverage adapters

| Ecosystem | Injection | Mechanism | Test identity and outcome |
|---|---|---|---|
| TypeScript/JavaScript | `NODE_OPTIONS` += `--require <runtime>/node/sddr-preload.cjs`; for `node:test` also `--test-reporter` entries that keep the default reporter | at load time, the changed files are instrumented with istanbul-lib-instrument under a private counter variable, after the framework's transform (wrapping `Module.prototype._compile`, the ESM `load` hook registered with `module.register`, and `vm` script compilation used by Jest and Vitest), lines mapped back through inline or linked source maps; counters snapshotted and reset at each test end | lifecycle events of Jest (jest-circus), Vitest (`@vitest/runner`), Mocha (runner events), `node:test` (reporter stream): test ID, name, outcome, failure message |
| Python | `PYTHONPATH` (hook of C001-ADR-006 §6), `COVERAGE_PROCESS_START` naming a configuration in `<workspace>.aux/`, `PYTEST_PLUGINS` += the adapter plugin | coverage.py started in every Python process by the hook, `include` limited to the changed files (workspace and working-tree paths), context switched to the test's node ID at each test start; when the command runs its own coverage (pytest-cov), the adapter adds its contexts to that running measurement instead of starting a second one | pytest hooks (node ID, outcome, `longrepr`); for `unittest`, a wrapper of `unittest.TestResult` installed by the hook |
| C#/.NET | `CustomAfterMicrosoftCommonTargets` naming `<runtime>/dotnet/sddr.targets` (chained to a value already set), `DOTNET_STARTUP_HOOKS` += the load monitor | AltCover instrumentation after build, limited to the assemblies and source files of the changed files, with call-context tracking on the test attributes of xUnit, NUnit and MSTest; OpenCover report with tracked methods written to `<workspace>.aux/` | VSTest TRX logger set by the imported targets (`VSTestLogger`); tracked methods joined with TRX results by fully qualified name |

- **Not chosen:** V8 precise coverage taken per test (it resets the isolate's counters, which
  disturbs a project's own V8 coverage, and copies all scripts per test); Coverlet (no per-test
  attribution); Microsoft and JetBrains coverage engines (licences not permissive as far as known).
- **Supported frameworks in this release:** Jest, Vitest (`forks` pool; `threads` to verify),
  Mocha, `node:test`; pytest, `unittest`; xUnit v2 and v3, NUnit, MSTest under VSTest. Other
  frameworks give no per-test data: if neither an adapter nor a coverage report yields a test
  result, ERR-EVID-003 applies (C001-IF-013 §4 item 5). Projects on Microsoft.Testing.Platform get
  coverage but their outcomes depend on a TRX extension the adapter cannot inject (to verify).
- **Python coverage.py source:** the environment's coverage.py when it is 5.0 or later (contexts
  API), else a vendored copy shipped with the review assistant, put on the path only when the
  environment has none, so it never shadows the project's own; on CPython 3.12 and later it uses
  the `sys.monitoring` core.

### 3. Mutation tools

**TypeScript/JavaScript — StrykerJS** (Apache-2.0), run in the mutation copy with a configuration
file in `<workspace>.aux/`: test runner plugin matching the framework (`jest-runner`,
`vitest-runner`, `mocha-runner`; `node:test` through `tap-runner`, to verify), `coverageAnalysis:
perTest`, `mutate` entries with the line ranges of the executed changed lines of each tier,
`inPlace: true` (the copy is disposable, so no second sandbox copy), `incremental: false`, JSON
reporter and a reporter plugin from `<runtime>/` that streams each mutant result. The minimum
version is the first that supports line ranges in `mutate` and `inPlace` (to fix after
verification).

**C#/.NET — Stryker.NET** (Apache-2.0), run in the mutation copy on the solution or on each test
project of the snapshot (projects referencing `Microsoft.NET.Test.Sdk`, C001-IF-005 §10),
`mutate` filters with line spans of the executed changed lines, `coverage-analysis perTest`, JSON
reporter to `<workspace>.aux/`. Results arrive per tier, when each invocation ends.

**Python — engine of the analysis core.**
- **Operators** (fixed per release): arithmetic (`+`↔`-`, `*`↔`/`, `//`→`/`, `%`→`*`), augmented
  assignment, comparison (`<`↔`<=`, `>`↔`>=`, `==`↔`!=`, `is`↔`is not`, `in`↔`not in`), boolean
  (`and`↔`or`, removal of `not`), condition negation in `if`, `while` and conditional expressions,
  constants (`True`↔`False`, integer `n`→`n+1`, `0`↔`1`, non-empty string → `""`), `return <expr>`
  → `return None`, removal of a call statement (→ `pass`), removal of unary minus. Only on changed
  lines executed by passing tests.
- **Application:** at import time, in the mutation copy only: a process started with
  `SDDR_MUTANT=<id>` has the hook of C001-ADR-006 §6 parse the one module holding that mutant,
  apply it to the syntax tree and compile it without writing bytecode. No source file is written,
  so parallel workers share the copy.
- **Runner:** one process per mutant running the passing tests that executed the mutated line,
  with the interpreter that ran the test run (recorded by the pytest plugin, mapped to the copy when
  it lies in the test run's workspace): `python -m pytest -x -q -p no:cacheprovider <node IDs>`,
  or `python -m unittest <IDs>`. Killed when a test fails or errors, survived when all pass,
  timeout after twice the recorded duration of those tests plus 10 s, error when the process
  cannot start.
- **First unmutated run:** the union of the covering passing tests runs once in the copy with the
  load monitors before the first mutant; it is the self-containment check (C001-IF-013 §5 item 4)
  and confirms that those tests pass in the copy, without which every mutant would count as killed.

### 4. Property counter-examples (C001-REQ-517)

Read from the failure message of a failing test as the adapters record it, without depending on
the libraries: Hypothesis (`Falsifying example:` block), fast-check (`Counterexample:` line with
seed and path), FsCheck (`Falsifiable, after` block with `Original:` and `Shrunk:`), CsCheck
(`Set seed:` with the example). The exact patterns are fixed by tests against each library's
current output.

### 5. Licence check (C001-CON-07, NFR-D-03)

| Item | Licence | How used |
|---|---|---|
| StrykerJS and runner plugins | Apache-2.0 | developer-installed, run as a program |
| Stryker.NET | Apache-2.0 | developer-installed, run as a program |
| mutation-testing report schema | Apache-2.0 | format read |
| istanbul-lib-instrument (with @babel/core, @babel/parser) | BSD-3-Clause (MIT) | shipped in the Node adapter |
| @jridgewell/trace-mapping | MIT | shipped in the Node adapter |
| coverage.py | Apache-2.0 | used from the environment or shipped (vendored) |
| AltCover (with Mono.Cecil, FSharp.Core) | MIT | shipped in the .NET adapter |
| Python engine, startup hook, preload, pytest plugin | own code | shipped |
| Hypothesis | MPL-2.0 (weak copyleft) | not a dependency: only its output text is read |
| fast-check, FsCheck, CsCheck | MIT, BSD-3-Clause, Apache-2.0 | not dependencies: output read |

The licence and vulnerability checks of NFR-D-02 and NFR-D-03 cover every shipped item and its
transitive dependencies.

## Consequences

- **Good:** per-test evidence for the three deep ecosystems from the developer's own command; one
  report format for both Stryker tools; mutated Python code never touches a file; licences
  permissive throughout; no download.
- **Bad:** the Node adapter intercepts framework internals (Jest, Vitest, Mocha) and must follow
  their releases; AltCover call-context tracking adds IL overhead, a risk for (a) on the .NET
  benchmark; the Python engine starts one process per mutant (1 to 3 s), a risk for (b); a project
  that collects its own coverage with Coverlet or V8 may conflict with the adapters; two tiers
  repeat each Stryker tool's initial run.
- **Risks to measure** (C001-ADR-006 §11, W2 and W3): coverage overhead per ecosystem against (a);
  per-mutant time and mutant counts against (b). If (a) exceeds 3.0 on one benchmark, the first
  response is to narrow instrumentation further (changed lines' functions only), not to relax the
  threshold.
- **Not verified online in this session** (architect's knowledge as of 2026-06, C001-OA-009,
  Sources): mutmut 3 platform support, in particular native Windows 11 support (no longer decides
  this ADR, see Decision outcome); the licences in §5 and of the Microsoft coverage engines;
  StrykerJS and Stryker.NET minimum versions; Vitest `threads` pool and `node:test` support;
  Microsoft.Testing.Platform outcomes. The licence check of C001-CON-07 (NFR-D-02, NFR-D-03) must
  confirm every licence of §5 before the item is shipped or run; the adapter and tool tasks confirm
  the versions and framework support marked "to verify" or "to fix after verification" above.
- **Constraints:** realises the adapter and tool choices of C001-CON-18 within C001-CON-07,
  C001-CON-11, C001-CON-15 and C001-CON-22; no new constraint.
- **Components:** C001-COMP-011 (adapters, engine, conversion, ordering), C001-COMP-010 (risk scores
  that order the hunks, C001-ADR-009), C001-COMP-014 (results saved per revision).
