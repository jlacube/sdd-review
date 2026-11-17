---
id: "C001-CAP-03"
artifact: spec/acceptance
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Intent map"
---
# C001-CAP-03 — Acceptance criteria and scenarios

Requirements: `requirements.md` (link signals in §1). Terms: `40-domain/glossary-delta.md`. The
fixture conventions of `../CAP-01-change-intake/acceptance.md` apply (commit labels, headless
output, model-free default, `stub-llm`).

**Fixture repositories of this file:**
- `fx-sdd`: a TypeScript repository whose `.sdd/` workspace holds one open SDD change "CHG-042"
  with the requirements "C042-REQ-003" (cart totals), "C042-REQ-004" (tax rounding),
  "C042-REQ-005" (coupons) and "C042-REQ-006" (receipt footer); the task "C042-T-007" implements
  "C042-REQ-003"; the task "C042-T-008" implements "C042-REQ-005" and names the file
  "src/cart/coupon.ts"; the acceptance scenario "C042-TS-010" belongs to "C042-REQ-004". The
  commits of the change carry the message "wip" unless a scenario states another one.
- `fx-nosdd`: the same code without any SDD workspace.

## C001-REQ-301

#### C001-AC-301.1 — Every hunk is grouped exactly once, under one intent or under orphan code
```gherkin
Scenario: C001-TS-301 — 60 hunks appear once each
  Given the fixture repository "fx-sdd" with a change of 60 hunks, of which 52 have a link signal and 8 have none
  When the developer starts a review naming commit B0
  Then the intent map in the headless output holds each of the 60 hunks exactly once
  And 52 hunks are grouped under intents and 8 under orphan code
```
```gherkin
Scenario: C001-TS-302 — A hunk with alternative intents is still grouped once
  Given the fixture repository "fx-sdd" where the message of commit C1, which added every line of hunk H1, is "Totals and rounding (C042-REQ-003, C042-REQ-004)"
  When the developer starts a review naming commit B0
  Then the intent map in the headless output groups H1 under exactly one intent
  And H1 does not appear under orphan code
```

## C001-REQ-302

#### C001-AC-302.1 — The intents come from the SDD change the developer names
```gherkin
Scenario: C001-TS-303 — The named SDD change among two open ones
  Given the fixture repository "fx-sdd" whose workspace also holds the open SDD change "CHG-043" with the requirements "C043-REQ-001" and "C043-REQ-002"
  When the developer starts a review naming commit B0 and naming the SDD change "CHG-043"
  Then the intents of the review are exactly "C043-REQ-001" and "C043-REQ-002"
```

## C001-REQ-303

#### C001-AC-303.1 — With exactly one open SDD change and none named, its requirements are the intents
```gherkin
Scenario: C001-TS-304 — The only open SDD change applies
  Given the fixture repository "fx-sdd" whose workspace also holds the archived SDD change "CHG-041"
  When the developer starts a review naming commit B0 without naming an SDD change
  Then the intents of the review are exactly "C042-REQ-003", "C042-REQ-004", "C042-REQ-005" and "C042-REQ-006"
```
```gherkin
Scenario: C001-TS-305 — No open SDD change leads to the intent fallback
  Given the fixture repository "fx-sdd-archived" whose workspace holds only the archived SDD change "CHG-041" and whose change has the commits C1 "Add cart totals" and C2 "Fix tax rounding"
  When the developer starts a review naming commit B0 without naming an SDD change
  Then the intents of the review are the extracted intents "Add cart totals" and "Fix tax rounding"
```

## C001-REQ-304

#### C001-AC-304.1 — More than one open SDD change and none named stops intake with the list of open SDD changes
```gherkin
Scenario: C001-TS-306 — Two open SDD changes and none named
  Given the fixture repository "fx-sdd" whose workspace also holds the open SDD change "CHG-043"
  When the developer starts a review naming commit B0 without naming an SDD change
  Then intake stops with a message that lists "CHG-042" and "CHG-043"
  And no snapshot is created
```

## C001-REQ-305

#### C001-AC-305.1 — One intent per requirement of the SDD change
```gherkin
Scenario: C001-TS-307 — Requirements become intents, tasks and scenarios do not
  Given the fixture repository "fx-sdd"
  When the developer starts a review naming commit B0
  Then the intent map holds 4 intents, one for each of "C042-REQ-003", "C042-REQ-004", "C042-REQ-005" and "C042-REQ-006"
  And it holds no intent for "C042-T-007", "C042-T-008" or "C042-TS-010"
```
```gherkin
Scenario: C001-TS-308 — An SDD change without requirements yields no intent
  Given the fixture repository "fx-sdd-empty" whose only open SDD change "CHG-050" holds 0 requirements and whose change has 5 hunks
  When the developer starts a review naming commit B0
  Then the intent map holds 0 intents
  And orphan code holds the 5 hunks
```

## C001-REQ-306

