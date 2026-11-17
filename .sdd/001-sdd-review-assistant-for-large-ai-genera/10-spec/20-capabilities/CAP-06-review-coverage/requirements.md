---
id: "C001-CAP-06"
artifact: spec/requirements
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Review coverage, sampling and attention budget"
---
# C001-CAP-06 — Requirements

Stories: `stories.md`. Systems and terms: `40-domain/glossary-delta.md`. Risk scores and clearing
rules come from C001-CAP-04; the review record is specified in C001-CAP-07.

## Read marks and shares

### C001-REQ-601 — Mark hunks as read
- **Pattern:** event-driven
- **Statement:** WHEN the developer marks a hunk, or all open hunks of an intent, as read, THE analysis core SHALL set each of those hunks to read for the snapshot.
- **Rationale:** C001-US-601; read marks belong to the snapshot (C001-US-104) and are kept across sessions (C001-US-906).
- **Stories:** C001-US-601
- **Priority:** Must
- **Acceptance:** C001-AC-601.1

### C001-REQ-602 — Compute the read, cleared and open shares
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL compute, for the whole change, for each intent, for the orphan code and for each component, the read, cleared and open shares as the changed lines of the read, cleared and open hunks of that scope divided by all changed lines of that scope, counting a read hunk as read whether or not it was cleared.
- **Rationale:** C001-GOAL-02; the measure behind C001-SC-02 (Q-g2-target-01), whose threshold is C001-NFR-005. Components come from the architecture delta (C001-CAP-02). Unread hunks of the sample: C001-REQ-605.
- **Stories:** C001-US-602
- **Priority:** Must
- **Acceptance:** C001-AC-602.1

### C001-REQ-603 — Show the shares throughout the review
- **Pattern:** state-driven
- **Statement:** WHILE a review is open, THE review UI SHALL show the read, cleared and open shares of the whole change, and those of each intent and component wherever that intent or component is listed.
- **Rationale:** C001-US-602 (always know how much of the change has had human eyes); `ideation.md` §8 step 4.
- **Stories:** C001-US-602
- **Priority:** Must
- **Acceptance:** C001-AC-603.1

## Sampling and escalation

### C001-REQ-604 — Keep a random sample of each rule's cleared hunks for reading
- **Pattern:** state-driven
- **Statement:** WHILE a clearing rule is not escalated in the snapshot and its sample population is not empty, THE analysis core SHALL keep for reading a sample of that population, drawn at random for each review, that holds 10 % of the population's hunks, rounded up to a whole hunk and so at least one hunk.
- **Rationale:** Q-sampling-01 (10 % per rule, at least one hunk per rule), chosen over the 20–33 % spot checking of the SmartBear material (C001-R-002 paradigm 15, §B) to leave room for the review-time target of C001-NFR-006. One sample per rule, so that every rule that cleared hunks is spot-checked and escalation acts per rule (C001-REQ-606). The sample population counts read hunks too, so reading the sample does not shrink it, and leaves out reopened hunks, which are read as open hunks anyway (glossary). Unread hunks of the sample are in the reading queue (glossary). Changes of the population during the review: C001-REQ-616; the sample holds more than 10 % only where C001-REQ-616 keeps read sampled hunks. An escalated rule (C001-REQ-606, C001-REQ-609) is outside this requirement: its sample keeps the sampled hunks still in its population and takes in no new hunk (C001-REQ-616, C001-INV-16), so its sample can hold fewer hunks than 10 % of its population, or none.
- **Stories:** C001-US-603
- **Priority:** Must
- **Acceptance:** C001-AC-604.1

### C001-REQ-605 — Count unread hunks of the sample in the shares
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL count a hunk of the sample in the cleared share of C001-REQ-602 until the developer marks it read.
- **Rationale:** C001-US-603 (how sampled hunks count in the shares is set here). A hunk of the sample still rests on evidence until it is read, which is the meaning of the cleared share (C001-US-602; open hunk and cleared share in `40-domain/glossary-delta.md`); C001-NFR-005 measures the open share before sampling. The reading load of the sample is reported by C001-REQ-612 and C001-REQ-614.
- **Stories:** C001-US-603, C001-US-602
- **Priority:** Must
- **Acceptance:** C001-AC-605.1

