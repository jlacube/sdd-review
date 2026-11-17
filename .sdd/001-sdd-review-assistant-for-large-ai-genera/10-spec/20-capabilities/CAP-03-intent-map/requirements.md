---
id: "C001-CAP-03"
artifact: spec/requirements
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Intent map"
---
# C001-CAP-03 — Requirements

Greenfield change: no requirement carries a Delta (`10-context/current-state.md`). Terms:
`40-domain/glossary-delta.md`. The neutral intermediate form of intents, hunks and evidence is
defined in `40-domain/` and `50-interfaces/` (later step).

## 1. Link signals
The link signals the requirements below refer to, strongest first. A spec item linked to an
intent is one the SDD workspace links to the intent's spec item (for example a task that
implements it, or an acceptance scenario of it).

| Link signal | Link confidence | Applies to |
|---|---|---|
| ID in a commit message: the message of a commit that added or deleted a changed line of the hunk names the intent's spec item ID or the ID of a spec item linked to it | high | intents taken from spec items |
| ID in code: the added lines of the hunk name the intent's spec item ID or the ID of a spec item linked to it (comment, test name, scenario tag) | high | intents taken from spec items |
| Task names the file: a task linked to the intent names the hunk's file path | medium | intents taken from spec items |
| Commit of origin: the commit from which the extracted intent was taken added or deleted a changed line of the hunk | medium | extracted intents taken from commits |
| Plan item names the file: the plan item from which the extracted intent was taken names the hunk's file path | medium | extracted intents taken from plan items |
| Model judgement: the model provider names the intent for the hunk | low | reviews with a model provider configured |
| Developer move: the developer moved the hunk under the intent | developer | every review |

All signals except model judgement and developer move are deterministic link signals. The link
confidence column uses the confidence scale, which model output shares (C001-REQ-811).

## 2. Intents and grouping

### C001-REQ-301 — Group every hunk exactly once
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL group every hunk of the snapshot under exactly one intent or under orphan code.
- **Rationale:** 100 % of hunks appear either under an intent or in the orphan-code list (C001-SC-03).
- **Stories:** C001-US-301, C001-US-302, C001-US-303
- **Priority:** Must
- **Acceptance:** C001-AC-301.1

### C001-REQ-302 — Take intents from the SDD change the developer names
- **Pattern:** event-driven
- **Statement:** WHEN the developer names an SDD change at intake, THE analysis core SHALL take the intents of the review from that SDD change.
- **Rationale:** specs when present (C001-DEC-006); the intents are those of one SDD change (C001-US-301 notes). A named SDD change that is not open in the snapshot: C001-REQ-326.
- **Stories:** C001-US-301
- **Priority:** Must
- **Acceptance:** C001-AC-302.1

### C001-REQ-303 — Take intents from the only open SDD change
- **Pattern:** complex
- **Statement:** WHILE the intent context holds exactly one open SDD change, WHEN the developer starts a review without naming an SDD change, THE analysis core SHALL take the intents of the review from that SDD change.
- **Rationale:** no setup in the common case of one change in implementation (C001-US-901 value).
- **Stories:** C001-US-301
- **Priority:** Must
- **Acceptance:** C001-AC-303.1

### C001-REQ-304 — Stop when more than one open SDD change qualifies
- **Pattern:** unwanted-behaviour
- **Statement:** IF the intent context holds more than one open SDD change and the developer named none at intake, THEN THE analysis core SHALL stop intake with a message that lists the open SDD changes.
- **Rationale:** guessing the SDD change would build the map on the wrong intents (`ideation.md` §9); constitution principle 4.
- **Stories:** C001-US-301
- **Priority:** Must
- **Acceptance:** C001-AC-304.1

### C001-REQ-326 — Stop when the named SDD change is not open in the snapshot
- **Pattern:** unwanted-behaviour
- **Statement:** IF the SDD change the developer names at intake is not an open SDD change of the SDD workspace in the snapshot, THEN THE analysis core SHALL stop intake with an error message that names the value given and lists the open SDD changes.
- **Rationale:** a mistyped or archived SDD change would otherwise give a review on no intents or on the wrong ones (`ideation.md` §9); constitution principle 4. How the value is matched: C001-IF-007 §6. Error ERR-SDD-002 (`50-interfaces/errors.md`).
- **Stories:** C001-US-301
- **Priority:** Must
- **Acceptance:** C001-AC-326.1