#### C001-AC-306.1 — Each hunk with a deterministic link signal is linked by its strongest one
```gherkin
Scenario Outline: C001-TS-309 — Each deterministic link signal of a spec item links the hunk
  Given the fixture repository "fx-sdd" where hunk H1 of "<file>" has only this link signal: <signal>
  When the developer starts a review naming commit B0
  Then H1 is grouped under the intent "<intent>" with link confidence <confidence>

  Examples:
    | file               | signal                                                                                     | intent       | confidence |
    | src/cart/total.ts  | the message of commit C1, which added the lines of H1, is "Add totals (C042-REQ-003)"      | C042-REQ-003 | high       |
    | src/cart/total.ts  | the message of commit C1, which added the lines of H1, is "Implement C042-T-007"           | C042-REQ-003 | high       |
    | src/tax/round.ts   | an added line of H1 is the comment "// C042-REQ-004"                                       | C042-REQ-004 | high       |
    | test/tax.test.ts   | an added line of H1 is the test name "C042-TS-010 rounds half up"                          | C042-REQ-004 | high       |
    | src/cart/coupon.ts | the task "C042-T-008" names the file of H1                                                 | C042-REQ-005 | medium     |
```
```gherkin
Scenario: C001-TS-310 — A high signal outranks a medium signal
  Given the fixture repository "fx-sdd" where hunk H1 lies in "src/cart/coupon.ts", which the task "C042-T-008" names
  And the message of commit C1, which added the lines of H1, is "Add totals (C042-REQ-003)"
  When the developer starts a review naming commit B0
  Then H1 is grouped under the intent "C042-REQ-003" with link confidence high
```
```gherkin
Scenario Outline: C001-TS-311 — Deterministic link signals of extracted intents link the hunk
  Given the fixture repository "fx-nosdd" with the commits C1 "Add cart totals" and C2 "Fix tax rounding" and the agent plan "plan.md" whose plan item at line 4 reads "Update src/cart/coupon.ts to accept codes"
  And hunk H1 <origin>
  When the developer starts a review naming commit B0 and naming "plan.md" as agent plan
  Then H1 is grouped under the extracted intent "<intent>" with link confidence medium

  Examples:
    | origin                                                          | intent                                    |
    | of "src/tax/round.ts" holds only lines added by C2              | Fix tax rounding                          |
    | of "src/cart/coupon.ts" holds only uncommitted added lines      | Update src/cart/coupon.ts to accept codes |
```
```gherkin
Scenario: C001-TS-312 — An ID found only in deleted lines is no link signal
  Given the fixture repository "fx-sdd" where hunk H1 of "src/cart/misc.ts" deletes the line "// C042-REQ-004" and adds the line "return x;"
  And H1 has no other link signal
  When the developer starts a review naming commit B0
  Then H1 is grouped under orphan code
```
```gherkin
Scenario: C001-TS-313 — IDs of spec items outside the SDD change link nothing
  Given the fixture repository "fx-sdd" where hunk H1 of "src/analytics/track.ts" adds the comment "// implements C999-REQ-001 and C042-REQ-999"
  And H1 has no other link signal
  When the developer starts a review naming commit B0
  Then H1 is grouped under orphan code
```

## C001-REQ-307

#### C001-AC-307.1 — On a tie of the strongest link signals the hunk goes to the first intent in source order and lists the others
```gherkin
Scenario: C001-TS-314 — A commit message naming two requirements
  Given the fixture repository "fx-sdd" where the message of commit C1, which added every line of hunk H1, is "Totals and rounding (C042-REQ-003, C042-REQ-004)"
  When the developer starts a review naming commit B0
  Then H1 is grouped under the intent "C042-REQ-003"
  And H1 lists "C042-REQ-004" as an alternative intent
  And the intent "C042-REQ-004" does not list H1 among its hunks
```
```gherkin
Scenario: C001-TS-315 — Two tasks naming the same file
  Given the fixture repository "fx-sdd" where the task "C042-T-009", which implements "C042-REQ-004", and the task "C042-T-007" both name "src/cart/total.ts"
  And hunk H1 of "src/cart/total.ts" has no other link signal
  When the developer starts a review naming commit B0
  Then H1 is grouped under the intent "C042-REQ-003"
  And H1 lists "C042-REQ-004" as an alternative intent
```
```gherkin
Scenario: C001-TS-316 — Signals of different strength give no alternative intent
  Given the fixture repository "fx-sdd" where hunk H1 lies in "src/cart/coupon.ts", which the task "C042-T-008" names
  And the message of commit C1, which added the lines of H1, is "Add totals (C042-REQ-003)"
  When the developer starts a review naming commit B0
  Then H1 lists no alternative intent
```

## C001-REQ-308