### C001-REQ-616 — Keep the sample stable when its population changes
- **Pattern:** event-driven
- **Statement:** WHEN the sample population of a clearing rule changes during a review, THE analysis core SHALL keep in the rule's sample every sampled hunk still in the population, adding hunks of the population only while the rule is not escalated and the sample holds fewer hunks than C001-REQ-604 sets, and removing unread sampled hunks only while it holds more.
- **Rationale:** the population grows when later clearings arrive (the passing-tests rule after the test run, C001-REQ-410) and shrinks when clearings are withdrawn (C001-REQ-411, C001-REQ-422, C001-REQ-606). Keeping the sampled hunks avoids a sample that changes under the developer's reading. A read sampled hunk is never removed while it is in the population; once its clearing is withdrawn it is no longer in the population and leaves the sample, keeping its read mark, which then counts in the read share (C001-TS-651). The sampled and read counts of C001-REQ-614 therefore refer to hunks the rule still clears. An escalated rule takes no new hunk into its sample (C001-REQ-609, C001-INV-16): the escalation reopened its unread hunks (C001-REQ-606), so a refill could only add hunks the developer had already read for other reasons, and the rule's sample results would change after the fact. Its sample keeps the sampled hunks still in its population, which are the read ones, even when that leaves the sample below the size C001-REQ-604 sets or empty. The order in which hunks enter and leave the sample follows the sample seed of the review (glossary), so it is random for each review and the same in every session of it (C001-REQ-918).
- **Stories:** C001-US-603
- **Priority:** Must
- **Acceptance:** C001-AC-616.1

### C001-REQ-606 — Reopen the hunks of a rule found defective
- **Pattern:** event-driven
- **Statement:** WHEN the developer reports a defect in a hunk that one or more clearing rules cleared in the snapshot, THE analysis core SHALL set open, for the rest of the review of the snapshot, every unread hunk of the snapshot that any of those rules cleared.
- **Rationale:** paradigm 15 (one confirmed defect escalates the class); C001-US-604 (one confirmed failure of a clearing rule removes trust in that rule for this change). The trigger covers a hunk of the sample and a cleared hunk the developer expanded or reopened outside the sample (C001-REQ-421, C001-REQ-422), since the rule failed either way. A defect in a hunk that no rule cleared escalates nothing; it is recorded as a defect report alone (C001-REQ-617).
- **Stories:** C001-US-604
- **Priority:** Must
- **Acceptance:** C001-AC-606.1

### C001-REQ-617 — Record a defect report on any hunk
- **Pattern:** event-driven
- **Statement:** WHEN the developer reports a defect with a non-empty text in a hunk of the snapshot, THE analysis core SHALL record in the review record a defect report that names the hunk, the developer's text and each clearing rule that had cleared the hunk in the snapshot, or no clearing rule when none had.
- **Rationale:** a defect the developer finds is part of the basis on which the change is accepted or rejected (C001-US-705), whether or not a rule had cleared the hunk; the developer reports defects on sampled hunks, on cleared hunks expanded or reopened, and on open hunks. The clearing rules named are those that escalate (C001-REQ-606); a report that names none escalates nothing. Empty text: C001-REQ-706. Entry kind: C001-IF-009.
- **Stories:** C001-US-604, C001-US-705
- **Priority:** Must
- **Acceptance:** C001-AC-617.1

### C001-REQ-607 — Record each escalation
- **Pattern:** event-driven
- **Statement:** WHEN an escalation reopens hunks, THE analysis core SHALL record in the review record the defect report, the escalated clearing rules and the reopened hunks.
- **Rationale:** C001-US-604 Context (the report is kept in the review record, C001-US-705). Verdicts that relied on a withdrawn clearing go stale (C001-REQ-716).
- **Stories:** C001-US-604
- **Priority:** Must
- **Acceptance:** C001-AC-607.1

### C001-REQ-608 — Show reopened hunks with the defect that reopened them
- **Pattern:** ubiquitous
- **Statement:** THE review UI SHALL show every hunk reopened by an escalation together with the defect report that triggered the escalation.
- **Rationale:** C001-US-604 Context (the reopened hunks are listed with the defect that triggered them).
- **Stories:** C001-US-604
- **Priority:** Must
- **Acceptance:** C001-AC-608.1

