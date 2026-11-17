---
id: "C001-CAP-07"
artifact: spec/acceptance
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Verdicts and review record"
---
# C001-CAP-07 — Acceptance criteria and scenarios

Terms: `40-domain/glossary-delta.md`. The fixture of these scenarios is a repository whose SDD
change holds the requirements used as intents (`"REQ-012"`, `"REQ-013"`, ...); snapshot IDs,
evidence-record IDs and clearing IDs are written as short example values. "The review record"
is the file of C001-REQ-714; "the decision status" is the report of C001-REQ-711.

## C001-REQ-701

#### C001-AC-701.1 — A sign action records a sign verdict against the snapshot
```gherkin
Scenario: C001-TS-701 — Signing an intent records a sign verdict for the snapshot
  Given a review of snapshot "s-4f1a" with intent "REQ-012 Apply a coupon" of 3 hunks, all marked read
  And "REQ-012" has no verdict
  When the developer signs "REQ-012"
  Then the review record holds a sign verdict on "REQ-012" with snapshot ID "s-4f1a"
  And the decision status reports "REQ-012" as signed
```
```gherkin
Scenario: C001-TS-702 — Signing an extracted intent records its commit source
  Given a review of snapshot "s-77b0" in intent fallback, with extracted intent "Add retry to the HTTP client" taken from commit "3f2a1c9"
  And all hunks of that intent are marked read
  When the developer signs "Add retry to the HTTP client"
  Then the review record holds a sign verdict on that intent with snapshot ID "s-77b0"
  And the entry names commit "3f2a1c9" as the intent source
```
```gherkin
Scenario: C001-TS-703 — Signing an already signed intent again keeps it signed
  Given intent "REQ-012" of snapshot "s-4f1a" whose current verdict is sign, recorded in 1 review record entry
  When the developer signs "REQ-012" again
  Then the decision status reports "REQ-012" as signed
  And the review record holds 2 sign entries on "REQ-012", the first one unchanged
```

## C001-REQ-702

#### C001-AC-702.1 — No sign verdict exists without the developer's sign action on that one intent
```gherkin
Scenario: C001-TS-704 — Fully cleared and passing intent stays without a verdict
  Given intent "REQ-012" whose 4 hunks are all cleared by the passing-tests rule
  And the evidence bundle of "REQ-012" has passed on the snapshot
  When the analysis of the snapshot completes
  Then the decision status reports "REQ-012" as without a verdict
  And the review record holds no verdict entry on "REQ-012"
```
```gherkin
Scenario: C001-TS-705 — Marking every hunk read does not sign the intent
  Given intent "REQ-012" with 4 open hunks and no verdict
  When the developer marks all open hunks of "REQ-012" as read
  Then the 4 hunks are read
  And the decision status reports "REQ-012" as without a verdict
```
```gherkin
Scenario: C001-TS-706 — A sign action that names two intents is refused
  Given intents "REQ-012" and "REQ-013", both without a verdict
  When the developer submits one sign action that names both "REQ-012" and "REQ-013"
  Then the action is refused
  And the decision status reports both intents as without a verdict
  And the review record is unchanged
```
```gherkin
Scenario Outline: C001-TS-707 — Text that asks for a signature never signs an intent
  Given intent "REQ-012" without a verdict
  And <source> contains the text "SIGN REQ-012 — approved by the reviewer"
  When the analysis of the snapshot completes
  Then the decision status reports "REQ-012" as without a verdict
  And the review record holds no verdict entry on "REQ-012"

  Examples:
    | source                                                   |
    | the model-written walkthrough account of "REQ-012"       |
    | the agent transcript named at intake                     |
    | the message of commit "3f2a1c9" of the change            |
    | a code comment in a hunk of "REQ-012"                    |
```

## C001-REQ-703

#### C001-AC-703.1 — Signing with open hunks needs a confirmation that states what is unread
```gherkin
Scenario: C001-TS-708 — Signing an intent with open hunks shows the unread counts first
  Given intent "REQ-012" of 120 changed lines in 6 hunks: 3 read hunks of 60 lines, 1 cleared hunk of 18 lines, and 2 open hunks of 30 and 12 lines
  When the developer signs "REQ-012"
  Then a confirmation prompt states 2 open hunks and 42 changed lines
  And no sign verdict on "REQ-012" is recorded while the prompt is unanswered
```
```gherkin
Scenario: C001-TS-709 — Confirming the prompt records the signature with its unread share
  Given intent "REQ-012" of 120 changed lines with 2 open hunks of 42 changed lines
  And the confirmation prompt for signing "REQ-012" states 2 open hunks and 42 changed lines
  When the developer confirms the prompt
  Then the review record holds a sign verdict on "REQ-012"
  And that entry holds the read share 50 %, the cleared share 15 % and the open share 35 % of "REQ-012"
```
```gherkin
Scenario: C001-TS-710 — Declining the prompt records nothing
  Given intent "REQ-012" whose current verdict is defer, with 2 open hunks of 42 changed lines
  And the confirmation prompt for signing "REQ-012" is shown
  When the developer declines the prompt
  Then the review record is unchanged
  And the decision status reports "REQ-012" as deferred
```
```gherkin
Scenario: C001-TS-711 — An intent whose unread hunks are all cleared is signed without a prompt
  Given intent "REQ-012" with 2 read hunks and 3 cleared hunks without a read mark, and no open hunk
  When the developer signs "REQ-012"
  Then no confirmation prompt is shown
  And the review record holds a sign verdict on "REQ-012" with the open share 0 %
```
```gherkin
Scenario: C001-TS-712 — A single open line already needs the confirmation
  Given intent "REQ-012" whose only open hunk has 1 changed line
  When the developer signs "REQ-012"
  Then a confirmation prompt states 1 open hunk and 1 changed line
```
```gherkin
Scenario: C001-TS-713 — A hunk reopened by escalation counts as open in the prompt
  Given intent "REQ-012" whose hunks are all read except 1 hunk of 25 changed lines that an escalation reopened
  When the developer signs "REQ-012"
  Then a confirmation prompt states 1 open hunk and 25 changed lines
```

