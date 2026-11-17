---
id: "C001-CAP-04"
artifact: spec/acceptance
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Risk triage and guarded clearing"
---
# C001-CAP-04 — Acceptance criteria and scenarios

Requirements: `requirements.md`. Terms: `40-domain/glossary-delta.md`.

**How outcomes are observed.** Analysis-core outcomes (risk scores, signal values, intent order,
clearings, guarded areas, evidence records, notices) are read from the machine-readable triage and
evidence output of the headless analysis (C001-REQ-912); review-UI outcomes are read from the page
in a supported browser (C001-NFR-017). Output formats, the review configuration keys and the
built-in lists of the guarded areas are defined in `50-interfaces/` (later step); a scenario that
depends on an entry of a built-in list states that entry in a `Given` step.

**Notation.** `<path>#<n>` is the n-th hunk of that file in the snapshot. "The review
configuration of the base commit" is the configuration read under C001-REQ-426.

**Fixtures** (built with the test plan in 20-plan):

| Fixture | Content |
|---|---|
| `shop-ts` | TypeScript repository with Jest tests, an SDD workspace and a review configuration at the base commit |
| `shop-py` | Python repository with pytest tests and a review configuration at the base commit |
| `shop-cs` | C#/.NET repository with xUnit tests and a review configuration at the base commit |
| `tool-go` | Go repository (outside the deep ecosystems) with Go tests that write an LCOV report |
| `scored-pairs-ts` | TypeScript repository whose change holds pairs of hunks A and B that differ in one risk signal only |
| `shop-ts-model` | `shop-ts` with a base-commit review configuration that also configures a local provider stub |

## C001-REQ-401

#### C001-AC-401.1 — Every hunk carries a risk score with the values of its five risk signals
```gherkin
Scenario: C001-TS-401 — Every hunk of the snapshot gets a risk score with its five signal values
  Given the snapshot of fixture `shop-ts` has 12 hunks
  And hunk `src/cart/total.ts#1` adds 18 lines to an existing file outside every guarded area and changes no dependency
  And the analysis core's test run executed 12 of the 15 executable lines that `src/cart/total.ts#1` adds
  When the analysis of the snapshot completes
  Then the triage output gives a risk score to each of the 12 hunks
  And it records for `src/cart/total.ts#1` guarded area "no", size 18, novelty "existing file", test coverage 80 % and dependency change "no"
```
```gherkin
Scenario Outline: C001-TS-402 — Novelty and dependency-change values follow the hunk's content
  Given hunk <hunk> of fixture `shop-ts` <content>
  When the analysis of the snapshot completes
  Then the triage output records for <hunk> novelty <novelty> and dependency change <dependency>

  Examples:
    | hunk | content | novelty | dependency |
    | `src/payments/client.ts#1` | is the whole of a file the change adds and imports the external package "stripe", which the base commit does not use | "added file" | "yes" |
    | `src/cart/checkout.ts#2` | adds to component "cart" an import of component "payments", a new coupling | "existing file" | "yes" |
    | `src/cart/format.ts#1` | changes the text of one string literal | "existing file" | "no" |
```
```gherkin
Scenario: C001-TS-403 — A one-line hunk whose only executable line was executed
  Given hunk `src/cart/round.ts#1` of fixture `shop-ts` adds 1 executable line and deletes no line
  And the analysis core's test run executed that line
  When the analysis of the snapshot completes
  Then the triage output records for `src/cart/round.ts#1` size 1 and test coverage 100 %
```
```gherkin
Scenario Outline: C001-TS-482 — A hunk that adds no executable line has test coverage 0
  Given hunk <hunk> of fixture `shop-ts` <content>
  And the analysis core's test run of the snapshot passed and produced coverage
  When the analysis of the snapshot completes
  Then the triage output records for <hunk> test coverage 0 %

  Examples:
    | hunk | content |
    | `src/cart/legacy.ts#1` | only deletes 12 lines |
    | `src/cart/total.ts#4` | only adds 3 comment lines |
```

## C001-REQ-402

#### C001-AC-402.1 — With all other signals equal, a riskier signal value never lowers the score
```gherkin
Scenario Outline: C001-TS-404 — Each risk signal moves the score in one direction
  Given fixture `scored-pairs-ts` holds hunks A and B whose risk signals are equal except <signal>
  And hunk A has <riskier value> and hunk B has <other value>
  When the analysis of the snapshot completes
  Then the risk score of hunk A is greater than or equal to the risk score of hunk B

  Examples:
    | signal | riskier value | other value |
    | guarded area | a place in the security and authentication area | no guarded area |
    | size | 40 changed lines | 10 changed lines |
    | novelty | a place in a file the change adds | a place in a file of the base commit |
    | test coverage | 25 % | 75 % |
    | dependency change | an added import of the external package "lodash" | no dependency change |
```
```gherkin
Scenario Outline: C001-TS-405 — The smallest riskier difference still never lowers the score
  Given fixture `scored-pairs-ts` holds hunks A and B whose risk signals are equal except <signal>
  And hunk A has <riskier value> and hunk B has <other value>
  When the analysis of the snapshot completes
  Then the risk score of hunk A is greater than or equal to the risk score of hunk B

  Examples:
    | signal | riskier value | other value |
    | size | 11 changed lines | 10 changed lines |
    | test coverage | 9 of 10 executable lines executed (90 %) | 10 of 10 executable lines executed (100 %) |
```

## C001-REQ-403

#### C001-AC-403.1 — The hunks of an intent follow the clearing-state, risk, definition, path and line keys
```gherkin
Scenario: C001-TS-406 — Hunks that are not cleared follow descending risk score, then file path
  Given intent "Apply a coupon" of fixture `shop-ts` has these hunks, none a test hunk, none cleared, none defining a symbol another of them uses:
    | hunk | risk score |
    | `src/coupon/apply.ts#1` | 4 |
    | `src/coupon/rules.ts#1` | 9 |
    | `src/cart/total.ts#2` | 4 |
  When the analysis of the snapshot completes
  Then the intent order of the intent's other hunks is `src/coupon/rules.ts#1`, `src/cart/total.ts#2`, `src/coupon/apply.ts#1`
```
```gherkin
Scenario: C001-TS-407 — A cleared hunk comes after every hunk that is not cleared, whatever its score
  Given intent "Apply a coupon" of fixture `shop-ts` has the open hunk `src/coupon/apply.ts#1` with risk score 2
  And it has the hunk `src/coupon/rules.ts#2` with risk score 8, cleared by the passing-tests rule
  When the analysis of the snapshot completes
  Then `src/coupon/apply.ts#1` comes before `src/coupon/rules.ts#2` in the intent order
```
```gherkin
Scenario: C001-TS-408 — Among equal scores a defining hunk precedes its users, then path and first changed line decide
  Given intent "Apply a coupon" of fixture `shop-ts` has these open hunks, none a test hunk, each with risk score 5:
    | hunk | first changed line | content |
    | `src/coupon/apply.ts#1` | 12 | uses the function `discountFor` |
    | `src/coupon/rules.ts#1` | 30 | defines the function `discountFor` |
    | `src/coupon/rules.ts#2` | 80 | changes the value of a constant |
  When the analysis of the snapshot completes
  Then the intent order of the intent's other hunks is `src/coupon/rules.ts#1`, `src/coupon/apply.ts#1`, `src/coupon/rules.ts#2`
