---
id: "C001-CAP-06"
artifact: spec/stories
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Review coverage, sampling and attention budget"
---
# C001-CAP-06 — Review coverage, sampling and attention budget: user stories

Scope: tracking what has been read, cleared and left open (C001-GOAL-02), spot-checking cleared
hunks with escalation (C001-R-002 paradigm 15) and fitting the review into a stated time budget
(paradigm 16); chosen in Q-extras-01.

### C001-US-601 — Mark hunks as read
- **As a** P-02 developer accepting agent output
- **I want** to mark a hunk, or all open hunks of an intent, as read
- **So that** my progress is tracked and counted in the read share
- **Value / outcome:** progress state per hunk, the basis of C001-US-602
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-06
- **Context & notes:** read marks belong to the snapshot (C001-US-104) and survive sessions
  (C001-US-906). Per-hunk progress precedents: C001-R-001 §B (Reviewable, tuicr).
- **Requirements:** C001-REQ-601
- **Traces to:** C001-GOAL-02

### C001-US-602 — See the read, cleared and open shares of the change
- **As a** P-02 developer accepting agent output
- **I want** the shares of changed lines that are read, cleared and still open shown for the whole
  change, for each intent and for each component
- **So that** I always know how much of the change has had human eyes and how much rests on
  evidence
- **Value / outcome:** the measure behind C001-SC-02
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-06
- **Context & notes:** target from Q-g2-target-01, recorded in C001-SC-02.
- **Requirements:** C001-REQ-602, C001-REQ-603, C001-REQ-605
- **Traces to:** C001-GOAL-02, C001-SC-02

### C001-US-603 — Inspect a random sample of cleared hunks
- **As a** P-02 developer accepting agent output
- **I want** a random sample of the cleared hunks put in my reading queue
- **So that** clearing is spot-checked instead of trusted in bulk
- **Value / outcome:** a stated confidence for the cleared part of the change
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-06
- **Context & notes:** paradigm 15; spot checking in C001-R-002 §B. Sample share: 10 % of each
  rule's cleared hunks, at least one (Q-sampling-01, C001-REQ-604); how sampled hunks count in the
  shares of C001-US-602: C001-REQ-605.
- **Requirements:** C001-REQ-604, C001-REQ-605, C001-REQ-614, C001-REQ-616
- **Traces to:** C001-GOAL-02, C001-GOAL-05, Q-extras-01, Q-sampling-01

### C001-US-604 — Escalate a clearing rule when a sampled hunk is defective
- **As a** P-02 developer accepting agent output
- **I want**, when I report a defect in a cleared hunk, whether it was sampled or I expanded or
  reopened it myself, every hunk of the change cleared by the same rule reopened for reading
- **So that** one confirmed failure of a clearing rule removes trust in that rule for this change
- **Value / outcome:** sampling has consequences, not only statistics
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-06
- **Context & notes:** paradigm 15 (escalation). The reopened hunks are listed with the defect
  that triggered them; the report is kept in the review record (C001-US-705). A defect I report
  in a hunk that no rule cleared is recorded and escalates nothing (C001-REQ-617).
- **Requirements:** C001-REQ-606, C001-REQ-607, C001-REQ-608, C001-REQ-609, C001-REQ-617, C001-REQ-706
- **Traces to:** C001-GOAL-05, Q-extras-01

### C001-US-605 — Plan the review within a time budget
- **As a** P-02 developer accepting agent output
- **I want** to state the time I have and get the open hunks ordered by risk per minute of reading,
  with what fits in the budget and what does not shown
- **So that** a limited session goes to the riskiest code first and the remainder is explicit
- **Value / outcome:** a bounded review instead of an unbounded skim
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-06
- **Context & notes:** paradigm 16; inspection rates of 300–500 lines per hour in C001-R-002 §B as
  a starting point. The reading rate used, and whether it adapts to the developer, are set in the
  requirements.
- **Requirements:** C001-REQ-610, C001-REQ-611, C001-REQ-612, C001-REQ-615
- **Traces to:** C001-GOAL-02, C001-GOAL-08, Q-extras-01

### C001-US-606 — See covered and uncovered risk
- **As a** P-02 developer accepting agent output
- **I want** a coverage statement of the review at any point: the risk covered by my reading, by
  evidence and by sampling, and the risk not covered
- **So that** "I skimmed it" becomes an explicit, bounded statement I can keep with my verdicts
- **Value / outcome:** review coverage is visible (C001-R-001 Gap 5)
- **Priority:** Should · **Size hint:** S · **Capability:** C001-CAP-06
- **Context & notes:** paradigm 16. The statement is stored with the verdicts (C001-US-705,
  C001-REQ-712).
- **Requirements:** C001-REQ-613, C001-REQ-614, C001-REQ-712
- **Traces to:** C001-GOAL-05, Q-extras-01
