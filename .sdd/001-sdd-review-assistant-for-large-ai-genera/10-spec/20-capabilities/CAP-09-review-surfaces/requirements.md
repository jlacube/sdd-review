---
id: "C001-CAP-09"
artifact: spec/requirements
change: "CHG-001"
phase: 10-spec
status: draft
capability: "CLI and local review UI"
---
# C001-CAP-09 — Requirements

### C001-REQ-901 — Start a review and open it in the browser with one command
- **Pattern:** event-driven
- **Statement:** WHEN the developer runs the review command of the CLI in a git repository, THE CLI SHALL take in the change, run the analysis and open the review of the resulting snapshot in the default web browser.
- **Rationale:** C001-DEC-002 (analysis core with CLI plus local UI). Intake options: C001-CAP-01; command syntax: `50-interfaces/`.
- **Stories:** C001-US-901
- **Priority:** Must
- **Acceptance:** C001-AC-901.1

### C001-REQ-902 — Print the review address when no browser opens
- **Pattern:** unwanted-behaviour
- **Statement:** IF the CLI cannot open a web browser, THEN THE CLI SHALL print the local address at which the review is served.
- **Rationale:** constitution principle 4 (error behaviour written down); C001-US-901.
- **Stories:** C001-US-901
- **Priority:** Must
- **Acceptance:** C001-AC-902.1

### C001-REQ-904 — Move between components, intents and hunks
- **Pattern:** state-driven
- **Statement:** WHILE a review is open in the local review UI, THE local review UI SHALL offer a one-step move from each intent to each of its hunks, and from each hunk to the intent it is grouped under, or to orphan code when it is grouped under none, and to its component in the architecture delta.
- **Rationale:** `ideation.md` §8 (top-down order: architecture delta, intents, hunks); C001-DEC-001. The move from a component to its intents and open hunks: C001-US-205. Every hunk is under exactly one intent or under orphan code (C001-REQ-301).
- **Stories:** C001-US-903, C001-US-907
- **Priority:** Must
- **Acceptance:** C001-AC-904.1

### C001-REQ-905 — Accept connections on the loopback interface only
- **Pattern:** ubiquitous
- **Statement:** THE local review UI SHALL accept connections only on a loopback address (127.0.0.1 or ::1).
- **Rationale:** C001-DEC-002 Consequences; C001-CON-02; `ideation.md` §9 (local server exposed beyond the machine).
- **Stories:** C001-US-902
- **Priority:** Must
- **Acceptance:** C001-AC-905.1

### C001-REQ-906 — Reject requests addressed to another host name
- **Pattern:** unwanted-behaviour
- **Statement:** IF a request to the local review UI names a host other than a loopback address or `localhost`, THEN THE local review UI SHALL reject the request without returning review content.
- **Rationale:** C001-CON-02. A web page open in the developer's browser can reach a loopback server through a foreign host name that resolves to the loopback address.
- **Stories:** C001-US-902
- **Priority:** Must
- **Acceptance:** C001-AC-906.1

### C001-REQ-907 — Reject review actions from other origins
- **Pattern:** unwanted-behaviour
- **Statement:** IF a request that changes the review state or runs a command, which includes every recorded action, every run of an evidence bundle and every cancellation of a running job, does not come from a page served by the local review UI of that review, THEN THE local review UI SHALL reject the request.
- **Rationale:** C001-DEC-003 (no verdict without the developer); C001-REQ-702; C001-CON-02. Recorded actions: C001-REQ-721 (glossary). Adding, confirming and running bundle commands executes code on the developer's machine (C001-REQ-511, C001-REQ-512), and a test judgement decides which tests clear code (C001-REQ-504), so a foreign page must reach none of them. Request types and the check: C001-IF-002; measured by C001-NFR-010.
- **Stories:** C001-US-902
- **Priority:** Must
- **Acceptance:** C001-AC-907.1

