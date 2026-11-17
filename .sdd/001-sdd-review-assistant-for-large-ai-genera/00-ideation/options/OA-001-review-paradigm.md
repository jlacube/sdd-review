---
id: "C001-OA-001"
artifact: ideation/option-analysis
change: "CHG-001"
phase: 00-ideation
status: draft
---
# OA-001 — Review paradigm

## Problem

Decide the core way a developer reviews a very large agent-generated change: the unit the
reviewer looks at, what the tool does on its own, and what the human still reads. It must be
decided now because it frames the capabilities, the UI (see C001-OA-002) and the research
focus of step 3. Binding inputs from round 1 (`00-ideation/questions-log.md`): the primary
reviewer is the developer accepting agent output locally (Q-reviewer-01); specs are used when
present, with intent from commits, PR text or agent transcripts as fallback (Q-spec-anchor-01);
P-01 asks for a disruptive workflow and UI because the number and size of changes grow
exponentially, so scale is the driving constraint (Q-restatement-01). Constitution principles
1 (simplicity first), 2 (prefer reversible decisions) and 5 (small increments) apply. Out of
scope: the form factor (C001-OA-002), the analysis technology (LLM, static analysis) and how
verdicts are stored.

This analysis was scored before the step-3 research notes existed, from the web sources listed
under Scores (accessed 2026-11-17). The Scores table is the version presented to P-01 for
C001-DEC-001. It was re-checked against C001-R-001 and C001-R-002 on 2026-11-17 (section
"Re-check against research"): two catch scores and one disruption score change, E stays first
(4.10 against B 3.75), and a combined pessimistic case gives a near tie with B, disclosed under
Recommendation.

## Criteria

| Criterion | Weight (%) |
|---|---|
| Scales with change size and volume | 30 |
| Catches wrong, missing or unrequested behaviour | 20 |
| Spec-anchored with intent fallback | 15 |
| Departs from line-by-line review | 15 |
| Simple first increment | 10 |
| Reviewer stays in control with an auditable verdict | 10 |

- **Scales with change size and volume** — reviewer effort grows slower than the number of
  changed lines; weighted highest because P-01 named scale as the driver.
- **Catches wrong, missing or unrequested behaviour** — the verdict is sound: it finds defects,
  gaps against the intent and scope creep.
- **Spec-anchored with intent fallback** — exploits SDD artifacts when present and still works
  on an ordinary agent session (Q-spec-anchor-01).
- **Departs from line-by-line review** — P-01's "disruptive" instruction.
- **Simple first increment** — constitution principles 1 and 5.
- **Reviewer stays in control with an auditable verdict** — the developer signs the result and
  can see why each part was accepted; guards against automation bias.

## Candidates

- **A — Augmented guided diff** — today's diff view plus AI annotations, file grouping and a
  narrative reading order (walkthrough). The obvious default; the narrative walkthrough is
  folded in here because it reorders the same line reading rather than replacing it.
- **B — Intent/spec-first review** — the reviewer walks a list of intents (spec items when an
  SDD workspace exists, else intents extracted from commits, PR text or transcripts); each
  intent opens the code hunks and tests that implement it; code mapped to no intent is flagged
  as unrequested.
- **C — Risk-triaged review by exception** — the tool scores every hunk for risk, clears
  low-risk hunks with evidence (tests pass, mechanical change, no public surface touched) and
  the human reviews only flagged hunks.
- **D — Evidence-based acceptance** — the human judges behaviour, not code: test results,
  runtime traces, invariant checks and acceptance scenarios; code is opened only on a failed
  or missing piece of evidence.
- **E — Intent map with risk triage (hybrid B + C)** — intents are the review unit as in B;
  within each intent the tool clears low-risk hunks with visible evidence and surfaces flagged
  hunks and unmapped code for human reading; the developer signs per intent.

## Scores

As presented to P-01 for C001-DEC-001 (2026-11-17). Re-checked scores: section "Re-check
against research".

| Candidate | Scales with change size and volume | Catches wrong, missing or unrequested behaviour | Spec-anchored with intent fallback | Departs from line-by-line review | Simple first increment | Reviewer stays in control with an auditable verdict | Weighted |
|---|---|---|---|---|---|---|---|
| Weights | 30 | 20 | 15 | 15 | 10 | 10 | 100 |
| A — Augmented guided diff | 2 | 3 | 2 | 1 | 5 | 4 | 2.55 |
| B — Intent/spec-first review | 3 | 4 | 5 | 4 | 3 | 4 | 3.75 |
| C — Risk-triaged review by exception | 5 | 3 | 2 | 4 | 3 | 2 | 3.50 |
| D — Evidence-based acceptance | 5 | 2 | 3 | 5 | 2 | 2 | 3.50 |
| E — Intent map with risk triage | 5 | 4 | 5 | 5 | 2 | 3 | 4.30 |