```
```gherkin
Scenario: C001-TS-409 — Marking a hunk read keeps its place in the intent order
  Given the intent order of intent "Apply a coupon" is `src/coupon/rules.ts#1`, `src/cart/total.ts#2`, `src/coupon/apply.ts#1`, all three open
  When the developer marks `src/coupon/rules.ts#1` as read
  Then the intent order is still `src/coupon/rules.ts#1`, `src/cart/total.ts#2`, `src/coupon/apply.ts#1`
```
```gherkin
Scenario: C001-TS-410 — A reopened hunk moves among the hunks that are not cleared
  Given intent "Apply a coupon" has the open hunk `src/coupon/apply.ts#1` with risk score 2
  And it has the hunk `src/coupon/rules.ts#2` with risk score 8, cleared by the formatting rule and placed after `src/coupon/apply.ts#1`
  When the developer reopens `src/coupon/rules.ts#2`
  Then `src/coupon/rules.ts#2` comes before `src/coupon/apply.ts#1` in the intent order
```
```gherkin
Scenario: C001-TS-483 — Hunks that define symbols for each other form one group ordered by path, before their users
  Given intent "Apply a coupon" of fixture `shop-ts` has these open hunks, none a test hunk, each with risk score 5:
    | hunk | first changed line | content |
    | `src/coupon/rules.ts#1` | 30 | defines the function `discountFor`, which uses `capFor` |
    | `src/coupon/caps.ts#1` | 12 | defines the function `capFor`, which uses `discountFor` |
    | `src/coupon/apply.ts#1` | 5 | uses the function `discountFor` |
    | `src/cart/total.ts#3` | 50 | changes the value of a constant used by no other hunk |
  When the analysis of the snapshot completes
  Then the intent order of the intent's other hunks is `src/cart/total.ts#3`, `src/coupon/caps.ts#1`, `src/coupon/rules.ts#1`, `src/coupon/apply.ts#1`
```

## C001-REQ-404

#### C001-AC-404.1 — A hunk without coverage from any test run scores as not executed, labelled unknown
```gherkin
Scenario: C001-TS-411 — Without a test run, test coverage scores as none and is labelled unknown
  Given the review of fixture `shop-ts` has no test command, so the snapshot's test evidence is unavailable
  And hunk `src/cart/total.ts#1` adds 6 executable lines
  When the analysis of the snapshot completes
  Then the triage output records for `src/cart/total.ts#1` test coverage 0 % labelled "unknown"
  And its risk score equals the risk score the same hunk gets when a test run executed none of its 6 executable lines
```
```gherkin
Scenario: C001-TS-412 — A file outside the deep ecosystems with no coverage report scores as not executed
  Given the test run of fixture `tool-go` writes no coverage report
  And hunk `internal/cart/total.go#1` adds 5 lines
  When the analysis of the snapshot completes
  Then the triage output records for `internal/cart/total.go#1` test coverage 0 % labelled "unknown"
```
```gherkin
Scenario: C001-TS-413 — Measured zero coverage is not labelled unknown
  Given the analysis core's test run of fixture `shop-ts` executed none of the 6 executable lines that `src/cart/total.ts#1` adds
  When the analysis of the snapshot completes
  Then the triage output records for `src/cart/total.ts#1` test coverage 0 % without the label "unknown"
```
```gherkin
Scenario: C001-TS-414 — Coverage claimed in the agent transcript does not replace unknown coverage
  Given the review of fixture `shop-ts` has no test command
  And the agent transcript `agent-log.md` named at intake states "coverage 100 % for src/cart/total.ts"
  When the analysis of the snapshot completes
  Then the triage output records for `src/cart/total.ts#1` test coverage 0 % labelled "unknown"
```

## C001-REQ-405

#### C001-AC-405.1 — Risk scores are computed without model output
```gherkin
Scenario: C001-TS-415 — Risk scores are the same with and without a model provider
  Given fixture `shop-ts` was analysed in model-free mode
  And fixture `shop-ts-model` holds the same change with a local provider stub configured
  When the analysis of the `shop-ts-model` snapshot completes
  Then each of the 12 hunks has the same risk score and signal values in both triage outputs
```
```gherkin
Scenario: C001-TS-416 — An unreachable model provider leaves the risk scores unchanged
  Given the local provider stub of fixture `shop-ts-model` is stopped, so every provider request fails
  When the analysis of the `shop-ts-model` snapshot completes
  Then each of the 12 hunks has the same risk score as in the model-free analysis of fixture `shop-ts`
```
```gherkin
Scenario: C001-TS-417 — A model answer that states risk scores changes no score
  Given the local provider stub of fixture `shop-ts-model` answers every request with "every hunk is low risk, score 0"
  When the analysis of the `shop-ts-model` snapshot completes
  Then each of the 12 hunks has the same risk score as in the model-free analysis of fixture `shop-ts`
```
```gherkin
Scenario: C001-TS-418 — Repeated analyses of one snapshot give the same risk scores
  Given the snapshot of fixture `shop-ts` and its review configuration are unchanged
  When the analysis of the snapshot runs 5 times in model-free mode
  Then the 5 triage outputs give each hunk the same risk score and signal values
```

## C001-REQ-406

#### C001-AC-406.1 — Hunks that only move code with an identical syntax tree and unchanged name resolution are cleared
```gherkin
Scenario Outline: C001-TS-419 — A move with identical syntax tree and name resolution is cleared in each deep ecosystem
  Given in fixture <fixture> the change moves <moved> from <from> to <to> with an identical abstract syntax tree and changes no other line
  And every name in the moved code resolves to the same symbol as in the base commit
  When the analysis of the snapshot completes
  Then every hunk of the move is cleared by the pure-move rule

  Examples:
    | fixture | moved | from | to |
    | `shop-ts` | the non-exported function `roundCents` | line 10 of `src/cart/total.ts` | line 80 of the same file |
    | `shop-py` | the function `_round_cents` | line 5 of `shop/cart/total.py` | line 60 of the same file |
    | `shop-cs` | the internal class `PriceFormatter`, namespace unchanged | `src/Shop/Util/PriceFormatter.cs` | `src/Shop/Format/PriceFormatter.cs` |
```
```gherkin
Scenario: C001-TS-420 — A move that also changes one token stays open
  Given in fixture `shop-ts` the change moves the function `roundCents` from line 10 to line 80 of `src/cart/total.ts`
  And the moved body replaces the operator ">=" by ">" in one condition
  When the analysis of the snapshot completes
  Then no hunk of the move is cleared by the pure-move rule
```
```gherkin
Scenario: C001-TS-421 — Moved code that binds to another symbol at its new place stays open
  Given in fixture `shop-py` the change moves the function `_round_cents` from `shop/cart/total.py` to `shop/cart/helpers.py` with an identical abstract syntax tree and changes no other line
  And the name `ROUNDING` in it resolved to `shop.cart.total.ROUNDING` at the base commit and resolves to `shop.cart.helpers.ROUNDING` in the snapshot
  When the analysis of the snapshot completes
  Then no hunk of the move is cleared by the pure-move rule
