---
id: "C001-CAP-07"
artifact: spec/requirements
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Verdicts and review record"
---
# C001-CAP-07 — Requirements

### C001-REQ-701 — Record a sign verdict
- **Pattern:** event-driven
- **Statement:** WHEN the developer signs an intent, THE analysis core SHALL record a sign verdict on that intent in the review record, against the snapshot of the review.
- **Rationale:** C001-DEC-003 (verdict per intent, given by the developer); C001-SC-05.
- **Stories:** C001-US-701
- **Priority:** Must
- **Acceptance:** C001-AC-701.1

### C001-REQ-702 — Sign only on the developer's action on one intent
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL NOT record a sign verdict on an intent except as the result of a sign action of the developer that names that single intent.
- **Rationale:** C001-DEC-003 Consequences (the tool never accepts on its own); C001-US-701 (a deliberate act on one unit); C001-NG-03, C001-CON-04.
- **Stories:** C001-US-701
- **Priority:** Must
- **Acceptance:** C001-AC-702.1

### C001-REQ-703 — Confirm before signing an intent that still has open hunks
- **Pattern:** unwanted-behaviour
- **Statement:** IF the developer signs an intent that still has open hunks, THEN THE analysis core SHALL record the sign verdict only after the developer confirms a prompt that states the number of those open hunks and the number of their changed lines.
- **Rationale:** Q-signing-01 (confirm and record): the decision stays the developer's and fits the attention budget, which can leave open hunks unread (C001-US-605, C001-US-606). Open hunks are the hunks not cleared and not marked read (glossary). The review record keeps the unread share through the open share of the intent in the entry of C001-REQ-712. Without confirmation, no sign verdict is recorded.
- **Stories:** C001-US-701
- **Priority:** Must
- **Acceptance:** C001-AC-703.1

### C001-REQ-704 — Record a reject verdict with its reason
- **Pattern:** event-driven
- **Statement:** WHEN the developer rejects an intent with a non-empty reason, THE analysis core SHALL record a reject verdict on that intent in the review record, with the reason text.
- **Rationale:** C001-DEC-003; C001-US-702 (rejections are explained). Sending the reason to the agent is a later change (`ideation.md` §5).
- **Stories:** C001-US-702
- **Priority:** Must
- **Acceptance:** C001-AC-704.1

### C001-REQ-705 — Record a defer verdict with its note
- **Pattern:** event-driven
- **Statement:** WHEN the developer defers an intent with a non-empty note, THE analysis core SHALL record a defer verdict on that intent in the review record, with the note text.
- **Rationale:** C001-DEC-003; `ideation.md` §8 step 5. A deferred intent is neither signed nor rejected (C001-REQ-711).
- **Stories:** C001-US-703
- **Priority:** Must
- **Acceptance:** C001-AC-705.1

### C001-REQ-706 — Refuse a rejection or deferral without a reason
- **Pattern:** unwanted-behaviour
- **Statement:** IF the developer rejects an intent or a hunk of orphan code, defers an intent, or reports a defect, with a reason, note or defect text that is empty or contains only whitespace, THEN THE analysis core SHALL refuse the action with a message that the reason, note or text is required.
- **Rationale:** C001-US-702 (rejections are explained, not implicit); C001-US-703 (defer with a note). A defect report without text would leave the review record and the reopened hunks without the defect that explains them (C001-REQ-608, C001-REQ-617). Error ERR-ACT-001 (`50-interfaces/errors.md`).
- **Stories:** C001-US-702, C001-US-703, C001-US-704, C001-US-604
- **Priority:** Must
- **Acceptance:** C001-AC-706.1

