---
id: "C001-OA-005"
artifact: plan/option-analysis
change: "CHG-001"
phase: 20-plan
status: draft
---
# OA-005 — Syntax parsers and manifest readers

## Problem
Decide which libraries produce the syntax trees of C001-COMP-007 for the three deep ecosystems
(file assignment: C001-IF-005 §8) and which read the package manifests that C001-COMP-008 compares.
C001-CON-18 requires in-process parsing; the scope requires permissive licences (`10-context/scope.md`
§5, C001-CON-07). The trees must support:

- **public-API recognition** with exact declaration heads (C001-IF-005 §7, C001-REQ-417), from
  syntax alone, with no type checking and no build;
- **abstract-syntax-tree equality** with comment text for the formatting rule (C001-REQ-408), and
  identical trees for the pure-move rule (C001-REQ-406);
- **name resolution** for the move and rename proofs: every name in moved code resolves to the
  same symbol, and every use of a renamed symbol in the snapshot is renamed (C001-REQ-406,
  C001-REQ-407); a name that cannot be resolved with certainty prevents clearing, so resolution can
  be conservative;
- **import and reference statements** for added and removed dependencies, cycles and layer
  bypasses (C001-REQ-204, C001-REQ-213, C001-REQ-214);
- **parse failure detection:** a file that does not parse is analysed as `other` with a reduced
  label (C001-IF-005 §8, C001-REQ-212);
- **package manifests** of C001-REQ-205, with an unparsable manifest labelled (C001-REQ-224):
  `package.json` (JSON), `pyproject.toml` and `Pipfile` (TOML), requirements files (line format),
  `*.csproj`, `Directory.Packages.props` and `packages.config` (XML).

The language-agnostic core (move display C001-REQ-910, duplicated logic C001-REQ-215 with
normalised lines) works on lines and needs no parser. Static analysis must fit C001-NFR-001 and
C001-NFR-004 and give the same results for the same release (C001-CON-17, C001-NFR-015). The
decision assumes the runtime of C001-ADR-001 (TypeScript on Node.js); the Rust case is under
Sensitivity.

## Criteria
| Criterion | Weight (%) |
|---|---|
| Syntax fidelity | 25 |
| Name resolution support | 15 |
| One tree model for generic algorithms | 15 |
| Speed and memory | 15 |
| Portability and packaging | 15 |
| Permissive licence and maintenance health | 15 |

- **Syntax fidelity:** exact trees and token spans for current TypeScript, JavaScript, Python and
  C# syntax, so that the heads of C001-IF-005 §7.2 and the equality of C001-REQ-408 are exact.
- **Name resolution support:** what the library offers toward the resolution that C001-REQ-406 and
  C001-REQ-407 need, compared with what must be built.
- **One tree model for generic algorithms:** tree equality, node hashing for moves and executable
  lines written once for every ecosystem.
- **Speed and memory:** parsing both sides of 300 changed files, and the files the rename proof
  searches, within the budgets of C001-NFR-001 and C001-NFR-004.
- **Portability and packaging:** runs on every target of C001-CON-15 from one npm package with no
  build at install time, and allows a later standalone executable (C001-ADR-001).
- **Permissive licence and maintenance health:** OSI-approved permissive licence (NFR-D-03),
  active maintenance, stable API.

## Candidates
- **A — TypeScript compiler API plus tree-sitter:** the `typescript` package's parser (and its
  checker for local name resolution) for TypeScript and JavaScript; tree-sitter through its
  WebAssembly runtime (`web-tree-sitter`) with the Python and C# grammars.
- **B — tree-sitter for all three ecosystems:** the WebAssembly runtime of tree-sitter with the
  TypeScript (TypeScript and TSX dialects), JavaScript, Python and C# grammars, versions pinned per
  release; one tree model and one query language; name resolution built in house on the grammars'
  scope queries.