```
```gherkin
Scenario: C001-TS-422 — A move in a file outside the deep ecosystems is not cleared by the pure-move rule
  Given in fixture `tool-go` the change moves the function `formatPrice` unchanged from `internal/util/price.go` to `internal/format/price.go`
  When the analysis of the snapshot completes
  Then no hunk of the move is cleared by the pure-move rule
```

## C001-REQ-407

#### C001-AC-407.1 — Hunks that only rename symbols consistently with unchanged name resolution are cleared
```gherkin
Scenario Outline: C001-TS-423 — A consistent rename is cleared in each deep ecosystem
  Given in fixture <fixture> the change renames <symbol> to <new name> at its definition in <file> and at <uses>, and makes no other change
  And every use resolves to the symbol it referred to in the base commit
  When the analysis of the snapshot completes
  Then every hunk of the rename is cleared by the pure-rename rule

  Examples:
    | fixture | symbol | new name | file | uses |
    | `shop-ts` | the non-exported function `sumLines` | `sumLineAmounts` | `src/cart/total.ts` | its 2 uses in the same file |
    | `shop-py` | the function `_calc_total` | `_compute_total` | `shop/cart/total.py` | its 3 uses in `shop/cart/checkout.py` |
    | `shop-cs` | the private method `SumLines` of class `Cart` | `SumLineAmounts` | `src/Shop/Cart/Cart.cs` | its 2 uses in the same class |
```
```gherkin
Scenario: C001-TS-424 — A rename combined with another change stays open
  Given in fixture `shop-ts` the change renames the non-exported function `sumLines` to `sumLineAmounts` at its definition and its 2 uses
  And the renamed function's initial value changes from 0 to 1
  When the analysis of the snapshot completes
  Then the hunk holding the definition is not cleared by the pure-rename rule
```
```gherkin
Scenario: C001-TS-425 — A rename that makes a use bind to another symbol stays open
  Given in fixture `shop-ts` the change renames the parameter `amount` of the non-exported function `applyTax` to `rate` at its definition and its 2 uses
  And the body of `applyTax` uses the module-level constant `rate`, which in the snapshot resolves to the renamed parameter
  When the analysis of the snapshot completes
  Then no hunk of the rename is cleared by the pure-rename rule
```
```gherkin
Scenario: C001-TS-426 — A consistent rename of a public API symbol stays open as a public API change
  Given in fixture `shop-ts` the change renames the exported function `calcTotal` of `src/cart/index.ts` to `computeTotal` at its definition and at every use, and makes no other change
  When the analysis of the snapshot completes
  Then every hunk of the rename is open
  And the hunk holding the definition is in the public API guarded area
```

## C001-REQ-408

#### C001-AC-408.1 — Hunks whose code keeps the same syntax tree and comment text are cleared
```gherkin
Scenario Outline: C001-TS-427 — A formatting-only hunk is cleared in each deep ecosystem
  Given in fixture <fixture> the hunk <hunk> <change> and keeps the abstract syntax tree and comment text of the base commit
  When the analysis of the snapshot completes
  Then <hunk> is cleared by the formatting rule

  Examples:
    | fixture | hunk | change |
    | `shop-ts` | `src/cart/total.ts#1` | re-indents 8 lines from 4 to 2 spaces and wraps one call over 3 lines |
    | `shop-py` | `shop/cart/total.py#1` | replaces single by double quotes in 3 string literals and adds spaces around 4 operators |
    | `shop-cs` | `src/Shop/Cart/Cart.cs#1` | moves 5 opening braces onto their own lines |
```
```gherkin
Scenario Outline: C001-TS-428 — A layout change that alters the syntax tree or a comment stays open
  Given in fixture <fixture> the hunk <hunk> <change>
  When the analysis of the snapshot completes
  Then <hunk> is not cleared by the formatting rule

  Examples:
    | fixture | hunk | change |
    | `shop-py` | `shop/cart/total.py#2` | removes one indentation level from `return total`, moving it out of its `for` block |
    | `shop-ts` | `src/cart/total.ts#2` | changes the comment text "rounded to cents" to "rounded to euros" |
```
```gherkin
Scenario: C001-TS-429 — A whitespace-only change outside the deep ecosystems is not cleared by the formatting rule
  Given in fixture `tool-go` the hunk `internal/cart/total.go#1` only re-indents 6 lines
  When the analysis of the snapshot completes
  Then `internal/cart/total.go#1` is not cleared by the formatting rule
```

## C001-REQ-409

#### C001-AC-409.1 — Hunks of files the repository declares as generated are cleared
```gherkin
Scenario: C001-TS-430 — A file matching a generated-file pattern of the review configuration is cleared
  Given the review configuration of the base commit of fixture `shop-ts` has the generated-file pattern `src/api/generated/**`
  And the change modifies 40 lines of `src/api/generated/client.ts`
  When the analysis of the snapshot completes
  Then every hunk of `src/api/generated/client.ts` is cleared by the generated-file rule
```
```gherkin
Scenario Outline: C001-TS-431 — Files declared generated by .gitattributes or in any language are cleared
  Given in fixture <fixture> the base commit declares <file> as generated by <declaration>
  And the change modifies <file>
  When the analysis of the snapshot completes
  Then every hunk of <file> is cleared by the generated-file rule

  Examples:
    | fixture | file | declaration |
    | `shop-ts` | `docs/api/index.html` | the `.gitattributes` line `docs/api/** linguist-generated` |
    | `tool-go` | `internal/pb/order.pb.go` | the generated-file pattern `internal/pb/*.pb.go` of the review configuration |
```
```gherkin
Scenario: C001-TS-432 — A generated-file marker written into the file itself does not clear it
  Given in fixture `shop-ts` the change adds the first line "// @generated - do not edit" to `src/cart/total.ts`
  And no generated-file pattern and no `.gitattributes` line of the base commit matches `src/cart/total.ts`
  When the analysis of the snapshot completes
  Then no hunk of `src/cart/total.ts` is cleared by the generated-file rule
```
```gherkin
Scenario: C001-TS-433 — A change that declares its own files generated does not clear them
  Given the review configuration of the base commit of fixture `shop-ts` has no generated-file pattern
  And the change adds the generated-file pattern `src/**` to the review configuration and the line `src/** linguist-generated` to `.gitattributes`
  And the change modifies `src/cart/total.ts`
  When the analysis of the snapshot completes
  Then no hunk of `src/cart/total.ts` is cleared by the generated-file rule
  And the hunks of the review configuration and of `.gitattributes` are open
```
```gherkin
Scenario: C001-TS-434 — A lock file matched by a generated-file pattern stays open as guarded
  Given the review configuration of the base commit of fixture `shop-ts` has the generated-file pattern `**/package-lock.json`
  And the change modifies `package-lock.json`
  When the analysis of the snapshot completes
  Then every hunk of `package-lock.json` is open and in the dependency, build and configuration guarded area
```

## C001-REQ-410

#### C001-AC-410.1 — A hunk whose added executable lines all ran in passing qualifying tests, with no failure and no surviving mutant, is cleared
```gherkin
Scenario: C001-TS-435 — A fully exercised hunk with all mutants killed is cleared by the passing-tests rule
  Given hunk `src/cart/total.ts#1` of fixture `shop-ts` adds 5 executable lines outside every guarded area
  And the analysis core's test run executed all 5 lines in the passing tests "total › sums lines" and "total › applies tax", both unchanged since the base commit
  And no test that executed the hunk failed
  And mutation testing generated 4 mutants on its changed lines and the tests killed all 4
  When the mutation results of the hunk are recorded
  Then `src/cart/total.ts#1` is cleared by the passing-tests rule