### C001-REQ-707 — Leave the repository unchanged when a decision is recorded
- **Pattern:** event-driven
- **Statement:** WHEN the analysis core records a verdict or the rejection of a hunk of orphan code, THE analysis core SHALL leave the git index, the commits, the branches and the working-tree files of the repository unchanged, except for the review record.
- **Rationale:** C001-CON-04, C001-NG-03, C001-DEC-003 Consequences. Where the review record is stored is an architecture decision (`ideation.md` §11).
- **Stories:** C001-US-701, C001-US-702, C001-US-703, C001-US-704
- **Priority:** Must
- **Acceptance:** C001-AC-707.1

### C001-REQ-708 — Replace the current verdict of an intent
- **Pattern:** event-driven
- **Statement:** WHEN the developer gives a verdict on an intent that already has one, THE analysis core SHALL report the new verdict as the current verdict of that intent.
- **Rationale:** C001-US-703 (come back to a deferred intent). Earlier verdicts stay in the review record (C001-REQ-713).
- **Stories:** C001-US-703, C001-US-705
- **Priority:** Must
- **Acceptance:** C001-AC-708.1

### C001-REQ-709 — Name a new intent for orphan code
- **Pattern:** event-driven
- **Statement:** WHEN the developer creates an intent with a name for one or more hunks of orphan code, THE analysis core SHALL add that intent to the intent map with those hunks, with the developer as its source and no spec source.
- **Rationale:** C001-US-704 (a developer-named intent shows that it has no spec source); C001-DEC-003. Attaching a hunk to an existing intent is the mapping correction of C001-US-306. The new intent takes verdicts like any intent (C001-REQ-701, C001-REQ-704, C001-REQ-705). Unusable names: C001-REQ-719; hunks not in orphan code: C001-REQ-720.
- **Stories:** C001-US-704
- **Priority:** Must
- **Acceptance:** C001-AC-709.1

### C001-REQ-710 — Reject a hunk of orphan code
- **Pattern:** event-driven
- **Statement:** WHEN the developer rejects a hunk of orphan code with a non-empty reason, THE analysis core SHALL record the rejection of that hunk, with the reason text, in the review record.
- **Rationale:** C001-US-704; C001-GOAL-03 (no more than was asked). A hunk not in orphan code: C001-REQ-720.
- **Stories:** C001-US-704
- **Priority:** Must
- **Acceptance:** C001-AC-710.1

### C001-REQ-711 — Report the decision status of the review
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL report, for each review, the number of intents that are signed, rejected, deferred, stale and without a verdict, and the number of hunks of orphan code that are neither attached to an intent nor rejected.
- **Rationale:** C001-DEC-003 (no code reaches acceptance without a decision); C001-SC-05.
- **Stories:** C001-US-703, C001-US-704, C001-US-706
- **Priority:** Must
- **Acceptance:** C001-AC-711.1

### C001-REQ-712 — Content of a review record entry
- **Pattern:** event-driven
- **Statement:** WHEN the analysis core records a verdict, THE analysis core SHALL write a review record entry holding the snapshot identifier, the intent and its source, the verdict, the reason or note when one is given, the identifiers of the evidence records, evidence bundle runs and clearings of the intent's hunks, the read, cleared and open shares of the intent, the coverage statement of the review, the git user name and e-mail address configured for the repository, and the time in ISO 8601 format with UTC offset.
- **Rationale:** C001-US-705; C001-R-001 Gap 3 (durable verdict ledger); C001-SC-05 (verdicts recorded against their snapshot). Coverage statement: C001-US-606, C001-REQ-613. The open share of the intent is the unread share that a signature with open hunks keeps (Q-signing-01, C001-REQ-703). Actions refused while the git user name or e-mail address is missing: C001-REQ-721.
- **Stories:** C001-US-705, C001-US-606
- **Priority:** Must
- **Acceptance:** C001-AC-712.1

### C001-REQ-713 — Keep review record entries unaltered
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL keep every review record entry unaltered from the moment it is written, across review sessions.
- **Rationale:** C001-US-705 (see later what was accepted and on what basis); C001-R-001 Gap 3.
- **Stories:** C001-US-705
- **Priority:** Must
- **Acceptance:** C001-AC-713.1