- **C — Each ecosystem's own compiler front end:** TypeScript compiler API in process; Python's
  `ast` and `symtable` and C#'s Roslyn in helper processes that run on the developer's Python and
  .NET installations.
- **D — oxc parser plus tree-sitter:** the oxc parser (native module) for TypeScript and
  JavaScript; tree-sitter WebAssembly for Python and C#.
- **E — No syntax parser:** line and pattern heuristics for exports, imports and declarations in
  every language. The "do less" option.

Manifest readers are the same for A, B and D: `JSON.parse` for JSON, an in-house line reader for
requirements files, a TOML library and an XML library (see C001-ADR-003). They do not separate the
candidates and are not scored.

## Scores
| Candidate | Syntax fidelity | Name resolution support | One tree model for generic algorithms | Speed and memory | Portability and packaging | Permissive licence and maintenance health | Weighted |
|---|---|---|---|---|---|---|---|
| Weights | 25 | 15 | 15 | 15 | 15 | 15 | 100 |
| A — TypeScript compiler API plus tree-sitter | 5 | 4 | 3 | 3 | 5 | 4 | 4.10 |
| B — tree-sitter for all three ecosystems | 4 | 3 | 5 | 4 | 5 | 5 | 4.30 |
| C — Each ecosystem's own compiler front end | 5 | 5 | 1 | 2 | 2 | 4 | 3.35 |
| D — oxc parser plus tree-sitter | 5 | 3 | 3 | 5 | 4 | 4 | 4.10 |
| E — No syntax parser | 1 | 1 | 2 | 5 | 5 | 5 | 2.95 |

Justifications:

- **A.** Fidelity 5: the TypeScript compiler is the reference parser of TypeScript and JavaScript,
  `.d.ts` files included; the Python and C# grammars of tree-sitter are mature. Resolution 4: the
  checker resolves TypeScript and JavaScript names, across files through relative module
  resolution; Python and C# need an in-house resolver. Tree model 3: two tree models, so equality,
  hashing and executable lines are written twice or behind an adapter. Speed 3: parsing is fast, but
  a checker program over many files is memory-heavy against C001-NFR-004. Portability 5: plain
  JavaScript plus WebAssembly. Licence 4: Apache-2.0 and MIT; the JavaScript API of the compiler
  changes with its native port (TypeScript 7), so a later upgrade means rework.
- **B.** Fidelity 4: the grammars are mature and widely used, but a new language feature can reach
  a grammar weeks or months after the compiler; versions are pinned per release, and a gap shows up
  as a parse failure (reduced label), not as a wrong result. Resolution 3: tree-sitter gives scope
  queries, not resolution; a conservative resolver over lexical scopes and imports is built in house
  for all three ecosystems, and an unresolved name blocks clearing. Tree model 5: one tree type, one
  query language and one set of generic algorithms for every ecosystem, and for more languages
  later. Speed 4: the WebAssembly runtime is slower than the native binding by a constant factor,
  well inside the budget for 600 file sides (spike to measure, C001-ADR-001); trees must be freed
  explicitly. Portability 5: one WebAssembly file per grammar, no native module, embeddable in a
  standalone executable. Licence 5: MIT throughout, actively maintained, widely deployed.
- **C.** Fidelity 5 and resolution 5: each language's own front end. Tree model 1: three
  unrelated models across process boundaries. Speed 2: process start and data transfer, and Roslyn
  compilations count in the core's memory. Portability 2: needs Python and .NET installed on every
  developer machine. Licence 4. Violates C001-CON-18 (in-process parsing).
- **D.** Fidelity 5: oxc passes nearly all of the TypeScript parser tests. Resolution 3: the Node.js
  binding exposes the tree and module records, not the semantic analysis. Tree model 3: two models.
  Speed 5: the fastest TypeScript parser available. Portability 4: a native module per target,
  delivered as optional platform packages; no standalone executable without extra work. Licence 4:
  MIT, but the project is young and its API is still pre-1.0.
