---
id: "C001-DEC-006"
artifact: ideation/decision
change: "CHG-001"
phase: 00-ideation
status: draft
---
# DEC-006 — Spec anchoring: use specs when present, intent fallback otherwise

## Context
The review can depend on an SDD workspace, ignore specs, or use them opportunistically
(Q-spec-anchor-01). The SDD tools surveyed each use their own spec format (C001-R-002 §A), so a
tool that required one workspace format would not cover sessions run without it.

## Decision
The assistant **uses SDD artifacts (requirements, tasks, acceptance scenarios) when they exist**
and **falls back to intent extracted from commits, PR text or agent transcripts** otherwise.

## Options considered
Three candidates in Q-spec-anchor-01 (inline, unscored): specs when present (recommended), SDD
specs required, spec-agnostic.

## Consequences
- A neutral intermediate form must be fillable from both sources (open question in
  `ideation.md` §11).
- Mapping quality in no-spec mode is an assumption to test (`ideation.md` §10).

## Decided
| Date | Decider | Words (verbatim) |
|---|---|---|
| 2026-11-17 | P-01 | Specs when present (Recommended) |
