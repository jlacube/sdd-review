---
id: "C001-ADR-009"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: proposed
---
# C001-ADR-009 — Diff algorithm and default risk weights

## Context and problem

Two static-analysis choices are fixed per release (C001-CON-17, C001-NFR-015). The diff algorithm
decides what a hunk is (domain model §2.4): its boundaries drive risk scores and the intent order
(C001-REQ-401, C001-REQ-403) and supply the candidates of the pure-move and pure-rename rules
(C001-REQ-406, C001-REQ-407). The risk-score model and its default weights are left to this plan
by the open item of C001-REQ-401; the score must be monotone in each signal (C001-REQ-402), treat
unknown coverage as none (C001-REQ-404), use no model (C001-REQ-405), and be meaningful as a ratio
and a sum, because the attention budget divides it by reading minutes (C001-REQ-610, C001-REQ-611)
and the coverage statement sums it (C001-REQ-617). The review configuration has no weight setting
(C001-IF-004), so the defaults are the weights of the release. Without this decision two
implementations of the same release could cut and rank hunks differently, and the weights would be
chosen without evidence.

## Considered options

Options analysis: `OA-011-diff-algorithm-and-risk-weights.md` (C001-OA-011).

- Part A: **histogram diff in the analysis core** (4.70); **Myers diff in the analysis core**
  (4.50). Rejected: patience (4.45, dominated by histogram), the installed git program's diff (3.20,
  varies with the git version), structural diff (3.00, breaks line-based hunks).
- Part B: **size times hazard** (4.50); **weighted sum of normalised signals** (4.00). Rejected:
  equal weights (3.70), logistic model on mined data (2.75), lexicographic tiers (3.10).

## Decision outcome

Proposed: **histogram diff implemented in the analysis core with one fixed slider rule**, and the
**size-times-hazard risk score with the prior weights below, calibrated before each release on a
corpus kept apart from the measurement sets**. The histogram diff gives the same hunks whatever git
is installed and keeps code blocks and moved definitions whole; the size-times-hazard score is
monotone by construction and is the only presented model whose sums and per-minute ratios mean
what C001-REQ-610 and C001-REQ-617 use them for.

The decision adds no dependency and changes no interface, so it needed no question to P-01; status
stays proposed: accepted with the plan at gate G3.

## Design

### 1. Diff algorithm

- **Input:** for each changed text file, the base-side and snapshot-side content from the git
  access port (C001-IF-012 G-07), after the port's end-of-line normalisation; for a renamed file,
  the old path's base content against the new path's snapshot content. Binary files get no hunk
  (C001-REQ-108).
- **Line equality:** exact byte equality; no whitespace is ignored (layout-only changes are cleared,
  where proven, by the formatting rule C001-REQ-408). A missing final line terminator counts as a
  difference, as in git.
- **Algorithm:** histogram diff (low-occurrence lines as anchors, recursive on the regions between
  them); a region in which every candidate line occurs more than 64 times falls back to Myers'
  algorithm, as JGit does. Implemented in the analysis core, ported from JGit's `HistogramDiff`
  (EDL-1.0, a BSD-3-Clause licence, attribution kept) or written from its published description;
  git's `xdiff` sources are not used.
- **Slider rule:** when a run of added or deleted lines can slide along equal lines without changing
  the edit, it is placed where the line after it has the smallest indentation, the end of the file
  counting as smaller than any line and a blank line taking the indentation of the next non-blank
  line; remaining ties go to the lowest position in the file. Example: a function appended after
  another becomes one run of "blank line, header, body, closing brace", not "closing brace, blank
  line, header, body".
- **Hunks:** maximal runs of consecutive changed lines with no context (domain model §2.4).
- **Pinned per release:** a golden corpus of file pairs (all three deep ecosystems, Markdown, JSON,
  YAML, a large generated file) with expected hunks, plus property tests (applying the edit script
  to the base side gives the snapshot side). Any change of hunk output between releases is a
  release-note item.

### 2. Inputs of move and rename detection

The rules are those of C001-REQ-406 and C001-REQ-407, applied by C001-COMP-010; this section fixes
their inputs.

- **File pairs:** change type and previous path from G-07 (renames detected by the port at 50 %
  similarity).
- **Line ranges:** for each hunk, the deleted range on the base side and the added range on the
  snapshot side, from the diff above.
- **From C001-COMP-007, per file side:** symbol definitions with their line spans as the parser
  reports them (the definition node with its attached leading comments and blank lines), a
  normalised syntax-tree hash per definition and per file (node kinds, identifiers and literals;
  positions, layout and comments excluded), and the resolved symbol of every name.
- **Pure-move candidates:** definitions whose spans lie wholly within deleted ranges on the base side
  and definitions wholly within added ranges on the snapshot side, matched by equal hash; several
  equal hashes are paired in path order, then line order, on both sides (C001-CON-17); each pair is
  then checked for name resolution. Whole-file moves: a deleted and an added file with equal file
  hash, also when the port detected no rename.