Justifications (sources opened when the analysis was scored, each accessed 2026-11-17: LinearB
2026 benchmark summary <https://linearb.io/blog/8-million-prs-engineering-productivity>
(accessed 2026-11-17); He et al., arXiv:2607.01904 <https://arxiv.org/abs/2607.01904>
(accessed 2026-11-17); CodeRabbit guide on reviewing AI-generated code
<https://www.coderabbit.ai/guides/code-review-best-practices-for-ai-generated-code>
(accessed 2026-11-17)):

- **A.** Scale 2: the human still reads every line, so effort stays linear in diff size; the
  LinearB summary reports AI-assisted PRs about 2.5x larger and waiting more than 5x longer for
  pickup, and recommends staying under about 300 lines, which agent changes already exceed.
  Catch 3: annotations help, but reading fatigue on large diffs remains. Spec 2: no spec
  structure, only spec-aware comments. Disruptive 1: this is today's workflow. Simple 5:
  annotations over an existing diff. Control 4: the human sees everything, but rubber-stamping
  is likely at this size.
- **B.** Scale 3: effort scales with the number of intents, but every mapped hunk is still read.
  Catch 4: missing intents and unmapped code (scope creep) become visible; the CodeRabbit guide
  recommends treating the ticket as the source of intent and confirming every modified file is
  justified by the requirement. Spec 5: built around spec items, with extracted intents as
  fallback. Disruptive 4: navigation by intent, not by file. Simple 3: needs a code-to-intent
  mapping. Control 4: the human signs each intent with its code in view.
- **C.** Scale 5: human effort tracks the flagged share, not the diff size; He et al. report
  reviewer load doubled under an AI mandate and automated review overtaking human review in
  coverage. Catch 3: as good as the risk model; a false negative is cleared silently. Spec 2:
  risk is judged without intent, so unrequested but low-risk code passes. Disruptive 4. Simple 3:
  risk model plus evidence collection. Control 2: parts are accepted without human sight;
  automation-bias risk.
- **D.** Scale 5: effort tracks behaviours, not lines. Catch 2: tests written by the same agent
  may be weak or tautological, and design or maintainability defects show no runtime symptom.
  Spec 3: acceptance scenarios map well when specs exist; the intent fallback has no scenarios.
  Disruptive 5: no code reading by default. Simple 2: needs test execution, tracing and
  invariant capture per language stack. Control 2: the human accepts code never seen.
- **E.** Scale 5: as C, inside each intent. Catch 4: as B, plus risk flags. Spec 5: as B.
  Disruptive 5: intent map with collapsed, evidence-backed hunks replaces the diff as the main
  view. Simple 2: two engines (mapping and triage). Control 3: cleared hunks stay one click away
  with their evidence and the human signs per intent, but automation bias remains possible.

## Sensitivity

- **Top two: E (4.30) and B (3.75), gap 0.55.** E − B = 2·w(scale) + w(disruptive) −
  w(simple) − w(control). B overtakes E only when w(simple) + w(control) exceeds
  2·w(scale) + w(disruptive), for example scale 10 %, disruptive 5 %, simple 25 %, control 25 %.
  That would make simplicity and control outweigh scale, which contradicts P-01's stated driver
  (Q-restatement-01); not plausible. Moving weight from scale to simple flips the pair only
  after about 18 points (scale 12 %, simple 28 %).
- **Score risk.** E's main uncertainty is the accuracy of the risk model. If it proves weak
  (E: catch 3, control 2), E falls to 4.00 and stays first. If the code-to-intent mapping proves
  unreliable, B and E both lose on catch and spec; the ranking between them does not change.
- **Second tier.** B (3.75) leads C and D (3.50 each) by 0.25; moving 5 points from w(spec) to
  w(scale) would bring C level with B. C and D are tied; see Presented.
- **Re-check (2026-11-17).** After the re-check the gap is 0.35 (E 4.10, B 3.75), and the
  scale-to-simple shift that flips the pair shrinks to about 12 points. The combined pessimistic
  case of critic finding CR-1 (E: scale 4, catch 3, control 2) gives E 3.70 against B 3.75, a
  near tie with B ahead; it is plausible. Figures and tables: section "Re-check against
  research".
- The proposed weights do not flip the recommendation under plausible changes; P-01's
  confirmation of the weights is not required, though P-01 may still correct them. The
  plausible score case above does produce a near tie; its tie-breaker is under Recommendation.

