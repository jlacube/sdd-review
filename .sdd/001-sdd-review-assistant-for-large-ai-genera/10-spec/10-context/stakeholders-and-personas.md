---
id: "C001-SPEC-CTX-02"
artifact: spec/context/personas
change: "CHG-001"
phase: 10-spec
status: draft
---
# Stakeholders and personas

Persona IDs are used in the stories of `20-capabilities/`. P-01 keeps the meaning it has in the
whole workspace (spec owner and gate approver); the primary persona of the product is P-02
(C001-DEC-005).

## P-01 — Spec owner
- **Role:** decides scope and priorities of CHG-001 and approves its gates (G1 to G3).
- **Goals:** a review workflow and UI that depart from file-by-file diff reading (Q-restatement-01,
  Q-arch-insight-01), bounded by the non-goals in `problem-and-goals.md` §4.
- **Frustrations:** agent changes grow faster than they can be read (`ideation.md` §2).
- **Constraints:** the constitution (`.sdd/_constitution/constitution.md`) and the decisions
  C001-DEC-001 to C001-DEC-007.
- **How the change serves them:** P-01 is not a story persona; the goals C001-GOAL-01 to
  C001-GOAL-08 and the success criteria in `problem-and-goals.md` are the measure P-01 approves.

## P-02 — Developer accepting agent output locally (primary persona)
- **Role:** ran a coding agent on their own repository and must accept, reject or defer its
  output on their machine, before commit or pull request (C001-DEC-005).
- **Goals:** know whether the change does what was asked, no more and no less, and what it does to
  the architecture, without reading every changed line (C001-GOAL-02 to C001-GOAL-05).
- **Frustrations:** skimming or rubber-stamping thousands of lines; reverse-engineering intent
  from a diff; agent review surfaces that work per edit, per turn or per file and do not group by
  intent (C001-R-001 §C, C001-R-003 §D); edits that agent checkpoints do not record
  (C001-R-001 §D).
- **Constraints:** works alone, on a local working tree or on agent commits not yet pushed
  (C001-DEC-005); may or may not have an SDD workspace (C001-DEC-006); may have no language model
  configured (C001-DEC-004); review time is limited (C001-R-002 §B inspection rates).
- **How the change serves them:** every capability in `20-capabilities/` except where a story
  names P-03.

## P-03 — Repository maintainer
- **Role:** owns the per-repository configuration the review reads: clearing rules and guarded
  areas (Q-clearing-01) and the model provider (C001-DEC-004). In a one-person repository P-03 and
  P-02 are the same person.
- **Goals:** safe defaults that every developer of the repository gets without setup; an explicit,
  visible choice before any code is sent to a cloud model (C001-GOAL-07).
- **Frustrations:** tools that send code off the machine by default; clearing rules that each
  developer must recreate.
- **Constraints:** C001-CON-01, C001-CON-07 (see `scope.md` §4).
- **How the change serves them:** stories C001-US-405, C001-US-802, C001-US-803 and C001-US-805.

## Stakeholder map
| Stakeholder | Interest | Influence | Engagement |
|---|---|---|---|
| P-01 spec owner | Disruptive, measurable review workflow (C001-GOAL-08) | High: approves every gate | Answers questions rounds; approves G2 |
| P-02 developer accepting agent output | Review effort independent of change size; accountable verdicts | High: primary user | Participants in the C001-SC-08 comparison |
| P-03 repository maintainer | Safe per-repository defaults; control over cloud use | Medium | Through the configuration stories of CAP-04 and CAP-08 |
| Coding agents (Claude Code, Cursor, Aider and others) | None (they are sources, not users) | Low: their output format and commit habits shape intake (C001-R-001 §C, C001-R-003) | Read-only inputs: commits, plans, transcripts |
| Pull-request reviewers and tech leads | Served in a later change (C001-DEC-005, `ideation.md` §5 Later) | Low in this change | None in CHG-001 |
| SDD workspace authors (spec writers of the reviewed repository) | Their requirements, tasks and acceptance scenarios become intents (C001-DEC-006) | Medium: spec quality bounds mapping quality | None; the tool reads their workspace |
| sdd-test-designer | Comparison protocol for C001-SC-08 (`ideation.md` §11) | Medium | Writes the protocol in later steps |