## C001-REQ-704

#### C001-AC-704.1 — Rejecting with a reason records the reject verdict and the reason text
```gherkin
Scenario: C001-TS-714 — Rejecting an intent records the reason
  Given intent "REQ-012" without a verdict
  When the developer rejects "REQ-012" with the reason "Coupon total ignores tax; see src/cart.ts line 42"
  Then the review record holds a reject verdict on "REQ-012" with the reason "Coupon total ignores tax; see src/cart.ts line 42"
  And the decision status reports "REQ-012" as rejected
```
```gherkin
Scenario Outline: C001-TS-715 — Short, multi-line and non-ASCII reasons are kept exactly
  Given intent "REQ-012" without a verdict
  When the developer rejects "REQ-012" with the reason <reason>
  Then the review record holds a reject verdict on "REQ-012" whose reason is exactly <reason>

  Examples:
    | reason                                             |
    | "x"                                                |
    | "Ne gère pas\nles remises négatives"               |
    | "割引が二重に適用される"                              |
```
```gherkin
Scenario: C001-TS-716 — A reason holding markup is shown as text and never run
  Given intent "REQ-012" without a verdict
  When the developer rejects "REQ-012" with the reason "<script>alert('x')</script><img src=x onerror=alert(1)>"
  Then the review record holds that reason character for character
  And the local review UI shows the reason as the literal characters "<script>alert('x')</script><img src=x onerror=alert(1)>"
  And no script from the reason runs in the page and no dialog opens
```

## C001-REQ-705

#### C001-AC-705.1 — Deferring with a note records the defer verdict and the note text
```gherkin
Scenario: C001-TS-717 — Deferring an intent records the note
  Given intent "REQ-013" without a verdict
  When the developer defers "REQ-013" with the note "Wait for the product answer on stacked coupons"
  Then the review record holds a defer verdict on "REQ-013" with the note "Wait for the product answer on stacked coupons"
  And the decision status reports "REQ-013" as deferred, and neither as signed nor as rejected
```
```gherkin
Scenario: C001-TS-718 — A long note is kept in full
  Given intent "REQ-013" without a verdict
  When the developer defers "REQ-013" with a note of 5,000 characters
  Then the review record holds a defer verdict on "REQ-013" whose note equals those 5,000 characters
```

## C001-REQ-706

#### C001-AC-706.1 — A rejection, a deferral or a defect report without a reason, note or text is refused
```gherkin
Scenario Outline: C001-TS-719 — Empty and whitespace-only reasons are refused
  Given intent "REQ-012" whose current verdict is sign, and orphan hunk "src/telemetry.ts" lines 1-40 neither attached nor rejected
  When the developer <action> with the text <text>
  Then the action is refused with the message that a reason is required
  And the review record is unchanged
  And the decision status reports "REQ-012" as signed and 1 hunk of orphan code neither attached nor rejected

  Examples:
    | action                                         | text         |
    | rejects intent "REQ-012"                       | ""           |
    | defers intent "REQ-012"                        | "   "        |
    | rejects orphan hunk "src/telemetry.ts" 1-40    | "\t\n  \n"   |
```
```gherkin
Scenario: C001-TS-720 — A reason with text between spaces is accepted
  Given intent "REQ-012" without a verdict
  When the developer rejects "REQ-012" with the reason "  ok  "
  Then the review record holds a reject verdict on "REQ-012"
```
```gherkin
Scenario: C001-TS-721 — A reason made of non-breaking spaces only is refused
  Given intent "REQ-012" without a verdict
  When the developer defers "REQ-012" with a note of three U+00A0 non-breaking spaces
  Then the action is refused with the message that a reason is required
  And the review record is unchanged
```
```gherkin
Scenario Outline: C001-TS-764 — A defect report with empty or whitespace-only text is refused
  Given hunk "src/format.ts" lines 3-8, cleared by the formatting rule, which cleared 30 unread hunks, and a review record of 4 entries
  When the developer reports a defect in "src/format.ts" lines 3-8 with the text <text>
  Then the action is refused with the error ERR-ACT-001 and a message that a text is required
  And the review record still holds 4 entries
  And the 30 hunks cleared by the formatting rule are still cleared

  Examples:
    | text       |
    | ""         |
    | "   "      |
    | "\t\n"     |
```

## C001-REQ-707

#### C001-AC-707.1 — Recording a decision leaves the repository unchanged
```gherkin
Scenario Outline: C001-TS-722 — Git index, commits, branches and working tree stay as they were
  Given a repository on branch "feature/coupons" at HEAD "a1b2c3d", with "src/cart.ts" staged, "src/coupon.ts" and "src/price.ts" modified and not staged, and "src/new.ts" untracked
  And the HEAD commit, the branch list with their commits, the index content and the content of every working-tree file are recorded
  When the developer <action>
  Then the HEAD commit, the branch list with their commits and the index content equal the recorded ones
  And every working-tree file equals its recorded content, except the files of the review record
  And no stash entry, commit or branch was added

  Examples:
    | action                                                                  |
    | signs intent "REQ-012" and confirms the prompt                          |
    | rejects intent "REQ-012" with the reason "Wrong rounding"               |
    | defers intent "REQ-013" with the note "Ask about stacking"              |
    | rejects orphan hunk "src/new.ts" lines 1-20 with the reason "Not asked" |
```
```gherkin
Scenario: C001-TS-723 — Git commands written in a reason are stored, never run
  Given a repository at HEAD "a1b2c3d" with 2 modified, unstaged files
  When the developer rejects intent "REQ-012" with the reason "$(git commit -am pwned); git push --force; `git stash`"
  Then the review record holds that reason character for character
  And HEAD is "a1b2c3d", the 2 files are still modified and unstaged, and no stash entry exists
```