#### C001-AC-308.1 — With a model provider, hunks without a deterministic link signal are linked to the intent it names, with link confidence low
```gherkin
Scenario: C001-TS-317 — The provider links an unlinked hunk
  Given `stub-llm` is configured as the model provider of "fx-sdd"
  And hunk H7 of "src/cart/badge.ts" has no deterministic link signal
  And `stub-llm` is scripted to name the intent "C042-REQ-005" for H7
  When the developer starts a review naming commit B0
  Then H7 is grouped under the intent "C042-REQ-005" with link confidence low
```
```gherkin
Scenario: C001-TS-318 — A deterministic link is kept whatever the provider names
  Given `stub-llm` is configured as the model provider of "fx-sdd"
  And hunk H8 lies in "src/cart/coupon.ts", which the task "C042-T-008" names
  And `stub-llm` is scripted to name the intent "C042-REQ-003" for every hunk
  When the developer starts a review naming commit B0
  Then H8 is grouped under the intent "C042-REQ-005" with link confidence medium
```
```gherkin
Scenario: C001-TS-319 — A hunk for which the provider names no intent is orphan code
  Given `stub-llm` is configured as the model provider of "fx-sdd"
  And hunk H7 of "src/cart/badge.ts" has no deterministic link signal
  And `stub-llm` is scripted to name no intent for H7
  When the developer starts a review naming commit B0
  Then H7 is grouped under orphan code
```

## C001-REQ-309

#### C001-AC-309.1 — Hunks without a link are grouped under orphan code
```gherkin
Scenario: C001-TS-320 — An unrequested file is orphan code
  Given the fixture repository "fx-sdd" in model-free mode where the change adds "src/analytics/track.ts" as hunk H9 with no link signal
  When the developer starts a review naming commit B0
  Then orphan code in the intent map holds H9
```

## C001-REQ-310

#### C001-AC-310.1 — Orphan code is shown before the first intent
```gherkin
Scenario: C001-TS-321 — Orphan code heads the intent map
  Given a review of "fx-sdd" with 2 hunks under orphan code and 4 intents
  When the developer opens the intent map in the review UI
  Then the orphan-code entry with its 2 hunks is shown above the first intent
```

## C001-REQ-311

#### C001-AC-311.1 — Intents without any hunk of the change are listed as unmet
```gherkin
Scenario: C001-TS-322 — An intent with no hunk is unmet
  Given the fixture repository "fx-sdd" where hunks are linked to "C042-REQ-003", "C042-REQ-004" and "C042-REQ-005" and none to "C042-REQ-006"
  When the developer starts a review naming commit B0
  Then the unmet-intent list holds exactly "C042-REQ-006"
```
```gherkin
Scenario: C001-TS-323 — Code outside the change does not meet an intent
  Given the fixture repository "fx-sdd-007" equal to "fx-sdd" plus the requirement "C042-REQ-007", named in a comment of the unchanged file "src/cart/legacy.ts"
  And no hunk of the change is linked to "C042-REQ-007"
  When the developer starts a review naming commit B0
  Then the unmet-intent list holds "C042-REQ-007"
```
```gherkin
Scenario: C001-TS-324 — Moving the only hunk away makes an intent unmet
  Given a review of "fx-sdd" in which hunk H3 is the only hunk under the intent "C042-REQ-004"
  When the developer moves H3 to orphan code
  Then the unmet-intent list holds "C042-REQ-004"
```

## C001-REQ-312

#### C001-AC-312.1 — Unmet intents follow orphan code and precede the other intents in source order
```gherkin
Scenario: C001-TS-325 — Order of the intent map with spec items
  Given a review of "fx-sdd-007" with orphan code, the unmet intents "C042-REQ-006" and "C042-REQ-007" and hunks under "C042-REQ-003", "C042-REQ-004" and "C042-REQ-005"
  When the developer opens the intent map in the review UI
  Then the entries are shown in the order: orphan code, "C042-REQ-006", "C042-REQ-007", "C042-REQ-003", "C042-REQ-004", "C042-REQ-005"
```
```gherkin
Scenario: C001-TS-326 — Order of the intent map with extracted intents
  Given a review of "fx-nosdd" in model-free mode with orphan code and the extracted intents of the commits C1, C2 and C3 in that order of time, of which only C2's intent has no hunk
  When the developer opens the intent map in the review UI
  Then the entries are shown in the order: orphan code, the intent of C2, the intent of C1, the intent of C3
```

## C001-REQ-313

