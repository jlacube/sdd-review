---
id: "C001-DEC-002"
artifact: ideation/decision
change: "CHG-001"
phase: 00-ideation
status: draft
---
# DEC-002 — Form factor: analysis core with CLI plus a standalone local UI

## Context
P-01 wants a new workflow and UI, not only an analysis helper (Q-restatement-01). The reviewer
works locally before commit or PR (Q-reviewer-01), and no surveyed tool offers local, grouped,
spec-aware review (C001-R-001 Gaps 1–2). The form factor was analysed in C001-OA-002.

## Decision
The first version is an **analysis core with a CLI** plus a **standalone local UI** served on the
developer's machine. The core is usable on its own; the UI is its first surface.

## Options considered
Analysis: C001-OA-002 (5 candidates). Presented: core + local UI (4.35, recommended), VS Code
extension (3.15). Rejected: analysis module only (3.50; kept as the first internal increment),
Claude Code plugin (2.75; possible later launcher), PR-platform app (2.30).

## Consequences
- Two components with an interface between them; the core must not depend on the UI.
- A local server must be secured (bind to localhost, no remote access by default).
- Other surfaces (IDE, Claude Code launcher, PR app) stay possible in later, separate changes on
  top of the core; they are out of scope for CHG-001 (`ideation.md` §5).

## Decided
| Date | Decider | Words (verbatim) |
|---|---|---|
| 2026-11-17 | P-01 | Core + local UI (Recommended) |