### C001-REQ-908 — Load no resource from outside the machine
- **Pattern:** ubiquitous
- **Statement:** THE local review UI SHALL load every script, style sheet, font and image it uses from the local machine.
- **Rationale:** C001-CON-01; C001-SC-07; C001-US-902 (code under review not exposed).
- **Stories:** C001-US-902
- **Priority:** Must
- **Acceptance:** C001-AC-908.1

### C001-REQ-909 — Show a hunk with its file context, intent, risk signals and evidence
- **Pattern:** event-driven
- **Statement:** WHEN the developer opens a hunk, THE local review UI SHALL show in one view the hunk with the code of its file around it, expandable to the whole file, together with its intent, its risk signals and its evidence records.
- **Rationale:** C001-US-903; precedents in C001-R-001 §A and §B. Risk signals: C001-CAP-04; evidence: C001-CAP-05.
- **Stories:** C001-US-903
- **Priority:** Must
- **Acceptance:** C001-AC-909.1

### C001-REQ-910 — Show moved code as a move
- **Pattern:** event-driven
- **Statement:** WHEN the developer opens a hunk that the analysis core identifies as moved code, THE local review UI SHALL show it as one move from its origin to its destination, not as a deletion and an addition.
- **Rationale:** C001-US-903; move detection: C001-US-402.
- **Stories:** C001-US-903
- **Priority:** Must
- **Acceptance:** C001-AC-910.1

### C001-REQ-911 — Show the labels of each item
- **Pattern:** ubiquitous
- **Statement:** THE local review UI SHALL show, next to each item it displays, the labels that the analysis core reports for that item: reduced result, model output with its confidence level, and stale verdict with its causes.
- **Rationale:** C001-REQ-804, C001-REQ-810, C001-REQ-811, C001-REQ-718.
- **Stories:** C001-US-903, C001-US-804, C001-US-706
- **Priority:** Must
- **Acceptance:** C001-AC-911.1

### C001-REQ-912 — Run the analysis headless
- **Pattern:** event-driven
- **Statement:** WHEN the developer runs the analysis command of the CLI in headless mode, THE CLI SHALL write the architecture delta, the intent map, the triage, the evidence and the review record of the snapshot as machine-readable files, in the formats of `50-interfaces/`, into the output directory the developer names, without starting the local review UI.
- **Rationale:** C001-DEC-002 (core usable on its own; later surfaces on top of the core); C001-CON-03.
- **Stories:** C001-US-904
- **Priority:** Must
- **Acceptance:** C001-AC-912.1

### C001-REQ-913 — Run the analysis core without the UI
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL perform every analysis and verdict operation with the local review UI neither installed nor running.
- **Rationale:** C001-CON-03; C001-DEC-002 Consequences (the core must not depend on the UI).
- **Stories:** C001-US-904
- **Priority:** Must
- **Acceptance:** C001-AC-913.1

### C001-REQ-914 — Report the outcome of a CLI command in its exit status
- **Pattern:** ubiquitous
- **Statement:** THE CLI SHALL exit with status 0 only when a command has completed and written all its results, and otherwise with a non-zero status listed in the error catalogue of `50-interfaces/`.
- **Rationale:** C001-US-904 (scripted reviews); constitution principle 4.
- **Stories:** C001-US-904
- **Priority:** Must
- **Acceptance:** C001-AC-914.1

### C001-REQ-915 — Record verdicts from the CLI
- **Pattern:** event-driven
- **Statement:** WHEN the developer signs, rejects or defers an intent through the CLI, THE CLI SHALL record the verdict in the same review record as the local review UI, under C001-REQ-701 to C001-REQ-708.
- **Rationale:** C001-US-905 (the same verdicts from either surface); C001-DEC-002.
- **Stories:** C001-US-905
- **Priority:** Should
- **Acceptance:** C001-AC-915.1