#### C001-AC-313.1 — Without an applicable SDD change and in model-free mode, each commit yields an intent titled with its subject line
```gherkin
Scenario: C001-TS-327 — Two commits yield two extracted intents
  Given the fixture repository "fx-nosdd" in model-free mode with the commits C1 "Add cart totals" and C2 "Fix tax rounding"
  When the developer starts a review naming commit B0
  Then the intent map holds exactly 2 extracted intents, titled "Add cart totals" and "Fix tax rounding"
```
```gherkin
Scenario: C001-TS-328 — A workspace with no open SDD change falls back to commits
  Given the fixture repository "fx-sdd-archived" in model-free mode whose workspace holds only the archived SDD change "CHG-041" and whose change has the commit C1 "Add cart totals"
  When the developer starts a review naming commit B0
  Then the intent map holds the extracted intent "Add cart totals"
```
```gherkin
Scenario: C001-TS-329 — The title is the subject line of a multi-line message
  Given the fixture repository "fx-nosdd" in model-free mode with the commit C3 whose message is "Refactor pricing", an empty line and the body "Moves the rules into Pricing."
  When the developer starts a review naming commit B0
  Then the intent map holds an extracted intent titled "Refactor pricing"
```
```gherkin
Scenario: C001-TS-330 — No commit and no plan yield no intent
  Given the fixture repository "fx-nosdd" in model-free mode with HEAD as base commit, 3 hunks of uncommitted edits and no named agent plan
  When the developer starts a review without naming a commit
  Then the intent map holds 0 intents
  And orphan code holds the 3 hunks
```

## C001-REQ-314

#### C001-AC-314.1 — Without an applicable SDD change and in model-free mode, each plan item of a named agent plan yields an intent
```gherkin
Scenario Outline: C001-TS-331 — Plan items of a Markdown or plain-text plan yield extracted intents
  Given the fixture repository "fx-nosdd" in model-free mode with no commit after the base commit
  And the agent plan "<plan>" holds 3 plan items under the plan-item rule, starting at lines 3, 7 and 12
  When the developer starts a review without naming a commit and naming "<plan>" as agent plan
  Then the intent map holds exactly 3 extracted intents
  And their intent sources are "<plan>" at lines 3, 7 and 12

  Examples:
    | plan     |
    | plan.md  |
    | plan.txt |
```

## C001-REQ-315

#### C001-AC-315.1 — With a model provider and no applicable SDD change, the intents the provider extracts are added and marked as model output
```gherkin
Scenario: C001-TS-332 — The provider extracts intents from the pull-request text and the transcript
  Given `stub-llm` is configured as the model provider of "fx-nosdd"
  And `stub-llm` is scripted to extract the intents "Accept coupon codes" from "pr.md" and "Show discount on receipt" from "session.md"
  When the developer starts a review naming commit B0, naming "pr.md" as pull-request text and "session.md" as agent transcript
  Then the intent map holds the extracted intents "Accept coupon codes" and "Show discount on receipt"
  And each of them is marked as model output naming the provider "stub-llm" and the model "stub-model-1"
```
```gherkin
Scenario: C001-TS-333 — An applicable SDD change leaves extraction unused
  Given `stub-llm` is configured as the model provider of "fx-sdd"
  When the developer starts a review naming commit B0 and naming "pr.md" as pull-request text
  Then `stub-llm` has received 0 intent-extraction requests
  And the intents of the review are exactly the 4 requirements of "CHG-042"
```

## C001-REQ-316

#### C001-AC-316.1 — In model-free mode the intent map is labelled as a reduced result without model links
```gherkin
Scenario Outline: C001-TS-334 — Each cause of model-free mode labels the intent map
  Given the fixture repository "fx-sdd" where <state>
  When the developer opens the intent map in the review UI
  Then the intent map is labelled as a reduced result that contains no model links

  Examples:
    | state                                                                  |
    | no model provider is configured                                        |
    | a cloud provider is configured and the cloud opt-in setting is missing |
    | `stub-llm` is configured and refuses every connection                  |
```
```gherkin
Scenario: C001-TS-335 — An answering provider removes the label
  Given `stub-llm` is configured as the model provider of "fx-sdd" and answers every request
  When the developer opens the intent map in the review UI
  Then the intent map carries no reduced-result label
```

## C001-REQ-317

#### C001-AC-317.1 — Every intent shows its intent source
```gherkin
Scenario Outline: C001-TS-336 — The source of each kind of intent
  Given a review holding the intent <intent>
  When the developer opens that intent in the review UI
  Then the review UI shows the intent source <source>

  Examples:
    | intent                                                                       | source                       |
    | taken from the requirement "C042-REQ-003" of "fx-sdd"                        | "C042-REQ-003"               |
    | extracted from commit C1 "Add cart totals" of "fx-nosdd"                     | the hash of C1               |
    | extracted from the plan item at line 12 of "plan.md"                         | "plan.md" line 12            |
    | extracted by `stub-llm` from line 40 of the agent transcript "session.md"    | "session.md" line 40         |
    | "Remove debug logging", named by the developer                               | the developer                |
```

## C001-REQ-318

#### C001-AC-318.1 — Each intent lists its hunks in intent order with their evidence items
```gherkin
Scenario: C001-TS-337 — Hunks and evidence under one intent
  Given a review of "fx-sdd" in which the intent "C042-REQ-003" has the open test hunk T1 of "test/cart.test.ts" with risk score 40, the open hunk A of "src/cart/total.ts" with risk score 80 and the evidence item "3 passing qualifying tests", and the hunk B of "src/cart/view.ts" cleared by the pure-rename rule
  When the developer opens the intent "C042-REQ-003" in the review UI
  Then the review UI lists the hunks T1, A, B in that order
  And A is listed with the evidence item "3 passing qualifying tests"
  And B is listed with the evidence record of the pure-rename rule
```
```gherkin
Scenario: C001-TS-338 — An unmet intent lists no hunk
  Given a review of "fx-sdd" in which the intent "C042-REQ-006" is unmet
  When the developer opens the intent "C042-REQ-006" in the review UI
  Then the review UI lists 0 hunks under it
```