## C001-REQ-708

#### C001-AC-708.1 — The latest verdict on an intent is its current verdict
```gherkin
Scenario: C001-TS-724 — Coming back to a deferred intent and signing it
  Given intent "REQ-013" whose current verdict is defer with the note "Ask about stacking"
  And every hunk of "REQ-013" is read
  When the developer signs "REQ-013"
  Then the decision status reports "REQ-013" as signed
  And the review record holds the defer entry followed by the sign entry on "REQ-013"
```
```gherkin
Scenario Outline: C001-TS-725 — Any verdict replaces the current one
  Given intent "REQ-012" whose current verdict is <before>
  When the developer <action>
  Then the decision status reports "REQ-012" as <after>
  And the earlier entry on "REQ-012" is still in the review record

  Examples:
    | before | action                                              | after    |
    | sign   | rejects "REQ-012" with the reason "Tax missing"     | rejected |
    | reject | defers "REQ-012" with the note "Check with product" | deferred |
```
```gherkin
Scenario: C001-TS-726 — A new verdict on a stale intent is current and not stale
  Given intent "REQ-012" whose sign verdict is stale with the cause hunks
  And every hunk of "REQ-012" is read
  When the developer signs "REQ-012"
  Then the decision status reports "REQ-012" as signed and not as stale
```

## C001-REQ-709

#### C001-AC-709.1 — A named intent for orphan code joins the intent map with the developer as source
```gherkin
Scenario: C001-TS-727 — Naming an intent for two orphan hunks
  Given orphan code of 3 hunks: "src/retry.ts" lines 1-30, "src/retry.ts" lines 50-64 and "src/telemetry.ts" lines 1-40
  When the developer creates the intent "Add retry logging" for the 2 hunks of "src/retry.ts"
  Then the intent map lists "Add retry logging" with exactly those 2 hunks
  And the intent source of "Add retry logging" is the developer, with no spec source
  And the orphan code lists only "src/telemetry.ts" lines 1-40
```
```gherkin
Scenario: C001-TS-728 — A developer-named intent takes a verdict like any intent
  Given the developer-named intent "Add retry logging" with 1 hunk, without a verdict
  When the developer rejects "Add retry logging" with the reason "Retry is not part of this task"
  Then the review record holds a reject verdict on "Add retry logging" whose intent source is the developer
```

## C001-REQ-710

#### C001-AC-710.1 — Rejecting an orphan hunk records the rejection and its reason
```gherkin
Scenario: C001-TS-729 — Rejecting a hunk nobody asked for
  Given orphan code of 3 hunks, none attached or rejected, among them "src/telemetry.ts" lines 1-40
  When the developer rejects orphan hunk "src/telemetry.ts" lines 1-40 with the reason "Telemetry was not requested"
  Then the review record holds the rejection of "src/telemetry.ts" lines 1-40 with the reason "Telemetry was not requested"
  And the decision status reports 2 hunks of orphan code neither attached nor rejected
```

## C001-REQ-711

#### C001-AC-711.1 — The decision status counts intents by verdict state and undecided orphan hunks
```gherkin
Scenario: C001-TS-730 — Counts of a review in progress
  Given a review of 7 intents: 2 signed, 1 rejected, 1 deferred, 1 whose signature is stale, and 2 without a verdict
  And 5 hunks of orphan code: 1 attached to "REQ-013" by a hunk move, 1 rejected, and 3 neither attached nor rejected
  When the developer asks for the decision status
  Then the review reports 2 signed, 1 rejected, 1 deferred, 1 stale and 2 intents without a verdict
  And the review reports 3 hunks of orphan code neither attached to an intent nor rejected
```
```gherkin
Scenario: C001-TS-731 — Counts of a review with no decision yet
  Given a new review of 4 intents and no orphan code
  When the developer asks for the decision status
  Then the review reports 0 signed, 0 rejected, 0 deferred, 0 stale and 4 intents without a verdict
  And the review reports 0 hunks of orphan code neither attached to an intent nor rejected
```

## C001-REQ-712

