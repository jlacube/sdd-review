---
id: "C001-OA-003"
artifact: plan/option-analysis
change: "CHG-001"
phase: 20-plan
status: draft
---
# OA-003 — Implementation language and runtime

## Problem
Decide the language and runtime of the CLI (C001-COMP-001), the analysis core (C001-COMP-002 to
C001-COMP-017) and the UI server (C001-COMP-018), and how the result is installed. C001-CON-18
leaves this choice to the plan within four bounds: one installable package holding CLI, core and UI
assets; in-process parsing of the three deep ecosystems (C001-NFR-008); the thresholds of
C001-NFR-001 (static analysis ≤ 120 s), C001-NFR-003, C001-NFR-004 (≤ 2 GiB) and C001-NFR-018; and
the UI shipped as static assets. The package must run on every platform of C001-CON-15
(C001-NFR-016) and use permissive dependencies only (C001-CON-07, constitution forbidden
technologies). The choice also fixes the language binding of the core API (C001-IF-003 §1). It must
be decided first, because every task, the UI server (C001-OA-004), the parser choice
(C001-OA-005) and the git adapter (C001-OA-006) depend on it. Deferring it is not a candidate:
no implementation task can start without it.

Out of scope: the web client framework (C001-OA-004), the parser libraries (C001-OA-005), and the
coverage adapters, mutation tools and credential-store access, which other ADRs of this plan decide
(C001-CON-18, C001-CON-22).

Workload that the runtime must carry (C001-DEC-007, `30-nfr/nfr.md` §0): both sides of up to 300
changed files of a 10,000-line change, the files of the snapshot that the rename proof must search
(C001-REQ-407), and the pattern and graph work of C001-COMP-008 to C001-COMP-012, in parallel
workers (`60-architecture/architecture.md` §6, Performance), on a reference machine with 8 logical
cores and 16 GiB RAM.

## Criteria
| Criterion | Weight (%) |
|---|---|
| Performance and memory headroom | 25 |
| In-process parser fidelity | 20 |
| Platform coverage and simple distribution | 20 |
| Low build and maintenance effort | 25 |
| Clean dependency licences and audits | 10 |

- **Performance and memory headroom:** margin under C001-NFR-001 and C001-NFR-004 on the
  benchmark changes, counting garbage collection, parallelism and the cost of walking syntax trees
  from the host language.
- **In-process parser fidelity:** how exactly syntax trees for TypeScript/JavaScript, Python and
  C# can be produced in the core's own process (C001-CON-18, C001-NFR-008, C001-IF-005 §7).
- **Platform coverage and simple distribution:** every target of C001-CON-15 served from one
  package (C001-CON-18), with few prerequisites on the developer's machine.
- **Low build and maintenance effort:** constitution principle 1; one language from core to web
  client where possible; mature permissive libraries for HTTP, processes, files and locks;
  familiarity of the implementers, coding agents included.
- **Clean dependency licences and audits:** ease of keeping NFR-D-02 and NFR-D-03 at zero over a
  typical dependency tree of the ecosystem.

## Candidates
- **1 — TypeScript on Node.js:** CLI, core and UI server in TypeScript compiled to JavaScript,
  run on Node.js LTS (22 or later); one npm package with the `sdd-review` executable; parsing in
  worker threads of the one process. The obvious default and the simplest option: the web client
  is TypeScript in every candidate, so this is the only one with a single language.
- **2 — Rust:** one native executable per target; tree-sitter and other parsers as native crates;
  web client in TypeScript.
- **3 — Go:** one executable per target; tree-sitter through cgo bindings; web client in
  TypeScript.
