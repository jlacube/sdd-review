---
id: "C001-CAP-06"
artifact: spec/acceptance
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Review coverage, sampling and attention budget"
---
# C001-CAP-06 — Acceptance criteria and scenarios

Requirements: `requirements.md`. Terms: `40-domain/glossary-delta.md`. Observation points,
notation and the fixture `shop-ts` are those of `../CAP-04-risk-triage/acceptance.md`. Additional
fixture:

| Fixture | Content |
|---|---|
| `sample-ts` | TypeScript repository generated for sampling tests: its change holds a set number of hunks cleared by each clearing rule, outside every guarded area, set per scenario |

Shares are given in per cent of changed lines; the numbers of the scenarios divide exactly, so no
rounding rule is needed to check them. Unless a scenario sets a reading rate, the default of 300
changed lines per hour (5 changed lines per minute) applies.

## C001-REQ-601

#### C001-AC-601.1 — Marking a hunk, or all open hunks of an intent, as read sets them read for the snapshot
```gherkin
Scenario: C001-TS-601 — The developer marks one hunk as read
  Given hunk `src/coupon/apply.ts#1` of the `shop-ts` snapshot "S1" is open
  When the developer marks `src/coupon/apply.ts#1` as read
  Then the review state of snapshot "S1" holds `src/coupon/apply.ts#1` as read
```
```gherkin
Scenario: C001-TS-602 — The developer marks all open hunks of an intent as read
  Given intent "Apply a coupon" of the `shop-ts` snapshot "S1" has 5 open hunks, 2 cleared hunks and 1 read hunk
  When the developer marks all open hunks of intent "Apply a coupon" as read
  Then the review state of snapshot "S1" holds the 5 formerly open hunks as read
  And the 2 cleared hunks are still cleared and not read
```
```gherkin
Scenario: C001-TS-603 — Marking a read hunk again changes nothing
  Given hunk `src/coupon/apply.ts#1` of snapshot "S1" is read and the read share of the change is 20 %
  When the developer marks `src/coupon/apply.ts#1` as read
  Then `src/coupon/apply.ts#1` is read
  And the read share of the change is 20 %
```
```gherkin
Scenario: C001-TS-604 — Marking all open hunks of an intent with none open changes nothing
  Given intent "Rename cart fields" of snapshot "S1" has 3 cleared hunks and no open hunk
  When the developer marks all open hunks of intent "Rename cart fields" as read
  Then the 3 hunks of intent "Rename cart fields" are still cleared and not read
```

## C001-REQ-602

#### C001-AC-602.1 — Read, cleared and open shares are the changed lines of read, cleared and open hunks over all changed lines of each scope
```gherkin
Scenario: C001-TS-605 — Shares of the whole change
  Given the change of fixture `shop-ts` has 1,000 changed lines, of which 200 lie in read hunks, 500 in cleared hunks without a read mark and 300 in open hunks
  When the developer asks for the shares of the change
  Then the read share is 20 %, the cleared share 50 % and the open share 30 %
```
```gherkin
Scenario Outline: C001-TS-606 — Shares of each intent, of the orphan code and of each component
  Given <scope> of fixture `shop-ts` has <total> changed lines, of which <read> lie in read hunks, <cleared> in cleared hunks without a read mark and <open> in open hunks
  When the developer asks for the shares of <scope>
  Then the read share is <read share>, the cleared share <cleared share> and the open share <open share>

  Examples:
    | scope | total | read | cleared | open | read share | cleared share | open share |
    | intent "Apply a coupon" | 200 | 50 | 100 | 50 | 25 % | 50 % | 25 % |
    | the orphan code | 40 | 0 | 10 | 30 | 0 % | 25 % | 75 % |
    | component "cart" | 400 | 100 | 200 | 100 | 25 % | 50 % | 25 % |
```
```gherkin
Scenario: C001-TS-607 — A cleared hunk that has been read counts as read only
  Given intent "Rename cart fields" of fixture `shop-ts` has 100 changed lines in 2 hunks
  And its hunk of 40 changed lines is cleared by the formatting rule and marked read, and its hunk of 60 changed lines is open
  When the developer asks for the shares of intent "Rename cart fields"
  Then the read share is 40 %, the cleared share 0 % and the open share 60 %
```

## C001-REQ-603

#### C001-AC-603.1 — The review UI shows the shares of the change, and of each intent and component where it is listed
```gherkin
Scenario: C001-TS-608 — Shares are shown for the change, the intents and the components
  Given the change of fixture `shop-ts` has 1,000 changed lines: 200 in read hunks, 500 in cleared hunks without a read mark and 300 in open hunks
  And intent "Apply a coupon" and component "cart" each have 25 % of their changed lines in read hunks, 50 % in cleared hunks without a read mark and 25 % in open hunks
  When the developer opens the intent list of the review in the review UI
  Then the review UI shows read 20 %, cleared 50 % and open 30 % for the whole change
  And it shows read 25 %, cleared 50 % and open 25 % beside intent "Apply a coupon"
  And it shows read 25 %, cleared 50 % and open 25 % beside component "cart" wherever the architecture delta lists it