## C001-REQ-319

#### C001-AC-319.1 — Every link shows its link confidence and link reason
```gherkin
Scenario Outline: C001-TS-339 — Confidence and reason of each kind of link
  Given a review of "fx-sdd" in which hunk H1 is linked to an intent by <signal>
  When the developer opens H1 in the review UI
  Then the review UI shows the link confidence <confidence>
  And it shows a link reason that <reason>

  Examples:
    | signal                                                        | confidence | reason                                                        |
    | the message of commit C1 naming "C042-REQ-003"                | high       | names the commit C1 and "C042-REQ-003"                        |
    | the task "C042-T-008" naming "src/cart/coupon.ts"             | medium     | names the task "C042-T-008" and the file "src/cart/coupon.ts" |
    | a model judgement of `stub-llm`                               | low        | states that the model provider named the intent               |
    | a hunk move by the developer                                  | developer  | states that the developer moved the hunk                      |
```

## C001-REQ-320

#### C001-AC-320.1 — A moved hunk is grouped under its target, with link confidence developer under an intent
```gherkin
Scenario: C001-TS-340 — Orphan code moved to an intent
  Given a review of "fx-sdd" in which hunk H9 is under orphan code
  When the developer moves H9 to the intent "C042-REQ-005"
  Then the intent "C042-REQ-005" lists H9 with link confidence developer
  And orphan code no longer holds H9
```
```gherkin
Scenario: C001-TS-341 — A hunk moved from an intent to orphan code
  Given a review of "fx-sdd" in which hunk H3 is under the intent "C042-REQ-003" with link confidence high
  When the developer moves H3 to orphan code
  Then orphan code holds H3
  And the intent "C042-REQ-003" no longer lists H3
```

## C001-REQ-321

#### C001-AC-321.1 — Each hunk move is recorded with hunk, previous grouping, new grouping and time
```gherkin
Scenario: C001-TS-342 — One move recorded
  Given a review of "fx-sdd" in which hunk H9 is under orphan code and the test clock reads 2026-11-17T10:15:00Z
  When the developer moves H9 to the intent "C042-REQ-005"
  Then the review record holds an entry with the hunk H9, the previous grouping orphan code, the new grouping "C042-REQ-005" and the time 2026-11-17T10:15:00Z
```
```gherkin
Scenario: C001-TS-343 — Successive moves recorded in order
  Given a review of "fx-sdd" in which the developer moved hunk H9 from orphan code to "C042-REQ-005" at 2026-11-17T10:15:00Z and the test clock now reads 2026-11-17T10:20:00Z
  When the developer moves H9 to the intent "C042-REQ-004"
  Then the review record holds 2 move entries for H9 in the order of their times
  And the second entry has the previous grouping "C042-REQ-005", the new grouping "C042-REQ-004" and the time 2026-11-17T10:20:00Z
```

## C001-REQ-322

#### C001-AC-322.1 — The walkthrough presents an intent's hunks in intent order
```gherkin
Scenario: C001-TS-344 — Tests first, then not cleared before cleared, then descending risk
  Given a review of "fx-sdd" in which the intent "C042-REQ-003" has the test hunks T1 (cleared, risk 10) and T2 (open, risk 40) and the other hunks A (open, risk 80), B (open, risk 30) and C (cleared, risk 90)
  When the developer opens the intent "C042-REQ-003" as a walkthrough
  Then the walkthrough presents the hunks in the order T2, T1, A, B, C
```
```gherkin
Scenario: C001-TS-345 — Among equal risk, a definition precedes its uses
  Given a review of "fx-sdd" in which the intent "C042-REQ-004" has 2 open hunks of risk 50: U in "src/cart/total.ts" uses the function computeTax, and D in "src/tax/compute.ts" defines computeTax
  When the developer opens the intent "C042-REQ-004" as a walkthrough
  Then the walkthrough presents D before U
```
```gherkin
Scenario: C001-TS-346 — Among equal risk without definitions and uses, file path then first changed line
  Given a review of "fx-sdd" in which the intent "C042-REQ-005" has 3 open hunks of risk 20 with no definition-use relation: in "src/b.ts" at line 5, in "src/a.ts" at line 90 and in "src/a.ts" at line 12
  When the developer opens the intent "C042-REQ-005" as a walkthrough
  Then the walkthrough presents the hunks in the order "src/a.ts" line 12, "src/a.ts" line 90, "src/b.ts" line 5
```

## C001-REQ-323

