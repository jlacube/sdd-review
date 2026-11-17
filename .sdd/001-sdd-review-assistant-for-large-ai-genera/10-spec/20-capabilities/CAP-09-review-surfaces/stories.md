---
id: "C001-CAP-09"
artifact: spec/stories
change: "CHG-001"
phase: 10-spec
status: draft
capability: "CLI and local review UI"
---
# C001-CAP-09 — CLI and local review UI: user stories

Scope: the two surfaces of the first version, the CLI of the analysis core and the standalone
local UI (C001-DEC-002), and what they share: starting, resuming and moving through a review. What
each view contains belongs to the capability that produces it (C001-CAP-01 to C001-CAP-08).

### C001-US-901 — Start a review from the CLI and open it in the local UI
- **As a** P-02 developer accepting agent output
- **I want** one CLI command that takes in the change, runs the analysis and opens the review in
  my browser
- **So that** a review starts in one step from where I ran the agent
- **Value / outcome:** no setup between the agent run and the review
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-09
- **Context & notes:** C001-DEC-002. Launchers from an IDE or from Claude Code are later changes
  (`ideation.md` §5 Later). The review opens on the architecture delta (C001-REQ-201, owned by
  C001-US-201).
- **Requirements:** C001-REQ-901, C001-REQ-902, C001-REQ-201
- **Traces to:** C001-GOAL-08, C001-DEC-002

### C001-US-902 — Keep the local UI reachable only from my machine
- **As a** P-02 developer accepting agent output
- **I want** the UI server to accept connections from my machine only
- **So that** the code under review is not exposed on the network
- **Value / outcome:** C001-CON-02 holds without configuration
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-09
- **Context & notes:** C001-DEC-002 Consequences; `ideation.md` §9 (local server exposed beyond
  the machine).
- **Requirements:** C001-REQ-905, C001-REQ-906, C001-REQ-907, C001-REQ-908
- **Traces to:** C001-GOAL-07, C001-DEC-002

### C001-US-903 — Read a hunk in its file context
- **As a** P-02 developer accepting agent output
- **I want** to read any hunk with its surrounding code, its intent, its risk signals and its
  evidence side by side, with moved code shown as moved
- **So that** I can judge a hunk without switching tools
- **Value / outcome:** one place for code, intent and evidence
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-09
- **Context & notes:** precedents: syntax-aware diffs (C001-R-001 §B, difftastic and
  SemanticDiff); panels for groups, diff and per-range context (C001-R-001 §A, Change Stack).
- **Requirements:** C001-REQ-904, C001-REQ-909, C001-REQ-910, C001-REQ-911
- **Traces to:** C001-GOAL-03, C001-GOAL-08

### C001-US-904 — Run the analysis headless and get machine-readable results
- **As a** P-02 developer accepting agent output
- **I want** a CLI mode that writes the architecture delta, the intent map, the triage, the
  evidence and the review record as machine-readable files without starting the UI
- **So that** I can script reviews, and later surfaces can be built on the core
- **Value / outcome:** the core is usable on its own (C001-CON-03)
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-09
- **Context & notes:** C001-DEC-002 (core usable on its own; later surfaces on top of the core).
  The file formats are defined in `50-interfaces/` in a later step.
- **Requirements:** C001-REQ-912, C001-REQ-913, C001-REQ-914
- **Traces to:** C001-GOAL-06, C001-DEC-002

### C001-US-905 — Record verdicts from the CLI
- **As a** P-02 developer accepting agent output
- **I want** to sign, reject or defer an intent from the CLI
- **So that** I can finish a review in the terminal when the UI is not at hand
- **Value / outcome:** the same verdicts from either surface
- **Priority:** Should · **Size hint:** S · **Capability:** C001-CAP-09
- **Context & notes:** the verdicts are those of C001-US-701 to C001-US-703, kept in the same
  record (C001-US-705).
- **Requirements:** C001-REQ-915, C001-REQ-916, C001-REQ-917
- **Traces to:** C001-GOAL-05, C001-DEC-002

### C001-US-906 — Resume a review across sessions
- **As a** P-02 developer accepting agent output
- **I want** to close a review and reopen it later where I left it (read marks, mapping
  corrections, sampling queue, verdicts) for the same snapshot
- **So that** a review of a large change can span several sittings
- **Value / outcome:** a review of several hours is practical (C001-GOAL-01)
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-09
- **Context & notes:** at the inspection rates of C001-R-002 §B, the open share allowed by
  C001-SC-02 on a 10,000-line change takes hours to read (Q-g2-target-01 rationale). When the
  working tree moved in between: C001-US-104.
- **Requirements:** C001-REQ-918, C001-REQ-919, C001-REQ-920
- **Traces to:** C001-GOAL-01, C001-GOAL-02

### C001-US-907 — Move through the review with the keyboard
- **As a** P-02 developer accepting agent output
- **I want** to move between components, intents and hunks, and to mark, open and decide them,
  with the keyboard alone
- **So that** a long review keeps a steady pace
- **Value / outcome:** less time lost on navigation
- **Priority:** Should · **Size hint:** S · **Capability:** C001-CAP-09
- **Context & notes:** keyboard navigation precedents in C001-R-001 §A (Change Stack) and §B
  (tuicr).
- **Requirements:** C001-REQ-904, C001-REQ-921, C001-REQ-922
- **Traces to:** C001-GOAL-08
