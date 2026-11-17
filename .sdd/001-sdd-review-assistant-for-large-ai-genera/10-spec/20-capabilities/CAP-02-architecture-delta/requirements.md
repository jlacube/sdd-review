---
id: "C001-CAP-02"
artifact: spec/requirements
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Architecture delta"
---
# C001-CAP-02 — Requirements

Greenfield change: no requirement carries a Delta (`10-context/current-state.md`). Terms:
`40-domain/glossary-delta.md`. Language-specific signals cover the deep ecosystems of
`10-context/scope.md` §1 (Q-languages-01); other files get the language-agnostic core.

## 1. The view and the amount of change

### C001-REQ-201 — Open the review on the architecture delta
- **Pattern:** event-driven
- **Statement:** WHEN the static analysis of a snapshot completes or the developer reopens a review of a snapshot, THE review UI SHALL show the architecture delta of that snapshot as the first view of the review.
- **Rationale:** top-down order, architecture delta then intents then hunks (`ideation.md` §8 step 2, C001-DEC-001, C001-SC-04). The trigger on static analysis means the view does not wait for model output (C001-NFR-001, C001-NFR-002). The single requirement for both the start of a review from the CLI (C001-US-901) and the view itself (C001-US-201).
- **Stories:** C001-US-201, C001-US-901
- **Priority:** Must
- **Acceptance:** C001-AC-201.1

### C001-REQ-202 — Place every changed file in one component
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL assign every changed file of the snapshot to exactly one component of the architecture delta.
- **Rationale:** every hunk, and so every intent with code, is reachable from a component (C001-SC-04, C001-US-205).
- **Stories:** C001-US-201, C001-US-205
- **Priority:** Must
- **Acceptance:** C001-AC-202.1

### C001-REQ-203 — Show the amount of change in each component
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL include in the architecture delta, for each component the change touches, its counts of changed files, changed lines and hunks, and its layer when the documented architecture defines layers.
- **Rationale:** the developer sees where the change lands and how large each area is (C001-US-201, `ideation.md` §8 step 2).
- **Stories:** C001-US-201
- **Priority:** Must
- **Acceptance:** C001-AC-203.1

## 2. Dependencies

### C001-REQ-204 — List the dependencies between components that the change adds or removes
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL include in the architecture delta every dependency between components that the change adds or removes, each added one marked as a new coupling, with the hunks that add or remove it.
- **Rationale:** structural effects spread over many files become one finding (delocalized defects, C001-R-002 §B); dependencies come from the import and reference statements of the deep ecosystems.
- **Stories:** C001-US-202
- **Priority:** Must
- **Acceptance:** C001-AC-204.1

### C001-REQ-205 — List the external packages the change adds, removes or re-versions
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL include in the architecture delta every external package that the change adds, removes or gives another version in a package manifest of the deep ecosystems (`package.json`; `pyproject.toml` and `requirements*.txt`; `*.csproj` and `Directory.Packages.props`), with the hunk that makes the change.
- **Rationale:** dependency changes are a guarded area for clearing (Q-clearing-01, C001-US-404) and part of the delta (`ideation.md` §8 step 2); manifests of the ecosystems chosen in Q-languages-01.
- **Stories:** C001-US-202
- **Priority:** Must
- **Acceptance:** C001-AC-205.1

### C001-REQ-206 — Mark new couplings in the view
- **Pattern:** ubiquitous
- **Statement:** THE review UI SHALL show each new coupling in the architecture delta with a "new coupling" label that dependencies present at the base commit do not carry.
- **Rationale:** new couplings highlighted (C001-US-202; `ideation.md` §8 step 2).
- **Stories:** C001-US-202
- **Priority:** Must
- **Acceptance:** C001-AC-206.1

### C001-REQ-224 — Label the package changes of an unparsable manifest
- **Pattern:** unwanted-behaviour
- **Statement:** IF a package manifest of C001-REQ-205 that the change edits cannot be parsed at the base commit or in the snapshot, THEN THE analysis core SHALL label the external package changes of that manifest as not analysed, naming the manifest and the parse error, as a reduced result.
- **Rationale:** without both versions of the manifest there is no package list to compare; the label keeps the gap visible (C001-CON-05, constitution principle 4). The manifest's hunks stay open in the dependency, build and configuration guarded area in any case (C001-REQ-416, C001-REQ-413).
- **Stories:** C001-US-202
- **Priority:** Must
- **Acceptance:** C001-AC-224.1

## 3. Documented architecture and drift