### C001-REQ-305 — Create one intent per requirement of the SDD change
- **Pattern:** optional-feature
- **Statement:** WHERE the intents of the review come from an SDD change, THE analysis core SHALL create one intent for each requirement of that SDD change.
- **Rationale:** Q-intent-unit-01 (requirements are the unit of verdict): a signature means that the specified outcome is met, and an unmet intent is an unmet requirement (C001-SC-03). The tasks and acceptance scenarios linked to a requirement feed the link signals of §1 and test-first reading (C001-REQ-501); C001-DEC-006.
- **Stories:** C001-US-301
- **Priority:** Must
- **Acceptance:** C001-AC-305.1

### C001-REQ-306 — Link each hunk by its strongest deterministic link signal
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL link each hunk that has a deterministic link signal to the intent that its strongest deterministic link signal of §1 points to.
- **Rationale:** without a model, mapping uses explicit links (C001-US-301 notes) and commit and task boundaries (C001-US-302 notes, C001-R-003 §D).
- **Stories:** C001-US-301, C001-US-302, C001-US-305
- **Priority:** Must
- **Acceptance:** C001-AC-306.1

### C001-REQ-307 — Show alternative intents when link signals tie
- **Pattern:** unwanted-behaviour
- **Statement:** IF the strongest link signals of a hunk point to more than one intent, THEN THE analysis core SHALL link the hunk to the first of those intents in source order and list the others as alternative intents of the hunk.
- **Rationale:** a wrong grouping must not silently hide a defect (`ideation.md` §9); the developer sees the alternatives and can move the hunk (C001-REQ-320).
- **Stories:** C001-US-305
- **Priority:** Should
- **Acceptance:** C001-AC-307.1

### C001-REQ-308 — Link the remaining hunks through the model provider
- **Pattern:** optional-feature
- **Statement:** WHERE a model provider is configured, THE analysis core SHALL link each hunk without a deterministic link signal to the intent that the model provider names for it, with link confidence low.
- **Rationale:** a model improves grouping (C001-DEC-004, `ideation.md` §8); deterministic signals first (`ideation.md` §9). A named intent that the review does not hold: C001-REQ-327.
- **Stories:** C001-US-301, C001-US-302
- **Priority:** Should
- **Acceptance:** C001-AC-308.1

### C001-REQ-327 — Ignore a model link to an intent the review does not hold
- **Pattern:** unwanted-behaviour
- **Statement:** IF the model provider names for a hunk an intent that the intent map of the snapshot does not hold, THEN THE analysis core SHALL leave that hunk without a model link and label its grouping as a reduced result.
- **Rationale:** a model link may only point to an intent of the review; an intent the model invents is unusable output for that hunk, which then falls under orphan code like any hunk without a link (C001-REQ-309). The other hunks of the same request keep their model links. Reduced results: C001-REQ-804; output format: C001-IF-011.
- **Stories:** C001-US-301, C001-US-302
- **Priority:** Should
- **Acceptance:** C001-AC-327.1

## 3. Orphan code and unmet intents

### C001-REQ-309 — Group unlinked hunks as orphan code
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL group under orphan code every hunk that has no link.
- **Rationale:** code that traces to no intent is flagged (C001-GOAL-03, C001-R-002 paradigm 3).
- **Stories:** C001-US-303
- **Priority:** Must
- **Acceptance:** C001-AC-309.1

### C001-REQ-310 — Show orphan code first
- **Pattern:** ubiquitous
- **Statement:** THE review UI SHALL show orphan code before the first intent of the intent map.
- **Rationale:** scope creep and unrequested changes get attention first (C001-US-303, `ideation.md` §8 step 3).
- **Stories:** C001-US-303
- **Priority:** Must
- **Acceptance:** C001-AC-310.1

### C001-REQ-311 — List unmet intents
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL list as unmet intent every intent under which no hunk of the change is grouped.
- **Rationale:** 100 % of intents with no hunk appear in the unmet-intent list (C001-SC-03); only code inside the change counts (C001-US-304 notes).
- **Stories:** C001-US-304
- **Priority:** Must
- **Acceptance:** C001-AC-311.1