#### C001-AC-712.1 — Each review record entry holds the basis of its verdict
```gherkin
Scenario: C001-TS-732 — Entry of a signature given with open hunks
  Given a review of snapshot "s-4f1a" in a repository whose git configuration has user.name "Ada Martin" and user.email "ada@example.com"
  And intent "REQ-012" from spec item "REQ-012" with read share 50 %, cleared share 15 % and open share 35 %
  And the hunks of "REQ-012" have evidence records "ev-17" and "ev-18", evidence bundle run "run-3" and clearing "cl-5"
  And the machine clock is 2026-11-17 14:03:27 in the time zone UTC+01:00
  When the developer signs "REQ-012" and confirms the prompt
  Then the new review record entry holds:
    | field                | value                                          |
    | snapshot             | s-4f1a                                         |
    | intent and source    | REQ-012, spec item REQ-012                     |
    | verdict              | sign                                           |
    | evidence records     | ev-17, ev-18                                   |
    | evidence bundle runs | run-3                                          |
    | clearings            | cl-5                                           |
    | shares of the intent | read 50 %, cleared 15 %, open 35 %             |
    | coverage statement   | the coverage statement of the review at 14:03  |
    | git identity         | Ada Martin, ada@example.com                    |
    | time                 | 2026-11-17T14:03:27+01:00                      |
```
```gherkin
Scenario Outline: C001-TS-733 — Entries of a rejection and a deferral hold their text
  Given intent "REQ-013" without a verdict
  When the developer <action> "REQ-013" with the text "Rounding differs from the spec"
  Then the new review record entry holds the verdict <verdict> and the text "Rounding differs from the spec"

  Examples:
    | action  | verdict |
    | rejects | reject  |
    | defers  | defer   |
```
```gherkin
Scenario: C001-TS-734 — Entry of an intent without evidence or clearings
  Given intent "REQ-014" whose 2 hunks are both read and that has no evidence record, no evidence bundle run and no clearing
  When the developer signs "REQ-014"
  Then the new review record entry holds empty lists of evidence records, evidence bundle runs and clearings
  And it holds the read share 100 %, the cleared share 0 % and the open share 0 %
```

## C001-REQ-713

#### C001-AC-713.1 — Written entries stay unaltered across sessions
```gherkin
Scenario: C001-TS-735 — Entries of a first session are unchanged after a second session
  Given a review record with 3 entries written in a first review session, and a byte copy of those entries
  When the developer, in a second review session, replaces the verdict of 1 of those intents and signs 1 other intent
  Then the review record holds 5 entries
  And its first 3 entries are byte-identical to the copy
```
```gherkin
Scenario: C001-TS-736 — A verdict going stale leaves its entry unaltered
  Given a review record whose entry on "REQ-012" records a sign verdict, and a byte copy of that entry
  When a new snapshot changes the content of a hunk of "REQ-012"
  Then the decision status reports "REQ-012" as stale
  And the entry on "REQ-012" is byte-identical to the copy
```

## C001-REQ-714

#### C001-AC-714.1 — A program reads the review record without the UI
```gherkin
Scenario: C001-TS-737 — The record validates against its documented format
  Given a review record with 3 entries: a sign, a reject and a defer verdict
  And an installation in which the local review UI is neither installed nor running
  When a program validates the review record file against the review record format of `50-interfaces/`
  Then the validation passes
  And the program reads 3 entries, each with the fields of C001-REQ-712
```

## C001-REQ-715

#### C001-AC-715.1 — A verdict goes stale when the hunks of its intent change
```gherkin
Scenario: C001-TS-738 — A new snapshot changes a hunk of a signed intent
  Given intent "REQ-012" signed on snapshot "s-4f1a", with hunk "src/coupon.ts" lines 10-24
  And the developer then edits line 12 of "src/coupon.ts"
  When the developer starts a review of the change, which creates snapshot "s-9c2e"
  Then the review of "s-9c2e" reports the verdict on "REQ-012" as stale with the cause hunks
```
```gherkin
Scenario Outline: C001-TS-739 — A changed set of hunks makes the verdict stale
  Given intent "REQ-012" signed on snapshot "s-4f1a" with 3 hunks
  When the developer <change>
  Then the decision status reports "REQ-012" as stale with the cause hunks

  Examples:
    | change                                                              |
    | moves hunk "src/price.ts" lines 5-9 from intent "REQ-013" to "REQ-012" |
    | moves hunk "src/coupon.ts" lines 10-24 of "REQ-012" to orphan code  |
    | attaches orphan hunk "src/retry.ts" lines 1-30 to "REQ-012"         |
```
```gherkin
Scenario: C001-TS-740 — A one-character change is a change
  Given intent "REQ-012" signed on snapshot "s-4f1a", with a hunk holding the line "const RATE = 0.1;"
  When the developer starts a review of a new snapshot in which that line reads "const RATE = 0.2;" and nothing else differs
  Then the review of the new snapshot reports "REQ-012" as stale with the cause hunks
```
```gherkin
Scenario: C001-TS-741 — Changes outside the intent's hunks leave the verdict current
  Given intent "REQ-012" signed on snapshot "s-4f1a"
  When the developer starts a review of a new snapshot in which only hunks of intent "REQ-013" differ
  Then the review of the new snapshot reports "REQ-012" as signed and not as stale
```
```gherkin
Scenario: C001-TS-751 — A hunk that only moves to other line numbers leaves the verdict current
  Given intent "REQ-012" signed on snapshot "s-4f1a", with hunk "src/coupon.ts" lines 10-24
  And the developer then adds 6 lines at the top of "src/coupon.ts" for intent "REQ-013", so that the changed lines of "REQ-012" become lines 16-30 with the same content
  When the developer starts a review of the change, which creates snapshot "s-9c2e"
  Then the review of "s-9c2e" reports "REQ-012" as signed and not as stale
```

## C001-REQ-716

#### C001-AC-716.1 — A verdict goes stale when the evidence it relied on changes
```gherkin
Scenario: C001-TS-742 — A re-run turns a relied-on test result from passed to failed
  Given intent "REQ-012" signed with evidence record "ev-17", whose test "applies a 10 % coupon" passed
  When the developer re-runs the evidence and that test fails
  Then the decision status reports "REQ-012" as stale with the cause evidence
```
```gherkin
Scenario: C001-TS-743 — Escalation withdraws a relied-on clearing
  Given intent "REQ-012" signed with clearing "cl-5" of hunk "src/format.ts" lines 3-8 by the formatting rule
  When the developer reports a defect in a sampled hunk cleared by the formatting rule, which escalates that rule
  Then clearing "cl-5" is withdrawn
  And the decision status reports "REQ-012" as stale with the cause evidence
```
```gherkin
Scenario Outline: C001-TS-744 — Evidence events that do not touch the verdict's basis
  Given intent "REQ-012" signed with evidence record "ev-17", whose test passed
  When <event>
  Then the decision status reports "REQ-012" as signed and not as stale

  Examples:
    | event                                                                     |
    | the developer re-runs the evidence and "ev-17" passes again                |
    | evidence record "ev-30" of intent "REQ-013" changes from passed to failed |
```