- **E.** Fidelity 1 and resolution 1: no trees, so no exact heads, no tree equality and no
  resolution; tree model 2. Speed, portability and licence 5. Violates C001-NFR-008 (a), which needs
  the language-specific signals in every deep ecosystem, and C001-IF-005 §7.

Sources (not opened in this session: no web tool was available on 2026-11-18; facts are the
architect's knowledge as of 2026-06; licences are verified by the licence check of C001-CON-07):
tree-sitter and `web-tree-sitter` <https://github.com/tree-sitter/tree-sitter> (MIT);
grammars <https://github.com/tree-sitter/tree-sitter-typescript>,
<https://github.com/tree-sitter/tree-sitter-javascript>,
<https://github.com/tree-sitter/tree-sitter-python>,
<https://github.com/tree-sitter/tree-sitter-c-sharp> (MIT); TypeScript
<https://github.com/microsoft/TypeScript> (Apache-2.0) and its native port
<https://github.com/microsoft/typescript-go>; oxc <https://github.com/oxc-project/oxc> (MIT);
Roslyn <https://github.com/dotnet/roslyn> (MIT); smol-toml
<https://github.com/squirrelchat/smol-toml> (BSD-3-Clause); fast-xml-parser
<https://github.com/NaturalIntelligence/fast-xml-parser> (MIT).

## Sensitivity
- **Top two: B (4.30) and A or D (4.10 each), gap 0.20.** B − A = −w(fidelity) − w(resolution) +
  2·w(tree model) + w(speed) + w(licence). Moving 7 points from the tree-model criterion to
  fidelity (32, 15, 8, 15, 15, 15) makes A lead by 0.01. A decider who ranks exactness for
  TypeScript above uniform algorithms would make that shift; it is plausible. B − D = −w(fidelity)
  + 2·w(tree model) − w(speed) + w(portability) + w(licence); moving 7 points from the tree-model
  criterion to fidelity or to speed makes D lead in the same way.
- **Score risk.** If the acceptance suite of C001-NFR-008 (a) found grammar gaps for TypeScript
  (fidelity 3 for B), B would fall to 4.05, below A and D. The mitigation is built into the
  recommendation: C001-COMP-007 keeps a per-ecosystem parser port, so the TypeScript/JavaScript
  adapter can move to the TypeScript compiler API without changing the other ecosystems.
- **Runtime.** If C001-ADR-001 chose Rust, B uses the native tree-sitter crates (portability and
  speed 5) and stays first; A loses its main asset, since the TypeScript compiler API is a
  JavaScript library.
- C and E violate C001-CON-18 and C001-NFR-008 respectively and are not presented, whatever the
  weights.

## Presented
1. **B — tree-sitter for all three ecosystems** (4.30) — recommended.
2. **A — TypeScript compiler API plus tree-sitter** (4.10) — the exact-TypeScript alternative.
3. **D — oxc parser plus tree-sitter** (4.10) — the fastest-TypeScript alternative.

## Recommendation
**B — tree-sitter for all three ecosystems:** one MIT-licensed tree model lets the equality,
hashing, resolution and executable-line algorithms be written once, it runs on every target from
one WebAssembly file per grammar, and its fidelity gap shows as a labelled parse failure rather
than a wrong result. No near tie applies (0.20 ahead of A and D). The lead rests partly on the
tree-model weight; the tie-breaker is reversibility (constitution principle 2): the per-ecosystem
port lets the TypeScript adapter switch to A's compiler API later at the cost of one adapter.

## Rejected
- **C — Each ecosystem's own compiler front end** (3.35) — parses outside the core's process, against
  C001-CON-18, and needs Python and .NET on every developer machine.
- **E — No syntax parser** (2.95) — cannot recognise public-API heads, tree equality or names,
  against C001-NFR-008 (a) and C001-IF-005 §7.
