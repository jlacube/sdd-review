---
id: C001-T-014
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Spike — parsing speed and memory at the supported size
milestone: C001-M-01
status: blocked
depends_on: [C001-T-006, C001-T-013]
implements: [C001-NFR-001, C001-NFR-004]
satisfies_ac: [C001-AC-201.1]
verified_by: [C001-TS-201]
components: [C001-COMP-007, C001-COMP-003]
risk_refs: [C001-RISK-009]
estimate: M
report: { commit: null, completed_at: null, notes: "blocked: Harness built at fa193a7 (CI green); measurement waits for the owner's go-ahead to keep the reference machine idle (npm run bench -- spike-parse all)" }
---
# C001-T-014 — Spike: parsing speed and memory at the supported size

## Intent
C001-ADR-001 and C001-ADR-003 rest on an unmeasured performance estimate. Before the bulk of
C001-COMP-007 to C001-COMP-010 is built, parse both sides of each benchmark change and the files
that the rename proof searches with the tree-sitter WebAssembly grammars in worker threads, read
them through git operations G-07 and G-09, and measure time and peak memory against a pass
condition derived from C001-NFR-001 (120 s) and C001-NFR-004 (2 GiB).

**Pass condition (set by the plan before the spike runs; no NFR threshold changes).** For every
benchmark change, over 5 cold runs:
- the maximum wall-clock time of git reads G-07 and G-09 plus parsing plus the representative
  symbol and import extraction is ≤ 60 s (50 % of the 120 s of C001-NFR-001); and
- the peak resident memory of the core process is ≤ 1 GiB (50 % of the 2 GiB of C001-NFR-004).

Rationale: the spike covers only the parsing front of the static analysis; the architecture delta,
the store writes, the UI server start and the rendering of the delta view up to the stop point of
C001-NFR-001 must fit in the remaining half. C001-OA-003 (Sensitivity) ranks Node.js first only if
its performance headroom holds; at less than half of the budget left, its performance score falls
to 3 and Rust leads. Either value above its limit on one benchmark change is a miss.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `spikes/parse/ › parse harness` | worker pool with heap limits, both sides of every changed file plus the rename search set |
| add | `spikes/parse/RESULTS.md` | per benchmark change: git read time, parse time, peak memory, worker count, pass or miss against the pass condition and the margin left |

## Preconditions
- C001-T-006 (git reads) and C001-T-013 (frozen benchmark set) done; C001-T-002 confirmed the
  tree-sitter runtime and grammar licences.

## Step outline
1. Load the three grammars as WebAssembly in worker threads with a heap limit per worker.
2. For each benchmark change, read both sides through the git port and parse them; extract the
   symbol and import information a full analysis needs (a representative query set).
3. Measure 5 cold runs per change with the harness of C001-T-013; report maximum time and peak
   resident memory of the one core process.
4. Compare the maxima with the pass condition and state the margin left against 60 s and 1 GiB.
   On a miss, measure the native-module alternative behind the parser port with the same runs and
   the same pass condition, so that C001-T-024 can decide between the outcomes of
   `10-strategy.md` §3.

## Verification
- `npm run bench -- spike-parse`

## Done when
- [ ] `spikes/parse/RESULTS.md` holds the measurements for every benchmark change.
- [ ] The result is stated as pass or miss against the pass condition (≤ 60 s and ≤ 1 GiB per
      benchmark change), with the margin left, for the WebAssembly grammars and, after a miss, for
      the native-module alternative, for C001-T-024.
