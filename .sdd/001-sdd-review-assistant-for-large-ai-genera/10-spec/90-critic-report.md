---
artifact: critic-report
change: CHG-001
phase: 10-spec
reviewed_ids: all
---
# Critic report — CHG-001 10-spec

Inputs: everything under `10-spec/` (rounds 1–9 of `10-spec/questions-log.md` included),
`00-ideation/ideation.md`, `00-ideation/decisions/`, `.sdd/_constitution/constitution.md`.
`sdd lint 001 --phase 10-spec --json` reports 0 errors, 0 warnings; `sdd trace 001` reports
TR-01 to TR-05 at 100 %. The findings below are judgement findings that lint cannot see.

Focused re-review 1 (after round 10 and the fixes for CR-1 to CR-16) updates the statuses in
place, adds CR-17 to CR-22 and is reported in its own section. Focused re-review 2 (after the
fixes for CR-7 and CR-17 to CR-22) updates the statuses again, adds CR-23 to CR-27 and is reported
in its own section. Focused re-review 3 (after round 11 and the fixes for CR-23 to CR-27) updates
the statuses again, adds CR-28 to CR-32 and is reported in its own section. Focused re-review 4
(after round 12, Q-copy-window-01 and the fixes for CR-28 to CR-32) updates the statuses again,
adds CR-33 to CR-35 and is reported in the last section, which also holds the current gate notes.
Locations quoted in CR-1 to CR-16 refer to the files as they were at the first review, those in
CR-17 to CR-22 to the files as they were at focused re-review 1, those in CR-23 to CR-27 to the
files as they were at focused re-review 2, and those in CR-28 to CR-32 to the files as they were
at focused re-review 3.

## Summary
| blocker | major | minor |
|---|---|---|
| 2 | 10 | 23 |

All findings CR-1 to CR-35. Open after focused re-review 4: 0 blocker, 0 major, 3 minor
(CR-33, CR-34, CR-35).

## Findings

### CR-1 — Default base commit without an upstream branch leaves the agent's commits out of the review
- **Severity:** blocker
- **Refs:** C001-REQ-104, C001-US-102, C001-REQ-426, C001-AC-104.1, C001-TS-108, C001-TS-131
- **Evidence:** "WHILE HEAD is not on a branch that has an upstream branch, WHEN the developer starts a review without naming a commit, THE analysis core SHALL use HEAD as the base commit." — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:40`; against the story it serves: "- **So that** agents that commit their own work are reviewed the same way as agents that leave" — `10-spec/20-capabilities/CAP-01-change-intake/stories.md:33`; the scenario confirms the effect: "Given the fixture repository "fx-local" with HEAD on branch "agent/cart" at commit C2 and no upstream branch" … "And the change lists only "src/cart.ts"" — `10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:105`, `:109`; and P-01's rule: "the rules in force before the change judge it, so a change cannot loosen the clearing of its own hunks" — `10-spec/20-capabilities/CAP-04-risk-triage/requirements.md:232`
- **Why it matters:** an agent that commits on a new local branch has no upstream branch until the first push. That is the main case of C001-US-102 ("commits that are not yet pushed"). With HEAD as the base, the default review drops every agent commit and its commit intents (C001-REQ-109, C001-REQ-313). It also puts any review-configuration edit the agent committed into the base commit, so that edit judges the remaining uncommitted hunks. This defeats the protection P-01 chose in Q-clearing-03. The intake summary names the base, but the one-command start of C001-US-901 then reviews the wrong scope without warning. P-01 has not decided this default.
- **Suggested fix:** Owner: spec-writer (`CAP-01-change-intake/requirements.md`, C001-REQ-104), then test-designer (`CAP-01-change-intake/acceptance.md`, C001-TS-108, C001-TS-109, C001-TS-116, C001-TS-131) and architect (`50-interfaces/git-access.md` G-05, intake-summary wording in `50-interfaces/review-cli.md`). Ask P-01 Q-intake-01, then rewrite C001-REQ-104 to match the answer. Recommended: the merge base with the remote's default branch (else a local `main` or `master`), and HEAD only when none exists. Add a scenario with agent commits on a local branch that has no upstream branch.
- **Status:** resolved (focused re-review 1)

### CR-2 — Tests added by the change clear nothing until the developer judges them: a clearing rule P-01 did not decide
- **Severity:** blocker
- **Refs:** C001-REQ-504, C001-US-501, C001-REQ-410, C001-AC-504.1, C001-NFR-005
- **Evidence:** "THE analysis core SHALL treat a test as qualifying for the passing-tests rule only when every changed line of a test hunk that the test executed belongs to an intent whose test hunks the developer has judged as expressing the intent." — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:44`; P-01's answer was "Mechanical + tests, guarded (Recommended)" for an option stating "and hunks exercised by passing tests; never clear security/auth, data migrations, dependency/build/config changes or public API changes" — `10-spec/questions-log.md:26`, `:21`; and the story left the choice open: "How my judgement of the tests affects" / "test-based clearing (C001-US-403) is set in the requirements." — `10-spec/20-capabilities/CAP-05-review-evidence/stories.md:24-25`
- **Why it matters:** in an agent change, most new code is executed mainly by tests the agent wrote in the same change. Under C001-REQ-504, none of that code clears until the developer has read and judged each intent's test hunks. This is a strong safety choice that serves `ideation.md` §9, but it adds a condition to the clearing rule P-01 approved. It decides whether C001-NFR-005 (≤ 30 % open, measured "before any hunk is marked read") can be met (CR-3), and it changes the review flow: judge the tests first, then the code clears. A related point: the rationale says "a test that runs a changed fixture or helper needs the judgement too" (`requirements.md:45`), but the statement only covers changed lines of *test hunks*. A changed helper outside the test-file conventions needs no judgement under the statement.
- **Suggested fix:** Owner: spec-writer (`CAP-05-review-evidence/requirements.md`, `30-nfr/nfr.md`). Ask P-01 Q-clearing-05. Keep or change C001-REQ-504 to match the answer, and state in C001-NFR-005 which judgements the measurement assumes. Align the C001-REQ-504 rationale with its statement, or extend the statement to every changed line the test executes outside the hunk under clearing.
- **Status:** resolved (focused re-review 1)

### CR-3 — C001-NFR-005 cannot be measured as written and is at risk under the guard rules
- **Severity:** major
- **Refs:** C001-NFR-005, C001-DOD-015, C001-REQ-417, C001-REQ-505, C001-SC-02
- **Evidence:** "open share of the whole change after triage and evidence runs, before any hunk is marked read, reopened or sampled; default review configuration; model-free mode." — `10-spec/30-nfr/nfr.md:85`; the default configuration has "| Test command | none | C001-REQ-505 |" — `10-spec/50-interfaces/builtin-policy.md:98`; the public API area takes "every hunk of a file of a deep ecosystem that adds or removes a symbol of the public API" — `10-spec/20-capabilities/CAP-04-risk-triage/requirements.md:155`, where a public symbol is "a module-level or class-level Python name without a leading underscore, or is a public or protected member of a public C# type" — `…/CAP-04-risk-triage/requirements.md:156`; P-01 set 30 % as "a demanding but credible target given the clearing guards" — `10-spec/questions-log.md:33`
- **Why it matters:** (1) With the default configuration and no `--test-command`, no test runs (C001-REQ-508), so only mechanical rules clear. The method does not say whether the benchmark harness passes a test command. (2) The method does not say whether test judgements are recorded first (CR-2). (3) Under C001-REQ-417, every hunk that adds a public Python function or a public C# member is guarded. So is every hunk that adds an exported TypeScript function, and with it most new code of a feature change. Together with C001-REQ-504 and broad terms such as "session", "role" and `**/config/**` (`builtin-policy.md:41-47`, `:72`), a 30 % open share on feature changes looks unlikely. Nobody has estimated it, and P-01 accepted 30 % before these guard rules existed. This is an NFR whose method cannot be run as stated (N4).
- **Suggested fix:** Owner: spec-writer (`30-nfr/nfr.md` C001-NFR-005, C001-REQ-417 rationale), test-designer (`70-dod.md` C001-DOD-015), architect (`50-interfaces/builtin-policy.md` §3, §6). State the test command and the judgement state of the measurement. Before G2, estimate the open share on one sample agent change per deep ecosystem under the current guard rules. If the estimate is above 30 %, narrow "public API" (for example: exported from the package entry point, or listed in `__all__`, or members of types other projects can reference) or return the target to P-01.
- **Status:** resolved (focused re-review 1); the reachability of 30 % is now the stated assumption C001-AS-07; see CR-20 for a gap in the new method

### CR-4 — C001-REQ-721 lists six recorded actions; the interfaces and P-01's answer cover every record entry
- **Severity:** major
- **Refs:** C001-REQ-721, C001-AC-721.1, C001-TS-759, C001-INV-10
- **Evidence:** "IF the git user name or the git user e-mail address of the repository is not set or is blank when the developer takes an action that writes a review record entry (a verdict, a read mark, a hunk move, the rejection of a hunk of orphan code, a test judgement or a defect report), …" — `10-spec/20-capabilities/CAP-07-verdicts/requirements.md:174`; the error catalogue lists ten kinds: "(C001-IF-003 §4: read mark, hunk reopen, hunk move, intent creation, orphan-hunk rejection, test judgement, defect report, attention budget, bundle command added or confirmed, verdict)" — `10-spec/50-interfaces/errors.md:61`; P-01's answer: "**Answer:** Refuse every recorded action (Recommended)" — `10-spec/questions-log.md:272`; and the open item is out of date: "ERR-ACT-006 in `50-interfaces/errors.md`, C001-IF-012 G-10 and the review record schema still limit the refusal to verdicts (architect)." — `…/CAP-07-verdicts/requirements.md:179`
- **Why it matters:** the earlier note that the statement "still said verdict" no longer applies: the statement now names six actions. It still leaves out hunk reopen, intent creation, attention budget, and bundle command added or confirmed. Each of these writes an entry (`40-domain/domain-model.md:426-428`), and the interfaces refuse them. The requirement read as written and C001-TS-759 test less than P-01 decided, and the code follows C001-IF-003. The stale open item asks the architect to change interfaces that are already right, and acting on it could undo them.
- **Suggested fix:** Owner: spec-writer (`CAP-07-verdicts/requirements.md`). Replace the parenthesis with "any action that writes a review record entry (entry kinds: C001-IF-009)", or list all ten kinds, and delete the open item. Test-designer (`CAP-07-verdicts/acceptance.md`): add rows to C001-TS-759 for reopening a hunk, creating an intent, stating a time budget, and adding and confirming a bundle command.
- **Status:** resolved (focused re-review 1)

### CR-5 — "Sampling result" is undefined, and the action lists of persistence, origin checks and crash safety leave out recorded actions
- **Severity:** major
- **Refs:** C001-REQ-907, C001-REQ-918, C001-REQ-920, C001-NFR-014, C001-DOD-025, C001-TS-914, C001-TS-944
- **Evidence:** "IF a request that changes the review state (verdict, read mark, mapping correction, sampling result) does not come from a page served by the local review UI of that review" — `10-spec/20-capabilities/CAP-09-review-surfaces/requirements.md:53`; "WHEN the developer records a read mark, a mapping correction, a sampling result or a verdict, THE analysis core SHALL save it to persistent storage before it confirms the action." — `…/CAP-09-review-surfaces/requirements.md:157`; "keep every verdict, read mark and hunk move that it confirmed to the developer" — `10-spec/30-nfr/nfr.md:211`; "| recorded the sampling result "read, no defect" for a sampled hunk     | that sampled hunk as read                       |" — `…/CAP-09-review-surfaces/acceptance.md:445`; "finds 100 % of the confirmed verdicts, read marks and hunk moves in the resumed review" — `10-spec/70-dod.md:55`
- **Why it matters:** the glossary does not define "sampling result", and C001-IF-003 §4 has no operation that records one (`10-spec/50-interfaces/core-api.md:63-75`). The C001-TS-944 row therefore cannot be run against the interfaces. Test judgements, defect reports, orphan rejections, reopens, developer-named intents, attention budgets and bundle commands are all recorded actions, but none is covered by save-before-confirm (C001-REQ-920), restore (C001-REQ-918), crash safety (C001-NFR-014, C001-DOD-025) or, at requirement level, the origin check (C001-REQ-907). A lost test judgement changes which hunks clear (C001-REQ-504). Running and confirming bundle commands executes code, so they need the origin check most of all. The interface does protect every request (`50-interfaces/openapi.yaml:14-21`), and C001-NFR-010 tests every request type, but the requirement should say so too.
- **Suggested fix:** Owner: spec-writer (`CAP-09-review-surfaces/requirements.md`, `30-nfr/nfr.md`): replace the lists in C001-REQ-907, C001-REQ-918, C001-REQ-920 and C001-NFR-014 with "every action that writes a review record entry or runs a command" (C001-REQ-907), or "every review record entry" (the others), and drop "sampling result". Test-designer (`CAP-09-review-surfaces/acceptance.md`, `70-dod.md`): replace the "sampling result" rows of C001-TS-914 and C001-TS-944 with a defect report and a read mark on a sampled hunk. Add a test-judgement row and a bundle-run row to C001-TS-914. Widen C001-DOD-025 to every confirmed record entry.
- **Status:** resolved (focused re-review 1)

### CR-6 — Evidence runs work in the developer's working tree: mutation testing can change source files, and any edit discards up to an hour of evidence
- **Severity:** major
- **Refs:** C001-REQ-514, C001-REQ-509, C001-REQ-120, C001-NFR-018, C001-CON-04
- **Evidence:** "1. A command (test command, mutation tool, bundle command) runs in the repository's working-tree" — `10-spec/50-interfaces/evidence-runs.md:16`; "Before a command starts and after it ends, the working state is compared with the snapshot through" / "C001-IF-012 G-12. If any file or HEAD differs, no result of the run is recorded as evidence and" — `…/evidence-runs.md:28-29`; the only no-change guarantee is limited to intake: "THE analysis core SHALL NOT change the working tree, the index, any branch, any tag or any commit of the repository during intake and snapshot creation." — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:169`; mutation testing may last "(b) ≤ 60 min for each benchmark change" — `10-spec/30-nfr/nfr.md:74`
- **Why it matters:** a mutation tool works by changing source lines. Run in the working-tree root, it may leave mutated code in the developer's files if it crashes or is cancelled, and no requirement forbids that. While it runs, the editor and the agent see mutated code. And because the snapshot check covers the whole run, one save by the developer during the test run (up to 3× the suite) or the mutation run (up to 60 min) discards all of that evidence (C001-REQ-509). A tool meant for multi-hour reviews (C001-US-906) would then often end up with no test or mutation evidence. That threatens C001-AS-06 and C001-NFR-005.
- **Suggested fix:** Owner: spec-writer (`CAP-05-review-evidence/requirements.md`): add a ubiquitous requirement that the analysis core does not change working-tree files during test, mutation and bundle runs, with an acceptance scenario that cancels a mutation run. Owner: architect (`50-interfaces/evidence-runs.md` §1, §2, `60-architecture/architecture.md` §5): run evidence commands in an isolated copy built from the snapshot content, outside the repository. The snapshot check then concerns that copy, and edits in the working tree no longer void the evidence. If the working tree stays the place of the runs, state that and its cost explicitly.
- **Status:** resolved (focused re-review 1); the fix introduced CR-17 and CR-18

### CR-7 — C001-REQ-123 names three kinds of damaged entry; no scenario covers a damaged architecture component
- **Severity:** minor
- **Refs:** C001-REQ-123, C001-AC-123.1
- **Evidence:** "IF an entry of the `.sdd/` workspace in the snapshot (a change folder, a spec item or a component of the documented architecture) has the form of such an entry but cannot be read" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:193`; the rule exists: "A component heading under the catalogue whose ID token has the shape `C<digits>-COMP-…` but" … "is left out of the documented architecture with notice ERR-SDD-005" — `10-spec/50-interfaces/intent-sources.md:78-81`; C001-AC-123.1 has only a task file (C001-TS-151), a change folder (C001-TS-152) and a non-entry (C001-TS-153) — `…/CAP-01-change-intake/acceptance.md:555-587`
- **Why it matters:** the component case also has an effect the other two cases do not: the files the component would have placed fall under "Undocumented" and become drift (C001-REQ-209). Without a scenario, that path is not tested (constitution principle 3).
- **Suggested fix:** Owner: test-designer (`CAP-01-change-intake/acceptance.md`): add a scenario in which a component has a malformed `**Layer:**` bullet or a heading without ` — <name>`. Assert notice ERR-SDD-005 with file and line, and that its files are placed in "Undocumented".
- **Status:** resolved (focused re-review 2)

### CR-8 — The documented architecture of a `.sdd/` workspace is read only from the selected SDD change, which neither C001-REQ-207 nor the glossary says
- **Severity:** minor
- **Refs:** C001-REQ-207, C001-REQ-211, C001-US-203
- **Evidence:** "1. **Source order:** the `architecture` object of the neutral file (§5) when present; otherwise" / "`10-spec/60-architecture/architecture.md` of the selected SDD change (§6); otherwise none." — `10-spec/50-interfaces/intent-sources.md:63-64`; against "WHERE the snapshot documents the repository's architecture in the `.sdd/` format" — `10-spec/20-capabilities/CAP-02-architecture-delta/requirements.md:79`; and the resulting message: "drift was not checked because no documented architecture was found" — `…/CAP-02-architecture-delta/requirements.md:130`
- **Why it matters:** in an intent-fallback review (no open SDD change) or a lite change (no `60-architecture/`), a `.sdd/` repository whose architecture sits in another change folder or in `_archive/` gets no drift check. The view then states that no documented architecture "was found", which is untrue. Reading the selected change's architecture is a defensible choice, but the requirement and the glossary ("a repository declares in the `.sdd/` format", `10-spec/40-domain/glossary-delta.md:80`) promise more.
- **Suggested fix:** Owner: spec-writer (C001-REQ-207, C001-REQ-211, glossary "documented architecture"): state the source rule and word the C001-REQ-211 message as "no documented architecture in the selected source". Owner: architect (`intent-sources.md` §4): consider falling back to the newest `architecture.md` among the other change folders, archived ones included, and record the choice.
- **Status:** resolved (focused re-review 1)

### CR-9 — The rule that a rejected orphan hunk later grouped under an intent is decided by that intent's verdict exists only in a state machine
- **Severity:** minor
- **Refs:** C001-REQ-710, C001-REQ-711, C001-US-704
- **Evidence:** "Rejected --> Grouped : developer moves it to an intent or creates an intent for it" — `10-spec/40-domain/state-machines.md:240`; "Once the hunk is grouped under an intent it is decided through that intent's verdict; the rejection entry stays in the record (C001-REQ-713)." — `…/state-machines.md:255-256`
- **Why it matters:** this rule decides whether code the developer rejected can later be accepted through a signature (C001-GOAL-05). No requirement states it and no scenario tests it, so neither the decision status nor the review record is checked for this path. The rule itself does not need P-01: it only applies after the developer's own later move and signature, and that move makes the intent's verdict stale (C001-REQ-715).
- **Suggested fix:** Owner: spec-writer (`CAP-07-verdicts/requirements.md`): add an event-driven requirement for grouping a rejected orphan hunk, covering its decision-status count and how the record shows both entries. Test-designer (`CAP-07-verdicts/acceptance.md`): add a scenario with reject, move to an intent and sign, then check the decision status and both entries.
- **Status:** resolved (focused re-review 1)

### CR-10 — Developer-named intents that differ only in case are accepted, while model titles are compared case-insensitively
- **Severity:** minor
- **Refs:** C001-REQ-719, C001-TS-755, C001-INV-15
- **Evidence:** "equals, after collapsing whitespace, the name of another developer-named intent of the review" — `10-spec/20-capabilities/CAP-07-verdicts/requirements.md:157`; accepted in C001-TS-755: "    | "add retry logging"  |" — `…/CAP-07-verdicts/acceptance.md:561`; key rule: "`model:<SHA-256 of the lower-cased, whitespace-collapsed title>`; `dev:<name as given, whitespace-collapsed>`. … case is kept" — `10-spec/40-domain/domain-model.md:470`
- **Why it matters:** "Add retry logging" and "add retry logging" become two intents that look the same in the decision status and the review record. The developer can attach hunks to the wrong one and sign the wrong one. The two key rules normalise names in different ways without a stated reason.
- **Suggested fix:** Owner: spec-writer (C001-REQ-719) and architect (`domain-model.md` §3): compare developer names case-insensitively (Unicode case folding after whitespace collapsing) and keep the given case for display. Test-designer: move "add retry logging" from C001-TS-755 to the refused examples of C001-TS-754. No P-01 decision needed.
- **Status:** resolved (focused re-review 1)

