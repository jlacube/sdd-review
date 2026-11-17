---
id: "C001-DEC-001"
artifact: ideation/decision
change: "CHG-001"
phase: 00-ideation
status: draft
---
# DEC-001 — Review paradigm: intent map with risk triage, plus an architecture/design lens

## Context
Agent-generated changes grow in number and size faster than line-by-line review can follow
(Q-restatement-01; C001-R-002 §B). The primary reviewer is the developer accepting agent output
locally (Q-reviewer-01), with specs used when present and intent fallback otherwise
(Q-spec-anchor-01). The core way of reviewing was analysed in C001-OA-001.

## Decision
The assistant is built around an **intent map with risk triage**: the review unit is an intent
(a spec item when a spec exists, an extracted intent otherwise); inside each intent, low-risk
hunks are cleared with visible evidence (bounded by C001-DEC-003) and the developer signs per
intent. On top of it sits an **architecture/design lens** — impact on components, layers and
dependencies, drift from documented architecture, and design-quality findings — used to make the
review itself simpler and more robust (top-down from the architecture delta to intents to hunks),
not as a separate design-consulting feature (Q-arch-insight-01).

## Options considered
Analysis: C001-OA-001 (5 candidates). Presented: intent map + risk triage (4.30, recommended),
intent/spec-first review (3.75), evidence-based acceptance (3.50). Rejected: augmented guided diff
(2.55), risk triage alone (3.50). These are the scores P-01 saw. The re-check against the research
notes (C001-OA-001 §Re-check against research, 2026-11-17) gives E 4.10, B 3.75, D 3.50, C 3.30,
A 2.70, recommendation unchanged; in a plausible pessimistic case E (3.70) and B (3.75) are a near
tie, resolved by reversibility: the intent map ships first and triage is a separable layer (see
Consequences). Scope of the architecture lens: three candidates in
Q-arch-insight-01 (impact + design critique, impact only, design co-pilot).

## Consequences
- The analysis core needs at least three engines: intent mapping, risk triage with evidence, and
  architecture impact/drift analysis.
- A neutral intermediate form (intent items with linked hunks and evidence) must be fillable from
  an SDD workspace and from the intent fallback (C001-R-002 Implications); defined in 10-spec.
- Delivery follows C001-OA-001's mitigation and constitution principles 2 and 5: the intent map
  is built first, risk triage is added on top in a later increment.
- Steering the agent (design co-pilot) is not part of this decision.
- Bold departures from diff-centric review are preferred ("don't be shy to be disruptive").

## Decided
| Date | Decider | Words (verbatim) |
|---|---|---|
| 2026-11-17 | P-01 | Q-paradigm-01: "1 + architecture / design assistance-insight-integration" — Q-arch-insight-01: "1 but really in the sens of "how to simply and robustify how we conduct reviews". don't be shy to be disruptive" |