### C001-REQ-609 — Stop an escalated rule from clearing
- **Pattern:** state-driven
- **Statement:** WHILE a clearing rule is escalated in the snapshot, THE analysis core SHALL NOT clear hunks by that rule.
- **Rationale:** hunks that would otherwise clear later, for example after a test judgement (C001-REQ-503), stay open; trust in the rule is gone for this change (C001-US-604).
- **Stories:** C001-US-604
- **Priority:** Must
- **Acceptance:** C001-AC-609.1

## Attention budget

### C001-REQ-610 — Order the reading queue by risk per reading minute
- **Pattern:** event-driven
- **Statement:** WHEN the developer states a time budget for the review in minutes, THE analysis core SHALL order the reading queue by descending risk score per estimated reading minute, ordering hunks with equal values by file path and then by first changed line.
- **Rationale:** C001-R-002 paradigm 16 (order units by value per minute); effort-aware ranking in C001-R-002 §B. The reading queue holds the open hunks and the sampled hunks not yet read (C001-REQ-604).
- **Stories:** C001-US-605
- **Priority:** Must
- **Acceptance:** C001-AC-610.1

### C001-REQ-611 — Estimate reading time from a reading rate
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL estimate the reading time of a hunk, in minutes, as 60 times its changed lines divided by the reading rate in changed lines per hour, which is the rate the developer sets for the review or, when none is set, 300.
- **Rationale:** 300 lines per hour is the lower end of the 300–500 lines per hour inspection rate in C001-R-002 §B. The rate does not adapt to the developer on its own (constitution principle 1); a developer who reads at another pace sets their own rate. Every hunk has at least one changed line (glossary, hunk), so every estimate is greater than zero. Invalid rates: C001-REQ-615.
- **Stories:** C001-US-605
- **Priority:** Must
- **Acceptance:** C001-AC-611.1

### C001-REQ-612 — Report what fits in the budget and what does not
- **Pattern:** event-driven
- **Statement:** WHEN the developer states a time budget, THE analysis core SHALL report as within the budget the longest run of hunks from the head of the ordered reading queue whose estimated reading times add up to no more than the budget, together with the changed lines and the sum of risk scores of the remaining hunks.
- **Rationale:** C001-US-605 (what fits in the budget and what does not, with the remainder explicit).
- **Stories:** C001-US-605
- **Priority:** Must
- **Acceptance:** C001-AC-612.1

### C001-REQ-615 — Refuse a time budget or reading rate that is not positive
- **Pattern:** unwanted-behaviour
- **Statement:** IF the developer states a time budget or a reading rate that is not a number greater than zero, THEN THE analysis core SHALL refuse the value with a message that names it, leaving the time budget and the reading rate in effect unchanged.
- **Rationale:** a budget or rate of zero or below leaves C001-REQ-611 and C001-REQ-612 without a meaning (division by zero, nothing that fits); constitution principle 4. The values are stated through the local review UI (C001-IF-002, operation `setAttentionBudget` of C001-IF-003 §4); the CLI has no budget option (C001-IF-001). Error ERR-ACT-008 (`50-interfaces/errors.md`).
- **Stories:** C001-US-605
- **Priority:** Must
- **Acceptance:** C001-AC-615.1

## Coverage statement

### C001-REQ-613 — State covered and uncovered risk
- **Pattern:** event-driven
- **Statement:** WHEN the developer asks for the coverage statement of the review, THE analysis core SHALL report the sum of risk scores, and its share of the total risk score of the change, for each of four groups of hunks: read; cleared, with every rule that cleared the hunk having all its sampled hunks read and no defect reported; cleared otherwise; and open.
- **Rationale:** paradigm 16 (an explicit, bounded coverage statement instead of "I skimmed it"); C001-R-001 Gap 5. The statement is stored with each verdict in the review record (C001-REQ-712).
- **Stories:** C001-US-606
- **Priority:** Should
- **Acceptance:** C001-AC-613.1

### C001-REQ-614 — Give the sample results of each rule
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL include in every coverage statement, for each clearing rule, the number of hunks it cleared, the number of them sampled, the number of sampled hunks read and the number of defects reported.
- **Rationale:** C001-US-603 value (a stated confidence for the cleared part of the change); paradigm 15. For an escalated rule, the sampled and read counts are those of the hunks sampled before the escalation that the rule still clears, as no hunk enters its sample afterwards (C001-REQ-616).
- **Stories:** C001-US-603, C001-US-606
- **Priority:** Should
- **Acceptance:** C001-AC-614.1
