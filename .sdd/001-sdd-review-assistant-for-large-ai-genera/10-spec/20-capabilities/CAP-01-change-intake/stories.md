---
id: "C001-CAP-01"
artifact: spec/stories
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Change intake"
---
# C001-CAP-01 — Change intake: user stories

Scope: taking an agent change in as one reviewable snapshot and collecting the context that says
what it was meant to do (`ideation.md` §8 step 1).

### C001-US-101 — Start a review of the working tree against a base commit
- **As a** P-02 developer accepting agent output
- **I want** to start a review of every difference between my working tree and a base commit I
  name, including new, deleted, renamed and untracked files
- **So that** the review covers the whole agent change, also edits that no agent checkpoint
  recorded
- **Value / outcome:** one complete review unit per agent change, whatever agent produced it
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-01
- **Context & notes:** checkpoint holes in agent tools: C001-R-001 §D, C001-R-003 Implications 6.
  A git repository is the unit of review [ASSUMPTION: C001-AS-03]. The base used when none is
  named: C001-REQ-103, C001-REQ-104 (Q-intake-01). Files under a clean filter, Git LFS files
  included: C001-REQ-126 to C001-REQ-128 (Q-cleanfilter-01, Q-cleanfilter-02).
- **Out of scope:** other version-control systems; remote pull requests (C001-NG-02).
- **Requirements:** C001-REQ-101, C001-REQ-102, C001-REQ-103, C001-REQ-104, C001-REQ-105, C001-REQ-106, C001-REQ-107, C001-REQ-108, C001-REQ-114, C001-REQ-125, C001-REQ-126, C001-REQ-127, C001-REQ-128
- **Traces to:** C001-GOAL-01, C001-DEC-005, `ideation.md` §5, Q-cleanfilter-02

### C001-US-102 — Include agent commits that are not yet pushed
- **As a** P-02 developer accepting agent output
- **I want** the review to include the commits the agent made since the base commit, together
  with the uncommitted edits
- **So that** agents that commit their own work are reviewed the same way as agents that leave
  edits in the working tree
- **Value / outcome:** the same review whatever the agent's commit habits
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-01
- **Context & notes:** agents that commit per turn or per task: C001-R-003 §B, §A (Kanban). Commit
  boundaries are kept as an intent signal for C001-CAP-03 (C001-R-003 §D). An agent that commits
  on a new local branch has no upstream branch until the first push; its commits stay in the
  default review (Q-intake-01).
- **Requirements:** C001-REQ-103, C001-REQ-104, C001-REQ-109, C001-REQ-110
- **Traces to:** C001-DEC-005 Consequences, C001-GOAL-01, Q-intake-01

### C001-US-103 — Gather the intent context of the change
- **As a** P-02 developer accepting agent output
- **I want** the intake to collect what states the purpose of the change: the SDD workspace when
  the repository has one, the commit messages, the pull-request text, and the agent's plan or
  transcript when I point to them
- **So that** the intent map is built from what was asked, not only from the code
- **Value / outcome:** intent sources reach C001-CAP-03 without manual copying
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-01
- **Context & notes:** C001-DEC-006; agent plan files (C001-R-003 Implications 2) and provenance
  records (C001-R-002 §B, Entire and Agent Trace) are candidate sources. Formats read in the first
  version: Q-intent-sources-01 (C001-REQ-111, C001-REQ-112).
- **Requirements:** C001-REQ-109, C001-REQ-111, C001-REQ-112, C001-REQ-113, C001-REQ-114, C001-REQ-123, C001-REQ-124
- **Traces to:** C001-GOAL-03, C001-GOAL-06, C001-DEC-006, `ideation.md` §8 step 1, Q-intent-sources-01

### C001-US-104 — Anchor the review to a snapshot
- **As a** P-02 developer accepting agent output
- **I want** the change frozen as an identified snapshot when the review starts, and to be told
  when the working tree or the branch moves on after that
- **So that** the map, the clearings and my verdicts always refer to the code I reviewed
- **Value / outcome:** no verdict on code that changed underneath it
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-01
- **Context & notes:** `ideation.md` §9 (non-deterministic grouping; anchor review state to a
  snapshot); staleness flag precedent in C001-R-001 Implications. Stale verdicts: C001-US-706.
- **Out of scope:** re-presenting only what changed in a newer snapshot (incremental re-review,
  C001-R-002 paradigm 20; `ideation.md` §5 Later).
- **Requirements:** C001-REQ-115, C001-REQ-116, C001-REQ-117, C001-REQ-118, C001-REQ-119, C001-REQ-120
- **Traces to:** C001-GOAL-05, `ideation.md` §9

### C001-US-105 — Be warned when a change exceeds the supported size
- **As a** P-02 developer accepting agent output
- **I want** to be told at intake when the change is larger than the size the first version is
  designed for
- **So that** I know, before I invest time, that results and response times may fall outside the
  stated limits
- **Value / outcome:** stated limits instead of silent degradation
- **Priority:** Should · **Size hint:** S · **Capability:** C001-CAP-01
- **Context & notes:** C001-DEC-007, C001-NG-05, C001-CON-06. Whether intake continues or stops
  above the size is set in the requirements.
- **Requirements:** C001-REQ-114, C001-REQ-121, C001-REQ-122
- **Traces to:** C001-GOAL-01, C001-DEC-007