```
```gherkin
Scenario: C001-TS-609 — Shares shown follow each read mark
  Given the review UI shows read 20 %, cleared 50 % and open 30 % for the 1,000 changed lines of the change
  When the developer marks the open hunk `src/coupon/apply.ts#1` of 100 changed lines as read
  Then the review UI shows read 30 %, cleared 50 % and open 20 % for the whole change
```

## C001-REQ-604

#### C001-AC-604.1 — Each clearing rule with cleared hunks has a random sample of 10 % of them, rounded up, at least one, in the reading queue
```gherkin
Scenario Outline: C001-TS-610 — The sample is 10 % of the rule's cleared hunks rounded up to a whole hunk
  Given the formatting rule cleared <cleared> hunks of the snapshot of fixture `sample-ts` and no other rule cleared a hunk
  When the analysis of the snapshot completes
  Then the reading queue holds <sample> sampled hunks of the formatting rule
  And each of them is a hunk the formatting rule cleared

  Examples:
    | cleared | sample |
    | 1 | 1 |
    | 9 | 1 |
    | 10 | 1 |
    | 11 | 2 |
    | 25 | 3 |
    | 100 | 10 |
    | 101 | 11 |
```
```gherkin
Scenario: C001-TS-611 — Each rule has its own sample
  Given in the snapshot of fixture `sample-ts` the formatting rule cleared 30 hunks, the passing-tests rule 4 hunks and the generated-file rule 15 hunks
  When the analysis of the snapshot completes
  Then the reading queue holds 3 sampled hunks of the formatting rule, 1 of the passing-tests rule and 2 of the generated-file rule
```
```gherkin
Scenario: C001-TS-612 — A rule that cleared no hunk has no sample
  Given in the snapshot of fixture `sample-ts` the formatting rule cleared 20 hunks and the pure-move rule cleared none
  When the analysis of the snapshot completes
  Then the reading queue holds 2 sampled hunks of the formatting rule and none of the pure-move rule
```
```gherkin
Scenario: C001-TS-613 — The sample grows when the rule clears more hunks during the review
  Given the passing-tests rule cleared 10 hunks of the `shop-ts` snapshot and the reading queue holds 1 sampled hunk of that rule
  And 2 more hunks meet the conditions of the passing-tests rule once the tests of intent "Apply a coupon" are judged
  When the developer records that the test hunks of intent "Apply a coupon" express the intent
  Then the passing-tests rule has cleared 12 hunks
  And the reading queue holds 2 sampled hunks of the passing-tests rule
```
```gherkin
Scenario: C001-TS-614 — The sample is drawn at random
  Given the formatting rule cleared 40 hunks of the snapshot of fixture `sample-ts` and no other rule cleared a hunk
  When the snapshot is analysed 20 times, its review state deleted before each analysis
  Then the 20 samples, each of 4 hunks, are not all the same set of hunks
  And every sampled hunk is a hunk the formatting rule cleared
```
```gherkin
Scenario: C001-TS-639 — Reading the sampled hunks does not shrink the sample population
  Given the formatting rule cleared 11 hunks of the snapshot of fixture `sample-ts`, no other rule cleared a hunk, and its sample holds the 2 hunks `src/gen/a.ts#1` and `src/gen/b.ts#1`
  When the developer marks `src/gen/a.ts#1` and `src/gen/b.ts#1` as read
  Then the sample of the formatting rule still holds `src/gen/a.ts#1` and `src/gen/b.ts#1`
  And the reading queue holds no sampled hunk of the formatting rule
  And the coverage statement lists the formatting rule with 11 hunks cleared, 2 sampled and 2 sampled and read
```

## C001-REQ-605

#### C001-AC-605.1 — A sampled hunk counts in the cleared share until it is marked read
```gherkin
Scenario: C001-TS-615 — An unread sampled hunk counts as cleared
  Given the change of fixture `shop-ts` has 1,000 changed lines, of which 200 lie in read hunks, 500 in cleared hunks without a read mark and 300 in open hunks
  And the sampled hunk `src/cart/total.ts#1` of 30 changed lines is one of the cleared hunks without a read mark
  When the developer asks for the shares of the change
  Then the read share is 20 %, the cleared share 50 % and the open share 30 %
