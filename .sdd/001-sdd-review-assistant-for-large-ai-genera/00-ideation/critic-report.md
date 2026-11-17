---
artifact: critic-report
change: CHG-001
phase: 00-ideation
reviewed_ids: [C001-R-003, C001-R-001, C001-DEC-001, C001-DEC-002, C001-DEC-003, C001-DEC-004, C001-DEC-005, C001-DEC-006, C001-DEC-007]
---
# Critic report — CHG-001 00-ideation

First review (all IDs): `00-ideation/ideation.md`, `00-ideation/questions-log.md`, C001-DEC-001 to
C001-DEC-004, C001-OA-001, C001-OA-002, C001-R-001, C001-R-002, `.sdd/_constitution/constitution.md`.
`sdd lint 001 --phase 00-ideation`: 0 errors, 0 warnings. `sdd trace 001`: no spec IDs yet.

Re-review 1 (2026-11-17, focused): the fixes for CR-1 to CR-9 and any issue they introduce. Its
set was C001-OA-001, C001-OA-002, C001-DEC-001 to C001-DEC-007, C001-R-001 and C001-R-002. It also
covered the sections of `ideation.md` that were changed and have no scheme ID (§1, §2, §3, §4, §5,
§7, §8, §10, §11, §12), and the "Change creation" section of `questions-log.md`.
`sdd lint 001 --phase 00-ideation --json`: 0 errors, 0 warnings, 0 info. `sdd trace 001`: no spec
IDs, 9 open items.

Re-review 2 (2026-11-17, focused, after G1 approval; the phase is `stale` at `change.md:9`): the
new research note C001-R-003 and its row in `ideation.md` §6 (`ideation.md:124`; `git diff` shows
this row as the only change to `ideation.md` since the G1 commit). The `reviewed_ids` above are
that set: C001-R-003, the note it extends (C001-R-001: gap numbers, §C, §D, §E columns), and
C001-DEC-001 to C001-DEC-007, checked for contradictions. The scope sections §4–§8 of
`ideation.md` and `.sdd/_constitution/constitution.md` (licence rules) were read for
contradictions only. The statuses of CR-10, CR-11 and CR-12 were confirmed as well.
`sdd lint 001 --phase 00-ideation --json`: 0 errors, 0 warnings, 0 info.

## Summary
Open findings after re-review 2:

| blocker | major | minor |
|---|---|---|
| 0 | 0 | 7 |

- First review: 0 blocker, 4 major, 5 minor.
- Re-review 1: 7 resolved (CR-1, CR-2, CR-3, CR-4, CR-6, CR-7, CR-9), 2 still open (CR-5, CR-8),
  3 new minor (CR-10, CR-11, CR-12).
- Re-review 2:
  - Resolved (3): CR-10, CR-11, CR-12 (fixed before the G1 approval).
  - Carried open, outside this revision's set (2): CR-5, CR-8.
  - New (5, all minor): CR-13, CR-14, CR-15, CR-16, CR-17.

## Focused re-review 2 — C001-R-003 and its §6 row (2026-11-17)

### Status of the earlier findings

