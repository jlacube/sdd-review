---
id: "C001-DEC-003"
artifact: ideation/decision
change: "CHG-001"
phase: 00-ideation
status: draft
---
# DEC-003 — Clearing autonomy: collapse with evidence, human signs each intent

## Context
Risk triage (C001-DEC-001) needs a limit on what the tool may clear without the developer
reading it. Uniform review does not scale (C001-R-002 §B), but defects in unread code reach the
commit if the tool accepts on its own.

## Decision
Low-risk hunks are **collapsed but visible**, each with the evidence that cleared it (for example
tests, type checks, pure renames). Nothing is accepted without the developer's signature on the
intent that contains it.

## Options considered
Four candidates, inline analysis in Q-autonomy-01 (rationales only, not scored with weighted
criteria): collapse with evidence (recommended), rank
only and never clear, auto-accept with audit; rejected: human approval of every hunk (the
line-by-line review the change aims to replace).

## Consequences
- Every clearing carries an evidence record the UI can show and the developer can open.
- The verdict is per intent and belongs to the developer; the tool never commits or accepts on
  its own.

## Decided
| Date | Decider | Words (verbatim) |
|---|---|---|
| 2026-11-17 | P-01 | Collapse with evidence (Recommended) |
