---
id: "C001-CAP-05"
artifact: spec/stories
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Test-first reading and executable evidence"
---
# C001-CAP-05 — Test-first reading and executable evidence: user stories

Scope: the evidence that clearing and verdicts rest on, produced or re-run by the tool itself:
test-first reading (C001-R-002 paradigm 6), executable evidence bundle (paradigm 7), mutation and
property evidence on changed lines (paradigm 8); chosen in Q-extras-01. The tool runs the
project's own tests and writes none (C001-NG-01).

### C001-US-501 — Read an intent's tests and acceptance scenarios before its implementation
- **As a** P-02 developer accepting agent output
- **I want** the changed tests and acceptance scenarios of an intent shown before its
  implementation hunks, and to record whether they express the intent
- **So that** I judge the contract first and let the machine check the code against it
- **Value / outcome:** the tests that clear hunks have themselves been reviewed
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-05
- **Context & notes:** paradigm 6; test-driven review experiment in C001-R-002 §B (same share of
  production defects found, more test defects found). Q-clearing-05 (judge first): the changed
  tests of an intent clear code (C001-US-403) only after I have judged that they express the
  intent (C001-REQ-504). Tests first is the first key of the intent order (C001-REQ-502),
  followed by risk order (C001-REQ-403).
- **Requirements:** C001-REQ-411, C001-REQ-501, C001-REQ-502, C001-REQ-503, C001-REQ-504, C001-REQ-520
- **Traces to:** C001-GOAL-02, C001-GOAL-05, Q-extras-01, Q-clearing-05

### C001-US-502 — Run the project's tests on the snapshot and record what they execute
- **As a** P-02 developer accepting agent output
- **I want** the tool to run the project's test command on the snapshot and record, for each
  hunk, the passing and failing tests that execute its changed lines
- **So that** test evidence is produced by the tool on the code I review, not claimed by the agent
- **Value / outcome:** the evidence behind C001-US-403
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-05
- **Context & notes:** [ASSUMPTION: C001-AS-02]; when the tests cannot run, evidence falls back to
  static signals (`ideation.md` §10). Tool-executed rather than agent-reported evidence:
  C001-R-002 §B (agentic manual testing). Language coverage: `10-context/scope.md` §1. The runs
  never touch my working tree, and my edits during a run do not void it (C001-REQ-521,
  C001-REQ-522).
- **Requirements:** C001-REQ-505, C001-REQ-506, C001-REQ-507, C001-REQ-508, C001-REQ-509, C001-REQ-521, C001-REQ-522, C001-REQ-523, C001-REQ-524
- **Traces to:** C001-GOAL-02, C001-GOAL-05, Q-clearing-01

### C001-US-503 — Attach an executable evidence bundle to an intent and re-run it
- **As a** P-02 developer accepting agent output
- **I want** each intent to carry a bundle of commands, taken from the agent's recorded runs, the
  acceptance scenarios or my own input, that the tool runs itself while recording the real
  outputs, and to re-run the bundle on demand with the differences from the previous run shown
- **So that** I accept on re-runnable proof instead of trusting a summary
- **Value / outcome:** acceptance by re-running evidence and inspecting a sample (paradigm 7)
- **Priority:** Must · **Size hint:** L · **Capability:** C001-CAP-05
- **Context & notes:** paradigm 7; the tool runs the commands so that the agent cannot write the
  expected output (C001-R-002 §B). Commands run on the local machine only (C001-CON-01). Commands
  proposed from the agent's records run only after my confirmation (C001-REQ-511).
- **Requirements:** C001-REQ-509, C001-REQ-510, C001-REQ-511, C001-REQ-512, C001-REQ-513, C001-REQ-521, C001-REQ-522, C001-REQ-523, C001-REQ-524
- **Traces to:** C001-GOAL-05, Q-extras-01

### C001-US-504 — See surviving mutants on changed lines
- **As a** P-02 developer accepting agent output
- **I want** mutation testing run on the changed lines that tests execute, and the mutants that
  survive shown next to their hunk
- **So that** I learn whether the tests would notice a wrong change before I trust "all tests
  pass"
- **Value / outcome:** weak agent-written tests are exposed (`ideation.md` §9)
- **Priority:** Must · **Size hint:** L · **Capability:** C001-CAP-05
- **Context & notes:** paradigm 8; mutants limited to changed, covered lines as in C001-R-002 §B
  (mutation testing at Google). [ASSUMPTION: C001-AS-06]. Whether a surviving mutant keeps its
  hunk open (C001-US-403) is set in the requirements. Language coverage:
  `10-context/scope.md` §1.
- **Requirements:** C001-REQ-410, C001-REQ-411, C001-REQ-514, C001-REQ-515, C001-REQ-516, C001-REQ-521, C001-REQ-522, C001-REQ-523, C001-REQ-524
- **Traces to:** C001-GOAL-02, C001-GOAL-05, Q-extras-01

### C001-US-505 — See property-test counter-examples next to the hunk
- **As a** P-02 developer accepting agent output
- **I want** the failing property-based tests of the project, with their shrunk counter-examples,
  shown next to the hunks they execute
- **So that** a concrete failing input is in front of me where the code is
- **Value / outcome:** property evidence joins the hunk instead of a separate test report
- **Priority:** Could · **Size hint:** S · **Capability:** C001-CAP-05
- **Context & notes:** paradigm 8; property tests with shrinking in C001-R-002 §A (Kiro). Only
  the project's existing property tests are used.
- **Requirements:** C001-REQ-517
- **Traces to:** C001-GOAL-05, Q-extras-01

### C001-US-506 — See the strength of each evidence item
- **As a** P-02 developer accepting agent output
- **I want** every evidence item to show a strength rank (for example deterministic proof above
  tool-run tests with mutation results, above tool-run tests alone, above agent-reported runs)
  wherever the evidence is shown
- **So that** I know how much trust each clearing deserves
- **Value / outcome:** weak evidence is visible as weak (`ideation.md` §9)
- **Priority:** Should · **Size hint:** S · **Capability:** C001-CAP-05
- **Context & notes:** `ideation.md` §9 (rank evidence strength); C001-R-002 Implications
  (evidence signals differ in cost and in trust). The ranks are set in the requirements.
- **Requirements:** C001-REQ-518, C001-REQ-519
- **Traces to:** C001-GOAL-05, `ideation.md` §9