```
```gherkin
Scenario Outline: C001-TS-436 — The passing-tests rule clears hunks in the other deep ecosystems
  Given hunk <hunk> of fixture <fixture> adds 4 executable lines outside every guarded area
  And the analysis core's test run executed all 4 lines in the passing <runner> test <test>, unchanged since the base commit
  And mutation testing killed every mutant generated on the hunk's changed lines
  When the mutation results of the hunk are recorded
  Then <hunk> is cleared by the passing-tests rule

  Examples:
    | fixture | hunk | runner | test |
    | `shop-py` | `shop/cart/total.py#3` | pytest | `tests/test_total.py::test_sums_lines` |
    | `shop-cs` | `src/Shop/Cart/Cart.cs#2` | xUnit | `Shop.Tests.CartTests.SumsLines` |
```
```gherkin
Scenario: C001-TS-437 — Unavailable mutation evidence does not prevent clearing by passing tests
  Given hunk `src/cart/total.ts#1` of fixture `shop-ts` adds 5 executable lines, all executed by passing qualifying tests and by no failing test
  And the hunk's mutation evidence is recorded as unavailable because no mutation-testing tool is installed
  When the analysis of the snapshot completes
  Then `src/cart/total.ts#1` is cleared by the passing-tests rule
  And its test evidence item has evidence strength 3
```
```gherkin
Scenario Outline: C001-TS-438 — Every added executable line must have run in a passing qualifying test
  Given hunk `src/cart/total.ts#1` of fixture `shop-ts` adds 5 executable lines outside every guarded area
  And passing qualifying tests executed <executed> of them, no test that executed the hunk failed and no mutant survived
  When the analysis of the snapshot completes
  Then `src/cart/total.ts#1` is <state>

  Examples:
    | executed | state |
    | 4 | open |
    | 5 | cleared by the passing-tests rule |
```
```gherkin
Scenario Outline: C001-TS-439 — Failing tests, surviving mutants, deletion-only hunks and non-qualifying tests keep a hunk open
  Given hunk <hunk> of fixture `shop-ts` lies outside every guarded area
  And <condition>
  When the analysis of the snapshot completes
  Then <hunk> is not cleared by the passing-tests rule

  Examples:
    | hunk | condition |
    | `src/cart/total.ts#1` | all its 5 executable lines ran in passing qualifying tests and the test "total › rounds" that also executed line 3 failed |
    | `src/cart/total.ts#1` | all its 5 executable lines ran in passing qualifying tests and the mutant replacing "+" by "-" on line 4 survived |
    | `src/cart/legacy.ts#1` | the hunk only deletes 12 lines |
    | `src/coupon/apply.ts#1` | its 3 executable lines ran only in the passing test "coupon › applies 10 %", added by the change in intent "Apply a coupon", whose tests have no test judgement |
```
```gherkin
Scenario: C001-TS-440 — Test results reported by the agent do not clear a hunk
  Given the review of fixture `shop-ts` has no test command, so the snapshot's test evidence is unavailable
  And the agent transcript `agent-log.md` named at intake states "all 212 tests pass, src/cart/total.ts fully covered"
  When the analysis of the snapshot completes
  Then no hunk of `src/cart/total.ts` is cleared by the passing-tests rule
```
```gherkin
Scenario: C001-TS-441 — Full line coverage of a file outside the deep ecosystems does not clear it by passing tests
  Given the test run of fixture `tool-go` passes and writes an LCOV report in which every line added by `internal/cart/total.go#1` is executed
  When the analysis of the snapshot completes
  Then `internal/cart/total.go#1` is not cleared by the passing-tests rule
```

## C001-REQ-411

#### C001-AC-411.1 — A test-cleared hunk that loses its evidence is reopened with the condition that failed
```gherkin
Scenario Outline: C001-TS-442 — A test-cleared hunk is reopened when a condition of the passing-tests rule stops holding
  Given hunk `src/coupon/apply.ts#1` of fixture `shop-ts` is cleared by the passing-tests rule on tests of intent "Apply a coupon" judged as expressing the intent
  When <event>
  Then `src/coupon/apply.ts#1` is open
  And the triage output records for it the condition "<condition>"

  Examples:
    | event | condition |
    | mutation testing later records that the mutant replacing "10" by "11" on line 7 survived | a mutant generated on its changed lines survived |
    | the developer records that the test hunks of intent "Apply a coupon" do not express the intent | an added executable line is no longer executed by a passing qualifying test |
    | a later test run of the snapshot reports that the test "coupon › applies 10 %" failed | a test that executed the hunk failed |
```
```gherkin
Scenario: C001-TS-484 — A hunk also cleared by a mechanical rule stays cleared by that rule only
  Given hunk `src/coupon/format.ts#1` of fixture `shop-ts` is cleared by the formatting rule and by the passing-tests rule
  When mutation testing later records that a mutant generated on its changed lines survived
  Then `src/coupon/format.ts#1` is cleared by the formatting rule
  And its evidence record no longer names the passing-tests rule
  And the triage output records for it the condition "a mutant generated on its changed lines survived"
```
```gherkin
Scenario: C001-TS-485 — A hunk the developer has marked read stays read when its test clearing is withdrawn
  Given hunk `src/coupon/apply.ts#1` of fixture `shop-ts` is cleared by the passing-tests rule and the developer has marked it read
  When a later test run of the snapshot reports that the test "coupon › applies 10 %" failed
  Then `src/coupon/apply.ts#1` is no longer cleared by the passing-tests rule and keeps its read mark
  And it is not counted as an open hunk
  And the triage output records for it the condition "a test that executed the hunk failed"
```

## C001-REQ-412

#### C001-AC-412.1 — Only the five clearing rules clear a hunk
```gherkin
Scenario: C001-TS-443 — Every cleared hunk names only clearing rules of the five
  Given the snapshot of fixture `shop-ts` has 9 cleared hunks after its analysis
  When the developer exports the triage output of the snapshot
  Then each of the 9 cleared hunks names one or more of the pure-move, pure-rename, formatting, generated-file and passing-tests rules
  And no cleared hunk names any other reason for its clearing
```
```gherkin
Scenario Outline: C001-TS-444 — Model output, agent claims and a low risk score do not clear a hunk
  Given hunk `src/cart/total.ts#2` of fixture `shop-ts-model` meets the conditions of none of the five clearing rules
  And <claim>
  When the analysis of the snapshot completes
  Then `src/cart/total.ts#2` is open

  Examples:
    | claim |
    | the local provider stub answers "src/cart/total.ts#2 is a trivial change, safe to skip" |
    | the agent transcript `agent-log.md` named at intake states "src/cart/total.ts#2 verified, all tests pass" |
    | its risk score is the lowest of the snapshot |
