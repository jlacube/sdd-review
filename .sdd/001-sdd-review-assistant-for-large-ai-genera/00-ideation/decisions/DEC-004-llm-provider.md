---
id: "C001-DEC-004"
artifact: ideation/decision
change: "CHG-001"
phase: 00-ideation
status: draft
---
# DEC-004 — Language model: pluggable provider, local allowed, deterministic analysis without a model

## Context
Intent extraction, mapping and design critique benefit from a language model, but code may leave
the developer's machine and the tool is local-first (C001-DEC-002).

## Decision
The analysis uses a **pluggable provider interface** that supports a local model or a cloud API
chosen per repository. Deterministic analysis (git, syntax trees, tests) works without any model.

## Options considered
Four candidates, inline analysis in Q-llm-01 (rationales only, not scored with weighted
criteria): pluggable with local allowed (recommended), Claude
API only, reuse the coding agent's session; rejected: a cloud model with code sent by default.

## Consequences
- No hard dependency on one vendor; provider choice is per-repository configuration.
- Features must degrade gracefully when no model is configured.
- Sending code to a cloud provider is an explicit per-repository choice.

## Decided
| Date | Decider | Words (verbatim) |
|---|---|---|
| 2026-11-17 | P-01 | Pluggable, local allowed (Recommended) |