### C001-REQ-312 — Show unmet intents after orphan code
- **Pattern:** ubiquitous
- **Statement:** THE review UI SHALL show the unmet intents after orphan code and before the other intents, which follow in source order.
- **Rationale:** what was asked but not done is seen before anything is accepted (C001-US-304).
- **Stories:** C001-US-304
- **Priority:** Must
- **Acceptance:** C001-AC-312.1

## 4. Intent fallback

### C001-REQ-313 — Extract one intent per commit in model-free mode
- **Pattern:** state-driven
- **Statement:** WHILE no SDD change applies and the review runs in model-free mode, THE analysis core SHALL create one extracted intent for each commit of the change, titled with the subject line of the commit message.
- **Rationale:** without a model, commit boundaries are the main intent signal (C001-US-302 notes, C001-R-003 §D); intent fallback (C001-DEC-006).
- **Stories:** C001-US-302
- **Priority:** Must
- **Acceptance:** C001-AC-313.1

### C001-REQ-314 — Extract one intent per plan item in model-free mode
- **Pattern:** state-driven
- **Statement:** WHILE no SDD change applies and the review runs in model-free mode, THE analysis core SHALL create one extracted intent for each plan item of a named agent plan, with plan items delimited by the plan-item rule for Markdown and plain-text files.
- **Rationale:** agent plan files are an intent source (C001-R-003 Implications 2, C001-DEC-006); uncommitted agent edits have no commit boundary. Plans are read as Markdown or plain text (Q-intent-sources-01, C001-REQ-112).
- **Stories:** C001-US-302
- **Priority:** Should
- **Acceptance:** C001-AC-314.1
- **Open items:** plan-item rule: C001-IF-007 §8.

### C001-REQ-315 — Extract intents through the model provider
- **Pattern:** complex
- **Statement:** WHERE a model provider is configured, WHILE no SDD change applies, THE analysis core SHALL create the extracted intents that the model provider finds in the commit messages, the pull-request text, the agent plan and the agent transcript, each marked as model output.
- **Rationale:** with a model, extraction improves (C001-DEC-004, C001-US-302 notes); model output is marked (C001-US-804).
- **Stories:** C001-US-302
- **Priority:** Should
- **Acceptance:** C001-AC-315.1

### C001-REQ-316 — Label the intent map as reduced in model-free mode
- **Pattern:** state-driven
- **Statement:** WHILE the review runs in model-free mode, THE review UI SHALL label the intent map as a reduced result that contains no model links.
- **Rationale:** reduced results are labelled (C001-CON-05, C001-US-801); no-spec mapping quality is an assumption [ASSUMPTION: C001-AS-04].
- **Stories:** C001-US-302
- **Priority:** Must
- **Acceptance:** C001-AC-316.1

## 5. What each intent and link shows

### C001-REQ-317 — Show the source of every intent
- **Pattern:** ubiquitous
- **Statement:** THE review assistant SHALL show for every intent its intent source.
- **Rationale:** each intent shows its source (C001-US-302); comparing the agent's account with the diff (C001-R-001 Gap 6).
- **Stories:** C001-US-301, C001-US-302
- **Priority:** Must
- **Acceptance:** C001-AC-317.1

### C001-REQ-318 — Show each intent's hunks with their evidence
- **Pattern:** ubiquitous
- **Statement:** THE review UI SHALL list under each intent the hunks grouped under it, in intent order, each with the evidence items attached to it.
- **Rationale:** 100 % of intents list their linked hunks and evidence (C001-SC-03); evidence comes from C001-CAP-04 and C001-CAP-05. Intent order: C001-REQ-502 and C001-REQ-403.
- **Stories:** C001-US-301, C001-US-302
- **Priority:** Must
- **Acceptance:** C001-AC-318.1

### C001-REQ-319 — Show the confidence and reason of every link
- **Pattern:** ubiquitous
- **Statement:** THE review assistant SHALL show the link confidence and the link reason of every link.
- **Rationale:** show mapping confidence so that a wrong grouping does not hide a defect (`ideation.md` §9, C001-R-002 Implications).
- **Stories:** C001-US-305
- **Priority:** Must
- **Acceptance:** C001-AC-319.1

