---
id: "C001-OA-011"
artifact: plan/option-analysis
change: "CHG-001"
phase: 20-plan
status: draft
---
# OA-011 — Diff algorithm and default risk weights

## Problem

Two choices of the static analysis are left to this plan, and they are analysed here as two parts
of one decision because both fix, per release, what a hunk is and how it ranks.

**Part A — diff algorithm.** A hunk is a maximal run of consecutive changed lines of a diff with no
context lines; the algorithm is fixed per release and analysis is deterministic (domain model §2.4,
C001-CON-17, C001-NFR-015). The hunks feed the risk score and the intent order (C001-REQ-401,
C001-REQ-403) and the move and rename rules (C001-REQ-406, C001-REQ-407), whose proofs rest on
syntax trees but whose candidates are the lines a hunk removes and adds. The git access port gives
both sides of each changed file with renames detected at 50 % similarity (C001-IF-012 G-07); intake
and static analysis must fit 120 s (C001-NFR-001).

**Part B — risk-score model and default weights.** Each hunk gets a score from five recorded
signals (C001-REQ-401) that is monotone in each signal (C001-REQ-402), treats unknown coverage as
none (C001-REQ-404), uses no model (C001-REQ-405) and is deterministic (C001-CON-17). The score is
also divided by reading time for the attention budget (C001-REQ-610, C001-REQ-611) and summed into
shares of total risk (C001-REQ-617), so its scale must carry meaning, not only its order. The
review configuration has no weight setting (C001-IF-004), so the defaults are the weights of the
release. Out of scope: the guarded-area lists (C001-IF-005) and clearing, which risk scores never
decide (C001-REQ-412).

## Criteria

Part A — diff algorithm:

| Criterion | Weight (%) |
|---|---|
| Deterministic and fixed per release | 30 |
| Hunk quality for reading and for move detection | 25 |
| Speed at the supported size | 15 |
| Independent of the git-access and language choices | 15 |
| Simplicity | 15 |

Part B — risk-score model:

| Criterion | Weight (%) |
|---|---|
| Monotone and deterministic by construction | 25 |
| Coherent risk sums, shares and risk per minute | 25 |
| Calibratable without touching the measurement sets | 20 |
| Explainable from the recorded signal values | 15 |
| Simplicity | 15 |

- **A: Deterministic and fixed per release** — the same input gives the same hunks on every
  machine and every installed git version (C001-CON-17).
- **A: Hunk quality** — hunks follow code blocks instead of matching stray braces and blank lines;
  moved blocks appear as whole removals and additions, which the pure-move rule can prove.
- **B: Coherent sums, shares and risk per minute** — a sum of scores reads as "how much risk", and
  score per reading minute ranks what to read within a budget (C001-REQ-610, C001-REQ-617).
- **B: Calibratable without touching the measurement sets** — the parameters can be fitted on data
  that is neither the benchmark set of `30-nfr/nfr.md` §0 nor the sealed G-8 pool (§3).

## Candidates

Part A:

- **A1 — Histogram diff in the analysis core** — the histogram algorithm (as in JGit and
  `git diff --histogram`), Myers fallback for regions without low-occurrence lines, one fixed
  slider rule; implemented in the core.
- **A2 — Myers diff in the analysis core** — the minimal edit script of git's default algorithm.
- **A3 — Patience diff in the analysis core** — anchors on lines unique to both sides.
- **A4 — The installed git program's diff** — `git diff --histogram -U0` with external diff and
  textconv disabled.
- **A5 — Structural diff for the deep ecosystems** — syntax-tree differencing (GumTree style) for
  TypeScript/JavaScript, Python and C#, line diff elsewhere.

Part B (L = changed lines; G, N, D ∈ {0, 1} for guarded area, novelty, dependency change; U = 1 −
test-coverage share):