### C001-REQ-916 — List the intents of a review in the CLI
- **Pattern:** event-driven
- **Statement:** WHEN the developer asks the CLI for the intents of a review, THE CLI SHALL print each intent with its identifier, its current verdict or stale status, and its read, cleared and open shares.
- **Rationale:** C001-US-905 (finish a review in the terminal); shares: C001-US-602.
- **Stories:** C001-US-905
- **Priority:** Should
- **Acceptance:** C001-AC-916.1

### C001-REQ-917 — Keep concurrent entries from both surfaces
- **Pattern:** unwanted-behaviour
- **Statement:** IF the CLI and the local review UI write entries to the same review record at the same time, THEN THE analysis core SHALL keep every entry, in the order in which the entries were received.
- **Rationale:** C001-US-905; C001-REQ-713 (entries kept unaltered).
- **Stories:** C001-US-905
- **Priority:** Should
- **Acceptance:** C001-AC-917.1

### C001-REQ-918 — Restore the review state of a snapshot
- **Pattern:** event-driven
- **Statement:** WHEN the developer reopens a review of a snapshot, THE analysis core SHALL restore every review record entry saved for that snapshot, the review state that those entries set, and the sample of each clearing rule.
- **Rationale:** C001-US-906; C001-GOAL-01. Every recorded action (C001-REQ-721) writes an entry (C001-IF-009); the state they set includes read marks, reopened hunks, hunk moves, developer-named intents, rejections, test judgements, which decide which tests clear code (C001-REQ-504), defect reports with their escalations, the time budget and reading rate, bundle commands and verdicts. The samples follow the sample seed of the review (C001-REQ-616), so the sampled hunks and their sampling results (glossary) are the same as before. When the working tree has moved on: C001-US-104 and C001-REQ-715.
- **Stories:** C001-US-906
- **Priority:** Must
- **Acceptance:** C001-AC-918.1

### C001-REQ-919 — Keep the analysis results of a snapshot across sessions
- **Pattern:** event-driven
- **Statement:** WHEN the developer reopens a review of a snapshot, THE analysis core SHALL present the same intent map, risk scores and clearings as at the end of the previous session on that snapshot.
- **Rationale:** `ideation.md` §9 (grouping that changes between runs; anchor review state to a snapshot); C001-R-001 Implications.
- **Stories:** C001-US-906
- **Priority:** Must
- **Acceptance:** C001-AC-919.1

### C001-REQ-920 — Save each review action before confirming it
- **Pattern:** event-driven
- **Statement:** WHEN the developer takes a recorded action, THE analysis core SHALL save every review record entry that the action writes to persistent storage before it confirms the action.
- **Rationale:** C001-US-906 (a review spans more than one sitting); C001-US-705. Recorded actions: C001-REQ-721; a defect report that escalates also writes the escalation entry (C001-REQ-607). A refused action writes no entry (C001-REQ-721, C001-IF-003 §4). Recovery after an unexpected end: C001-NFR-014.
- **Stories:** C001-US-906
- **Priority:** Must
- **Acceptance:** C001-AC-920.1

### C001-REQ-921 — Operate the review with the keyboard alone
- **Pattern:** ubiquitous
- **Statement:** THE local review UI SHALL offer a keyboard command for each of these actions: move to the next or previous component, intent and hunk; move up and down the levels of C001-REQ-904; mark a hunk as read; expand a cleared hunk; sign, reject and defer an intent.
- **Rationale:** C001-US-907; precedents in C001-R-001 §A and §B.
- **Stories:** C001-US-907
- **Priority:** Should
- **Acceptance:** C001-AC-921.1

### C001-REQ-922 — List the keyboard commands
- **Pattern:** event-driven
- **Statement:** WHEN the developer asks for keyboard help, THE local review UI SHALL list every keyboard command with its action.
- **Rationale:** C001-US-907.
- **Stories:** C001-US-907
- **Priority:** Should
- **Acceptance:** C001-AC-922.1
