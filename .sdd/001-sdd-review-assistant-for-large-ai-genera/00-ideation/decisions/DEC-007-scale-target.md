---
id: "C001-DEC-007"
artifact: ideation/decision
change: "CHG-001"
phase: 00-ideation
status: draft
---
# DEC-007 — Scale target of the first version: about 10,000 changed lines

## Context
Change size drives analysis time, cost and UI performance. P-01 expects sizes to keep growing
(Q-restatement-01); the first version needs a concrete target (Q-scale-01).

## Decision
The first version is designed to handle comfortably a change of **about 10,000 changed lines over
about 300 files** per review.

## Options considered
Two candidates in Q-scale-01 (inline, unscored): up to ~10k lines (recommended), up to ~50k lines.

## Consequences
- Performance NFRs in 10-spec are set against this size.
- Larger changes are a later extension (`ideation.md` §5 Later).

## Decided
| Date | Decider | Words (verbatim) |
|---|---|---|
| 2026-11-17 | P-01 | Up to ~10k lines (Recommended) |