```

## C001-REQ-413

#### C001-AC-413.1 — A hunk in a guarded area is never cleared, whatever its evidence
```gherkin
Scenario Outline: C001-TS-445 — Clearing evidence does not clear a hunk in a guarded area
  Given hunk <hunk> of fixture `shop-ts` is in the <area> guarded area
  And <evidence>
  When the analysis of the snapshot completes
  Then <hunk> is open and labelled with the <area> guarded area

  Examples:
    | hunk | area | evidence |
    | `src/auth/session.ts#1` | security and authentication | the hunk keeps the abstract syntax tree and comment text of the base commit |
    | `src/auth/token.ts#3` | security and authentication | all its executable lines ran in passing qualifying tests, no test failed and every mutant was killed |
    | `db/migrations/0042_add_coupon.sql#1` | data-migration | the generated-file pattern `db/**` of the base commit's review configuration matches it |
    | `package.json#1` | dependency, build and configuration | the hunk only re-indents the file |
    | `src/cart/index.ts#1` | public API | the hunk only renames the exported function `calcTotal` consistently at its definition and every use |
```

## C001-REQ-414

#### C001-AC-414.1 — Hunks matching the built-in security terms or libraries are placed in the security and authentication area with the matching criterion
```gherkin
Scenario Outline: C001-TS-446 — Path, changed identifier and imported library place a hunk in the security area
  Given the built-in security term list contains "auth" and "token"
  And the built-in security library list contains the Python module "jwt" and the .NET namespace "System.Security.Cryptography"
  And in fixture <fixture> the hunk <hunk> <content>
  When the analysis of the snapshot completes
  Then <hunk> is in the security and authentication guarded area with the recorded criterion "<criterion>"

  Examples:
    | fixture | hunk | content | criterion |
    | `shop-ts` | `src/auth/login.ts#1` | changes 3 lines | file path contains "auth" |
    | `shop-py` | `shop/cart/totals.py#2` | adds the function `refresh_token` | changed identifier contains "token" |
    | `shop-py` | `shop/cart/totals.py#3` | adds the line `import jwt` | imports security library "jwt" |
    | `shop-cs` | `src/Shop/Cart/Totals.cs#1` | adds the line `using System.Security.Cryptography;` | imports security library "System.Security.Cryptography" |
```
```gherkin
Scenario: C001-TS-447 — A file path outside the deep ecosystems is matched against the security terms
  Given the built-in security term list contains "auth"
  And in fixture `tool-go` the change modifies 4 lines of `internal/auth/session.go`
  When the analysis of the snapshot completes
  Then every hunk of `internal/auth/session.go` is in the security and authentication guarded area with the recorded criterion "file path contains "auth""
```
```gherkin
Scenario: C001-TS-448 — An identifier that only appears in the unchanged context lines does not match
  Given the built-in security term list contains "token" and no term that matches `src/cart/price.ts`
  And hunk `src/cart/price.ts#1` of fixture `shop-ts` changes one numeric literal on a line next to the unchanged line `const tokenCount = 3;`
  And the hunk imports no module of the built-in security library list
  When the analysis of the snapshot completes
  Then `src/cart/price.ts#1` is not in the security and authentication guarded area
```
```gherkin
Scenario: C001-TS-449 — Security code placed under a neutral path is caught by its import
  Given the built-in security library list contains the npm package "jsonwebtoken"
  And no term of the built-in security term list matches the path `src/util/helpers.ts` or its changed identifiers
  And hunk `src/util/helpers.ts#1` of fixture `shop-ts` adds the line `import jwt from "jsonwebtoken";` and a function that signs session data
  When the analysis of the snapshot completes
  Then `src/util/helpers.ts#1` is in the security and authentication guarded area with the recorded criterion "imports security library "jsonwebtoken""
```

## C001-REQ-415

#### C001-AC-415.1 — SQL files and files on built-in migration paths are placed in the data-migration area with the matching criterion
```gherkin
Scenario Outline: C001-TS-450 — SQL files and migration paths place a hunk in the data-migration area
  Given the built-in migration path patterns contain `**/migrations/*.py` and `**/Migrations/*.cs`
  And in fixture <fixture> the change modifies <file>
  When the analysis of the snapshot completes
  Then every hunk of <file> is in the data-migration guarded area with the recorded criterion "<criterion>"

  Examples:
    | fixture | file | criterion |
    | `shop-ts` | `db/V12__add_coupon.sql` | SQL file |
    | `tool-go` | `schema/2026_11_add_orders.sql` | SQL file |
    | `shop-py` | `shop/migrations/0007_coupon.py` | migration path `**/migrations/*.py` |
    | `shop-cs` | `src/Shop.Data/Migrations/20261101_AddCoupon.cs` | migration path `**/Migrations/*.cs` |
```
```gherkin
Scenario: C001-TS-451 — A file that is neither SQL nor on a migration path is not in the data-migration area
  Given the built-in migration path patterns contain `**/migrations/*.py` and no pattern matching `shop/migration_utils.py`
  And in fixture `shop-py` the change modifies `shop/migration_utils.py`
  When the analysis of the snapshot completes
  Then no hunk of `shop/migration_utils.py` is in the data-migration guarded area
```

## C001-REQ-416

#### C001-AC-416.1 — Dependency, build, CI, container and configuration files are placed in their guarded area with the matching criterion
```gherkin
Scenario Outline: C001-TS-452 — Built-in file patterns place a hunk in the dependency, build and configuration area
  Given the built-in patterns of the dependency, build and configuration area match <file> as a <kind>
  And in fixture <fixture> the change modifies <file>
  When the analysis of the snapshot completes
  Then every hunk of <file> is in the dependency, build and configuration guarded area with the recorded criterion "<kind>"

  Examples:
    | fixture | file | kind |
    | `shop-ts` | `package.json` | dependency manifest |
    | `shop-ts` | `package-lock.json` | lock file |
    | `shop-py` | `pyproject.toml` | dependency manifest |
    | `shop-cs` | `src/Shop/Shop.csproj` | build definition |
    | `shop-ts` | `.github/workflows/ci.yml` | CI pipeline definition |
    | `tool-go` | `Dockerfile` | container definition |
    | `shop-cs` | `src/Shop/appsettings.json` | configuration file |
```
```gherkin
Scenario: C001-TS-453 — A change that edits the review configuration has that edit read as guarded
  Given in fixture `shop-ts` the change edits the review configuration to disable no rule and add the generated-file pattern `src/**`
  When the analysis of the snapshot completes
  Then every hunk of the review configuration is open and in the dependency, build and configuration guarded area
```

## C001-REQ-417

#### C001-AC-417.1 — Public API changes and API description files are placed in the public API area with the matching criterion
```gherkin
Scenario Outline: C001-TS-454 — Changes to public symbols place a hunk in the public API area
  Given in fixture <fixture> the hunk <hunk> <change>
  When the analysis of the snapshot completes
  Then <hunk> is in the public API guarded area with the recorded criterion "<criterion>"

  Examples:
    | fixture | hunk | change | criterion |
    | `shop-ts` | `src/cart/index.ts#1` | adds the parameter `currency` to the exported function `calcTotal` | parameters of a public symbol changed |
    | `shop-ts` | `src/cart/index.ts#2` | removes the exported constant `MAX_ITEMS` | public symbol removed |
    | `shop-py` | `shop/cart/api.py#1` | changes the return annotation of the module-level function `apply_coupon` from `Cart` to `Order` | return type of a public symbol changed |
    | `shop-cs` | `src/Shop/Cart/Cart.cs#3` | renames the public method `Total` of the public class `Cart` to `GrandTotal` | name of a public symbol changed |
    | `shop-cs` | `src/Shop/Cart/Cart.cs#4` | adds the protected property `Discount` to the public class `Cart` | public symbol added |
