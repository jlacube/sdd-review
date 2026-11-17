---
id: "C001-CAP-04"
artifact: spec/stories
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Risk triage and guarded clearing"
---
# C001-CAP-04 — Risk triage and guarded clearing: user stories

Scope: scoring the hunks of each intent, clearing low-risk hunks with visible evidence under the
rules of Q-clearing-01, and keeping guarded areas open (`ideation.md` §8 step 4, C001-DEC-003).
Delivered as a layer on top of the intent map (C001-DEC-001 Consequences).

### C001-US-401 — See open hunks ranked by risk, with the signals behind each score
- **As a** P-02 developer accepting agent output
- **I want** every hunk to carry a risk score and the signals that produced it (sensitive area,
  size, novelty, test coverage, dependency change), with the open hunks of an intent ordered by
  risk
- **So that** my reading time goes where defects are most likely
- **Value / outcome:** effort follows risk, not file order
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-04
- **Context & notes:** C001-R-002 paradigm 5 without its auto-acceptance tier (`ideation.md` §8,
  C001-NG-03); risk-based ordering evidence in C001-R-002 §B. The signal set and its weights are
  set in the requirements. Inside an intent, risk order follows the test hunks (intent order,
  C001-REQ-502 and C001-REQ-403).
- **Requirements:** C001-REQ-401, C001-REQ-402, C001-REQ-403, C001-REQ-404, C001-REQ-405
- **Traces to:** C001-GOAL-02, C001-DEC-001

### C001-US-402 — Have mechanically proven hunks cleared with their proof
- **As a** P-02 developer accepting agent output
- **I want** hunks that are pure renames, moves, formatting changes or generated files collapsed,
  each with the deterministic proof that cleared it
- **So that** I do not read lines whose behaviour cannot have changed
- **Value / outcome:** mechanical volume stops counting against the open share (C001-SC-02)
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-04
- **Context & notes:** Q-clearing-01 (mechanical clearing); C001-DEC-003 (collapsed but visible).
  Syntax-aware comparison precedents: C001-R-001 §B (difftastic, SemanticDiff). Language
  coverage: `10-context/scope.md` §1. Guarded areas take precedence (C001-US-404).
- **Requirements:** C001-REQ-406, C001-REQ-407, C001-REQ-408, C001-REQ-409, C001-REQ-412, C001-REQ-418, C001-REQ-419, C001-REQ-420
- **Traces to:** C001-GOAL-02, C001-GOAL-05, C001-DEC-003, Q-clearing-01

### C001-US-403 — Have hunks exercised by passing tests cleared with the test evidence
- **As a** P-02 developer accepting agent output
- **I want** hunks whose changed lines are executed by passing tests collapsed, each with the
  tests and the test run that cleared it
- **So that** well-tested code does not consume my reading time
- **Value / outcome:** the main lever towards the C001-SC-02 open-share target
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-04
- **Context & notes:** Q-clearing-01; evidence from C001-US-502 [ASSUMPTION: C001-AS-02].
  Agent-written tests can be weak (`ideation.md` §9): evidence strength (C001-US-506) and
  surviving mutants (C001-US-504) can keep a hunk open. Guarded areas take precedence
  (C001-US-404).
- **Requirements:** C001-REQ-410, C001-REQ-411, C001-REQ-412, C001-REQ-418, C001-REQ-419, C001-REQ-420, C001-REQ-504
- **Traces to:** C001-GOAL-02, C001-GOAL-05, C001-DEC-003, Q-clearing-01

### C001-US-404 — Keep guarded areas open whatever the evidence
- **As a** P-02 developer accepting agent output
- **I want** hunks in guarded areas (security and authentication, data migrations, dependency,
  build and configuration files, public API changes) never cleared automatically, whatever their
  evidence
- **So that** the changes with the highest impact always get human eyes
- **Value / outcome:** a safety floor under C001-GOAL-02
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-04
- **Context & notes:** Q-clearing-01 (never-clear list); `ideation.md` §9 (never clear
  security-sensitive areas on test evidence alone). How each area is recognised is set in the
  requirements.
- **Requirements:** C001-REQ-413, C001-REQ-414, C001-REQ-415, C001-REQ-416, C001-REQ-417
- **Traces to:** C001-GOAL-05, C001-DEC-003, Q-clearing-01

### C001-US-405 — Adjust the clearing rules of a repository
- **As a** P-03 repository maintainer
- **I want** to adjust the clearing rules and add guarded areas in the repository's review
  configuration
- **So that** every developer of the repository gets the same clearing policy without setup
- **Value / outcome:** one shared, versioned policy per repository
- **Priority:** Should · **Size hint:** S · **Capability:** C001-CAP-04
- **Context & notes:** Q-clearing-01 ("rules adjustable per repository"). The configuration may
  add guarded areas and tune the other clearing rules; it never removes or narrows a built-in
  guarded area of C001-US-404 (Q-clearing-02, add-only). The configuration of the base commit
  judges a change, so a change cannot loosen its own clearing (Q-clearing-03, C001-REQ-426).
- **Requirements:** C001-REQ-409, C001-REQ-423, C001-REQ-424, C001-REQ-425, C001-REQ-426, C001-REQ-427
- **Traces to:** C001-DEC-003, Q-clearing-01, Q-clearing-02, Q-clearing-03

### C001-US-406 — Open any cleared hunk and inspect its evidence
- **As a** P-02 developer accepting agent output
- **I want** to expand any collapsed hunk, see the evidence that cleared it, and reopen it for
  reading
- **So that** clearing never hides code from me
- **Value / outcome:** every clearing stays checkable (C001-SC-05)
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-04
- **Context & notes:** C001-DEC-003 Consequences (evidence record the developer can open);
  `ideation.md` §9 (the developer can open any collapsed hunk).
- **Requirements:** C001-REQ-419, C001-REQ-420, C001-REQ-421, C001-REQ-422
- **Traces to:** C001-GOAL-05, C001-DEC-003