```
```gherkin
Scenario: C001-TS-616 — A sampled hunk marked read moves to the read share
  Given the change of fixture `shop-ts` has 1,000 changed lines: 200 in read hunks, 500 in cleared hunks without a read mark and 300 in open hunks
  And the unread sampled hunk `src/cart/total.ts#1` of 30 changed lines is one of the cleared hunks without a read mark
  When the developer marks `src/cart/total.ts#1` as read
  Then the read share is 23 %, the cleared share 47 % and the open share 30 %
```

## C001-REQ-606

#### C001-AC-606.1 — A defect reported in a cleared hunk reopens every unread hunk cleared by the same rules
```gherkin
Scenario: C001-TS-617 — A defect in a sampled hunk reopens the unread hunks of its rule only
  Given in the `shop-ts` snapshot the formatting rule cleared 30 hunks, including the sampled hunk `src/cart/total.ts#1`, and the passing-tests rule cleared 12 other hunks
  And the developer has marked read 1 formatting-cleared hunk other than `src/cart/total.ts#1`
  When the developer reports the defect "rounding changed from 2 to 0 decimals" in `src/cart/total.ts#1`
  Then the 29 unread hunks cleared by the formatting rule are open
  And the formatting-cleared hunk marked read is still read
  And the 12 hunks cleared by the passing-tests rule are still cleared
```
```gherkin
Scenario Outline: C001-TS-618 — A defect in a cleared hunk outside the sample escalates its rule as well
  Given the generated-file rule cleared 5 hunks of the `shop-ts` snapshot, none read, and `src/api/generated/client.ts#3` is one of them outside the sample
  And the developer has <action> `src/api/generated/client.ts#3`
  When the developer reports a defect in `src/api/generated/client.ts#3`
  Then the 5 hunks the generated-file rule cleared are open

  Examples:
    | action |
    | expanded |
    | reopened |
```
```gherkin
Scenario: C001-TS-619 — A defect in a hunk cleared by two rules escalates both rules
  Given hunk `src/cart/total.ts#5` of the `shop-ts` snapshot is cleared by the formatting rule and by the passing-tests rule
  And the formatting rule cleared 30 hunks and the passing-tests rule 12 hunks, all unread
  When the developer reports a defect in `src/cart/total.ts#5`
  Then every hunk cleared by the formatting rule or by the passing-tests rule is open
```
```gherkin
Scenario: C001-TS-620 — A defect in a hunk that no rule cleared escalates nothing
  Given hunk `src/coupon/apply.ts#1` of the `shop-ts` snapshot has never been cleared
  And the formatting rule cleared 30 unread hunks
  When the developer reports the defect "discount applied twice" in `src/coupon/apply.ts#1`
  Then the 30 hunks cleared by the formatting rule are still cleared
  And the review record holds a defect report on `src/coupon/apply.ts#1` with the text "discount applied twice" that names no clearing rule
  And the review record holds no escalation
```
```gherkin
Scenario: C001-TS-621 — A second defect in an escalated rule changes no hunk state
  Given the formatting rule of the `shop-ts` snapshot was escalated, its 29 unread hunks open and 1 hunk read
  When the developer reports a defect in the read hunk `src/cart/format.ts#2`, which the formatting rule cleared
  Then the 29 hunks are still open and `src/cart/format.ts#2` is still read
```
```gherkin
Scenario: C001-TS-652 — An escalation keeps the read sampled hunks of the rule and their sample results
  Given in the `shop-ts` snapshot the formatting rule cleared 30 hunks and its sample holds `src/cart/format.ts#1` and `src/cart/format.ts#2`, both read, and `src/cart/total.ts#1`, unread
  And no other formatting-cleared hunk is read
  When the developer reports the defect "rounding changed from 2 to 0 decimals" in the read sampled hunk `src/cart/format.ts#1`
  Then `src/cart/format.ts#1` and `src/cart/format.ts#2` are still read
  And the 28 unread hunks cleared by the formatting rule, `src/cart/total.ts#1` among them, are open
  And the coverage statement lists the formatting rule with 2 hunks sampled, 2 sampled and read, and 1 defect reported
```

## C001-REQ-607

#### C001-AC-607.1 — Each escalation is recorded with its defect report, rules and reopened hunks
```gherkin
Scenario: C001-TS-622 — The review record keeps the escalation
  Given the formatting rule of the `shop-ts` snapshot cleared 30 hunks, 1 of them read
  When the developer reports the defect "rounding changed from 2 to 0 decimals" in the sampled hunk `src/cart/total.ts#1`
  Then the review record holds an escalation entry with the defect report "rounding changed from 2 to 0 decimals" on `src/cart/total.ts#1`
  And the entry names the escalated clearing rule "formatting"
  And it lists the 29 reopened hunks