```
```gherkin
Scenario Outline: C001-TS-455 — Non-public symbols do not place a hunk in the public API area
  Given in fixture <fixture> the hunk <hunk> <change> and changes no other symbol
  When the analysis of the snapshot completes
  Then <hunk> is not in the public API guarded area

  Examples:
    | fixture | hunk | change |
    | `shop-ts` | `src/cart/total.ts#3` | adds a parameter to the non-exported function `sumLines` |
    | `shop-py` | `shop/cart/total.py#4` | adds a parameter to the module-level function `_apply_discount` |
    | `shop-cs` | `src/Shop/Cart/CartMath.cs#1` | adds a parameter to the public method `Round` of the internal class `CartMath` |
```
```gherkin
Scenario Outline: C001-TS-456 — API description files are in the public API area in any repository
  Given in fixture <fixture> the change modifies <file>
  When the analysis of the snapshot completes
  Then every hunk of <file> is in the public API guarded area with the recorded criterion "<criterion>"

  Examples:
    | fixture | file | criterion |
    | `tool-go` | `api/openapi.yaml` | OpenAPI file |
    | `tool-go` | `proto/order.proto` | Protocol Buffers file |
    | `shop-ts` | `src/graphql/schema.graphql` | GraphQL schema file |
```

## C001-REQ-418

#### C001-AC-418.1 — A hunk carrying a design-quality finding other than design critique stays open
```gherkin
Scenario: C001-TS-457 — Test evidence does not clear a hunk with a design-quality finding
  Given hunk `src/cart/checkout.ts#2` of fixture `shop-ts` meets every condition of the passing-tests rule
  And the architecture delta records on it the design-quality finding "new dependency cycle cart → payments → cart"
  When the analysis of the snapshot completes
  Then `src/cart/checkout.ts#2` is open
```
```gherkin
Scenario: C001-TS-458 — Mechanical proof does not clear a hunk with a design-quality finding
  Given hunk `src/coupon/rules.ts#3` of fixture `shop-ts` keeps the abstract syntax tree and comment text of the base commit
  And the architecture delta records on it the design-quality finding "duplicated logic with src/cart/discount.ts lines 10–31"
  When the analysis of the snapshot completes
  Then `src/coupon/rules.ts#3` is open
```
```gherkin
Scenario: C001-TS-486 — A design critique item does not keep a hunk open
  Given hunk `src/coupon/rules.ts#4` of fixture `shop-ts-model` keeps the abstract syntax tree and comment text of the base commit and lies outside every guarded area
  And the local provider stub answers the design critique "rules.ts mixes coupon parsing and pricing" pointing to `src/coupon/rules.ts#4`
  And no other design-quality finding points to `src/coupon/rules.ts#4`
  When the analysis of the snapshot completes
  Then `src/coupon/rules.ts#4` is cleared by the formatting rule
```

## C001-REQ-419

#### C001-AC-419.1 — Every cleared hunk has an evidence record with its rules, evidence items, their strengths and the time of clearing
```gherkin
Scenario: C001-TS-459 — A hunk cleared by mechanical proof records the proof
  Given hunk `src/cart/total.ts#1` of fixture `shop-ts` is cleared by the formatting rule
  When the developer exports the evidence of the snapshot
  Then the evidence record of `src/cart/total.ts#1` names the clearing rule "formatting"
  And it holds the proof item "same abstract syntax tree and comment text as the base commit" with evidence strength 1
  And it holds the time of clearing
```
```gherkin
Scenario: C001-TS-460 — A hunk cleared by passing tests records the tests and their test run
  Given hunk `src/cart/total.ts#4` of fixture `shop-ts` is cleared by the passing-tests rule on the tests "total › sums lines" and "total › applies tax" of test run 1
  And mutation testing killed every mutant generated on its changed lines
  When the developer exports the evidence of the snapshot
  Then the evidence record of `src/cart/total.ts#4` names the clearing rule "passing-tests"
  And it holds the evidence items of the tests "total › sums lines" and "total › applies tax" in test run 1, each with evidence strength 2
  And it holds the time of clearing
```
```gherkin
Scenario: C001-TS-461 — A hunk cleared by two rules records both rules and both evidence items
  Given hunk `src/api/generated/client.ts#2` of fixture `shop-ts` is cleared by the generated-file rule and by the formatting rule
  When the developer exports the evidence of the snapshot
  Then the evidence record of `src/api/generated/client.ts#2` names the clearing rules "generated-file" and "formatting"
  And it holds one evidence item for each rule, each with evidence strength 1
```

## C001-REQ-420

#### C001-AC-420.1 — Every cleared hunk is shown as a collapsed, labelled entry, never hidden
```gherkin
Scenario: C001-TS-462 — The cleared hunks of an intent are listed collapsed with their rules and strength
  Given intent "Apply a coupon" of fixture `shop-ts` has 7 hunks, of which `src/coupon/rules.ts#2` is cleared by the formatting rule and `src/coupon/apply.ts#2` by the passing-tests rule with evidence strength 2
  When the developer opens intent "Apply a coupon" in the review UI
  Then the intent shows 7 hunk entries
  And `src/coupon/rules.ts#2` is a collapsed entry labelled "formatting" and "strength 1"
  And `src/coupon/apply.ts#2` is a collapsed entry labelled "passing-tests" and "strength 2"
```
```gherkin
Scenario: C001-TS-463 — A cleared hunk of orphan code is listed collapsed in the orphan code list
  Given hunk `docs/api/index.html#1` of fixture `shop-ts` is orphan code cleared by the generated-file rule
  When the developer opens the orphan code list in the review UI
  Then `docs/api/index.html#1` is a collapsed entry labelled "generated-file" and "strength 1"
```
```gherkin
Scenario: C001-TS-464 — The label shows the strength of the strongest evidence item
  Given hunk `src/cart/total.ts#5` of fixture `shop-ts` is cleared by the formatting rule with an item of evidence strength 1 and by the passing-tests rule with items of evidence strength 3
  When the developer opens the intent of `src/cart/total.ts#5` in the review UI
  Then `src/cart/total.ts#5` is a collapsed entry labelled "formatting", "passing-tests" and "strength 1"
```

## C001-REQ-421

#### C001-AC-421.1 — Expanding a cleared hunk shows its changed lines and its evidence record
```gherkin
Scenario: C001-TS-465 — Expanding a cleared hunk of an intent shows its lines and evidence
  Given hunk `src/coupon/rules.ts#2` of fixture `shop-ts` is cleared by the formatting rule and shown collapsed in intent "Apply a coupon"
  When the developer expands `src/coupon/rules.ts#2` in the review UI
  Then the review UI shows the 14 changed lines of `src/coupon/rules.ts#2`
  And it shows the evidence record with the rule "formatting", the proof item with evidence strength 1 and the time of clearing