### CR-11 — Stale open items and a wrong interface citation in C001-REQ-615 and C001-REQ-719
- **Severity:** minor
- **Refs:** C001-REQ-615, C001-REQ-719
- **Evidence:** "Accepted value types: C001-IF-001, C001-IF-002." and "the error code is not yet in `50-interfaces/errors.md` (architect)." — `10-spec/20-capabilities/CAP-06-review-coverage/requirements.md:127`, `:131`; the catalogue already has ERR-ACT-008 with "| — / 400 |" (no CLI surface) — `10-spec/50-interfaces/errors.md:63`; "the error code for a name already taken is not yet in `50-interfaces/errors.md` (architect)." — `…/CAP-07-verdicts/requirements.md:162`, while ERR-ACT-009 exists — `10-spec/50-interfaces/errors.md:64`
- **Why it matters:** the CLI synopsis has no budget or reading-rate option (`10-spec/50-interfaces/review-cli.md:16-29`), so C001-IF-001 defines no value type for C001-REQ-615. The open items send the architect after work that is already done, and they leave the requirements without the codes the scenarios rely on.
- **Suggested fix:** Owner: spec-writer: cite only C001-IF-002 (and C001-IF-003 `setAttentionBudget`) in C001-REQ-615 and name ERR-ACT-008. Name ERR-ACT-009 in the C001-REQ-719 rationale. Delete the three stale open items (C001-REQ-721's is in CR-4).
- **Status:** resolved (focused re-review 1)

### CR-12 — The index gives stale ID counts
- **Severity:** minor
- **Refs:** C001-AC-123.1, C001-AC-721.1
- **Evidence:** "| AC | 184 (the 15 requirements added in step 6 have none yet) |" and "| TS | 464 |" — `10-spec/00-index.md:110-111`
- **Why it matters:** there are 199 acceptance-criterion headings, and `sdd trace 001` reports 199 / 199 requirements with an AC. There are 534 `Scenario` / `Scenario Outline` lines with a C001-TS ID. A reader of the index would think 15 requirements are untested. The generated `10-spec/85-open-items.md:12` also says "Total: 10" while `sdd trace 001` reports 18 open items, so it needs regenerating.
- **Suggested fix:** Owner: spec-writer (`00-index.md`): update the AC and TS counts, or replace them with a pointer to `80-traceability.md`. Conductor: run `sdd trace 001 --write` before the gate.
- **Status:** resolved (focused re-review 1); the `85-open-items.md` part is withdrawn: the trace total also counts the open items of `00-ideation/` (re-review section); new stale counts: CR-22

### CR-13 — Glossary definitions of "review record" and "defect report" disagree with the domain model and the scenarios
- **Severity:** minor
- **Refs:** C001-US-705, C001-REQ-606, C001-TS-620
- **Evidence:** "The durable record of a review: for each verdict, … together with hunk moves, escalations and coverage statements (C001-US-705)." — `10-spec/40-domain/glossary-delta.md:167`; against "Entry kinds: read mark, hunk reopen, hunk move, intent created, orphan rejection, test judgement, defect report, escalation, attention budget, bundle command added, bundle command confirmed, verdict." — `10-spec/40-domain/domain-model.md:426-428`; "defect report | The developer's statement that a cleared hunk contains a defect (C001-REQ-606)." — `…/glossary-delta.md:152`; against C001-TS-620, where a defect is reported on a hunk that "has never been cleared" — `10-spec/20-capabilities/CAP-06-review-coverage/acceptance.md:208`
- **Why it matters:** the glossary is the reference for every requirement (it says "with exactly these meanings"). By its definition a read mark or a test judgement is not part of the review record, and a coverage statement is shown as an entry of its own, although it is a field of a verdict entry. For a defect report on a hunk that was never cleared, no requirement says whether the report is refused, recorded or ignored. C001-TS-620 checks only that nothing escalates.
- **Suggested fix:** Owner: spec-writer (`40-domain/glossary-delta.md`, C001-REQ-606): define the review record as the entry kinds of C001-IF-009, widen "defect report" to any hunk, and add to C001-REQ-606 (or a new requirement) what is recorded for a hunk that no rule cleared. Test-designer: add that outcome to C001-TS-620.
- **Status:** resolved (focused re-review 1)

### CR-14 — The hunk review-state table has no row for a read hunk whose test clearing is withdrawn
- **Severity:** minor
- **Refs:** C001-REQ-411, C001-TS-485
- **Evidence:** the only withdrawal rows start from Cleared: "| Cleared | the passing-tests conditions stop holding (later mutant, failed run, test judgement) | the passing-tests rule is the only rule that cleared it | Open |" — `10-spec/40-domain/state-machines.md:40`; C001-TS-485 expects "`src/coupon/apply.ts#1` is no longer cleared by the passing-tests rule and keeps its read mark" — `10-spec/20-capabilities/CAP-04-risk-triage/acceptance.md:480`
- **Why it matters:** read hunks can carry clearings (row "Read | a clearing rule's conditions hold", `state-machines.md:46`), but the table does not say what happens to a read hunk's evidence record and sample-population membership when its passing-tests clearing is withdrawn, or when a rule that cleared it escalates. The sample (C001-INV-16) depends on that membership. The transition table is incomplete (D2).
- **Suggested fix:** Owner: architect (`40-domain/state-machines.md` §1, §8): add rows "Read | passing-tests conditions stop holding | Read | passing-tests rule removed from the evidence record; the hunk leaves that population" and "Read | escalation of a rule that cleared it | Read | (state the membership rule)".
- **Status:** resolved (focused re-review 1); the escalation row brought out CR-19

### CR-15 — Where verdicts are stored was decided without recorded alternatives
- **Severity:** minor
- **Refs:** C001-CON-16, C001-US-705, C001-REQ-714
- **Evidence:** ideation open question "| Where are verdicts stored (in the repository or local state)? | sdd-architect | 10-spec |" — `00-ideation/ideation.md:196`; answered only as a constraint: "Review state is kept by the review state store on the local machine, outside the working tree and outside git objects, refs and index" — `10-spec/60-architecture/constraints.md:23`
- **Why it matters:** the choice between a local store and a record kept in the repository decides whether "anyone I show it to" (C001-US-705) can read the ledger without the developer's machine. It also decides whether a later team or pull-request surface (`ideation.md` §5 Later) can reuse the record. The decision is sound for one developer, but the spec gives no alternatives or reasons (D5). Only the exact location goes to an ADR.
- **Suggested fix:** Owner: architect: record the decision with at least two options (local store; record committed in the repository; local store plus an export command) and the reason for the choice, as a DEC in the spec or an ADR named by C001-CON-16. No P-01 decision needed (the ideation names the architect as owner).
- **Status:** resolved (focused re-review 1)

### CR-16 — C001-SC-07 promises zero bytes off the machine, while the project's own commands, run automatically, are excluded from every measure
- **Severity:** minor
- **Refs:** C001-SC-07, C001-REQ-803, C001-NFR-011, C001-REQ-505
- **Evidence:** "With the default configuration, 0 bytes of repository content leave the machine during a review" — `10-spec/10-context/problem-and-goals.md:42`; "The project's test commands and evidence bundle commands run as the developer's own commands (C001-CAP-05); their network use is outside this requirement." — `10-spec/20-capabilities/CAP-08-model-provider/requirements.md:30`; the test command starts on its own: "WHEN the analysis of a snapshot starts, THE analysis core SHALL run on the snapshot the test command" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:62`
- **Why it matters:** the success criterion is stronger than what C001-NFR-011 measures. The review assistant itself starts the test command (for example `npx jest`, which can download packages), so the exclusion is not visible to P-01 in the criterion P-01 approves.
- **Suggested fix:** Owner: spec-writer (`10-context/problem-and-goals.md` C001-SC-07): add "excluding the network use of the project's own test and evidence commands (C001-REQ-803)". Optionally have the intake summary state that the test command will run.
- **Status:** resolved (focused re-review 1)

### CR-17 — C001-NFR-018 (a) and (c) lost a defined baseline when evidence runs moved into evidence workspaces
- **Severity:** major
- **Refs:** C001-NFR-018, C001-CON-22, C001-IF-013, C001-DOD-014
- **Evidence:** "(a) test-run overhead: wall-clock time of the analysis core's test run with per-test coverage of the changed lines (C001-REQ-505, C001-REQ-506) divided by the wall-clock time of the project's test command run alone on the same snapshot" — `10-spec/30-nfr/nfr.md:75`; "(c) measured with a bundle of 10 commands that each print a fixed text and exit." — `…/nfr.md:77`; "Preparing and resetting a workspace is part of the analysis core's run: it counts in the test-run overhead (a) and the bundle overhead (c) of C001-NFR-018." — `10-spec/50-interfaces/evidence-runs.md:143-144`; "Workspaces stay with the process that runs the snapshot's jobs and are removed when that process ends." — `…/evidence-runs.md:49-50`; "installed dependencies (for example `node_modules/` or a virtual environment), restored packages, local settings" — `…/evidence-runs.md:53-54`; "Before a test run or a bundle command starts and after it ends, the evidence runner compares its workspace with the snapshot" — `…/evidence-runs.md:71-72`; "The ADR measures preparation and reset time against C001-NFR-018 (a) and (c) on the benchmark changes" — `10-spec/60-architecture/constraints.md:29`; P-01's option: "Test run with coverage ≤ 3.0× the project's own test time" — `10-spec/questions-log.md:197`
- **Why it matters:** when P-01 chose 3.0× (Q-evidence-time-01), the tool's run and "the project's test command run alone" ran in the same working tree. The numerator now also holds the copy of the snapshot's tree and of the ignored dependencies the ADR makes available. Build outputs are ignored and workspaces are removed when the process ends, so every new review session also starts with a cold build (for example a full `dotnet test` build of a large solution). The metric does not say where the denominator runs: in the developer's built working tree or in a fresh workspace. Read one way, ≤ 3.0 is likely missed on a large .NET or Node repository. Read the other way, the copy and cold-build cost fall under no threshold at all. (c) has the same gap: the first bundle command of a session can include the preparation of a workspace, and every command includes a reset and two comparisons over every path of the snapshot. The method does not say whether a workspace is ready. Unlike C001-NFR-005 (C001-AS-07), no assumption and no "if wrong" path exist; the ADR only measures.
- **Suggested fix:** Owner: spec-writer (`30-nfr/nfr.md` C001-NFR-018 metric and method). State the baseline of (a): following the wording of Q-evidence-time-01, the project's test command run alone in the developer's working tree in its usual built state. State whether the first preparation of a session counts in (a) and (c), and whether a workspace is ready when (c) is measured. Owner: architect (`10-context/scope.md` §3, `50-interfaces/evidence-runs.md` §2 item 3). Add an assumption with an "if wrong" path, for example keeping a snapshot's workspaces across sessions, or sending the threshold back to P-01, as C001-AS-07 does. Owner: test-designer: align C001-DOD-014.
- **Status:** resolved (focused re-review 2); the cost left under no threshold is assumption C001-AS-08 (gate notes, row 12); introduced: CR-25, CR-27

### CR-18 — C001-REQ-521 guarantees that no project process writes the working tree, which the analysis core cannot ensure
- **Severity:** major
- **Refs:** C001-REQ-521, C001-AC-521.1, C001-CON-22, C001-IF-013
- **Evidence:** "THE analysis core SHALL NOT change, through an evidence run, any file of the repository's working tree, the index, any branch, any tag or any commit, at any time from the start of the run" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:191`; the only exclusion is in the rationale and covers command text: "Outside this requirement: a test command or bundle command whose text names a path of the working tree (for example an absolute path) acts there as the developer's own command" — `…/CAP-05-review-evidence/requirements.md:192`; the interface expects working-tree code to run: "Execution reported for a file under the working-tree root (for example through an editable install or a link to a package of the working tree) counts for no hunk" — `10-spec/50-interfaces/evidence-runs.md:93-94`; commands run "with the developer's environment, unchanged" — `…/evidence-runs.md:18`; the scenarios write relative paths only: "And <run> rewrites <path> and writes the new file `tmp/run-output.txt` in its working directory" — `…/CAP-05-review-evidence/acceptance.md:597`
- **Why it matters:** Python projects are often installed in editable mode into a virtual environment that the developer's environment activates. A test run in the evidence workspace then imports the working-tree modules, and CPython by default writes `__pycache__` files next to them. Project code can also reach the working tree through absolute paths in its own configuration, through environment variables or through links. No constraint provides an operating-system sandbox, so the analysis core cannot prevent these writes. The statement ("any file", ignored files included per C001-CON-22) is therefore broken in a common setup, while C001-TS-559 to C001-TS-561 still pass. The same setup makes Python test execution count for no hunk (ERR-EVID-008). On such a repository nothing clears by the passing-tests rule, which bears on C001-AS-07 for the Python benchmark.
- **Suggested fix:** Owner: spec-writer (`CAP-05-review-evidence/requirements.md`). Restate C001-REQ-521 as what the core controls: the core itself writes nothing into the working tree, the index or the refs for a run (mutation tool included), and it starts every command with the workspace as working directory and no working-tree path supplied by the core. Move the exclusion into the statement and widen it to project code that addresses working-tree paths on its own. Optionally add an unwanted-behaviour requirement for the ERR-EVID-008 notice. Owner: architect (ADR under C001-CON-22): state how a Python virtual environment with an editable install is made to load the workspace. Owner: test-designer: add a scenario with an editable install that expects ERR-EVID-008.
- **Status:** resolved (focused re-review 2); the consequence for the Python benchmark of C001-NFR-005 is CR-23

### CR-19 — C001-REQ-604 and C001-REQ-616 refill an escalated rule's sample; C001-INV-16 says it takes in no hunk
- **Severity:** major
- **Refs:** C001-REQ-616, C001-REQ-604, C001-INV-16, C001-REQ-614, C001-AC-616.1
- **Evidence:** "adding hunks of the population while the sample holds fewer hunks than C001-REQ-604 sets" — `10-spec/20-capabilities/CAP-06-review-coverage/requirements.md:60`; "WHILE the sample population of a clearing rule in the snapshot is not empty, THE analysis core SHALL keep for reading a sample of that population, drawn at random for each review, that holds 10 % of the population's hunks" — `…/CAP-06-review-coverage/requirements.md:44`; against "The sample of an escalated rule takes in no further hunk" — `10-spec/40-domain/domain-model.md:396-397`, "| Unsampled | population changed | the rule is escalated | Unsampled | none: an escalated rule's sample takes in no hunk (C001-INV-16, C001-REQ-609) |" — `10-spec/40-domain/state-machines.md:230`, and "and takes in no hunk once its rule is escalated (C001-INV-16)" — `10-spec/60-architecture/architecture.md:211`; the only scenario keeps the sample above its target, so it cannot tell the two apart: "And the coverage statement lists the formatting rule with 2 hunks sampled, 2 sampled and read, and 1 defect reported" — `…/CAP-06-review-coverage/acceptance.md:228`
- **Why it matters:** take a rule that cleared 30 hunks and has 3 unread sampled hunks. The developer expands and reads 20 other hunks it cleared and reports a defect in one of them. The 10 unread hunks reopen, the sample is empty, and the population is the 20 read hunks, with a target of 2. Under C001-REQ-616, 2 read hunks enter the sample, and C001-REQ-614 reports "2 sampled, 2 sampled and read". Under C001-INV-16, the state machine and C001-COMP-012, it reports 0 sampled. The coverage statement stored with every later verdict (C001-REQ-712) therefore depends on which text the implementer follows. The conflict became visible with the CR-14 fix (`state-machines.md:48`).
- **Suggested fix:** Owner: spec-writer (`CAP-06-review-coverage/requirements.md`): limit C001-REQ-604 and C001-REQ-616 to rules that are not escalated (C001-REQ-609), or state the exception in C001-REQ-616. Owner: test-designer: add a scenario in which escalation leaves the sample below its target and the coverage statement keeps the counts from before the escalation.
- **Status:** resolved (focused re-review 2)

### CR-20 — C001-NFR-005 leaves the intent context of the benchmark changes open, and C001-REQ-504 makes that context decide test clearing
- **Severity:** major
- **Refs:** C001-NFR-005, C001-REQ-504, C001-DOD-015, C001-AS-07
- **Evidence:** "Test hunks in orphan code belong to no intent, so tests that execute them do not qualify." — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:45`; method step 3: "record the test judgement "expresses" on every intent under which a test hunk is grouped (C001-REQ-503)" — `10-spec/30-nfr/nfr.md:89`; environment: "no model provider (model-free mode)" — `…/nfr.md:90`; §0 fixes only the test command: "Each benchmark change names the test command that runs the test suite of its repository" — `…/nfr.md:25-26`; model-free link signals need a reference, for example "| Plan item names the file: the plan item from which the extracted intent was taken names the hunk's file path | medium | extracted intents taken from plan items |" — `10-spec/20-capabilities/CAP-03-intent-map/requirements.md:26`; the split has no reason for orphan tests: "a deterministic design-quality finding (C001-REQ-418), no clearing rule applies" — `…/nfr.md:87`
- **Why it matters:** in model-free mode, a new test file is grouped under an intent only when an agent commit, a named plan, a task or an ID in the code points to it. Which of these exist depends on the intent context given at intake, for example whether the agent plan is named or whether the agent committed, and §0 does not fix it. Step 3 cannot judge test hunks left in orphan code, and under C001-REQ-504 the code that only they execute stays open. Two measurements of the same benchmark change, one naming the plan file and one not, can therefore give very different open shares. A miss would then be reported as "no clearing rule applies" instead of under the orphan rule that causes it. The method also does not say whether hunk moves are allowed before the reading is taken.
- **Suggested fix:** Owner: spec-writer (`30-nfr/nfr.md` §0 and C001-NFR-005). For each benchmark change, fix the intent context given at intake: SDD change, named plan, pull-request text or transcript files, and the commits as the agent left them. State that no hunk is moved before the reading, and add "executed only by tests in orphan code" to the split. Owner: test-designer: align C001-DOD-015.
- **Status:** resolved (focused re-review 2); the environment of the Python benchmark is CR-23

### CR-21 — The intake summary does not warn when a branch of C001-REQ-104 yields HEAD itself as the base commit
- **Severity:** minor
- **Refs:** C001-REQ-114, C001-REQ-104, C001-AC-114.1
- **Evidence:** "how it was chosen (named by the developer; derived by C001-REQ-103 or C001-REQ-104 from a branch, with the name of that branch; or HEAD because no branch of C001-REQ-104 qualified)" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:121`; only the HEAD case carries the warning: "`merge base with default branch <ref>` (the default branch of the remote, local `main` or local `master`), or `HEAD (no upstream branch, no default branch of the remote, no local main or master with a merge base; only uncommitted edits are reviewed, name another base with --base)`" — `10-spec/50-interfaces/review-cli.md:91-93`
- **Why it matters:** take a repository without a default branch of the remote (no remote, or no `refs/remotes/<remote>/HEAD`), where HEAD is on a local `main` that has no upstream branch, for example an agent committing directly on `main` of a local repository. The merge base of HEAD and `main` is then HEAD. The summary says "merge base with default branch main", the agent's commits are left out, and nothing says that only uncommitted edits are reviewed. This is the effect of CR-1 in a narrower case, without the warning that the HEAD case gets.
- **Suggested fix:** Owner: spec-writer (C001-REQ-114) and architect (`50-interfaces/review-cli.md` §Output): whenever the base commit equals HEAD, whatever rule chose it, add "only uncommitted edits are reviewed, name another base with --base". Owner: test-designer: add a C001-TS-131 row with HEAD on local `main` and no remote.
- **Status:** resolved (focused re-review 2)

### CR-22 — Index and NFR file not updated for C001-CON-22, two lifecycles and the written DoD
- **Severity:** minor
- **Refs:** C001-CON-22, C001-NFR-005, C001-NFR-014, C001-REQ-722
- **Evidence:** "| CON | 21 (C001-CON-01 to C001-CON-08 in `10-context/scope.md`, C001-CON-09 to C001-CON-21 in `60-architecture/constraints.md`) |" — `10-spec/00-index.md:105`; "| `60-architecture/constraints.md` | Architecture constraints C001-CON-09 to C001-CON-21 |" — `…/00-index.md:78`; "| `40-domain/state-machines.md` | Lifecycles of hunk review state, intent verdict, review, test run, mutation evidence, clearing rule and model request |" — `…/00-index.md:61`, which leaves out §8 (sample membership) and §9 (grouping, which carries C001-REQ-722); "- **DoD:** set in `70-dod.md` (later step)." — `10-spec/30-nfr/nfr.md:92` (the same line on every NFR, and `nfr.md:11-12`), while C001-DOD-015 already covers C001-NFR-005 (`10-spec/70-dod.md:45`); "Test-file conventions per ecosystem are defined in `50-interfaces/` (later step)" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:20`
- **Why it matters:** a reader of the index misses C001-CON-22, the constraint that shapes every evidence run, and two lifecycles. The NFR file still says no DoD item exists.
- **Suggested fix:** Owner: spec-writer (`00-index.md`, `30-nfr/nfr.md`): count 22 constraints with the range up to C001-CON-22, list the nine lifecycles, name the DoD item of each NFR (C001-DOD-010 to C001-DOD-028) and drop "(later step)". Owner: test-designer: point `CAP-05-review-evidence/acceptance.md` to C001-IF-005 §10.
- **Status:** resolved (focused re-review 2)

### CR-23 — The benchmark environment of C001-NFR-005 leaves open whether the Python project is installed in editable mode from the working tree, which decides whether any Python hunk clears by passing tests
- **Severity:** major
- **Refs:** C001-NFR-005, C001-AS-07, C001-REQ-506, C001-TS-567, C001-DOD-015
- **Evidence:** "And the developer's environment activates the virtual environment `.venv` of the working tree, in which the package `shop` is installed in editable mode from the working tree, so that the test run imports `shop/cart/total.py` from the working tree and not from its evidence workspace" and "Then the evidence output records for line 22 of `shop/cart/total.py#3` no passing and no failing test" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:207`, `:209`; commands run "with the developer's environment, unchanged" — `10-spec/50-interfaces/evidence-runs.md:19`; the environment of the measurement names no installation: "default review configuration; no model provider (model-free mode); mutation-testing tools of the deep ecosystems installed." — `10-spec/30-nfr/nfr.md:99`; C001-NFR-018 has dependencies installed "in its working tree as a developer has them (for example `node_modules/`, a virtual environment, restored packages)" — `…/nfr.md:87`; the split ends with "no clearing rule applies." — `…/nfr.md:96`; and the remedy of C001-AS-07: "The public API recognition of C001-REQ-417 is narrowed (for example to symbols reachable from a package entry point or listed in `__all__`), or the threshold of C001-NFR-005 goes back to P-01; where orphan tests hold the share, the link signals that group test hunks under intents (C001-CAP-03) are revisited first" — `10-spec/10-context/scope.md:48`
- **Why it matters:** installing the project in editable mode into the virtual environment the developer works in is a common Python setup (`pip install -e .`; Poetry and uv also install the project itself in editable mode by default). When that environment is active and the import path does not put the workspace first (for example a `src/` layout run with `pytest`), every Python test executes working-tree copies. Per C001-REQ-506, no changed Python line then has a passing test, so no Python hunk clears by the passing-tests rule. §0 now fixes the intake (CR-20) but not this environment, so two measurements of the Python benchmark can differ by the whole test-cleared share. Lines executed only through working-tree copies count as not executed, so the split reports them under "no clearing rule applies", not under a reason of their own. A miss would point at the guards, and the "If wrong" path of C001-AS-07 would narrow the public API floor (gate notes, row 10) for a cause that lies in the environment. For users, the same setup gives no test clearing on Python, with only the advice of ERR-EVID-008.
- **Suggested fix:** Owner: spec-writer (`30-nfr/nfr.md` §0 and C001-NFR-005, `10-context/scope.md` C001-AS-07). For each reference repository, fix how its dependencies are installed and in which environment the review is started (for the Python one: whether the project is installed in editable mode, and whether that environment is active), for every measurement that starts a review of a benchmark change. Add the reason "executed only through working-tree files (ERR-EVID-008)" to the split, before "no clearing rule applies", and name it in the "If wrong" column of C001-AS-07. Owner: architect (ADR under C001-CON-22, `50-interfaces/evidence-runs.md` §4 item 1): decide whether the Python coverage adapter puts the workspace's sources ahead of an editable install of the working tree, through an environment variable that names only workspace paths (§9 item 1 allows it). If it does, C001-TS-567 changes; if not, state the limit in the user documentation (C001-DOD-032). Owner: test-designer: align C001-DOD-015.
- **Status:** resolved (focused re-review 3); the install of the Python project into the workspace that §0 now allows is CR-28

### CR-24 — C001-REQ-523 is realised by no component
- **Severity:** minor
- **Refs:** C001-REQ-523, C001-COMP-011
- **Evidence:** the responsibility names the behaviour: "observes the working tree and the repository's index and refs during every run and reports changes" — `10-spec/60-architecture/architecture.md:199-200`; the list of C001-COMP-011 stops at "C001-REQ-518, C001-REQ-521, C001-REQ-522, C001-NFR-018" — `…/architecture.md:202`; the flow "Triage and clearing with evidence" realises "C001-REQ-514, C001-REQ-515, C001-REQ-521, C001-REQ-522" — `…/architecture.md:311`; C001-REQ-523 occurs nowhere in `60-architecture/`
- **Why it matters:** each requirement must be served by a named component (D4). The plan derives tasks and impact from the Realizes lists, so the observation of the working tree and notice ERR-EVID-009 could end up under no task.
- **Suggested fix:** Owner: architect (`60-architecture/architecture.md`): add C001-REQ-523 to the Realizes list of C001-COMP-011 and to the flow "Triage and clearing with evidence"; optionally to the Source column of C001-CON-22.
- **Status:** resolved (focused re-review 3)

### CR-25 — Which workspace mutation testing takes is open, and C001-NFR-018 (b) and (c) depend on it
- **Severity:** minor
- **Refs:** C001-NFR-018, C001-IF-013, C001-REQ-514, C001-DOD-014
- **Evidence:** "(c) is measured with a bundle of 10 commands that each print a fixed text and exit, run after the test run of the same process so that its workspace is free." — `10-spec/30-nfr/nfr.md:86`; "WHEN a test run of the snapshot completes with test results, THE analysis core SHALL run mutation testing" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:138`; "The evidence runner prepares a workspace when a run of the snapshot needs one and none of the snapshot's workspaces is free." and "Mutation testing takes a workspace of its own" — `10-spec/50-interfaces/evidence-runs.md:45-46`, `:49-50`; "(b) mutation-testing time: wall-clock time from the end of that test run to the last mutation result recorded for the snapshot" and "Under no threshold of this NFR: the preparation of a workspace" — `…/nfr.md:84`; §8 places the workspace steps only for "**Test-run overhead (a).**" and "**Bundle overhead (c).**" — `…/evidence-runs.md:153`, `:160`
- **Why it matters:** mutation testing starts as soon as the test run ends. If it takes the freed workspace, as the rule of §2 item 3 reads, the bundle of (c) finds no free workspace, against its method, and runs while up to one mutation worker per core loads the CPU (§1 item 4). If it takes a newly prepared workspace, the interval of (b) contains a preparation and a cold build, which the metric says fall under no threshold. The two measurements of one process cannot both follow the text, and the test-designer has to guess the state in which (c) is measured.
- **Suggested fix:** Owner: architect (`50-interfaces/evidence-runs.md` §2 item 3 and §8): state whether mutation testing takes a newly prepared workspace or the free one, and add an item for (b) that places that preparation inside or outside it. Owner: spec-writer (`30-nfr/nfr.md` C001-NFR-018 Method): state whether (c) runs while mutation testing runs or after it has ended. Owner: test-designer: align C001-DOD-014.
- **Status:** resolved (focused re-review 3); introduced: CR-29, CR-32; the reading of (c) during mutation testing is gate notes row 15

### CR-26 — C001-REQ-523 has no outcome for a run whose observation of the working tree is incomplete
- **Severity:** minor
- **Refs:** C001-REQ-523, C001-AC-523.1, C001-IF-013
- **Evidence:** "IF a path under the working-tree root outside the git directory, ignored paths included, or the index, HEAD, a branch or a tag of the repository is created, changed or removed while the command of an evidence run runs, THEN THE analysis core SHALL notify the developer" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:199`; the runner observes "every path under the working-tree root (ignored paths included, the git directory excluded)" — `10-spec/50-interfaces/evidence-runs.md:203-204`; "The mechanism (file-system change notification, or a comparison of the size, modification time and existence of the paths before and after the run) is chosen by the ADR" — `…/evidence-runs.md:210-212`
- **Why it matters:** the observed ignored paths include dependency trees with tens of thousands of directories. File-system notification can drop events when its buffer overflows, or be refused when a per-user watch limit is reached (for example inotify on Linux), and a directory can be unreadable. The analysis core then does not know whether paths changed. The requirement has no error case for this, so an implementation may show no notice, and the developer reads the silence as "nothing changed". This notice is the only safeguard left for the exception of C001-REQ-521.
- **Suggested fix:** Owner: spec-writer (`CAP-05-review-evidence/requirements.md`): add an unwanted-behaviour requirement: if the observation of a run cannot cover every observed path for the whole run, notify the developer that the working tree was not fully observed during that run, naming the run and the part not observed. Owner: architect (`50-interfaces/errors.md`, `evidence-runs.md` §9 item 3): a notice code for it. Owner: test-designer: a scenario under the new requirement.
- **Status:** resolved (focused re-review 3); introduced: CR-30

### CR-27 — A mitigation offered for C001-AS-08 can make runs execute build outputs of working-tree content that the workspace check does not see
- **Severity:** minor
- **Refs:** C001-AS-08, C001-REQ-509, C001-IF-013, C001-CON-22
- **Evidence:** "or preparing build outputs in the workspace from those of the working tree (C001-IF-013 §8 item 3)" — `10-spec/10-context/scope.md:49`; "or preparing build" / "outputs in the workspace from those of the working tree" — `10-spec/50-interfaces/evidence-runs.md:172-173`; the check lets ignored paths pass: "no other path may exist unless the snapshot's ignore rules exclude it" — `…/evidence-runs.md:79`; and "IF a test run or an evidence-bundle command executes on file content that differs from the snapshot, THEN THE analysis core SHALL record none of its results as evidence" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:94`
- **Why it matters:** the working tree's build outputs were built from the developer's current files, which differ from the snapshot once the working tree has moved on (C001-REQ-117, C001-REQ-522). Incremental builds decide from time stamps or their own state files whether to rebuild, so outputs copied into the workspace can be reused for sources that differ from them. Tests would then run compiled code that is not the snapshot's, the workspace check would pass (build outputs are ignored paths), and the results would be recorded as evidence of the snapshot, against C001-REQ-509.
- **Suggested fix:** Owner: architect (`10-context/scope.md` C001-AS-08 "If wrong", `50-interfaces/evidence-runs.md` §8 item 3, C001-CON-22): limit the mitigation to build outputs produced from the snapshot's own content (for example kept from an earlier session of the same snapshot), or require the ADR to show that the build in the workspace cannot reuse an output whose inputs differ from the snapshot; otherwise drop the example.
- **Status:** resolved (focused re-review 3)

### CR-28 — The benchmark environment lets the Python project be installed as a copy in the evidence workspace, whose execution counts for no hunk and raises no notice
- **Severity:** major
- **Refs:** C001-NFR-005, C001-REQ-506, C001-IF-013, C001-AS-07, C001-DOD-015
- **Evidence:** "where its tests need the project itself installed, it is installed into" / "the evidence workspace from the workspace's content (for example by a preparation command," / "C001-IF-013 §2 item 4), never in editable mode or through a package link from the working tree" — `10-spec/30-nfr/nfr.md:43-45`; "With this environment, a test run of a benchmark change" / "raises no notice ERR-EVID-008 (C001-REQ-506)" — `…/nfr.md:50-51`; the attribution rule: "an executed line counts only when the executed file lies inside" / "the evidence workspace; it is mapped to the repository path relative to the workspace root." — `10-spec/50-interfaces/evidence-runs.md:128-129`; ERR-EVID-008 covers only the working tree: "Execution reported for a file under the working-tree root whose path relative to that root is" / "a file of the snapshot" — `…/evidence-runs.md:130-131`; the split: "the test run reported execution of the hunk's file under the working-tree root (C001-REQ-506, ERR-EVID-008); no clearing rule applies." — `…/nfr.md:114`; and the remedy: "Where hunks whose passing-test evidence was refused for working-tree execution (ERR-EVID-008) hold part of the share, the environment of the benchmark change broke `30-nfr/nfr.md` §0" … "Otherwise the threshold of C001-NFR-005 goes back to P-01" — `10-spec/10-context/scope.md:48`
- **Why it matters:** a regular install of the project into an environment of the workspace (for example `pip install .` as the preparation command) is the most direct reading of this sentence, and "never in editable mode" can be read as excluding editable installs altogether. Python then imports the installed copy, for example `<workspace>/.venv/lib/python3.12/site-packages/shop/cart/total.py`, whenever the import path does not put the workspace's sources first (a `src/` layout run with `pytest`). That file lies inside the workspace, but its relative path is not a file of the snapshot, so no added Python line gets a passing test. It lies outside the working-tree root, so ERR-EVID-008 is not raised, the §0 condition "raises no notice ERR-EVID-008" holds, and the split puts every such hunk under "no clearing rule applies". The "If wrong" path of C001-AS-07, which looks for an environment fault through ERR-EVID-008 first, does not find it, and the threshold goes back to P-01 for a cause that lies in the harness: the outcome CR-23 was raised to prevent. Mutation testing runs only on executed lines, so it adds nothing that would reveal the fault.
- **Suggested fix:** Owner: spec-writer (`30-nfr/nfr.md` §0 and the C001-NFR-005 Method). Require that the tests of each benchmark change import the project's modules from their snapshot paths in the evidence workspace: no installed copy of the project; where the tests need the project installed, an editable install from the workspace (for the copy that mutation testing takes, see CR-29), or the workspace's source root on the import path through the project's own test configuration. Add a validity check to the Method: a benchmark change whose test run records a passing test for no added line of a deep-ecosystem file is reported as an environment fault and measured again, as C001-AS-07 already does for ERR-EVID-008. Owner: test-designer: align C001-DOD-015. Optional, owner architect (`50-interfaces/evidence-runs.md` §4 item 2): a notice when a test run of a deep ecosystem reports execution of no file of the snapshot, which would also warn a developer whose environment holds an installed copy of the project.
- **Status:** resolved (focused re-review 4); the optional notice was not adopted (gate notes row 19)

### CR-29 — Nothing keeps the mutation copy from leading back into the workspace it was copied from
- **Severity:** minor
- **Refs:** C001-IF-013, C001-REQ-514, C001-REQ-515, C001-REQ-411, C001-CON-22
- **Evidence:** "Mutation testing takes a workspace of its own, so that no test run or" / "bundle run executes mutated code (§5)" — `10-spec/50-interfaces/evidence-runs.md:51-52`; "so it matches the snapshot and needs no" / "second cold build; it follows every rule of item 4." — `…/evidence-runs.md:56-57`; the rule of item 4 covers only the working tree and the git directory: "no path that the analysis" / "core makes available in the workspace, git metadata included, leads into the working tree or" / "into the git directory" — `…/evidence-runs.md:69-71`; the Python import rule redirects only working-tree files: "each module that a Python process of the run would" / "import from a file under the working-tree root" — `…/evidence-runs.md:89-90`; the ADR scope gives no outcome: "how the mutation copy is made;" — `10-spec/60-architecture/constraints.md:29`; and §0 puts the Python install in the workspace: "it is installed into" / "the evidence workspace from the workspace's content" — `10-spec/30-nfr/nfr.md:43-44`
- **Why it matters:** copying a directory does not relocate what in it names an absolute path. An editable install records the absolute path of the sources it points at (the `.pth` file or import finder that `pip install -e`, Poetry and uv write), a virtual environment records the absolute path of its interpreter in the headers of its scripts, and link farms or incremental-build state can do the same. If the test run's workspace holds an environment in which the project is installed in editable mode from that workspace, which is the form of the §0 install that keeps coverage attributed when the tests need the project installed (CR-28), the mutation copy still imports the project from the test run's workspace. The mutated files are never loaded, every mutant survives, and C001-REQ-411 reopens every test-cleared Python hunk with surviving mutants that are false (C001-REQ-515). §2 item 7 does not help, because it redirects only imports of working-tree files. Writes that a run in the copy makes through such paths land in the test run's workspace, where the check of §3 does not look at ignored paths.
- **Suggested fix:** Owner: architect (`50-interfaces/evidence-runs.md` §2 item 3, C001-CON-22). State that no path in a mutation copy leads into another evidence workspace, the test run's included, so that a run in the copy loads and writes only the copy's files and the third-party dependencies of item 4. Have the ADR show, for each deep ecosystem in the environment of its benchmark change, that a mutant applied in the copy is killed by a passing test that executes its line, and that the test run's workspace is unchanged after mutation testing. Owner: test-designer (optional): a scenario under C001-REQ-514 with the project installed in editable mode in the test run's workspace.
- **Status:** resolved (focused re-review 4); introduced, together with CR-32: CR-33

### CR-30 — C001-REQ-523 puts two notices with independent triggers under one SHALL and describes them as one notification
- **Severity:** minor
- **Refs:** C001-REQ-523, C001-AC-523.1, C001-TS-575, C001-IF-013
- **Evidence:** "or the analysis core cannot observe every one of these paths and refs for the whole command, THEN THE analysis core SHALL notify the developer with the run, the number of changed paths and up to 10 of them, stating that the run or another program changed them, and, when the observation was incomplete, stating that the working tree was not fully observed during the run and naming up to 10 of the paths it did not observe, or the whole working tree when it cannot name them" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:199`; "A notice of an incomplete observation may name 0 changed paths." — `…/CAP-05-review-evidence/requirements.md:200`; against the interface: "For each run with such a part, notice ERR-EVID-010 names the run, each cause," — `10-spec/50-interfaces/evidence-runs.md:291`, "or states that the whole working-tree" / "part or the whole repository part was not observed" — `…/evidence-runs.md:293-294`, "both notices can follow one run" — `…/evidence-runs.md:297`; "(<cause>: <up to 10 paths> / the whole working tree / the repository's index and refs)" — `10-spec/50-interfaces/errors.md:58`; the scenario: "And 0 changed paths are reported: no notice ERR-EVID-009 is shown" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:735`; the criterion states only the change notice: "raises a notice with the run, the count and up to 10 paths, and leaves the recording of the run's results unchanged" — `…/acceptance.md:667`; and the lifecycle: "reported with ERR-EVID-009 in this row and in the rows to Discarded and Unavailable (C001-REQ-521)" — `10-spec/40-domain/state-machines.md:149`
- **Why it matters:** the CR-26 fix put the incomplete-observation case into the condition and the response of C001-REQ-523 instead of a requirement of its own. Detecting a change and detecting a gap in the observation fail independently: an implementation can report every change it sees and never notice dropped events (R1). The interface gives them two notices that can both follow one run. Read alone, the statement asks for one notification that carries a count of changed paths even when nothing changed, and its rationale says so, while C001-TS-575 expects no ERR-EVID-009 at all. The statement also says "the working tree was not fully observed" when only the index or the refs were not observed. C001-AC-523.1 states only the change notice. Its one incomplete-observation scenario covers the watch-limit cause; lost events, the case that led to CR-26, and the forms "the whole working tree" and "the repository's index and refs" are not tested. The test-run lifecycle still attributes ERR-EVID-009 to C001-REQ-521 and does not name ERR-EVID-010.
- **Suggested fix:** Owner: spec-writer (`CAP-05-review-evidence/requirements.md`): move the incomplete-observation case into an unwanted-behaviour requirement of its own that names the run, the cause and the part not observed (paths of the working tree, or the index and refs); leave C001-REQ-523 with the change notice and drop "may name 0 changed paths". Owner: test-designer: an acceptance criterion for the new requirement, with scenarios for lost events and for an index or ref that cannot be observed. Owner: architect (`40-domain/state-machines.md` §4): cite C001-REQ-523 for ERR-EVID-009 and name ERR-EVID-010.
- **Status:** resolved (focused re-review 4)

### CR-31 — The C001-REQ-417 rationale still lets the public API recognition be narrowed without P-01
- **Severity:** minor
- **Refs:** C001-REQ-417, C001-AS-07
- **Evidence:** "if it is not, this recognition is narrowed (for example to symbols reachable from a package entry point or listed in `__all__`) or the target goes back to P-01." — `10-spec/20-capabilities/CAP-04-risk-triage/requirements.md:156`; against "A narrowing of the public API recognition of C001-REQ-417 (for example to symbols reachable from a package entry point or listed in `__all__`) is decided by P-01 on a proposal that gives the measured split by reason; no specialist narrows it (Q-clearing-06)." — `10-spec/10-context/scope.md:48`; P-01's answer: "**Answer:** You decide (Recommended)" — `10-spec/questions-log.md:324`
- **Why it matters:** Q-clearing-06 made a narrowing of this guard P-01's decision, taken on a proposal with the measured split, and C001-AS-07 now says so and checks the environment and the link signals first. The requirement that defines the guard still says, in the passive, that the recognition "is narrowed" when 30 % is missed, offers it as the first remedy and names P-01 only for the target. An implementer or a later change reads the requirement, not the assumption table, so two texts give two procedures for loosening a floor P-01 set (Q-clearing-01, Q-clearing-02).
- **Suggested fix:** Owner: spec-writer (`CAP-04-risk-triage/requirements.md`, C001-REQ-417 rationale): replace the clause with a pointer, for example "if it is not, the 'If wrong' path of C001-AS-07 applies; only P-01 narrows this recognition (Q-clearing-06)".
- **Status:** resolved (focused re-review 4)

### CR-32 — The test run's workspace is not free while mutation testing copies it, and the (c) method does not exclude that window
- **Severity:** minor
- **Refs:** C001-NFR-018, C001-IF-013, C001-DOD-014
- **Evidence:** "the evidence runner copies that workspace, ignored paths" / "included, before any other run takes it" — `10-spec/50-interfaces/evidence-runs.md:53-54`; "The evidence runner prepares a workspace when a run of the snapshot" / "needs one and none of the snapshot's workspaces is free." — `…/evidence-runs.md:45-46`; "so a workspace is free after the test run whether mutation testing still runs" / "or has ended" — `…/evidence-runs.md:195-196`; (b) counts the copy as mutation testing: "(b) mutation-testing time: wall-clock time from the end of that test run to the last mutation result recorded for the snapshot (C001-REQ-514); every step between these two points counts, including the copy of the test run's workspace that mutation testing takes" — `10-spec/30-nfr/nfr.md:102`; and "(c) is measured with a bundle of 10 commands that each print a fixed text and exit, run in the same process after its test run of the snapshot has ended, in that test run's workspace, which is free whether or not mutation testing of the snapshot is still running (C001-IF-013 §8 item 2); the threshold holds in both states, so of the 3 runs per benchmark change at least one starts while mutation testing runs and at least one after it has ended." — `…/nfr.md:104`
- **Why it matters:** (b) starts at the end of the test run and counts the copy, so mutation testing "runs" from that moment, but the test run's workspace is not free until the copy is made. A copy of a workspace with its installed dependencies (`node_modules/`, a virtual environment) and build outputs takes seconds to minutes. A (c) run started in that window, which is the obvious way to get a run "while mutation testing runs", either waits for the copy or, by the rule of §2 item 3, gets a newly prepared workspace with a cold build. Either way the measured overhead holds far more than 1 s, or a preparation that (c) excludes. Users meet the same window: a bundle run asked for just after the test run waits or pays for a preparation.
- **Suggested fix:** Owner: spec-writer (`30-nfr/nfr.md` C001-NFR-018 Method): start the run of (c) taken during mutation testing after the mutation copy has been made. Owner: architect (`50-interfaces/evidence-runs.md` §2 item 3 and §8 item 2): state that a run that asks for the test run's workspace during the copy waits for the copy instead of having a workspace prepared (or state the opposite), and correct "free after the test run whether mutation testing still runs". Owner: test-designer: align C001-DOD-014.
- **Status:** resolved (focused re-review 4); introduced: CR-33 (together with CR-29), CR-34, CR-35

### CR-33 — The domain model and the mutation-evidence lifecycle lack the copy window, the copy's lifetime and the two new unavailable outcomes; no scenario covers a failed copy
- **Severity:** minor
- **Refs:** C001-REQ-516, C001-AC-516.1, C001-IF-013, C001-REQ-514, C001-COMP-011
- **Evidence:** the interface: "From the end of that check to the end of the copy, the test run's workspace is" / "taken by the copy: no run uses it and it is not free." — `10-spec/50-interfaces/evidence-runs.md:64-65`; "The copy is removed when mutation testing of the snapshot ends, because" / "its ignored paths may hold build outputs of mutated code; it is never reset for another run." — `…/evidence-runs.md:62-63`; "a failed copy is" / "removed, and the mutation evidence of every hunk that mutation testing was to take is recorded" / "as unavailable with the cause" — `…/evidence-runs.md:68-70`; "No mutant of such a file counts as" / "killed or surviving: the mutation evidence of each of its hunks is recorded as unavailable with" — `…/evidence-runs.md:196-197`; against the entity: "| state | preparing, free, in use | in use by at most one run (C001-IF-013 §2 item 3) |" — `10-spec/40-domain/domain-model.md:492`, "- **Content:** the files of the snapshot, filled and reset as in C001-IF-013 §2; ignored paths as" — `…/domain-model.md:495`, "- **Lifetime:** created when a run needs one, removed when the process that runs the snapshot's" / "jobs ends" — `…/domain-model.md:497-498`, "reported, not prevented: ERR-EVID-008 for execution, ERR-EVID-009 for changes" — `…/domain-model.md:504`; the lifecycle's only routes to Unavailable: "| Waiting | test run Unavailable or Discarded, or no mutation tool for the ecosystem | — | Unavailable | reason recorded, ERR-EVID-006 (C001-REQ-516) |" — `10-spec/40-domain/state-machines.md:171`, "| Running | tool error, time-out or session end without completion | — | Unavailable | reason recorded (C001-REQ-516); test evidence has strength 3 (C001-REQ-518) |" — `…/state-machines.md:173`; and the examples of C001-TS-545: "no mutation-testing tool for C#/.NET is installed" and "the developer cancels mutation testing before it reaches the hunk" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:547-548`
- **Why it matters:** the CR-29 and CR-32 fixes reached the interface, the error catalogue, C001-COMP-011, the flow and the sequence, but not the domain model or the mutation-evidence lifecycle. During the copy window the test run's workspace is in none of the three states of the entity: it is not preparing, not free, and "no run uses it", so an implementer working from the domain model has no state that makes a bundle run wait (C001-TS-582) rather than get a newly prepared workspace. The mutation copy is an evidence workspace that is never reset and is removed when mutation testing ends, against the entity's content and lifetime bullets. The lifecycle has no transition for a failed copy, nor for a hunk whose file the self-containment check finds loaded outside the copy; neither "tool error, time-out or session end without completion" nor "no mutation tool" names them, and ERR-EVID-011 occurs nowhere in `state-machines.md` or `domain-model.md`. The failed copy, which makes the mutation evidence of every hunk unavailable at once, has no scenario (A4), so C001-DOD-005 does not test it.
- **Suggested fix:** Owner: architect (`40-domain/domain-model.md` §2.25, `40-domain/state-machines.md` §5). Give EvidenceWorkspace a state for the copy window (for example "copying": taken by the mutation copy, not free, a run that needs it waits), or state that the copy holds the workspace "in use" for the mutation run; state the mutation copy's lifetime (removed when mutation testing ends) and that it is never reset; name ERR-EVID-010 and ERR-EVID-011 in the last bullet. Add to §5 a transition to Unavailable for a failed copy (ERR-EVID-006) and one for a hunk whose file the self-containment check reports loaded outside the copy (reason "loaded outside the mutation workspace", ERR-EVID-011, C001-REQ-516). Owner: test-designer (`CAP-05-review-evidence/acceptance.md`, C001-AC-516.1): a scenario in which the copy fails (for example for lack of disk space): every hunk mutation testing was to take gets unavailable mutation evidence with ERR-EVID-006, the partial copy is removed and the test run's workspace is free afterwards.
- **Status:** resolved (focused re-review 8, checked outside the earlier briefs)

### CR-34 — C001-TS-582 and C001-TS-583 put the 1 s threshold of C001-NFR-018 (c) into acceptance tests that must pass on every CI runner
- **Severity:** minor
- **Refs:** C001-TS-582, C001-TS-583, C001-REQ-512, C001-NFR-018, C001-DOD-005, C001-DOD-027
- **Evidence:** "And the evidence-bundle overhead (c) of C001-NFR-018 for the command, taken from the end of the copy instead of from the run action, is at most 1 s" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:435`; "And the evidence-bundle overhead (c) of C001-NFR-018 is at most 1 s for each of the 10 commands" — `…/acceptance.md:444`; the NFR's environment: "- **Environment:** reference machine; benchmark changes (§0) with their test command, intake and environment," — `10-spec/30-nfr/nfr.md:115`, with "8 logical CPU cores, 16 GiB RAM, SSD storage, no other user workload" — `…/nfr.md:15`; the DoD items that run every scenario: "Every scenario of `20-capabilities/CAP-05-review-evidence/acceptance.md` runs as an automated acceptance test and passes in CI at the closing commit" — `10-spec/70-dod.md:36`, "The acceptance suite passes at 100 % on CI runners of Windows 11 x86-64, macOS 14 or later on x86-64 and on arm64, and Ubuntu 22.04 LTS or later on x86-64" — `…/70-dod.md:58`
- **Why it matters:** these are the only acceptance scenarios of the specification that assert an NFR time threshold; every other threshold is checked by a benchmark-report item on the reference machine (C001-DOD-010 to C001-DOD-014). C001-NFR-018 sets 1 s for the reference machine with no other workload and for benchmark changes. CI runners are shared, often smaller, virtualised machines whose load the suite does not control, and the time the core adds holds a reset, two checks and the observation of the working tree. The two scenarios can then fail in CI although the NFR holds, or pass on the small `shop-ts` fixture while it fails on a benchmark change; either way C001-DOD-005 and C001-DOD-027 depend on the runner. This is the caution the test-designer raised. What the scenarios exist for is observable without a time bound: the run waits for the copy, then runs in the test run's workspace with no workspace prepared (C001-TS-582), and bundle runs go on in that workspace while mutation testing runs (C001-TS-583).
- **Suggested fix:** Owner: test-designer (`CAP-05-review-evidence/acceptance.md`, `70-dod.md`). Drop the 1 s assertions from C001-TS-582 and C001-TS-583 and keep their behavioural assertions; the bound stays with C001-DOD-014, which already reports (c) in both states with no wait for the copy. If a time check in the acceptance suite is wanted, assert a bound that holds on CI and state that the 1 s threshold is checked only by C001-DOD-014; or name the reference machine in the Given and exclude the two scenarios from the CI matrix of C001-DOD-027. P-01 can waive this finding at G2 instead.
- **Status:** resolved (focused re-review 8, checked outside the earlier briefs)

### CR-35 — Q-copy-window-01 was applied without the assumption marker that Q-fatigue-01 promised
- **Severity:** minor
- **Refs:** C001-IF-013, C001-NFR-018, C001-DOD-014
- **Evidence:** "Use recommendations (Recommended) — Resolve remaining non-blocking questions with their recommended options; each is logged and marked as an assumption you can review at G2." — `10-spec/questions-log.md:356`; "**Answer:** (fatigue guard — recommended option applied)" — `…/questions-log.md:371`; the rule applied, with no marker and no citation of the question: "A run of the snapshot that needs a" / "workspace in this window while no other workspace of the snapshot is free waits until the copy" / "ends and then takes the test run's workspace; no workspace is prepared for it." — `10-spec/50-interfaces/evidence-runs.md:65-67`; "Not" / "included: the preparation of a workspace, and the wait of a run asked for during the copy" / "window." — `…/evidence-runs.md:244-246`; Q-copy-window-01 occurs in no file of `10-spec/` other than `questions-log.md`, and the generated list has "Total: 13" (`10-spec/85-open-items.md:12`), none of them for it
- **Why it matters:** P-01 accepted the fatigue guard on the condition that each recommendation applied is marked as an assumption to review at G2. The copy-window rule decides that a bundle run asked for just after the test run waits for the copy, and that this wait falls under no threshold of C001-NFR-018. Without the marker at the rule, the open-items list that P-01 reviews at G2 does not show it, and a later reader of the interface cannot tell that P-01 did not choose it.
- **Suggested fix:** Owner: architect (`50-interfaces/evidence-runs.md` §2 item 3, optionally §8 item 2): add the marker `[ASSUMPTION: Q-copy-window-01]` to the copy-window rule, outside backticks so that it counts; then the conductor runs `sdd trace 001 --write` so that `85-open-items.md` lists it. Until then, gate notes row 18 shows it to P-01.
- **Status:** resolved (focused re-review 5)

## Rubric
| Rubric | Item | Result |
|---|---|---|
| stories | S1 Persona is a defined P-ID | pass |
| stories | S2 Value / outcome stated | pass |
| stories | S3 INVEST | pass |
| stories | S4 Every story has ≥ 1 requirement | pass |
| stories | S5 Out of scope stated where a neighbour exists | pass |
| stories | S6 Traces to the ideation | pass |
| requirements | R1 Singular outcome | pass |
| requirements | R2 Testable | pass |
| requirements | R3 Unambiguous | CR-5, CR-13 |
| requirements | R4 Correct EARS pattern | pass |
| requirements | R5 Implementation-free | pass |
| requirements | R6 Complete | CR-6, CR-9 |
| requirements | R7 Consistent | CR-1, CR-4, CR-8, CR-16 |
| requirements | R8 Feasible | CR-2, CR-3 |
| requirements | R9 Necessary | pass |
| requirements | R10 Measurable values carry units and limits | pass |
| requirements | R11 Delta and evidence | n/a: greenfield change, no living spec (`10-context/current-state.md`) |
| requirements | R12 Priority set and consistent with the story | pass |
| NFRs | N1 ISO 25010 category | pass |
| NFRs | N2 Metric with unit | pass |
| NFRs | N3 Threshold set | pass |
| NFRs | N4 Feasible method and environment | CR-3, CR-6 |
| NFRs | N5 Covered by a DoD item | pass |
| acceptance | A1 Every REQ has ≥ 1 AC, every AC ≥ 1 scenario | pass |
| acceptance | A2 Scenarios observable and concrete | CR-5 |
| acceptance | A3 One behaviour per scenario | pass |
| acceptance | A4 Error and abuse cases present | CR-4, CR-7 |
| acceptance | A5 `n/a` cells justified credibly | pass |
| domain, interfaces, architecture | D1 Entities with attributes, relationships, owner, invariants | pass |
| domain, interfaces, architecture | D2 Lifecycles > 2 states have a diagram and a complete transition table | CR-14 |
| domain, interfaces, architecture | D3 Interfaces parse and name their errors | pass |
| domain, interfaces, architecture | D4 Every component has an ID, responsibilities, requirements served | pass |
| domain, interfaces, architecture | D5 Decisions with alternatives recorded | CR-15 |
| DoD and index | O1 Every REQ and NFR covered | pass |
| DoD and index | O2 Evidence types fit the statements | pass |
| DoD and index | O3 Global items referenced | pass |
| DoD and index | X1 The index is navigation only | CR-12 |

The ideation rubric (I1–I10) and the plan rubric (P1–P7) do not apply to the 10-spec phase. This
table is the result of the first review; the rubrics of the focused re-reviews are in their
sections.

Notes on rows marked pass:
- **R9 / scope:** every feature maps to `ideation.md` §5 or to the paradigms 6, 7, 8, 15 and 16
  of Q-extras-01. Walkthrough order (paradigms 11 and 17) is part of the approved core flow
  (`ideation.md` §8). Design-quality findings are in §5. The spec-edit flag of C001-REQ-328 is
  a guard derived from Q-drift-01, not paradigm 13 (spec-delta review). No scope creep found.
- **Questions log:** each answer of rounds 1–9 is reflected in the artifact it names. The one
  gap is Q-identity-02, which is only partly reflected in C001-REQ-721 (CR-4). Q-languages-01's
  extracted instruction ("+ C# / .Net") is applied in `10-context/scope.md` §1, C001-NFR-008 and
  `builtin-policy.md` §8, §10.
- **Error codes and check order:** the codes cited by requirements match `errors.md`, except the
  stale open items of CR-11. The write-operation check order (`core-api.md` §4: IDs, inputs,
  review state, git identity, confirmation, save) is the same in `errors.md` (ERR-ACT-006),
  `review-cli.md`, `openapi.yaml`, `state-machines.md` and C001-TS-760.

## Decisions for P-01
Specialist choices named in the brief, checked against the ideation and the questions log.

| Choice | Where | Goes to P-01? | Reason |
|---|---|---|---|
| Default base commit: merge base with upstream, else HEAD | C001-REQ-103, C001-REQ-104 | answered: Q-intake-01, round 10 | CR-1 resolved; refinements in the gate notes of focused re-review 2 (rows 1 and 2) |
| Changed tests qualify only after the developer's judgement | C001-REQ-504 | answered: Q-clearing-05, round 10 | CR-2 resolved; the orphan-test consequence is in the gate notes (row 3) |
| No executable line gives test coverage 0 | C001-REQ-401 | no | only affects ordering; same conservative direction as C001-REQ-404; clears nothing |
| A judgement on an intent without test hunks is refused | C001-REQ-520 | no | refuses an entry with no object; no effect on clearing |
| No reused developer-intent names | C001-REQ-719 | no | follows from the intent-key rule; case handling is CR-10 |
| A rejected orphan hunk later grouped is decided by its intent's verdict | `state-machines.md` §9 | no | the developer's own later act; needs a requirement and a scenario (CR-9) |
| A surviving mutant reopens a test-cleared hunk | C001-REQ-411 | no | P-01 weighed late reopening in Q-evidence-time-01 ("can reopen hunks you already passed") and chose Balanced |
| Default reading rate 300 changed lines per hour | C001-REQ-611 | no | low end of the cited 300–500 range; the developer can set another rate |
| Zero off-machine connections by default, no telemetry or update check | C001-NFR-011, C001-CON-11 | no | a stricter, measurable proxy for C001-SC-07 within G-7; reversible in a later change (see CR-16 for the wording of C001-SC-07) |
| Intent order (test hunks, not cleared before cleared, risk, definition before use) | C001-REQ-403, C001-REQ-502 | no | follows C001-US-307 and paradigms 6, 11 and 17 of the approved core flow |

## Focused re-review 1

**Scope.** The fixes for CR-1 to CR-16 after round 10 of `10-spec/questions-log.md` (Q-intake-01,
Q-clearing-05), and what those fixes introduced. Inputs as above, plus round 10.
`sdd lint 001 --phase 10-spec --json`: 0 errors, 0 warnings, 0 infos. `sdd trace 001`: TR-01
55 / 55, TR-02 203 / 203, TR-03 203 / 203, TR-04 18 / 18, TR-05 203 / 203 and 18 / 18; 20 open
items, which are the 12 of `10-spec/85-open-items.md` ("Total: 12", line 12) and the 8 of
`00-ideation/85-open-items.md` ("Total: 8", line 12).

**Reviewed set** (changed IDs and the IDs linked to them): C001-REQ-104, C001-AC-104.1,
C001-TS-108, C001-TS-109, C001-TS-116, C001-TS-156, C001-TS-157, C001-TS-158, C001-TS-159,
C001-REQ-114, C001-AC-114.1, C001-TS-131, C001-TS-132, C001-TS-160, C001-US-101, C001-US-102,
C001-IF-001, C001-IF-012, C001-REQ-123, C001-AC-123.1, C001-REQ-207, C001-REQ-211,
C001-AC-211.1, C001-TS-260, C001-REQ-410, C001-REQ-411, C001-REQ-417, C001-REQ-504,
C001-AC-504.1, C001-TS-509, C001-TS-510, C001-TS-511, C001-REQ-509, C001-REQ-520,
C001-REQ-521, C001-AC-521.1, C001-TS-559, C001-TS-560, C001-TS-561, C001-TS-562, C001-REQ-522,
C001-AC-522.1, C001-TS-563, C001-TS-564, C001-TS-565, C001-TS-566, C001-US-501, C001-US-502,
C001-US-503, C001-US-504, C001-REQ-604, C001-REQ-606, C001-TS-620, C001-TS-652, C001-REQ-615,
C001-REQ-616, C001-TS-651, C001-REQ-617, C001-AC-617.1, C001-TS-648, C001-TS-649, C001-TS-650,
C001-US-604, C001-REQ-711, C001-REQ-719, C001-AC-719.1, C001-TS-754, C001-TS-755, C001-REQ-721,
C001-AC-721.1, C001-TS-759, C001-TS-765, C001-REQ-722, C001-AC-722.1, C001-TS-766, C001-TS-767,
C001-TS-768, C001-US-704, C001-US-705, C001-REQ-907, C001-AC-907.1, C001-TS-914, C001-REQ-918,
C001-AC-918.1, C001-TS-949, C001-REQ-920, C001-AC-920.1, C001-TS-944, C001-NFR-005,
C001-NFR-014, C001-NFR-018, C001-SC-02, C001-SC-07, C001-AS-07, C001-CON-16, C001-CON-22,
C001-INV-16, C001-IF-003, C001-IF-009, C001-IF-013, C001-COMP-011, C001-COMP-012,
C001-COMP-013, C001-COMP-014, C001-DOD-014, C001-DOD-015, C001-DOD-025; and the glossary,
`00-index.md`, `state-machines.md` §1, §8, §9, `domain-model.md` §2.19 to §2.25 and §3,
`architecture.md` §2, §4.2, §4.3 and `errors.md`, as far as they concern these IDs.

**Open after focused re-review 1:** 0 blocker, 4 major (CR-17, CR-18, CR-19, CR-20), 3 minor
(CR-7, CR-21, CR-22).

### Status of CR-1 to CR-16
| Finding | Status | Evidence of the fix |
|---|---|---|
| CR-1 | resolved | "THE analysis core SHALL use as the base commit the merge base of HEAD and the first branch of this list that exists and has a merge base with HEAD: the default branch of the remote, a local branch named `main`, a local branch named `master`; and HEAD itself when no branch of the list qualifies." — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:40`, matching "**Answer:** Merge base w/ default (Recommended)" — `10-spec/questions-log.md:286`; agent commits are covered by "Scenario: C001-TS-108 — Agent commits on a local branch without upstream are reviewed against the default branch of the remote" — `…/CAP-01-change-intake/acceptance.md:113`. Narrower case left: CR-21 |
| CR-2 | resolved | "Q-clearing-05 (judge first, measure after): kept as stated" and "a changed helper outside every test hunk is code under review, needs no judgement and is cleared or left open on its own evidence" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:45`, matching "**Answer:** Judge first, measure after (Recommended)" — `10-spec/questions-log.md:298` |
| CR-3 | resolved | "(1) start the review with the benchmark change's test command given as the test command of the review (C001-REQ-505)" — `10-spec/30-nfr/nfr.md:89`; the reachability of 30 % is the stated assumption "not yet estimated. To be checked by an estimate of the open share, split by guarded area, on one sample agent change per deep ecosystem" — `10-spec/10-context/scope.md:48`. New gap in the method: CR-20 |
| CR-4 | resolved | "(marking hunks read, reopening a hunk, moving a hunk, creating an intent, rejecting a hunk of orphan code, recording a test judgement, reporting a defect, stating a time budget or reading rate, adding or confirming an evidence-bundle command, or giving a verdict)" — `10-spec/20-capabilities/CAP-07-verdicts/requirements.md:173`; C001-TS-759 has rows such as "reopens "src/format.ts" lines 3-8" — `…/CAP-07-verdicts/acceptance.md:644`; the stale open item is gone |
| CR-5 | resolved | "which includes every recorded action, every run of an evidence bundle and every cancellation of a running job" — `10-spec/20-capabilities/CAP-09-review-surfaces/requirements.md:53`; "THE analysis core SHALL save every review record entry that the action writes to persistent storage before it confirms the action." — `…/CAP-09-review-surfaces/requirements.md:157`; "THE review assistant SHALL keep every review record entry that it confirmed to the developer before the end." — `10-spec/30-nfr/nfr.md:213`; "sampling result … It is not an entry kind of its own" — `10-spec/40-domain/glossary-delta.md:157` |
| CR-6 | resolved | "Every run happens in an evidence workspace (§2), never in the developer's working tree" — `10-spec/50-interfaces/evidence-runs.md:13-14`; "THE analysis core SHALL perform the evidence runs of the snapshot, including those already in progress when the difference arose, on the content of the snapshot" — `…/CAP-05-review-evidence/requirements.md:199`; "Scenario Outline: C001-TS-560 — A mutation run that ends early leaves no mutated code in the working tree" — `…/CAP-05-review-evidence/acceptance.md:609`. Introduced: CR-17, CR-18 |
| CR-7 | open | not addressed: C001-AC-123.1 still has only "C001-TS-151 — A damaged task file is left out and the other spec items are read", C001-TS-152 and C001-TS-153 — `10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:625`, `:640`, `:649` |
| CR-8 | resolved | "THE analysis core SHALL take the components, layers and allowed dependencies of the architecture delta from the first source in that order that holds one." — `10-spec/20-capabilities/CAP-02-architecture-delta/requirements.md:79`; "no documented architecture was found in the sources that the review reads it from" — `…/CAP-02-architecture-delta/requirements.md:130`; "An architecture held in a place that the source order does not name is not read." — `10-spec/40-domain/glossary-delta.md:81` (the optional fallback was not adopted; the limit is stated and tested by C001-TS-260) |
| CR-9 | resolved | "THE analysis core SHALL report that hunk as decided by the current verdict of that intent and no longer as a rejected hunk of orphan code, keeping its rejection entry in the review record." — `10-spec/20-capabilities/CAP-07-verdicts/requirements.md:181`; "Scenario: C001-TS-767 — Rejected, moved to an intent and signed: the signature decides the hunk" — `…/CAP-07-verdicts/acceptance.md:721` |
| CR-10 | resolved | "when both names are compared after whitespace collapsing and Unicode case folding" — `10-spec/20-capabilities/CAP-07-verdicts/requirements.md:157`; refused in C001-TS-754: "| "add retry logging"      |" — `…/CAP-07-verdicts/acceptance.md:564` |
| CR-11 | resolved | "the CLI has no budget option (C001-IF-001). Error ERR-ACT-008" — `10-spec/20-capabilities/CAP-06-review-coverage/requirements.md:135`; "ERR-ACT-009 for a name already used" — `10-spec/20-capabilities/CAP-07-verdicts/requirements.md:158` |
| CR-12 | resolved | "| AC | one or more per requirement; current count and coverage: `80-traceability.md` (generated) |" — `10-spec/00-index.md:110`. Withdrawn part: the 20 open items of `sdd trace 001` are the 12 of `10-spec/85-open-items.md` plus the 8 of `00-ideation/85-open-items.md`, so the generated file was not stale. New stale counts: CR-22 |
| CR-13 | resolved | "one review record entry per recorded action, and one per escalation that a defect report causes" — `10-spec/40-domain/glossary-delta.md:172`; "The developer's statement, with a text, that a hunk contains a defect" — `…/glossary-delta.md:156`; "And the review record holds a defect report on `src/coupon/apply.ts#1` with the text "discount applied twice" that names no clearing rule" — `10-spec/20-capabilities/CAP-06-review-coverage/acceptance.md:212` |
| CR-14 | resolved | "| Read | the passing-tests conditions stop holding (later mutant, failed run, test judgement) | the passing-tests rule cleared the hunk | Read |" and "| Read | escalation of a rule that cleared the hunk | — | Read |" — `10-spec/40-domain/state-machines.md:47`, `:48`. Brought out: CR-19 |
| CR-15 | resolved | "| Record files committed in the repository (for example under `.sdd-review/records/`) |" … "| rejected |" — `10-spec/60-architecture/architecture.md:396`, with three other options in the table of §4.3 (`:393-398`) |
| CR-16 | resolved | "excluding the network use of the project's own test and evidence-bundle commands that the review runs (C001-REQ-803)" — `10-spec/10-context/problem-and-goals.md:42`; the intake summary now names the test command (C001-REQ-114, C001-TS-160) |

### Rubric (reviewed set)
| Rubric | Item | Result |
|---|---|---|
| stories | S1 Persona is a defined P-ID | pass |
| stories | S2 Value / outcome stated | pass |
| stories | S3 INVEST | pass |
| stories | S4 Every story has ≥ 1 requirement | pass |
| stories | S5 Out of scope stated where a neighbour exists | pass |
| stories | S6 Traces to the ideation | pass |
| requirements | R1 Singular outcome | pass |
| requirements | R2 Testable | pass |
| requirements | R3 Unambiguous | pass |
| requirements | R4 Correct EARS pattern | pass |
| requirements | R5 Implementation-free | pass |
| requirements | R6 Complete | CR-21 |
| requirements | R7 Consistent | CR-19 |
| requirements | R8 Feasible | CR-18 |
| requirements | R9 Necessary | pass |
| requirements | R10 Measurable values carry units and limits | pass |
| requirements | R11 Delta and evidence | n/a: greenfield change, no living spec (`10-context/current-state.md`) |
| requirements | R12 Priority set and consistent with the story | pass |
| NFRs | N1 ISO 25010 category | pass |
| NFRs | N2 Metric with unit | pass |
| NFRs | N3 Threshold set | pass |
| NFRs | N4 Feasible method and environment | CR-17, CR-20 |
| NFRs | N5 Covered by a DoD item | pass |
| acceptance | A1 Every REQ has ≥ 1 AC, every AC ≥ 1 scenario | pass |
| acceptance | A2 Scenarios observable and concrete | pass |
| acceptance | A3 One behaviour per scenario | pass |
| acceptance | A4 Error and abuse cases present | CR-7, CR-18, CR-19 |
| acceptance | A5 `n/a` cells justified credibly | pass |
| domain, interfaces, architecture | D1 Entities with attributes, relationships, owner, invariants | pass |
| domain, interfaces, architecture | D2 Lifecycles > 2 states have a diagram and a complete transition table | pass |
| domain, interfaces, architecture | D3 Interfaces parse and name their errors | pass |
| domain, interfaces, architecture | D4 Every component has an ID, responsibilities, requirements served | pass |
| domain, interfaces, architecture | D5 Decisions with alternatives recorded | pass |
| DoD and index | O1 Every REQ and NFR covered | pass |
| DoD and index | O2 Evidence types fit the statements | pass |
| DoD and index | O3 Global items referenced | pass |
| DoD and index | X1 The index is navigation only | CR-22 |

Notes on rows marked pass:
- **R1, R4:** C001-REQ-918 restores entries, state and samples as one outcome verified together
  (C001-TS-949); C001-REQ-104 (complex), C001-REQ-521 (ubiquitous SHALL NOT), C001-REQ-522
  (state-driven), C001-REQ-617 and C001-REQ-722 (event-driven) use the pattern of their trigger.
- **Interfaces:** the ten recorded actions are the same list, in the same order, in
  C001-REQ-721, `core-api.md` §4, ERR-ACT-006, G-10, `state-machines.md` and
  `domain-model.md` §2.22; C001-TS-759 and C001-TS-914 exercise all of them.
- **D2, D5:** `state-machines.md` §4 now has the workspace states of a test run;
  `architecture.md` §4.2 covers save, revision, restore and torn writes; C001-CON-22 gives the
  reason against `git worktree`.

### Gate notes
The gate-notes table of this re-review is kept current in focused re-review 2 (rows 1 to 11
updated, rows 12 to 14 added).

### Re-review verdict
No blocker is open. P-01's round-10 answers are applied (CR-1, CR-2), and 15 of the 16 findings
of the first review are resolved; CR-7 was not addressed. Six new findings are open. Four are
major: CR-17 and CR-18 come from the CR-6 fix, CR-19 came to light with the CR-14 fix, and
CR-20 follows from the orphan sentence of C001-REQ-504 and the new C001-NFR-005 method. Two are
minor: CR-21 and CR-22. None of them needs a new P-01 decision; each has an owner among the
specialists. Recommendation: fix CR-17 to CR-20 before G2 and run focused re-review 2 on those
IDs; the minors can go in the same pass. At G2, P-01 should see the gate notes (now in focused
re-review 2), rows 8 to 10 in particular.

## Focused re-review 2

**Scope.** The fixes for CR-7 and CR-17 to CR-22, and what those fixes introduced: C001-NFR-018
(a) and (c) measured in fresh evidence workspaces, the new C001-AS-08 and
`50-interfaces/evidence-runs.md` §8 and §9; C001-REQ-521 restated with its exception, the new
C001-REQ-523 and ERR-EVID-009; C001-REQ-604 and C001-REQ-616 without refill for escalated rules,
with C001-INV-16, `state-machines.md` and C001-COMP-012 aligned; the C001-NFR-005 benchmark
intake, the orphan-tests reason and C001-AS-07; the C001-REQ-114 warning and `review-cli.md`;
index counts, NFR DoD links and glossary terms; C001-TS-161, C001-TS-567 to C001-TS-573,
C001-TS-653 and rows of C001-TS-131; C001-DOD-005, C001-DOD-014, C001-DOD-015 and DOD-G-02.
C001-REQ-923 and C001-REQ-924 are tombstoned in `ids.json` (allocated, never used).
`sdd lint 001 --phase 10-spec --json`: 0 errors, 0 warnings, 0 infos. `sdd trace 001`: TR-01
55 / 55, TR-02 204 / 204, TR-03 204 / 204, TR-04 18 / 18, TR-05 204 / 204 and 18 / 18; 21 open
items.

**Reviewed set** (changed IDs and the IDs linked to them): C001-REQ-123, C001-AC-123.1,
C001-TS-151, C001-TS-152, C001-TS-153, C001-TS-161, C001-REQ-209, C001-NFR-018, C001-AS-06,
C001-AS-08, C001-CON-22, C001-IF-013, C001-DOD-014, C001-REQ-505, C001-REQ-506, C001-AC-506.1,
C001-TS-567, C001-REQ-509, C001-REQ-512, C001-REQ-514, C001-REQ-521, C001-AC-521.1,
C001-TS-559, C001-TS-560, C001-TS-561, C001-TS-562, C001-REQ-522, C001-REQ-523, C001-AC-523.1,
C001-TS-568, C001-TS-569, C001-TS-570, C001-TS-571, C001-TS-572, C001-TS-573, C001-US-502,
C001-US-503, C001-US-504, C001-COMP-011, C001-DOD-005, C001-REQ-604, C001-AC-604.1,
C001-REQ-614, C001-REQ-616, C001-AC-616.1, C001-TS-652, C001-TS-653, C001-US-603, C001-INV-16,
C001-COMP-012, C001-DOD-006, C001-NFR-005, C001-AS-07, C001-REQ-410, C001-REQ-504, C001-SC-02,
C001-DOD-015, C001-REQ-114, C001-AC-114.1, C001-TS-131, C001-US-101, C001-US-103, C001-US-105,
C001-IF-001, C001-DOD-001, C001-DOD-009; and `00-index.md`, the glossary terms orphan test,
evidence workspace, cold build, editable install and package link, `state-machines.md` §1 and
§8, `errors.md` ERR-EVID-008 and ERR-EVID-009, `architecture.md` §2, §3, §4.1 and §5, DOD-G-02
and the tombstones C001-REQ-923 and C001-REQ-924 of `ids.json`.

**Open after focused re-review 2:** 0 blocker, 1 major (CR-23), 4 minor (CR-24, CR-25, CR-26,
CR-27).

### Status of CR-7 and CR-17 to CR-22
| Finding | Status | Evidence of the fix |
|---|---|---|
| CR-7 | resolved | "Scenario Outline: C001-TS-161 — A damaged component of the documented architecture is left out and its files become drift" — `10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:661`, with "And it places "src/cart/total.ts" in the component "Undocumented" and flags it as drift" (`:669`) and four examples, each breaking one rule of `50-interfaces/intent-sources.md` §4 item 5 (`:674-677`); the coverage row of C001-REQ-123 lists C001-TS-161 (`:732`) |
| CR-17 | resolved | "Both runs happen in an evidence workspace of the snapshot, prepared in the same way and holding no build output of an earlier run, so each includes a cold build; the preparation of the workspace comes before both timings and counts on neither side" and "with an evidence workspace of the snapshot already prepared and free, so the preparation of a workspace does not count" — `10-spec/30-nfr/nfr.md:84`; the assumption has an "If wrong" path: "if the first test run still takes more than 3.0 times, a bound on workspace preparation and cold build goes to P-01 as a question on C001-NFR-018" — `10-spec/10-context/scope.md:49`; C001-DOD-014 reports both values (`10-spec/70-dod.md:45`). For P-01: gate notes row 12. Introduced: CR-25, CR-27 |
| CR-18 | resolved | "except for changes that the run's command or the project code it runs makes through a path of the working tree or of the git directory that the analysis core did not supply" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:191`; "THEN THE analysis core SHALL notify the developer with the run, the number of such paths and up to 10 of them" — `…/CAP-05-review-evidence/requirements.md:199`; "Scenario: C001-TS-567 — Lines executed in working-tree files through an editable install count for no hunk" — `…/CAP-05-review-evidence/acceptance.md:205`; the ADR task "how a Python virtual environment with an editable install and a package link to the working tree are made to load the workspace" — `10-spec/60-architecture/constraints.md:29`. Left or introduced: CR-23, CR-24, CR-26 |
| CR-19 | resolved | "WHILE a clearing rule is not escalated in the snapshot and its sample population is not empty" — `10-spec/20-capabilities/CAP-06-review-coverage/requirements.md:44`; "adding hunks of the population only while the rule is not escalated" — `…/CAP-06-review-coverage/requirements.md:60`; "And the coverage statement lists the formatting rule with 0 hunks sampled, 0 sampled and read, and 1 defect reported" — `…/CAP-06-review-coverage/acceptance.md:523`; C001-INV-16 (`10-spec/40-domain/domain-model.md:395-401`), `state-machines.md:233`, C001-COMP-012 (`10-spec/60-architecture/architecture.md:212-213`) and `analysis-results.schema.json:709` state the same rule |
| CR-20 | resolved | "**Intake of a benchmark change:** fixed for each benchmark change together with the set, before any measurement, and not chosen for how much it clears." — `10-spec/30-nfr/nfr.md:28-29`; "without moving a hunk or naming an intent" — `…/nfr.md:98`; the split reason "orphan tests, where passing tests execute every executable line of the hunk" — `…/nfr.md:96`; C001-AS-07 (`10-spec/10-context/scope.md:48`) and C001-DOD-015 (`10-spec/70-dod.md:46`) aligned. Left: CR-23 |
| CR-21 | resolved | "whenever the base commit is HEAD itself, however it was chosen, a warning that only the uncommitted edits are reviewed and that another base commit can be named" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:121`; "whenever the base commit is HEAD itself, whichever of these cases" — `10-spec/50-interfaces/review-cli.md:93`; the C001-TS-131 row with "the local branch "main" at C2, without an upstream branch, with no remote and no local branch "master"" — `…/CAP-01-change-intake/acceptance.md:410` |
| CR-22 | resolved | "| CON | 22 (C001-CON-01 to C001-CON-08 in `10-context/scope.md`, C001-CON-09 to C001-CON-22 in `60-architecture/constraints.md`) |" — `10-spec/00-index.md:105`; "Nine lifecycles:" — `…/00-index.md:61`; "names the item of `70-dod.md` that covers it." — `10-spec/30-nfr/nfr.md:12`, with "- **DoD:** C001-DOD-015." at `:101`; "Test-file conventions per ecosystem: C001-IF-005 §10 (`50-interfaces/builtin-policy.md`)" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:20` |

New findings of this re-review: CR-23 (major), CR-24 to CR-27 (minor), in the Findings section.

### Rubric (reviewed set)
| Rubric | Item | Result |
|---|---|---|
| stories | S1 Persona is a defined P-ID | pass |
| stories | S2 Value / outcome stated | pass |
| stories | S3 INVEST | pass |
| stories | S4 Every story has ≥ 1 requirement | pass |
| stories | S5 Out of scope stated where a neighbour exists | pass |
| stories | S6 Traces to the ideation | pass |
| requirements | R1 Singular outcome | pass |
| requirements | R2 Testable | pass |
| requirements | R3 Unambiguous | pass |
| requirements | R4 Correct EARS pattern | pass |
| requirements | R5 Implementation-free | pass |
| requirements | R6 Complete | CR-26 |
| requirements | R7 Consistent | CR-27 |
| requirements | R8 Feasible | pass |
| requirements | R9 Necessary | pass |
| requirements | R10 Measurable values carry units and limits | pass |
| requirements | R11 Delta and evidence | n/a: greenfield change, no living spec (`10-context/current-state.md`) |
| requirements | R12 Priority set and consistent with the story | pass |
| NFRs | N1 ISO 25010 category | pass |
| NFRs | N2 Metric with unit | pass |
| NFRs | N3 Threshold set | pass |
| NFRs | N4 Feasible method and environment | CR-23, CR-25 |
| NFRs | N5 Covered by a DoD item | pass |
| acceptance | A1 Every REQ has ≥ 1 AC, every AC ≥ 1 scenario | pass |
| acceptance | A2 Scenarios observable and concrete | pass |
| acceptance | A3 One behaviour per scenario | pass |
| acceptance | A4 Error and abuse cases present | CR-26 |
| acceptance | A5 `n/a` cells justified credibly | pass |
| domain, interfaces, architecture | D1 Entities with attributes, relationships, owner, invariants | pass |
| domain, interfaces, architecture | D2 Lifecycles > 2 states have a diagram and a complete transition table | pass |
| domain, interfaces, architecture | D3 Interfaces parse and name their errors | pass |
| domain, interfaces, architecture | D4 Every component has an ID, responsibilities, requirements served | CR-24 |
| domain, interfaces, architecture | D5 Decisions with alternatives recorded | pass |
| DoD and index | O1 Every REQ and NFR covered | pass |
| DoD and index | O2 Evidence types fit the statements | pass |
| DoD and index | O3 Global items referenced | pass |
| DoD and index | X1 The index is navigation only | pass |

Notes on rows marked pass:
- **R1, R4:** C001-REQ-521 keeps one SHALL; its exception bounds the one outcome (what the core
  leaves unchanged) and is tested from both sides: C001-TS-559 to C001-TS-562 for what the core
  supplies, C001-TS-569 and C001-TS-572 for a command text that names the working tree.
  C001-REQ-523 is unwanted-behaviour with one notice; C001-REQ-604 is state-driven with two state
  conditions.
- **R7, D2:** C001-REQ-604, C001-REQ-614, C001-REQ-616, C001-INV-16, `state-machines.md` §1 (row
  "Read | escalation of a rule that cleared the hunk") and §8, C001-COMP-012,
  `sequences/sampling-and-escalation.md` and `analysis-results.schema.json` now give one rule for
  escalated rules. The heading of C001-AC-604.1 ("Each clearing rule with cleared hunks has a
  random sample") does not repeat the not-escalated condition, but C001-REQ-604 and C001-TS-653
  decide; not a finding.
- **S4, R9:** C001-REQ-523 is listed by C001-US-502, C001-US-503 and C001-US-504
  (`CAP-05-review-evidence/stories.md:43`, `:57`, `:72`) and serves their value of evidence
  produced on the code under review.
- **N3:** C001-NFR-018 keeps P-01's three thresholds; what has none is stated as C001-AS-08
  rather than set by the specification (gate notes row 12).
- **A2 to A4:** C001-TS-567 to C001-TS-573 use concrete paths and counts, with the boundaries 0,
  1, 10 and 11 in C001-TS-571; C001-TS-573 checks that ERR-EVID-005 alone decides; C001-TS-572
  covers a git command aimed at the repository through an absolute path. C001-TS-161 breaks each
  of the four component rules of `intent-sources.md` §4 item 5 once.
- **X1, O1 to O3:** the index counts 204 requirements, 22 constraints and 8 assumptions. "2
  retired" stays right: C001-REQ-923 and C001-REQ-924 were tombstoned before any requirement used
  them (`ids.json`), and C001-DOD-009 covers "C001-REQ-901, 902, 904…922". DOD-G-02 (204) matches
  `sdd trace 001`.

### Gate notes
The gate-notes table of this re-review is kept current in focused re-review 3 (rows 8, 10, 12, 13
and 14 updated in content, rows 9 and 11 in their locations only; rows 15 and 16 added).

### Re-review 2 verdict
No blocker is open. All seven findings in the brief are resolved: CR-7 and CR-17 to CR-22.
Five new findings are open, each with owners among the specialists. One is major: CR-23, where
the Python environment of the C001-NFR-005 benchmark decides whether any Python hunk clears by
passing tests, and a miss would be blamed on the guards. Four are minor: CR-24 (C001-REQ-523 in
no Realizes list), CR-25 (which workspace mutation testing takes), CR-26 (incomplete observation)
and CR-27 (build outputs copied from the working tree). Recommendation: fix CR-23 before G2 and
re-check it with the minors in one focused pass. At G2, P-01 decides Q-workspace-01 (accept
C001-AS-08 or bound the first run of a session, row 12) and Q-clearing-06 (who may narrow the
public API recognition, row 10), and should read rows 13 and 14: for project code the working
tree is reported, not protected.

## Focused re-review 3

**Scope.** Round 11 of `10-spec/questions-log.md` (Q-workspace-01 answered "Accept AS-08",
Q-clearing-06 answered "You decide") and the fixes for CR-23 to CR-27, with what they introduced:
the "Environment of a benchmark change" of `30-nfr/nfr.md` §0 and the C001-NFR-005 split reason
"passing-test evidence refused for working-tree execution"; C001-IF-013 §2 item 7 (Python project
modules load from the workspace even with an editable install), §2 items 3 and 4 (the mutation
copy; nothing compiled or transformed taken from the working tree), §3, §5, §8 items 2 to 4, §9
item 4 and ERR-EVID-010; the ADR scope of C001-CON-22; C001-REQ-523 in C001-COMP-011 and its
flow; the rationales of C001-REQ-506, C001-REQ-521 and C001-REQ-523; C001-AS-07 and C001-AS-08;
C001-TS-567 and C001-TS-568 rewritten, C001-TS-574 and C001-TS-575 new; C001-DOD-014 and
C001-DOD-015; the glossary term editable install (edited by the conductor).
`sdd lint 001 --phase 10-spec --json`: 0 errors, 0 warnings, 0 infos. `sdd trace 001`: TR-01
55 / 55, TR-02 204 / 204, TR-03 204 / 204, TR-04 18 / 18, TR-05 204 / 204 and 18 / 18; 21 open
items.

**Reviewed set** (changed IDs and the IDs linked to them): C001-NFR-005, C001-NFR-018,
C001-SC-02, C001-AS-07, C001-AS-08, C001-CON-22, C001-IF-013, C001-REQ-417, C001-REQ-504,
C001-REQ-506, C001-AC-506.1, C001-TS-516, C001-TS-517, C001-TS-567, C001-TS-574, C001-REQ-509,
C001-REQ-514, C001-REQ-515, C001-REQ-521, C001-AC-521.1, C001-TS-559, C001-TS-560, C001-TS-561,
C001-TS-562, C001-REQ-522, C001-REQ-523, C001-AC-523.1, C001-TS-568, C001-TS-569, C001-TS-570,
C001-TS-571, C001-TS-572, C001-TS-573, C001-TS-575, C001-US-502, C001-US-503, C001-US-504,
C001-COMP-011, C001-DOD-014, C001-DOD-015; and round 11 of `questions-log.md`, `nfr.md` §0, the
glossary terms editable install and package link, `errors.md` ERR-EVID-008 to ERR-EVID-010,
`state-machines.md` §4 and §5, `architecture.md` §2 (C001-COMP-011) and §3 (flow "Triage and
clearing with evidence"), as far as they concern these IDs.

**Open after focused re-review 3:** 0 blocker, 1 major (CR-28), 4 minor (CR-29, CR-30, CR-31,
CR-32).

### Status of CR-23 to CR-27
| Finding | Status | Evidence of the fix |
|---|---|---|
| CR-23 | resolved | The environment is fixed per benchmark change: "In it, no file of the repository is loaded" / "from the working tree" — `10-spec/30-nfr/nfr.md:42-43`; the split has a reason of its own: "passing-test evidence refused for working-tree execution" — `…/nfr.md:114`; C001-AS-07 checks it first: "Where hunks whose passing-test evidence was refused for working-tree execution (ERR-EVID-008) hold part of the share, the environment of the benchmark change broke `30-nfr/nfr.md` §0" — `10-spec/10-context/scope.md:48`; the architect decided the adapter question: "**Python project code loads from the workspace** (C001-CON-22, C001-REQ-506)." — `10-spec/50-interfaces/evidence-runs.md:88`, tested by "Scenario: C001-TS-567 — With an editable install from the working tree, the passing tests of an added Python line are recorded" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:205`; C001-DOD-015 aligned (`10-spec/70-dod.md:46`). Left: CR-28 |
| CR-24 | resolved | "C001-REQ-521, C001-REQ-522, C001-REQ-523, C001-NFR-018" — `10-spec/60-architecture/architecture.md:204`; the flow lists "C001-REQ-521, C001-REQ-522, C001-REQ-523;" — `…/architecture.md:313`; the Source column of C001-CON-22 lists "C001-REQ-521, C001-REQ-522, C001-REQ-523, C001-CON-04" — `10-spec/60-architecture/constraints.md:29` |
| CR-25 | resolved | "**Mutation workspace.** Mutation testing takes a workspace of its own" — `10-spec/50-interfaces/evidence-runs.md:51`; (b) "including the copy of the test run's workspace that mutation testing takes" and "no workspace is prepared in that time" — `10-spec/30-nfr/nfr.md:102`; "**Mutation-testing time (b).**" — `…/evidence-runs.md:228`; (c) "the threshold holds in both states" — `…/nfr.md:104`; C001-DOD-014 "the copy of the test run's workspace that mutation testing takes included (C001-IF-013 §8 item 4)" — `10-spec/70-dod.md:45`. Introduced: CR-29, CR-32; the both-states reading of (c) is gate notes row 15 |
| CR-26 | resolved | "or the analysis core cannot observe every one of these paths and refs for the whole command" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:199`; "4. **Incomplete observation** (C001-REQ-523, notice ERR-EVID-010)." — `10-spec/50-interfaces/evidence-runs.md:273`, with the four causes (`:277-287`); ERR-EVID-010 (`10-spec/50-interfaces/errors.md:58`); "Scenario: C001-TS-575 — A watch limit reached during the observation is reported and the results are kept" — `…/CAP-05-review-evidence/acceptance.md:728`. Introduced: CR-30 |
| CR-27 | resolved | "Allowed mitigations, each reusing" / "only what the analysis core itself produced from known content" — `10-spec/50-interfaces/evidence-runs.md:209-210`; "Build outputs, bytecode, incremental-build state and transform caches of the working tree are" / "never a mitigation (§2 item 4)." — `…/evidence-runs.md:226-227`; reused outputs only "provided the ADR shows, for the build of each deep ecosystem," / "that a build in the workspace rebuilds every output whose inputs differ from the snapshot" — `…/evidence-runs.md:217-219`; C001-AS-08: "none takes compiled or transformed code from the working tree (C001-CON-22)" — `10-spec/10-context/scope.md:49` |

Round 11 is applied: "Accepted by P-01 as stated, with no bound on the first test run of a
session (Q-workspace-01)" (`10-spec/10-context/scope.md:49`), matching "**Answer:** Accept AS-08
(Recommended)" (`10-spec/questions-log.md:312`); "no specialist narrows it (Q-clearing-06)"
(`10-spec/10-context/scope.md:48`), matching "**Answer:** You decide (Recommended)"
(`10-spec/questions-log.md:324`), except the C001-REQ-417 rationale (CR-31). Neither answer
carries extracted instructions.

New findings of this re-review: CR-28 (major), CR-29 to CR-32 (minor), in the Findings section.

### Rubric (reviewed set)
| Rubric | Item | Result |
|---|---|---|
| stories | S1 Persona is a defined P-ID | pass |
| stories | S2 Value / outcome stated | pass |
| stories | S3 INVEST | pass |
| stories | S4 Every story has ≥ 1 requirement | pass |
| stories | S5 Out of scope stated where a neighbour exists | pass |
| stories | S6 Traces to the ideation | pass |
| requirements | R1 Singular outcome | CR-30 |
| requirements | R2 Testable | pass |
| requirements | R3 Unambiguous | pass |
| requirements | R4 Correct EARS pattern | pass |
| requirements | R5 Implementation-free | pass |
| requirements | R6 Complete | CR-29 |
| requirements | R7 Consistent | CR-31 |
| requirements | R8 Feasible | pass |
| requirements | R9 Necessary | pass |
| requirements | R10 Measurable values carry units and limits | pass |
| requirements | R11 Delta and evidence | n/a: greenfield change, no living spec (`10-context/current-state.md`) |
| requirements | R12 Priority set and consistent with the story | pass |
| NFRs | N1 ISO 25010 category | pass |
| NFRs | N2 Metric with unit | pass |
| NFRs | N3 Threshold set | pass |
| NFRs | N4 Feasible method and environment | CR-28, CR-32 |
| NFRs | N5 Covered by a DoD item | pass |
| acceptance | A1 Every REQ has ≥ 1 AC, every AC ≥ 1 scenario | pass |
| acceptance | A2 Scenarios observable and concrete | pass |
| acceptance | A3 One behaviour per scenario | pass |
| acceptance | A4 Error and abuse cases present | CR-30 |
| acceptance | A5 `n/a` cells justified credibly | pass |
| domain, interfaces, architecture | D1 Entities with attributes, relationships, owner, invariants | pass |
| domain, interfaces, architecture | D2 Lifecycles > 2 states have a diagram and a complete transition table | pass |
| domain, interfaces, architecture | D3 Interfaces parse and name their errors | pass |
| domain, interfaces, architecture | D4 Every component has an ID, responsibilities, requirements served | pass |
| domain, interfaces, architecture | D5 Decisions with alternatives recorded | pass |
| DoD and index | O1 Every REQ and NFR covered | pass |
| DoD and index | O2 Evidence types fit the statements | pass |
| DoD and index | O3 Global items referenced | pass |
| DoD and index | X1 The index is navigation only | pass |

Notes on rows marked pass:
- **R4, R5:** C001-REQ-521 keeps one ubiquitous SHALL whose exception now names the paths the
  core does not supply (command text, a file of the project, the developer's environment, an
  editable install or a package link into the working tree); C001-TS-568 tests the environment
  case. The `.pth` files, `-I` and `-E` and inotify limits appear only as examples in the
  rationales of C001-REQ-506, C001-REQ-521 and C001-REQ-523, not in the statements.
- **R8:** C001-IF-013 §2 item 7 states an outcome and leaves the means (an import hook, or an
  environment for the workspace) to the ADR of C001-CON-22, which must show it on the Python
  benchmark change with an editable install; the exception for `-I` and `-E` is stated in the
  requirement rationales, ERR-EVID-008's action and the glossary.
- **N3:** the thresholds of C001-NFR-005 and C001-NFR-018 are unchanged; what C001-NFR-018
  leaves without a threshold is C001-AS-08, now accepted by P-01.
- **A2, A3:** C001-TS-567 checks both the recorded passing test and the absence of `__pycache__`
  under `shop/` in the working tree; C001-TS-574 uses a concrete `jest.config.js` mapping to an
  absolute path and checks the count 1; C001-TS-575 uses 12 directories not observed to test the
  cap of 10, and checks that the results are kept.
- **D2:** the mutation copy is a resource of a mutation run, not a state of its own; the
  mutation-evidence lifecycle (`state-machines.md` §5) runs "in a workspace used by no other run",
  which the copy satisfies.
- **D3, D4:** ERR-EVID-010 has a condition, message, action, source and surfaces like the other
  notices; C001-COMP-011 realises C001-REQ-523 and names ERR-EVID-010 (CR-24).
- **O1, O2:** C001-DOD-014 reports (b) with the copy included and (c) in the state the Method
  names; C001-DOD-015 names the §0 environment and computes the ERR-EVID-008 reason from every
  reported file, not only the 10 that the notice names. The index still counts 8 assumptions
  (`10-spec/00-index.md:104`).

### Gate notes
The gate-notes table of this re-review is kept current in focused re-review 4 (rows 8, 10, 13,
14, 15 and 16 updated in content, rows 9 and 11 in their locations only; rows 17 to 19 added).

### Re-review 3 verdict
No blocker is open. All five findings in the brief are resolved: CR-23 to CR-27. P-01's round-11
answers are applied (Q-workspace-01 in C001-AS-08, Q-clearing-06 in C001-AS-07). Five new
findings are open, each with owners among the specialists; none needs a P-01 decision to be
fixed. One is major: CR-28, where the Python install that §0 allows makes every added Python line
count for no hunk without any notice, so the C001-NFR-005 measurement could miss for the reason
CR-23 was meant to rule out. Four are minor: CR-29 (the mutation copy can lead back into the test
run's workspace), CR-30 (C001-REQ-523 joins two notices under one SHALL), CR-31 (the C001-REQ-417
rationale contradicts Q-clearing-06) and CR-32 (the test run's workspace is not free during the
mutation copy, a window the (c) method does not exclude). Recommendation: fix CR-28 before G2 (a
sentence in §0 and a validity check in the C001-NFR-005 Method), with the minors in the same pass,
and check the fixed text against the suggested fixes in a short focused pass. At G2, P-01 should
answer Q-overhead-01 (row 15) and read rows 12 to 16: the session-start cost is reported, not
bounded; for project code the working tree is reported, not protected; and the 30 % target is
measured in a clean Python setup.

## Focused re-review 4

**Scope.** Round 12 of `10-spec/questions-log.md` (Q-overhead-01 answered "In both states",
Q-finish-01 answered "Fix all, then gate", Q-fatigue-01 answered "Use recommendations") and
Q-copy-window-01, resolved under the fatigue guard with its recommended option; the fixes for
CR-28 to CR-32, with what they introduced: `30-nfr/nfr.md` §0 (every project file loaded from its
snapshot path in the evidence workspace, no installed copy), the C001-NFR-005 split reason
"passing-test evidence lost to an installed copy" and Method steps 4 and 5 (validity); C001-NFR-018
(c) in both states with the copy window excluded; C001-IF-013 §1 item 4 (capacity left for bundle
runs), §2 item 3 (copy window, self-contained copy), §5 item 4 (self-containment check), §8 and §9
items 3 and 4; ERR-EVID-006 and ERR-EVID-009 to ERR-EVID-011; the ADR scope and risks of
C001-CON-22; C001-REQ-523 split and the new C001-REQ-524; the C001-REQ-417 rationale;
C001-COMP-011, its flow and `sequences/triage-and-clearing.md`; the test-run row of
`state-machines.md` §4 (edited by the conductor); the glossary term installed copy;
C001-AC-524.1, C001-TS-576 to C001-TS-584; C001-DOD-005, C001-DOD-014, C001-DOD-015 and DOD-G-02.
`sdd lint 001 --phase 10-spec --json`: 0 errors, 0 warnings, 0 infos. `sdd trace 001`: TR-01
55 / 55, TR-02 205 / 205, TR-03 205 / 205, TR-04 18 / 18, TR-05 205 / 205 and 18 / 18; 21 open
items (13 in `10-spec/85-open-items.md`, 8 in `00-ideation/85-open-items.md`).

**Reviewed set** (changed IDs and the IDs linked to them): C001-NFR-005, C001-NFR-018,
C001-SC-02, C001-AS-07, C001-AS-08, C001-CON-22, C001-IF-013, C001-REQ-417, C001-AC-417.1,
C001-US-404, C001-REQ-506, C001-AC-506.1, C001-TS-567, C001-TS-574, C001-TS-584, C001-REQ-512,
C001-AC-512.1, C001-TS-582, C001-TS-583, C001-REQ-514, C001-AC-514.1, C001-TS-581, C001-REQ-515,
C001-REQ-411, C001-REQ-516, C001-AC-516.1, C001-TS-545, C001-TS-546, C001-TS-580, C001-REQ-521,
C001-REQ-523, C001-AC-523.1, C001-TS-568, C001-TS-569, C001-TS-570, C001-TS-571, C001-TS-572,
C001-TS-573, C001-REQ-524, C001-AC-524.1, C001-TS-575, C001-TS-576, C001-TS-577, C001-TS-578,
C001-TS-579, C001-US-502, C001-US-503, C001-US-504, C001-COMP-011, C001-DOD-005, C001-DOD-014,
C001-DOD-015, C001-DOD-027; and round 12 and the fatigue-guard section of `questions-log.md`,
`nfr.md` §0, the glossary term installed copy, `errors.md` ERR-EVID-006 and ERR-EVID-008 to
ERR-EVID-011, `state-machines.md` §4 and §5, `domain-model.md` §2.25, `architecture.md` §2
(C001-COMP-011) and §3 (flow "Triage and clearing with evidence"),
`sequences/triage-and-clearing.md`, the `50-interfaces/README.md` row of C001-IF-013,
`00-index.md` (counts) and DOD-G-02, as far as they concern these IDs.

**Open after focused re-review 4:** 0 blocker, 0 major, 3 minor (CR-33, CR-34, CR-35).

### Status of CR-28 to CR-32
| Finding | Status | Evidence of the fix |
|---|---|---|
| CR-28 | resolved | "In it, every file of the project that a test" / "run of the benchmark change executes is loaded from its snapshot path in the evidence workspace" — `10-spec/30-nfr/nfr.md:42-43`; "no installed copy of the project (glossary) is loaded: the project is never installed as a" / "regular, non-editable copy, in the evidence workspace or elsewhere" — `…/nfr.md:48-49`; "Where its tests" / "need the project itself installed, it is installed in editable mode from the evidence" / "workspace's own sources" — `…/nfr.md:50-52`; the split reason "passing-test evidence lost to an installed copy" — `…/nfr.md:124`; the validity check "a run whose test run records a passing test for no line that a hunk of a deep-ecosystem file adds is reported as a suspected environment fault" — `…/nfr.md:126`; "Scenario: C001-TS-584 — Lines executed only in an installed copy of the project count for no hunk" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:224`; C001-DOD-015 adds a check run "with the project installed as a regular copy (`pip install .`)" — `10-spec/70-dod.md:46`; the term "installed copy" — `10-spec/40-domain/glossary-delta.md:137`. The optional notice was not adopted: gate notes row 19 |
| CR-29 | resolved | "In the copy, no path that the analysis core makes" / "available or copies, symbolic-link targets and such absolute paths included, leads into another" / "evidence workspace, the test run's included, into the working tree or into the git directory" — `10-spec/50-interfaces/evidence-runs.md:78-80`; "4. **Self-containment check** (§2 item 3, C001-REQ-516)." — `…/evidence-runs.md:190`, with ERR-EVID-011 (`10-spec/50-interfaces/errors.md:59`); the ADR shows it "by a mutant applied in the copy that a passing test executing its line kills, by a self-containment check (C001-IF-013 §5 item 4) that reports no file, and by the test run's workspace, ignored paths included, unchanged after mutation testing" — `10-spec/60-architecture/constraints.md:29`; "Scenario: C001-TS-581 — With the project installed in editable mode in the test run's workspace, mutants are tested in the mutation copy" — `…/CAP-05-review-evidence/acceptance.md:508`, and C001-TS-580 (`:558`). Introduced, together with CR-32: CR-33 |
| CR-30 | resolved | C001-REQ-523 keeps only the change notice: "THEN THE analysis core SHALL notify the developer with the run, the number of changed paths and up to 10 of them, stating that the run or another program changed them, without changing whether the run's results are recorded as evidence." — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:199`; "### C001-REQ-524 — Report an incomplete observation of the repository during an evidence run" — `…/requirements.md:205`, with "or as the whole working tree, or as the index and refs of the repository" (`:207`); C001-AC-524.1 (`…/CAP-05-review-evidence/acceptance.md:789`) with lost events (C001-TS-576, `:803`), the index and refs (C001-TS-577, `:830`), an interrupted observation next to a change notice (C001-TS-578, `:833`) and a flood of changes (C001-TS-579, `:843`); the lifecycle: "reported with ERR-EVID-009 (C001-REQ-523), and an incomplete observation of them reported with ERR-EVID-010 (C001-REQ-524)" — `10-spec/40-domain/state-machines.md:149`; ERR-EVID-010 names C001-REQ-524 as its source (`10-spec/50-interfaces/errors.md:58`); C001-COMP-011 realises C001-REQ-524 (`10-spec/60-architecture/architecture.md:206`); listed by C001-US-502, C001-US-503 and C001-US-504 (`…/CAP-05-review-evidence/stories.md:43`, `:57`, `:72`) |
| CR-31 | resolved | "if it is not, the "If wrong" path of C001-AS-07 applies, and only P-01 narrows this recognition, on a proposal that gives the measured split by reason (Q-clearing-06)." — `10-spec/20-capabilities/CAP-04-risk-triage/requirements.md:156` |
| CR-32 | resolved | "A run taken while mutation testing runs starts after the copy of the test run's workspace that mutation testing takes has been made (C001-IF-013 §2 item 3), so the time in which that copy is made falls within no run of (c)" — `10-spec/30-nfr/nfr.md:114`; "**Copy window.**" — `10-spec/50-interfaces/evidence-runs.md:64`, with "After the copy window, the test run's workspace is free for bundle" / "runs and later test runs while mutation testing runs." (`:71-72`) in place of "free after the test run whether mutation testing still runs"; (c) is measured in "the workspace of the test run once the copy window of §2 item 3 has ended" — `…/evidence-runs.md:238`; C001-DOD-014 "with no wait for the copy of the test run's workspace inside any value of (c)" — `10-spec/70-dod.md:45`; "Scenario: C001-TS-582 — A bundle run asked for during the mutation copy waits for the copy and then runs in the test run's workspace" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:427`. Introduced: CR-33 (together with CR-29), CR-34, CR-35 |

Round 12 is applied. Q-overhead-01: "(c) is taken both while mutation testing of the snapshot runs
and after it has ended, and its threshold holds in each of these two states (Q-overhead-01)"
(`10-spec/30-nfr/nfr.md:112`), matching "**Answer:** In both states (Recommended)"
(`10-spec/questions-log.md:338`); the cost the option named ("may require the mutation runner to
leave CPU capacity free, at some cost to mutation time", `10-spec/questions-log.md:333`) is the
rule of C001-IF-013 §1 item 4 and the risk of C001-CON-22 ("when the two thresholds cannot both
hold, the conflict goes back to P-01, and the ADR relaxes neither", `10-spec/60-architecture/constraints.md:29`).
Q-finish-01 ("Fix all, then gate") is this pass. Q-fatigue-01 was used once, for
Q-copy-window-01, whose recommended option ("Wait for the copy") is applied in C001-IF-013 §2
item 3 and §8 item 2 but not marked as an assumption (CR-35). None of these answers carries
extracted instructions.

New findings of this re-review: CR-33, CR-34 and CR-35 (minor), in the Findings section.

### Rubric (reviewed set)
| Rubric | Item | Result |
|---|---|---|
| stories | S1 Persona is a defined P-ID | pass |
| stories | S2 Value / outcome stated | pass |
| stories | S3 INVEST | pass |
| stories | S4 Every story has ≥ 1 requirement | pass |
| stories | S5 Out of scope stated where a neighbour exists | pass |
| stories | S6 Traces to the ideation | pass |
| requirements | R1 Singular outcome | pass |
| requirements | R2 Testable | pass |
| requirements | R3 Unambiguous | pass |
| requirements | R4 Correct EARS pattern | pass |
| requirements | R5 Implementation-free | pass |
| requirements | R6 Complete | pass |
| requirements | R7 Consistent | CR-35 |
| requirements | R8 Feasible | pass |
| requirements | R9 Necessary | pass |
| requirements | R10 Measurable values carry units and limits | pass |
| requirements | R11 Delta and evidence | n/a: greenfield change, no living spec (`10-context/current-state.md`) |
| requirements | R12 Priority set and consistent with the story | pass |
| NFRs | N1 ISO 25010 category | pass |
| NFRs | N2 Metric with unit | pass |
| NFRs | N3 Threshold set | pass |
| NFRs | N4 Feasible method and environment | pass |
| NFRs | N5 Covered by a DoD item | pass |
| acceptance | A1 Every REQ has ≥ 1 AC, every AC ≥ 1 scenario | pass |
| acceptance | A2 Scenarios observable and concrete | CR-34 |
| acceptance | A3 One behaviour per scenario | pass |
| acceptance | A4 Error and abuse cases present | CR-33 |
| acceptance | A5 `n/a` cells justified credibly | pass |
| domain, interfaces, architecture | D1 Entities with attributes, relationships, owner, invariants | CR-33 |
| domain, interfaces, architecture | D2 Lifecycles > 2 states have a diagram and a complete transition table | CR-33 |
| domain, interfaces, architecture | D3 Interfaces parse and name their errors | pass |
| domain, interfaces, architecture | D4 Every component has an ID, responsibilities, requirements served | pass |
| domain, interfaces, architecture | D5 Decisions with alternatives recorded | pass |
| DoD and index | O1 Every REQ and NFR covered | pass |
| DoD and index | O2 Evidence types fit the statements | pass |
| DoD and index | O3 Global items referenced | pass |
| DoD and index | X1 The index is navigation only | pass |

Notes on rows marked pass:
- **R1, R4:** C001-REQ-523 and C001-REQ-524 are each an unwanted-behaviour requirement with one
  notice, and each bounds its one outcome with "without changing whether the run's results are
  recorded as evidence"; C001-TS-578 shows both notices after one run. C001-REQ-524 names the three
  forms of the part not observed that C001-IF-013 §9 item 4 and ERR-EVID-010 give, so the
  statement no longer says "the working tree" when only the index or refs were not observed.
- **R5:** the worker count, `nice` values and priority classes of C001-IF-013 §1 item 4 and the
  inotify, `ERROR_NOTIFY_ENUM_DIR` and FSEvents examples of §9 item 4 sit in the interface and the
  rationales, not in a requirement statement; the ADR of C001-CON-22 may replace the means.
- **R7:** the C001-REQ-417 rationale now defers to C001-AS-07 and to P-01 (CR-31). C001-AS-07
  still names only the ERR-EVID-008 branch as an environment fault (`10-spec/10-context/scope.md:48`),
  while C001-NFR-005 Method step 5 also treats the installed-copy reason and a run with no passing
  test for any added line as environment faults, "before any other step of the "If wrong" path of
  C001-AS-07" (`10-spec/30-nfr/nfr.md:126`); the method sets the order, so no step differs. Not a
  finding.
- **R8, N4:** §0 offers two ways for tests that need the project installed (an editable install
  from the workspace's own sources, or the workspace's source root on the import path through the
  project's test configuration), and Method step 5 catches a harness that breaks §0. The
  installed-copy reason needs coverage data for files outside the working tree and outside the
  snapshot paths; the check run of C001-DOD-015 (a regular `pip install .` that must be reported
  under that reason) makes the ADR's adapter provide it. Whether a preparation command becomes a
  setting of the review configuration is left to the ADR under C001-IF-013 §2 item 4. (c) during
  mutation testing and (b) with capacity kept free may conflict; C001-CON-22 sends that conflict
  to P-01 (gate notes row 15).
- **R9, S4:** C001-REQ-524 is listed by C001-US-502, C001-US-503 and C001-US-504 and serves the
  same value as C001-REQ-523: the developer learns what could not be checked.
- **A2, A3:** C001-TS-575 to C001-TS-579 use concrete causes, paths and counts. C001-TS-579
  accepts either of two notices because the mechanism decides which one applies; both outcomes
  are observable and the scenario fails exactly when the write to `src/coupon/data.json` is
  hidden. C001-TS-580 checks the count 2, the reason, the absence of ERR-EVID-006 and the third
  hunk's results; C001-TS-581 the killed mutant; C001-TS-584 the passed test with no line
  recorded and no ERR-EVID-008.
- **D3, D4:** ERR-EVID-010 has C001-REQ-524 and ERR-EVID-011 has C001-REQ-516 as source;
  ERR-EVID-006 points to ERR-EVID-011 for files loaded outside the copy, and ERR-EVID-009 states
  that an incomplete observation alone never raises it. C001-COMP-011 realises C001-REQ-524 and
  names ERR-EVID-010 and ERR-EVID-011; the flow and the triage sequence show the copy window, the
  failed copy and the self-containment check.
- **D5:** the copy-window rule has its two options in Q-copy-window-01; the capacity means are the
  architect's, replaceable by the ADR, within the option P-01 chose in Q-overhead-01.
- **O1, X1:** C001-DOD-005 covers "C001-REQ-501…524", DOD-G-02 counts 205 active requirements,
  the index gives "205 (2 retired: C001-REQ-813, C001-REQ-903)" and `sdd trace 001` reports
  205 / 205. C001-DOD-014 and C001-DOD-015 follow the methods of C001-NFR-018 and C001-NFR-005
  step by step.

### Gate notes: specialist choices P-01 has not explicitly decided (current)
| # | Choice | Where | Evidence | Note for the gate |
|---|---|---|---|---|
| 1 | "The remote" is `origin`, else the only remote; with several remotes and no `origin`, or without `refs/remotes/<remote>/HEAD`, there is no default branch of the remote | C001-IF-012 G-14, glossary | "where `<remote>` is `origin` when the repository has a remote of that name and otherwise its only remote; with several remotes and none named `origin`, or without that symbolic ref, there is none" — `10-spec/50-interfaces/git-access.md:48` | Refines "the remote's default branch" of Q-intake-01. `git clone` sets `refs/remotes/origin/HEAD`, but `git remote add` does not, so such repositories fall back to local `main` or `master` |
| 2 | Fallback order `main` before `master`; tags never taken | C001-REQ-104, G-14 | "the default branch of the remote, a local branch named `main`, a local branch named `master`" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:40` | Follows the option text "else local main/master". With HEAD on a local `main` without an upstream branch, only uncommitted edits are reviewed; the intake summary now warns whenever the base commit is HEAD (C001-REQ-114, C001-TS-131; CR-21 resolved) |
| 3 | Test hunks in orphan code never qualify for the passing-tests rule | C001-REQ-504 | "Test hunks in orphan code belong to no intent, so tests that execute them (orphan tests, glossary) do not qualify" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:45` | Follows from Q-clearing-05 (a judgement is given per intent). In model-free mode it can hold much of the open share, which C001-NFR-005 now reports as the orphan-tests reason (CR-20 resolved); the developer can still group the hunk and judge it |
| 4 | A rejected orphan hunk grouped later is decided by its intent's verdict | C001-REQ-722 | "code the developer rejected is accepted only through a later signature of the developer" — `10-spec/20-capabilities/CAP-07-verdicts/requirements.md:182` | No P-01 decision needed: an earlier signature goes stale (C001-TS-768) |
| 5 | A hunk without an executable line scores like untested code | C001-REQ-401 | "A hunk that adds no executable line (only deletions or comments) has no test evidence, so it scores like untested code" — `10-spec/20-capabilities/CAP-04-risk-triage/requirements.md:20` | Ordering only; clears nothing |
| 6 | A test judgement on an intent without test hunks is refused | C001-REQ-520 | "THEN THE analysis core SHALL refuse the judgement with a message that the intent has no test hunks" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:52` | No effect on clearing |
| 7 | Intent names compared after Unicode case folding; model titles moved to the same rule | C001-REQ-719, `domain-model.md` §3 | "`model:<SHA-256 of the normalised title>`; `dev:<normalised name>`" — `10-spec/40-domain/domain-model.md:513` | Names that differ only in case now share one intent key, so a verdict carries over between them across snapshots (C001-INV-11) |
| 8 | Evidence runs in workspaces outside the repository, no `git worktree`; ignored dependencies, git metadata, submodules, package links, the self-contained mutation copy and the observation mechanism left to an ADR | C001-CON-22, C001-IF-013 | "a git worktree is not used, because creating one writes administration files into the git directory and runs checkout hooks and filters" — `10-spec/60-architecture/constraints.md:29` | Copy and cold-build cost: row 12. What the core does not prevent: rows 13 and 14. C001-TS-562 holds only if the ADR exposes no link to the real git directory, which C001-IF-013 §9 item 1 requires. Build outputs of the working tree are never a mitigation (CR-27 resolved). The mutation copy must lead into no other evidence workspace, shown by the ADR with a kill test, and a self-containment check reports files its tests load from elsewhere with ERR-EVID-011 (CR-29 resolved); the copy window and the copy's own lifetime are not yet in the domain model (CR-33) |
| 9 | A command whose text names a working-tree path runs there | C001-REQ-521 statement, C001-IF-013 §1 item 6 | "acts there as the developer's own command; the analysis core runs it as given" — `10-spec/50-interfaces/evidence-runs.md:37` | Part of the stated exception of C001-REQ-521 (row 13) and reported with ERR-EVID-009 (C001-TS-569) |
| 10 | A narrowing of the public API recognition of C001-REQ-417, if 30 % is missed, is decided by P-01 only | C001-AS-07, C001-REQ-417 | "is decided by P-01 on a proposal that gives the measured split by reason; no specialist narrows it (Q-clearing-06)" — `10-spec/10-context/scope.md:48` | Decided by P-01 in round 11 ("**Answer:** You decide (Recommended)", `10-spec/questions-log.md:324`). The C001-REQ-417 rationale now says the same (CR-31 resolved). Before any proposal, C001-NFR-005 Method step 5 treats a run with hunks under "refused for working-tree execution" or "lost to an installed copy", or with no passing test for any added line, as an environment fault to be measured again (CR-28 resolved); C001-AS-07 then checks the link signals |
| 11 | The C001-NFR-005 harness records "expresses" on every intent as a stand-in | C001-NFR-005 | "The judgements of step 3 stand in for the developer's; they are not a statement that the benchmark tests express their intents." — `10-spec/30-nfr/nfr.md:126` | Matches Q-clearing-05; the 30 % assumes a developer who accepts every intent's tests |
| 12 | Workspace preparation and the cold build of the first run of each review session are covered by an assumption, not a threshold | C001-AS-08, C001-NFR-018, C001-IF-013 §8 item 3 | "Accepted by P-01 as stated, with no bound on the first test run of a session (Q-workspace-01)" — `10-spec/10-context/scope.md:49` | Decided by P-01 in round 11 ("**Answer:** Accept AS-08 (Recommended)", `10-spec/questions-log.md:312`). Still worth knowing at the gate: the wait at the start of each session is only reported (C001-DOD-014), and (a) compares two cold runs, so a long cold build on both sides brings the ratio closer to 1. Mitigations now reuse only what the analysis core produced from known content (C001-IF-013 §8 item 3) |
| 13 | The analysis core protects the working tree only from what it supplies; project code that reaches the working tree on its own is not prevented | C001-REQ-521, C001-IF-013 §9 items 1 and 2, C001-CON-22 | "except for changes that the run's command or the project code it runs makes through a path of the working tree or of the git directory that the analysis core did not supply" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:191` | No operating-system sandbox. A confirmed bundle command can change the developer's files (C001-TS-569) or tag the repository (C001-TS-572), and a test can write to a working-tree path named in the developer's environment (C001-TS-568). Python project modules now load from the workspace even with an editable install (C001-IF-013 §2 item 7, C001-TS-567); a Python process started with `-I` or `-E`, a Node or .NET package link and an absolute path still execute working-tree files, which count for no hunk (ERR-EVID-008, C001-TS-574). The developer is told (row 14), not protected. An installed copy of the project executes files at no path of the snapshot, which count for no hunk and raise no notice (row 19) |
| 14 | Every change of the working tree, the index or the refs during a run raises notice ERR-EVID-009, without attribution | C001-REQ-523, ERR-EVID-009 | "stating that the run or another program changed them" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:199` | Edits of the developer or the agent during a run raise it too (C001-TS-570), as do tools that write ignored outputs under the working-tree root, so in a session where the agent keeps working the notice can follow most runs and hide the case it exists for. It changes no evidence. A part of the working tree or the repository that could not be observed for the whole run is reported by a requirement of its own, C001-REQ-524, with notice ERR-EVID-010 (C001-TS-575 to C001-TS-579; CR-26 and CR-30 resolved); only the absence of both notices means that everything was observed and nothing changed |
| 15 | The bundle overhead (c) of C001-NFR-018 holds both while mutation testing runs and after it has ended; to keep it, mutation testing uses one worker fewer than the logical CPU cores, at a lower scheduling priority | C001-NFR-018, C001-IF-013 §1 item 4, §8 items 2 and 4, C001-CON-22, C001-DOD-014 | "(c) is taken both while mutation testing of the snapshot runs and after it has ended, and its threshold holds in each of these two states (Q-overhead-01)" — `10-spec/30-nfr/nfr.md:112`; "it uses at most one worker fewer than the machine's logical CPU cores, and at least" / "one, and its processes run at a lower scheduling priority than the analysis core and the bundle" / "commands" — `10-spec/50-interfaces/evidence-runs.md:29-31` | Decided by P-01 in round 12 ("**Answer:** In both states (Recommended)", `10-spec/questions-log.md:338`). The means (7 workers on the reference machine, lower priority) is the architect's, and the ADR of C001-CON-22 may replace it. Since P-01 chose 60 min for (b) with mutants "in parallel on 8 cores" (`10-spec/questions-log.md:197`), (b) has also taken in the copy of the test run's workspace, the work that makes the copy self-contained, the self-containment check (which can be one unmutated test run in the copy, C001-IF-013 §5 item 4) and the capacity kept free. "when the two thresholds cannot both hold, the conflict goes back to P-01, and the ADR relaxes neither" (`10-spec/60-architecture/constraints.md:29`). The run of (c) taken during mutation testing starts after the copy is made (CR-32 resolved) |
| 16 | The C001-NFR-005 benchmark loads every project file from its snapshot path in the evidence workspace: no editable install or package link from the working tree and no installed copy; the editable-install case is only shown by the ADR | `30-nfr/nfr.md` §0, C001-NFR-005, C001-CON-22, C001-DOD-015 | "This is stricter than C001-IF-013 §2 item 7, which imports Python project modules from the" / "evidence workspace even with an editable install from the working tree, so that no measurement" / "of this file depends on that rule; the editable-install case is shown by the ADR named in" / "C001-CON-22." — `10-spec/30-nfr/nfr.md:56-59` | The 30 % target is measured in a cleaner Python setup than the common one (`pip install -e`, Poetry, uv), so that a miss cannot come from the import rule. Where the tests need the project installed, it is installed in editable mode from the workspace's own sources, or the project's test configuration puts the workspace's source root on the import path. A run with hunks whose passing-test evidence was refused for working-tree execution or lost to an installed copy, or with no passing test for any added line, is an environment fault and is measured again (Method step 5; CR-28 resolved). The ADR shows the editable-install case on the same Python benchmark change (`10-spec/60-architecture/constraints.md:29`), but the open share is not measured in that setup |
| 17 | C001-TS-582 and C001-TS-583 assert the 1 s threshold of C001-NFR-018 (c) in the acceptance suite | C001-TS-582, C001-TS-583, C001-DOD-005, C001-DOD-027 | "And the evidence-bundle overhead (c) of C001-NFR-018 is at most 1 s for each of the 10 commands" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:444` | The test-designer's caution: these scenarios run in CI on every runner of C001-DOD-027, not on the reference machine for which C001-NFR-018 sets the threshold, so they may fail on a slower or loaded CI machine although the NFR holds. No other acceptance scenario asserts an NFR time threshold. Fix as suggested, or waive at G2: CR-34 |
| 18 | A run that needs the test run's workspace while mutation testing copies it waits for the copy; the wait falls under no threshold of C001-NFR-018 | C001-IF-013 §2 item 3, §8 item 2, C001-NFR-018 | "1. Wait for the copy (Recommended) — No extra workspace preparation; the wait is excluded from (c)." — `10-spec/questions-log.md:368`; "**Answer:** (fatigue guard — recommended option applied)" — `…/questions-log.md:371` | Q-copy-window-01, resolved under the fatigue guard (Q-fatigue-01) with its recommended option and not asked. The other option (prepare a new workspace) avoids the wait but adds a preparation and a cold build outside any threshold. The wait lasts no longer than the copy, which counts in (b) (C001-IF-013 §8 item 2). Not yet marked as an assumption in the artifact (CR-35) |
| 19 | An installed copy of the project in the developer's environment counts for no hunk and raises no notice | C001-REQ-506, C001-IF-013 §4 item 2, C001-TS-584 | "and through an installed copy of the project, tests execute files at no path of the snapshot, which count for no hunk either and raise no notice" — `10-spec/30-nfr/nfr.md:128`; "And no notice ERR-EVID-008 is shown" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:231` | Outside the benchmark. A test command that runs the tests against a regular install of the project (for example through tox, which by default installs the project as a regular, non-editable package into its own environment) can leave every added Python line without a passing test: nothing clears by the passing-tests rule, no mutant is generated, and the developer is not told why. The notice suggested as optional in CR-28 (a deep-ecosystem test run that executes no file of the snapshot) was not adopted. The effect is conservative (more hunks stay open), but the loss of test evidence is silent |

### Re-review 4 verdict
No blocker and no major finding is open. All five findings in the brief are resolved: CR-28 to
CR-32. P-01's round-12 answers are applied: Q-overhead-01 in C001-NFR-018 (c), C001-IF-013 §1
item 4 and the risk of C001-CON-22; Q-finish-01 by this pass; Q-fatigue-01 once, for
Q-copy-window-01, applied but not marked as an assumption (CR-35). Three new findings are open,
all minor, each with owners among the specialists, and none needs a P-01 decision to be fixed:
CR-33 (the domain model and the mutation-evidence lifecycle miss the copy window, the copy's
lifetime and the two new unavailable outcomes, and no scenario covers a failed copy), CR-34
(C001-TS-582 and C001-TS-583 assert the 1 s threshold of C001-NFR-018 (c) in the CI acceptance
suite, the test-designer's caution) and CR-35 (the assumption marker for Q-copy-window-01). From
the critic's side the specification can go to G2: CR-33 and CR-35 are text edits by the architect
and the test-designer that need no further critic pass, and CR-34 can be fixed as suggested or
waived by P-01 at the gate. At G2, P-01 should read rows 12 to 19 of the gate notes: the
session-start cost is reported, not bounded; for project code the working tree is reported, not
protected; the 30 % target is measured in a clean Python setup; (c) holds while mutation testing
runs at a cost to (b), and a conflict between them comes back to P-01; two acceptance scenarios
carry the 1 s threshold into CI; the copy-window rule was taken under the fatigue guard; and an
installed copy of the project in a developer's environment clears no Python hunk by passing tests
and raises no notice.

## Focused re-review 5

**Scope.** The revision of the approved specification for defects D-001 to D-007 of `change.md`,
found while the plan-phase ADRs were written, with rounds 13 and 14 of `10-spec/questions-log.md`
(Q-cleanfilter-01 answered "Index blob if up to date", Q-filterworkspace-01 answered "Copy working
tree, checked") and Q-filterworkspace-02, resolved under the fatigue guard. Changed: C001-REQ-125
to C001-REQ-127, C001-REQ-525 to C001-REQ-527 and C001-REQ-820 with their criteria, scenarios
(C001-TS-162 to C001-TS-177, C001-TS-586 to C001-TS-599, C001-TS-858 to C001-TS-862) and coverage
rows; cross-references in C001-REQ-101, C001-REQ-106, C001-REQ-521, C001-REQ-809 and
C001-REQ-819; C001-US-101, C001-US-502, C001-US-503, C001-US-504 and C001-US-803; C001-IF-012 §2
item 2, G-01, G-07, G-15, §6 and §7; C001-IF-013 §1 item 7, §2 items 1, 3, 4, 5 and 8, §3 item 1
and §9 item 1; ERR-INTAKE-008, ERR-INTAKE-009, ERR-EVID-012, ERR-EVID-013 and ERR-CFG-004; the
`keyCredential.service` pattern of C001-IF-004; the exit-3 row of C001-IF-001; the registry rows
and the namespace row of `50-interfaces/README.md`; C001-CON-17, C001-CON-18 and C001-CON-22; the
Realizes lists of C001-COMP-003, C001-COMP-004, C001-COMP-006 and C001-COMP-011; four glossary
terms; `00-index.md`, C001-DOD-001, C001-DOD-005, C001-DOD-008 and DOD-G-02. The changed lines
were read with `git diff` against the G2 approval (commit 57e5b42). Out of scope by the brief: the
plan-phase ADRs that now lag the specification, and TR-06, TR-08 and LINT-OBS-001.
`sdd lint 001 --phase 10-spec --json`: 846 errors. 828 of them are TR-06 and TR-08, the counts
that `sdd trace 001` reports (0 / 212 requirements implemented by a task, 0 / 616 scenarios mapped
to a test case); the other 18, as many as there are NFRs, are cut from the printed output and are
taken to be the plan-phase LINT-OBS-001 that the brief names. `sdd lint 001 --quick --file` on each
changed requirement, acceptance, interface, schema, NFR and constraint file: 0 findings.
`sdd trace 001`: TR-01 55 / 55, TR-02 212 / 212, TR-03 212 / 212, TR-04 18 / 18, TR-05 212 / 212
and 18 / 18; 22 open items (14 in `10-spec/85-open-items.md`, 8 in `00-ideation/85-open-items.md`).

**Reviewed set** (changed IDs and the IDs linked to them; the frontmatter keeps `all` because this
file holds the full review): C001-REQ-101, C001-REQ-106, C001-REQ-117, C001-REQ-120, C001-REQ-125,
C001-AC-125.1, C001-TS-162, C001-TS-163, C001-TS-164, C001-TS-165, C001-TS-166, C001-REQ-126,
C001-AC-126.1, C001-TS-167, C001-TS-168, C001-TS-169, C001-TS-170, C001-TS-171, C001-TS-172,
C001-TS-173, C001-REQ-127, C001-AC-127.1, C001-TS-174, C001-TS-175, C001-TS-176, C001-TS-177,
C001-US-101, C001-REQ-505, C001-REQ-509, C001-REQ-521, C001-REQ-522, C001-REQ-523, C001-REQ-525,
C001-AC-525.1, C001-TS-586, C001-TS-587, C001-TS-588, C001-TS-589, C001-TS-590, C001-REQ-526,
C001-AC-526.1, C001-TS-591, C001-TS-592, C001-TS-593, C001-TS-594, C001-TS-595, C001-TS-596,
C001-REQ-527, C001-AC-527.1, C001-TS-597, C001-TS-598, C001-TS-599, C001-US-502, C001-US-503,
C001-US-504, C001-REQ-809, C001-REQ-819, C001-REQ-820, C001-AC-820.1, C001-TS-858, C001-TS-859,
C001-TS-860, C001-TS-861, C001-TS-862, C001-US-803, C001-IF-001, C001-IF-004, C001-IF-010,
C001-IF-012, C001-IF-013, C001-CON-13, C001-CON-14, C001-CON-17, C001-CON-18, C001-CON-22,
C001-COMP-003, C001-COMP-004, C001-COMP-006, C001-COMP-011, C001-DOD-001, C001-DOD-005,
C001-DOD-008; and ERR-INTAKE-008, ERR-INTAKE-009, ERR-EVID-012, ERR-EVID-013 and ERR-CFG-004 of
`errors.md`, the glossary terms git program, clean filter, git repository-locating environment
variable, credential-store entry and snapshot, `00-index.md`, DOD-G-02, and rounds 13 and 14 and
the fatigue-guard entry Q-filterworkspace-02 of `questions-log.md`.

**Open after focused re-review 5:** 0 blocker, 2 major (CR-36, CR-37), 7 minor (CR-38 to CR-44).
CR-35 is resolved (below); CR-33 and CR-34 lie outside the reviewed set and were not re-checked.

| Findings | blocker | major | minor |
|---|---|---|---|
| New in this re-review (CR-36 to CR-44) | 0 | 2 | 7 |
| All findings CR-1 to CR-44 | 2 | 12 | 30 |

### Defects D-001 to D-007
| Defect | Resolved | Evidence | Left |
|---|---|---|---|
| D-001 | yes | "IF the git program is not found, reports a version older than 2.34, or refuses to read the repository, THEN THE analysis core SHALL stop intake without creating a snapshot or a review" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:209`; "## §6 The git program (C001-REQ-125)" — `10-spec/50-interfaces/git-access.md:73`; ERR-INTAKE-008 — `10-spec/50-interfaces/errors.md:26`; "git unusable: ERR-INTAKE-008, for every command that reads git data (C001-IF-012 §6)" — `10-spec/50-interfaces/review-cli.md:71`; C001-TS-162 to C001-TS-166 | CR-41, CR-43 |
| D-002 | yes | "Prerequisites that the developer installs, outside the package: Node.js 22 or later, an LTS line (C001-ADR-001), and git 2.34 or later" — `10-spec/60-architecture/constraints.md:25` | CR-41 (optional: an older Node.js) |
| D-003 | yes | "each grammar at the version pinned for the release (C001-ADR-003), are fixed per release" — `10-spec/60-architecture/constraints.md:24` | none |
| D-004 | yes | "THE analysis core SHALL start every command of an evidence run with no git repository-locating environment variable in the command's environment." — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:223`; "7. **Git repository-locating variables** (C001-REQ-525)." — `10-spec/50-interfaces/evidence-runs.md:41`; C001-TS-586 to C001-TS-590 | none |
| D-005 | yes, for the credential store | "IF the review configuration names a credential-store entry whose service name is neither `sdd-review` nor a name that begins with `sdd-review/`" — `10-spec/20-capabilities/CAP-08-model-provider/requirements.md:158`; `"pattern": "^sdd-review(/.*)?$"` — `10-spec/50-interfaces/review-config.schema.json:180`; ERR-CFG-004 — `10-spec/50-interfaces/errors.md:40`; C001-TS-858 to C001-TS-862 | CR-44 |
| D-006 | yes | "THEN THE analysis core SHALL leave the submodule's path in the evidence workspace as an empty directory and report a notice that names the submodule path and the missing commit" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:233`; "8. **Submodules** (C001-REQ-526)." — `10-spec/50-interfaces/evidence-runs.md:214`; ERR-EVID-012 — `10-spec/50-interfaces/errors.md:63`; C001-TS-591 to C001-TS-596 | CR-39, CR-42 |
| D-007 | yes, for files that git's index records as up to date | "WHEN intake finds a file under a clean filter that is up to date in the index, THE analysis core SHALL read the file's content from the blob that git's index records for its path" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:225`; "Scenario: C001-TS-174 — A Git LFS file checked out and left alone is not part of the change" — `10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:860`; files not up to date are named in ERR-INTAKE-009 (C001-REQ-126); evidence workspaces get the working-tree copy (C001-REQ-527) | CR-36 to CR-40 |

### Status of earlier open findings
| Finding | Status | Evidence |
|---|---|---|
| CR-35 | resolved | `[ASSUMPTION: Q-copy-window-01]` follows the copy-window rule — `10-spec/50-interfaces/evidence-runs.md:140`; the generated list names it with reference Q-copy-window-01 — `10-spec/85-open-items.md:29` |
| CR-33, CR-34 | not re-checked | outside the reviewed set of this revision |

### Rounds 13 and 14, and Q-filterworkspace-02
Round 13: "**Answer:** Index blob if up to date (Recommended)" (`10-spec/questions-log.md:384`) is
applied in C001-REQ-127 and C001-IF-012 §7 items 1 and 2. Round 14: "**Answer:** Copy working
tree, checked (Recommended)" (`10-spec/questions-log.md:397`) is applied in C001-REQ-527 and
C001-IF-013 §2 item 1, including the cost the option named: "No copy of the working-tree bytes is
kept outside the evidence workspaces, so workspaces of" / "one snapshot can differ" (`10-spec/50-interfaces/evidence-runs.md:111-112`).
Neither answer carries extracted instructions. Q-filterworkspace-02 is applied only as the "on
Linux or macOS" condition of one C001-TS-598 row; it is stated and marked nowhere else (CR-37).

### Findings

### CR-36 — Evidence workspaces now hold content that is not the snapshot's, while C001-REQ-509 and C001-REQ-522 still require runs on the snapshot's content
- **Severity:** major
- **Refs:** C001-REQ-527, C001-REQ-509, C001-REQ-522, C001-AC-527.1, C001-TS-597, C001-IF-013
- **Evidence:** "IF a test run or an evidence-bundle command executes on file content that differs from the snapshot, THEN THE analysis core SHALL record none of its results as evidence and notify the developer that the files no longer match the snapshot." — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:94`; "THE analysis core SHALL perform the evidence runs of the snapshot, including those already in progress when the difference arose, on the content of the snapshot" — `…/CAP-05-review-evidence/requirements.md:215`; the snapshot holds the stored blob: "The identified, frozen state of the change taken at intake: base commit, HEAD commit and the content of every changed file" — `10-spec/40-domain/glossary-delta.md:30`, and "And its standard output gives for each of <files> the SHA-256 of the file's stored form, the Git LFS pointer file of its snapshot side" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:1079`; against "the bytes of its working-tree file, copied without running any filter" — `…/CAP-05-review-evidence/requirements.md:241`, "followed by the SHA-256 of the working-tree file <file> and a line end" and "And no notice ERR-EVID-005 is shown" — `…/CAP-05-review-evidence/acceptance.md:1058`, `:1060`; the interface moved its check from the snapshot to the fill: "every path of the snapshot must hold the content and mode that" / "§2 item 1 gave it in that workspace (for a file under a clean filter, its working-tree copy or" / "its stored form)" — `10-spec/50-interfaces/evidence-runs.md:227-229`, where the approved text reset "every path of the snapshot whose content or mode differs from the snapshot" (`10-spec/50-interfaces/evidence-runs.md:52` at commit 57e5b42)
- **Why it matters:** a working-tree copy of a Git LFS file holds its content while the snapshot holds its pointer file, so every run in a workspace with such a copy executes on file content that differs from the snapshot. Read as written, C001-REQ-509 discards the results of every run in a repository that uses Git LFS or git-crypt, and C001-REQ-522 forbids the copy; C001-TS-597 expects the opposite (no ERR-EVID-005). The interface settled it by comparing each workspace with what §2 item 1 gave it, but the requirements that a tester of C001-AC-509.1 and an implementer of the evidence runner read were not changed. The same reading also hides a real exception: under the stat-data limit of CR-37, a working-tree copy can hold bytes that are not the content of the snapshot's blob at all, and nothing in C001-REQ-509 says whether such a run counts as evidence.
- **Suggested fix:** Owner: spec-writer (`CAP-05-review-evidence/requirements.md`, `40-domain/glossary-delta.md`). Define the content a run may execute on (for example a term "workspace content": the snapshot's files, where a file under a clean filter may hold its working-tree copy under C001-REQ-527) and use it in C001-REQ-509 and C001-REQ-522, or add to both statements the exception for the working-tree copy of C001-REQ-527; state in the C001-REQ-527 rationale why the copy counts as the snapshot's file for C001-REQ-509 (git's index records it as the content of that blob) and where that stops holding (CR-37). Owner: test-designer (optional): a scenario under C001-AC-509.1 in which a test rewrites the working-tree copy of `assets/logo.png` in its workspace and the run is discarded with ERR-EVID-005.
- **Status:** resolved (focused re-review 6); the title of C001-AC-509.1 left by the fix was CR-47

### CR-37 — Trusting stat data lets an agent keep an edit out of the change while evidence runs execute it; repository settings and attributes extend this to every file and system, and the Windows limit accepted under the fatigue guard is stated nowhere
- **Severity:** major
- **Refs:** C001-REQ-127, C001-REQ-527, C001-REQ-101, C001-IF-012, C001-AC-127.1, C001-TS-172, C001-TS-598
- **Evidence:** "A file is **under a clean filter** when the `filter` attribute that git gives its path in the" / "working tree names a driver for which the repository's effective configuration sets" — `10-spec/50-interfaces/git-access.md:94-95`; "the file's stat data equal the entry's in every field that git compares under the" / "repository's `core.checkStat`, `core.trustctime` and `core.fileMode` settings" — `…/git-access.md:107-108`; "WHEN intake finds a file under a clean filter that is up to date in the index, THE analysis core SHALL read the file's content from the blob that git's index records for its path instead of from its working-tree bytes." — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:225`; against "WHEN the developer starts a review, THE analysis core SHALL take in as the change every difference between the base commit and the working tree" — `…/CAP-01-change-intake/requirements.md:16`; the only abuse cases of C001-REQ-127: "TS-172 (assume-unchanged flag ignored), TS-173 (no filter runs)" — `…/CAP-01-change-intake/acceptance.md:927`; the attributes that the clearing guards use, by contrast: "from the `.gitattributes` files of the commit's tree only (C001-REQ-426)" — `10-spec/50-interfaces/git-access.md:47`; Q-filterworkspace-02: "On Windows, an edit of a file under a clean filter that keeps its size and sets its modification time back is not visible in git's stat data, so the evidence workspace would get bytes that are not the snapshot's." and "Intake under C001-REQ-127 trusts the same stat data" — `10-spec/questions-log.md:402`, `:406`, "**Answer:** (fatigue guard — recommended option applied)" — `…/questions-log.md:409`; its only trace in the artifacts: "after "S1" was taken, on Linux or macOS, `assets/logo.png` was rewritten with other bytes of the same size" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:1091`; Q-filterworkspace-02 occurs in no file of `10-spec/` other than `questions-log.md`, and the generated list shows "Total: 14" (`10-spec/85-open-items.md:12`) with no entry for it; the condition of the guard: "each is logged and marked as an assumption you can review at G2" — `10-spec/questions-log.md:356`; and the option P-01 chose was described as "only filtered files edited since checkout or `git add` show as changed" — `…/questions-log.md:380`
- **Why it matters:** an agent with a shell can, without changing a tracked file, put any file under a clean filter (a line `* filter=x` in `.git/info/attributes` and `git config filter.x.clean cat`) and switch off the stat field that reveals an in-place write (`git config core.trustctime false`, or `core.checkStat minimal`). It can then rewrite, for example, `src/auth.ts` with the same number of bytes and set its modification time back. By §7 item 1 the entry is up to date, so intake reads the base blob and the edit is not part of the change: no hunk, no guarded-area match, nothing to sign. C001-REQ-527 then copies the edited working-tree bytes into every evidence workspace, so the tests execute code the review never shows. Before the revision every file was compared by its bytes, so this path is new; it breaks C001-REQ-101 and the description under which P-01 chose Q-cleanfilter-01, and C001-TS-172 shows that hiding an edit through git's index is an abuse case the specification means to cover. On Windows the same edit needs no setting at all (Q-filterworkspace-02). That limit was accepted under the fatigue guard, but no artifact states it, no marker shows it to P-01 at G2, and its effect at intake (an edit left out of the change), named only in the option text, is in no requirement. §7 item 1 also does not say that on Windows the compared values are those Git for Windows records rather than those the operating system reports (they differ, for example in the inode), so an implementation comparing the operating system's values would find no entry up to date and bring back the D-007 behaviour there.
- **Suggested fix:** Owner: architect (`50-interfaces/git-access.md` §7). Take the `filter` attribute only from the `.gitattributes` files of the base commit's tree, as G-11 does, so that `.git/info/attributes`, `core.attributesFile` and the change itself put no file under a clean filter. Compare size, modification time, change time, inode, user and group whatever `core.checkStat` and `core.trustctime` say (stricter than git and conservative: a file that fails is compared by its bytes, with ERR-INTAKE-009). State for Windows which values are compared and the residual limit: a same-size edit with its modification time set back is not seen, at intake and in evidence workspaces; mark it with `[ASSUMPTION: Q-filterworkspace-02]` (outside backticks in the artifact) in §7 item 1. Owner: spec-writer (`CAP-01-change-intake/requirements.md`, `CAP-05-review-evidence/requirements.md`): state the limit with the marker in the rationales of C001-REQ-127 and C001-REQ-527. Owner: test-designer (`CAP-01-change-intake/acceptance.md`): an abuse scenario under C001-AC-127.1 on Linux and macOS with `core.trustctime` false, `.git/info/attributes` naming a filter and a same-size edit of a source file with its modification time set back, which must list the file as modified. Conductor: `sdd trace 001 --write`, so that the marker reaches the open items shown at G2 (gate notes row 25).
- **Status:** resolved (focused re-review 6); the wider residual it left was CR-45

### CR-38 — C001-REQ-126, C001-REQ-127 and ERR-INTAKE-009 cover only files not up to date; C001-IF-012 §7 and C001-TS-176 also compare by their bytes files without index entry or with an unreadable blob
- **Severity:** minor
- **Refs:** C001-REQ-126, C001-REQ-127, C001-AC-127.1, C001-TS-176, C001-IF-012
- **Evidence:** "WHEN intake finds a file under a clean filter that is not up to date in the index and whose working-tree bytes, read without running the filter, differ from the content that the base commit holds at the same path" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:217`; "WHEN intake finds a file under a clean filter that is up to date in the index, THE analysis core SHALL read the file's content from the blob that git's index records for its path instead of from its working-tree bytes." — `…/CAP-01-change-intake/requirements.md:225`; against "A file with no index entry, with an entry that is not up to date, or" / "with an entry whose blob cannot be read from the object database is compared by its" / "working-tree bytes" — `10-spec/50-interfaces/git-access.md:121-123`; "Scenario: C001-TS-176 — An up-to-date entry whose blob is missing from the object database is compared by working-tree bytes" and "And intake reports the notice ERR-INTAKE-009 that names "assets/model.bin"" — `…/CAP-01-change-intake/acceptance.md:879`, `:887`; "an index blob that cannot be read falls back to this requirement (TS-176)" — `…/CAP-01-change-intake/acceptance.md:926`; the catalogue: "Intake lists as changed one or more files under a clean filter that are not up to date in the index", "because git's index does not record them as up to date" and "run `git status`, which runs the filter and refreshes git's index" — `10-spec/50-interfaces/errors.md:27`
- **Why it matters:** C001-TS-176 sits under C001-AC-127.1 but expects the opposite of C001-REQ-127's statement for an up-to-date entry, and the fallback it tests is in no statement; the coverage row places it under C001-REQ-126, whose statement excludes up-to-date files (A5). ERR-INTAKE-009 then tells the developer that git's index does not record the file as up to date, which is false for a missing blob, and suggests `git status`, which leaves a missing object missing. A file that the index no longer holds but the base commit does (for example after `git rm --cached`) raises the notice under §7 item 4 and under no requirement.
- **Suggested fix:** Owner: spec-writer (`CAP-01-change-intake/requirements.md`): extend C001-REQ-126 to a file under a clean filter that is not up to date in the index, has no index entry, or whose index entry names a blob that cannot be read, and limit C001-REQ-127 to entries whose blob can be read. Owner: test-designer: move C001-TS-176 under C001-AC-126.1 and correct both coverage rows. Owner: architect (`50-interfaces/errors.md`): give ERR-INTAKE-009 the cause per file, or a message and fix of their own for an unreadable blob (for example `git fsck`, or fetching the object again).
- **Status:** resolved (focused re-review 6)

### CR-39 — Three new notice requirements name every file or submodule; the interfaces and scenarios name at most 10
- **Severity:** minor
- **Refs:** C001-REQ-126, C001-REQ-526, C001-REQ-527, C001-TS-171, C001-TS-594, C001-TS-598
- **Evidence:** "THE analysis core SHALL list the file as a changed file and name it in notice ERR-INTAKE-009." — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:217`; "report a notice that names the submodule path and the missing commit" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:233`; "and otherwise give the file the content that the snapshot holds for it and name it in notice ERR-EVID-013" — `…/CAP-05-review-evidence/requirements.md:241`; against "| 11 | exactly 10 of the 11 paths |" — `…/CAP-01-change-intake/acceptance.md:835` and `…/CAP-05-review-evidence/acceptance.md:1026`, and "| 11 | exactly 10 of the 11 files |" — `…/CAP-05-review-evidence/acceptance.md:1096`; the wording an approved requirement uses: "the number of changed paths and up to 10 of them" — `…/CAP-05-review-evidence/requirements.md:199`
- **Why it matters:** with 11 such files or submodules the 11th is not named, which the three statements forbid as written; the scenarios are right by the interfaces (C001-IF-012 §7 item 4, C001-IF-013 §2 items 1 and 8) and wrong by the requirements.
- **Suggested fix:** Owner: spec-writer: in the three statements, name "the number of such files (submodules) and up to 10 of them", as C001-REQ-523 does, with "each with its recorded commit" for C001-REQ-526 and "each with its filter driver" where the interface gives it.
- **Status:** resolved (focused re-review 6)

### CR-40 — C001-REQ-527 states two outcomes for one fill event; the rewrite at reset, mutation runs and the per-run notice are outside its statement, and C001-US-504 does not list it
- **Severity:** minor
- **Refs:** C001-REQ-527, C001-AC-527.1, C001-TS-597, C001-TS-598, C001-US-504, C001-IF-013
- **Evidence:** "### C001-REQ-527 — Give files under a clean filter their working-tree bytes in evidence workspaces" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:239`; "WHEN the analysis core fills an evidence workspace, THE analysis core SHALL give each regular or executable file of the snapshot" and "and otherwise give the file the content that the snapshot holds for it and name it in notice ERR-EVID-013" — `…/CAP-05-review-evidence/requirements.md:241`; "- **Stories:** C001-US-502, C001-US-503" — `…/CAP-05-review-evidence/requirements.md:243`; against "When the evidence runner fills the workspace, and whenever" / "item 3 writes the file again, it reads the file's index entry through the git access port" — `10-spec/50-interfaces/evidence-runs.md:89-90`; "every file under a clean filter that" / "holds its stored form (item 1) is written again by item 1" — `…/evidence-runs.md:122-123`; "Each test run, mutation run and bundle command whose workspace holds such a file in its" / "stored form raises notice ERR-EVID-013" — `…/evidence-runs.md:106-107`; the reset tested under the criterion: "an earlier run of the command in the only evidence workspace of "S1", now free, raised ERR-EVID-013 for it, and the developer then ran `git status`" — `…/CAP-05-review-evidence/acceptance.md:1069`; C001-US-504 lists "C001-REQ-525, C001-REQ-526" but not C001-REQ-527 — `10-spec/20-capabilities/CAP-05-review-evidence/stories.md:72`, although ERR-EVID-013 covers "The evidence workspace of a test run, mutation run or bundle command" — `10-spec/50-interfaces/errors.md:64`
- **Why it matters:** the working-tree copy and the stored form with its notice are two outcomes that fail independently (an implementation can copy correctly and never notify), and C001-TS-597 and C001-TS-598 test them apart (R1). The third row of C001-TS-597 tests a rewrite at reset that no statement asks for, since the trigger names only the fill. The statement reads as one notice when a workspace is filled, while the interface raises it for every run whose workspace holds a stored form, mutation runs included, whose story C001-US-504 does not list the requirement, unlike C001-REQ-525 and C001-REQ-526. The title promises working-tree bytes, while half the statement gives the stored form.
- **Suggested fix:** Owner: spec-writer (`CAP-05-review-evidence/requirements.md`, `stories.md`): split C001-REQ-527 into an event-driven requirement for the working-tree copy ("WHEN the analysis core fills an evidence workspace or writes one of its files again, …") and an unwanted-behaviour requirement for the stored form with its notice per test run, mutation run and bundle command whose workspace holds one; retitle accordingly; list both under C001-US-504 and C001-US-504 in their Stories. Owner: test-designer: split C001-AC-527.1 to match.
- **Status:** resolved (focused re-review 6)

### CR-41 — C001-REQ-125 covers fewer causes and commands than C001-IF-012 §6, and ERR-INTAKE-008 has no message for a git program that is found but cannot start
- **Severity:** minor
- **Refs:** C001-REQ-125, C001-AC-125.1, C001-TS-162, C001-TS-163, C001-CON-18
- **Evidence:** "IF the git program is not found, reports a version older than 2.34, or refuses to read the repository, THEN THE analysis core SHALL stop intake" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:209`; against "| too old | the first two numbers of the version that `git --version` prints are below 2.34 (for example 2.33.8); a text without a readable version counts as too old and is shown as printed |" — `10-spec/50-interfaces/git-access.md:83`, tested by "| git version custom-build | git version custom-build |" — `…/CAP-01-change-intake/acceptance.md:747`; "a missing or older git stops every command that reads git data with ERR-INTAKE-008" — `10-spec/60-architecture/constraints.md:25`; "The message names the cause and, when a program was" / "found, its path and the version it printed." — `10-spec/50-interfaces/git-access.md:77-78`, while the cause "not found" includes "or the program found cannot be started" (`…/git-access.md:82`), the message offers only "<the git program was not found on PATH" for it (`10-spec/50-interfaces/errors.md:26`), and C001-TS-162 expects "states that the git program was not found on PATH" for "the only `git` on `PATH` is a file that the operating system cannot start as a program" — `…/CAP-01-change-intake/acceptance.md:723`, `:730`
- **Why it matters:** an unreadable version string, and a refusal in a command other than intake (for example a verdict command reading `user.name` through G-10), are handled by the interface but by no requirement statement, so the fourth row of C001-TS-163 tests behaviour that C001-REQ-125 does not require. A developer whose `git` exists but cannot start is told that no git was found on PATH and gets no path to check, against §6.
- **Suggested fix:** Owner: spec-writer: word C001-REQ-125 as "is not found or cannot be started, reports a version older than 2.34 or no readable version, or refuses to read the repository, THEN THE analysis core SHALL stop the command …", or keep intake in the statement and name the other commands in the rationale. Owner: architect (`50-interfaces/errors.md`): a message for a program that cannot be started, with its path and the cause; test-designer: align the second row of C001-TS-162. Optional (C001-CON-18): state what the CLI does when started on a Node.js older than 22.
- **Status:** resolved (focused re-review 6)

### CR-42 — Submodule repositories are read outside the git access port
- **Severity:** minor
- **Refs:** C001-REQ-526, C001-IF-012, C001-IF-013, C001-CON-13, C001-COMP-011
- **Evidence:** "is filled from the commit that the snapshot records for it, read from the" / "submodule's local repository, at every depth of nesting (C001-ADR-006 §5)" — `10-spec/50-interfaces/evidence-runs.md:215-216`; "read from the submodule's local repository (C001-ADR-006 §5, C001-IF-012 G-13)" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:234`; G-13 takes no repository: "| G-13 | `treeEntries(commit)` | every file of the commit's tree with its path, file mode (regular, executable, symbolic link, submodule) and blob hash | read from the object database only;" — `10-spec/50-interfaces/git-access.md:49`; the registry row of C001-IF-012 lists "C001-REQ-125 to C001-REQ-127, C001-REQ-409, C001-REQ-426, C001-REQ-521, C001-REQ-522, C001-REQ-527" and not C001-REQ-526 — `10-spec/50-interfaces/README.md:24`; "All git data is read through the git access port (C001-IF-012) under its safety rules" — `10-spec/60-architecture/constraints.md:20`
- **Why it matters:** a submodule's local repository (for example under `.git/modules/<name>`) is another repository, with its own configuration, object database and owner. No port operation finds it or reads its trees, and nothing says that the safety rules of §2 (read-only, no repository-configured program, no network) and the refusal of §6 apply to it; the evidence runner then reads it outside C001-CON-13, or the ADR defines the operation with no contract to check it against. "No local repository" and a repository that git refuses are not told apart either.
- **Suggested fix:** Owner: architect (`50-interfaces/git-access.md`, `50-interfaces/README.md`, `60-architecture/architecture.md`): add an operation, for example `submoduleTree(path, commit)`, that locates the submodule's local repository, applies §2 to it, returns its tree entries and content or "absent" with the cause (no repository, commit missing, refused by git), and serves nested submodules; list C001-REQ-526 in the registry row of C001-IF-012 and the operation in the Interfaces line of C001-COMP-011.
- **Status:** resolved (focused re-review 6)

### CR-43 — Two choices that the revision states as made are still listed as open
- **Severity:** minor
- **Refs:** C001-CON-14, C001-CON-18, C001-CON-22, C001-IF-012, C001-IF-013, C001-COMP-003, C001-REQ-125, C001-REQ-525
- **Evidence:** "Git access is implemented either by running the git program the developer installed or with a git library, chosen by ADR in 20-plan against C001-IF-012." — `10-spec/60-architecture/constraints.md:21`; "Whether" / "it is implemented by calling the installed git program or with a git library is decided by ADR in" — `10-spec/50-interfaces/git-access.md:12-13`; "- **Depends on:** none (external: git program or library)" — `10-spec/60-architecture/architecture.md:99`; against "C001-ADR-004 implements this port with the installed git program" — `10-spec/50-interfaces/git-access.md:74`, "git 2.34 or later, run only as a separate program with the hardening profile of C001-ADR-004" — `10-spec/60-architecture/constraints.md:25`, and C001-REQ-125 (`10-spec/20-capabilities/CAP-01-change-intake/requirements.md:209`); and "whether the workspace offers" / "git metadata (some builds read their version from the git history) and how submodule working" / "trees are provided are set by ADR in 20-plan" — `10-spec/50-interfaces/evidence-runs.md:170-172` (also in the ADR scope of C001-CON-22, `10-spec/60-architecture/constraints.md:29`), against "instead of finding no repository in the" / "workspace, which holds no git metadata (C001-ADR-006 §5)." — `10-spec/50-interfaces/evidence-runs.md:45-46` and "in the evidence workspace, which holds no git metadata (C001-ADR-006 §5 and Consequences)" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:224`
- **Why it matters:** C001-REQ-125, ERR-INTAKE-008 and C001-CON-18 hold only when git access runs the git program, and the C001-REQ-525 rationale and C001-TS-587 rely on a workspace without git metadata, yet the texts a later ADR revision is checked against still allow the other options. A reader cannot tell decisions from open choices, and a plan revision that took a git library or offered git metadata would silently void a Must requirement or its reasoning. Citations of ADR sections (C001-ADR-004 items 1 and 4, C001-ADR-006 §2, §3.1 and §5) also tie the specification to plan sections that the brief says will change.
- **Suggested fix:** Owner: architect (`60-architecture/constraints.md` C001-CON-14 and C001-CON-22, `50-interfaces/git-access.md` §1, `50-interfaces/evidence-runs.md` §2 item 4, `60-architecture/architecture.md` C001-COMP-003): record both as decided (the git program, by C001-ADR-004; no git metadata in a workspace, by C001-ADR-006), or word C001-REQ-125 and the C001-REQ-525 rationale so that they hold under either option; cite ADRs by ID where a section number can move.
- **Status:** resolved (focused re-review 6)

### CR-44 — C001-REQ-820 closes the credential-store route of a hostile base commit, while the same configuration still names any environment variable as the key, and the trust boundary that makes this acceptable is not stated
- **Severity:** minor
- **Refs:** C001-REQ-820, C001-REQ-809, C001-REQ-505, C001-IF-004, C001-IF-010
- **Evidence:** "a hostile base commit could name the credential-store entry of another application and, with the cloud opt-in setting, send that secret to an endpoint of its choice; accepting only the service name `sdd-review` and the names below `sdd-review/` keeps the analysis core to entries made for it" — `10-spec/20-capabilities/CAP-08-model-provider/requirements.md:159`; the same configuration names any environment variable: `"pattern": "^[A-Za-z_][A-Za-z0-9_]*$"` — `10-spec/50-interfaces/review-config.schema.json:168`, which is read first: "the environment" / "variable named by `keyEnv` when it is set and not empty" — `10-spec/50-interfaces/model-provider.md:112-113`; the same configuration sets code that runs: "THE analysis core SHALL run on the snapshot the test command given by the developer for the review or, when none is given, the test command set in the review configuration" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:62`; the plan states the boundary that the specification leaves out: "The same base commit can already run" / "any code through `tests.command` (C001-REQ-505), so the trust boundary does not move." — `20-plan/20-decisions/ADR-008-credential-store-access.md:107-108`
- **Why it matters:** a base commit that sets `keyEnv` to `GITHUB_TOKEN` or `AWS_SECRET_ACCESS_KEY`, an endpoint of its choice and the cloud opt-in sends that secret as the provider key, a route to which the reason given for C001-REQ-820 applies as much as to the credential store. P-01 reads C001-REQ-820 as closing what a hostile base commit can take, while the specification nowhere says that the base commit's configuration is trusted as code (it sets the test command that every analysis runs), which is why neither route moves the trust boundary. The namespace still has value: it limits what a mistaken configuration can reach.
- **Suggested fix:** Owner: spec-writer (`CAP-08-model-provider/requirements.md`, or an assumption in `10-context/scope.md`): state the trust boundary (the review configuration of the base commit is trusted as code, since it sets the test command the analysis runs) and present C001-REQ-820 as defence in depth. Owner: architect: either apply a namespace to `keyEnv` too (for example names beginning with `SDD_REVIEW_`), which changes how developers pass a key and so goes to P-01 as a question, or state why environment variables stay open (gate notes row 24).
- **Status:** resolved (focused re-review 6)

### Rubric (reviewed set)
| Rubric | Item | Result |
|---|---|---|
| stories | S1 Persona is a defined P-ID | pass |
| stories | S2 Value / outcome stated | pass |
| stories | S3 INVEST | pass |
| stories | S4 Every story has ≥ 1 requirement | pass |
| stories | S5 Out of scope stated where a neighbour exists | pass |
| stories | S6 Traces to the ideation | pass |
| requirements | R1 Singular outcome | CR-40 |
| requirements | R2 Testable | pass |
| requirements | R3 Unambiguous | CR-36 |
| requirements | R4 Correct EARS pattern | pass |
| requirements | R5 Implementation-free | pass |
| requirements | R6 Complete | CR-38, CR-41, CR-42 |
| requirements | R7 Consistent | CR-36, CR-37, CR-39, CR-40, CR-43, CR-44 |
| requirements | R8 Feasible | pass |
| requirements | R9 Necessary | pass |
| requirements | R10 Measurable values carry units and limits | pass |
| requirements | R11 Delta and evidence | n/a: greenfield change, no living spec (`10-context/current-state.md`) |
| requirements | R12 Priority set and consistent with the story | pass |
| NFRs | N1 ISO 25010 category | n/a: no NFR changed; C001-NFR-011 (cited by C001-REQ-526) and C001-NFR-018 (through C001-IF-013 §8) are unchanged |
| NFRs | N2 Metric with unit | n/a: no NFR changed |
| NFRs | N3 Threshold set | n/a: no NFR changed |
| NFRs | N4 Feasible method and environment | n/a: no NFR changed; the reset of filtered files inside (c) is gate notes row 22 |
| NFRs | N5 Covered by a DoD item | n/a: no NFR changed |
| acceptance | A1 Every REQ has ≥ 1 AC, every AC ≥ 1 scenario | pass |
| acceptance | A2 Scenarios observable and concrete | pass |
| acceptance | A3 One behaviour per scenario | pass |
| acceptance | A4 Error and abuse cases present | CR-37 |
| acceptance | A5 `n/a` cells justified credibly | CR-38 |
| domain, interfaces, architecture | D1 Entities with attributes, relationships, owner, invariants | pass |
| domain, interfaces, architecture | D2 Lifecycles > 2 states have a diagram and a complete transition table | pass |
| domain, interfaces, architecture | D3 Interfaces parse and name their errors | pass |
| domain, interfaces, architecture | D4 Every component has an ID, responsibilities, requirements served | pass |
| domain, interfaces, architecture | D5 Decisions with alternatives recorded | CR-43 |
| DoD and index | O1 Every REQ and NFR covered | pass |
| DoD and index | O2 Evidence types fit the statements | pass |
| DoD and index | O3 Global items referenced | pass |
| DoD and index | X1 The index is navigation only | pass |

Notes on rows marked pass:
- **S1 to S6, R9, R12:** every new requirement is listed by a story whose value it serves:
  C001-REQ-125 to C001-REQ-127 by C001-US-101 (`CAP-01-change-intake/stories.md:26`),
  C001-REQ-525 to C001-REQ-527 by C001-US-502 and C001-US-503, C001-REQ-525 and C001-REQ-526 also
  by C001-US-504, and C001-REQ-820 by C001-US-803; the missing C001-US-504 link of C001-REQ-527 is
  part of CR-40. C001-REQ-126, C001-REQ-127 and C001-REQ-527 are Should under Must stories, which
  is consistent: without them filtered files show as changed, the safe direction.
- **R1, R4:** C001-REQ-125, C001-REQ-126 and C001-REQ-526 pair a response with the message or
  notice that reports it, verified together in each scenario, as the approved C001-REQ-105 and
  C001-REQ-509 do; C001-REQ-525 is ubiquitous with one outcome; C001-REQ-820 is unwanted-behaviour
  with one outcome (the configuration counts as unreadable), whose effects are those of
  C001-REQ-427 and C001-REQ-819. C001-REQ-527 is the exception (CR-40).
- **R2, A1 to A3:** C001-TS-162 to C001-TS-166 use concrete versions (2.33.8, 2.9.5, 1.34.0,
  2.34.0, 2.34.1.windows.1) and git's own refusals; C001-TS-588 lists the 15 removed variables,
  C001-TS-589 kept ones and the replaced ceiling, C001-TS-590 two spellings on Windows;
  C001-TS-591 to C001-TS-596 count directory entries and check that a recording stub gets no
  request; C001-TS-597 to C001-TS-599 check SHA-256 values, the filter stub's log and the
  repository record; C001-TS-858 to C001-TS-862 check the key in the stub's requests, the boundary
  `sdd-reviewer` and that ERR-CFG-004 replaces ERR-CFG-001. `sdd trace 001` reports every new
  requirement with a criterion and every criterion with scenarios.
- **R5:** Git LFS, git-crypt, `safe.directory`, copy-on-write clones and
  `git rev-parse --local-env-vars` appear in rationales and interfaces; the statements name
  outcomes at the boundary.
- **R8, R10:** the up-to-date rule reproduces git's stat and racy-entry comparison from the index
  file and stat data without running a filter, the cost that the option P-01 chose in
  Q-cleanfilter-01 names; the removed variables are git's list of repository-local variables
  without its two command-line configuration variables, plus `GIT_NAMESPACE` and
  `GIT_QUARANTINE_PATH`; versions and the cap of 10 carry their values.
- **D1, D2:** the revision adds no entity and no state; the kinds of content of an evidence
  workspace (working-tree copy, stored form, empty submodule path) are defined in C001-IF-013 §2,
  to which the content of the EvidenceWorkspace entity points.
- **D3, D4:** the changed object of `review-config.schema.json` is well-formed and quick lint
  reports nothing; `^sdd-review(/.*)?$` accepts `sdd-review` and `sdd-review/x` and refuses
  `sdd-reviewer` (C001-TS-858, C001-TS-859). ERR-CFG-004 is a notice with exit 0, like the
  ERR-CFG-001 it replaces, and `config validate` gives ERR-CFG-003 with exit 10 (C001-TS-861),
  consistent with C001-REQ-820, C001-REQ-819 and C001-IF-010 §7 ("a configuration that holds a key
  value does not validate," / "ERR-CFG-001", `10-spec/50-interfaces/model-provider.md:116-117`).
  ERR-INTAKE-008 has exit 3 for every command that reads git data, as C001-CON-18 states.
  C001-COMP-003 and C001-COMP-004 realise C001-REQ-125 to C001-REQ-127, C001-COMP-006 realises
  C001-REQ-820, and C001-COMP-011 realises C001-REQ-525 to C001-REQ-527.
- **Who is named in which notice:** ERR-INTAKE-009 names files compared by their bytes at intake
  and never files read from the index (C001-TS-174, C001-TS-175); ERR-EVID-013 names stored forms
  in a run's workspace and never a file that C001-REQ-126 listed as changed ("And the notice does
  not name `assets/hero.png`", `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:1082`);
  ERR-EVID-012 names empty submodule paths with their commits. The cap of 10 is CR-39 and the
  causes of ERR-INTAKE-009 are CR-38.
- **O1 to O3, X1:** DOD-G-02 and the index count 212 active requirements and `sdd trace 001`
  reports 212 / 212; C001-DOD-001 covers "C001-REQ-101…127", C001-DOD-005 "C001-REQ-501…527" and
  C001-DOD-008 "C001-REQ-801…812, 814…820" (`10-spec/70-dod.md:32`, `:36`, `:39`); per capability
  27 + 24 + 28 + 27 + 27 + 17 + 22 + 19 + 21 = 212.

### Gate notes (rows 20 to 25 added; rows 1 to 19 of focused re-review 4 stand)
| # | Choice | Where | Evidence | Note for the gate |
|---|---|---|---|---|
| 20 | A git index refresh after intake raises the moved-on notice for a filtered file whose content did not change | C001-IF-012 §7 item 5, C001-REQ-117, C001-TS-177 | "a file can pass from item 3 to item 2 without a change of its" / "content; G-12 then counts it among the files that differ from the snapshot (ERR-INTAKE-007)" — `10-spec/50-interfaces/git-access.md:134-135` | Editors and agents run `git status` often, so a review whose intake met a touched or racy filtered file (C001-TS-169) can show ERR-INTAKE-007 within seconds; conversely, touching a filtered file that intake read from the index makes G-12 count it as well. The notice informs only, and a new review reads the file from the index |
| 21 | Every evidence workspace and mutation copy holds the full content of the snapshot's filtered files (Git LFS objects, git-crypt plaintext) | C001-REQ-527, C001-IF-013 §2 item 1 | "for Git" / "LFS the file's content, for git-crypt its decrypted content" — `10-spec/50-interfaces/evidence-runs.md:100-101` | Chosen by P-01 in Q-filterworkspace-01. Where the file system has no copy-on-write clone, each workspace and each mutation copy duplicates these files on disk; decrypted git-crypt content lies outside the repository while the process runs. A failed preparation or copy for lack of space is ERR-EVID-002 or ERR-EVID-006 |
| 22 | A reset can copy filtered files within the time that C001-NFR-018 (c) bounds, and no benchmark change has a filtered file | C001-IF-013 §2 item 3, §8 item 2, C001-NFR-018 | "every file under a clean filter that" / "holds its stored form (item 1) is written again by item 1" — `10-spec/50-interfaces/evidence-runs.md:122-123` | The reset counts in (a) and (c) (§8 items 1 and 2), and `30-nfr/nfr.md` names no clean filter, so the 1 s bound of (c) is not measured on a repository that uses Git LFS |
| 23 | Git 2.34.0 and 2.34.1 are accepted, but they do not refuse a repository owned by another user | C001-REQ-125, C001-IF-012 §6, C001-TS-164, C001-TS-165 | "| 2.34.0           |" — `10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:759` | git added the ownership check (`safe.directory`) in 2.35.2 and backported it to 2.34.2; with 2.34.0 or 2.34.1 the refusal of C001-TS-165 does not occur and intake goes on. The hardening of C001-IF-012 §2 item 2 still keeps repository-configured programs from running. A minimum of 2.34.2 would make the refusal hold on every accepted version |
| 24 | The review configuration of the base commit is trusted as code: it sets the test command that every analysis runs, and the key variable and endpoint of a cloud provider | C001-REQ-505, C001-REQ-820, C001-IF-004 | "any code through `tests.command` (C001-REQ-505), so the trust boundary does not move." — `20-plan/20-decisions/ADR-008-credential-store-access.md:108` | Stated in the plan, not in the specification (CR-44). C001-REQ-820 narrows the credential-store entries such a configuration can use; `keyEnv` can still name any environment variable |
| 25 | On Windows, a same-size edit of a filtered file whose modification time is set back is not seen: it stays out of the change and enters evidence workspaces | C001-IF-012 §7 item 1, C001-REQ-127, C001-REQ-527 | "**Answer:** (fatigue guard — recommended option applied)" — `10-spec/questions-log.md:409` | Q-filterworkspace-02, accepted as git's own limit under the fatigue guard and not asked. With the fix of CR-37 the limit applies only on Windows and only to paths that the base commit's `.gitattributes` puts under a filter; without it, repository settings extend it to every file on every system. Not yet marked (CR-37) |

### Re-review 5 verdict
The seven defects are resolved in substance: a git program that is missing, too old or refuses the
repository stops every command with ERR-INTAKE-008 (D-001); Node.js 22 and git 2.34 are stated
prerequisites (D-002); grammar versions are fixed per release (D-003); evidence commands start
without git's repository-locating variables (D-004); credential-store services are limited to
`sdd-review` (D-005); a submodule commit missing locally leaves an empty path with ERR-EVID-012
(D-006); and a filtered file that git's index records as up to date is read from the index at
intake and copied from the working tree into evidence workspaces (D-007). P-01's answers to
Q-cleanfilter-01 and Q-filterworkspace-01 are applied, with no extracted instructions; CR-35 is
resolved. No blocker is open. Two findings are major: CR-36 (C001-REQ-509 and C001-REQ-522 still
require the snapshot's content in workspaces that now hold working-tree copies, so the approved
requirements and C001-TS-597 contradict each other) and CR-37 (trusting stat data lets an agent
keep a same-size edit out of the change while evidence runs execute it, repository settings and
untracked attributes extend this beyond the Windows limit accepted under the fatigue guard, and
that limit is stated and marked nowhere). Seven are minor: CR-38 to CR-44. Each has owners among
the specialists, and none needs a P-01 decision to be fixed, except the optional `keyEnv` namespace
of CR-44. Recommendation: fix CR-36 and CR-37 before G2, with the minors in the same pass, and
check the fixed text in a short focused pass. At G2, P-01 should read gate notes rows 20 to 25,
in particular row 25 (an edit that Windows cannot see) and row 24 (the base commit's configuration
is trusted as code).

## Focused re-review 6

**Scope.** The second pass on defects D-001 to D-007 of `change.md`: the fixes for CR-36 to CR-44
of focused re-review 5, round 15 of `10-spec/questions-log.md` (Q-cleanfilter-02 answered "LFS by
hash + harden rest") and the split of the clean-filter rule of evidence workspaces into
C001-REQ-527, C001-REQ-528 and C001-REQ-529 (the allocation of C001-REQ-528 that the brief names
Q-reqsplit-01). Changed since focused re-review 5: C001-REQ-125 to C001-REQ-128 with
C001-AC-125.1 to C001-AC-128.1 and C001-TS-162 to C001-TS-188; C001-REQ-509, C001-REQ-522 and
C001-REQ-526 to C001-REQ-529 with C001-AC-509.1, C001-AC-526.1 to C001-AC-529.1, C001-TS-586 to
C001-TS-599 and C001-TS-951 to C001-TS-959; the C001-REQ-820 rationale; C001-US-101, C001-US-502,
C001-US-503 and C001-US-504; six glossary terms; C001-IF-012 §1, §2, §5, §6 and §7 items 1 to 8,
G-07, G-11, G-12, G-15 and G-16; C001-IF-013 §2 items 1, 3, 4, 5 and 8; ERR-INTAKE-008,
ERR-INTAKE-009, ERR-EVID-012 and ERR-EVID-013; `50-interfaces/README.md`; C001-IF-010 §7;
`review-config.schema.json`; C001-CON-13, C001-CON-14, C001-CON-17, C001-CON-18 and C001-CON-22;
C001-COMP-003, C001-COMP-004, C001-COMP-006 and C001-COMP-011; `sequences/triage-and-clearing.md`;
`00-index.md` and `70-dod.md`. The requirement, acceptance, story and glossary files were read in
full where they changed; interfaces, constraints, architecture, index and DoD also with `git diff`
against the G2 approval (commit 57e5b42). Out of scope by the brief: the plan-phase ADRs that lag
the specification, and TR-06, TR-08 and LINT-OBS-001.
`sdd lint 001 --phase 10-spec --json`: 869 errors. 851 of them are TR-06 and TR-08, the counts
that `sdd trace 001` reports (0 / 215 requirements implemented by a task, 0 / 636 scenarios mapped
to a test case); the other 18, as many as there are NFRs, are cut from the printed output and are
taken to be the plan-phase LINT-OBS-001 that the brief names. `sdd lint 001 --quick --file` on the
changed requirement, acceptance, glossary, interface, error-catalogue, schema, constraint and
architecture files: 0 findings. `sdd trace 001`: TR-01 55 / 55, TR-02 215 / 215, TR-03 215 / 215,
TR-04 18 / 18, TR-05 215 / 215 and 18 / 18; 27 open items (19 in `10-spec/85-open-items.md`, five
of them for Q-filterworkspace-02, and 8 in `00-ideation/85-open-items.md`).

**Reviewed set** (changed IDs and the IDs linked to them; the frontmatter keeps `all` because this
file holds the full review): C001-REQ-101, C001-AC-101.1, C001-REQ-117, C001-REQ-120,
C001-REQ-125, C001-AC-125.1, C001-TS-162 to C001-TS-166, C001-TS-178, C001-REQ-126,
C001-AC-126.1, C001-TS-167 to C001-TS-173, C001-TS-176, C001-TS-179, C001-TS-180, C001-REQ-127,
C001-AC-127.1, C001-TS-177, C001-TS-181 to C001-TS-184, C001-REQ-128, C001-AC-128.1,
C001-TS-174, C001-TS-175, C001-TS-185 to C001-TS-188, C001-US-101, C001-REQ-505, C001-REQ-509,
C001-AC-509.1, C001-TS-523, C001-TS-524, C001-TS-525, C001-TS-558, C001-TS-951, C001-REQ-521,
C001-REQ-522, C001-REQ-525, C001-REQ-526, C001-AC-526.1, C001-TS-591 to C001-TS-596,
C001-TS-952, C001-REQ-527, C001-AC-527.1, C001-TS-597 to C001-TS-599, C001-REQ-528,
C001-AC-528.1, C001-TS-953 to C001-TS-956, C001-REQ-529, C001-AC-529.1, C001-TS-957 to
C001-TS-959, C001-US-502, C001-US-503, C001-US-504, C001-REQ-809, C001-REQ-820, C001-AC-820.1,
C001-TS-858 to C001-TS-862, C001-US-803, C001-IF-004, C001-IF-010, C001-IF-012, C001-IF-013,
C001-CON-13, C001-CON-14, C001-CON-17, C001-CON-18, C001-CON-22, C001-COMP-003, C001-COMP-004,
C001-COMP-006, C001-COMP-011, C001-NFR-001, C001-NFR-003, C001-DOD-001, C001-DOD-005,
C001-DOD-008; and ERR-INTAKE-008, ERR-INTAKE-009, ERR-EVID-012 and ERR-EVID-013 of `errors.md`,
the glossary terms clean filter, up to date in the index, Git LFS file, Git LFS pointer file,
stored form and workspace content, `50-interfaces/README.md`, `sequences/triage-and-clearing.md`,
`00-index.md`, DOD-G-02, round 15 and the second fatigue-guard section of `questions-log.md`, and
the scenario counter of `ids.json`.

**Open after focused re-review 6:** 0 blocker, 2 major (CR-45, CR-46), 2 minor (CR-47, CR-48).
CR-36 to CR-44 are resolved (below). CR-33 and CR-34 (minor, open since focused re-review 4) lie
outside the reviewed set and were not re-checked.

| Findings | blocker | major | minor |
|---|---|---|---|
| New in this re-review (CR-45 to CR-48) | 0 | 2 | 2 |
| All findings CR-1 to CR-48 | 2 | 14 | 32 |

### Defects D-001 to D-007
The resolutions recorded in focused re-review 5 stand, and what that pass left open is now fixed:
D-001 and D-002 (CR-41, CR-43), D-005 (CR-44) and D-006 (CR-39, CR-42). For D-007, CR-36 to
CR-40 are resolved; the rule P-01 chose in round 15 leaves CR-45 to CR-47.

### Status of CR-36 to CR-44
| Finding | Status | Evidence of the fix |
|---|---|---|
| CR-36 | resolved | "IF a test run or an evidence-bundle command executes on file content that differs from the workspace content of its evidence workspace" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:94`; "on the workspace content of their evidence workspaces" — `…/CAP-05-review-evidence/requirements.md:215`; the term workspace content, with "so both count as the snapshot's file" — `10-spec/40-domain/glossary-delta.md:139`; the optional scenario: "Scenario: C001-TS-951 — A bundle command that rewrites the copied bytes of a Git LFS file in its workspace is not recorded" — `…/CAP-05-review-evidence/acceptance.md:329`. The title of C001-AC-509.1 was not updated (CR-47) |
| CR-37 | resolved | attributes from the base commit only: "the `filter` attribute that the `.gitattributes` files of" / "the base commit's tree give its path (G-11)" — `10-spec/50-interfaces/git-access.md:110-111`; every stat field "whatever the repository's" / "`core.checkStat` and `core.trustctime` settings say" — `…/git-access.md:135-136`; the values compared on Windows — `…/git-access.md:145-148`; Git LFS files judged by hash (C001-REQ-128, C001-REQ-529, P-01's round-15 answer); abuse scenarios C001-TS-183, C001-TS-184, C001-TS-186 and C001-TS-187 (`10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:943`, `:960`, `:1021`, `:1036`); the marker reaches the open items (`10-spec/85-open-items.md:16`, `:18`, `:26`, `:27`, `:34`). The residual that remains is wider than the one P-01 accepted: CR-45 |
| CR-38 | resolved | C001-REQ-126 covers a file "that is not up to date in the index, has no entry in git's index or has an index entry whose blob cannot be read from git's object database" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:217`; C001-REQ-127 only one "whose index entry names a blob that can be read from git's object database" — `…/requirements.md:225`; C001-TS-176 under C001-AC-126.1 with the causes "index blob missing" and "no entry in git's index" — `…/CAP-01-change-intake/acceptance.md:885`, `:897-898`; ERR-INTAKE-009 names the cause per file and "for a missing index blob, run `git fsck` and stage the file again with `git add` to restore the blob" — `10-spec/50-interfaces/errors.md:27` |
| CR-39 | resolved | "with the number of these files, their filter drivers and up to 10 of their paths" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:217`; "the number of such submodule paths and up to 10 of them" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:233`; "the number of these files and up to 10 of them" — `…/CAP-05-review-evidence/requirements.md:249` |
| CR-40 | resolved | the copy and its notice are separate requirements: "### C001-REQ-528 — Report files under a clean filter left in their stored form in an evidence workspace" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:247`, with "the copy of C001-REQ-527 and C001-REQ-529 and this notice can fail independently, so they are separate requirements (CR-40)" (`:250`); the trigger includes the rewrite: "as it fills the workspace or writes the file again before a run" — `…/requirements.md:241`, `:257`; the notice comes with each test run, mutation run and bundle command (`:249`); C001-US-504 lists C001-REQ-527 to C001-REQ-529 — `…/CAP-05-review-evidence/stories.md:74` |
| CR-41 | resolved | "IF the git program is not found or cannot be started, prints a version older than 2.34 or no readable version, or refuses to read the repository, THEN THE analysis core SHALL stop each command that reads the repository" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:209`; "the git program at "<git path>" could not be started (<operating system's reason>)" — `10-spec/50-interfaces/errors.md:26`; C001-TS-162 second row and C001-TS-178 (`…/CAP-01-change-intake/acceptance.md:741`, `:796`). The optional part (a Node.js older than 22) was not adopted |
| CR-42 | resolved | "| G-16 | `submoduleTree(parent, path, commit)` |" with "§2 and the repository check of §6 apply to that repository" — `10-spec/50-interfaces/git-access.md:58`; "These rules hold for every repository the port reads: the repository of G-01 and the submodule" / "repositories of G-16." — `…/git-access.md:19-20`; "This includes the data of submodule repositories that fill evidence workspaces (C001-IF-012 G-16)." — `10-spec/60-architecture/constraints.md:20`; the registry row of C001-IF-012 lists C001-REQ-526 — `10-spec/50-interfaces/README.md:24`; "uses C001-IF-012 (G-08, G-13, G-15, G-16)" — `10-spec/60-architecture/architecture.md:215`; C001-TS-952 tells a refused repository from a missing commit (`10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:1008`) |
| CR-43 | resolved | "Git access is implemented by running the git program that the developer installed (C001-ADR-004, accepted)." — `10-spec/60-architecture/constraints.md:21`; "The" / "port is implemented by running the git program that the developer installed" — `10-spec/50-interfaces/git-access.md:12-13`; "- **Depends on:** none (external: the installed git program, C001-CON-14, C001-CON-18)" — `10-spec/60-architecture/architecture.md:102`; "A workspace holds no git metadata: no `.git` directory or file" / "(C001-ADR-006, accepted)" — `10-spec/50-interfaces/evidence-runs.md:187-188`; the ADR scope of C001-CON-22 no longer lists git metadata or submodule working trees (`…/constraints.md:29`), and no artifact of `10-spec/` cites an ADR section any more |
| CR-44 | resolved | "It is defence in depth, not the trust boundary: the same configuration sets the test command that every analysis runs (C001-REQ-505), so whoever writes the base commit's configuration already runs code on the developer's machine." — `10-spec/20-capabilities/CAP-08-model-provider/requirements.md:159`; "`keyEnv` may name any environment variable, by design." — `10-spec/50-interfaces/model-provider.md:124`, with its reason (`:124-127`); the trust boundary also in the schema description (`10-spec/50-interfaces/review-config.schema.json:4`), the name table of `50-interfaces/README.md` and `architecture.md` §1 and §6. Gate notes row 24 replaced |
| CR-33, CR-34 | not re-checked | outside the reviewed set of this revision |

### Round 15 and the allocation of C001-REQ-528
Round 15: "**Answer:** LFS by hash + harden rest (Recommended)" (`10-spec/questions-log.md:411`)
is applied in C001-REQ-126 to C001-REQ-128, C001-REQ-527 to C001-REQ-529, C001-IF-012 §7,
C001-IF-013 §2 item 1, ERR-INTAKE-009, ERR-EVID-013 and the glossary, with both parts of the
option text: "attributes from the base commit only, repo settings ignored, all stat fields
compared" (C001-IF-012 §7 and item 1) and the cost "costs hashing LFS content per intake and fill"
(C001-REQ-128, C001-REQ-529, C001-IF-012 §5, C001-CON-22). The answer carries no extracted
instructions. The residual that the option names, "Windows timestamp gap remains for non-LFS
filters only, marked at G2" (`10-spec/questions-log.md:406`), is narrower than the one the
specification states and marks (CR-45). The allocation of C001-REQ-528 is applied as the split of
CR-40, but the questions log holds no entry Q-reqsplit-01 (CR-48).

### Findings

### CR-45 — The residual limit of the stat rule is wider than the one P-01 accepted in Q-cleanfilter-02, is marked with a Windows-only question P-01 never saw, and is understated outside C001-IF-012 §7 item 8
- **Severity:** major
- **Refs:** C001-REQ-127, C001-REQ-527, C001-REQ-101, C001-IF-012, C001-REQ-509, C001-US-502, C001-REQ-117
- **Evidence:** the option P-01 chose: "Windows timestamp gap remains for non-LFS filters only, marked at G2" — `10-spec/questions-log.md:406`, "**Answer:** LFS by hash + harden rest (Recommended)" — `…/questions-log.md:411`; the question named the forged index as one of three routes, "(same-size edit with mtime reset, untracked filter settings, forged .git/index)" — `…/questions-log.md:402`, the option P-01 did not choose gave it as its weakness, "Windows same-size edit with mtime reset and a forged .git/index can still hide an edit." — `…/questions-log.md:407`, and the option rejected for this kind of gap: "Keep §7 and mark limits (3.20) — violates C001-REQ-101." — `…/questions-log.md:409`; against the interface: "on every system, an index entry written after the edit that records the edited file's stat data" / "with the blob of the base side, written into the index file directly or by git running another" / "clean command that the repository's configuration names. Intake then counts the file as" / "unchanged although its bytes differ" — `10-spec/50-interfaces/git-access.md:220-223`, marked with the question "### Q-filterworkspace-02 — On Windows, an edit of a file under a clean filter that keeps its size and sets its modification time back is not visible in git's stat data" — `…/questions-log.md:416`, which is "- **Blocking:** no · **Material:** no" (`:417`) and has "**Answer:** (fatigue guard — recommended option applied)" (`:423`), while Q-cleanfilter-02 is "- **Blocking:** yes · **Material:** yes" (`:403`); the requirements word the second case as a written index file: "and on every system a `.git/index` written to record the stat data of an edited file makes its entry up to date; in both cases intake reads the index blob and the edit is not part of the change" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:226`, and alike `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:242`, `…/CAP-01-change-intake/acceptance.md:1089` and `…/CAP-05-review-evidence/acceptance.md:1268`; texts that state no exception: "gets its checked-out" / "content only when it is shown to be the snapshot's (C001-REQ-527, C001-REQ-529)" — `…/CAP-05-review-evidence/stories.md:42-43`, "a run on that content is a run on the snapshot" — `…/CAP-05-review-evidence/requirements.md:95`; and a Windows gap for Git LFS files in the moved-on check: "On Windows, an edit" / "of a Git LFS file after intake that keeps its size and sets its modification time back can" / "therefore be missing from that notice" — `10-spec/50-interfaces/git-access.md:181-183`
- **Why it matters:** P-01 chose option 1 over option 2 on texts that put the forged index on option 2's side and gave option 1 a Windows-only residual. In the specification the forged index stays open, on every system, for every file that the base commit's `.gitattributes` put under a filter other than Git LFS (git-crypt, nbstripout, a project filter), and it needs no hand-written index: one git command run with a substitute clean command that prints the base blob (`git -c filter.<driver>.clean=<that command> update-index --refresh`) makes git record the edited file's stat data with the base blob and leaves no setting behind. Intake then reads the base blob (no hunk, nothing to sign) while every evidence workspace copies the edited bytes and runs them, the outcome that Q-cleanfilter-02 rejected as a violation of C001-REQ-101 (Must). The only acceptance of it is the fatigue-guard marker of a non-blocking question about Windows, so the open items P-01 reviews at G2 present it as the Windows question. Outside C001-IF-012 §7 item 8, the second case reads as a hand-written index file, which understates how easy it is, and C001-US-502 and the C001-REQ-509 rationale state without exception that the copied bytes are the snapshot's. G-12 adds a Windows gap for Git LFS files, outside "non-LFS filters only"; it affects only the moved-on notice (C001-REQ-117), never a snapshot or a workspace.
- **Suggested fix:** Owner: conductor: put the residual to P-01 as a question of its own (for example Q-cleanfilter-03: keep option 1 with the residual on every system for files under a filter other than Git LFS, or take option 3 of Q-cleanfilter-02 for those files, compared by their bytes with no stat trust, at the cost of every such file showing as changed in every review), or have P-01 accept it explicitly at G2 from gate notes row 25; log the answer. Owner: architect and spec-writer (`50-interfaces/git-access.md` §7 items 5 and 8, `CAP-01-change-intake/requirements.md` C001-REQ-127, `CAP-05-review-evidence/requirements.md` C001-REQ-509 and C001-REQ-527, `CAP-05-review-evidence/stories.md` C001-US-502): mark the residual with the question that decides it instead of Q-filterworkspace-02; word the second case as item 8 does (written directly, or by git running a substitute clean command); say in C001-US-502 and the C001-REQ-509 rationale that for C001-REQ-527 the copy rests on git's index record, with the limit of item 8; include the G-12 gap for Git LFS files in the same decision. Owner: test-designer: the two acceptance notes follow the requirement text.
- **Status:** resolved (focused re-review 7); the parts carried into CR-49 and CR-52 were resolved in focused re-review 8

### CR-46 — A file under no clean filter can be hidden from git's own diff by an index entry or flag; the rule that C001-TS-184 relies on is in no interface, and C001-REQ-101 has no abuse case
- **Severity:** major
- **Refs:** C001-REQ-101, C001-AC-101.1, C001-TS-184, C001-IF-012, C001-REQ-117, C001-NFR-001, C001-NFR-003
- **Evidence:** G-07 compares "base tree versus the working tree, staged and unstaged edits together" and gives own reading rules only for "files under a clean filter, Git LFS files included: §7" — `10-spec/50-interfaces/git-access.md:49`; the port runs git's status and diff: "With the git" / "program this includes setting `GIT_OPTIONAL_LOCKS=0` and passing `--no-optional-locks`, so that" / "status and diff never refresh the index." — `…/git-access.md:23-25`, "C001-ADR-004 implements this port with the installed git program" — `…/git-access.md:86`; the only file content that §5 counts as read and hashed: "G-07 reads and hashes the working-tree bytes of every" / "Git LFS file in the working tree (§7 item 7)" — `…/git-access.md:76-77`; the index flags are ignored only for filtered files: "The" / "assume-unchanged and skip-worktree flags are ignored, so the stat data always decide (CR-37)" — `…/git-access.md:139-140`, "No stat data," / "no flag of the index entry and no racy test is used." — `…/git-access.md:200-201`; yet a scenario requires it for a source file: "And the test then wrote ".git/index" so that the entry of "src/cart.ts" records the blob of "src/cart.ts" in B0 together with the stat data of the edited file, not racy" and "Then the change lists "src/cart.ts" as modified with 4 added lines" — `10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:964`, `:966`; the assume-unchanged and skip-worktree rows exist only for filtered files — `…/acceptance.md:956-957`, `:869`; and C001-REQ-101 has no abuse case: "| C001-REQ-101 | TS-101 | TS-102 | TS-103 | n/a: intake errors are C001-REQ-105, C001-REQ-106, C001-REQ-107 and C001-REQ-113 | n/a | n/a | n/a |" — `…/acceptance.md:1057`, "- **abuse (bare n/a):** the requirement reads only git data and files of the developer's own repository, which the developer controls" — `…/acceptance.md:1088`
- **Why it matters:** git's diff of a commit against the working tree, run without refreshing the index, takes the blob of the index entry for every file whose stat data match it and does not look at a file whose entry is marked assume-unchanged or skip-worktree. An adapter that builds G-07 on that diff, which is how the interface describes the port, lets `git update-index --assume-unchanged src/auth.ts` (one command, nothing forged) or a forged entry hide an edit of any source file: no hunk, no guarded-area match, nothing to sign, and G-12 does not report it either. C001-TS-184 expects the opposite for a forged entry, so the property is required by a scenario, but no interface rule states it, and §5 does not count reading every tracked file at each intake (C001-NFR-001) and at each moved-on check, which every verdict asks for (C001-NFR-003). The flags have no scenario for such files, and the abuse cell of C001-REQ-101 rests on the developer controlling the repository, while the revision's own threat (CR-37, Q-cleanfilter-02) is an agent with a shell in that repository. Ignoring skip-worktree also needs a rule for sparse checkouts: a path outside the sparse cone is absent from the working tree, so under §7 items 1, 3 and 7 a filtered file there is already compared by its missing bytes and listed as deleted, and for other files G-07 says nothing.
- **Suggested fix:** Owner: architect (`50-interfaces/git-access.md` G-07, G-12, §5): state that G-07 compares every path of the base tree and of the index with its working-tree bytes (after git's built-in end-of-line conversion, §2 item 2) whatever git's index records for it (stat data, assume-unchanged, skip-worktree), except a skip-worktree entry whose file is absent from the working tree, which counts as unchanged as in git (sparse checkout), with the same exception in §7 items 1, 3 and 7; count that reading in §5 against C001-NFR-001 and, through G-12, C001-NFR-003, or let G-12 reuse hashes as §7 item 5 does for Git LFS files and state the limit. Owner: test-designer (`CAP-01-change-intake/acceptance.md`): an abuse scenario under C001-AC-101.1 in which an edited `src/cart.ts` is marked assume-unchanged, and one in which it is marked skip-worktree, each listed as modified; a sparse-checkout scenario in which files outside the cone, filtered ones included, are not listed; the abuse cell of C001-REQ-101 citing them and C001-TS-184.
- **Status:** resolved (focused re-review 7); the hash reuse it led to was CR-49

### CR-47 — The statements of C001-REQ-126 and C001-REQ-528 and the criterion of C001-REQ-509 say less, or other, than the interfaces and scenarios check
- **Severity:** minor
- **Refs:** C001-REQ-126, C001-REQ-528, C001-AC-126.1, C001-AC-528.1, C001-AC-509.1, C001-IF-012
- **Evidence:** "WHEN intake finds one or more files under a clean filter whose working-tree bytes, read without running the filter, differ from the content that the base commit holds at the same path, … THE analysis core SHALL list each of these files as a changed file and report notice ERR-INTAKE-009 with the number of these files, their filter drivers and up to 10 of their paths." — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:217`; against "Intake raises notice ERR-INTAKE-009 (C001-REQ-126) once when item 3 makes one or more files" / "changed that the base commit holds at the same path, naming their number, their filter drivers" / "and up to 10 of them, each with the reason item 3 applies to it" — `10-spec/50-interfaces/git-access.md:171-173`; "THE analysis core SHALL report with that run a notice that names the run, the number of these files and up to 10 of them, each with its filter driver, without changing whether the run's results are recorded as evidence." — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:249`; against the criteria: "is listed as changed and named in ERR-INTAKE-009 with its filter driver and cause" — `…/CAP-01-change-intake/acceptance.md:813`, "each with its filter driver and cause" — `…/CAP-05-review-evidence/acceptance.md:1137`; and "#### C001-AC-509.1 — Results of runs on file content that differs from the snapshot are not evidence" — `…/CAP-05-review-evidence/acceptance.md:296`, against "executes on file content that differs from the workspace content of its evidence workspace" — `…/CAP-05-review-evidence/requirements.md:94`
- **Why it matters:** (1) For a file under a clean filter that the base commit does not hold, for example a new Git LFS file the agent did not stage, the statement of C001-REQ-126 can be read as naming it in the notice (its bytes differ from content that does not exist), while §7 item 4 names only files that the base commit holds; no scenario decides. (2) Every cause text of ERR-INTAKE-009 and ERR-EVID-013 is required by the interfaces and asserted by the scenarios, but neither statement asks for a cause, so the criteria test more than the requirements. (3) Read literally, the criterion of C001-REQ-509 is contradicted by C001-TS-597 and C001-TS-957, whose runs execute working-tree bytes that differ from the snapshot's stored blob and keep their results.
- **Suggested fix:** Owner: spec-writer (`CAP-01-change-intake/requirements.md`, `CAP-05-review-evidence/requirements.md`): limit the notice of C001-REQ-126 to files that the base commit holds at the same path (or name added files too and change §7 item 4), and add "each with its cause" to C001-REQ-126 and C001-REQ-528. Owner: test-designer: word the title of C001-AC-509.1 with "the workspace content of its evidence workspace"; optionally a C001-AC-126.1 scenario with an added Git LFS file that is not staged.
- **Status:** resolved (focused re-review 7); the sparse-checkout cause added since was CR-50

### CR-48 — Nine scenario IDs lie outside the ID ledger and the CAP-05 block, and the decision that allocated C001-REQ-528 is not logged
- **Severity:** minor
- **Refs:** C001-TS-951, C001-TS-959, C001-REQ-528, C001-AC-528.1
- **Evidence:** the ledger: `"REQ": 924, "TS": 950 }` — `ids.json:3` (the TS counter, added by this revision; C001-TS-950 is defined nowhere in `10-spec/`); the scenarios run from "Scenario: C001-TS-951 — A bundle command that rewrites the copied bytes of a Git LFS file in its workspace is not recorded" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:329` to "Scenario: C001-TS-959 — A Git LFS file whose snapshot blob is not a pointer file is written from that blob, not copied from the working tree" — `…/acceptance.md:1225`; the blocks of the index: "| REQ-501 to REQ-529 | AC-5nn.n | TS-5nn |" — `10-spec/00-index.md:92`, and "| AC-9nn.n | TS-9nn |" for C001-CAP-09 — `…/00-index.md:96`; Q-reqsplit-01 occurs in no file of `.sdd/`, and `10-spec/questions-log.md` ends with the fatigue-guard entry Q-filterworkspace-02 (`10-spec/questions-log.md:414-424`)
- **Why it matters:** the ledger names C001-TS-950 as the last scenario ID issued, so the next `sdd id next TS --change 001` can return C001-TS-951, an ID already defined; lint then reports a duplicate after the fact. The block TS-501 to TS-599 of CAP-05 is full, and its nine new scenarios sit in the block that the index gives CAP-09, which a reader of the index cannot see. The split of C001-REQ-527 into three requirements is applied, but the question or decision that allocated C001-REQ-528 is in no log, so a later reader cannot tell who decided it.
- **Suggested fix:** Owner: conductor: bring the ledger in line with the IDs in use (allocate C001-TS-951 to C001-TS-959 through `sdd id next TS --change 001`, and tombstone C001-TS-950 if it stays unused); log Q-reqsplit-01 with its answer in `10-spec/questions-log.md`, or record that the allocation was made without a question. Owner: spec-writer (`00-index.md`): give C001-CAP-05 the scenario range "TS-5nn, TS-951 to TS-959".
- **Status:** resolved (focused re-review 7); the part carried into CR-51 was resolved in focused re-review 8

### Rubric (reviewed set)
| Rubric | Item | Result |
|---|---|---|
| stories | S1 Persona is a defined P-ID | pass |
| stories | S2 Value / outcome stated | pass |
| stories | S3 INVEST | pass |
| stories | S4 Every story has ≥ 1 requirement | pass |
| stories | S5 Out of scope stated where a neighbour exists | pass |
| stories | S6 Traces to the ideation | pass |
| requirements | R1 Singular outcome | pass |
| requirements | R2 Testable | pass |
| requirements | R3 Unambiguous | CR-47 |
| requirements | R4 Correct EARS pattern | pass |
| requirements | R5 Implementation-free | pass |
| requirements | R6 Complete | CR-46, CR-47 |
| requirements | R7 Consistent | CR-45, CR-47 |
| requirements | R8 Feasible | pass |
| requirements | R9 Necessary | pass |
| requirements | R10 Measurable values carry units and limits | pass |
| requirements | R11 Delta and evidence | n/a: greenfield change, no living spec (`10-context/current-state.md`) |
| requirements | R12 Priority set and consistent with the story | pass |
| NFRs | N1 ISO 25010 category | n/a: no NFR changed; C001-NFR-001 and C001-NFR-003 are in the set only through costs (CR-46, gate notes row 22) |
| NFRs | N2 Metric with unit | n/a: no NFR changed |
| NFRs | N3 Threshold set | n/a: no NFR changed |
| NFRs | N4 Feasible method and environment | n/a: no NFR changed; no benchmark change holds a filtered file (gate notes row 22) |
| NFRs | N5 Covered by a DoD item | n/a: no NFR changed |
| acceptance | A1 Every REQ has ≥ 1 AC, every AC ≥ 1 scenario | pass |
| acceptance | A2 Scenarios observable and concrete | pass |
| acceptance | A3 One behaviour per scenario | pass |
| acceptance | A4 Error and abuse cases present | CR-46 |
| acceptance | A5 `n/a` cells justified credibly | CR-46 |
| domain, interfaces, architecture | D1 Entities with attributes, relationships, owner, invariants | pass |
| domain, interfaces, architecture | D2 Lifecycles > 2 states have a diagram and a complete transition table | pass |
| domain, interfaces, architecture | D3 Interfaces parse and name their errors | pass |
| domain, interfaces, architecture | D4 Every component has an ID, responsibilities, requirements served | pass |
| domain, interfaces, architecture | D5 Decisions with alternatives recorded | CR-45 |
| DoD and index | O1 Every REQ and NFR covered | pass |
| DoD and index | O2 Evidence types fit the statements | pass |
| DoD and index | O3 Global items referenced | pass |
| DoD and index | X1 The index is navigation only | CR-48 |

Notes on rows marked pass:
- **S1 to S6, R9, R12:** C001-REQ-125 to C001-REQ-128 are listed by C001-US-101
  (`CAP-01-change-intake/stories.md:27`), which traces to Q-cleanfilter-02 (`:28`), and
  C001-REQ-525 to C001-REQ-529 by C001-US-502, C001-US-503 and C001-US-504
  (`CAP-05-review-evidence/stories.md:45`, `:59`, `:74`). C001-REQ-126 to C001-REQ-128 and
  C001-REQ-527 to C001-REQ-529 are Should under Must stories, which is consistent: without them
  filtered files show as changed or hold their stored form, the safe direction. The wording of
  C001-US-502 is part of CR-45.
- **R1, R4:** C001-REQ-126 pairs the listing with the notice that reports it, verified together
  in each scenario; C001-REQ-127 and C001-REQ-128 are event-driven with one outcome; C001-REQ-527
  and C001-REQ-529 give one outcome under an "if and only if" condition, and the stored form that
  follows otherwise is workspace content (glossary), which C001-REQ-522 requires; C001-REQ-528 is
  unwanted-behaviour with one notice, bounded by "without changing whether the run's results are
  recorded as evidence". C001-REQ-125 now names all five causes and every command that reads the
  repository.
- **Partition at intake (C001-REQ-126 to C001-REQ-128):** a Git LFS file is read from a matching
  pointer file, the base commit's first (C001-REQ-128), or compared by its bytes (C001-REQ-126,
  which takes every Git LFS file "that C001-REQ-128 does not read from a Git LFS pointer file");
  any other filtered file is read from a readable index blob while it is up to date in the index
  (C001-REQ-127) or compared by its bytes (C001-REQ-126: not up to date, no entry, unreadable
  blob); a file whose bytes equal the base content is unchanged under neither, as C001-IF-012 §7
  items 3 and 7 state. This is the order of the two bullets and of items 1 to 3 and 7 of §7
  (`50-interfaces/git-access.md:122-128`, `:130-212`), and the cause list of item 4 and
  ERR-INTAKE-009 (`50-interfaces/errors.md:27`); stage 0 and intent-to-add are interface details
  (item 7, G-15). The notice scope for added files is CR-47.
- **Partition in workspaces (C001-REQ-527 to C001-REQ-529):** C001-REQ-529 covers a Git LFS file
  whose snapshot side is a pointer file, C001-REQ-527 any other filtered file whose snapshot side
  is a stored blob (unchanged, or read from the index by C001-REQ-127), and C001-REQ-528 reports
  the stored form of either; a file that C001-REQ-126 listed as changed and a Git LFS file whose
  blob is no pointer file (C001-TS-959) are outside both. This matches C001-IF-013 §2 item 1
  (`50-interfaces/evidence-runs.md:81-130`), the reset of §2 item 3, ERR-EVID-013 and its causes
  (`50-interfaces/errors.md:64`) and the glossary terms stored form and workspace content. Both
  notices give the count and at most 10 entries (CR-39).
- **G-12 and C001-NFR-003:** G-12 reuses the hash of a Git LFS file within one process while its
  stat data are unchanged (C001-IF-012 §5, §7 item 5). In the `review` or `open` process the first
  G-12 runs at intake (as G-07) or when the review is resumed (C001-REQ-117), neither of which is
  an action that C001-NFR-003 bounds, so a later verdict in the review UI hashes only the Git LFS
  files whose stat data changed. A CLI `sign` is a process of its own and hashes every Git LFS
  file, which no threshold bounds (C001-NFR-003 measures the UI). No benchmark change holds a
  filtered file, so the reuse is not measured (gate notes row 22). Its Windows gap is part of
  CR-45; reading every other file at each moved-on check is part of CR-46.
- **R5:** the Git LFS pointer format, `core.checkStat`, `core.trustctime`, `git fsck`,
  `safe.directory` and copy-on-write clones appear in rationales, interfaces and the error
  catalogue; the statements name outcomes at the boundary.
- **R8, R10:** the hardened up-to-date test reads only the index and stat data (C001-IF-012 §7
  item 1); hashing every Git LFS file at each intake and each fill is the cost P-01 accepted with
  the answer (gate notes row 22); versions, the cap of 10, the 1024-byte limit of a pointer file
  and the hash algorithm carry their values.
- **A1 to A3:** `sdd trace 001` reports 215 / 215 requirements with a criterion and every
  criterion with scenarios. C001-TS-183 to C001-TS-188 and C001-TS-957 to C001-TS-959 use concrete
  sizes (2,048 and 3,000 bytes), byte positions, the three systems and git's own commands;
  C001-TS-952 shows a refusal and a missing commit in one notice; C001-TS-953 tests 10 and 11
  files; C001-TS-956 the notice of the mutation run.
- **D1, D2:** the revision adds no entity and no state; the glossary term workspace content and
  C001-IF-013 §2 give what an evidence workspace holds.
- **D3, D4:** ERR-INTAKE-008, ERR-INTAKE-009, ERR-EVID-012 and ERR-EVID-013 have condition,
  message, fix, source, kind and surfaces, and their cause texts are the ones the scenarios
  assert; the changed schema description and the `keyCredential.service` pattern pass quick lint.
  C001-COMP-003 realises C001-REQ-125 to C001-REQ-128, C001-REQ-526 and C001-REQ-527
  (`60-architecture/architecture.md:100`), C001-COMP-004 C001-REQ-125 to C001-REQ-128,
  C001-COMP-006 C001-REQ-820, and C001-COMP-011 C001-REQ-525 to C001-REQ-529 with G-15 and G-16.
- **O1 to O3:** DOD-G-02 counts 215 active requirements; C001-DOD-001 covers
  "C001-REQ-101…128" and C001-DOD-005 "C001-REQ-501…529" (`10-spec/70-dod.md:32`, `:36`); the
  index counts 215 requirements (`10-spec/00-index.md:108`), and `sdd trace 001` reports 215 / 215
  for TR-02, TR-03 and TR-05.

### Gate notes (rows 20, 22, 24 and 25 replaced, row 26 added; rows 1 to 19 of focused re-review 4 and rows 21 and 23 of focused re-review 5 stand)
| # | Choice | Where | Evidence | Note for the gate |
|---|---|---|---|---|
| 20 | A git index refresh, or staging a Git LFS file, after intake raises the moved-on notice for a filtered file whose content did not change | C001-IF-012 §7 item 5, C001-REQ-117, C001-TS-177, C001-TS-188 | "When git later refreshes its index (for" / "example during `git status`) or the agent stages a Git LFS file, a file can pass from item 3 to" / "item 2 or 7 without a change of its content" — `10-spec/50-interfaces/git-access.md:176-178` | Editors and agents run `git status` often, so a review whose intake met a touched or racy filtered file (C001-TS-169) can show ERR-INTAKE-007 within seconds; the same holds after the agent stages a Git LFS file that intake compared by its bytes (C001-TS-188). The notice informs only, and a new review reads the file from the index or the pointer file |
| 22 | Hashing Git LFS content and resetting filtered files are costs inside C001-NFR-001 and C001-NFR-018 (a) and (c), and no benchmark change has a filtered file | C001-IF-012 §5, §7 item 5, C001-IF-013 §2 items 1 and 3, §8, C001-CON-22, C001-NFR-001, C001-NFR-003, C001-NFR-018 | "G-07 reads and hashes the working-tree bytes of every" / "Git LFS file in the working tree (§7 item 7); that time counts toward C001-NFR-001" — `10-spec/50-interfaces/git-access.md:76-77`; "The ADR measures reset (the copying and hashing of files under a clean filter included)" — `10-spec/60-architecture/constraints.md:29` | Accepted by P-01 with Q-cleanfilter-02 ("costs hashing LFS content per intake and fill", `10-spec/questions-log.md:406`). Every intake reads and hashes every Git LFS file of the working tree, whether or not the change touches it, so on a repository with large Git LFS content the intake time grows with that content, not with the change. Every fill and every reset hashes the Git LFS files it copies, inside (a) and (c). `30-nfr/nfr.md` names no clean filter, so none of C001-NFR-001, C001-NFR-003 and C001-NFR-018 (c) is measured on a repository that uses Git LFS. A CLI verdict, a process of its own, hashes every Git LFS file for its moved-on check |
| 24 | The review configuration of the base commit is trusted as code: it sets the test command that an analysis runs when the developer gives none, and the key variable and endpoint of a cloud provider | C001-REQ-505, C001-REQ-820, C001-IF-004, C001-IF-010 §7 | "It is defence in depth, not the trust boundary" — `10-spec/20-capabilities/CAP-08-model-provider/requirements.md:159`; "`keyEnv` may name any environment variable, by design." — `10-spec/50-interfaces/model-provider.md:124` | Now stated in the specification (CR-44 resolved): the C001-REQ-820 rationale, the schema description, C001-IF-010 §7, the name table of `50-interfaces/README.md` and `architecture.md` §1 and §6. C001-REQ-820 narrows the credential-store entries such a configuration can use; `keyEnv` stays open by design, because every variable it can name is in the environment of the configuration's test command when that command runs. Evidence runs also execute the change itself with the developer's environment (C001-REQ-521), so the boundary is no wider than what a review already trusts |
| 25 | Files under a filter other than Git LFS are judged by git's index and stat data, so an edit of such a file can stay out of the change while evidence runs execute it: on Windows by a same-size edit with the modification time set back, on every system by an index entry written after the edit | C001-IF-012 §7 items 1, 5 and 8, C001-REQ-127, C001-REQ-527 | "on every system, an index entry written after the edit that records the edited file's stat data" — `10-spec/50-interfaces/git-access.md:220`; P-01's option: "Windows timestamp gap remains for non-LFS filters only, marked at G2" — `10-spec/questions-log.md:406` | P-01 accepted the Windows part with Q-cleanfilter-02. The part on every system, which needs one git command with a substitute clean command, is marked only with the fatigue-guard question Q-filterworkspace-02 and was not put to P-01 (CR-45). It applies only to paths that the base commit's `.gitattributes` assign to such a filter (git-crypt, nbstripout, a project filter). Git LFS files are judged by their hash and are outside it, except that on Windows a same-size edit with the modification time set back can be missing from the moved-on notice (C001-IF-012 §7 item 5) |
| 26 | A filtered file whose stat data differ from git's index only in a field that the repository's git settings ignore shows as changed in every review | C001-IF-012 §7 item 1, C001-REQ-126, ERR-INTAKE-009, ERR-EVID-013 | "whatever the repository's" / "`core.checkStat` and `core.trustctime` settings say" — `10-spec/50-interfaces/git-access.md:135-136`; "if the file is still listed, change its modification time first (for example with `touch`) and run `git status` again" — `10-spec/50-interfaces/errors.md:27` | Follows from "all stat fields compared" in P-01's answer. With `core.trustctime` false or `core.checkStat` "minimal", git does not rewrite an entry whose only difference is the change time, inode, user or group (for example after a tool sets an extended attribute), so the file is compared by its bytes at every intake with ERR-INTAKE-009, and holds its stored form in evidence workspaces with ERR-EVID-013, until the developer applies the `touch` and `git status` fix. Conservative: nothing is hidden, but the notices can recur |

### Re-review 6 verdict
The fixes for CR-36 to CR-44 are in place: all nine are resolved. P-01's round-15 answer is
applied as chosen, with no extracted instructions: Git LFS files are judged by the SHA-256 hash and
size that their pointer files name, at intake and in evidence workspaces, and the stat rule for
other filters takes attributes from the base commit only and compares every stat field. The two
partitions in the brief are clean: C001-REQ-126 to C001-REQ-128 at intake and C001-REQ-527 to
C001-REQ-529 in workspaces match C001-IF-012 §7, C001-IF-013 §2 item 1 and both notices, apart
from the notice scope and causes of CR-47. The hash reuse of G-12 keeps a verdict in the review UI
to the Git LFS files whose stat data changed. No blocker is open. Two findings are major: CR-45
(for filters other than Git LFS the residual holds on every system, through an index entry that
one git command writes, while the option P-01 chose named a Windows gap only, and its marker is a
Windows-only fatigue-guard question) and CR-46 (a source file under no clean filter can be hidden
from git's own diff by assume-unchanged, skip-worktree or a forged entry; C001-TS-184 requires that
it cannot, but no interface rule or cost says so, and C001-REQ-101 has no abuse case). Two are
minor: CR-47 and CR-48. CR-45 needs a P-01 decision (a question, or explicit acceptance of gate
notes row 25 at G2); CR-46 to CR-48 have owners among the specialists and the conductor.
Recommendation: fix CR-46 to CR-48 and put CR-45 to P-01 before G2, then check the changed text in
a short focused pass. At G2, P-01 should read gate notes rows 20 to 26, in particular row 25 (an
edit kept out of the change on any system) and row 22 (hashing costs that no benchmark measures).
CR-33 and CR-34 remain open from focused re-review 4.

## Focused re-review 7

*Written by sdd-critic; appended by the conductor because the file exceeds the critic's write
limit. Findings, severities, fixes and gate notes are as the critic wrote them; some long evidence
quotes are shortened to their file and line locations.*

**Scope.** The third pass on defects D-001 to D-007 of `change.md`: the fixes for CR-45 to CR-48
of focused re-review 6, after P-01's answer to Q-nonlfs-01 (`10-spec/questions-log.md` Round 16:
"Accept, state it everywhere"). Checked, only for what changed for those findings: C001-IF-012 §2
item 2, §5, §7 items 5, 6 and 8, §8 items 1 to 3, G-07 and G-12; C001-IF-013 §2 items 1, 4 and 5;
ERR-EVID-013 (the cause "not in the working tree"); C001-CON-22; `architecture.md` §6 and
C001-COMP-003; C001-REQ-101 (rationale), C001-REQ-126, C001-REQ-127, C001-REQ-509 (rationale),
C001-REQ-527 and C001-REQ-528; C001-US-502; the glossary entries clean filter and up to date in
the index; the TS cells of `00-index.md`; C001-TS-189 to C001-TS-191, C001-TS-953 to C001-TS-956,
C001-TS-961, C001-TS-962, the title of C001-AC-509.1 and the coverage notes that cite
Q-nonlfs-01; the TS counter of `ids.json`. Out of scope by the brief: the plan-phase ADRs that lag
the specification, TR-06, TR-08 and LINT-OBS-001, and CR-33 and CR-34.
`sdd lint 001 --phase 10-spec --json`: 877 errors. 856 are TR-06 and TR-08 (0 / 215 requirements
implemented by a task, 0 / 641 scenarios mapped to a test case, as `sdd trace 001` reports); 18,
one per NFR, are LINT-OBS-001, reported at the NFR headings because `20-plan/78-observability.md`
does not exist; the other 3 match the three bare references to `C001-TS-950` in CR-48
(`10-spec/90-critic-report.md:1352`, `:1353`, `:1354`), an ID neither defined nor tombstoned, which
TR-12 reports (CR-51). The printed output is cut, so these 21 are identified from the rules and
the IDs in use. `sdd lint 001 --quick --file` on every changed requirement, acceptance, story,
glossary, interface, error-catalogue, constraint, architecture and index file: 0 findings.
`sdd trace 001`: TR-01 55 / 55, TR-02 215 / 215, TR-03 215 / 215, TR-04 18 / 18, TR-05 215 / 215
and 18 / 18; 22 open items.

**Reviewed set** (changed IDs and the IDs linked to them; the frontmatter keeps `all` because this
file holds the full review): C001-REQ-101, C001-AC-101.1, C001-TS-101 to C001-TS-103,
C001-TS-184, C001-TS-189, C001-TS-191, C001-REQ-117, C001-AC-117.1, C001-TS-138 to C001-TS-140,
C001-TS-150, C001-REQ-126, C001-AC-126.1, C001-TS-190, C001-REQ-127, C001-AC-127.1,
C001-REQ-128, C001-US-101, C001-US-104, C001-REQ-509, C001-AC-509.1, C001-TS-523 to C001-TS-525,
C001-TS-558, C001-TS-951, C001-REQ-522, C001-REQ-527, C001-AC-527.1, C001-TS-597 to C001-TS-599,
C001-REQ-528, C001-AC-528.1, C001-TS-953 to C001-TS-956, C001-TS-961, C001-TS-962, C001-REQ-529,
C001-AC-529.1, C001-TS-957 to C001-TS-959, C001-US-502, C001-US-503, C001-US-504, C001-IF-012,
C001-IF-013, C001-CON-22, C001-COMP-003, C001-COMP-011, C001-NFR-001, C001-NFR-003,
C001-DOD-001, C001-DOD-005, C001-CAP-05, C001-CAP-09; and ERR-INTAKE-007, ERR-INTAKE-009 and
ERR-EVID-013 of `errors.md`, the glossary terms change, clean filter (with up to date in the
index), moved-on notice, stored form and workspace content, `architecture.md` §6, the TS cells of
`00-index.md`, Q-reqsplit-01 of round 15 and round 16 of `questions-log.md`, and the TS counter
and tombstones of `ids.json`.

**Open after focused re-review 7:** 0 blocker, 1 major (CR-49), 3 minor (CR-50, CR-51, CR-52).
CR-46 and CR-47 are resolved; CR-45 is resolved except the parts carried into CR-49 and CR-52;
CR-48 is resolved except the part carried into CR-51. CR-33 and CR-34 (minor, open since focused
re-review 4) are outside the brief and were not re-checked.

| Findings | blocker | major | minor |
|---|---|---|---|
| New in this re-review (CR-49 to CR-52) | 0 | 1 | 3 |
| All findings CR-1 to CR-52 | 2 | 15 | 35 |

### Status of CR-45 to CR-48
| Finding | Status | Evidence of the fix |
|---|---|---|
| CR-45 | resolved, except the parts carried into CR-49 and CR-52 | "**Answer:** Accept, state it everywhere (Recommended)" — `10-spec/questions-log.md:429`; the residual is marked with Q-nonlfs-01, and no artifact of `10-spec/` cites Q-filterworkspace-02 any more; the second case worded as item 8 in C001-REQ-127 (`10-spec/20-capabilities/CAP-01-change-intake/requirements.md:226`) and C001-REQ-527 (`…/CAP-05-review-evidence/requirements.md:242`); the copy rests on git's record (`…/CAP-05-review-evidence/requirements.md:95`, `…/CAP-05-review-evidence/stories.md:46`); also C001-IF-013 §2 items 1, 4 and 5 (`10-spec/50-interfaces/evidence-runs.md:114-121`, `:217-218`, `:222-228`), C001-CON-22 and `architecture.md` §6 (`10-spec/60-architecture/architecture.md:445`). Not covered by Q-nonlfs-01: the moved-on gap of G-12, now wider (CR-49). The acceptance notes keep the old wording (CR-52) |
| CR-46 | resolved | "every other file is compared by its working-tree bytes whatever git's index records for it (stat data, assume-unchanged and skip-worktree flags)" — `10-spec/50-interfaces/git-access.md:51`; §8 item 1 (`…/git-access.md:271-272`); the sparse rule of §8 item 2 (`:287-300`, `:132-134`); the reading counted (`:78-79`); C001-TS-189 and C001-TS-191 (`10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:81`, `:99`); the abuse cell of C001-REQ-101 cites C001-TS-189 and C001-TS-184 (`…/acceptance.md:1103`). A filtered file outside the sparse checkout has no intake scenario; C001-TS-961 and C001-TS-962 pin it indirectly. The hash reuse that G-12 now applies to every file is CR-49 |
| CR-47 | resolved | "files under a clean filter that the base commit holds at the same path" and "each path with its cause" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:217`; C001-TS-190 (`…/CAP-01-change-intake/acceptance.md:954`); "each with its filter driver and its cause" — `…/CAP-05-review-evidence/requirements.md:249`; the title of C001-AC-509.1 (`…/CAP-05-review-evidence/acceptance.md:296`). The cause added since for sparse paths is missing from C001-REQ-528 (CR-50) |
| CR-48 | resolved, except the part carried into CR-51 | `"TS": 963 }` — `ids.json:3`; Q-reqsplit-01 logged (`10-spec/questions-log.md:414`, `:417`); the CAP-05 cell names TS-951 to TS-959 (`10-spec/00-index.md:92`). Correction: the collision that CR-48 feared could not occur, because `sdd id next` starts after the larger of the counter and the highest ID in use. Not done: the tombstone of `C001-TS-950`; the index does not place C001-TS-961 and C001-TS-962 (CR-51) |
| CR-33, CR-34 | not re-checked | outside the brief |

### Round 16
"**Answer:** Accept, state it everywhere (Recommended)" (`10-spec/questions-log.md:429`) is applied
where the option says it will be, in C001-IF-012 (§7 introduction, items 5, 6 and 8), C001-REQ-127 and
C001-REQ-527, and also in the C001-REQ-509 rationale, C001-US-502, C001-IF-013 §2 items 1, 4 and 5,
C001-CON-22, `architecture.md` §6 and both acceptance notes; the gate notes follow (row 25). The
question is material with two candidates; its options narrow the five candidates of Q-cleanfilter-02
to the residual, so this is not a finding. The option text covers files under filters other than
Git LFS only: the G-12 gap of the moved-on notice was not part of it (CR-49).

### Findings

### CR-49 — The moved-on check reuses hashes so that on Windows it misses a same-size edit with the modification time set back for every file it compares by content; C001-REQ-117 still names each differing file, P-01 has not accepted the gap, and without a racy rule it is not limited to Windows
- **Severity:** major
- **Refs:** C001-REQ-117, C001-AC-117.1, C001-US-104, C001-IF-012, C001-IF-013, C001-NFR-003
- **Evidence:** "THE review assistant SHALL show a moved-on notice that names each file that differs from the snapshot and states whether HEAD moved." — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:145`, whose rationale states no limit (`:146`); G-12 hash reuse and its Windows gap — `10-spec/50-interfaces/git-access.md:302-309`; "An edit that item 8 keeps out of the change is missing from the moved-on notice as well." — `…/git-access.md:196-197`; the racy test exists only for index entries — `…/git-access.md:158-159`; "results already recorded stay; the moved-on notice reports the edits (C001-REQ-117)." — `10-spec/50-interfaces/evidence-runs.md:229-230`; the C001-REQ-117 coverage row with abuse n/a — `10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:1119`, `:1134`; Q-nonlfs-01 covers other filters only — `10-spec/questions-log.md:422`, `:426`
- **Why it matters:** (1) The reuse that keeps a verdict within C001-NFR-003 now covers every file the moved-on check compares by content, so on Windows an agent that edits any source file after intake, keeps its size and sets its modification time back is not reported; a developer who signs and then commits the working tree commits code nobody reviewed (C001-US-104). C001-REQ-117 (Must) and C001-AC-117.1 still promise every differing file, and P-01 has not accepted this gap. (2) The gap is not Windows-only: §8 item 3 has no racy rule, so a same-size write in the same time-stamp step as the hashing is missed on every system. (3) The abuse cell of C001-REQ-117 rests on the developer controlling the repository, while the gap is an agent's route; no scenario covers it.
- **Suggested fix:** Owner: conductor: put gate notes row 27 to P-01 and log the answer. Owner: spec-writer (C001-REQ-117): state the accepted limit in the rationale, citing C001-IF-012 §7 items 5 and 8 and §8 item 3. Owner: architect (§8 item 3, C001-IF-013 §2 item 5): read stat data before content and keep a hash for reuse only when the file's modification and change times are earlier than the start of that read; qualify "the moved-on notice reports the edits". Owner: test-designer: under C001-AC-117.1, an edit after intake then marked assume-unchanged (or covered by a forged entry) is still named, and on Linux a same-size edit with the modification time set back is named; the abuse cell of C001-REQ-117 citing them and the Windows limit.
- **Status:** resolved (focused re-review 8); Windows gap accepted by P-01 with Q-movedon-01; introduced: CR-53, CR-54

### CR-50 — The sparse-checkout rule reaches no requirement statement: C001-REQ-527 does not cover a changed path outside the sparse checkout, C001-REQ-528 lacks its cause, and C001-REQ-101 read literally makes such a path a deletion
- **Severity:** minor
- **Refs:** C001-REQ-527, C001-REQ-528, C001-AC-528.1, C001-TS-961, C001-TS-962, C001-REQ-101, C001-REQ-126, C001-TS-191
- **Evidence:** C001-REQ-527 scope (`10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:241`); C001-REQ-528 closed cause list without "not in the working tree" (`…/requirements.md:249`, `:250`); against C001-IF-013 (`10-spec/50-interfaces/evidence-runs.md:87-89`, `:131`) and ERR-EVID-013 (`10-spec/50-interfaces/errors.md:64`); C001-TS-962 (`…/CAP-05-review-evidence/acceptance.md:1197`, `:1203`) and C001-TS-961 (`:1184`); the glossary (`10-spec/40-domain/glossary-delta.md:43`, `:19`); C001-REQ-101 statement (`10-spec/20-capabilities/CAP-01-change-intake/requirements.md:16`) against C001-TS-191 (`…/CAP-01-change-intake/acceptance.md:102`, `:107`), with the rule only in the rationale (`…/requirements.md:17`)
- **Why it matters:** C001-TS-962 requires ERR-EVID-013 to name a path outside the sparse checkout that C001-REQ-527 does not cover; C001-REQ-528 leaves out a cause that the interface prints and the scenarios assert; C001-REQ-101 and the term change, read literally, make paths outside the sparse checkout deleted files, which C001-TS-191 does not expect.
- **Suggested fix:** Owner: spec-writer: add to C001-REQ-527 "or a path outside the sparse checkout whose content in the snapshot is the blob of its index entry (C001-IF-012 §8 item 2)"; add "not in the working tree" to the causes of C001-REQ-528; define outside the sparse checkout in the glossary and say in the entry change that such a path counts with the blob of its index entry.
- **Status:** resolved (focused re-review 8)

### CR-51 — The index does not place C001-TS-961 and C001-TS-962, and three unused scenario IDs are not tombstoned, one of which leaves three lint errors
- **Severity:** minor
- **Refs:** C001-TS-961, C001-TS-962, C001-CAP-05, C001-CAP-09
- **Evidence:** `10-spec/00-index.md:92`, `:96`; `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:1179`, `:1196`; `ids.json:3`, `:5-14`; the bare references to `C001-TS-950` at `10-spec/90-critic-report.md:1352-1354`, which TR-12 reports
- **Why it matters:** A reader of the index takes C001-TS-961 and C001-TS-962 for CAP-09 scenarios; the phase lint carries 3 TR-12 errors until `C001-TS-950` is tombstoned.
- **Suggested fix:** Owner: conductor: `sdd id tombstone` for `C001-TS-950`, `C001-TS-960` and `C001-TS-963`, reason "allocated, unused". Owner: spec-writer (`00-index.md`): CAP-05 "TS-5nn, TS-951 to TS-959, TS-961 and TS-962"; CAP-09 "TS-9nn, except TS-951 to TS-959, TS-961 and TS-962 (C001-CAP-05)".
- **Status:** resolved (focused re-review 8)

### CR-52 — The two acceptance notes and `architecture.md` §6 word the residual and the Git LFS check differently from C001-IF-012
- **Severity:** minor
- **Refs:** C001-AC-127.1, C001-AC-527.1, C001-REQ-127, C001-REQ-527, C001-REQ-128
- **Evidence:** "written after the edit … by git running another clean command that the repository's configuration names" — `10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:1135`, `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:1297`; against `10-spec/50-interfaces/git-access.md:245-247`; "Git LFS files are checked by the SHA-256 hash of their pointer files" — `10-spec/60-architecture/architecture.md:445`, against `…/git-access.md:222-224`
- **Why it matters:** "That the repository's configuration names" reads as a setting left in the repository, while item 8's command leaves nothing; "written after the edit" leaves out a refresh; "the SHA-256 hash of their pointer files" reads as hashing the pointer file, while the check hashes the working-tree bytes against the hash and size that the pointer names.
- **Suggested fix:** Owner: test-designer (both coverage notes): "an index entry written or refreshed after the edit …, directly in the index file or by git refreshing its index with another clean command given for that one command (C001-IF-012 §7 item 8)". Owner: architect (`architecture.md` §6): "Git LFS files are checked against the SHA-256 hash and size that their pointer files name".
- **Status:** resolved (focused re-review 8)

### Rubric (reviewed set)
| Rubric | Item | Result |
|---|---|---|
| stories | S1–S6 | pass |
| requirements | R1 Singular outcome | pass |
| requirements | R2 Testable | pass |
| requirements | R3 Unambiguous | CR-50 |
| requirements | R4 Correct EARS pattern | pass |
| requirements | R5 Implementation-free | pass |
| requirements | R6 Complete | pass |
| requirements | R7 Consistent | CR-49, CR-50 |
| requirements | R8 Feasible | pass |
| requirements | R9 Necessary | pass |
| requirements | R10 Measurable values carry units and limits | pass |
| requirements | R11 Delta and evidence | n/a: greenfield change, no living spec (`10-context/current-state.md`) |
| requirements | R12 Priority set and consistent with the story | pass |
| NFRs | N1–N5 | n/a: no NFR changed; C001-NFR-001 and C001-NFR-003 are in the set through costs (gate notes row 22) |
| acceptance | A1 Every REQ has ≥ 1 AC, every AC ≥ 1 scenario | pass |
| acceptance | A2 Scenarios observable and concrete | pass |
| acceptance | A3 One behaviour per scenario | pass |
| acceptance | A4 Error and abuse cases present | CR-49 |
| acceptance | A5 `n/a` cells justified credibly | CR-49, CR-52 |
| domain, interfaces, architecture | D1–D4 | pass |
| domain, interfaces, architecture | D5 Decisions with alternatives recorded | CR-49 |
| DoD and index | O1–O3 | pass |
| DoD and index | X1 The index is navigation only | CR-51 |

Notes on rows marked pass: the story links agree both ways (C001-US-101, C001-US-104, C001-US-502
to C001-US-504); C001-REQ-126 keeps one outcome under the narrowed trigger and C001-REQ-528 stays
one notice; git commands appear in rationales and interfaces only; reading every checked-out file
at each intake counts toward C001-NFR-001 (`50-interfaces/git-access.md:78-85`); `sdd trace 001`
reports 215 / 215 and 641 scenarios; ERR-EVID-013 carries the new cause in condition, message and
fix; C001-COMP-003 names §8 and realises C001-REQ-101; the DoD is unchanged, TR-05 215 / 215 and
18 / 18.

### Gate notes (rows 22 and 25 replaced, rows 27 and 28 added; rows 1 to 19 of focused re-review 4, rows 21 and 23 of focused re-review 5 and rows 20, 24 and 26 of focused re-review 6 stand)
| # | Choice | Where | Evidence | Note for the gate |
|---|---|---|---|---|
| 22 | Reading every checked-out file and hashing Git LFS content at each intake, and resetting filtered files, are costs inside C001-NFR-001, C001-NFR-003 and C001-NFR-018 (a) and (c); no benchmark change has a filtered file | C001-IF-012 §5, §7 item 5, §8 items 1 and 3, C001-IF-013 §2 items 1 and 3, §8, C001-CON-22, C001-NFR-001, C001-NFR-003, C001-NFR-018 | `10-spec/50-interfaces/git-access.md:78-79`, `:90-92` | Hashing Git LFS content was accepted by P-01 with Q-cleanfilter-02. Reading every checked-out file at each intake follows from C001-REQ-101 (CR-46 resolved); intake time grows with the checked-out working tree, not with the change, and the C001-NFR-001 benchmark changes measure it for files under no clean filter; Git LFS content is not measured. In the review UI a verdict reads only the files edited since they were last hashed (row 27); a CLI verdict reads every such file once, which no threshold bounds |
| 25 | Files under a filter other than Git LFS are judged by git's index and stat data, so an edit of such a file can stay out of the change while evidence runs execute it: on every system by an index entry written or refreshed after the edit, on Windows also by a same-size edit with the modification time set back | C001-IF-012 §7 items 1, 6 and 8, C001-REQ-127, C001-REQ-509, C001-REQ-527, C001-US-502, C001-CON-22 | `10-spec/questions-log.md:429`; `10-spec/50-interfaces/git-access.md:247` | Decided by P-01 in round 16 (Q-nonlfs-01), which supersedes the fatigue-guard resolution of Q-filterworkspace-02 (CR-45 resolved). Only for paths that the base commit's `.gitattributes` assign to such a filter: the edit is in no hunk and in no moved-on notice, while every evidence workspace filled or reset afterwards runs it and the results count as evidence. The acceptance notes still word it more narrowly (CR-52) |
| 27 | The moved-on check reuses a file's hash while its stat data are unchanged, so on Windows a same-size edit made after intake with the modification time set back is missing from the moved-on notice, for every file it compares by content | C001-IF-012 G-12, §5, §7 item 5, §8 item 3, C001-REQ-117, `architecture.md` §6 | `10-spec/50-interfaces/git-access.md:306-308` | **Not explicitly accepted by P-01** at the time of this review: Q-nonlfs-01 covers filters other than Git LFS only. Chosen by the architect to keep a verdict within C001-NFR-003. The edit never reaches a snapshot or a workspace, but a developer who signs and then commits the working tree commits it unreviewed (C001-US-104); C001-REQ-117 (Must) still says the notice names each differing file. Until a racy rule is added, a same-size write in the same time-stamp step as the hashing is missed on every system (CR-49) |
| 28 | A path outside a sparse checkout counts with the blob of its index entry, as git counts it: a file deleted from the working tree and marked skip-worktree is not a deletion, and a filtered file outside the sparse checkout holds its stored form in evidence workspaces | C001-IF-012 §8 item 2, C001-REQ-101, C001-IF-013 §2 item 1, ERR-EVID-013, C001-TS-191, C001-TS-961, C001-TS-962 | `10-spec/50-interfaces/git-access.md:297-298` | A specialist choice made with the fix of CR-46, not decided by P-01. Such a deletion stays out of the review only while the flag stays set. A test that reads a filtered file outside the sparse checkout reads its stored form, with ERR-EVID-013 and the fix `git sparse-checkout add`. The rule is in no requirement statement yet (CR-50) |

### Re-review 7 verdict
P-01's round-16 answer is applied as chosen. CR-46 and CR-47 are resolved; CR-45 and CR-48 are
resolved except the parts carried into CR-49, CR-51 and CR-52. No blocker is open. One finding is
major: CR-49. Three are minor: CR-50, CR-51 and CR-52. Recommendation: before G2, the conductor puts
gate notes row 27 to P-01 and the architect adds the racy rule; CR-50 to CR-52 are text and ledger
edits that need no further critic pass. At G2, P-01 should read gate notes rows 20 to 28, in
particular row 27, row 25 (now decided) and row 28 (sparse checkouts). CR-33 and CR-34 remain open
from focused re-review 4.

## Focused re-review 8

*Written by sdd-critic; appended by the conductor because the file exceeds the critic's write limit
(text as the critic returned it, except "re-review 8" added to the rubric heading for uniqueness);
the status lines of CR-33 to CR-52 were updated as the critic listed them.*

**Scope.** A short verification pass, by the brief: the fixes for CR-49 to CR-52 of focused re-review 7 after P-01's answer to Q-movedon-01 (`10-spec/questions-log.md` Round 17), checked only for new contradictions, and a status sweep of CR-1 to CR-52. Changed: C001-IF-012 G-12, §5, §7 item 5 and §8 item 3; C001-IF-013 §2 item 5; `architecture.md` §6; C001-REQ-117, C001-REQ-527 and C001-REQ-528; the glossary entries outside the sparse checkout and change; the TS cells of `00-index.md`; C001-TS-192 to C001-TS-194, the C001-REQ-117 coverage row and note and the C001-REQ-527 note; the tombstones of `C001-TS-950`, `C001-TS-960` and `C001-TS-963`. `sdd lint 001 --phase 10-spec --json`: 877 errors, 859 of them TR-06 and TR-08 (0 / 215 requirements with a task, 0 / 644 scenarios with a test case, as `sdd trace 001` reports) and 18 taken, from the count, to be the one-per-NFR LINT-OBS-001 of earlier passes (the printed output is cut); the three TR-12 errors of CR-51 are gone. `sdd trace 001`: TR-01 to TR-05 at 100 %, 22 open items.

**Reviewed set** (the frontmatter keeps `all`): C001-REQ-117, C001-AC-117.1, C001-TS-138 to C001-TS-140, C001-TS-150, C001-TS-192 to C001-TS-194, C001-US-104, C001-NFR-003, C001-REQ-101, C001-REQ-127, C001-AC-127.1, C001-REQ-527, C001-AC-527.1, C001-REQ-528, C001-AC-528.1, C001-TS-961, C001-TS-962, C001-REQ-529, C001-US-502 to C001-US-504, C001-IF-012, C001-IF-013, C001-CAP-05, C001-CAP-09; ERR-INTAKE-007, ERR-EVID-013, the glossary terms change, outside the sparse checkout and moved-on notice, `architecture.md` §6, `00-index.md`, round 17 and the tombstones of `ids.json`; for the sweep, CR-33 and CR-34 against C001-REQ-516, C001-COMP-011, `40-domain/domain-model.md` §2.25, `40-domain/state-machines.md` §5, C001-TS-582, C001-TS-583 and C001-TS-585.

### Status of CR-49 to CR-52, CR-33 and CR-34
| Finding | Status | Evidence of the fix |
|---|---|---|
| CR-49 | resolved | "**Answer:** Accept Windows gap, state it" — `10-spec/questions-log.md:442`; racy rule: "only when the file's modification time" / "and change time are both earlier than the start of that read by two seconds or more" — `10-spec/50-interfaces/git-access.md:314-315`; the Windows limit in the C001-REQ-117 statement and rationale (`10-spec/20-capabilities/CAP-01-change-intake/requirements.md:145-146`), G-12, §7 item 5 and §8 item 3 (`…/git-access.md:56`, `:203-211`, `:326-335`), C001-IF-013 §2 item 5 (`10-spec/50-interfaces/evidence-runs.md:229-233`), `architecture.md` §6 (`10-spec/60-architecture/architecture.md:445`); C001-TS-192 to C001-TS-194, the abuse and concurrency cells and the note (`…/CAP-01-change-intake/acceptance.md:579-626`, `:1168`, `:1184`). Introduced: CR-53, CR-54 |
| CR-50 | resolved | "or a path outside the sparse checkout whose content in the snapshot is the blob of its index entry (C001-IF-012 §8 item 2)" — `10-spec/20-capabilities/CAP-05-review-evidence/requirements.md:241`; "or not in the working tree" — `…/requirements.md:249`; "A path outside the sparse checkout counts with the blob of its index entry, not as deleted" — `10-spec/40-domain/glossary-delta.md:19`, with the entry outside the sparse checkout (`:20`) |
| CR-51 | resolved | "TS-5nn, TS-951 to TS-959, TS-961 and TS-962" — `10-spec/00-index.md:92`; "TS-9nn, except TS-951 to TS-959, TS-961 and TS-962 (C001-CAP-05)" — `:96`; `{ "id": "C001-TS-950", "reason": "allocated, unused"` — `ids.json:14`, with `C001-TS-960` and `C001-TS-963` (`:15-16`); no TR-12 in the phase lint |
| CR-52 | resolved | "directly in the index file or by git refreshing its index with another clean command given for that one command" — `10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:1185`, `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:1297`; "Git LFS files are checked against the SHA-256 hash and size that their pointer files name" — `10-spec/60-architecture/architecture.md:445` |
| CR-33, CR-34 | resolved (checked in this pass) | CR-33: "preparing, free, in use, copying" — `10-spec/40-domain/domain-model.md:494`, the copy's lifetime (`:518-521`), ERR-EVID-010 and ERR-EVID-011 (`:528-531`); "the copy of the test run's workspace fails (for example for lack of disk space)" — `10-spec/40-domain/state-machines.md:176`, the outside load (`:177`); "Scenario: C001-TS-585 — A failed copy of the test run's workspace is removed and makes the mutation evidence of every hunk unavailable" — `…/CAP-05-review-evidence/acceptance.md:585`. CR-34: C001-TS-582 and C001-TS-583 keep their behavioural assertions and assert no time bound (`…/acceptance.md:437-459`) |

**Round 17.** "**Answer:** Accept Windows gap, state it" (`10-spec/questions-log.md:442`) is applied as its option text says (`:438`): the hash reuse is kept, the racy rule added (C001-IF-012 §8 item 3), the Windows limit stated in C001-REQ-117, C001-IF-012 and the coverage table; no extracted instructions. Not a finding: no option is marked recommended (`:438-440`); the answer is logged verbatim. The option does not cover file times from a clock that lags the machine's (CR-53).

### Findings

### CR-53 — The two-second margin of the racy rule assumes that file times come from a clock that does not lag the machine's; where it lags by more, the moved-on gap is not limited to Windows, while C001-IF-012 says the gap does not exist on Linux and macOS
- **Severity:** minor
- **Refs:** C001-IF-012, C001-REQ-117, C001-AC-117.1, C001-TS-194
- **Evidence:** "after taking the time of the" / "machine's clock at the start of that read" — `10-spec/50-interfaces/git-access.md:311-312`; "both earlier than the start of that read by two seconds or more" — `:315`; "The two seconds cover file" / "systems that record times in steps of up to two seconds (FAT) and operating systems that take" / "file time stamps from a clock running a fraction of a second behind the clock of the process." — `:320-322`; "so with the time-stamp rule the" / "gap does not exist there." — `:331-332`, likewise `:207-208`; "on Windows, a same-size edit made after the file was last hashed with its modification time set back is missing from the moved-on notice" — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:146`
- **Why it matters:** on a network share the server stamps file times with its own clock. If that clock runs more than 2 s behind the machine's, a file written just before a moved-on check already carries times older than the margin, its hash is kept, and a same-size write within the same time step of the server leaves size, times and inode as kept: the notice misses it on Linux and macOS too, which C001-IF-012 rules out and P-01 did not accept with Q-movedon-01. The margin also equals the largest step it covers, so a 2 s step plus any lag leaves a window as long as the lag. As with the Windows gap, the edit never reaches a snapshot or a workspace.
- **Suggested fix:** Owner: architect (C001-IF-012 §8 item 3, §7 item 5): state the limit (file times from a clock more than the margin behind the machine's, for example a network share, on every system) and restrict "the gap does not exist there" to the other cases; optionally widen the margin to cover a 2 s step plus a lag (for example 3 s). Owner: spec-writer (C001-REQ-117 rationale) and test-designer (the C001-REQ-117 note, `…/CAP-01-change-intake/acceptance.md:1184`): name it. Owner: conductor: gate notes row 29.
- **Status:** open

### CR-54 — The exception of C001-REQ-117 takes the file out of the names but not out of the state, and is worded by an internal event
- **Severity:** minor
- **Refs:** C001-REQ-117, C001-AC-117.1, C001-TS-193
- **Evidence:** "WHILE the working tree or HEAD no longer matches the snapshot under review" … "THE review assistant SHALL show a moved-on notice that names each file that differs from the snapshot and states whether HEAD moved, except on Windows for a file whose only difference from the snapshot is a same-size edit made after the file was last hashed with its modification time set back (C001-IF-012 §8 item 3)." — `10-spec/20-capabilities/CAP-01-change-intake/requirements.md:145`; against "set its modification time back to the value it had at that check" — `10-spec/20-capabilities/CAP-01-change-intake/acceptance.md:599`
- **Why it matters:** when the excepted edit is the only difference, the WHILE state still holds, so read literally the statement requires a notice that names no file and says HEAD did not move, while the system shows none because it cannot see the edit. "Last hashed" is an internal event a tester cannot observe (a moved-on check that reuses a hash does not hash), and "set back" does not say to which value; C001-TS-193 words both observably.
- **Suggested fix:** Owner: spec-writer: move the exception into the WHILE state, so that a file whose only difference is such an edit counts as matching the snapshot, and word it as C001-TS-193 does: an edit made after the last intake or moved-on check, with the modification time set back to the value it had then. Carry the limit of CR-53 the same way if it is stated.
- **Status:** open

### Rubric (reviewed set, re-review 8)
| Rubric | Item | Result |
|---|---|---|
| requirements | R2 Testable, R3 Unambiguous, R5 Implementation-free | CR-54 |
| requirements | R7 Consistent | CR-53 |
| requirements | R11 Delta and evidence | n/a: greenfield change, no living spec (`10-context/current-state.md`) |
| NFRs | N1–N5 | n/a: no NFR changed; C001-NFR-003 enters only through C001-IF-012 §5 |
| stories, requirements, acceptance, domain/interfaces/architecture, DoD and index | S1–S6, R1, R4, R6, R8–R10, R12, A1–A5, D1–D5, O1–O3, X1 | pass |

**Why no further findings** (two findings):
- Stories: C001-US-104 lists C001-REQ-117 and C001-US-502 to C001-US-504 list C001-REQ-527 to C001-REQ-529; no story changed.
- Requirements: C001-REQ-527 keeps one outcome; a path outside the sparse checkout has no working-tree file, fails the copy condition and falls to C001-REQ-528, whose cause "not in the working tree" matches C001-IF-013 §2 item 1 (`10-spec/50-interfaces/evidence-runs.md:129-131`); the C001-REQ-117 rationale cites Q-movedon-01 and C001-IF-012 §7 item 5 and §8 item 3, as the option asked.
- Acceptance: under the rule as written C001-TS-194 holds (a check 0.1 s after a write on a 1 s volume keeps no hash, so the check at 10:00:05 reads the file again), C001-TS-193 holds through the change time on Linux and macOS, C001-TS-192 matches C001-IF-012 §8 item 1; the n/a error cell of C001-REQ-117 stays credible.
- Interfaces and architecture: G-12, §5, §7 item 5, §8 item 3, C001-IF-013 §2 item 5 and `architecture.md` §6 state one rule and one Windows limit; G-07 still reuses no hash, so snapshots and evidence workspaces are unaffected.
- DoD and index: TR-05 215 / 215 and 18 / 18; the index places C001-TS-961 and C001-TS-962 under C001-CAP-05; the ledger's tombstones match the IDs in use.

### Gate notes (row 27 replaced, row 29 added; the last sentences of rows 25 and 28, which cite CR-52 and CR-50, are void now that both are resolved; all other rows of focused re-reviews 4 to 7 stand)
| # | Choice | Where | Evidence | Note for the gate |
|---|---|---|---|---|
| 27 | The moved-on check reuses a file's hash while its stat data are unchanged, so on Windows a same-size edit made after the last intake or moved-on check, with the modification time set back, is missing from the moved-on notice, for every file it compares by content | C001-IF-012 G-12, §5, §7 item 5, §8 item 3, C001-REQ-117, C001-IF-013 §2 item 5, `architecture.md` §6 | "**Answer:** Accept Windows gap, state it" — `10-spec/questions-log.md:442` | Decided by P-01 in round 17 (Q-movedon-01), with the racy rule added, so apart from row 29 the gap is Windows-only (CR-49 resolved). Keeps a verdict within C001-NFR-003. The edit never reaches a snapshot or a workspace, but a developer who signs on Windows and then commits the working tree can commit it unreviewed (C001-US-104) |
| 29 | The racy rule keeps a hash for reuse only when the file's modification and change times are at least 2 s older than the machine's clock at the start of the read | C001-IF-012 §8 item 3, §5, C001-REQ-117 | "both earlier than the start of that read by two seconds or more" — `10-spec/50-interfaces/git-access.md:315` | A specialist choice inside the option of Q-movedon-01, not decided by P-01. When file times come from a clock running more than 2 s behind the machine's, for example a network share whose server clock lags, a same-size write in the same time step as the hashing can be missing from the moved-on notice on every operating system; not yet stated (CR-53). Moved-on notice only: snapshots and evidence workspaces are unaffected |

### Re-review 8 verdict
CR-49 to CR-52 are resolved, and so are CR-33 and CR-34, checked in this pass. After the status sweep, 0 blocker, 0 major and 2 minor findings are open (CR-53, CR-54), out of 54 findings in all (2 blocker, 15 major, 37 minor). Both are text edits for the architect, spec-writer and test-designer that need no further critic pass; alternatively, P-01 accepts row 29 and waives CR-53 at G2. At G2, P-01 should read gate notes rows 20 to 29, in particular rows 25 and 27 (gaps P-01 accepted) and rows 28 and 29 (specialist choices P-01 has not decided).