## Presented

1. **E — Intent map with risk triage** (4.30; re-checked 4.10) — recommended.
2. **B — Intent/spec-first review** (3.75; re-checked 3.75) — the simpler intent-based paradigm
   without triage.
3. **D — Evidence-based acceptance** (3.50; re-checked 3.50) — the most radical departure from
   code reading.

D is presented rather than C (tied at 3.50) because C is a component of E and adds no distinct
choice, while D is a genuinely different paradigm. After the re-check C scores 3.30, below D.

## Recommendation

**E — Intent map with risk triage**: it is the only candidate that scales with change size and
volume while keeping the spec-or-intent anchor and the developer's per-intent signature, which
matches all three round-1 answers. No near tie applies in the scored totals (lead 0.55 over B as
presented, 0.35 after the re-check). Its lower simplicity score is mitigated by delivering it in
increments: B's intent map first, then risk triage inside each intent, so the triage layer can
be dropped without losing the paradigm (constitution principles 2 and 5).

**Near-tie disclosure (re-check, 2026-11-17).** In the combined pessimistic case (weak evidence
clears less code and the risk model is weak), E scores 3.70 and B 3.75: E is 0.05 below B. The
tie-breaker is reversibility (constitution principles 2 and 5): E ships as B's intent map first,
with risk triage as a separable later layer, so if the pessimistic case occurs, switching the
triage layer off leaves B at the cost of the triage engine alone, while in the base case E
leads by 0.35. The tie-breaker holds only while that increment path is recorded where 10-spec
and 20-plan read it; C001-DEC-001 Consequences record it (fix for critic finding CR-1).

## Rejected

- **A — Augmented guided diff** (2.55; re-checked 2.70) — keeps line-by-line reading as the
  core, so effort stays linear in diff size; it does not meet P-01's scale and disruption
  instructions (Q-restatement-01).
- **C — Risk-triaged review by exception** (3.50; re-checked 3.30) — subsumed by E; on its own
  it judges risk without intent, so unrequested low-risk code passes unseen and the spec anchor
  (Q-spec-anchor-01) is lost.

## Re-check against research (2026-11-17)

Trigger: critic finding CR-1 (`00-ideation/critic-report.md`). Inputs: C001-R-001 and
C001-R-002. Weights unchanged. No web source was opened for the re-check; every citation below
is to a research note.

### Score changes

| Candidate | Criterion | Was | Now | Reason |
|---|---|---|---|---|
| A — Augmented guided diff | Departs from line-by-line review | 1 | 2 | Grouping and narrative ordering of one large diff exist only in PR-hosted services (C001-R-001 §D, Gap 1); locally they would replace the alphabetical file order whose position bias C001-R-002 §B measures. The reading itself stays line by line, so 2, not 3. |
| C — Risk-triaged review by exception | Catches wrong, missing or unrequested behaviour | 3 | 2 | Ranking by predicted risk found about 35 % of defect-inducing changes at 20 % of the effort, with models trained on human-written changes (C001-R-002 §B, just-in-time defect prediction). C clears the rest without intent and has no detection of missing or unrequested behaviour, so it now scores below E. |
| E — Intent map with risk triage | Catches wrong, missing or unrequested behaviour | 4 | 3 | E leaves cleared hunks unread, the failure already scored 3 for C, and the same risk-ranking evidence applies (C001-R-002 §B). LLM help found no more high-severity issues in one experiment (C001-R-002 §B), and the ideation rates weak clearing evidence high likelihood, high impact. E keeps B's detection of missing intents and unmapped code (C001-R-001 Gap 2; C001-R-002 candidate paradigms 1 and 3), so 3, not 2. |

### Scores confirmed

- **B.** Scale 3: the line-reading rates in C001-R-002 §B (200–400 lines at a time, under about
  500 lines an hour) make reading every mapped hunk of a multi-thousand-line change costly.
  Catch 4: intent grouping yields smaller review units, which C001-R-002 §B associates with
  higher effectiveness (controlled experiment; ClusterChanges), and no surveyed tool detects
  missing or unmapped behaviour at requirement level (C001-R-001 §D, Gap 2). Spec 5: C001-R-001
  Gap 2 and C001-R-002 Implications (neutral intermediate form). Simple 3: untangling succeeds in
  63–75 % of cases (C001-R-002 §B) and model-generated grouping varies between runs (C001-R-001
  Implications), so the mapping is not trivial; not lowered, because that cost applies equally
  to E.