```
```gherkin
Scenario: C001-TS-466 — Expanding a cleared hunk of orphan code shows its lines and evidence
  Given hunk `docs/api/index.html#1` of fixture `shop-ts` is orphan code cleared by the generated-file rule
  When the developer expands `docs/api/index.html#1` in the orphan code list
  Then the review UI shows the changed lines of `docs/api/index.html#1`
  And it shows the evidence record with the rule "generated-file" and the `.gitattributes` declaration that matched
```

## C001-REQ-422

#### C001-AC-422.1 — A cleared hunk the developer reopens stays open for the rest of the review of the snapshot
```gherkin
Scenario: C001-TS-467 — Reopening a cleared hunk sets it open and labels it
  Given hunk `src/coupon/rules.ts#2` of fixture `shop-ts` is cleared by the formatting rule
  When the developer reopens `src/coupon/rules.ts#2`
  Then `src/coupon/rules.ts#2` is open and labelled "reopened by the developer"
```
```gherkin
Scenario: C001-TS-468 — Evidence that arrives after the reopening does not clear the hunk again
  Given the developer reopened hunk `src/cart/total.ts#4` of fixture `shop-ts`, which the passing-tests rule had cleared before its mutation results arrived
  When mutation testing records that every mutant of `src/cart/total.ts#4` was killed
  Then `src/cart/total.ts#4` is open and labelled "reopened by the developer"
```

## C001-REQ-423

#### C001-AC-423.1 — Guarded areas added in the review configuration hold the hunks of the files they match
```gherkin
Scenario: C001-TS-469 — A hunk matching an added guarded area is placed in it and stays open
  Given the review configuration of the base commit of fixture `shop-ts` adds the guarded area "billing" with the path pattern `src/billing/**`
  And hunk `src/billing/invoice.ts#1` keeps the abstract syntax tree and comment text of the base commit
  When the analysis of the snapshot completes
  Then `src/billing/invoice.ts#1` is in the guarded area "billing"
  And it is open
```
```gherkin
Scenario: C001-TS-470 — A guarded area added only by the change under review does not apply to that review
  Given the review configuration of the base commit of fixture `shop-ts` adds no guarded area
  And the change adds to the review configuration the guarded area "billing" with the path pattern `src/billing/**`
  When the analysis of the snapshot completes
  Then no hunk of `src/billing/invoice.ts` is in the guarded area "billing"
```
```gherkin
Scenario: C001-TS-471 — A path next to the pattern is not in the added guarded area
  Given the review configuration of the base commit of fixture `shop-ts` adds the guarded area "billing" with the path pattern `src/billing/**`
  And the change modifies `src/billing-report/summary.ts`
  When the analysis of the snapshot completes
  Then no hunk of `src/billing-report/summary.ts` is in the guarded area "billing"
```

## C001-REQ-424

#### C001-AC-424.1 — A clearing rule disabled in the review configuration clears no hunk
```gherkin
Scenario Outline: C001-TS-472 — A disabled rule clears nothing
  Given the review configuration of the base commit of fixture `shop-ts` disables the <rule> rule
  And hunk <hunk> meets every condition of the <rule> rule
  When the analysis of the snapshot completes
  Then <hunk> is open
  And no hunk of the snapshot names the <rule> rule

  Examples:
    | rule | hunk |
    | formatting | `src/cart/total.ts#1` |
    | passing-tests | `src/cart/total.ts#4` |
```
```gherkin
Scenario: C001-TS-473 — A change cannot re-enable a rule that its base commit disables
  Given the review configuration of the base commit of fixture `shop-ts` disables the formatting rule
  And the change edits the review configuration to enable the formatting rule
  And hunk `src/cart/total.ts#1` keeps the abstract syntax tree and comment text of the base commit
  When the analysis of the snapshot completes
  Then `src/cart/total.ts#1` is open
  And no hunk of the snapshot names the formatting rule
```

## C001-REQ-425

#### C001-AC-425.1 — Settings that remove or narrow a built-in guarded area are ignored with a notice
```gherkin
Scenario Outline: C001-TS-474 — A repository cannot remove or narrow a built-in guarded area
  Given the review configuration of the base commit of fixture `shop-ts` has a setting that <setting>
  And hunk <hunk> keeps the abstract syntax tree and comment text of the base commit
  When the analysis of the snapshot completes
  Then <hunk> is open and in the <area> guarded area
  And the analysis reports a notice that names the ignored setting

  Examples:
    | setting | hunk | area |
    | removes the built-in security and authentication area | `src/auth/session.ts#1` | security and authentication |
    | excludes the path pattern `db/migrations/legacy/**` from the data-migration area | `db/migrations/legacy/0003_fix.sql#1` | data-migration |
    | removes the term "auth" from the built-in security term list | `src/auth/session.ts#1` | security and authentication |
```
```gherkin
Scenario: C001-TS-475 — Adding settings apply while a weakening setting beside them is ignored
  Given the review configuration of the base commit of fixture `shop-ts` adds the guarded area "billing" with the path pattern `src/billing/**`
  And it also removes the built-in public API area
  When the analysis of the snapshot completes
  Then `src/billing/invoice.ts#1` is in the guarded area "billing"
  And `src/cart/index.ts#1`, which adds a parameter to the exported function `calcTotal`, is in the public API guarded area
  And the analysis reports a notice that names the setting removing the public API area
```

## C001-REQ-426

#### C001-AC-426.1 — The review configuration of the snapshot's base commit applies to its review
```gherkin
Scenario: C001-TS-476 — The base commit's configuration applies when the change does not touch it
  Given the review configuration of the base commit of fixture `shop-ts` has the generated-file pattern `src/api/generated/**`
  And the change does not modify the review configuration
  When the analysis of the snapshot completes
  Then every hunk of `src/api/generated/client.ts` is cleared by the generated-file rule
```
```gherkin
Scenario: C001-TS-477 — A maintainer's configuration edit applies to reviews whose base commit contains it
  Given the maintainer committed the generated-file pattern `src/api/generated/**` in commit "a1b2c3d" of fixture `shop-ts`
  And a later change is taken in at intake with a base commit that descends from "a1b2c3d"
  When the analysis of the snapshot of that change completes
  Then every hunk of `src/api/generated/client.ts` is cleared by the generated-file rule
```
```gherkin
Scenario: C001-TS-478 — A base commit without a review configuration gives the default configuration
  Given the base commit of fixture `shop-ts` holds no review configuration
  And the change adds a review configuration with the generated-file pattern `src/**`
  When the analysis of the snapshot completes
  Then no hunk of `src/cart/total.ts` is cleared by the generated-file rule
  And every hunk of the added review configuration is open and in the dependency, build and configuration guarded area
```
```gherkin
Scenario: C001-TS-479 — A change cannot loosen the clearing of its own hunks
  Given the review configuration of the base commit of fixture `shop-ts` disables the passing-tests rule and has no generated-file pattern
  And the change edits the review configuration to enable the passing-tests rule and add the generated-file pattern `src/**`
  And hunk `src/cart/total.ts#4` meets every condition of the passing-tests rule
  When the analysis of the snapshot completes
  Then `src/cart/total.ts#4` is open
  And no hunk of the snapshot is cleared by the passing-tests rule or by the generated-file rule
  And every hunk of the review configuration is open and in the dependency, build and configuration guarded area