## C001-REQ-717

#### C001-AC-717.1 — A verdict goes stale when the text of its intent source changes
```gherkin
Scenario: C001-TS-745 — The spec item of a signed intent is edited
  Given intent "REQ-012" signed on snapshot "s-4f1a" while spec item "REQ-012" read "A coupon reduces the total by 10 %"
  When the developer starts a review of a new snapshot in which spec item "REQ-012" reads "A coupon reduces the total by 15 %"
  Then the review of the new snapshot reports "REQ-012" as stale with the cause source
```
```gherkin
Scenario: C001-TS-746 — The plan item of an extracted intent is edited
  Given an extracted intent taken from the plan item at "plan.md" line 14, deferred on snapshot "s-77b0"
  When the developer starts a review of a new snapshot in which the text of that plan item differs
  Then the review of the new snapshot reports that intent as stale with the cause source
```
```gherkin
Scenario: C001-TS-747 — Editing another spec item leaves the verdict current
  Given intent "REQ-012" signed on snapshot "s-4f1a"
  When the developer starts a review of a new snapshot in which only the text of spec item "REQ-013" differs in the same file
  Then the review of the new snapshot reports "REQ-012" as signed and not as stale
```
```gherkin
Scenario Outline: C001-TS-752 — Line-ending and trailing-whitespace edits of the source text are no change
  Given intent "REQ-012" signed on snapshot "s-4f1a" while spec item "REQ-012" read "A coupon reduces the total by 10 %" with LF line endings
  When the developer starts a review of a new snapshot in which spec item "REQ-012" differs only by <edit>
  Then the review of the new snapshot reports "REQ-012" as signed and not as stale

  Examples:
    | edit                                          |
    | CRLF line endings instead of LF               |
    | 3 trailing spaces at the end of its text line |
```

## C001-REQ-718

#### C001-AC-718.1 — A stale intent is reported as stale with each cause
```gherkin
Scenario: C001-TS-748 — A stale signature is not reported as signed
  Given intent "REQ-012" signed, then stale through a changed hunk and a failed relied-on test
  When the developer asks for the decision status
  Then the review reports "REQ-012" as stale with the causes hunks and evidence
  And the review counts "REQ-012" as stale and not as signed
```
```gherkin
Scenario Outline: C001-TS-749 — Stale rejections and deferrals are reported as stale
  Given intent "REQ-013" whose current verdict is <verdict> and whose source text then changed
  When the developer asks for the decision status
  Then the review reports "REQ-013" as stale with the cause source and not as <state>

  Examples:
    | verdict | state    |
    | reject  | rejected |
    | defer   | deferred |
```
```gherkin
Scenario: C001-TS-750 — All three causes are reported together
  Given intent "REQ-012" signed, then stale through a changed hunk, a withdrawn clearing and an edited spec item
  When the developer asks for the decision status
  Then the review reports "REQ-012" as stale with the causes hunks, evidence and source
```

## C001-REQ-719

#### C001-AC-719.1 — An empty, blank or taken name for a new intent, compared after whitespace collapsing and case folding, is refused with the reason
```gherkin
Scenario Outline: C001-TS-753 — An empty or whitespace-only name is refused
  Given orphan code of 2 hunks: "src/retry.ts" lines 1-30 and "src/retry.ts" lines 50-64, and a review record of 4 entries
  When the developer creates an intent with the name <name> for those 2 hunks
  Then the action is refused with the error ERR-ACT-001 and a message stating that a name is required
  And the intent map holds no new intent
  And the orphan code still lists the 2 hunks and the review record still holds 4 entries

  Examples:
    | name       |
    | ""         |
    | "   "      |
    | "\t\n"     |
```
```gherkin
Scenario Outline: C001-TS-754 — A name already used by a developer-named intent, up to whitespace and case, is refused
  Given the developer-named intent "Add retry logging" with 1 hunk
  And orphan code of 1 hunk, "src/telemetry.ts" lines 1-40
  When the developer creates an intent with the name <name> for "src/telemetry.ts" lines 1-40
  Then the action is refused with the error ERR-ACT-009 and a message stating that the name is already used by the developer-named intent "Add retry logging"
  And the intent "Add retry logging" still holds exactly 1 hunk
  And the orphan code still lists "src/telemetry.ts" lines 1-40

  Examples:
    | name                     |
    | "Add retry logging"      |
    | "Add  retry   logging"   |
    | "Add\tretry logging"     |
    | "add retry logging"      |
    | "ADD RETRY LOGGING"      |
    | "add  Retry\tLogging"    |
```
```gherkin
Scenario Outline: C001-TS-755 — A name that differs after whitespace collapsing and case folding, or equals a title from another source, is accepted as typed
  Given the developer-named intent "Add retry logging" and the intent "REQ-012" titled "Apply a coupon" taken from the SDD change
  And orphan code of 1 hunk, "src/telemetry.ts" lines 1-40
  When the developer creates an intent with the name <name> for "src/telemetry.ts" lines 1-40
  Then the intent map lists the developer-named intent <name>, with the case as typed, with that hunk

  Examples:
    | name                  |
    | "Add retry logging!"  |
    | "Add retry loggings"  |
    | "Apply a coupon"      |
    | "Add Telemetry Hook"  |
```

