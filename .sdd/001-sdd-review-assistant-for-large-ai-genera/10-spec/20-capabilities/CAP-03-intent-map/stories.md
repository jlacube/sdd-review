---
id: "C001-CAP-03"
artifact: spec/stories
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Intent map"
---
# C001-CAP-03 — Intent map: user stories

Scope: grouping the hunks of the change under intents taken from an SDD workspace or extracted
from the change's context, and surfacing orphan code and unmet intents (`ideation.md` §8 step 3,
C001-DEC-001, C001-DEC-006). Intents, hunks and evidence share one neutral intermediate form
(`ideation.md` §11; defined in `40-domain/` and `50-interfaces/` in a later step).

### C001-US-301 — Review hunks grouped under the spec items of an SDD workspace
- **As a** P-02 developer accepting agent output
- **I want** every hunk grouped under the requirement it implements when the repository has an
  SDD workspace, with the tasks and acceptance scenarios of that requirement used to link hunks to
  it
- **So that** I review the change as a list of specified outcomes, not as a list of files
- **Value / outcome:** spec conformance is visible (C001-SC-03)
- **Priority:** Must · **Size hint:** L · **Capability:** C001-CAP-03
- **Context & notes:** C001-DEC-006 names requirements, tasks and acceptance scenarios; the
  requirements of one SDD change are the intents (Q-intent-unit-01, C001-REQ-305). Formats read
  in the first version: Q-intent-sources-01 (C001-REQ-111). Without a model, mapping uses explicit
  links such as spec IDs in commit messages or task files (C001-CAP-08).
- **Requirements:** C001-REQ-301, C001-REQ-302, C001-REQ-303, C001-REQ-304, C001-REQ-305, C001-REQ-306, C001-REQ-308, C001-REQ-317, C001-REQ-318, C001-REQ-326, C001-REQ-327, C001-REQ-328
- **Traces to:** C001-GOAL-03, C001-GOAL-06, C001-DEC-001, C001-DEC-006, Q-intent-unit-01

### C001-US-302 — Review hunks grouped under intents extracted when no spec exists
- **As a** P-02 developer accepting agent output
- **I want** intents extracted from the commit messages, the pull-request text and the agent's
  plan or transcript when the repository has no SDD workspace, with every hunk grouped under one
  of them and each intent showing its source
- **So that** I get the same intent-level review without writing a spec first
- **Value / outcome:** C001-GOAL-06 holds on repositories without specs
- **Priority:** Must · **Size hint:** L · **Capability:** C001-CAP-03
- **Context & notes:** C001-DEC-006 fallback; [ASSUMPTION: C001-AS-04]. With a model, extraction
  and grouping improve (C001-DEC-004); without one, commit and task boundaries are the main signal
  (C001-R-003 §D). Comparing the agent's account with the diff answers C001-R-001 Gap 6.
- **Requirements:** C001-REQ-301, C001-REQ-306, C001-REQ-308, C001-REQ-313, C001-REQ-314, C001-REQ-315, C001-REQ-316, C001-REQ-317, C001-REQ-318, C001-REQ-327
- **Traces to:** C001-GOAL-06, C001-DEC-006

### C001-US-303 — See orphan code first
- **As a** P-02 developer accepting agent output
- **I want** the hunks that trace to no intent listed as orphan code before any intent
- **So that** scope creep, unrequested refactoring and unspecified behaviour get my attention
  first
- **Value / outcome:** "no more than was asked" becomes checkable (`ideation.md` §2)
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-03
- **Context & notes:** C001-R-002 paradigm 3, part of the core flow (`ideation.md` §8). Verdicts
  on orphan code: C001-US-704.
- **Requirements:** C001-REQ-301, C001-REQ-309, C001-REQ-310
- **Traces to:** C001-GOAL-03, `ideation.md` §8 step 3

### C001-US-304 — See unmet intents first
- **As a** P-02 developer accepting agent output
- **I want** the intents that no hunk implements listed as unmet intents at the top of the map
- **So that** I see what was asked but not done before I accept anything
- **Value / outcome:** "no less than was asked" becomes checkable (`ideation.md` §2)
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-03
- **Context & notes:** the set of intents comes from C001-US-301 or C001-US-302; only code inside
  the change counts as implementing an intent.
- **Requirements:** C001-REQ-311, C001-REQ-312
- **Traces to:** C001-GOAL-03, `ideation.md` §8 step 3

### C001-US-305 — See how confident each hunk-to-intent link is
- **As a** P-02 developer accepting agent output
- **I want** every link between a hunk and its intent to show its confidence and the reason for
  it, for example a spec ID in the commit message, a file named by a task, or a model judgement
- **So that** I know where the grouping may be wrong and where to look twice
- **Value / outcome:** a wrong mapping does not silently hide a defect
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-03
- **Context & notes:** `ideation.md` §9 (wrong mapping hides a defect; show mapping confidence);
  C001-R-002 Implications (show uncertainty).
- **Requirements:** C001-REQ-306, C001-REQ-307, C001-REQ-319
- **Traces to:** C001-GOAL-03, `ideation.md` §9

### C001-US-306 — Correct a wrong mapping
- **As a** P-02 developer accepting agent output
- **I want** to move a hunk to another intent or to orphan code
- **So that** the map, the shares and my verdicts reflect the change as I understand it
- **Value / outcome:** the developer, not the tool, has the last word on grouping
- **Priority:** Should · **Size hint:** S · **Capability:** C001-CAP-03
- **Context & notes:** the correction belongs to the snapshot (C001-US-104) and is kept in the
  review record (C001-US-705).
- **Requirements:** C001-REQ-320, C001-REQ-321
- **Traces to:** C001-GOAL-03, `ideation.md` §9

### C001-US-307 — Read an intent as an ordered walkthrough
- **As a** P-02 developer accepting agent output
- **I want** the hunks of an intent presented in one reading order (tests and scenarios first,
  then the riskiest code, cleared mechanical edits last, and definitions before their uses among
  hunks of equal risk), with a short account of what the intent changes
- **So that** I understand the intent without the bias of file order
- **Value / outcome:** fewer defects missed in hunks shown last (file-position bias, C001-R-002 §B)
- **Priority:** Should · **Size hint:** M · **Capability:** C001-CAP-03
- **Context & notes:** C001-R-002 paradigms 11 and 17, part of the core flow (`ideation.md` §8).
  A model-written account is marked as model output (C001-US-804). The reading order is the
  intent order of C001-REQ-502 (test-first reading, C001-US-501) and C001-REQ-403 (risk triage,
  C001-US-401).
- **Requirements:** C001-REQ-322, C001-REQ-323, C001-REQ-324, C001-REQ-325, C001-REQ-403, C001-REQ-502
- **Traces to:** C001-GOAL-08, C001-DEC-001