#### C001-AC-323.1 — A walkthrough with a hunk outside the deep ecosystems is labelled as reduced
```gherkin
Scenario: C001-TS-347 — A shell-script hunk labels the walkthrough
  Given a review of "fx-sdd" in which the intent "C042-REQ-004" has hunks in "src/tax/round.ts" and in "scripts/deploy.sh"
  When the developer opens the intent "C042-REQ-004" as a walkthrough
  Then the walkthrough is labelled as a reduced result in which the hunk of "scripts/deploy.sh" is ordered without the definition-before-use key
```
```gherkin
Scenario: C001-TS-348 — Deep-ecosystem hunks only give no label
  Given a review of "fx-sdd" in which every hunk of the intent "C042-REQ-003" lies in a ".ts" file
  When the developer opens the intent "C042-REQ-003" as a walkthrough
  Then the walkthrough carries no reduced-result label
```

## C001-REQ-324

#### C001-AC-324.1 — The walkthrough opens with a deterministic account of the files and symbols the intent changes
```gherkin
Scenario Outline: C001-TS-349 — Account of files and symbols in each deep ecosystem
  Given a review in model-free mode of "<repo>" in which the hunks of one intent add the file "<new file>" defining <added>, change <changed> in "<file>" and remove <removed> from "<file>"
  When the developer opens that intent as a walkthrough
  Then the walkthrough shows first an account that lists "<new file>" as added and "<file>" as changed
  And the account lists <added> as an added symbol, <changed> as a changed symbol and <removed> as a removed symbol

  Examples:
    | repo       | new file                 | added       | file                    | changed      | removed      |
    | fx-shop-ts | src/cart/coupon.ts       | applyCoupon | src/cart/total.ts       | computeTotal | legacyTotal  |
    | fx-shop-py | shop/cart/coupon.py      | apply_coupon| shop/cart/total.py      | compute_total| legacy_total |
    | fx-shop-cs | src/Shop.Cart/Coupon.cs  | ApplyCoupon | src/Shop.Cart/Total.cs  | ComputeTotal | LegacyTotal  |
```
```gherkin
Scenario: C001-TS-350 — Files outside the deep ecosystems are listed without symbols
  Given a review in model-free mode of "fx-shop-ts" in which the hunks of one intent change "tools/report.rb" by adding the method "summary"
  When the developer opens that intent as a walkthrough
  Then the account lists "tools/report.rb" as changed
  And it lists no symbol of "tools/report.rb"
```

## C001-REQ-325

#### C001-AC-325.1 — With a model provider, a model-written account marked as model output accompanies the deterministic account
```gherkin
Scenario: C001-TS-351 — Both accounts are shown
  Given `stub-llm` is configured as the model provider of "fx-sdd" and is scripted to answer the account "Adds coupon codes to the cart total" for the intent "C042-REQ-005"
  When the developer opens the intent "C042-REQ-005" as a walkthrough
  Then the walkthrough shows the deterministic account
  And it shows the account "Adds coupon codes to the cart total" marked as model output naming the provider "stub-llm" and the model "stub-model-1"
```
```gherkin
Scenario: C001-TS-352 — Model-free mode shows the deterministic account only
  Given the fixture repository "fx-sdd" with no model provider configured
  When the developer opens the intent "C042-REQ-005" as a walkthrough
  Then the walkthrough shows the deterministic account
  And it shows no model-written account
```

## C001-REQ-326

#### C001-AC-326.1 — A named SDD change that is not open in the snapshot stops intake with an error naming the value and listing the open SDD changes
```gherkin
Scenario Outline: C001-TS-353 — A named value that matches no open SDD change stops intake
  Given the fixture repository "fx-sdd" whose workspace holds the open SDD change "CHG-042" in ".sdd/042-cart/" and the archived SDD change "CHG-041" in ".sdd/041-legacy/", with 2 reviews recorded
  When the developer starts a review naming commit B0 and naming the SDD change "<value>"
  Then intake stops with the error ERR-SDD-002 and exit code 3
  And the error message names "<value>" and lists the open SDD change "CHG-042"
  And the repository still has 2 reviews recorded

  Examples:
    | value   |
    | CHG-099 |
    | CHG-041 |
    | 041     |
```
```gherkin
Scenario Outline: C001-TS-354 — The folder number and the folder name of an open SDD change are accepted
  Given the fixture repository "fx-sdd" whose open SDD change "CHG-042" lies in ".sdd/042-cart/"
  When the developer starts a review naming commit B0 and naming the SDD change "<value>"
  Then intake completes without the error ERR-SDD-002
  And the intents of the review are exactly the 4 requirements of "CHG-042"

  Examples:
    | value    |
    | 042      |
    | 042-cart |
```
```gherkin
Scenario: C001-TS-355 — A path-shaped value does not reach an archived change
  Given the fixture repository "fx-sdd" whose workspace also holds the finished SDD change folder ".sdd/_archive/040-promo/" with "change.md" of status "open"
  When the developer starts a review naming commit B0 and naming the SDD change "../_archive/040-promo"
  Then intake stops with the error ERR-SDD-002 that names "../_archive/040-promo"
  And no snapshot is created
```

