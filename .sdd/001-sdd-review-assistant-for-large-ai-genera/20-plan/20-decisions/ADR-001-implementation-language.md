---
id: "C001-ADR-001"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: accepted
date: 2026-11-18
deciders: ["P-01"]
amended: 2026-11-19
---
# C001-ADR-001 — Implementation language and runtime: TypeScript on Node.js

> **Amended on 2026-11-19** (Amendment 1 at the end of this file): aligned with the specification
> re-approved at G2 on 2026-11-19. The decision is unchanged.

## Context and problem
C001-CON-18 leaves the implementation language of the CLI (C001-COMP-001), the analysis core
(C001-COMP-002 to C001-COMP-017) and the UI server (C001-COMP-018) to the plan, within one
installable package, in-process parsing of the three deep ecosystems (C001-NFR-008) and the
thresholds of C001-NFR-001, C001-NFR-003, C001-NFR-004 and C001-NFR-018. The package runs on every
platform of C001-CON-15 (C001-NFR-016), uses permissive dependencies only (C001-CON-07) and keeps
the core usable without the UI (C001-CON-09, C001-DEC-002). The core API (C001-IF-003 §1) waits for
this decision to fix its function signatures and async model. Without a decision no task can start,
and the parser (C001-ADR-003), UI (C001-ADR-002) and git (C001-ADR-004) decisions have no host.

## Considered options
Analysis: C001-OA-003 (five candidates, weighted criteria, sensitivity).

- **TypeScript on Node.js** (4.15) — one language from core to web client; npm package; parsers as
  compiled code in worker threads. Recommended.
- **Rust** (3.95) — native executable per target with the most performance headroom; a second
  language besides the TypeScript web client.

Rejected: Go (3.55), C# on .NET (3.35), Python (2.85); reasons in C001-OA-003.

## Decision outcome
**Accepted by P-01 on 2026-11-18.** Question Q-language-01 (`20-plan/questions-log.md`, round 1),
answer: "TypeScript/Node.js (Recommended)".

Chosen: **TypeScript on Node.js**. It gives the lowest build
and maintenance effort, because CLI, core, UI server and web client share one language and one set of
types, and it keeps the thresholds within reach because parsing runs as compiled code (C001-ADR-003).
The lead over Rust (0.20) depends on the effort weight and on an unmeasured performance score; the
tie-breakers are reversibility (a hot spot can move into a native module behind the parser port of
C001-COMP-007) and simplicity (constitution principles 1 and 2).

What the decision fixes:

1. **Runtime:** Node.js LTS, 22 or later (the line of the reference toolchain); the supported lines
   at release are named in `20-plan/10-strategy.md`.
2. **Package:** one npm package that holds the CLI with the `sdd-review` executable, the core, the
   UI server and the built web-client assets (C001-CON-18); installed with a Node.js package manager
   or run once through `npx`.
3. **Core API binding (C001-IF-003 §1):** a TypeScript module that exports one async function per
   operation of C001-IF-003 §3 and §4, each returning a promise; inputs and outputs are TypeScript
   types generated at build time from the JSON Schemas of C001-IF-008 and C001-IF-009 and from the
   view schemas of C001-IF-002; a failing operation rejects with one error type that carries the
   code of `50-interfaces/errors.md`.
4. **Parallelism:** worker threads inside the one core process, so that C001-NFR-004 measures one
   process (`60-architecture/architecture.md` §6, Performance); each worker gets a heap limit.
5. **Module boundary (C001-CON-09):** the core's modules import neither the UI server nor the web
   client; the CLI loads the UI server only for `review` and `open`.

## Consequences
- Good: one toolchain, one type system and one test runner for every component; the web client and
  the server share types generated from `50-interfaces/`; the helper code that evidence runs need
  in Node.js projects is written in the same language.
- Good: worker threads keep the core in one process, which simplifies the memory measurement of
  C001-NFR-004.
- Bad: developers who work only in Python or .NET must install Node.js. Follow-up for a later
  increment: a standalone executable per target (Node.js single executable application), which is
  feasible when the parsers ship as WebAssembly (C001-ADR-003).
- Bad: Node.js has no operating-system file lock in its standard library; the record lock of
  C001-COMP-014 uses a lock-file protocol (C001-ADR-005).
- Bad: npm dependency trees are deep. The plan adds a licence check and a dependency audit to the
  build (NFR-D-02, NFR-D-03, C001-CON-07), and every dependency is pinned by the lock file.
- Risk: the performance and memory headroom is not measured. Follow-up task, scheduled before the
  bulk of C001-COMP-007 to C001-COMP-010: a spike that parses both sides of a benchmark-sized change
  and the files the rename proof searches, and measures time and peak memory against C001-NFR-001
  and C001-NFR-004. If it misses, the hot path moves into a native module behind the parser port;
  if that still misses, the decision returns to P-01 with Rust as the alternative.
- Follow-up: a dependency rule in the linter that fails the build when a core module imports the
  UI server or the web client (C001-CON-09).
- Proposed for a spec revision (not edited here, the spec is approved): a constraint "the review
  assistant runs on Node.js LTS 22 or later, a prerequisite installed by the developer", source
  C001-ADR-001, affecting C001-COMP-001 to C001-COMP-018. Recorded as defect D-002 in `change.md`
  (Q-specfix-01).
- Not verified online in this session: the Node.js release lines and their support periods, the
  worker-thread and single-executable features, and the licences of the dependencies this decision
  brings in come from the architect's knowledge as of 2026-06 (C001-OA-003, Sources). The licence
  and audit checks of C001-CON-07 (NFR-D-02, NFR-D-03) must confirm each licence when the
  dependency is added; `20-plan/10-strategy.md` names the supported Node.js lines from the
  published release schedule.
- Affected constraints: C001-CON-09, C001-CON-15, C001-CON-18. Affected components: C001-COMP-001,
  C001-COMP-002, C001-COMP-007, C001-COMP-014, C001-COMP-018.

## Amendment 1 — 2026-11-19: alignment with the revised specification

**Why.** This ADR raised defect D-002 (Q-specfix-01). The specification revision that closed it was
re-approved at G2 on 2026-11-19. C001-CON-18 now names Node.js 22 or later, an LTS line, as a
prerequisite that the developer installs outside the package, with this ADR as its source. This
matches decision item 1.

**What changes.** The consequence "Proposed for a spec revision … a constraint 'the review assistant
runs on Node.js LTS 22 or later …' … Recorded as defect D-002" is settled; no spec revision is
pending from this ADR.

**What stays.** The decision, P-01's acceptance of 2026-11-18 (Q-language-01), the rest of the text
above and C001-OA-003 are unchanged.