```
```gherkin
Scenario: C001-TS-623 — An escalation of two rules records both rules
  Given hunk `src/cart/total.ts#5` of the `shop-ts` snapshot is cleared by the formatting rule and by the passing-tests rule
  When the developer reports a defect in `src/cart/total.ts#5`
  Then the review record holds one escalation entry naming the clearing rules "formatting" and "passing-tests"
  And it lists every hunk the escalation reopened
```

## C001-REQ-608

#### C001-AC-608.1 — Every hunk reopened by an escalation is shown with the defect report that triggered it
```gherkin
Scenario: C001-TS-624 — A reopened hunk shows the triggering defect report
  Given the defect "rounding changed from 2 to 0 decimals" reported in `src/cart/total.ts#1` reopened the formatting-cleared hunk `src/cart/format.ts#1`
  When the developer opens `src/cart/format.ts#1` in the review UI
  Then the review UI shows `src/cart/format.ts#1` with the defect report "rounding changed from 2 to 0 decimals" and the hunk `src/cart/total.ts#1` it was reported on
```
```gherkin
Scenario: C001-TS-625 — Reopened hunks are listed with the defect report
  Given an escalation of the formatting rule reopened 29 hunks of the `shop-ts` snapshot
  When the developer opens the list of hunks reopened by escalation in the review UI
  Then the review UI lists the 29 hunks, each with the defect report "rounding changed from 2 to 0 decimals"
```

## C001-REQ-609

#### C001-AC-609.1 — An escalated rule clears no further hunk in the snapshot
```gherkin
Scenario: C001-TS-626 — Hunks that would clear after a test judgement stay open under an escalated rule
  Given the passing-tests rule of the `shop-ts` snapshot is escalated
  And hunk `src/coupon/apply.ts#1` would meet every condition of the passing-tests rule once the tests of intent "Apply a coupon" are judged as expressing the intent
  When the developer records that the test hunks of intent "Apply a coupon" express the intent
  Then `src/coupon/apply.ts#1` is open
```
```gherkin
Scenario: C001-TS-627 — A rule that is not escalated keeps clearing
  Given the formatting rule of the `shop-ts` snapshot is escalated and the passing-tests rule is not
  And hunk `src/coupon/apply.ts#1` would meet every condition of the passing-tests rule once the tests of intent "Apply a coupon" are judged as expressing the intent
  When the developer records that the test hunks of intent "Apply a coupon" express the intent
  Then `src/coupon/apply.ts#1` is cleared by the passing-tests rule
```
```gherkin
Scenario: C001-TS-628 — A later test run does not clear hunks under an escalated rule
  Given the passing-tests rule of the `shop-ts` snapshot is escalated and hunk `src/cart/total.ts#9` is open
  When a later test run of the snapshot executes every added executable line of `src/cart/total.ts#9` in passing qualifying tests
  Then `src/cart/total.ts#9` is open
```

## C001-REQ-610

#### C001-AC-610.1 — With a time budget, the reading queue is ordered by risk per estimated reading minute, then path and line
```gherkin
Scenario: C001-TS-629 — Hunks are ordered by descending risk score per reading minute
  Given the reading queue of the `shop-ts` snapshot holds these hunks:
    | hunk | risk score | changed lines | estimated minutes |
    | `src/cart/total.ts#1` | 8 | 40 | 8 |
    | `src/coupon/apply.ts#1` | 6 | 10 | 2 |
    | `src/coupon/rules.ts#1` | 9 | 90 | 18 |
  When the developer states a time budget of 60 minutes
  Then the reading queue is ordered `src/coupon/apply.ts#1`, `src/cart/total.ts#1`, `src/coupon/rules.ts#1`
```
```gherkin
Scenario: C001-TS-630 — Equal values are ordered by file path, then by first changed line
  Given the reading queue of the `shop-ts` snapshot holds these hunks, each with 2.0 risk per reading minute:
    | hunk | risk score | changed lines | first changed line |
    | `src/b/x.ts#1` | 4 | 10 | 5 |
    | `src/a/y.ts#2` | 2 | 5 | 50 |
    | `src/a/y.ts#1` | 2 | 5 | 10 |
  When the developer states a time budget of 60 minutes
  Then the reading queue is ordered `src/a/y.ts#1`, `src/a/y.ts#2`, `src/b/x.ts#1`
```
```gherkin
Scenario: C001-TS-631 — The reading queue holds the open hunks and the unread sampled hunks only
  Given the `shop-ts` snapshot has the open hunk `src/coupon/apply.ts#1`, the read hunk `src/cart/total.ts#2`, the unsampled cleared hunk `src/cart/format.ts#1`, the unread sampled hunk `src/cart/total.ts#1` and the read sampled hunk `src/cart/format.ts#3`
  When the developer states a time budget of 60 minutes
  Then the reading queue holds `src/coupon/apply.ts#1` and `src/cart/total.ts#1` and no other of these hunks