- **4 — C# on .NET (LTS):** a self-contained single-file executable per target, or a `dotnet
  tool`; Roslyn for C#, tree-sitter bindings for the other two ecosystems; web client in
  TypeScript.
- **5 — Python (3.12 or later):** installed with pipx or uv; Python's `ast` module for Python and
  tree-sitter bindings for TypeScript and C#; parallelism through worker processes; web client in
  TypeScript.

## Scores
| Candidate | Performance and memory headroom | In-process parser fidelity | Platform coverage and simple distribution | Low build and maintenance effort | Clean dependency licences and audits | Weighted |
|---|---|---|---|---|---|---|
| Weights | 25 | 20 | 20 | 25 | 10 | 100 |
| 1 — TypeScript on Node.js | 4 | 4 | 4 | 5 | 3 | 4.15 |
| 2 — Rust | 5 | 4 | 5 | 2 | 4 | 3.95 |
| 3 — Go | 4 | 3 | 4 | 3 | 4 | 3.55 |
| 4 — C# on .NET | 4 | 3 | 3 | 3 | 4 | 3.35 |
| 5 — Python | 2 | 3 | 3 | 3 | 4 | 2.85 |

Justifications:

- **1 — TypeScript on Node.js.** Performance 4: the parsers of C001-OA-005 run as WebAssembly or
  native code, and the core walks their trees from JavaScript; worker threads use the 8 cores
  inside one process, so C001-NFR-004 measures one resident set; the V8 heap needs per-worker
  limits. The headroom is not measured yet (Sensitivity). Parser 4: tree-sitter grammars for all
  three ecosystems run in process, and the TypeScript compiler API, the reference parser of
  TypeScript, is available as a fallback; no Roslyn. Platforms 4: Node.js runs on every target of
  C001-CON-15, and an npm package installs anywhere Node.js is installed; developers who work only
  in Python or .NET may not have Node.js, which a standalone executable could remove later. Effort
  5: one language for CLI, core, UI server and web client, with types generated once from the JSON
  Schemas of C001-IF-008 and C001-IF-009; the workspace tooling already runs on Node.js
  (`.sdd/_constitution/toolchain.md`, node v22.13.0); TypeScript is the language that implementers
  and coding agents know best. Licences 3: npm trees are deep and receive frequent advisories, so
  the audit and licence check of NFR-D-02 and NFR-D-03 need care.
- **2 — Rust.** Performance 5: native speed, no garbage collector, low memory. Parser 4: native
  tree-sitter grammars and fast TypeScript parsers exist as crates; no Roslyn either. Platforms 5:
  one self-contained executable per target, no runtime prerequisite. Effort 2: two languages (Rust
  core, TypeScript client); slower iteration on a large, rule-heavy core of more than 200
  requirements; fewer implementers fluent in it. Licences 4: Cargo trees are moderate, and
  licence and advisory checks are mature.
- **3 — Go.** Performance 4: compiled, garbage-collected, cheap parallelism; every tree-sitter node
  visit crosses cgo, which costs time. Parser 3: tree-sitter only through cgo; no public,
  maintained TypeScript parser package. Platforms 4: cgo removes Go's easy cross-compilation, so
  each target needs its own build. Effort 3: two languages; a small language with a good standard
  library. Licences 4.
- **4 — C# on .NET.** Performance 4: fast runtime and parallelism; Roslyn trees are large. Parser 3:
  Roslyn gives exact C# trees, but TypeScript and Python go through less mature tree-sitter
  bindings, and TypeScript is the ecosystem of most agent changes in the reference set. Platforms 3:
  a self-contained single file per target is large, a `dotnet tool` needs the .NET SDK, and
  trimming and ahead-of-time compilation do not suit Roslyn. Effort 3: two languages; a strong
  standard library. Licences 4.
- **5 — Python.** Performance 2: tree walking in Python is slow, and worker processes multiply
  memory against the 2 GiB of C001-NFR-004; free threading is not the default build. Parser 3:
  `ast` parses only the syntax of the Python version that runs the tool, so newer project syntax
  fails; tree-sitter bindings serve the other two. Platforms 3: needs a suitable Python, or a
  frozen executable per target. Effort 3: two languages; rich libraries. Licences 4.

Sources (not opened in this session: no web tool was available to the architect on 2026-11-18;
facts are the architect's knowledge as of 2026-06 and are verified by the licence and audit checks
of C001-CON-07 when each dependency is added): Node.js releases
<https://nodejs.org/en/about/previous-releases>; Node.js worker threads
<https://nodejs.org/api/worker_threads.html>; Node.js single executable applications
<https://nodejs.org/api/single-executable-applications.html>; tree-sitter
<https://tree-sitter.github.io/tree-sitter/>; Rust platform support
<https://doc.rust-lang.org/rustc/platform-support.html>; cgo <https://pkg.go.dev/cmd/cgo>; .NET
single-file deployment <https://learn.microsoft.com/dotnet/core/deploying/single-file/overview>;
Python free threading <https://docs.python.org/3/howto/free-threading-python.html>; toolchain
record `.sdd/_constitution/toolchain.md` (probed 2026-11-17).

## Sensitivity
- **Top two: 1 (4.15) and 2 (3.95), gap 0.20.** 1 − 2 = −w(performance) + 3·w(effort) −
  w(platforms) − w(licences). Moving 5 points from effort to performance (weights 30, 20, 20, 20,
  10) ties them at 4.10; any further shift makes Rust lead. A decider who values runtime headroom
  and a prerequisite-free executable above delivery effort would make that shift, so it is
  plausible.
- **Score risk.** Candidate 1's performance score is an estimate. If a measurement shows that
  Node.js keeps too little headroom under C001-NFR-001 or C001-NFR-004 (performance 3), candidate 1
  falls to 3.90 and Rust leads by 0.05. The recommendation therefore comes with an early spike
  task that parses the sides of a benchmark-sized change and measures time and peak memory before
  the bulk of the core is written (C001-ADR-001 Consequences).
- **Distribution.** If Node.js had to be bundled for developers without it, candidate 1's
  platform score stays 4: a standalone executable is possible when the parsers ship as
  WebAssembly (C001-OA-005).
- Candidates 3 to 5 do not reach the top two under any single weight shift of up to 10 points.

## Presented
1. **1 — TypeScript on Node.js** (4.15) — recommended.
2. **2 — Rust** (3.95) — the performance and single-executable alternative.

## Recommendation
**1 — TypeScript on Node.js:** one language from the core to the web client gives the lowest
build and maintenance effort while meeting the thresholds with parsers that run as compiled code.
The lead of 0.20 is above the near-tie band, but it rests on the effort weight and on an unmeasured
performance score, so two tie-breakers support it: reversibility (constitution principle 2), since a
measured hot spot can move into a native module behind the parser port of C001-COMP-007 without
changing the rest, while a Rust core cannot be moved to TypeScript piece by piece; and simplicity
(principle 1), since one toolchain and one type system serve every component.

## Rejected
- **3 — Go** (3.55) — tree-sitter only through cgo, which slows tree walking and removes easy
  cross-compilation, with no gain over Rust in speed or over TypeScript in effort.
- **4 — C# on .NET** (3.35) — exact for C# only; TypeScript and Python parse through weaker
  bindings, and distribution needs a large self-contained file or the .NET SDK.
- **5 — Python** (2.85) — the least performance and memory headroom against C001-NFR-001 and
  C001-NFR-004, and `ast` ties Python parsing to the tool's own interpreter version.