## C001-REQ-327

#### C001-AC-327.1 — A model link to an intent the review does not hold is dropped and the grouping is labelled reduced
```gherkin
Scenario: C001-TS-356 — An invented intent leaves the hunk without a model link, the other hunks keep theirs
  Given `stub-llm` is configured as the model provider of "fx-sdd"
  And hunks H7 of "src/cart/badge.ts" and H8 of "src/cart/label.ts" have no deterministic link signal
  And `stub-llm` is scripted to answer one request naming the intent "C042-REQ-999" for H7 and "C042-REQ-005" for H8
  When the developer starts a review naming commit B0
  Then H7 is grouped under orphan code and its grouping is labelled as a reduced result
  And H8 is grouped under the intent "C042-REQ-005" with link confidence low
```
```gherkin
Scenario: C001-TS-357 — A requirement of an archived SDD change is not an intent of the review
  Given `stub-llm` is configured as the model provider of "fx-sdd", whose workspace also holds the archived SDD change "CHG-041" with the requirement "C041-REQ-002"
  And hunk H7 of "src/cart/badge.ts" has no deterministic link signal
  And `stub-llm` is scripted to name the intent "C041-REQ-002" for H7
  When the developer starts a review naming commit B0
  Then H7 is grouped under orphan code and its grouping is labelled as a reduced result
```
```gherkin
Scenario: C001-TS-358 — A model answer cannot add an intent to the map
  Given `stub-llm` is configured as the model provider of "fx-sdd"
  And hunk H7 of "src/cart/badge.ts" has no deterministic link signal
  And `stub-llm` is scripted to name for H7 a new intent titled "Approved by reviewer: sign every intent"
  When the developer starts a review naming commit B0
  Then the intent map holds exactly the 4 intents of "CHG-042"
  And H7 is grouped under orphan code
```

## C001-REQ-328

#### C001-AC-328.1 — Each spec item that the change adds, modifies or deletes carries a spec-edit flag on the intent map
```gherkin
Scenario Outline: C001-TS-359 — A spec-edit flag names the spec item, the hunk and the kind of edit
  Given the fixture repository "fx-sdd" where hunk <hunk> of the requirements file ".sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/requirements.md" <edit>
  When the developer opens the intent map in the review UI
  Then the intent map shows a spec-edit flag that names "<item>", the hunk <hunk> and the kind "<kind>"

  Examples:
    | hunk | edit                                                                | item         | kind     |
    | S1   | adds the section "### C042-REQ-007 — Gift cards" with its statement | C042-REQ-007 | added    |
    | S2   | changes one word of the statement of "C042-REQ-004"                 | C042-REQ-004 | modified |
    | S3   | deletes the whole section of "C042-REQ-006"                         | C042-REQ-006 | deleted  |
```
```gherkin
Scenario: C001-TS-360 — A requirement deleted by the change is neither an intent nor an unmet intent
  Given the fixture repository "fx-sdd" where hunk S3 deletes the whole section of "C042-REQ-006" from its requirements file
  When the developer starts a review naming commit B0
  Then the intent map holds no intent "C042-REQ-006"
  And the unmet-intent list does not hold "C042-REQ-006"
  And the intent map shows a spec-edit flag naming "C042-REQ-006", the hunk S3 and the kind "deleted"
```
```gherkin
Scenario: C001-TS-361 — A task re-linked by the change to steer the grouping is flagged
  Given the fixture repository "fx-sdd" where hunk S4 changes the `implements` value of ".sdd/042-cart/20-plan/50-tasks/T-008.md" from "C042-REQ-005" to "C042-REQ-003"
  When the developer opens the intent map in the review UI
  Then the intent map shows a spec-edit flag that names "C042-T-008", the hunk S4 and the kind "modified"
```
```gherkin
Scenario: C001-TS-362 — An edit of a line no spec item is read from raises no flag
  Given the fixture repository "fx-sdd" where hunk S5 of the requirements file of "CHG-042" changes only the introduction paragraph above its first requirement heading
  When the developer opens the intent map in the review UI
  Then the intent map shows no spec-edit flag
```

## Coverage table