```

## C001-REQ-611

#### C001-AC-611.1 — Reading time is the changed lines, at least one, divided by the reading rate, 300 lines per hour by default
```gherkin
Scenario Outline: C001-TS-632 — Reading time follows the changed lines and the reading rate
  Given hunk `src/cart/total.ts#1` of the `shop-ts` snapshot has <lines> changed lines
  And the reading rate set for the review is <rate>
  When the developer states a time budget of 60 minutes
  Then the estimated reading time of `src/cart/total.ts#1` is <estimate>

  Examples:
    | lines | rate | estimate |
    | 30 | not set | 6 minutes |
    | 30 | 600 changed lines per hour | 3 minutes |
    | 1 | not set | 12 seconds |
    | 300 | 150 changed lines per hour | 120 minutes |
```

## C001-REQ-612

#### C001-AC-612.1 — The longest run from the head of the queue within the budget is reported, with the remainder's changed lines and risk
```gherkin
Scenario: C001-TS-633 — The run stops at the first hunk that does not fit
  Given the ordered reading queue of the `shop-ts` snapshot is:
    | position | hunk | estimated minutes | changed lines | risk score |
    | 1 | `src/coupon/rules.ts#1` | 10 | 50 | 9 |
    | 2 | `src/cart/total.ts#1` | 15 | 75 | 12 |
    | 3 | `src/coupon/apply.ts#1` | 10 | 50 | 7 |
    | 4 | `src/cart/format.ts#1` | 5 | 25 | 3 |
  When the developer states a time budget of 30 minutes
  Then the hunks reported within the budget are `src/coupon/rules.ts#1` and `src/cart/total.ts#1`
  And the remaining hunks are reported with 75 changed lines and a sum of risk scores of 10
```
```gherkin
Scenario Outline: C001-TS-634 — Budgets at and around the sums of the queue
  Given the ordered reading queue of the `shop-ts` snapshot is:
    | position | hunk | estimated minutes | changed lines | risk score |
    | 1 | `src/coupon/rules.ts#1` | 10 | 50 | 9 |
    | 2 | `src/cart/total.ts#1` | 15 | 75 | 12 |
    | 3 | `src/coupon/apply.ts#1` | 10 | 50 | 7 |
    | 4 | `src/cart/format.ts#1` | 5 | 25 | 3 |
  When the developer states a time budget of <budget> minutes
  Then the hunks reported within the budget are <within>
  And the remaining hunks are reported with <lines> changed lines and a sum of risk scores of <risk>

  Examples:
    | budget | within | lines | risk |
    | 25 | `src/coupon/rules.ts#1`, `src/cart/total.ts#1` | 75 | 10 |
    | 24 | `src/coupon/rules.ts#1` | 150 | 22 |
    | 9 | none | 200 | 31 |
    | 40 | all 4 hunks | 0 | 0 |
```

## C001-REQ-613

#### C001-AC-613.1 — The coverage statement gives the risk sum and share of the read, verified-cleared, other cleared and open groups
```gherkin
Scenario: C001-TS-635 — Risk is split over the four groups
  Given the hunks of the `shop-ts` snapshot have a total risk score of 200
  And the read hunks have a risk score sum of 60
  And the unread hunks cleared only by the formatting rule, whose 3 sampled hunks are all read and which has no defect report, have a risk score sum of 40
  And the unread hunks cleared only by the passing-tests rule, of whose 2 sampled hunks 1 is read, have a risk score sum of 50
  And the open hunks have a risk score sum of 50
  When the developer asks for the coverage statement of the review
  Then the statement reports read 60 (30 %), cleared with every clearing rule verified 40 (20 %), cleared otherwise 50 (25 %) and open 50 (25 %)
```
```gherkin
Scenario: C001-TS-636 — A hunk cleared by a verified and an unverified rule counts as cleared otherwise
  Given in the `shop-ts` snapshot the formatting rule has all 3 of its sampled hunks read and no defect report
  And the passing-tests rule has 1 of its 2 sampled hunks unread
  And the unread hunk `src/cart/total.ts#5` with risk score 10 is cleared by the formatting rule and by the passing-tests rule
  When the developer asks for the coverage statement of the review
  Then `src/cart/total.ts#5` contributes its risk score 10 to the group "cleared otherwise"
  And it contributes nothing to the group "cleared with every clearing rule verified"