## C001-REQ-720

#### C001-AC-720.1 — Rejecting, or naming an intent for, a grouped hunk is refused, naming its intent
```gherkin
Scenario Outline: C001-TS-756 — A decision on orphan code is refused for a hunk grouped under an intent
  Given hunk <hunk> is grouped under the intent <intent>, and the review record holds 4 entries
  When the developer <action>
  Then the action is refused with the error ERR-ACT-005 and a message that names the intent <intent>
  And <hunk> is still grouped under <intent>
  And the review record still holds 4 entries

  Examples:
    | hunk                        | intent              | action                                                                           |
    | "src/price.ts" lines 5-9    | "REQ-013"           | rejects hunk "src/price.ts" lines 5-9 as orphan code with the reason "Not asked" |
    | "src/price.ts" lines 5-9    | "REQ-013"           | creates the intent "Price fix" for hunk "src/price.ts" lines 5-9                 |
    | "src/retry.ts" lines 1-30   | "Add retry logging" | rejects hunk "src/retry.ts" lines 1-30 as orphan code with the reason "Not asked" |
```
```gherkin
Scenario: C001-TS-757 — Naming an intent for one orphan hunk and one grouped hunk creates nothing
  Given orphan code of 1 hunk, "src/telemetry.ts" lines 1-40, and hunk "src/price.ts" lines 5-9 grouped under "REQ-013"
  When the developer creates the intent "Telemetry and price" for "src/telemetry.ts" lines 1-40 and "src/price.ts" lines 5-9
  Then the action is refused with the error ERR-ACT-005 and a message that names "REQ-013"
  And the intent map holds no intent "Telemetry and price"
  And the orphan code still lists "src/telemetry.ts" lines 1-40
```

## C001-REQ-721

#### C001-AC-721.1 — Every action that writes a review record entry is refused while the git user name or e-mail address is not set or blank
```gherkin
Scenario Outline: C001-TS-758 — A verdict is refused, naming each missing or blank git setting
  Given a repository whose effective git configuration has <configuration>
  And intent "REQ-012" whose hunks are all read, without a verdict, and a review record of 4 entries
  When the developer runs `sdd-review sign REQ-012`
  Then the command exits with code 6 and the error ERR-ACT-006, whose message names <missing>
  And the review record still holds 4 entries
  And the decision status reports "REQ-012" as without a verdict

  Examples:
    | configuration                                               | missing                     |
    | no user.name and user.email "ada@example.com"               | user.name                   |
    | user.name "Ada Martin" and no user.email                    | user.email                  |
    | neither user.name nor user.email                            | user.name and user.email    |
    | user.name "   " and user.email "ada@example.com"            | user.name                   |
    | user.name "Ada Martin" and user.email "" (empty)            | user.email                  |
    | user.name "\t" and user.email " "                           | user.name and user.email    |
```
```gherkin
Scenario Outline: C001-TS-759 — Every recorded action is refused without a git identity
  Given a repository whose effective git configuration has user.name "Ada Martin" and no user.email
  And a review whose review record holds 4 entries, with the open hunk "src/coupon.ts" lines 10-24 under "REQ-012", the orphan hunk "src/telemetry.ts" lines 1-40, 2 test hunks under "REQ-013" and the hunk "src/format.ts" lines 3-8 cleared by the formatting rule
  And the evidence bundle of "REQ-012" holds the proposed command `node scripts/try-coupon.js SAVE10`, not confirmed, and no time budget or reading rate is stated for the review
  When the developer <action>
  Then the action is refused with the error ERR-ACT-006, whose message names user.email
  And the review record still holds 4 entries
  And <state>

  Examples:
    | action                                                                                        | state                                                                            |
    | marks "src/coupon.ts" lines 10-24 as read                                                     | "src/coupon.ts" lines 10-24 is still an open hunk                                |
    | marks all open hunks of "REQ-012" as read                                                     | "src/coupon.ts" lines 10-24 is still an open hunk                                |
    | reopens "src/format.ts" lines 3-8                                                             | "src/format.ts" lines 3-8 is still cleared by the formatting rule                |
    | moves "src/coupon.ts" lines 10-24 to orphan code                                              | "src/coupon.ts" lines 10-24 is still grouped under "REQ-012"                     |
    | creates the intent "Telemetry" for orphan hunk "src/telemetry.ts" lines 1-40                  | the intent map holds no intent "Telemetry" and the orphan code still lists "src/telemetry.ts" lines 1-40 |
    | rejects orphan hunk "src/telemetry.ts" lines 1-40 with the reason "Not asked"                 | the decision status reports 1 hunk of orphan code neither attached nor rejected  |
    | records that the test hunks of "REQ-013" express the intent                                   | "REQ-013" has no test judgement                                                  |
    | reports the defect "rounding changed" in "src/format.ts" lines 3-8                            | every hunk cleared by the formatting rule is still cleared                       |
    | states a time budget of 60 minutes                                                            | no time budget is in effect for the review                                       |
    | sets the reading rate 600 changed lines per hour                                              | the reading rate in effect is 300 changed lines per hour                         |
    | adds the command `npm run demo:coupon` to the evidence bundle of "REQ-012"                    | the evidence bundle of "REQ-012" does not list `npm run demo:coupon`             |
    | confirms the proposed command `node scripts/try-coupon.js SAVE10` of "REQ-012"                | `node scripts/try-coupon.js SAVE10` is still not confirmed                       |
    | rejects "REQ-012" with the reason "Wrong rounding"                                            | the decision status reports "REQ-012" as without a verdict                       |
    | defers "REQ-012" with the note "Ask about stacking"                                           | the decision status reports "REQ-012" as without a verdict                       |
```
```gherkin
Scenario: C001-TS-760 — The identity is checked before the open-hunk prompt
  Given a repository whose effective git configuration has no user.name and user.email "ada@example.com"
  And intent "REQ-012" with 2 open hunks of 42 changed lines
  When the developer runs `sdd-review sign REQ-012` on a terminal
  Then no confirmation prompt is shown
  And the command exits with code 6 and the error ERR-ACT-006, whose message names user.name
```
```gherkin
Scenario: C001-TS-761 — Headless analysis and read-only commands work without a git identity
  Given a repository whose effective git configuration has neither user.name nor user.email, with a change of 14 changed files
  When the developer runs `sdd-review analyse --headless --out results`
  Then the command exits with code 0 and writes every file of the headless output to "results"
  And "results/review-record.jsonl" holds no entry
  And `sdd-review status` and `sdd-review intents` then exit with code 0
```
```gherkin
Scenario Outline: C001-TS-762 — An identity set at any level of the effective git configuration is accepted
  Given a repository whose git identity user.name "Ada Martin" and user.email "ada@example.com" is set only in <level>
  And intent "REQ-012" whose hunks are all read, without a verdict
  When the developer runs `sdd-review sign REQ-012`
  Then the command exits with code 0
  And the new review record entry holds the git identity "Ada Martin", "ada@example.com"

  Examples:
    | level                                     |
    | the repository's local git configuration  |
    | the user's global git configuration       |
```
```gherkin
Scenario: C001-TS-763 — A refusal leaves the git configuration unchanged
  Given a repository whose effective git configuration has user.name "Ada Martin" and no user.email, and a byte copy of its ".git/config"
  When the developer runs `sdd-review sign REQ-012`
  Then the command exits with code 6 and the error ERR-ACT-006
  And ".git/config" is byte-identical to the copy and `git config user.email` prints nothing
```
```gherkin
Scenario: C001-TS-765 — Running an evidence bundle, which writes no review record entry, works without a git identity
  Given a repository whose effective git configuration has neither user.name nor user.email
  And the evidence bundle of "REQ-012" holds the confirmed command `node scripts/try-coupon.js SAVE10`, and a review record of 4 entries
  When the developer runs the evidence bundle of "REQ-012"
  Then the evidence output records one run of `node scripts/try-coupon.js SAVE10`
  And no error ERR-ACT-006 is returned
  And the review record still holds 4 entries
```