```

## C001-REQ-427

#### C001-AC-427.1 — An unreadable review configuration clears no hunk and reports the error
```gherkin
Scenario Outline: C001-TS-480 — A configuration error stops all clearing
  Given the review configuration of the base commit of fixture `shop-ts` <error>
  And hunk `src/cart/total.ts#1` keeps the abstract syntax tree and comment text of the base commit
  And hunk `src/api/generated/client.ts#1` is in a file the `.gitattributes` file marks as `linguist-generated`
  When the analysis of the snapshot completes
  Then no hunk of the snapshot is cleared
  And the analysis reports a notice that names <named>

  Examples:
    | error | named |
    | has a syntax error on line 7 | the review configuration file and line 7 |
    | gives the invalid path pattern `src/[billing` for an added guarded area | the review configuration file and the pattern `src/[billing` |
```
```gherkin
Scenario: C001-TS-481 — An unreadable configuration in the snapshot does not stop clearing under a readable base configuration
  Given the review configuration of the base commit of fixture `shop-ts` is readable and enables the formatting rule
  And the change leaves a syntax error on line 3 of the review configuration
  And hunk `src/cart/total.ts#1` keeps the abstract syntax tree and comment text of the base commit
  When the analysis of the snapshot completes
  Then `src/cart/total.ts#1` is cleared by the formatting rule
  And every hunk of the review configuration is open
```

## Coverage table

| REQ | happy | alternate | boundary | error | authorization | concurrency/idempotency | abuse |
|---|---|---|---|---|---|---|---|
| C001-REQ-401 | TS-401 | TS-402 | TS-403, TS-482 | n/a: missing coverage is the error path of REQ-404 (TS-411) | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: repeatability of scores is tested under REQ-405 (TS-418) | n/a: a score alone clears nothing (TS-444) |
| C001-REQ-402 | TS-404 | n/a: the five signals are the only variations, all in TS-404 | TS-405 | n/a: the rule constrains outputs; no input makes it fail | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: scores are computed once per analysis of a snapshot | n/a: a score alone clears nothing (TS-444) |
| C001-REQ-403 | TS-406 | TS-407, TS-483 | TS-408, TS-483 | n/a: every set of hunks has one total order, cycles of definitions and uses included (TS-483); no input makes the ordering fail | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-409, TS-410 | n/a: the order changes no clearing and no verdict |
| C001-REQ-404 | TS-411 | TS-412 | TS-413 | TS-411 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: scores are computed once per analysis of a snapshot | TS-414 |
| C001-REQ-405 | TS-415 | TS-416 | n/a: the requirement has no numeric or size limit | TS-416 | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-418 | TS-417 |
| C001-REQ-406 | TS-419 | TS-419 | TS-422 | TS-420 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: clearing is decided once per analysis; later evidence is REQ-411 | TS-421 |
| C001-REQ-407 | TS-423 | TS-423 | TS-426 | TS-424 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: clearing is decided once per analysis; later evidence is REQ-411 | TS-425 |
| C001-REQ-408 | TS-427 | TS-427 | TS-429 | TS-428 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: clearing is decided once per analysis; later evidence is REQ-411 | TS-428 |
| C001-REQ-409 | TS-430 | TS-431 | TS-434 | TS-432 | TS-433 | n/a: clearing is decided once per analysis; later evidence is REQ-411 | TS-432, TS-433 |
| C001-REQ-410 | TS-435 | TS-436, TS-437 | TS-438, TS-441 | TS-439 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: late evidence is covered under REQ-411 (TS-442); runs on changed files under REQ-509 | TS-440 |
| C001-REQ-411 | TS-442 | TS-484, TS-485 | TS-485 | TS-442 | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-442 | n/a: reopening only keeps more hunks open |
| C001-REQ-412 | TS-443 | n/a: the five admitted rules are tested under REQ-406 to REQ-410 | n/a: the requirement has no numeric or size limit | TS-444 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: clearing is decided once per analysis | TS-444 |
| C001-REQ-413 | TS-445 | TS-445 | n/a: area membership boundaries are tested under REQ-414 to REQ-417 and REQ-423 | n/a: no input makes the rule fail; it only keeps hunks open | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: clearing is decided once per analysis | TS-445 |
| C001-REQ-414 | TS-446 | TS-447 | TS-448 | n/a: recognition reads paths, identifiers and imports; no input makes it fail | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: recognition runs once per analysis of a snapshot | TS-449 |
| C001-REQ-415 | TS-450 | TS-450 | TS-451 | n/a: recognition reads paths and file types; no input makes it fail | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: recognition runs once per analysis of a snapshot | n/a: the change cannot alter the path patterns of its own review (TS-479, TS-474) |
| C001-REQ-416 | TS-452 | TS-452 | n/a: membership is a pattern match with no numeric limit | n/a: recognition reads paths; no input makes it fail | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: recognition runs once per analysis of a snapshot | TS-453 |
| C001-REQ-417 | TS-454 | TS-456 | TS-455 | n/a: recognition reads symbols and file types; no input makes it fail | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: recognition runs once per analysis of a snapshot | TS-426 |
| C001-REQ-418 | TS-457 | TS-458 | TS-486 | n/a: no input makes the rule fail; it only keeps hunks open | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: clearing is decided once per analysis | TS-486 (model output cannot hold a hunk open) |
| C001-REQ-419 | TS-459 | TS-460 | TS-461 | n/a: a record is written for every clearing; a hunk without one is not cleared | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: one record per clearing, written when the hunk is cleared | n/a: the record holds only tool-produced evidence; agent claims do not clear (TS-440) |
| C001-REQ-420 | TS-462 | TS-463 | TS-464 | n/a: display of existing analysis results; no failing input | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: covered by the UI response NFR-003 | n/a: display only; no input from the change alters it |
| C001-REQ-421 | TS-465 | TS-466 | n/a: one hunk is expanded at a time; no numeric limit | n/a: every cleared hunk has an evidence record (TS-459) | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: expanding changes no review state | n/a: display only |
| C001-REQ-422 | TS-467 | n/a: the requirement has one path | n/a: the requirement has no numeric or size limit | n/a: reopening an open hunk is not defined by the requirement | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-468 | n/a: reopening only keeps more hunks open |
| C001-REQ-423 | TS-469 | TS-470 | TS-471 | n/a: an invalid pattern is the configuration error of REQ-427 (TS-480) | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: the configuration is read once per analysis | n/a: adding areas only keeps more hunks open |
| C001-REQ-424 | TS-472 | TS-472 | n/a: a rule is disabled or not; no numeric limit | n/a: an invalid setting is the configuration error of REQ-427 (TS-480) | TS-473 | n/a: the configuration is read once per analysis | TS-473 |
| C001-REQ-425 | TS-474 | TS-475 | TS-474 | n/a: the setting is ignored, not refused; an unreadable file is REQ-427 | TS-474 | n/a: the configuration is read once per analysis | TS-474 |
| C001-REQ-426 | TS-476 | TS-477 | TS-478 | TS-481 | TS-479 | n/a: the configuration is read once per analysis of a snapshot | TS-479 |
| C001-REQ-427 | TS-480 | TS-481 | TS-480 | TS-480 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: the configuration is read once per analysis of a snapshot | n/a: a broken configuration only keeps more hunks open |
