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
- **Status:** open

### CR-34 — C001-TS-582 and C001-TS-583 put the 1 s threshold of C001-NFR-018 (c) into acceptance tests that must pass on every CI runner
- **Severity:** minor
- **Refs:** C001-TS-582, C001-TS-583, C001-REQ-512, C001-NFR-018, C001-DOD-005, C001-DOD-027
- **Evidence:** "And the evidence-bundle overhead (c) of C001-NFR-018 for the command, taken from the end of the copy instead of from the run action, is at most 1 s" — `10-spec/20-capabilities/CAP-05-review-evidence/acceptance.md:435`; "And the evidence-bundle overhead (c) of C001-NFR-018 is at most 1 s for each of the 10 commands" — `…/acceptance.md:444`; the NFR's environment: "- **Environment:** reference machine; benchmark changes (§0) with their test command, intake and environment," — `10-spec/30-nfr/nfr.md:115`, with "8 logical CPU cores, 16 GiB RAM, SSD storage, no other user workload" — `…/nfr.md:15`; the DoD items that run every scenario: "Every scenario of `20-capabilities/CAP-05-review-evidence/acceptance.md` runs as an automated acceptance test and passes in CI at the closing commit" — `10-spec/70-dod.md:36`, "The acceptance suite passes at 100 % on CI runners of Windows 11 x86-64, macOS 14 or later on x86-64 and on arm64, and Ubuntu 22.04 LTS or later on x86-64" — `…/70-dod.md:58`
- **Why it matters:** these are the only acceptance scenarios of the specification that assert an NFR time threshold; every other threshold is checked by a benchmark-report item on the reference machine (C001-DOD-010 to C001-DOD-014). C001-NFR-018 sets 1 s for the reference machine with no other workload and for benchmark changes. CI runners are shared, often smaller, virtualised machines whose load the suite does not control, and the time the core adds holds a reset, two checks and the observation of the working tree. The two scenarios can then fail in CI although the NFR holds, or pass on the small `shop-ts` fixture while it fails on a benchmark change; either way C001-DOD-005 and C001-DOD-027 depend on the runner. This is the caution the test-designer raised. What the scenarios exist for is observable without a time bound: the run waits for the copy, then runs in the test run's workspace with no workspace prepared (C001-TS-582), and bundle runs go on in that workspace while mutation testing runs (C001-TS-583).
- **Suggested fix:** Owner: test-designer (`CAP-05-review-evidence/acceptance.md`, `70-dod.md`). Drop the 1 s assertions from C001-TS-582 and C001-TS-583 and keep their behavioural assertions; the bound stays with C001-DOD-014, which already reports (c) in both states with no wait for the copy. If a time check in the acceptance suite is wanted, assert a bound that holds on CI and state that the 1 s threshold is checked only by C001-DOD-014; or name the reference machine in the Given and exclude the two scenarios from the CI matrix of C001-DOD-027. P-01 can waive this finding at G2 instead.
- **Status:** open

### CR-35 — Q-copy-window-01 was applied without the assumption marker that Q-fatigue-01 promised
- **Severity:** minor
- **Refs:** C001-IF-013, C001-NFR-018, C001-DOD-014
- **Evidence:** "Use recommendations (Recommended) — Resolve remaining non-blocking questions with their recommended options; each is logged and marked as an assumption you can review at G2." — `10-spec/questions-log.md:356`; "**Answer:** (fatigue guard — recommended option applied)" — `…/questions-log.md:371`; the rule applied, with no marker and no citation of the question: "A run of the snapshot that needs a" / "workspace in this window while no other workspace of the snapshot is free waits until the copy" / "ends and then takes the test run's workspace; no workspace is prepared for it." — `10-spec/50-interfaces/evidence-runs.md:65-67`; "Not" / "included: the preparation of a workspace, and the wait of a run asked for during the copy" / "window." — `…/evidence-runs.md:244-246`; Q-copy-window-01 occurs in no file of `10-spec/` other than `questions-log.md`, and the generated list has "Total: 13" (`10-spec/85-open-items.md:12`), none of them for it
- **Why it matters:** P-01 accepted the fatigue guard on the condition that each recommendation applied is marked as an assumption to review at G2. The copy-window rule decides that a bundle run asked for just after the test run waits for the copy, and that this wait falls under no threshold of C001-NFR-018. Without the marker at the rule, the open-items list that P-01 reviews at G2 does not show it, and a later reader of the interface cannot tell that P-01 did not choose it.
- **Suggested fix:** Owner: architect (`50-interfaces/evidence-runs.md` §2 item 3, optionally §8 item 2): add the marker `[ASSUMPTION: Q-copy-window-01]` to the copy-window rule, outside backticks so that it counts; then the conductor runs `sdd trace 001 --write` so that `85-open-items.md` lists it. Until then, gate notes row 18 shows it to P-01.
- **Status:** open

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