- **Pure-rename candidates:** file pairs (same path or renamed) whose syntax trees are equal up to a
  consistent renaming of identifiers; the renaming map is then checked against the snapshot-wide
  index of uses.
- Because the histogram diff anchors on rare lines, a moved definition usually appears as one whole
  deleted range and one whole added range instead of fragments aligned on braces and blank lines,
  so more pure moves reach the proof.

### 3. Risk score

score = round(L^α × H, 3), with H = 1 + w_G·G + w_N·N + w_U·U + w_D·D

| Symbol | Signal (C001-REQ-401) | Value |
|---|---|---|
| L | size | changed lines of the hunk, at least 1 |
| G | guarded area | 1 when the hunk lies in at least one guarded area, built-in or configured |
| N | novelty | 1 when the change adds the hunk's file |
| U | test coverage | 1 − coverage share; unknown coverage gives share 0 (C001-REQ-404), as does a hunk that adds no executable line |
| D | dependency change | 1 when the hunk adds, removes or changes a dependency on an external package or between components |

- **Prior defaults of the release** (until a calibration replaces them under item 4): α = 1,
  w_G = 2.0, w_U = 1.0, w_D = 1.0, w_N = 0.5. The hazard H runs from 1 (fully tested, no flag) to
  5.5. Reasons: guarded areas are the never-clear list, so their hazard alone triples the base;
  untested code and dependency changes each double it; novelty is a weaker and mixed signal in the
  defect-prediction literature.
- **Monotone by construction** (C001-REQ-402): L^α increases with L for α > 0; H does not decrease in
  G, N and D and decreases with coverage, for every w ≥ 0. Property-based unit tests check it.
- **Deterministic** (C001-CON-17): binary64 arithmetic in a fixed order; α is restricted to 0.5,
  0.75 and 1, computed with square roots and products only, which IEEE 754 rounds correctly on
  every platform; the result is rounded
  half-to-even to 3 decimals before it is recorded or compared; equal scores are ordered by path and
  first changed line (C001-REQ-403).
- **Effects:** intent order by descending score (C001-REQ-403); risk per reading minute =
  score × rate / (60 × L), which for α = 1 is proportional to the hazard, so the attention budget
  reads the most hazard per minute first (C001-REQ-610); sums and shares of scores in the coverage
  statement read as size-weighted hazard (C001-REQ-617). Scores never clear a hunk (C001-REQ-412).

### 4. Calibration of the weights

1. **Corpus:** agent changes in the three deep ecosystems that are neither benchmark changes
   (`30-nfr/nfr.md` §0) nor in the sealed G-8 pool (§3), at least 12 (4 per ecosystem) of 2,000 to
   10,000 changed lines; at least 8 defects seeded in each by a person who does not calibrate,
   covering the six kinds of §3 item 3, plus defects found when reviewing them. A hunk is labelled
   defective when it holds a defect.
2. **Signals:** computed by the release candidate's static analysis in model-free mode, with each
   change's test run, exactly as in a review.
3. **Metric:** effort-aware recall at 20 % of changed lines: the share of defective hunks found when
   hunks are read in descending score per changed line until 20 % of the changed lines are read
   (the order of C001-REQ-610); reported also at 50 %.
4. **Search:** grid over α ∈ {0.5, 0.75, 1}, w_G ∈ {0, 0.5, …, 4}, w_U, w_D, w_N ∈ {0, 0.25, …, 2},
   all non-negative so every point is monotone; leave-one-change-out cross-validation.
5. **Adoption:** the calibrated parameters replace the priors only when their mean cross-validated
   recall at 20 % exceeds that of the priors by at least 0.05; among parameter sets within 0.02 of
   the best, the one closest to the priors (sum of absolute differences) is taken. Otherwise the
   priors stay.
6. **Record:** a calibration report per release (corpus, labels, metric, chosen parameters) kept
   with the test evidence; a change of weights is a release-note item, since scores change between
   releases. Calibration never runs at review time.

## Consequences

- **Good:** the same hunks and scores on every machine of a release; cleaner hunks for reading and
  for the pure-move rule; scores whose sums and per-minute ratios carry meaning; weights backed by
  a measurement that cannot be tuned to the benchmark or the G-8 study.
- **Bad:** a histogram diff and the slider rule are code to own (few libraries offer them); the
  calibration corpus needs at least 12 agent changes and a person to seed defects, which the test
  plan must budget; with α = 1, large untested hunks lead the intent order, which a calibration may
  change to α < 1.
- **Constraints:** realises the fixed diff algorithm of C001-CON-17; no new constraint.
- **Components:** C001-COMP-004 (diff and hunks), C001-COMP-007 (definitions, hashes, resolved
  names), C001-COMP-010 (risk score, intent order, move and rename rules), C001-COMP-012 (attention
  budget and coverage statement use the scores).
- **Follow-up:** golden diff corpus; property tests for C001-REQ-402; calibration corpus and seeding
  in the test plan; research note confirming the cited study and JGit's licence.