### C001-REQ-714 — Read the review record without the UI
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL store the review record in a documented, machine-readable file format, defined in `50-interfaces/`, that a program can read without the local review UI.
- **Rationale:** C001-US-705 Context; C001-CON-03; headless output in C001-REQ-912.
- **Stories:** C001-US-705
- **Priority:** Must
- **Acceptance:** C001-AC-714.1

### C001-REQ-715 — Mark a verdict stale when its hunks change
- **Pattern:** event-driven
- **Statement:** WHEN the set of hunk content keys of the hunks grouped under an intent differs from the set recorded with the current verdict of the intent's intent key, THE analysis core SHALL mark that verdict as stale.
- **Rationale:** C001-R-001 Implications (anchor review state to a snapshot and flag staleness); `ideation.md` §9. The hunks change with a new snapshot (C001-US-104), a mapping correction (C001-US-306) or an attached hunk of orphan code (C001-US-704). Across snapshots, an intent is matched by its intent key and a hunk by its hunk content key (glossary; identity rules in `40-domain/domain-model.md` §3), so a hunk that only moves to other line numbers is unchanged.
- **Stories:** C001-US-706, C001-US-704
- **Priority:** Must
- **Acceptance:** C001-AC-715.1

### C001-REQ-716 — Mark a verdict stale when its evidence changes
- **Pattern:** event-driven
- **Statement:** WHEN an evidence record that the current verdict of an intent relied on changes its result, or a clearing that it relied on is withdrawn by escalation, THE analysis core SHALL mark that verdict as stale.
- **Rationale:** C001-US-706. Evidence re-runs: C001-US-503; escalation: C001-US-604.
- **Stories:** C001-US-706
- **Priority:** Must
- **Acceptance:** C001-AC-716.1

### C001-REQ-717 — Mark a verdict stale when its intent source changes
- **Pattern:** event-driven
- **Statement:** WHEN the source text of an intent (spec item, commit message, plan item, transcript passage or pull-request text) differs from the source text recorded with the current verdict of the intent's intent key, THE analysis core SHALL mark that verdict as stale.
- **Rationale:** C001-US-706; intent sources: C001-US-103. Intents are matched across snapshots by their intent key (glossary); texts are compared after the normalisation of C001-IF-007 §1. A developer-named intent has no source text.
- **Stories:** C001-US-706
- **Priority:** Must
- **Acceptance:** C001-AC-717.1

### C001-REQ-718 — Report a stale verdict with its causes
- **Pattern:** state-driven
- **Statement:** WHILE the current verdict of an intent is stale, THE analysis core SHALL report the intent as stale, with each cause of the staleness (hunks, evidence or source), instead of as signed, rejected or deferred.
- **Rationale:** C001-US-706 (never rely on a signature given on different code); C001-SC-05. Re-presenting only the changed units is a later change (`ideation.md` §5).
- **Stories:** C001-US-706
- **Priority:** Must
- **Acceptance:** C001-AC-718.1

### C001-REQ-719 — Refuse an empty or taken name for a new intent
- **Pattern:** unwanted-behaviour
- **Statement:** IF the developer creates an intent with a name that is empty, contains only whitespace, or equals the name of another developer-named intent of the review when both names are compared after whitespace collapsing and Unicode case folding, THEN THE analysis core SHALL refuse the action with a message that states why the name cannot be used.
- **Rationale:** a developer-named intent is identified across snapshots by its name (intent key, glossary), so a second intent of the same name in one review would merge with the first; hunks join an existing intent by a hunk move (C001-REQ-320). An intent without a name cannot be told apart in the map or the review record (C001-US-704). Names that differ only in case, such as "Add retry logging" and "add retry logging", look alike in the decision status and the review record, so the developer could attach hunks to, or sign, the wrong one; they are compared case-folded, as model-written titles are (identity rules: `40-domain/domain-model.md` §3), and each name is kept and shown as the developer typed it. Errors: ERR-ACT-001 for an empty name, ERR-ACT-009 for a name already used (`50-interfaces/errors.md`).
- **Stories:** C001-US-704
- **Priority:** Must
- **Acceptance:** C001-AC-719.1