### C001-REQ-328 — Flag the spec items that the change edits
- **Pattern:** event-driven
- **Statement:** WHEN a hunk of the change adds a line from which a spec item of the SDD change the intents come from is read in the snapshot, or deletes a line from which such a spec item is read at the base commit, THE review assistant SHALL show on the intent map a spec-edit flag that names the spec item, the hunk and whether the change adds, modifies or deletes the spec item.
- **Rationale:** the rule of Q-drift-01 applied to spec items (abuse case of C001-REQ-111): the spec items stay read from the snapshot (C001-IF-007 §1), so a spec-driven change can add its own requirements, and every edit of a spec item that judges the change is visible. The flag also shows a requirement the change deletes, which is then neither an intent nor an unmet intent (C001-REQ-305, C001-REQ-311). Lines read: C001-IF-007 §3.
- **Stories:** C001-US-301
- **Priority:** Must
- **Acceptance:** C001-AC-328.1

## 6. Corrections

### C001-REQ-320 — Move a hunk
- **Pattern:** event-driven
- **Statement:** WHEN the developer moves a hunk to an intent or to orphan code, THE analysis core SHALL group the hunk under that target, with link confidence developer when the target is an intent.
- **Rationale:** the developer has the last word on grouping (C001-US-306); the move belongs to the snapshot (C001-US-104).
- **Stories:** C001-US-306
- **Priority:** Should
- **Acceptance:** C001-AC-320.1

### C001-REQ-321 — Record hunk moves in the review record
- **Pattern:** event-driven
- **Statement:** WHEN the developer moves a hunk, THE analysis core SHALL record in the review record the hunk, its previous grouping, its new grouping and the time of the move.
- **Rationale:** the correction is kept in the review record (C001-US-306 notes, C001-US-705).
- **Stories:** C001-US-306
- **Priority:** Should
- **Acceptance:** C001-AC-321.1

## 7. Walkthrough

### C001-REQ-322 — Present an intent's walkthrough in intent order
- **Pattern:** event-driven
- **Statement:** WHEN the developer opens an intent as a walkthrough, THE review UI SHALL present the intent's hunks in intent order.
- **Rationale:** one reading order for every presentation of an intent: test hunks first (C001-REQ-502), then the keys of C001-REQ-403 (not cleared before cleared, risk, definitions before uses among equal risk). It keeps test-first reading (Q-extras-01, C001-R-002 paradigm 6), the risk triage of C001-DEC-001 and order by importance with mechanical changes last (paradigm 17); the dependency order of paradigm 11 orders hunks of equal risk. All of them counter file-position bias (C001-R-002 §B). The account that opens the walkthrough: C001-REQ-324.
- **Stories:** C001-US-307
- **Priority:** Should
- **Acceptance:** C001-AC-322.1

### C001-REQ-323 — Label walkthroughs that order hunks without definitions and uses
- **Pattern:** unwanted-behaviour
- **Statement:** IF a hunk of an intent lies in a file outside the deep ecosystems, THEN THE review UI SHALL label the walkthrough of that intent as a reduced result in which that hunk is ordered without the definition-before-use key of C001-REQ-403.
- **Rationale:** definitions and uses are known only from language-specific signals (Q-languages-01), so such a hunk is ordered among hunks of equal risk by file path and first changed line only; reduced results are labelled (C001-CON-05).
- **Stories:** C001-US-307
- **Priority:** Should
- **Acceptance:** C001-AC-323.1

### C001-REQ-324 — Open the walkthrough with a deterministic account
- **Pattern:** event-driven
- **Statement:** WHEN the developer opens an intent as a walkthrough, THE review UI SHALL show first an account of the intent that lists the files, and in the deep ecosystems the symbols, that the intent's hunks add, change and remove.
- **Rationale:** a short account of what the intent changes (C001-US-307), available without a model (C001-CON-05).
- **Stories:** C001-US-307
- **Priority:** Should
- **Acceptance:** C001-AC-324.1

### C001-REQ-325 — Add a model-written account
- **Pattern:** optional-feature
- **Statement:** WHERE a model provider is configured, THE review UI SHALL show with the deterministic account a model-written account of what the intent changes, marked as model output.
- **Rationale:** a model-written account is marked as model output (C001-US-307 notes, C001-US-804).
- **Stories:** C001-US-307
- **Priority:** Should
- **Acceptance:** C001-AC-325.1