- **E.** Scale 5 and disruptive 5: practitioner risk tiers and review by exception
  (C001-R-002 §B) back effort that tracks the flagged share, and no surveyed local tool combines
  intent grouping with triage (C001-R-001 Gaps 1, 2 and 4). Control 3: a per-intent verdict
  record is a gap in the market (C001-R-001 Gap 3); C001-R-002 Implications ask for visible
  uncertainty and sampling of the underlying code, which evidence one click away partly meets;
  automation bias remains, as scored before.
- **D.** Catch 2: a weak property can pass while behaviour is wrong (C001-R-002 §A, Kiro
  property tests), and an evidence-only workflow leaves open who still learns the code
  (C001-R-002 Implications). Simple 2: evidence signals differ widely in cost (C001-R-002
  Implications).
- All other scores stand; no note contradicts them.

### Re-checked scores

| Candidate | Scales with change size and volume | Catches wrong, missing or unrequested behaviour | Spec-anchored with intent fallback | Departs from line-by-line review | Simple first increment | Reviewer stays in control with an auditable verdict | Weighted |
|---|---|---|---|---|---|---|---|
| Weights | 30 | 20 | 15 | 15 | 10 | 10 | 100 |
| A — Augmented guided diff | 2 | 3 | 2 | 2 | 5 | 4 | 2.70 |
| B — Intent/spec-first review | 3 | 4 | 5 | 4 | 3 | 4 | 3.75 |
| C — Risk-triaged review by exception | 5 | 2 | 2 | 4 | 3 | 2 | 3.30 |
| D — Evidence-based acceptance | 5 | 2 | 3 | 5 | 2 | 2 | 3.50 |
| E — Intent map with risk triage | 5 | 3 | 5 | 5 | 2 | 3 | 4.10 |

### Sensitivity after the re-check

- **Top two: E (4.10) and B (3.75), gap 0.35.** E − B = 2·w(scale) − w(catch) + w(disruptive)
  − w(simple) − w(control). Each point moved from scale to simple lowers the gap by 0.03, so the
  pair flips after about 12 points (scale 18 %, simple 22 %: B 3.75, E 3.74). Simplicity would
  then weigh almost as much as scale, against P-01's stated driver (Q-restatement-01); not
  plausible.
- **Combined pessimistic case (CR-1).** Weak evidence lets the tool clear less code (E scale 4),
  the risk model is weak (catch 3, already in the re-checked score) and automation bias weighs
  more (control 2). Under C001-DEC-003, clearing needs visible evidence, so weak evidence means
  less clearing. Plausibility: plausible. The 35 %-at-20 %-effort figure (C001-R-002 §B) and the
  ideation's high/high rating of weak evidence point to it. No note measures evidence quality on
  agent-written changes (C001-R-002 Confidence). B is not affected by evidence quality.

  | Case | Scales with change size and volume | Catches wrong, missing or unrequested behaviour | Spec-anchored with intent fallback | Departs from line-by-line review | Simple first increment | Reviewer stays in control with an auditable verdict | Weighted |
  |---|---|---|---|---|---|---|---|
  | Weights | 30 | 20 | 15 | 15 | 10 | 10 | 100 |
  | E — pessimistic evidence | 4 | 3 | 5 | 5 | 2 | 2 | 3.70 |
  | B — unchanged | 3 | 4 | 5 | 4 | 3 | 4 | 3.75 |
  | E — pessimistic evidence and weak mapping | 4 | 2 | 4 | 5 | 2 | 2 | 3.35 |
  | B — weak mapping | 3 | 3 | 4 | 4 | 3 | 4 | 3.40 |

  E is 0.05 below B: a near tie under the options-analysis rule, with B ahead. If the
  code-to-intent mapping is also unreliable, both lose 1 on catch and spec and the order holds
  (3.35 against 3.40).
- **Optimistic case.** Test-adequacy evidence on the changed lines (C001-R-002 candidate
  paradigm 8: surviving mutants, property counter-examples) or sampling with escalation
  (paradigm 15) would support E catch 4 again (4.30). Both are 10-spec selections, not decided
  here.
- **Second tier.** B (3.75) leads D (3.50) by 0.25 and C (3.30) by 0.45; the Presented set is
  unchanged.

### Outcome

- Recommendation unchanged: E (4.10). Presented set and order unchanged: E 4.10, B 3.75,
  D 3.50.
- Near tie: none in the re-checked totals (lead 0.35). The combined pessimistic case gives a near
  tie with B 0.05 ahead; the disclosure and tie-breaker are under Recommendation.
- The re-check does not put B ahead in the base case, so it raises no new decision for P-01 on
  its own. The tie-breaker depends on the increment path (intent map first, risk triage as a
  separable later layer), which C001-DEC-001 Consequences record.