### C001-REQ-720 — Refuse orphan-code decisions on a grouped hunk
- **Pattern:** unwanted-behaviour
- **Statement:** IF the developer rejects as orphan code, or creates an intent for, a hunk that is grouped under an intent, THEN THE analysis core SHALL refuse the action with a message that names the intent the hunk is grouped under.
- **Rationale:** rejecting a hunk and naming a new intent are decisions on orphan code (C001-US-704); a grouped hunk is decided through the verdict on its intent, and the developer can move it to orphan code first (C001-REQ-320). Error ERR-ACT-005 (`50-interfaces/errors.md`).
- **Stories:** C001-US-704
- **Priority:** Must
- **Acceptance:** C001-AC-720.1

### C001-REQ-721 — Refuse a recorded action without a git identity
- **Pattern:** unwanted-behaviour
- **Statement:** IF the git user name or the git user e-mail address of the repository is not set or is blank when the developer takes a recorded action (marking hunks read, reopening a hunk, moving a hunk, creating an intent, rejecting a hunk of orphan code, recording a test judgement, reporting a defect, stating a time budget or reading rate, adding or confirming an evidence-bundle command, or giving a verdict), THEN THE analysis core SHALL refuse the action, without writing a review record entry, with a message that names each missing git setting (`user.name`, `user.email`).
- **Rationale:** Q-identity-01 (refuse until set) and Q-identity-02 (refuse every recorded action): every review record entry stays attributable to a git identity (C001-REQ-712, C001-SC-05). The ten kinds of recorded action, in the order of the statement: C001-REQ-601, C001-REQ-422, C001-REQ-321, C001-REQ-709, C001-REQ-710, C001-REQ-503, C001-REQ-617, C001-REQ-610 and C001-REQ-611, C001-REQ-510 and C001-REQ-511, C001-REQ-701 with C001-REQ-704 and C001-REQ-705; the entries they write: C001-IF-009; the refusal: ERR-ACT-006 (`50-interfaces/errors.md`, C001-IF-003 §4). An escalation entry follows from a defect report and is refused with it. Running an evidence bundle writes no review record entry (its runs are analysis results) and is not refused. A blank value is empty or whitespace only (C001-IF-012 G-10). Headless analysis (C001-REQ-912) writes no review record entry and is not affected. The cost is one git configuration step on a fresh machine before the first action of a review.
- **Stories:** C001-US-705
- **Priority:** Must
- **Acceptance:** C001-AC-721.1

### C001-REQ-722 — Decide a rejected orphan hunk through its intent once grouped
- **Pattern:** event-driven
- **Statement:** WHEN the developer groups under an intent a hunk of orphan code whose rejection is recorded, by a hunk move or by creating an intent for it, THE analysis core SHALL report that hunk as decided by the current verdict of that intent and no longer as a rejected hunk of orphan code, keeping its rejection entry in the review record.
- **Rationale:** a rejection decides a hunk only while it is orphan code (C001-REQ-710); a grouped hunk is decided through the verdict on its intent (C001-REQ-720 rationale). Grouping changes the hunks of the intent, so a verdict already given on it goes stale (C001-REQ-715) and the developer decides again with the hunk included: code the developer rejected is accepted only through a later signature of the developer (C001-GOAL-05, C001-REQ-702). The rejection entry and the later entries stay in the review record (C001-REQ-713). Lifecycle: `40-domain/state-machines.md` §9.
- **Stories:** C001-US-704
- **Priority:** Must
- **Acceptance:** C001-AC-722.1