| Finding | Severity | Status | Evidence |
|---|---|---|---|
| CR-10 | minor | resolved | OA-001 now says "and 20-plan read it; C001-DEC-001 Consequences record it (fix for critic finding CR-1)." (`options/OA-001-review-paradigm.md:169-170`) and "separable later layer), which C001-DEC-001 Consequences record." (`OA-001-review-paradigm.md:268-269`). The frontmatter reads "version: 0.2.0" (`ideation.md:7`), matching the 0.2.0 row (`ideation.md:16`). The idea statement now says "(verbatim, from the command arguments; the opening quotation mark is P-01's own and the text has no closing one)" (`questions-log.md:26`), so the end of P-01's words is explained. The version part comes back with the post-G1 edit: CR-16. |
| CR-11 | minor | resolved | The unsourced sentence is gone. DEC-006 now says "The SDD tools surveyed each use their own spec format (C001-R-002 §A), so a" / "tool that required one workspace format would not cover sessions run without it." (`decisions/DEC-006-spec-anchoring.md:12-13`). C001-R-002 §A supports it: Spec Kit uses `spec.md`, `plan.md`, `tasks.md`, Kiro three files per feature, Tessl its own spec, OpenSpec a change folder with delta specs (`research/R-002-sdd-and-review-paradigms.md:30-38`). |
| CR-12 | minor | resolved | §8 now reads "The core flow above already embodies paradigms 1–4, 11" / "and 17, and paradigm 5 without its auto-acceptance tier (excluded by non-goal 3 and" / "C001-DEC-003)." (`ideation.md:159-161`). |
| CR-5 | minor | open (carried; not in this revision's set) | Unchanged. Accepted by the conductor as a known limitation; G1 was approved with it open (`change.md:28`, waivers "none"). |
| CR-8 | minor | open (carried; not in this revision's set) | Unchanged. The Gate log records P-01's words as "Approve" (`change.md:28`), which does not show whether the G1 summary named the architecture-first interpretation. Name it again in the re-approval summary. |

### Research-note checks (C001-R-003)

| Check | Result | Evidence |
|---|---|---|
| Question quoted verbatim, purpose stated | pass | "Brief (verbatim):" (`R-003-cline-aider-windsurf-review.md:11`); why asked at line 13. |
| Method, routing and what was not reached disclosed | pass | Lines 16-21: DeepWiki first for the two repositories, web search for Windsurf, primary pages for licences, the fetch-summary caveat, a "Not reached" list. |
| Every source dated | pass | Every Findings bullet gives its URLs with "(2026-11-17)"; line 21: "Access date for every source: 2026-11-17." |
| Confidence rating on every finding and overall | pass | Every bullet ends in "confidence: high/medium/low (reason)"; overall "medium" (line 78). Absence-based claims are rated medium and marked "absence of evidence" (lines 33, 45, 56). |
| Conflicting evidence recorded with the choice made | pass | Five conflicts, each with the source preferred and why (lines 95-99), including the stale "advanced" page against the dated changelog. |
| No form factor recommended | pass | Line 13: "No form factor is recommended here." The Implications list ideas and gaps, none proposes a surface or reopens C001-DEC-002. |
| Comparison table in the columns of C001-R-001 §E | pass | Line 70 has the eight columns of `R-001-ai-review-tools-landscape.md:76`, with the same unit and licence legend (line 68). |
| Gap numbers match C001-R-001 | pass | Gaps 1, 2, 3, 6, 7, 8 (lines 84-89) match `R-001-ai-review-tools-landscape.md:118-125`. The Gap 7 comparison is overstated: CR-15. |
| Licence flags against the constitution | pass | Cline, Kanban and Aider "Apache-2.0" with "licence text itself not opened" (lines 36, 47); Devin Desktop "confidence: low", treated as proprietary (line 58). The rule cited, NFR-D-03, is the permissive-licence NFR (`constitution.md:46`, `constitution.md:64`). |
| Embedded instructions | none found | Line 21: "No instructions were found in the web content read." None found in the note itself. |
| §6 one-line conclusion matches the note | CR-13 | See finding. Confidence column "medium" matches line 78. |
| No contradiction with ideation, DECs or scope | CR-14, CR-17 | Non-goal 1 versus the feedback precedents holds (see Review notes, re-review 2). |

## Re-review 1 — status of CR-1 to CR-9 (2026-11-17)

| Finding | Severity | Status | Evidence of the fix, or what remains |
|---|---|---|---|
| CR-1 | major | resolved | The "Re-check against research" sections cite the notes for every changed or confirmed score (`options/OA-001-review-paradigm.md:181-269`, `options/OA-002-form-factor.md:152-199`). The combined pessimistic case is tested (`OA-001-review-paradigm.md:236-253`; E 3.70, B 3.75, recomputed and correct). The "predates … re-check" sentences are replaced by the outcome (`OA-001-review-paradigm.md:24-29`, `OA-002-form-factor.md:25-27`). C001-DEC-001 records the increment path: "the intent map" / "is built first, risk triage is added on top in a later increment." (`decisions/DEC-001-review-paradigm.md:40-41`). New leftover in OA-001: CR-10. |
| CR-2 | major | resolved | C001-DEC-005, C001-DEC-006 and C001-DEC-007 exist, each with options, P-01's verbatim answer and consequences. G-1, G-6 and the §7 index point at them (`ideation.md:73`, `ideation.md:88`, `ideation.md:132-134`). Residual, not reopened: non-goal 5 ("(Q-scale-01)", `ideation.md:103`) and the §10 scale assumption (`ideation.md:179`) still cite the question, not C001-DEC-007. The meaning is clear because §5 Later cites C001-DEC-007 (`ideation.md:115`). |
| CR-3 | major | resolved | §8 sorts all 20 R-002 paradigms: 7 embodied, 1 excluded, 2 Later, 10 selectable. 10-spec may add only from the selectable ten, "and only as features of the in-scope components" / "of §5; anything else needs a revision of this ideation" (`ideation.md:158-163`). The §11 row is now a selection within that bound (`ideation.md:191`). P-01 approves the bound at G1. Residual, not reopened: paradigm 13 (spec-delta review) is now selectable, so R-002's point on not assuming the spec is correct has a place, but §9 still lists no risk for it. The new sorting introduces CR-12. |
| CR-4 | major | resolved | G-2 names a metric and a target ("at most 30 % of changed lines", `ideation.md:75-78`). G-4 is observable ("every intent and every open" / "hunk is reachable from the component it touches", `ideation.md:82-84`). G-8 names its baseline, method and target (`ideation.md:91-94`). The targets carry `[ASSUMPTION]` markers, have §10 rows (`ideation.md:180-181`) and an open question owned by P-01 (`ideation.md:192`). |
| CR-5 | minor | open (the conductor accepts it as a known limitation) | The DECs now disclose that their analyses are unscored. C001-DEC-003 and C001-DEC-004 say "rationales only, not scored with weighted" / "criteria" (`decisions/DEC-003-clearing-autonomy.md:21-22`, `decisions/DEC-004-llm-provider.md:19-20`). C001-DEC-005, C001-DEC-006 and C001-DEC-007 say "(inline, unscored)" (`DEC-005-primary-reviewer.md:20`, `DEC-006-spec-anchoring.md:19`, `DEC-007-scale-target.md:19`). None says why no scored analysis was needed or what was searched. That applies wherever fewer than four candidates were considered: Q-arch-insight-01 has 3 (`questions-log.md:104`), C001-DEC-005 and C001-DEC-006 have 3, and Q-scale-01 / C001-DEC-007 has 2 (`questions-log.md:141`). Rubric I4 is met. P-01 can accept the limitation at G1. |
| CR-6 | minor | resolved | §2 now states the claims at the notes' strength: "correlational, medium" / "confidence", "extending them" / "to agent-scale changes is an inference", "an inference from absence," / "medium to low confidence" (`ideation.md:24-33`). §12 now matches its lead sentence and lists the Baum source (`ideation.md:196-205`). The OA source lines carry access dates (`OA-001-review-paradigm.md:86-91`, `OA-002-form-factor.md:75-78`). Kiro is not named, but §2 limits the claim to "Among the tools" / "surveyed". R-001 also states "Kiro generates from specs but its documented code review is not linked back to them." (`research/R-001-ai-review-tools-landscape.md:66`). No residual. |
| CR-7 | minor | resolved | Non-goals 1 and 2 now end with "in this change" (`ideation.md:97-100`). §5 Later lists the PR-platform surface, and agent feedback with "would lift non-goal 1" (`ideation.md:112-115`). C001-DEC-002 Consequences agree: "they are out of scope for CHG-001" (`decisions/DEC-002-form-factor.md:27-28`). |
| CR-8 | minor | open (left for P-01 to confirm at G1) | Not changed. G-4 now states the entry point more firmly: "the review opens on the architecture delta" (`ideation.md:82`). §8 step 2 still says "The UI opens on" / "this view" (`ideation.md:144-145`). Neither carries `[ASSUMPTION: Q-arch-insight-01]`, so the G1 summary must name this interpretation for P-01 to confirm or correct. |
| CR-9 | minor | resolved | The questions log has a "Change creation" section with Q-profile-01: options, and "- **Answer:** Full (Recommended)" (`questions-log.md:3-14`). §3 repeats it (`ideation.md:40-44`), and it matches `change.md:5` ("profile: \"full\""). The conductor transcribed the entry after the fact; P-01 sees it at G1. Q-profile-01 is not asked again. The new section introduces one defect, part of CR-10. |

## Findings

Line references in CR-1 to CR-9 point to the file versions of the first review, and those in
CR-10 to CR-12 to the versions of re-review 1. The current locations are in the status tables
above. CR-13 to CR-17 cite the current files.

### CR-1 — Option scores not re-checked against the research notes; R-002 evidence moves OA-001 toward a near tie in an untested case
- **Severity:** major
- **Refs:** C001-OA-001, C001-DEC-001, C001-R-002, C001-OA-002
- **Evidence:** "Re-check the scores when those notes land." — `00-ideation/options/OA-001-review-paradigm.md:26`; "re-check the scores when those notes land." — `00-ideation/options/OA-002-form-factor.md:26`; "**E.** Scale 5: as C, inside each intent. Catch 4: as B, plus risk flags." — `00-ideation/options/OA-001-review-paradigm.md:109`; "If it proves weak (E: catch 3, control 2), E falls to 4.00 and stays first." — `00-ideation/options/OA-001-review-paradigm.md:122-123`; "inspecting changes ranked by predicted risk covering 20% of the total effort found about 35% of defect-inducing changes" — `00-ideation/research/R-002-sdd-and-review-paradigms.md:56`; "| Evidence that clears hunks is weak (agent-written tests) | high | high |" — `00-ideation/ideation.md:143`; "simplicity score is mitigated by delivering it in increments: B's intent map first, then risk" — `00-ideation/options/OA-001-review-paradigm.md:144`; "- The analysis core needs at least three engines: intent mapping, risk triage with evidence, and" — `00-ideation/decisions/DEC-001-review-paradigm.md:32` (the Consequences list carries no increment path).
- **Why it matters:** Both analyses say they are provisional until the research notes exist. The notes now exist, but no OA, DEC or ideation section records the re-check. For OA-002 the notes back the scores (R-001 §B: Plannotator already serves a review UI from a local server; R-001 §D: git-state intake, and grouped review offered only as PR-hosted services). Only the out-of-date sentence remains there. For OA-001 the notes do not reverse the ranking, but they support the pessimistic case for E:
  - Risk ranking found about a third of defect-inducing changes at 20 % of the effort (R-002 line 56).
  - LLM help found no more high-severity issues (R-002 line 61).
  - The ideation rates weak clearing evidence as high likelihood and high impact.

  E gets the same catch score (4) as B even though E leaves cleared hunks unread. The analysis scores exactly that failure 3 for C ("a false negative is cleared silently", line 100). The documented sensitivity (E at 4.00) holds. It does not test the case where weak evidence also clears less code: E with scale 4, catch 3 and control 2 scores 1.20 + 0.60 + 0.75 + 0.75 + 0.20 + 0.20 = 3.70, against 3.75 for B. That is a near tie under the options-analysis rule (within 0.10), where constitution principle 2 (reversibility) decides. The tie-breaker exists: OA-001's Recommendation delivers B's intent map first and triage later. But C001-DEC-001 does not record it, so 10-spec and 20-plan, which read the DEC, lose the mitigation that justifies choosing the least simple candidate under principle 1.
- **Suggested fix:** Have the options analyst re-check C001-OA-001 and C001-OA-002 against C001-R-001 and C001-R-002 and do four things:
  - cite the notes in the justifications;
  - add the combined pessimistic case to the OA-001 Sensitivity section;
  - replace the "predates … re-check" sentences with the outcome;
  - add to C001-DEC-001 Consequences: "intent map first, risk triage as a separable later layer" (OA-001 Recommendation).

  P-01 needs to decide again only if the re-check puts B ahead of E.
- **Status:** resolved (re-review 1, 2026-11-17; see the status table). Leftover stale sentences in OA-001: CR-10.

### CR-2 — Three material decisions have no DEC record
- **Severity:** major
- **Refs:** C001-DEC-001, C001-DEC-002
- **Evidence:** Q-reviewer-01, Q-spec-anchor-01 and Q-scale-01 are each logged "- **Blocking:** yes · **Material:** yes" — `00-ideation/questions-log.md:19`, `00-ideation/questions-log.md:30`, `00-ideation/questions-log.md:116`; "- **Why it matters:** Sets the performance NFRs and the analysis and UI budgets." — `00-ideation/questions-log.md:117`; the decisions index has only "| Q-autonomy-01 → C001-DEC-003 |" and "| Q-llm-01 → C001-DEC-004 |" next to the two OA rows — `00-ideation/ideation.md:112-113`; goals cite the questions directly: "over about 300 files in one local session (Q-scale-01)" — `00-ideation/ideation.md:61`, "otherwise (Q-spec-anchor-01)." — `00-ideation/ideation.md:74`; "| [ASSUMPTION: Q-scale-01] Agent changes reviewed today rarely exceed ~10,000 lines |" — `00-ideation/ideation.md:153`.
- **Why it matters:** These three decisions are material and shape every capability: the primary persona, the spec-anchoring mode (a dependency on an SDD workspace) and the 10,000-line target (an NFR threshold). C001-DEC-001 and C001-DEC-002 cite them as binding inputs, yet none has a Context / Decision / Consequences record (phase-ideation step 5; rubric I4). 10-spec rationales can cite them only by question ID, which is outside the ID scheme and is not traced. Their consequences are written nowhere, for example the two intent sources behind G-6, or the scale limit in non-goal 5. Q-scale-01 also serves as both a decision and an assumption marker.
- **Suggested fix:** Record three DECs (IDs from `sdd id next DEC --change 001`): primary reviewer, spec anchoring, scale target. Give each the options from the log, P-01's verbatim answer and its consequences. Point G-1, G-6, §4.2 item 5 and the §7 index at them. Keep the assumption about the size of today's agent changes, but cite the new scale DEC as the decision it supports.
- **Status:** resolved (re-review 1, 2026-11-17). Residual, not reopened: non-goal 5 and the §10 assumption still cite Q-scale-01.

### CR-3 — Scope boundary left open by the paradigm selection deferred to 10-spec
- **Severity:** major
- **Refs:** C001-R-002, C001-DEC-001
- **Evidence:** "Candidate paradigms from C001-R-002 (for example attention budget, sampling with escalation, executable evidence bundles, interrogation mode) are inputs for 10-spec to select from" — `00-ideation/ideation.md:135-137`; "| Which candidate paradigms from C001-R-002 beyond the core flow go into the first version? | P-01 | 10-spec |" — `00-ideation/ideation.md:163`; "4. Formal verification of code against specs." — `00-ideation/ideation.md:85`, while R-002 lists "18. Formal contract for critical kernels" — `00-ideation/research/R-002-sdd-and-review-paradigms.md:102` and "14. Review during generation" — `00-ideation/research/R-002-sdd-and-review-paradigms.md:98`; "A tool that leans on specs should help review the spec delta as well, not assume the spec is correct." — `00-ideation/research/R-002-sdd-and-review-paradigms.md:76`.
- **Why it matters:** §5 lists the in-scope components, but §8 and §11 let 10-spec add any of the 20 R-002 paradigms. §5 therefore reads as a minimum, not a boundary. Several candidates need components or inputs outside §5:
  - review during generation changes the intake model;
  - executable evidence bundles need the agent's cooperation;
  - interrogation mode is a new capability.

  One candidate conflicts with non-goal 4 (formal contracts), and one is already listed as Later (paradigm 20). Which paradigms enter decides which components are in scope, which makes it a scope question by the blocking definition. It is deferred without a bound, so G1 would approve an open-ended scope. R-002's point that a spec-based tool must not assume the spec is correct is also absent: it is not in scope, not Later and not a risk.
- **Suggested fix:** In §5, state that 10-spec may select only paradigms that fit the listed in-scope components, and classify the rest. For example: 14 and 7 Later; 18 out, per non-goal 4; 13 (spec-delta review) decided explicitly. P-01 then approves the bound at G1. Reword the §11 row as a selection within that bound. If the conductor wants P-01 to choose the paradigms now instead, that question is blocking (scope) and needs an options analysis first.
- **Status:** resolved (re-review 1, 2026-11-17). P-01 approves the bound at G1. The new classification introduces CR-12.

### CR-4 — Core goals lack a measure or target
- **Severity:** major
- **Refs:** C001-DEC-001, C001-DEC-003
- **Evidence:** "2. **G-2 Review effort independent of raw size:** the developer reviews intents and flagged hunks," / "not every line; the share of the change left for human reading is shown and measurable" — `00-ideation/ideation.md:63-64`; "layers, dependencies, drift from documented architecture) first and uses it to navigate the" / "review top-down (C001-DEC-001)." — `00-ideation/ideation.md:69-70`; "judged against today's diff review on review time and defects found (measure set in 10-spec)." — `00-ideation/ideation.md:78`.
- **Why it matters:** G-2 and G-8 carry the product's value claim. G-2 names a metric but gives neither a target nor a deferral, and "shown and measurable" does not measure independence from change size. G-4's "uses it to navigate" describes developer behaviour that no one can check. G-8 defers both the measure and the target. The constitution leaves performance thresholds to each change (NFR-D-05), so 10-spec has nothing to anchor its NFRs or the G-8 evaluation on.
- **Suggested fix:**
  - G-2: name the metric (for example, the share of changed lines left open for human reading on a reference change of 10,000 lines). Add an open question for its target: owner P-01, needed by 10-spec.
  - G-4: make it observable (for example, the review opens on the architecture view and every intent and hunk can be reached from it), or label it qualitative.
  - G-8: name the baseline and the comparison method. The target stays with the existing open question (`00-ideation/ideation.md:164`).
- **Status:** resolved (re-review 1, 2026-11-17)

### CR-5 — Several material decisions rest on unscored inline candidate lists
- **Severity:** minor
- **Refs:** C001-DEC-003, C001-DEC-004, C001-DEC-001
- **Evidence:** "Four candidates, inline analysis in Q-autonomy-01: collapse with evidence (recommended), rank" / "only and never clear, auto-accept with audit; rejected: human approval of every hunk (the" — `00-ideation/decisions/DEC-003-clearing-autonomy.md:21-22`; "Four candidates, inline analysis in Q-llm-01: pluggable with local allowed (recommended), Claude" — `00-ideation/decisions/DEC-004-llm-provider.md:19`; "- **Blocking:** yes · **Material:** yes · **Candidates considered:** 3 (inline, conductor)" — `00-ideation/questions-log.md:79`; "- **Blocking:** yes · **Material:** yes · **Candidates considered:** 2 (inline, conductor)" — `00-ideation/questions-log.md:116`.
- **Why it matters:** Material questions take their options from an analysis of four or five candidates with criteria, scores and sensitivity (options-analysis skill; interview-protocol §3). DEC-003 sets the trust boundary and DEC-004 sets a dependency and the privacy posture, yet both rest on candidate lists only. The architecture-lens scope (C001-DEC-001) had three candidates and the scale target two, without the required "fewer than four real candidates exist" note saying why. A later revision cannot see how close the alternatives were. Rubric I4 (at least two presented options) is met, hence minor.
- **Suggested fix:** Either add short OA files for clearing autonomy and the model provider, or state in each DEC, and in the log entries of Q-arch-insight-01 and Q-scale-01, why no scored analysis was needed. Where fewer than four candidates were considered, also state what was searched.
- **Status:** open (re-review 1: the DECs now disclose that the analyses are unscored, but give no reason; the conductor accepts this as a known limitation. The finding now also covers C001-DEC-005, C001-DEC-006 and C001-DEC-007. Re-review 2: carried, not in the revision's set.)

### CR-6 — Problem statement states research inferences more strongly than the notes
- **Severity:** minor
- **Refs:** C001-R-001, C001-R-002
- **Evidence:** "review (C001-R-002 §B, Faros finding), while review effectiveness drops sharply beyond a few" — `00-ideation/ideation.md:23`, while the note says "SmartBear's page presents the 70–90% as an expectation, not a measured result" — `00-ideation/research/R-002-sdd-and-review-paradigms.md:48` and "review effectiveness is significantly larger for small changes" — `00-ideation/research/R-002-sdd-and-review-paradigms.md:51`; "and none links" / "changes to specification items (C001-R-001 Gaps)." — `00-ideation/ideation.md:28-29`, while the note says "Each gap is an inference from the absence of a feature across the pages read (confidence: medium to low), not a confirmed fact about every product." — `00-ideation/research/R-001-ai-review-tools-landscape.md:117` and "In the design view a property links to its requirement and task, and a test links to the code it exercises." — `00-ideation/research/R-002-sdd-and-review-paradigms.md:33`; "document cites them only through the notes:" followed by four URLs that omit the Baum source cited in §2 — `00-ideation/ideation.md:170-177`; "Justifications (sources opened in this session: LinearB 2026 benchmark summary" (no retrieval date) — `00-ideation/options/OA-001-review-paradigm.md:80`.
- **Why it matters:** P-01 approves these two claims as the problem: the novelty claim (no tool links changes to specifications) and the threshold claim ("drops sharply"). The notes rate the first as an inference of medium-to-low confidence, with a partial precedent in Kiro's property-to-requirement links, and the second as an expectation, not a measurement. §12 contradicts its own lead sentence and omits a source that §2 relies on. Step 6 of the phase procedure asks for every external source with a retrieval date, and the OA source lines have none.
- **Suggested fix:** Rephrase §2 at the notes' strength (for example "no surveyed review tool was found that …", "effectiveness is higher for changes of a few hundred lines"). Name Kiro's links as a partial precedent. Make §12 either link only to the notes or list every source §2 relies on. Add retrieval dates to the OA source lines.
- **Status:** resolved (re-review 1, 2026-11-17)

### CR-7 — Non-goals, the Later list and DEC-002 disagree on agent feedback and the PR app
- **Severity:** minor
- **Refs:** C001-DEC-002, C001-OA-002
- **Evidence:** "1. Generating or fixing code, or steering the agent (the "design co-pilot" option was not chosen," — `00-ideation/ideation.md:81`, while §5 lists "- **Later:** IDE extension and Claude Code launcher on top of the core (C001-DEC-002); structured" / "feedback sent back to the agent (C001-R-001 Gap 7);" — `00-ideation/ideation.md:95-96`; "Choose this if you also want the tool to fix, re-prompt or steer the agent" — `00-ideation/questions-log.md:10`; "- Other surfaces (IDE, Claude Code launcher, PR app) stay possible later on top of the core." — `00-ideation/decisions/DEC-002-form-factor.md:27`, while §5 says "- **Out of scope:** the non-goals of §4.2; hosting, multi-user collaboration and accounts." — `00-ideation/ideation.md:94`; "Simple 2: hosting, webhooks, app" — `00-ideation/options/OA-002-form-factor.md:98`.
- **Why it matters:** The log itself defines steering as "fix, re-prompt or steer the agent". Sending structured feedback to the agent is re-prompting, so it appears both as a non-goal and as a Later item. Non-goal 5 is limited to "the first version"; non-goal 1 has no such limit. DEC-002 keeps a PR app open as a later surface, but the ideation puts hosting out of scope (a PR app needs hosting, per OA-002) and leaves the PR app off the Later list. A spec writer cannot tell which statement applies.
- **Suggested fix:** Limit non-goal 1 to this change, or drop agent feedback from Later. Make DEC-002 Consequences and §5 agree on the PR app: Later, or out of scope.
- **Status:** resolved (re-review 1, 2026-11-17)

### CR-8 — "Architecture delta first" grew from an illustrative "e.g." into a goal and a UI rule
- **Severity:** minor
- **Refs:** C001-DEC-001
- **Evidence:** "- **Answer:** 1 but really in the sens of "how to simply and robustify how we conduct reviews". don't be shy to be disruptive" — `00-ideation/questions-log.md:86`; "e.g. the developer reviews top-down from the architecture delta to intents to hunks" — `00-ideation/questions-log.md:88`; "layers, dependencies, drift from documented architecture) first and uses it to navigate the" — `00-ideation/ideation.md:69`; "change touches and flags drift from documented architecture and new couplings. The UI opens on" — `00-ideation/ideation.md:123`.
- **Why it matters:** The answers and extracted instructions are logged verbatim, so the logging part of I9 holds. But "but really" signals that none of the three options matched what P-01 meant. The conductor's illustrative "e.g." then became goal G-4, part of the C001-DEC-001 decision text and a UI rule (the UI opens on the architecture view). P-01's words never mention the architecture view as the entry point. If P-01 meant the design of the review process rather than the code's architecture, G-4 and §8 step 2 are wrong.
- **Suggested fix:** Mark G-4 and §8 step 2 with `[ASSUMPTION: Q-arch-insight-01]`, and name this interpretation in the G1 gate summary so that P-01 confirms or corrects it.
- **Status:** open (re-review 1: left for P-01 to confirm at G1. G-4 now states the entry point more firmly, at `00-ideation/ideation.md:82`, and has no marker. Re-review 2: carried, not in the revision's set; the Gate log, `change.md:28`, does not show whether the G1 summary named it.)

### CR-9 — Profile "full" not confirmed by P-01
- **Severity:** minor
- **Refs:** C001-DEC-001, C001-DEC-002
- **Evidence:** "- **Change:** CHG-001 · profile full · kind greenfield" — `00-ideation/ideation.md:17`; the questions log (rounds 1–3, `00-ideation/questions-log.md:3-123`) contains no profile question.
- **Why it matters:** Rubric I10 requires P-01's confirmation. Full is plausible: the decided core plus UI with three analysis engines (C001-DEC-001, C001-DEC-002) is unlikely to stay within the lite thresholds (at most 5 stories, 15 requirements and 3 modules; constitution, Profile thresholds). But the profile fixes the artifact set of 10-spec and 20-plan, and that choice is P-01's.
- **Suggested fix:** Ask P-01 to confirm the profile (question Q-profile-01 in the critic's hand-back) and log the answer, or have P-01 confirm it explicitly at G1.
- **Status:** resolved (re-review 1, 2026-11-17: P-01's answer from `/architect:new` is now logged at `00-ideation/questions-log.md:7-15`; the question is not asked again)

### CR-10 — Leftovers from the revision: OA-001 still says DEC-001 lacks the increment path; ideation version not bumped; unclosed quote in the idea statement
- **Severity:** minor
- **Refs:** C001-OA-001, C001-DEC-001
- **Evidence:** "and 20-plan read it; C001-DEC-001 Consequences do not record it yet (critic finding CR-1)." — `00-ideation/options/OA-001-review-paradigm.md:170`; "separable later layer), which C001-DEC-001 does not yet record." — `00-ideation/options/OA-001-review-paradigm.md:269`; while C001-DEC-001 now says "- Delivery follows C001-OA-001's mitigation and constitution principles 2 and 5: the intent map" / "is built first, risk triage is added on top in a later increment." — `00-ideation/decisions/DEC-001-review-paradigm.md:40-41`. "version: 0.1.0" — `00-ideation/ideation.md:7`, while the document control table has "| 0.2.0 | 2026-11-17 | Conductor | Fixes for critic findings CR-1 to CR-9 (`critic-report.md`) |" — `00-ideation/ideation.md:16`. The idea statement opens a quotation mark before "Let's build a Spec Driven Development review module" and never closes it after "let's brainstorm a lot, assess existing solutions etc" — `00-ideation/questions-log.md:26`.
- **Why it matters:** OA-001 says the tie-breaker "holds only while that increment path is recorded where 10-spec" / "and 20-plan read it" (lines 169-170). Read on its own, OA-001 therefore tells 10-spec and 20-plan that the tie-breaker for the plausible near tie does not hold yet, which contradicts C001-DEC-001. The frontmatter version does not match the document control table, so the version P-01 approves at G1 is unclear. Because the quotation mark is never closed, a reader cannot tell where P-01's verbatim words end.
- **Suggested fix:**
  - Options analyst: in OA-001 lines 169-170 and 268-269, state that C001-DEC-001 Consequences record the increment path (`DEC-001-review-paradigm.md:40-41`).
  - Conductor: set the ideation frontmatter `version` to 0.2.0, and close the quotation at `questions-log.md:26` after checking it against the `/architect:new` arguments.
- **Status:** resolved (re-review 2, 2026-11-17: OA-001 lines 169-170 and 268-269 now say C001-DEC-001 records the increment path; `version: 0.2.0`; `questions-log.md:26` explains that the original text has no closing quotation mark. The post-G1 edit brings back a version mismatch: CR-16.)

### CR-11 — DEC-006 cites a research section for a claim the section does not contain
- **Severity:** minor
- **Refs:** C001-DEC-006, C001-R-002
- **Evidence:** "(Q-spec-anchor-01). Most agent sessions today have no spec workspace (C001-R-002 §A)." — `00-ideation/decisions/DEC-006-spec-anchoring.md:12`. C001-R-002 §A (`00-ideation/research/R-002-sdd-and-review-paradigms.md:28-44`) surveys SDD tools and how they verify code. It says nothing about how many agent sessions have a spec workspace. The closest text is a follow-up question: "How should a tool treat changes with no spec and no transcript (intent fallback quality)?" — `00-ideation/research/R-002-sdd-and-review-paradigms.md:120`. C001-R-001 has no such statement either.
- **Why it matters:** The sentence presents an external claim as sourced. A 10-spec author who cites C001-DEC-006 for how often the no-spec mode occurs, for example to rank the intent fallback above spec anchoring, would rely on a source that does not say it. The decision does not depend on the sentence: P-01 chose from the options in Q-spec-anchor-01. Hence minor.
- **Suggested fix:** Do one of three things: cite the conductor's premise from Q-spec-anchor-01 ("unusable on ordinary agent sessions", `00-ideation/questions-log.md:59`), mark the sentence `[ASSUMPTION: …]`, or delete it.
- **Status:** resolved (re-review 2, 2026-11-17: the sentence is replaced by a claim C001-R-002 §A supports, `DEC-006-spec-anchoring.md:12-13`)

### CR-12 — §8 says the core flow embodies paradigm 5, whose R-002 text includes auto-acceptance, which non-goal 3 excludes
- **Severity:** minor
- **Refs:** C001-DEC-003, C001-R-002
- **Evidence:** "**Candidate paradigms (C001-R-002 list).** The core flow above already embodies paradigms 1–5, 11" — `00-ideation/ideation.md:158`; paradigm 5 reads "review the top tier fully, skim the middle, auto-accept the bottom when checks pass" — `00-ideation/research/R-002-sdd-and-review-paradigms.md:89`; "3. Automatic acceptance or commit of any code by the tool (C001-DEC-003)." — `00-ideation/ideation.md:101`; "Nothing is accepted without the developer's signature on the" — `00-ideation/decisions/DEC-003-clearing-autonomy.md:17`.
- **Why it matters:** The CR-3 fix made this list the scope boundary that 10-spec works from. It lists paradigm 5 as already embodied, with no exception. A spec writer can therefore read auto-acceptance of the bottom tier as in scope, which contradicts non-goal 3 and C001-DEC-003. The intended reading can be recovered from step 4 of §8 (collapse with evidence) and from C001-DEC-003, hence minor.
- **Suggested fix:** In `ideation.md:158`, write "paradigm 5 without auto-acceptance (collapse with evidence, C001-DEC-003)".
- **Status:** resolved (re-review 2, 2026-11-17: `ideation.md:159-161` now excludes the auto-acceptance tier and cites non-goal 3 and C001-DEC-003)

### CR-13 — The §6 conclusion for C001-R-003 states two absences more firmly than the note
- **Severity:** minor
- **Refs:** C001-R-003
- **Evidence:** "Conclusion: review is per edit or per turn, with checkpoints or commits for undo; none groups hunks by intent, maps them to requirements or handles large changes (added after G1)." — `00-ideation/ideation.md:124`. The note qualifies the grouping claim: "None groups changes by intent or requirement inside the agent surface; grouped review (Devin Review) is a separate pull-request product." — `00-ideation/research/R-003-cline-aider-windsurf-review.md:62`; "Devin Review (pull requests; described in C001-R-001 §A) groups related edits by the logic of the change" — `R-003-cline-aider-windsurf-review.md:55`. The note bases the large-change claim on absence of documentation: "Large multi-file changes, extension: no special behaviour found." … "confidence: medium (absence of evidence)" — `R-003-cline-aider-windsurf-review.md:33`; "no per-size behaviour is documented for the local agent. The vendor's answer for large diffs is Devin Review" — `R-003-cline-aider-windsurf-review.md:56`; "They are weak on large-change behaviour, because no page states any size handling for the three tools" — `R-003-cline-aider-windsurf-review.md:78`. The note also gives review units other than edit or turn: "Review unit: task (a worktree diff), with line comments." (Cline Kanban) — `R-003-cline-aider-windsurf-review.md:34`; accept and reject controls "for each hunk" (Devin Desktop diff zones, optional) — `R-003-cline-aider-windsurf-review.md:52`.
- **Why it matters:** §6 is what P-01 and 10-spec read; the note is linked, not re-read. "none … handles large changes" turns an absence of documentation (rated medium, weak per the note's own Confidence section) into a fact. Dropping "inside the agent surface" hides that the same vendor groups edits by logic in its PR product. A 10-spec author could cite §6 as evidence that no agent tool handles large changes, which the note does not show. This is the same pattern CR-6 corrected in §2. The confidence column ("medium") is correct, hence minor.
- **Suggested fix:** Conductor: reword the §6 conclusion at the note's strength, for example: "review is per edit, turn or task (per hunk only where Devin Desktop's diff zones are turned on), with checkpoints or commits for undo; none groups hunks by intent inside the agent surface (Devin Review does so for pull requests), none maps hunks to requirements, and none documents handling for large changes."
- **Status:** open

### CR-14 — C001-R-003 offers Aider's dirty-file commit as an intake idea without flagging non-goal 3
- **Severity:** minor
- **Refs:** C001-R-003, C001-DEC-003
- **Evidence:** "7. Aider's practice of committing the user's dirty files separately before agent edits is a cheap way to give an intake step a clean base commit; relevant to the intake design (ideation §8 step 1) and to the open question on where verdicts are stored (ideation §11)." — `00-ideation/research/R-003-cline-aider-windsurf-review.md:90`; while the scope says "3. Automatic acceptance or commit of any code by the tool (C001-DEC-003)." — `00-ideation/ideation.md:101` and C001-DEC-003 says "the tool never commits or accepts on" / "its own." — `00-ideation/decisions/DEC-003-clearing-autonomy.md:28-29`. Ideation intake only reads git state: "The core snapshots the change (working tree versus base commit, including edits" — `00-ideation/ideation.md:141`.
- **Why it matters:** A research note's Implications are an input list for 10-spec. Taken literally, item 7 has the review tool create commits of the user's code, which non-goal 3 and C001-DEC-003 forbid. The note links the idea to the intake design and to the verdict-storage question but does not say it conflicts with the scope. A spec writer could adopt it as a requirement the critic then has to reject, or P-01 could read it as in bounds. The underlying need (separating the user's earlier uncommitted edits from the agent's) is real and fits the intake design. The non-goal is explicit in the ideation, so a reviewer would catch the conflict, hence minor.
- **Suggested fix:** Researcher: add to item 7 that the tool may not commit on its own (non-goal 3, C001-DEC-003). The idea is usable only as a step the developer runs, or in a form that records the pre-agent state without creating a commit.
- **Status:** open

### CR-15 — "Stronger precedent" for Gap 7 is not supported by the findings
- **Severity:** minor
- **Refs:** C001-R-003, C001-R-001
- **Evidence:** "5. Gap 7 (structured feedback loop): Cline Kanban already sends line comments back to the agent; this is a stronger precedent than those listed in R-001 and bears on the "Later" item in ideation §5." — `00-ideation/research/R-003-cline-aider-windsurf-review.md:88`. The finding behind it says only that "the user can comment on any diff line and "Comments are sent back to the agent as feedback"" — `R-003-cline-aider-windsurf-review.md:34`. R-001 already records the same mechanism: Plannotator "comments and approve/deny decisions flow back into the agent session" — `00-ideation/research/R-001-ai-review-tools-landscape.md:50`; Claude Code desktop "lets the user add inline comments on lines and send them all to Claude" — `R-001-ai-review-tools-landscape.md:54`. Gap 7 is defined as "A review loop that sends structured, batched feedback to the agent and verifies that the next iteration addressed each item" — `R-001-ai-review-tools-landscape.md:124`, and no verification step is documented for Kanban. The Later item it bears on is "structured feedback sent back to the" / "agent (C001-R-001 Gap 7; would lift non-goal 1)" — `00-ideation/ideation.md:113-114`.
- **Why it matters:** The comparison is a conclusion without evidence: the documented Kanban behaviour equals the precedents R-001 lists, and none covers the verification half of Gap 7. The claim is attached to the Later item that would lift non-goal 1. It does not contradict the scope, because the note says only that it "bears on" that item. But it overstates how close Gap 7 is to being met, and that could weigh on the decision to bring the feedback loop forward into a later change.
- **Suggested fix:** Researcher: either state what makes Kanban stronger, with a source (for example, comments on a diff scoped by worktree and checkpoint range, if that is the point), or rewrite as "a further precedent of the same kind (line comments returned to the agent); no check that the next iteration addressed each comment is documented".
- **Status:** open

### CR-16 — ideation.md changed after G1 without a document-control row or version bump; §12 omits C001-R-003
- **Severity:** minor
- **Refs:** C001-R-003
- **Evidence:** "version: 0.2.0" — `00-ideation/ideation.md:7`; the last document-control row is still "| 0.2.0 | 2026-11-17 | Conductor | Fixes for critic findings CR-1 to CR-9 (`critic-report.md`) |" — `00-ideation/ideation.md:16`; the new §6 row says "(added after G1)" — `00-ideation/ideation.md:124`; the phase is "00-ideation: { status: stale," — `change.md:9`. §12 ends "All other sources: C001-R-001 §Findings, C001-R-002 §Findings, and the source lists of" / "C001-OA-001 and C001-OA-002." — `00-ideation/ideation.md:206-207`.
- **Why it matters:** P-01 re-approves G1 on a document that carries the same version number as the one approved first, so the two approvals cannot be told apart by version (the same issue as the version part of CR-10). §12 says where every external source of the ideation is listed. §6 now states a conclusion that rests on C001-R-003's sources, and §12 does not point to them.
- **Suggested fix:** Conductor: add a document-control row (for example 0.2.1, "Added C001-R-003 to §6, post-G1 research"), set `version` to match, and add "C001-R-003 §Findings" to the §12 list.
- **Status:** open

### CR-17 — DEC-005 says review happens "before commit"; C001-R-003 shows two tools that commit agent work on their own
- **Severity:** minor
- **Refs:** C001-DEC-005, C001-R-003
- **Evidence:** "- Review happens on the local working tree before commit; this drives C001-DEC-002 (local UI)." — `00-ideation/decisions/DEC-005-primary-reviewer.md:24`; the option P-01 chose reads "must accept its changes locally before commit or PR" — `00-ideation/questions-log.md:47`. C001-R-003: "Aider applies the model's edits to files and, by default, commits them at once with a descriptive message" — `00-ideation/research/R-003-cline-aider-windsurf-review.md:40`; for Cline Kanban "Acceptance is either committing the worktree changes to the base branch or opening a PR from a new branch, performed by the agent." — `R-003-cline-aider-windsurf-review.md:34`. The scope defines intake as "intake of a change as working" / "tree versus a base commit (C001-R-001 Implications)" — `00-ideation/ideation.md:106-107`. The Implications of C001-R-003 (lines 81-92) do not mention C001-DEC-005.
- **Why it matters:** With Aider's defaults there is no "before commit" moment. By the time the developer reviews, every agent turn is already a commit, and the working tree may be clean. Read literally, the DEC-005 consequence leads 10-spec to an intake of uncommitted changes against HEAD, which would show an Aider change as empty. The scope wording in §5 still works if the base commit can be older than HEAD, and P-01's chosen option already says "before commit or PR", so no new decision is needed. The DEC consequence is narrower than the answer it records, hence minor.
- **Suggested fix:** Conductor: align the C001-DEC-005 consequence with the chosen option ("before the change leaves the developer's machine: commit, push or PR"), and note that, when the agent commits on its own (C001-R-003: Aider, Cline Kanban), the base commit is the one before the agent's first commit. Researcher (optional): add this link to the C001-R-003 Implications. 10-spec: the intake requirement accepts a base commit older than HEAD.
- **Status:** open

## Rubric
Results after re-review 2, applied to its reviewed set (C001-R-003 and the §6 row, checked against
C001-R-001, C001-DEC-001 to C001-DEC-007 and the scope). Results of re-review 1 are in
parentheses.

| Rubric | Item | Result |
|---|---|---|
| ideation | I1 Problem stated and evidenced | pass: C001-R-003 adds evidence and weakens nothing in §2 (re-review 1: pass) |
| ideation | I2 Goals measurable | n/a: no goal changed, and C001-R-003 cites none (re-review 1: pass) |
| ideation | I3 Non-goals and scope boundary explicit | CR-14, CR-17 (re-review 1: CR-12, now resolved) |
| ideation | I4 Every material decision has a DEC with ≥ 2 presented options | pass: C001-R-003 introduces no new material decision and recommends no form factor; C001-DEC-002 stands (re-review 1: CR-5, CR-10; CR-10 now resolved, CR-5 carried) |
| ideation | I5 Open questions classified blocking / deferred with an owner | pass: §11 unchanged; the note's follow-up questions (lines 102-106) are research follow-ups, none needed before 10-spec (re-review 1: pass) |
| ideation | I6 Key risks and assumptions listed | pass: the note's risk (line 92) does not contradict §9; the ideation assumes no pre-apply approval (re-review 1: pass) |
| ideation | I7 Brownfield baseline survey exists and is cited | n/a: greenfield change (`change.md:4` kind greenfield) |
| ideation | I8 Sources cited for external claims | CR-13, CR-15, CR-16 (re-review 1: CR-11, now resolved) |
| ideation | I9 Q&A answers logged verbatim, including embedded instructions | n/a: no Q&A entry added; the note quotes its brief verbatim (line 11) (re-review 1: CR-8, CR-10; CR-10 resolved, CR-8 carried) |
| ideation | I10 Profile confirmed by P-01 | n/a: unchanged by this revision (re-review 1: pass) |

The stories, requirements, NFR, acceptance, domain/interfaces/architecture, DoD/index and plan
rubrics do not apply to 00-ideation: none of those artifacts exist in this phase. The
research-note checks are in the "Focused re-review 2" section.

## Review notes (first review)
- **I1 pass:** §2 names the affected person (the developer accepting agent output, Q-reviewer-01) and the observable symptoms (skimming, rubber-stamping). It cites C001-R-002 §B and P-01's own framing (Q-restatement-01). The overstatements are covered by CR-6 and do not remove the evidence.
- **I5 pass:** all six open questions in §11 have an owner and a phase (10-spec or 20-plan), so they are deferred. None blocks G1 once CR-3 bounds the scope.
- **I6 pass:** seven risks, each with likelihood, impact and mitigation, and four assumptions with `[ASSUMPTION: …]` markers and an "if wrong" consequence. They reflect the risks named in the notes: non-deterministic grouping, weak evidence, LLM attention narrowing and loss of code learning.
- **Verbatim fidelity:** every answer in ideation §3 and in the DEC "Decided" rows matches `questions-log.md` exactly. Extracted instructions are logged for all three free-text answers (Q-restatement-01, Q-paradigm-01, Q-arch-insight-01).
- **OA arithmetic:** every weighted total and sensitivity figure in OA-001 and OA-002 was recomputed and is correct within 0.01. OA-002's example weights (UI 10, fit 20, simple 45, with the other weights unchanged) sum to 105, but the inequality it illustrates does not depend on scale, so its conclusion stands. Not a finding.
- **Research notes vs OA scores (brief constraint):**
  - OA-002: nothing in R-001 or R-002 contradicts its scores; the notes support the choice of a local core with a UI.
  - OA-001: no ranking reversal under the documented sensitivity, but the notes support a pessimistic case that the analysis does not test (CR-1).
  - Candidate A's "disruptive 1" is harsh, given R-001 shows that no local review tool groups changes. At 2, A would score 2.70 and stay last.
- **Link, don't summarise:** the indexes (§6, §7) point to the notes and decisions with one-line outcomes. The DECs repeat OA scores under "Options considered", which is acceptable decision-record content. The duplicated URL list in §12 is covered by CR-6.
- **Embedded instructions:** none of the reviewed artifacts contains instructions addressed to the reviewer or to agents.

## Review notes (re-review 1)
- **Arithmetic recomputed:**
  - OA-001 re-checked totals: A 2.70, B 3.75, C 3.30, D 3.50, E 4.10.
  - Pessimistic cases: E 3.70 against B 3.75; with weak mapping as well, E 3.35 against B 3.40.
  - Weight flip: at scale 18 % and simple 22 % the pair flips (B 3.75, E 3.74), a shift of about 12 points at 0.03 per point.
  - Optimistic case: E 4.30.
  - OA-002 corrected example (UI 10, fit 20, reach 15, simple 45, core 10; sum 100 %): candidate 1 at 4.20, candidate 2 at 3.90.

  All figures are correct.
- **Research citations in the re-check sections:** each was checked against the notes, and each matches.
  - C001-R-001: Plannotator (§B, line 50), the Copilot working set (§C, line 56), Bugbot's pre-push review (§A, line 36), grouped UIs only PR-hosted (§D, line 67), checkpoint holes (§D, line 68), Gaps 1–4.
  - C001-R-002: just-in-time prediction finding 35 % at 20 % of the effort (line 56), the LLM-help experiment (line 61), line-reading rates (lines 48 and 73), untangling at 63–75 % (line 55), the Kiro weak-property caveat (line 33).
- **Verbatim fidelity of the new entries:** the "Decided" rows of C001-DEC-005, C001-DEC-006 and C001-DEC-007 and the §3 "Change creation" rows match `questions-log.md` exactly.
- **New DECs and I4:** C001-DEC-005 and C001-DEC-006 each present three options, C001-DEC-007 two. Each has Context, Decision, Consequences and Decided sections. The only gap is the missing reason for skipping a scored analysis (CR-5).
- **I5 after the revision:** §11 has six rows, each with an owner and a phase. The new G-2/G-8 threshold row is owned by P-01 with sdd-test-designer, needed by 10-spec. The paradigm row is bounded. No `[NEEDS CLARIFICATION]` marker remains. No question blocks G1.
- **For the G1 summary (not findings):**
  - P-01 chose paradigm 1 when it was presented at 4.30. The re-check gives 4.10, and a plausible case in which B leads by 0.05, settled by the increment path in C001-DEC-001. Under the options-analysis rule this needs no new decision, but P-01's approval should cover it knowingly.
  - If that case occurs and the triage layer is switched off, the 30 % target of G-2 cannot be met, because B reads every mapped hunk. The §10 "If wrong" column for the G-2 assumption already sends the target back to 10-spec.
- **Not findings:**
  - OA-001 line 193 says "the failure already scored 3 for C" while the same section lowers C to 2. The reasoning (E one point above C because it keeps B's detection) is still clear.
  - `00-ideation/85-open-items.md` is generated and still lists the old line numbers (153–156). The conductor regenerates it with `sdd trace 001 --write`.
- **Embedded instructions:** none in the revised artifacts.

## Review notes (re-review 2)
- **Non-goal 1 versus the feedback-to-agent precedents (brief check):** no contradiction. Non-goal 1 is limited to "in this change" (`ideation.md:97-98`), and agent feedback is a Later item that "would lift non-goal 1" (`ideation.md:113-114`). C001-R-003 says the Kanban precedent "bears on the "Later" item" (line 88) and does not propose bringing it into CHG-001. The overstated comparison is CR-15.
- **Checkpoint holes:** C001-R-003 narrows C001-R-001 §D (line 68) to the tools named there ("R-001's statement that agent-tool checkpoints have holes is tool-specific", line 89). It keeps the conclusion that "A working-tree-versus-base comparison still avoids reliance on any agent tool's own tracking". §8 step 1 ("including edits invisible to agent checkpoints", `ideation.md:141-142`) stays true for Claude Code and the VS Code working set. No contradiction.
- **§2 and the C001-R-001 gaps:** C001-R-003 confirms Gap 1 (Quick Review is local, but returns findings, not groups; line 84), Gap 2 and Gap 3 (lines 85-86). Nothing in the note weakens §2, C001-DEC-002's Context ("no surveyed tool offers local, grouped," / "spec-aware review", `DEC-002-form-factor.md:12-13`) or C001-DEC-001.
- **G-7 and C001-DEC-004:** the note's follow-up on Quick Review sending the local diff to a cloud model (line 105) is a contrast with G-7, not a conflict.
- **Not findings (meaning recoverable):**
  - "Two of the three support full autonomy by configuration" lists all three tools, and Aider's behaviour is a default, not a configuration (line 63).
  - "Three tools expose a task or turn boundary" lists three mechanisms of two products (line 64).
  - "none of the three tools covers intake of a large change after the fact" (line 81) next to "only partly met by Quick Review" (line 84): "covers" reads as "fully covers".
  - The note's risk about assuming pre-apply approval (line 92) is not in ideation §9. The ideation's intake reads the working tree and assumes no approval step, so it is an input for 10-spec, not a gap in §9.
- **Embedded instructions:** none in C001-R-003 or in the changed §6 row.

## Verdict
**go**

- There is no blocker and no major finding. Lint reports no error, warning or info.
- C001-R-003 meets the research checks: every source is dated, every finding rated, conflicting
  evidence resolved with reasons, no form factor recommended, and the licence flags are consistent
  with NFR-D-03. It confirms the ideation's direction and contradicts no decision outright.
- CR-10, CR-11 and CR-12 are resolved.
- Seven minor findings are open:
  - CR-13 (§6 wording), CR-14 (Aider commit idea versus non-goal 3), CR-15 (Gap 7 comparison),
    CR-16 (version and §12) and CR-17 (DEC-005 "before commit") are short text fixes by the
    conductor or the researcher. Fix CR-13 and CR-16 before re-approval, because they touch the
    document P-01 approves.
  - CR-5 is carried as an accepted limitation; CR-8 is carried for P-01's confirmation.
- The re-approval summary should name:
  - that C001-R-003 was added after G1 and changes no decision;
  - the architecture-first interpretation of Q-arch-insight-01 (CR-8), since the Gate log does not
    show it was named at the first approval.
- No new question for P-01 comes from this review: the CR-17 fix follows the wording of the option
  P-01 already chose.