- **B1 — Size times hazard** — score = L^α × (1 + w_G·G + w_N·N + w_U·U + w_D·D), all w ≥ 0.
- **B2 — Weighted sum of normalised signals** — score = 100 × (w_G·G + w_N·N + w_U·U + w_D·D +
  w_L·s(L)), with s a capped logarithmic size scale and weights summing to 1.
- **B3 — Equal weights, no calibration** — B2 with every weight 0.2.
- **B4 — Logistic model fitted on mined defect data** — defect probability from the five signals,
  coefficients learned from defect-inducing changes mined with SZZ from open-source histories.
- **B5 — Lexicographic tiers** — guarded area, then coverage, dependency, novelty and size, encoded
  as one number with separated magnitudes.

## Scores

Part A:

| Candidate | Deterministic and fixed per release | Hunk quality for reading and for move detection | Speed at the supported size | Independent of the git-access and language choices | Simplicity | Weighted |
|---|---|---|---|---|---|---|
| Weights | 30 | 25 | 15 | 15 | 15 | 100 |
| A1 — Histogram diff in the analysis core | 5 | 5 | 5 | 5 | 3 | 4.70 |
| A2 — Myers diff in the analysis core | 5 | 3 | 5 | 5 | 5 | 4.50 |
| A3 — Patience diff in the analysis core | 5 | 4 | 4 | 5 | 4 | 4.45 |
| A4 — The installed git program's diff | 2 | 5 | 4 | 1 | 4 | 3.20 |
| A5 — Structural diff for the deep ecosystems | 4 | 3 | 2 | 4 | 1 | 3.00 |

Part B:

| Candidate | Monotone and deterministic by construction | Coherent risk sums, shares and risk per minute | Calibratable without touching the measurement sets | Explainable from the recorded signal values | Simplicity | Weighted |
|---|---|---|---|---|---|---|
| Weights | 25 | 25 | 20 | 15 | 15 | 100 |
| B1 — Size times hazard | 5 | 5 | 4 | 4 | 4 | 4.50 |
| B2 — Weighted sum of normalised signals | 5 | 3 | 4 | 4 | 4 | 4.00 |
| B3 — Equal weights, no calibration | 5 | 3 | 1 | 5 | 5 | 3.70 |
| B4 — Logistic model fitted on mined defect data | 3 | 4 | 2 | 2 | 2 | 2.75 |
| B5 — Lexicographic tiers | 5 | 1 | 2 | 4 | 4 | 3.10 |

Justifications (sources: section Sources; none opened in this session):

- **A1.** Deterministic 5 when implemented in the core and pinned by golden tests. Quality 5: the
  study of Nugroho, Hata and Matsumoto found histogram output preferable to Myers for code changes
  in most of the commits where the two differ; anchoring on rare lines keeps moved blocks whole.
  Speed 5: near-linear on typical code. Independent 5. Simplicity 3: few libraries implement it;
  JGit's `HistogramDiff` (EDL-1.0, a BSD-3-Clause licence) is a permissive reference, while git's
  `xdiff` code may not be copied (copyleft).
- **A2.** Quality 3: minimal edit scripts often align unrelated braces and blank lines, splitting a
  moved function into fragments that no longer remove whole definitions. Simplicity 5: many
  permissive implementations.
- **A3.** Quality 4: good with unique lines, weaker where few exist; histogram generalises it.
  Speed 4.
- **A4.** Deterministic 2: the output of the developer's installed git changes between git
  releases (heuristics, defaults), so the hunks would not be fixed per release. Independent 1:
  exists only if the git-access ADR chooses the git program.
- **A5.** Quality 3 for this purpose: hunks would stop being runs of lines, which the domain model,
  read marks and coverage are built on. Speed 2, simplicity 1.
- **B1.** Monotone 5 for any α > 0 and w ≥ 0. Coherence 5: score per changed line is the hazard
  (for α = 1), so the attention-budget order of C001-REQ-610 is the greedy order for most risk per
  minute, and sums read as size-weighted hazard, close to expected defects. Calibratable 4: five
  parameters. Explainable 4: "lines times hazard factor".