```

## C001-REQ-614

#### C001-AC-614.1 — Every coverage statement gives, per clearing rule, the hunks cleared, sampled, sampled and read, and the defects reported
```gherkin
Scenario: C001-TS-637 — The coverage statement lists the sample results of every clearing rule
  Given in the `shop-ts` snapshot the clearing rules have these results:
    | rule | cleared | sampled | sampled and read | defects |
    | pure-rename | 4 | 1 | 1 | 0 |
    | formatting | 30 | 3 | 2 | 0 |
    | generated-file | 6 | 1 | 0 | 0 |
    | passing-tests | 12 | 2 | 2 | 1 |
  When the developer asks for the coverage statement of the review
  Then the statement lists for each of these rules its numbers of hunks cleared, sampled, sampled and read, and defects reported as given
```
```gherkin
Scenario: C001-TS-638 — A rule that cleared no hunk is listed with zeros
  Given the pure-move rule cleared no hunk of the `shop-ts` snapshot
  When the developer asks for the coverage statement of the review
  Then the statement lists the pure-move rule with 0 hunks cleared, 0 sampled, 0 sampled and read and 0 defects reported
```

## C001-REQ-615

#### C001-AC-615.1 — A time budget or reading rate that is not a number greater than zero is refused, naming the value, and the values in effect stay unchanged
```gherkin
Scenario Outline: C001-TS-645 — A time budget that is not positive is refused
  Given the developer has stated a time budget of 60 minutes for the review of the `shop-ts` snapshot and the reading queue reports 4 hunks within the budget
  When the developer states a time budget of "<value>"
  Then the analysis core refuses the value with a message that names "<value>"
  And the time budget in effect is 60 minutes
  And the reading queue still reports the same 4 hunks within the budget

  Examples:
    | value |
    | 0     |
    | -15   |
    | abc   |
    |       |
    | NaN   |
```
```gherkin
Scenario Outline: C001-TS-646 — A reading rate that is not positive is refused
  Given no reading rate is set for the review of the `shop-ts` snapshot and hunk `src/cart/total.ts#1` has 30 changed lines
  When the developer sets the reading rate "<value>"
  Then the analysis core refuses the value with a message that names "<value>"
  And the reading rate in effect is 300 changed lines per hour
  And the estimated reading time of `src/cart/total.ts#1` is 6 minutes

  Examples:
    | value |
    | 0     |
    | -300  |
    | fast  |
```
```gherkin
Scenario Outline: C001-TS-647 — The smallest positive values are accepted
  Given hunk `src/cart/total.ts#1` of the `shop-ts` snapshot has 1 changed line and estimated reading time 12 seconds
  When the developer <action>
  Then the analysis core accepts the value and refuses nothing
  And <outcome>

  Examples:
    | action                                         | outcome                                                     |
    | states a time budget of "1" minute             | the time budget in effect is 1 minute                       |
    | sets the reading rate "1" changed line per hour | the estimated reading time of `src/cart/total.ts#1` is 60 minutes |
```

## C001-REQ-616

#### C001-AC-616.1 — When the sample population changes, sampled hunks still in it stay sampled, hunks are added only while the rule is not escalated, and hunks are added or unread ones removed only to reach the size of C001-REQ-604
```gherkin
Scenario: C001-TS-640 — A growing population keeps the sampled hunk and adds one
  Given the passing-tests rule cleared 10 hunks of the `shop-ts` snapshot and its sample holds the single hunk `src/cart/total.ts#1`
  And 2 more hunks meet the conditions of the passing-tests rule once the tests of intent "Apply a coupon" are judged
  When the developer records that the test hunks of intent "Apply a coupon" express the intent
  Then the sample of the passing-tests rule holds 2 hunks
  And one of them is `src/cart/total.ts#1`
```
```gherkin
Scenario: C001-TS-641 — A shrinking population removes one unread sampled hunk only
  Given the formatting rule cleared 11 hunks of the snapshot of fixture `sample-ts` and its sample holds the unread hunks `src/gen/a.ts#1` and `src/gen/b.ts#1`
  When the developer reopens the unsampled hunk `src/gen/c.ts#1`, which the formatting rule cleared
  Then the sample population of the formatting rule holds 10 hunks
  And the sample of the formatting rule holds exactly 1 of `src/gen/a.ts#1` and `src/gen/b.ts#1`
```
```gherkin
Scenario Outline: C001-TS-642 — A read sampled hunk is never removed from the sample
  Given the formatting rule cleared 11 hunks of the snapshot of fixture `sample-ts` and its sample holds `src/gen/a.ts#1` and `src/gen/b.ts#1`
  And the developer has marked <read> as read
  When the developer reopens the unsampled hunk `src/gen/c.ts#1`, which the formatting rule cleared
  Then the sample of the formatting rule holds exactly <kept>

  Examples:
    | read                                   | kept                                   |
    | `src/gen/a.ts#1`                       | `src/gen/a.ts#1`                       |
    | `src/gen/a.ts#1` and `src/gen/b.ts#1`  | `src/gen/a.ts#1` and `src/gen/b.ts#1`  |