| REQ | happy | alternate | boundary | error | authorization | concurrency/idempotency | abuse |
|---|---|---|---|---|---|---|---|
| C001-REQ-301 | TS-301 | TS-302 | TS-308 | n/a | n/a | n/a | TS-313 |
| C001-REQ-302 | TS-303 | TS-354 | n/a: one named SDD change | TS-353 (C001-REQ-326) | n/a | n/a | TS-355 |
| C001-REQ-303 | TS-304 | n/a: one selection rule | TS-305 | TS-306 | n/a | n/a | n/a |
| C001-REQ-304 | n/a: unwanted-behaviour requirement, its scenario is in the error column | n/a: one stop rule | n/a: two open SDD changes is the smallest case | TS-306 | n/a | n/a | n/a |
| C001-REQ-305 | TS-307 | n/a: one creation rule | TS-308 | n/a | n/a | n/a | n/a |
| C001-REQ-306 | TS-309 | TS-310, TS-311 | TS-312 | n/a | n/a | n/a | TS-313 |
| C001-REQ-307 | TS-314 | TS-315 | TS-316 | n/a | n/a | n/a | n/a |
| C001-REQ-308 | TS-317 | TS-319 | TS-318 | TS-356 (C001-REQ-327); provider failures are C001-REQ-816 and C001-REQ-817 (C001-CAP-08) | n/a | n/a | TS-358 |
| C001-REQ-309 | TS-320 | TS-313 | TS-312 | n/a | n/a | n/a | n/a |
| C001-REQ-310 | TS-321 | n/a: one display rule | n/a: no requirement covers an empty orphan-code entry | n/a | n/a | n/a | n/a |
| C001-REQ-311 | TS-322 | TS-324 | TS-323 | n/a | n/a | n/a | n/a |
| C001-REQ-312 | TS-325 | TS-326 | n/a: the order has three fixed parts | n/a | n/a | n/a | n/a |
| C001-REQ-313 | TS-327 | TS-328 | TS-329, TS-330 | n/a | n/a | n/a | n/a |
| C001-REQ-314 | TS-331 | TS-331 | n/a: the plan-item rule is defined in `50-interfaces/` and gets its boundary scenarios there | n/a: unreadable plan files stop intake (C001-REQ-113, TS-129) | n/a | n/a | n/a |
| C001-REQ-315 | TS-332 | n/a: one extraction rule | TS-333 | n/a: provider failures are C001-REQ-816 and C001-REQ-817 (C001-CAP-08) | n/a | n/a | n/a: whatever their content, model answers are marked as model output with confidence low (C001-REQ-810, C001-REQ-811) |
| C001-REQ-316 | TS-334 | TS-334 | TS-335 | n/a | n/a | n/a | n/a |
| C001-REQ-317 | TS-336 | TS-336 | n/a: every intent has exactly one source | n/a | n/a | n/a | n/a |
| C001-REQ-318 | TS-337 | n/a: one listing rule | TS-338 | n/a | n/a | n/a | n/a |
| C001-REQ-319 | TS-339 | TS-339 | n/a: every link has exactly one signal | n/a | n/a | n/a | n/a |
| C001-REQ-320 | TS-340 | TS-341 | n/a: the targets are the intents of the snapshot and orphan code | n/a: the move offers only existing targets | n/a | n/a: concurrent review-record writes are C001-REQ-917; persistence is C001-REQ-918 | n/a |
| C001-REQ-321 | TS-342 | TS-343 | n/a: one entry per move | n/a: saving before confirming is C001-REQ-920; a move without a git identity is refused by C001-REQ-721 (`CAP-07-verdicts/acceptance.md`) | n/a | n/a: concurrent review-record writes are C001-REQ-917 | n/a |
| C001-REQ-322 | TS-344 | n/a: one ordering rule | TS-345, TS-346 | n/a | n/a | n/a | n/a |
| C001-REQ-323 | TS-347 | n/a: one label rule | TS-348 | n/a | n/a | n/a | n/a |
| C001-REQ-324 | TS-349 | TS-350 | n/a: an account lists what the hunks change, whatever their number | n/a | n/a | n/a | n/a |
| C001-REQ-325 | TS-351 | n/a: one display rule | TS-352 | n/a: provider failures are C001-REQ-816 and C001-REQ-817 (C001-CAP-08) | n/a | n/a | n/a |
| C001-REQ-326 | n/a: unwanted-behaviour requirement, its scenarios are in the error column | TS-353 | TS-354 | TS-353 | n/a | n/a | TS-355 |
| C001-REQ-327 | n/a: unwanted-behaviour requirement, its scenarios are in the error column | TS-357 | TS-357 | TS-356 | n/a | n/a | TS-358 |
| C001-REQ-328 | TS-359 | TS-361 | TS-360, TS-362 | n/a | n/a | n/a | TS-361 |

- **error (bare n/a):** the requirement computes or shows a result from a snapshot already taken in; it has no failure path of its own, and failures of intake belong to C001-CAP-01.
- **authorization (every bare n/a):** the review assistant is a single-user tool on the developer's machine with no roles in the first version; requests from other hosts and other web origins are refused by C001-REQ-905 to C001-REQ-907.
- **concurrency/idempotency (bare n/a):** the intent map is computed once per snapshot and kept with it (C001-REQ-119, TS-142); reproducible results over repeated analyses are measured by C001-NFR-015.
- **abuse (bare n/a):** the requirement only reads the snapshot and the spec items; untrusted link signals written by the agent are covered by TS-313.
