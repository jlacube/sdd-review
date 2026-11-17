---
id: "C001-DEC-005"
artifact: ideation/decision
change: "CHG-001"
phase: 00-ideation
status: draft
---
# DEC-005 — Primary reviewer: the developer accepting agent output locally

## Context
Several reviewers could be served first: the developer who ran the agent, a pull-request reviewer
or tech lead, or a spec owner. The choice decides the integration point and the moment of review
(Q-reviewer-01).

## Decision
The first reviewer served is the **developer who ran the agent and must accept its changes
locally**, before commit or pull request.

## Options considered
Three candidates in Q-reviewer-01 (inline, unscored): developer reviewing agent output
(recommended), PR reviewer / tech lead, spec owner.

## Consequences
- Review happens on the local working tree before commit; this drives C001-DEC-002 (local UI).
- Team review on hosting platforms is out of scope for this change.

## Decided
| Date | Decider | Words (verbatim) |
|---|---|---|
| 2026-11-17 | P-01 | Dev reviewing agent output (Recommended) |