## C001-REQ-722

#### C001-AC-722.1 — A rejected orphan hunk grouped under an intent is decided by that intent's current verdict, and its rejection entry stays
```gherkin
Scenario Outline: C001-TS-766 — Grouping a rejected orphan hunk ends its decision as a rejection
  Given the review record holds 4 entries, the last the rejection of orphan hunk "src/telemetry.ts" lines 1-40 with the reason "Telemetry was not requested", and a byte copy of that entry
  And intent "REQ-012" has no verdict
  When the developer <action>
  Then the decision status reports "src/telemetry.ts" lines 1-40 under the intent <intent>, decided by its current verdict, which is none yet
  And it no longer reports "src/telemetry.ts" lines 1-40 as a rejected hunk of orphan code
  And the review record holds 5 entries: the rejection entry, byte-identical to the copy, followed by a <entry> entry

  Examples:
    | action                                                                   | intent      | entry          |
    | moves "src/telemetry.ts" lines 1-40 to "REQ-012"                         | "REQ-012"   | hunk move      |
    | creates the intent "Telemetry" for "src/telemetry.ts" lines 1-40         | "Telemetry" | intent created |
```
```gherkin
Scenario: C001-TS-767 — Rejected, moved to an intent and signed: the signature decides the hunk
  Given the developer rejected orphan hunk "src/telemetry.ts" lines 1-40 with the reason "Telemetry was not requested", then moved it to "REQ-012" and marked it read
  And every other hunk of "REQ-012" is read and "REQ-012" has no verdict
  When the developer signs "REQ-012"
  Then the decision status reports "REQ-012" as signed, with "src/telemetry.ts" lines 1-40 among its hunks
  And it reports 0 rejected hunks of orphan code
  And the review record holds, in this order, the rejection of "src/telemetry.ts" lines 1-40, the hunk move to "REQ-012" and the sign verdict on "REQ-012"
```
```gherkin
Scenario: C001-TS-768 — A signature given before the grouping does not accept the rejected hunk
  Given intent "REQ-012" is signed and orphan hunk "src/telemetry.ts" lines 1-40 is rejected with the reason "Telemetry was not requested"
  When the developer moves "src/telemetry.ts" lines 1-40 to "REQ-012"
  Then the decision status reports "REQ-012" as stale with the cause hunks and not as signed
  And it reports "src/telemetry.ts" lines 1-40 under "REQ-012" and not as a rejected hunk of orphan code
  And the review record still holds the rejection entry and the earlier sign entry
```

## Coverage table

