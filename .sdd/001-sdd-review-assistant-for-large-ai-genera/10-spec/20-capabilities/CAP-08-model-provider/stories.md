---
id: "C001-CAP-08"
artifact: spec/stories
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Model provider and model-free mode"
---
# C001-CAP-08 — Model provider and model-free mode: user stories

Scope: the pluggable language-model provider, chosen per repository, and the deterministic mode
that works without any model (C001-DEC-004). Which features a model improves is listed in
`ideation.md` §8 (intent extraction, grouping, design critique).

### C001-US-801 — Review without any model configured
- **As a** P-02 developer accepting agent output
- **I want** the whole review flow (intake, architecture delta, intent map, triage, evidence,
  verdicts) to run with no language model configured, with every reduced result labelled as
  reduced
- **So that** I can review on any machine and any repository, with no code leaving it
- **Value / outcome:** C001-GOAL-06 and C001-GOAL-07 hold without a model
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-08
- **Context & notes:** C001-DEC-004 (deterministic analysis without a model; graceful
  degradation); C001-CON-05. What each capability does without a model is set in its
  requirements.
- **Requirements:** C001-REQ-801, C001-REQ-802, C001-REQ-803, C001-REQ-804, C001-REQ-819
- **Traces to:** C001-GOAL-06, C001-GOAL-07, C001-DEC-004

### C001-US-802 — Configure a local model provider for a repository
- **As a** P-03 repository maintainer
- **I want** to configure a model that runs on the local machine as the repository's provider
- **So that** intent extraction, grouping and design critique improve without code leaving the
  machine
- **Value / outcome:** model assistance with C001-CON-01 intact
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-08
- **Context & notes:** C001-DEC-004 (local allowed). Local runtimes are reached through the
  OpenAI-compatible chat API (Q-provider-01, C001-REQ-805). The provider interface is defined in
  `50-interfaces/` in a later step.
- **Requirements:** C001-REQ-805, C001-REQ-806
- **Traces to:** C001-GOAL-07, C001-DEC-004, Q-provider-01

### C001-US-803 — Opt a repository into a cloud model provider explicitly
- **As a** P-03 repository maintainer
- **I want** sending code to a cloud model to require an explicit setting for the repository, and
  every developer of the repository to see during a review that code is sent and to which
  provider
- **So that** no code leaves the machine by accident
- **Value / outcome:** C001-SC-07 holds by default; cloud use is a visible choice
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-08
- **Context & notes:** C001-DEC-004 Consequences; provider keys are never stored in the
  repository (C001-CON-07).
- **Requirements:** C001-REQ-805, C001-REQ-806, C001-REQ-807, C001-REQ-808, C001-REQ-809, C001-REQ-817, C001-REQ-819, C001-REQ-820
- **Traces to:** C001-GOAL-07, C001-DEC-004

### C001-US-804 — See which outputs came from a model and how certain they are
- **As a** P-02 developer accepting agent output
- **I want** every model-produced item (extracted intent, mapping, walkthrough account, design
  critique) marked as model output with its uncertainty
- **So that** I weigh it against deterministic signals and do not let it narrow my attention
- **Value / outcome:** model help without misplaced trust
- **Priority:** Should · **Size hint:** S · **Capability:** C001-CAP-08
- **Context & notes:** `ideation.md` §9 (LLM explanations may narrow attention; show uncertainty;
  deterministic signals first); C001-R-002 §B. Model output shares the confidence scale of the
  hunk-to-intent links (C001-US-305) at level low; it never clears a hunk (C001-REQ-412).
- **Requirements:** C001-REQ-810, C001-REQ-811, C001-REQ-812, C001-REQ-412, C001-REQ-911
- **Traces to:** C001-GOAL-03, `ideation.md` §9

### C001-US-805 — Exclude paths from what is sent to a model
- **As a** P-03 repository maintainer
- **I want** to list paths whose content is never sent to any model provider
- **So that** confidential files stay on the machine even when a cloud provider is configured
- **Value / outcome:** cloud use without exposing chosen files
- **Priority:** Should · **Size hint:** S · **Capability:** C001-CAP-08
- **Context & notes:** C001-CON-01. Excluded content is analysed in model-free mode only.
- **Requirements:** C001-REQ-804, C001-REQ-814, C001-REQ-815
- **Traces to:** C001-GOAL-07, C001-DEC-004

### C001-US-806 — Continue the review when the model provider fails
- **As a** P-02 developer accepting agent output
- **I want** the review to continue in model-free mode, with a notice, when the configured provider
  is unreachable, times out or returns output the tool cannot use
- **So that** a provider failure never blocks or corrupts my review
- **Value / outcome:** the review is as available as the model-free mode
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-08
- **Context & notes:** C001-DEC-004 (degrade gracefully); constitution principle 4 (error
  behaviour written down).
- **Requirements:** C001-REQ-804, C001-REQ-816, C001-REQ-817, C001-REQ-818
- **Traces to:** C001-GOAL-06, C001-DEC-004
