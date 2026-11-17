---
id: "C001-CAP-02"
artifact: spec/stories
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Architecture delta"
---
# C001-CAP-02 — Architecture delta: user stories

Scope: what the change does to components, layers and dependencies, drift from the documented
architecture and design-quality findings; the view the review opens on (`ideation.md` §8 step 2,
C001-DEC-001).

### C001-US-201 — Open the review on the architecture delta
- **As a** P-02 developer accepting agent output
- **I want** the review to open on a view of the components and layers the change touches, with
  the amount of change in each
- **So that** I see where the change lands and how large each area is before I read any intent
- **Value / outcome:** a top-down start that tells me where to look first
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-02
- **Context & notes:** C001-DEC-001 (top-down order: architecture delta, then intents, then
  hunks). Language coverage: `10-context/scope.md` §1.
- **Requirements:** C001-REQ-201, C001-REQ-202, C001-REQ-203, C001-REQ-212
- **Traces to:** C001-GOAL-04, C001-GOAL-08, C001-DEC-001

### C001-US-202 — See the dependency changes the change introduces
- **As a** P-02 developer accepting agent output
- **I want** to see the dependencies added, removed or changed between components and on external
  packages, with new couplings highlighted
- **So that** structural consequences that no single hunk shows are visible
- **Value / outcome:** effects spread over many files become one finding (delocalized defects,
  C001-R-002 §B)
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-02
- **Context & notes:** `ideation.md` §8 step 2 ("new couplings"). Dependency and build changes are
  a guarded area for clearing (Q-clearing-01, C001-US-404).
- **Requirements:** C001-REQ-204, C001-REQ-205, C001-REQ-206, C001-REQ-224
- **Traces to:** C001-GOAL-04, C001-DEC-001

### C001-US-203 — See drift from the documented architecture
- **As a** P-02 developer accepting agent output
- **I want** the change compared with the documented architecture of the repository (its
  components, allowed layers and allowed dependencies) and every departure flagged
- **So that** architecture erosion introduced by the agent is caught at review time
- **Value / outcome:** the architecture stays as designed
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-02
- **Context & notes:** the architecture artefacts of an SDD workspace are one documented source
  (C001-DEC-006); formats read in the first version: Q-intent-sources-01 (C001-REQ-207). Without
  a documented architecture, C001-US-206 applies.
- **Requirements:** C001-REQ-207, C001-REQ-208, C001-REQ-209, C001-REQ-222, C001-REQ-223
- **Traces to:** C001-GOAL-04, C001-DEC-001, Q-intent-sources-01

### C001-US-204 — See design-quality findings on the change
- **As a** P-02 developer accepting agent output
- **I want** design-quality findings on the changed code, such as new dependency cycles, layer
  bypasses or duplicated logic, listed in the architecture view and kept open
- **So that** design problems are reviewed like defects and never cleared on mechanical or test
  evidence
- **Value / outcome:** the architecture lens makes the review more robust (Q-arch-insight-01)
- **Priority:** Should · **Size hint:** M · **Capability:** C001-CAP-02
- **Context & notes:** deterministic findings always; a configured model adds design critique
  (C001-DEC-004, C001-CAP-08). Findings stay open (`ideation.md` §8 step 4).
- **Out of scope:** proposing or applying fixes (C001-NG-01).
- **Requirements:** C001-REQ-213, C001-REQ-214, C001-REQ-215, C001-REQ-216, C001-REQ-217, C001-REQ-218, C001-REQ-219
- **Traces to:** C001-GOAL-04, C001-DEC-001, Q-arch-insight-01

### C001-US-205 — Reach intents and open hunks from a component
- **As a** P-02 developer accepting agent output
- **I want** to open, from any component in the architecture view, the intents and the open hunks
  that touch it
- **So that** I move from the structure to the code without searching
- **Value / outcome:** every intent and open hunk is one step away from its place in the
  architecture (C001-SC-04)
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-02
- **Context & notes:** intents come from C001-CAP-03; open hunks from C001-CAP-04.
- **Requirements:** C001-REQ-202, C001-REQ-220, C001-REQ-221
- **Traces to:** C001-GOAL-04

### C001-US-206 — Get an architecture delta without a documented architecture
- **As a** P-02 developer accepting agent output
- **I want** a component view derived from the repository's structure (modules, packages,
  directories and the imports between them) when no architecture is documented
- **So that** the architecture-first review works on any repository
- **Value / outcome:** C001-US-201 and C001-US-202 hold on repositories with no architecture
  documents
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-02
- **Context & notes:** [ASSUMPTION: C001-AS-05]. Drift (C001-US-203) needs a documented baseline;
  the view states that drift was not checked. Language coverage: `10-context/scope.md` §1.
- **Requirements:** C001-REQ-210, C001-REQ-211, C001-REQ-212, C001-REQ-223
- **Traces to:** C001-GOAL-04, C001-GOAL-06