| REQ | happy | alternate | boundary | error | authorization | concurrency/idempotency | abuse |
|---|---|---|---|---|---|---|---|
| C001-REQ-701 | TS-701 | TS-702 | n/a: no quantity bound on a sign action; the open-hunk bound is C001-REQ-703 | n/a: refusals of a sign action are C001-REQ-702 and C001-REQ-703; a failed save is C001-REQ-920 | n/a | TS-703 | n/a: misuse of the sign action is covered under C001-REQ-702 |
| C001-REQ-702 | TS-704 | TS-705 | TS-706 | TS-706 | n/a | n/a: one action names one intent; parallel writers are C001-REQ-917 | TS-707 |
| C001-REQ-703 | TS-708, TS-709 | TS-713 | TS-711, TS-712 | TS-710 | n/a | n/a: one prompt answers one sign action | n/a: a confirmation sent from another origin is refused by C001-REQ-907 |
| C001-REQ-704 | TS-714 | n/a: replacing an earlier verdict by a rejection is C001-REQ-708 (TS-725) | TS-715 | n/a: the refusal of an empty reason is C001-REQ-706 (TS-719) | n/a | n/a: parallel writers are C001-REQ-917 | TS-716 |
| C001-REQ-705 | TS-717 | n/a: replacing a deferral is C001-REQ-708 (TS-724) | TS-718 | n/a: the refusal of an empty note is C001-REQ-706 (TS-719, TS-721) | n/a | n/a: parallel writers are C001-REQ-917 | n/a: the note is stored and shown like the reason of C001-REQ-704, whose abuse case is TS-716 |
| C001-REQ-706 | TS-719 | TS-720, TS-764 | TS-720 | TS-719, TS-764 | n/a | n/a: a refused action writes nothing | TS-721 |
| C001-REQ-707 | TS-722 | n/a: every decision type is in the outline of TS-722 | n/a: where the review record is stored is an architecture decision (`ideation.md` §11) | n/a: the requirement has no failure mode; a failed save is C001-REQ-920 | n/a | n/a: a decision is one write | TS-723 |
| C001-REQ-708 | TS-724 | TS-725 | TS-726 | n/a: every verdict may replace every other | n/a | n/a: verdicts from two surfaces at once are C001-REQ-917 (TS-938) | n/a: no input beyond the verdict itself |
| C001-REQ-709 | TS-727 | TS-728 | TS-727, TS-755 | TS-753, TS-754 (C001-REQ-719); TS-756, TS-757 (C001-REQ-720) | n/a | n/a: one creation action | n/a: the name is free text stored like a reason (TS-716) |
| C001-REQ-710 | TS-729 | n/a: one form of rejection | n/a: no quantity bound | TS-719 (C001-REQ-706); TS-756 (C001-REQ-720); TS-759 (C001-REQ-721) | n/a | n/a: parallel writers are C001-REQ-917 | n/a: the reason is stored like the reason of C001-REQ-704 (TS-716) |
| C001-REQ-711 | TS-730 | TS-730 | TS-731 | n/a: a report with no input that can be invalid | n/a | n/a: a read-only report | n/a: a read-only report |
| C001-REQ-712 | TS-732 | TS-733 | TS-734 | TS-758 (a missing git identity: C001-REQ-721) | n/a | n/a: one entry per verdict, see TS-703 | n/a: free-text fields are covered by TS-716 and TS-723 |
| C001-REQ-713 | TS-735 | TS-736 | n/a: a new snapshot keeps earlier records by C001-REQ-118 | n/a: the requirement binds the analysis core's own writes | n/a | n/a: entries from two surfaces at once are C001-REQ-917 | n/a: edits of the record by other programs are outside this requirement |
| C001-REQ-714 | TS-737 | n/a: one file format | n/a: no quantity bound | n/a: the format and its validation errors are defined in `50-interfaces/` | n/a | n/a: a read by another program | n/a: the record holds no executable content |
| C001-REQ-715 | TS-738 | TS-739 | TS-740, TS-741, TS-751 | n/a: an event that only marks state | n/a | n/a: staleness is recomputed from the recorded hunks | n/a: no input of its own |
| C001-REQ-716 | TS-742 | TS-743 | TS-744 | n/a: an event that only marks state | n/a | TS-744 | n/a: no input of its own |
| C001-REQ-717 | TS-745 | TS-746 | TS-747, TS-752 | n/a: an event that only marks state | n/a | n/a: staleness is recomputed from the recorded source text | n/a: no input of its own |
| C001-REQ-718 | TS-748 | TS-749 | TS-750 | n/a: a report with no input that can be invalid | n/a | n/a: a read-only report | n/a: a read-only report |
| C001-REQ-719 | n/a: unwanted-behaviour requirement, its scenarios are in the error column | TS-754 | TS-755 | TS-753, TS-754 | n/a | n/a: one creation action; a refused action writes nothing | TS-754 (whitespace and case variants of a taken name) |
| C001-REQ-720 | n/a: unwanted-behaviour requirement, its scenarios are in the error column | TS-757 | TS-757 | TS-756 | n/a | n/a: a refused action writes nothing | n/a: the hunk and the action are chosen by the developer; no input of the change reaches the check |
| C001-REQ-721 | n/a: unwanted-behaviour requirement, its scenarios are in the error column | TS-759, TS-761 | TS-760, TS-762, TS-765 | TS-758, TS-759 | n/a | n/a: a refused action writes nothing | TS-758 (blank values), TS-763 |
| C001-REQ-722 | TS-766 | TS-766, TS-767 | TS-767 | n/a: the grouping itself has the refusals of C001-REQ-719 (TS-754) and C001-REQ-721 (TS-759); this requirement only sets how the grouped hunk is decided | n/a | n/a: one grouping action; parallel writers are C001-REQ-917 | TS-768 (a signature given before the grouping does not accept the rejected hunk) |

Authorization (every row): `n/a` — one developer works on the local machine and the first version
has no roles; requests that reach the local review UI from other origins or host names are refused
by C001-REQ-906 and C001-REQ-907 (`CAP-09-review-surfaces/acceptance.md`).
