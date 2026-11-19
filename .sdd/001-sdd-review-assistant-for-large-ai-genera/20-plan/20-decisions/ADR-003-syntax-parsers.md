---
id: "C001-ADR-003"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: accepted
date: 2026-11-18
deciders: ["P-01"]
---
# C001-ADR-003 — Syntax parsers: tree-sitter for the three deep ecosystems

## Context and problem
Language analysis (C001-COMP-007) parses the files of the deep ecosystems (C001-IF-005 §8) at the
base commit and in the snapshot, in process (C001-CON-18), with permissive libraries only
(C001-CON-07). Its trees serve public-API recognition with exact declaration heads (C001-IF-005 §7,
C001-REQ-417), tree equality for the formatting and move rules (C001-REQ-408, C001-REQ-406), name
resolution for the move and rename proofs (C001-REQ-406, C001-REQ-407), dependency extraction
(C001-REQ-204, C001-REQ-213, C001-REQ-214) and parse-failure detection (C001-REQ-212). The
architecture delta analyser (C001-COMP-008) also reads package manifests (C001-REQ-205,
C001-REQ-224). Results must be deterministic per release (C001-CON-17, C001-NFR-015) and fit
C001-NFR-001 and C001-NFR-004, and every acceptance scenario that depends on a language-specific
signal must pass in each deep ecosystem (C001-NFR-008). Without a decision, each analysis component
would choose its own parser and tree model.

## Considered options
Analysis: C001-OA-005 (five candidates, weighted criteria, sensitivity). It assumes the runtime of
C001-ADR-001.

- **tree-sitter for all three ecosystems** (4.30) — one tree model through the WebAssembly runtime;
  name resolution built in house. Recommended.
- **TypeScript compiler API plus tree-sitter** (4.10) — the reference parser and checker for
  TypeScript and JavaScript; tree-sitter for Python and C#.
- **oxc parser plus tree-sitter** (4.10) — the fastest TypeScript parser, as a native module.

Rejected: each ecosystem's own compiler front end (3.35, violates C001-CON-18), no syntax parser
(2.95, violates C001-NFR-008); reasons in C001-OA-005.

## Decision outcome
**Accepted by P-01 on 2026-11-18.** Question Q-parsers-01 (`20-plan/questions-log.md`, round 1),
answer: "tree-sitter for all (Recommended)".

Chosen: **tree-sitter for all three deep ecosystems**. One MIT-licensed tree model lets the equality, hashing, resolution and executable-line algorithms be
written once; one WebAssembly file per grammar runs on every target of C001-CON-15 with no native
module; and a grammar gap shows as a labelled parse failure, not as a wrong result. The lead (0.20)
rests partly on the tree-model weight; the tie-breaker is reversibility, because the parser port
below lets the TypeScript adapter move to the TypeScript compiler API at the cost of one adapter.

What the decision fixes:

1. **Runtime and grammars:** `web-tree-sitter` with the grammars tree-sitter-typescript (TypeScript
   dialect for `*.ts`, `*.mts`, `*.cts`; TSX dialect for `*.tsx`), tree-sitter-javascript (`*.js`,
   `*.jsx`, `*.mjs`, `*.cjs`), tree-sitter-python (`*.py`, `*.pyi`) and tree-sitter-c-sharp (`*.cs`).
   Each grammar's version and its WebAssembly build are pinned per release and listed in the release
   notes, so trees, and with them the static results, are fixed per release (C001-CON-17).
2. **Parser port:** C001-COMP-007 exposes one port per ecosystem (parse, heads of public symbols,
   imports, scopes and references, executable lines); the generic algorithms work on the common tree
   type. Replacing one ecosystem's parser changes only its adapter.
3. **Parse failure:** a tree that holds an error or missing node means the file does not parse; it
   is analysed as `other` with a reduced label (C001-IF-005 §8, C001-REQ-212).
4. **Name resolution:** an in-house, conservative resolver per ecosystem over lexical scopes,
   imports and the grammars' scope queries. A name it cannot resolve with certainty makes the
   move or rename proof fail, so the hunk stays open (C001-REQ-406, C001-REQ-407). The rename proof
   finds the snapshot files to parse through a per-snapshot index of identifier text, so it does not
   parse the whole repository.
5. **Manifest readers:** `JSON.parse` for `package.json`; an in-house line reader for requirements
   files; smol-toml (BSD-3-Clause) for `pyproject.toml` and `Pipfile`; fast-xml-parser (MIT) for
   `*.csproj`, `Directory.Packages.props` and `packages.config`. A manifest that fails its reader is
   labelled as not analysed (C001-REQ-224).
6. **Language-agnostic core:** no parser; moves and duplicated logic for other languages work on
   normalised lines (C001-IF-005 §9, C001-REQ-215, C001-REQ-910).

## Consequences
- Good: every dependency in this decision is MIT or BSD-3-Clause; no native module, so the npm
  package installs without a build step and a later standalone executable can embed the grammars
  (C001-ADR-001).
- Good: adding a language later means adding a grammar and an adapter, not a new tree model.
- Bad: name resolution is built in house for all three ecosystems; it is the largest piece of
  C001-COMP-007 and needs its own tests per ecosystem against C001-REQ-406 and C001-REQ-407.
- Bad: WebAssembly trees live outside the JavaScript heap and must be freed explicitly; a leak
  counts against C001-NFR-004. Each worker thread loads its own grammar instances.
- Risk: grammar lag behind new TypeScript, Python or C# syntax. The acceptance suite of
  C001-NFR-008 (a) runs on every grammar upgrade; files that fail to parse are reported as reduced,
  never cleared. If gaps persist for TypeScript, the TypeScript/JavaScript adapter moves to the
  TypeScript compiler API (C001-OA-005, candidate A).
- Risk: speed of the WebAssembly runtime is estimated. The spike of C001-ADR-001 measures parsing of
  a benchmark-sized change; if it misses its share of C001-NFR-001, the native tree-sitter binding
  replaces the WebAssembly runtime behind the same port, at the cost of one native module per target.
- Proposed for a spec revision (not edited here): C001-CON-17 names a fixed diff algorithm per
  release; grammar versions are a second input that fixes results per release and could be named
  there, source C001-ADR-003. Recorded as defect D-003 in `change.md` (Q-specfix-01).
- Not verified online in this session: the licences of `web-tree-sitter`, the four grammars (MIT),
  smol-toml (BSD-3-Clause) and fast-xml-parser (MIT), the grammar versions and how far each grammar
  covers current TypeScript, Python and C# syntax come from the architect's knowledge as of 2026-06
  (C001-OA-005, Sources). The licence check of C001-CON-07 (NFR-D-03) must confirm each licence
  when the dependency is added; the versions are fixed when they are pinned per release (item 1).
- Affected constraints: C001-CON-07, C001-CON-17, C001-CON-18. Affected components: C001-COMP-007,
  C001-COMP-008, C001-COMP-010.