```
```gherkin
Scenario: C001-TS-643 — A sampled hunk that leaves the population leaves the sample and the rest is kept
  Given the passing-tests rule cleared 11 hunks of the `shop-ts` snapshot and its sample holds the unread hunks `src/cart/total.ts#1` and `src/cart/tax.ts#1`
  When a later test run of the snapshot reports that a test failed which, of the 11 cleared hunks, executes only `src/cart/total.ts#1`
  Then the sample of the passing-tests rule holds exactly `src/cart/tax.ts#1`
```
```gherkin
Scenario: C001-TS-644 — The hunk added to the sample follows the sample seed of the review
  Given two copies of the review state of the `shop-ts` snapshot "S1", saved at the same moment with the same sample seed, in which the passing-tests rule cleared 10 hunks
  And 2 more hunks meet the conditions of the passing-tests rule once the tests of intent "Apply a coupon" are judged
  When the developer records in each copy that the test hunks of intent "Apply a coupon" express the intent
  Then both copies add the same hunk to the sample of the passing-tests rule
```
```gherkin
Scenario: C001-TS-651 — A read sampled hunk that loses its test clearing leaves the sample and keeps its read mark
  Given the passing-tests rule cleared 11 hunks of the `shop-ts` snapshot and its sample holds `src/cart/total.ts#1`, marked read, and `src/cart/tax.ts#1`, unread
  And `src/cart/total.ts#1` is cleared by no other rule
  When a later test run of the snapshot reports that a test failed which, of the 11 cleared hunks, executes only `src/cart/total.ts#1`
  Then the sample population of the passing-tests rule holds 10 hunks
  And the sample of the passing-tests rule holds exactly `src/cart/tax.ts#1`
  And `src/cart/total.ts#1` is still read and counts in the read share
```
```gherkin
Scenario: C001-TS-653 — An escalation that empties the sample of a rule leaves it empty
  Given the formatting rule cleared 30 hunks of the snapshot of fixture `sample-ts` and its sample holds the 3 unread hunks `src/gen/s1.ts#1`, `src/gen/s2.ts#1` and `src/gen/s3.ts#1`
  And the developer has expanded and marked read 20 other hunks the formatting rule cleared, `src/gen/r01.ts#1` to `src/gen/r20.ts#1`, and the other 7 cleared hunks are unread
  When the developer reports the defect "indentation changed inside a string literal" in `src/gen/r07.ts#1`
  Then the 10 unread hunks the formatting rule cleared, `src/gen/s1.ts#1`, `src/gen/s2.ts#1` and `src/gen/s3.ts#1` among them, are open
  And the sample population of the formatting rule holds the 20 read hunks
  And the sample of the formatting rule holds no hunk
  And the coverage statement lists the formatting rule with 0 hunks sampled, 0 sampled and read, and 1 defect reported
```

## C001-REQ-617

#### C001-AC-617.1 — A defect report on any hunk is recorded with the hunk, the text and each clearing rule that had cleared it, or none
```gherkin
Scenario: C001-TS-648 — A defect report on a sampled hunk names its clearing rule
  Given the sampled hunk `src/cart/total.ts#1` of the `shop-ts` snapshot is cleared by the formatting rule only, and the review record holds 6 entries
  When the developer reports the defect "rounding changed from 2 to 0 decimals" in `src/cart/total.ts#1`
  Then the review record holds a defect report entry that names `src/cart/total.ts#1`, the text "rounding changed from 2 to 0 decimals" and the clearing rule "formatting"
```
```gherkin
Scenario: C001-TS-649 — A defect report on an open hunk is recorded and names no clearing rule
  Given hunk `src/coupon/apply.ts#1` of the `shop-ts` snapshot is open, no clearing rule having cleared it, and the review record holds 6 entries
  When the developer reports the defect "discount applied twice" in `src/coupon/apply.ts#1`
  Then the review record holds 7 entries, the last a defect report entry that names `src/coupon/apply.ts#1`, the text "discount applied twice" and no clearing rule
  And `src/coupon/apply.ts#1` is still open
```
```gherkin
Scenario Outline: C001-TS-650 — A defect report names every rule that had cleared the hunk, whatever its state now
  Given hunk <hunk> of the `shop-ts` snapshot <state>
  When the developer reports the defect "wrong total" in <hunk>
  Then the review record holds a defect report entry on <hunk> with the text "wrong total" that names exactly the clearing rules <rules>

  Examples:
    | hunk | state | rules |
    | `src/cart/total.ts#5` | is cleared by the formatting rule and by the passing-tests rule | "formatting" and "passing-tests" |
    | `src/api/generated/client.ts#3` | was cleared by the generated-file rule and then reopened by the developer | "generated-file" |
    | `src/cart/format.ts#3` | is cleared by the formatting rule and marked read | "formatting" |
