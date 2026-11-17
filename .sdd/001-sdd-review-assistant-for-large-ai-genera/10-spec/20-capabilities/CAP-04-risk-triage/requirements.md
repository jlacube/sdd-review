---
id: "C001-CAP-04"
artifact: spec/requirements
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Risk triage and guarded clearing"
---
# C001-CAP-04 — Requirements

Stories: `stories.md`. Systems and terms: `40-domain/glossary-delta.md`. Clearing rules and
guarded areas follow Q-clearing-01, Q-clearing-02 and Q-clearing-03; deep ecosystems follow Q-languages-01
(`10-context/scope.md` §1, C001-NFR-008). The open-share target is C001-NFR-005.

## Risk score and ranking

### C001-REQ-401 — Give every hunk a risk score with its signal values
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL give every hunk of the snapshot a risk score, recorded with the value of each of its five risk signals: guarded area (whether the hunk lies in a guarded area), size (the hunk's changed lines), novelty (whether the change adds the hunk's file), test coverage (the share of the executable lines the hunk adds that the snapshot's test run executed, and 0 for a hunk that adds no executable line) and dependency change (whether the hunk adds, removes or changes a dependency on an external package or between components).
- **Rationale:** signal set of C001-R-002 paradigm 5, without its auto-acceptance tier (`ideation.md` §8, C001-NG-03); effort-aware risk ranking in C001-R-002 §B. Dependencies between components come from the architecture delta (C001-CAP-02). A hunk that adds no executable line (only deletions or comments) has no test evidence, so it scores like untested code, on the side of reading as in C001-REQ-404.
- **Stories:** C001-US-401
- **Priority:** Must
- **Acceptance:** C001-AC-401.1
- **Open items:** the default weight of each signal is set and calibrated in 20-plan; C001-REQ-402 fixes the direction of each signal.

### C001-REQ-402 — Make each signal move the score in one direction
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL compute risk scores such that, with all other risk signals equal, a hunk never scores lower when it lies in a guarded area, has more changed lines, is in a file the change adds, has a smaller test coverage, or changes a dependency.
- **Rationale:** makes the score testable without fixing weights in the spec (constitution principle 3); weights are a calibration choice (C001-REQ-401 open item).
- **Stories:** C001-US-401
- **Priority:** Must
- **Acceptance:** C001-AC-402.1

### C001-REQ-403 — Order the hunks of an intent by clearing state and risk
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL order the test hunks of each intent, and separately its other hunks, by these keys in turn: hunks that are not cleared before cleared hunks; descending risk score; among hunks of equal risk score, every hunk after the hunks that define a symbol it uses, hunks that define symbols for each other, directly or through other hunks, forming one group ordered by file path and first changed line; and wherever these keys leave a choice, the hunk or group with the lowest file path and then the lowest first changed line first.
- **Rationale:** C001-US-401 (open hunks of an intent ordered by risk); risk triage of C001-DEC-001; order by importance with mechanical changes last (C001-R-002 paradigm 17 and the file-position bias finding in §B); dependency order of paradigm 11 among hunks of equal risk (C001-US-307). Definitions and uses give only a partial order, so the statement fixes one total order: a topological order of the hunks of equal risk score, a cycle of definitions and uses counting as one group, with the lowest file path and first changed line taken first. Together with the test-first key of C001-REQ-502 this is the intent order, the one reading order of an intent's hunks (C001-REQ-318, C001-REQ-322). Read hunks keep their place, so marking a hunk read does not reorder the intent; a reopened hunk moves among the hunks that are not cleared. The change-wide reading queue under an attention budget has its own order (C001-REQ-610).
- **Stories:** C001-US-401, C001-US-307
- **Priority:** Must
- **Acceptance:** C001-AC-403.1

### C001-REQ-404 — Score unknown test coverage as no coverage
- **Pattern:** unwanted-behaviour
- **Statement:** IF no test run of the snapshot has produced coverage for a hunk, THEN THE analysis core SHALL score the hunk's test-coverage signal as if none of the lines it adds were executed and label the signal as unknown.
- **Rationale:** C001-AS-02 "If wrong" (evidence falls back to static signals, `ideation.md` §10); scoring unknown coverage as none keeps the ranking on the side of reading (constitution principle 4).
- **Stories:** C001-US-401
- **Priority:** Must
- **Acceptance:** C001-AC-404.1

### C001-REQ-405 — Compute risk scores without a model
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL compute risk scores without output from a model provider.
- **Rationale:** deterministic signals first (`ideation.md` §9); triage works in model-free mode (C001-CON-05, C001-DEC-004, C001-NFR-013), and the same snapshot gets the same ranking with or without a configured model (reproducibility: C001-NFR-015).
- **Stories:** C001-US-401
- **Priority:** Must
- **Acceptance:** C001-AC-405.1

## Clearing rules

### C001-REQ-406 — Clear pure moves
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL clear by the pure-move rule every hunk of a file of a deep ecosystem whose changed lines only remove or add whole files or whole symbol definitions that the snapshot moves to another place with an identical abstract syntax tree, every name in the moved code resolving to the same symbol as in the base commit.
- **Rationale:** Q-clearing-01 (pure moves, deterministic proof); C001-DEC-003. Name resolution is part of the proof because moved code can bind to other symbols at its new place. Syntax-aware moves are a language-specific signal (Q-languages-01), so files outside the deep ecosystems are not cleared by this rule.
- **Stories:** C001-US-402
- **Priority:** Must
- **Acceptance:** C001-AC-406.1

### C001-REQ-407 — Clear pure renames
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL clear by the pure-rename rule every hunk of a file of a deep ecosystem whose only differences from the base commit replace symbol names by new names, each replacement applied to the symbol's definition and to every use of it in the snapshot, every use still resolving to the symbol it referred to in the base commit.
- **Rationale:** Q-clearing-01 (pure renames); a rename that makes a use bind to another symbol is not pure. Language-specific signal (Q-languages-01). A renamed symbol of the public API stays open as a public API change (C001-REQ-417, C001-REQ-413).
- **Stories:** C001-US-402
- **Priority:** Must
- **Acceptance:** C001-AC-407.1

### C001-REQ-408 — Clear formatting-only changes
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL clear by the formatting rule every hunk of a file of a deep ecosystem whose code has the same abstract syntax tree and the same comment text as in the base commit.
- **Rationale:** Q-clearing-01 (formatting). Comparing abstract syntax trees ignores layout only: an indentation change that alters a Python block, or any comment change, keeps the hunk open. A whitespace-only comparison is no proof in whitespace-sensitive languages, so files outside the deep ecosystems are not cleared by this rule (Q-languages-01).
- **Stories:** C001-US-402
- **Priority:** Must
- **Acceptance:** C001-AC-408.1

### C001-REQ-409 — Clear files the repository declares as generated
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL clear by the generated-file rule every hunk of a file whose path matches a generated-file pattern of the review configuration or that the `.gitattributes` file marks as `linguist-generated`, both read from the source set by C001-REQ-426.
- **Rationale:** Q-clearing-01 (generated files). The declaration comes from the repository, not from the file's own content, so a generated-file marker written into a file does not clear it. Applies to files of every language (language-agnostic core, Q-languages-01). Dependency lock files stay open as guarded (C001-REQ-416, C001-REQ-413).
- **Stories:** C001-US-402, C001-US-405
- **Priority:** Must
- **Acceptance:** C001-AC-409.1

### C001-REQ-410 — Clear hunks exercised by passing tests
- **Pattern:** event-driven
- **Statement:** WHEN a hunk of a file of a deep ecosystem adds at least one executable line, every executable line it adds has been executed by at least one passing qualifying test (C001-REQ-504) in a test run that the analysis core executed on the snapshot, no test that executed the hunk has failed, and no mutant generated on its changed lines has survived, THE analysis core SHALL clear the hunk by the passing-tests rule.
- **Rationale:** Q-clearing-01 (hunks exercised by passing tests). Only test runs executed by the analysis core count, never results reported by the agent (C001-US-502; agentic manual testing in C001-R-002 §B). A surviving mutant keeps the hunk open because agent-written tests can be weak (C001-US-504, `ideation.md` §9). A hunk that only deletes lines is not exercised by tests and stays open. Per-hunk, per-test coverage is available for the deep ecosystems only (Q-languages-01, C001-REQ-506, C001-REQ-507).
- **Stories:** C001-US-403, C001-US-504
- **Priority:** Must
- **Acceptance:** C001-AC-410.1

### C001-REQ-411 — Reopen a test-cleared hunk that loses its evidence
- **Pattern:** unwanted-behaviour
- **Statement:** IF a hunk cleared by the passing-tests rule no longer meets the conditions of C001-REQ-410, THEN THE analysis core SHALL withdraw the hunk's clearing by that rule, recording the condition that no longer holds, so that the hunk is open unless another clearing rule cleared it or the developer has marked it read.
- **Rationale:** test evidence can change after clearing: mutation results arrive later (C001-REQ-514), the developer judges an intent's tests as not expressing it (C001-REQ-503, C001-REQ-504), or a later run fails. Intended rule for a hunk that another rule also cleared (for example the formatting rule): the other rule's proof does not rest on tests, so the hunk stays cleared by that rule, and its evidence record no longer names the passing-tests rule (C001-REQ-419).
- **Stories:** C001-US-403, C001-US-501, C001-US-504
- **Priority:** Must
- **Acceptance:** C001-AC-411.1

### C001-REQ-412 — Clear hunks by no other means
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL clear a hunk only by the pure-move, pure-rename, formatting, generated-file or passing-tests rule of C001-REQ-406, C001-REQ-407, C001-REQ-408, C001-REQ-409 and C001-REQ-410.
- **Rationale:** C001-DEC-003 (collapse with evidence). No model output, agent report or risk score alone clears a hunk: none of the five rules rests on model output (Q-clearing-01, `ideation.md` §9). This requirement is also the rule on model output and clearing for C001-US-804. Clearing is not acceptance: the developer's verdict on the intent covers its cleared hunks (C001-CAP-07, C001-CON-04, C001-NG-03).
- **Stories:** C001-US-402, C001-US-403, C001-US-804
- **Priority:** Must
- **Acceptance:** C001-AC-412.1

## Guarded areas

### C001-REQ-413 — Never clear a hunk in a guarded area
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL NOT clear a hunk that lies in a guarded area, whatever its evidence.
- **Rationale:** Q-clearing-01 (never-clear list); `ideation.md` §9 (never clear security-sensitive areas on test evidence alone). The built-in areas are fixed (Q-clearing-02, add-only); the hunk's evidence is still recorded and shown.
- **Stories:** C001-US-404
- **Priority:** Must
- **Acceptance:** C001-AC-413.1

### C001-REQ-414 — Recognise the security and authentication area
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL place in the security and authentication guarded area, recording the criterion that matched, every hunk whose file path or changed identifiers contain a term of the built-in security term list, or whose changed lines import a module of the built-in security library list of the deep ecosystems.
- **Rationale:** Q-clearing-01 (security/auth); a wrongly matched hunk stays open and costs reading time, the trade-off accepted in Q-clearing-02.
- **Stories:** C001-US-404
- **Priority:** Must
- **Acceptance:** C001-AC-414.1
- **Open items:** built-in term and library lists: C001-IF-005 §3, §4.

### C001-REQ-415 — Recognise the data-migration area
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL place in the data-migration guarded area, recording the criterion that matched, every hunk of a SQL file or of a file whose path matches the built-in migration path patterns of the database migration frameworks of the deep ecosystems.
- **Rationale:** Q-clearing-01 (data migrations); SQL files are recognised in every repository (language-agnostic core, Q-languages-01).
- **Stories:** C001-US-404
- **Priority:** Must
- **Acceptance:** C001-AC-415.1
- **Open items:** built-in migration path patterns: C001-IF-005 §5.

### C001-REQ-416 — Recognise the dependency, build and configuration area
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL place in the dependency, build and configuration guarded area, recording the criterion that matched, every hunk of a file that matches the built-in patterns for dependency manifests and lock files, build definitions, CI pipeline definitions, container definitions and configuration files, the review configuration included.
- **Rationale:** Q-clearing-01 (dependency/build/config changes). The review configuration is guarded so that a change to the clearing policy is always read (C001-REQ-426).
- **Stories:** C001-US-404
- **Priority:** Must
- **Acceptance:** C001-AC-416.1
- **Open items:** built-in file patterns, per ecosystem and language-agnostic: C001-IF-005 §6.

### C001-REQ-417 — Recognise the public API area
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL place in the public API guarded area, recording the criterion that matched, every hunk of a file of a deep ecosystem that adds or removes a symbol of the public API or changes such a symbol's name, parameters, return type or type, and every hunk of an OpenAPI, GraphQL schema or Protocol Buffers file.
- **Rationale:** Q-clearing-01 (public API changes). For recognition, a symbol is part of the public API when it is exported from a TypeScript or JavaScript module, is a module-level or class-level Python name without a leading underscore, or is a public or protected member of a public C# type; made exact in `50-interfaces/builtin-policy.md` §7, which also sets three detection rules: files of test hunks hold no public API symbol; a Python name bound by an import counts only in an `__init__` file, as an explicit re-export (`import x as x`, `from m import x as x`) or when `__all__` lists it; dunder names (such as `__init__`) are public. This over-approximation keeps more hunks open, as accepted in Q-clearing-02. API description files are recognised in every repository. Effect on the open share: on feature changes, much new code adds public symbols, so this area can hold a large part of the change; C001-NFR-005 counts its hunks as open and reports their share apart. Whether the 30 % target stays reachable with this recognition is [ASSUMPTION: C001-AS-07]; if it is not, the "If wrong" path of C001-AS-07 applies, and only P-01 narrows this recognition, on a proposal that gives the measured split by reason (Q-clearing-06).
- **Stories:** C001-US-404
- **Priority:** Must
- **Acceptance:** C001-AC-417.1

### C001-REQ-418 — Keep hunks with deterministic design-quality findings open
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL NOT clear a hunk that a design-quality finding other than design critique points to.
- **Rationale:** `ideation.md` §8 step 4 (high-risk hunks and design findings stay open); C001-US-204 (findings never cleared on mechanical or test evidence). Q-clearing-04 (findings list only): design critique is model output and appears only in the findings list (C001-REQ-217, C001-REQ-218), so model output never changes which hunks clear (C001-REQ-412).
- **Stories:** C001-US-402, C001-US-403
- **Priority:** Must
- **Acceptance:** C001-AC-418.1

## Evidence and reopening

### C001-REQ-419 — Attach an evidence record to every cleared hunk
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL attach to every cleared hunk an evidence record that names every clearing rule that cleared it, each evidence item the clearing rested on (the proof, or the tests and their test run), the evidence strength of each item (C001-REQ-518) and the time of clearing.
- **Rationale:** C001-DEC-003 Consequences (every clearing carries an evidence record); C001-SC-05 (100 % of cleared hunks have an evidence record).
- **Stories:** C001-US-402, C001-US-403, C001-US-406
- **Priority:** Must
- **Acceptance:** C001-AC-419.1

### C001-REQ-420 — Show cleared hunks collapsed, never hidden
- **Pattern:** ubiquitous
- **Statement:** THE review UI SHALL show every cleared hunk as a collapsed entry in its intent, or in the orphan code list, labelled with its clearing rules and the evidence strength of its strongest evidence item.
- **Rationale:** C001-DEC-003 (collapsed but visible).
- **Stories:** C001-US-402, C001-US-403, C001-US-406
- **Priority:** Must
- **Acceptance:** C001-AC-420.1

### C001-REQ-421 — Expand a cleared hunk with its evidence
- **Pattern:** event-driven
- **Statement:** WHEN the developer expands a cleared hunk, THE review UI SHALL show the hunk's changed lines together with its evidence record.
- **Rationale:** `ideation.md` §9 (the developer can open any collapsed hunk); C001-DEC-003 Consequences.
- **Stories:** C001-US-406
- **Priority:** Must
- **Acceptance:** C001-AC-421.1

### C001-REQ-422 — Reopen a cleared hunk for reading
- **Pattern:** event-driven
- **Statement:** WHEN the developer reopens a cleared hunk, THE analysis core SHALL set the hunk open, labelled as reopened by the developer, for the rest of the review of the snapshot.
- **Rationale:** C001-US-406 (clearing never hides code); the developer, not the tool, decides what to read (C001-DEC-003).
- **Stories:** C001-US-406
- **Priority:** Must
- **Acceptance:** C001-AC-422.1

## Repository configuration

### C001-REQ-423 — Add guarded areas from the review configuration
- **Pattern:** optional-feature
- **Statement:** WHERE the review configuration defines additional guarded areas as named path patterns, THE analysis core SHALL place every hunk of a file matching such a pattern in the guarded area of that name.
- **Rationale:** Q-clearing-01 (rules adjustable per repository); Q-clearing-02 (add-only).
- **Stories:** C001-US-405
- **Priority:** Should
- **Acceptance:** C001-AC-423.1

### C001-REQ-424 — Disable a clearing rule from the review configuration
- **Pattern:** optional-feature
- **Statement:** WHERE the review configuration disables a clearing rule, THE analysis core SHALL NOT clear hunks by that rule.
- **Rationale:** Q-clearing-02 (repositories tune the other clearing rules); disabling a rule only keeps more hunks open.
- **Stories:** C001-US-405
- **Priority:** Should
- **Acceptance:** C001-AC-424.1

### C001-REQ-425 — Ignore settings that weaken a built-in guarded area
- **Pattern:** unwanted-behaviour
- **Statement:** IF the review configuration contains a setting that removes or narrows a built-in guarded area, THEN THE analysis core SHALL ignore that setting and report a notice naming it.
- **Rationale:** Q-clearing-02 answer "Add-only (Recommended)": the built-in areas of C001-REQ-414 to C001-REQ-417 are a fixed safety floor in every repository.
- **Stories:** C001-US-405
- **Priority:** Should
- **Acceptance:** C001-AC-425.1

### C001-REQ-426 — Read the review configuration from the base commit
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL read the review configuration that applies to a snapshot from the base commit of that snapshot.
- **Rationale:** Q-clearing-03 (base commit's): the rules in force before the change judge it, so a change cannot loosen the clearing of its own hunks, and its edit of the review configuration is read as a guarded hunk (C001-REQ-416). A maintainer's edit applies to the reviews whose base commit contains it. The default base commit keeps the configuration edits that an agent committed out of the base commit, also on a branch without an upstream branch (C001-REQ-104, Q-intake-01). A base commit without a review configuration gives the default configuration (C001-SC-07).
- **Stories:** C001-US-405
- **Priority:** Should
- **Acceptance:** C001-AC-426.1

### C001-REQ-427 — Clear nothing when the configuration cannot be read
- **Pattern:** unwanted-behaviour
- **Statement:** IF the review configuration cannot be read, THEN THE analysis core SHALL clear no hunk of the snapshot and report a notice naming the configuration error.
- **Rationale:** falling back to the built-in rules could re-enable a rule the repository disabled (C001-REQ-424); clearing nothing keeps every hunk in front of the developer (constitution principle 4).
- **Stories:** C001-US-405
- **Priority:** Should
- **Acceptance:** C001-AC-427.1