### C001-REQ-207 — Take components from the documented architecture
- **Pattern:** optional-feature
- **Statement:** WHERE a source of the documented-architecture source order holds an architecture in the snapshot, THE analysis core SHALL take the components, layers and allowed dependencies of the architecture delta from the first source in that order that holds one.
- **Rationale:** the architecture artefacts of an SDD workspace are one documented source (C001-DEC-006, C001-US-203 notes); formats read in the first version: Q-intent-sources-01. The sources and their order are set in C001-IF-007 §4 item 1 (glossary: documented-architecture source order); an architecture held in a place that the order does not name, for example in an SDD change other than the selected one, is not read, and C001-REQ-211 then says so. Q-drift-01 (snapshot's, edits flagged): reading the snapshot lets a spec-driven change add a component, and C001-REQ-222 flags every edit of the documented architecture, so a change cannot silently allow its own dependency. An architecture without component paths: C001-REQ-223; a damaged `.sdd/` entry: C001-REQ-123; an invalid neutral file: C001-REQ-124.
- **Stories:** C001-US-203
- **Priority:** Must
- **Acceptance:** C001-AC-207.1
- **Open items:** where the architecture is held: C001-IF-007 §4; neutral file format: C001-IF-006.

### C001-REQ-208 — Flag disallowed dependencies as drift
- **Pattern:** optional-feature
- **Statement:** WHERE the repository has a documented architecture, THE analysis core SHALL flag as drift each dependency the change adds that the documented architecture does not allow.
- **Rationale:** architecture erosion introduced by the agent is caught at review time (C001-US-203, C001-GOAL-04).
- **Stories:** C001-US-203
- **Priority:** Must
- **Acceptance:** C001-AC-208.1

### C001-REQ-209 — Flag changed files outside the documented components as drift
- **Pattern:** optional-feature
- **Statement:** WHERE the repository has a documented architecture, THE analysis core SHALL flag as drift each changed file that lies outside every documented component and assign it to a component named "Undocumented".
- **Rationale:** every departure from the documented architecture is flagged (C001-US-203), and the file stays reachable from a component (C001-REQ-202).
- **Stories:** C001-US-203
- **Priority:** Must
- **Acceptance:** C001-AC-209.1

### C001-REQ-222 — Flag edits of the documented architecture as drift
- **Pattern:** event-driven
- **Statement:** WHEN a hunk of the change adds a line from which the snapshot's documented architecture is read, or deletes a line from which the base commit's documented architecture is read, THE analysis core SHALL flag that hunk as drift of the kind architecture edit.
- **Rationale:** Q-drift-01 (snapshot's, edits flagged): C001-REQ-207 keeps reading the snapshot so that spec-driven changes that add a component work, and this flag makes every edit visible, so a change cannot silently allow its own dependency (C001-REQ-208) or move files into a component (C001-REQ-209). The base-commit side covers a change that deletes the documented architecture; the view then also states that drift was not checked (C001-REQ-211), and the architecture-edit drift names the hunks that removed it. Lines read: C001-IF-007 §4.
- **Stories:** C001-US-203
- **Priority:** Must
- **Acceptance:** C001-AC-222.1

### C001-REQ-223 — Report a documented architecture without component paths
- **Pattern:** unwanted-behaviour
- **Statement:** IF the architecture that the snapshot holds in the `.sdd/` format or in a neutral intent-and-architecture file gives a path pattern for none of its components, THEN THE analysis core SHALL report a notice that names the file holding that architecture and states that the components are derived from the repository's structure instead.
- **Rationale:** components without paths cannot place any file, so such an architecture is not a documented architecture (glossary) and C001-REQ-210 and C001-REQ-211 apply; the notice tells the maintainer why the architecture was not used (constitution principle 4). Reading rules: C001-IF-007 §4. Notice ERR-SDD-004 (`50-interfaces/errors.md`).
- **Stories:** C001-US-203, C001-US-206
- **Priority:** Must
- **Acceptance:** C001-AC-223.1

## 4. Without a documented architecture

### C001-REQ-210 — Derive components without a documented architecture
- **Pattern:** optional-feature
- **Statement:** WHERE the repository has no documented architecture, THE analysis core SHALL derive the components of the architecture delta from the repository's directory, package, module and project structure, with the dependencies between them taken from the import and reference statements of the deep ecosystems.
- **Rationale:** the architecture-first review works on any repository [ASSUMPTION: C001-AS-05].
- **Stories:** C001-US-206
- **Priority:** Must
- **Acceptance:** C001-AC-210.1

### C001-REQ-211 — State that drift was not checked
- **Pattern:** optional-feature
- **Statement:** WHERE the repository has no documented architecture, THE review UI SHALL state on the architecture delta view that drift was not checked because no documented architecture was found in the sources that the review reads it from.
- **Rationale:** drift needs a documented baseline (C001-US-206 notes); explicit limits (constitution principle 4). The message is limited to the sources read (documented-architecture source order, C001-REQ-207), because an architecture held elsewhere in the repository is not looked for.
- **Stories:** C001-US-206
- **Priority:** Must
- **Acceptance:** C001-AC-211.1

### C001-REQ-212 — Place files outside the deep ecosystems as a reduced result
- **Pattern:** unwanted-behaviour
- **Statement:** IF a changed file belongs to no deep ecosystem, THEN THE analysis core SHALL place it in a component by its path alone, in the documented component whose path patterns match it or in "Undocumented" when the repository has a documented architecture and in the derived component of its directory otherwise, and label its dependencies as not analysed, as a reduced result.
- **Rationale:** language-agnostic core for other languages (Q-languages-01); fallback to a file-tree view without dependencies (C001-AS-05); reduced results are labelled (C001-CON-05). Placement by path follows C001-REQ-207, C001-REQ-209 and C001-REQ-210, so a documented architecture places these files as it places every other file.
- **Stories:** C001-US-201, C001-US-206
- **Priority:** Must
- **Acceptance:** C001-AC-212.1

## 5. Design-quality findings

### C001-REQ-213 — Report new dependency cycles
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL report as a design-quality finding each dependency cycle between components that exists in the snapshot and not at the base commit.
- **Rationale:** new dependency cycles named in C001-US-204; deterministic finding (C001-DEC-004).
- **Stories:** C001-US-204
- **Priority:** Should
- **Acceptance:** C001-AC-213.1

### C001-REQ-214 — Report layer bypasses
- **Pattern:** optional-feature
- **Statement:** WHERE the documented architecture defines layers, THE analysis core SHALL report as a design-quality finding each dependency the change adds from a component to a component more than one layer below it.
- **Rationale:** layer bypasses named in C001-US-204.
- **Stories:** C001-US-204
- **Priority:** Should
- **Acceptance:** C001-AC-214.1

### C001-REQ-215 — Report duplicated logic
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL report as a design-quality finding each run of added lines that repeats, after whitespace normalisation, a run of lines found elsewhere in the snapshot that is at least the minimum clone length of the review configuration long.
- **Rationale:** duplicated logic named in C001-US-204.
- **Stories:** C001-US-204
- **Priority:** Should
- **Acceptance:** C001-AC-215.1
- **Open items:** default minimum clone length: C001-IF-005 §9.

### C001-REQ-216 — Add the model provider's design critique
- **Pattern:** optional-feature
- **Statement:** WHERE a model provider is configured, THE analysis core SHALL add the design critique of the model provider on the changed code to the design-quality findings, each item marked as model output.
- **Rationale:** a configured model adds design critique (C001-DEC-004, C001-US-204 notes); model output is marked (C001-US-804).
- **Stories:** C001-US-204
- **Priority:** Should
- **Acceptance:** C001-AC-216.1

### C001-REQ-217 — Keep hunks with deterministic findings open
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL keep open every hunk that a design-quality finding other than design critique points to, whatever the hunk's evidence.
- **Rationale:** design findings stay open and are never cleared on mechanical or test evidence (`ideation.md` §8 step 4, C001-US-204). Design critique does not hold hunks open because model explanations narrow attention without finding more serious defects (`ideation.md` §9, C001-R-002 §B); it stays in the findings list.
- **Stories:** C001-US-204
- **Priority:** Should
- **Acceptance:** C001-AC-217.1

### C001-REQ-218 — List the design-quality findings in the architecture view
- **Pattern:** ubiquitous
- **Statement:** THE review UI SHALL list every design-quality finding of the snapshot on the architecture delta view with its kind, every component it involves and the hunks it points to.
- **Rationale:** findings are listed in the architecture view (C001-US-204). A dependency cycle involves every component on the cycle; a layer bypass, the two components of the dependency; duplicated logic and design critique, the components of the hunks they point to.
- **Stories:** C001-US-204
- **Priority:** Should
- **Acceptance:** C001-AC-218.1

### C001-REQ-219 — Label the findings as reduced in model-free mode
- **Pattern:** state-driven
- **Statement:** WHILE the review runs in model-free mode, THE review UI SHALL label the list of design-quality findings as a reduced result that contains no design critique.
- **Rationale:** reduced results are labelled (C001-CON-05, C001-US-801).
- **Stories:** C001-US-204
- **Priority:** Should
- **Acceptance:** C001-AC-219.1

## 6. From a component to intents and hunks

### C001-REQ-220 — Reach intents and open hunks from a component
- **Pattern:** event-driven
- **Statement:** WHEN the developer selects a component in the architecture delta, THE review UI SHALL list the intents that have at least one hunk in that component and the open hunks of that component.
- **Rationale:** every intent and open hunk is one step from its place in the architecture (C001-SC-04, C001-GOAL-04).
- **Stories:** C001-US-205
- **Priority:** Must
- **Acceptance:** C001-AC-220.1

### C001-REQ-221 — Reach unmet intents from the architecture delta
- **Pattern:** ubiquitous
- **Statement:** THE review UI SHALL list the unmet intents of the snapshot on the architecture delta view under an entry for intents with no code.
- **Rationale:** an unmet intent has no hunk and so no component; this entry keeps 100 % of intents reachable from the architecture delta (C001-SC-04).
- **Stories:** C001-US-205
- **Priority:** Must
- **Acceptance:** C001-AC-221.1