```

## Coverage table

| REQ | happy | alternate | boundary | error | authorization | concurrency/idempotency | abuse |
|---|---|---|---|---|---|---|---|
| C001-REQ-601 | TS-601 | TS-602 | TS-604 | n/a: marking read has no failing input; a hunk is read or not | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-603; entries from both surfaces at once are REQ-917 | n/a: read marks are the developer's own statement; signing with unread hunks is CAP-07 (Q-signing-01) |
| C001-REQ-602 | TS-605 | TS-606 | TS-607 | n/a: every scope has at least one changed line, so no share divides by zero | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: shares are recomputed from the review state; repeated reads give the same values (TS-603) | n/a: the shares count changed lines only; no input of the change alters the formula |
| C001-REQ-603 | TS-608 | TS-608 | n/a: display rule with no numeric limit | n/a: display of computed shares; no failing input | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-609 | n/a: display only |
| C001-REQ-604 | TS-610 | TS-611, TS-613 | TS-610, TS-612, TS-639, TS-653 (an escalated rule is outside the requirement) | n/a: the sample is drawn from existing cleared hunks; no failing input | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-613, TS-644; the sample kept across sessions is REQ-918 | TS-614, TS-639 |
| C001-REQ-605 | TS-615 | TS-616 | TS-616 | n/a: counting rule with no failing input | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: repeated read marks are tested under REQ-601 (TS-603) | n/a: an unread sample stays in the cleared share; it cannot be counted as read |
| C001-REQ-606 | TS-617 | TS-618 | TS-619, TS-652 | TS-620 | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-621 | n/a: a defect report only reopens hunks; it can never clear one |
| C001-REQ-607 | TS-622 | TS-623 | TS-623 | n/a: a report that reopens nothing records no escalation (TS-620) | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: one entry per escalation; entries from both surfaces at once are REQ-917 | n/a: review record entries are kept unaltered by REQ-713 |
| C001-REQ-608 | TS-624 | TS-625 | n/a: display rule with no numeric limit | n/a: display of recorded escalations; no failing input | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: covered by the UI response NFR-003 | n/a: display only |
| C001-REQ-609 | TS-626 | TS-628 | TS-627 | n/a: the rule forbids clearing; no error output | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-628 | n/a: the state only keeps more hunks open |
| C001-REQ-610 | TS-629 | TS-631 | TS-630 | TS-645 (C001-REQ-615) | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: the order is recomputed when a budget is stated; one budget at a time | n/a: the order changes no clearing and no verdict |
| C001-REQ-611 | TS-632 | TS-632 | TS-632, TS-647 | TS-646 (C001-REQ-615) | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: the estimate is a pure function of lines and rate | n/a: the rate is the developer's own setting and changes no clearing |
| C001-REQ-612 | TS-633 | TS-634 | TS-634 | TS-645 (C001-REQ-615) | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: one report per stated budget | n/a: the remainder is always stated; nothing is hidden by the budget |
| C001-REQ-613 | TS-635 | TS-636 | TS-636 | n/a: the statement is computed from existing results; no failing input | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: one statement per request; storage with verdicts is REQ-712 | n/a: a rule counts as verified only after all its samples are read and no defect is reported (TS-636) |
| C001-REQ-614 | TS-637 | TS-637, TS-652 | TS-638, TS-653 | n/a: the counts are computed from existing results; no failing input | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: one statement per request | n/a: counts come from the review state, not from any input of the change |
| C001-REQ-615 | n/a: unwanted-behaviour requirement, its scenarios are in the error column | TS-646 | TS-647 | TS-645, TS-646 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: one stated value at a time; the values in effect stay unchanged on refusal (TS-645) | TS-645 (the value "NaN") |
| C001-REQ-616 | TS-640 | TS-641, TS-643, TS-651 | TS-642, TS-651, TS-653 (escalated rule, sample left empty) | n/a: the rule only adjusts the sample; no failing input | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-644 | n/a: a read sampled hunk is never removed while it is in the population (TS-642), so reading cannot be undone by a later population change |
| C001-REQ-617 | TS-648 | TS-649 | TS-650 | TS-764 (empty text: C001-REQ-706, `CAP-07-verdicts/acceptance.md`) | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: each report writes its own entry (TS-621); entries from both surfaces at once are REQ-917 | n/a: the text is stored and shown like the reason of C001-REQ-704 (TS-716); a report can reopen hunks but never clear one |