- **B2.** Coherence 3: the bounded size term gives a one-line hunk with one flag a large fraction
  of the score of a 300-line hunk with the same flag (two thirds with a flag weight of 0.3 and a
  size weight of 0.15), so risk per minute favours tiny hunks and risk sums overstate what reading
  many small hunks covers.
- **B3.** Calibratable 1: no calibration; otherwise as B2.
- **B4.** Monotone 3: needs sign constraints. Calibratable 2: needs large labelled data; SZZ labels
  are noisy and human-written histories differ from agent changes. Explainable 2.
- **B5.** Coherence 1: separated magnitudes make sums and per-minute ratios meaningless.

## Sensitivity

- **A1 against A2 (gap 0.20).** A1 − A2 = 2·w(quality) − 2·w(simplicity). A2 leads when simplicity
  weighs more than hunk quality (for example quality 15, simplicity 25: A2 at 4.70, A1 at 4.50);
  for a tool whose purpose is less reading effort, that is not plausible.
- **A1 against A3 (gap 0.25).** A3 never leads with A1's quality and speed scores; it leads only if
  its quality were rated 5, which the unique-line limitation rules out.
- **B1 against B2 (gap 0.50).** They differ only in coherence: B2 leads only if the meaning of risk
  sums and of risk per minute is given no weight, which would contradict C001-REQ-610 and
  C001-REQ-617.
- **Weights not tuned after scoring:** the criteria and weights were set before the scores.

## Presented

Part A:

1. **A1 — Histogram diff in the analysis core** (4.70) — recommended.
2. **A2 — Myers diff in the analysis core** (4.50) — simplest, rougher hunks.

Part B:

1. **B1 — Size times hazard** (4.50) — recommended.
2. **B2 — Weighted sum of normalised signals** (4.00) — familiar, less coherent sums.

## Recommendation

**A1 — Histogram diff in the analysis core**: deterministic per release whatever git is installed,
and it cuts hunks along code blocks, which helps both reading and the pure-move rule. No near tie
(lead 0.20 over A2).

**B1 — Size times hazard**: monotone by construction, and the only presented model whose sums and
per-minute ratios mean what C001-REQ-610 and C001-REQ-617 use them for. No near tie (lead 0.50
over B2).

## Rejected

- **A3 — Patience diff in the analysis core** (4.45) — the histogram algorithm is its extension with
  a fallback, so A1 dominates it.
- **A4 — The installed git program's diff** (3.20) — hunks would vary with the installed git
  version, against C001-CON-17, and depend on the git-access decision.
- **A5 — Structural diff for the deep ecosystems** (3.00) — breaks the line-based hunk on which the
  domain model, read marks and coverage rest.
- **B3 — Equal weights, no calibration** (3.70) — inherits B2's incoherent sums and has no
  calibration.
- **B4 — Logistic model fitted on mined defect data** (2.75) — needs a large labelled set that does
  not represent agent changes, and monotonicity is not built in.
- **B5 — Lexicographic tiers** (3.10) — sums and per-minute ratios lose their meaning.

## Sources

Not opened in this session (2026-11-18); facts from the architect's knowledge, to be confirmed by a
research note before the plan gate:

- Y. S. Nugroho, H. Hata, K. Matsumoto, "How different are different diff algorithms in Git?",
  Empirical Software Engineering 25 (2020), 790–823.
- Eclipse JGit, `org.eclipse.jgit.diff.HistogramDiff` (Eclipse Distribution License 1.0).
- Git documentation, `git diff --diff-algorithm` and `diff.indentHeuristic`.
- Y. Kamei et al., "A large-scale empirical study of just-in-time quality assurance", IEEE TSE 39(6),
  2013 (effort-aware ranking).
- N. Nagappan, T. Ball, "Use of relative code churn measures to predict system defect density",
  ICSE 2005.
