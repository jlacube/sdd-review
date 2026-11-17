---
id: "C001-CAP-05"
artifact: spec/acceptance
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Test-first reading and executable evidence"
---
# C001-CAP-05 — Acceptance criteria and scenarios

Requirements: `requirements.md`. Terms: `40-domain/glossary-delta.md`. Observation points,
notation and the fixtures `shop-ts`, `shop-py`, `shop-cs` and `tool-go` are those of
`../CAP-04-risk-triage/acceptance.md`. Additional fixtures:

| Fixture | Content |
|---|---|
| `svc-java` | Java repository (outside the deep ecosystems) whose Maven test run writes a Cobertura XML report |
| `agent-log.md` | Agent transcript of the `shop-ts` change, named at intake; it records the run `node scripts/try-coupon.js SAVE10` with the output "total 0.00", linked to intent "Apply a coupon" |

Test-file conventions per ecosystem: C001-IF-005 §10 (`50-interfaces/builtin-policy.md`); scenarios
state the convention a file follows in a `Given` step. Every test command runs on the local machine.

**Repository record** (scenarios of C001-REQ-521 and C001-REQ-522): before the run starts the test
records the output of `git status --porcelain=v2`, the hash of `.git/index`, every branch and tag
with its commit, the count of commits reachable from every ref, and the content hash and file mode
of every file under the working-tree root, ignored files included; a file-system watcher on the
working-tree root records every write from the start of the run until the check.

## C001-REQ-501

#### C001-AC-501.1 — Hunks of test files, feature files, SDD acceptance scenarios and configured test paths are test hunks
```gherkin
Scenario Outline: C001-TS-501 — Test files of each kind are recognised as test hunks
  Given in fixture <fixture> the change modifies <file>, which <kind>
  When the analysis of the snapshot completes
  Then every hunk of <file> is classified as a test hunk

  Examples:
    | fixture | file | kind |
    | `shop-ts` | `src/cart/total.test.ts` | follows the TypeScript/JavaScript test-file conventions |
    | `shop-py` | `tests/test_total.py` | follows the Python test-file conventions |
    | `shop-cs` | `tests/Shop.Tests/CartTests.cs` | follows the C#/.NET test-file conventions |
    | `shop-ts` | `features/coupon.feature` | is a Gherkin feature file |
    | `shop-ts` | `.sdd/004-coupons/10-spec/20-capabilities/CAP-01-coupon/acceptance.md` | holds acceptance scenarios of the repository's SDD workspace |
```
```gherkin
Scenario Outline: C001-TS-502 — Outside the deep ecosystems only a configured test path pattern makes a test hunk
  Given the review configuration of the base commit of fixture `tool-go` <patterns>
  And the change modifies `internal/cart/total_test.go`
  When the analysis of the snapshot completes
  Then the hunks of `internal/cart/total_test.go` are <classification>

  Examples:
    | patterns | classification |
    | has the test path pattern `**/*_test.go` | classified as test hunks |
    | has no test path pattern | not classified as test hunks |
```

## C001-REQ-502

#### C001-AC-502.1 — An intent's test hunks come before its other hunks in intent order
```gherkin
Scenario: C001-TS-503 — A low-risk test hunk precedes a high-risk implementation hunk
  Given intent "Apply a coupon" of fixture `shop-ts` has the open test hunk `src/coupon/apply.test.ts#1` with risk score 2
  And it has the open hunk `src/coupon/apply.ts#1` with risk score 9
  When the analysis of the snapshot completes
  Then `src/coupon/apply.test.ts#1` comes before `src/coupon/apply.ts#1` in the intent order
```
```gherkin
Scenario: C001-TS-504 — A cleared test hunk still precedes an open implementation hunk
  Given intent "Apply a coupon" of fixture `shop-ts` has the test hunk `src/coupon/apply.test.ts#2`, cleared by the formatting rule
  And it has the open hunk `src/coupon/apply.ts#1` with risk score 9
  When the analysis of the snapshot completes
  Then `src/coupon/apply.test.ts#2` comes before `src/coupon/apply.ts#1` in the intent order
```
```gherkin
Scenario: C001-TS-505 — Test hunks of an intent are listed first in the review UI
  Given intent "Apply a coupon" of fixture `shop-ts` has 2 test hunks and 5 other hunks
  When the developer opens intent "Apply a coupon" in the review UI
  Then the first 2 hunk entries listed are the 2 test hunks
```

## C001-REQ-503

#### C001-AC-503.1 — The developer's judgement of an intent's tests is stored with the intent for the snapshot
```gherkin
Scenario Outline: C001-TS-506 — Each judgement value is stored
  Given intent "Apply a coupon" of the `shop-ts` snapshot "S1" has 2 test hunks and no test judgement
  When the developer records that the test hunks of intent "Apply a coupon" <judgement>
  Then the review state of snapshot "S1" holds the test judgement "<stored>" for intent "Apply a coupon"

  Examples:
    | judgement | stored |
    | express the intent | expresses |
    | do not express the intent | does not express |
```
```gherkin
Scenario: C001-TS-507 — A new judgement replaces the earlier one
  Given the review state of snapshot "S1" holds the test judgement "expresses" for intent "Apply a coupon"
  When the developer records that the test hunks of intent "Apply a coupon" do not express the intent
  Then the review state of snapshot "S1" holds the test judgement "does not express" for intent "Apply a coupon"
```
```gherkin
Scenario: C001-TS-508 — A judgement belongs to its snapshot only
  Given the review state of snapshot "S1" of fixture `shop-ts` holds the test judgement "expresses" for intent "Apply a coupon"
  And the developer took a new snapshot "S2" after changing `src/coupon/apply.ts`
  When the developer opens intent "Apply a coupon" in the review of snapshot "S2"
  Then the intent has no test judgement in the review of snapshot "S2"
```

## C001-REQ-504

#### C001-AC-504.1 — Only tests whose executed changed test lines belong to intents judged as expressing them count for the passing-tests rule
```gherkin
Scenario Outline: C001-TS-509 — A test qualifies only when the changed test lines it ran have been judged
  Given hunk `src/coupon/apply.ts#1` of fixture `shop-ts` adds 3 executable lines that only the passing test <test> executes
  And that test <test lines>
  And the judgement of the intent of those test lines is <judgement>
  And no mutant on `src/coupon/apply.ts#1` survived
  When the analysis of the snapshot completes
  Then `src/coupon/apply.ts#1` is <state>

  Examples:
    | test | test lines | judgement | state |
    | "total › sums lines" | executes no changed test line, it and its helpers being unchanged since the base commit | none recorded | cleared by the passing-tests rule |
    | "coupon › applies 10 %" | executes 12 changed lines of test hunks of intent "Apply a coupon" | expresses | cleared by the passing-tests rule |
    | "coupon › applies 10 %" | executes 12 changed lines of test hunks of intent "Apply a coupon" | none recorded | open |
    | "coupon › applies 10 %" | executes 12 changed lines of test hunks of intent "Apply a coupon" | does not express | open |
    | "total › sums lines" | executes 3 changed lines of the fixture helper `tests/fixtures/cart.ts`, a test hunk of intent "Apply a coupon" | none recorded | open |
```
```gherkin
Scenario: C001-TS-510 — A test that runs changed test lines of two intents needs both judgements
  Given the passing test "checkout › coupon and tax" executes changed test lines of intent "Apply a coupon", judged "expresses", and of intent "Charge VAT", with no test judgement
  And it is the only test executing the 3 executable lines that `src/coupon/apply.ts#1` adds
  When the analysis of the snapshot completes
  Then `src/coupon/apply.ts#1` is open
```
```gherkin
Scenario: C001-TS-511 — A test added in orphan code does not qualify
  Given the change adds the test file `src/misc/coverage.test.ts`, whose hunks are orphan code
  And its passing test "misc › runs everything" is the only test executing the 3 executable lines that `src/coupon/apply.ts#1` adds
  When the analysis of the snapshot completes
  Then `src/coupon/apply.ts#1` is open
```

## C001-REQ-505

#### C001-AC-505.1 — The analysis runs the developer's test command, or else the configured one, on the snapshot
```gherkin
Scenario: C001-TS-512 — The test command given for the review is run
  Given the developer starts the review of fixture `shop-ts` with the test command `npx jest`
  When the analysis of the snapshot starts
  Then the analysis core runs `npx jest` on the snapshot
  And the test run record names the command `npx jest` and the snapshot ID
```
```gherkin
Scenario: C001-TS-513 — Without a command for the review, the configured test command is run
  Given the review configuration of the base commit of fixture `shop-py` has the test command `pytest -q`
  And the developer starts the review without a test command
  When the analysis of the snapshot starts
  Then the analysis core runs `pytest -q` on the snapshot
```
```gherkin
Scenario: C001-TS-514 — The developer's command takes precedence over the configured one
  Given the review configuration of the base commit of fixture `shop-py` has the test command `pytest -q`
  And the developer starts the review with the test command `pytest -q tests/cart`
  When the analysis of the snapshot starts
  Then the analysis core runs `pytest -q tests/cart` on the snapshot
  And it does not run `pytest -q`
```
```gherkin
Scenario: C001-TS-515 — A change cannot replace the test command that judges it
  Given the review configuration of the base commit of fixture `shop-py` has the test command `pytest -q`
  And the change edits the review configuration to set the test command `echo "212 passed"`
  And the developer starts the review without a test command
  When the analysis of the snapshot starts
  Then the analysis core runs `pytest -q` on the snapshot
  And it does not run `echo "212 passed"`
```

## C001-REQ-506

#### C001-AC-506.1 — Each line added in a deep-ecosystem file records the passing and failing tests that executed it
```gherkin
Scenario: C001-TS-516 — Passing and failing tests are recorded per added line
  Given hunk `src/cart/total.ts#1` of fixture `shop-ts` adds the lines 10 to 14
  And the test run executes lines 10 to 13 in the passing test "total › sums lines" and line 12 in the failing test "total › rounds"
  When the test run of the snapshot completes
  Then the evidence output records for lines 10, 11 and 13 the passing test "total › sums lines" and no failing test
  And it records for line 12 the passing test "total › sums lines" and the failing test "total › rounds"
  And it records for line 14 no passing and no failing test
```
```gherkin
Scenario Outline: C001-TS-517 — Per-test line records are made in the other deep ecosystems
  Given hunk <hunk> of fixture <fixture> adds line <line>, executed only by the passing test <test>
  When the test run of the snapshot completes
  Then the evidence output records for line <line> of <hunk> the passing test <test> and no failing test

  Examples:
    | fixture | hunk | line | test |
    | `shop-py` | `shop/cart/total.py#3` | 22 | `tests/test_total.py::test_sums_lines` |
    | `shop-cs` | `src/Shop/Cart/Cart.cs#2` | 41 | `Shop.Tests.CartTests.SumsLines` |
```
```gherkin
Scenario: C001-TS-567 — With an editable install from the working tree, the passing tests of an added Python line are recorded
  Given hunk `shop/cart/total.py#3` of fixture `shop-py` adds line 22, executed only by the passing test `tests/test_total.py::test_sums_lines`
  And the developer's environment activates the virtual environment `.venv` of the working tree, in which the package `shop` is installed in editable mode from the working tree
  And the working tree has no `__pycache__` folder under `shop/`
  When the test run of `pytest` on the snapshot completes
  Then the evidence output records for line 22 of `shop/cart/total.py#3` the passing test `tests/test_total.py::test_sums_lines` and no failing test
  And no notice ERR-EVID-008 is shown
  And the working tree has no `__pycache__` folder under `shop/`
```
```gherkin
Scenario: C001-TS-574 — Lines executed in working-tree files through an absolute path count for no hunk
  Given hunk `src/cart/total.ts#1` of fixture `shop-ts` adds the lines 10 to 14, executed only by the passing test "total › sums lines"
  And the snapshot's `jest.config.js` maps the module name `@shop/cart` to the absolute path of the folder `src/cart` under the working-tree root of `shop-ts`, through which "total › sums lines" imports `src/cart/total.ts`
  When the test run of `npx jest` on the snapshot completes
  Then the evidence output records for lines 10 to 14 of `src/cart/total.ts#1` no passing and no failing test
  And it records the test "total › sums lines" as passed
  And the developer is notified with ERR-EVID-008 that names the command `npx jest`, the count 1 and the working-tree file `src/cart/total.ts`
```
```gherkin
Scenario: C001-TS-584 — Lines executed only in an installed copy of the project count for no hunk
  Given hunk `shop/cart/total.py#3` of fixture `shop-py` adds line 22, executed only by the passing test `tests/test_total.py::test_sums_lines`
  And the evidence workspace holds the virtual environment `.venv`, made available there, into which the package `shop` is installed as a regular copy (`pip install .`)
  And `tests/test_total.py::test_sums_lines` imports `shop.cart.total` from `.venv/lib/python3.12/site-packages/shop/cart/total.py` of the evidence workspace
  When the test run of `pytest` on the snapshot completes
  Then the evidence output records for line 22 of `shop/cart/total.py#3` no passing and no failing test
  And it records the test `tests/test_total.py::test_sums_lines` as passed
  And no notice ERR-EVID-008 is shown
```
```gherkin
Scenario: C001-TS-518 — An added comment line records no test
  Given hunk `src/cart/total.ts#2` of fixture `shop-ts` adds the comment-only line 30 and the executable line 31
  And the passing test "total › applies tax" executes line 31
  When the test run of the snapshot completes
  Then the evidence output records for line 30 no passing and no failing test
  And it records for line 31 the passing test "total › applies tax"
```

## C001-REQ-507

#### C001-AC-507.1 — LCOV and Cobertura XML reports give the executed added lines of files outside the deep ecosystems
```gherkin
Scenario Outline: C001-TS-519 — A standard coverage report gives the executed lines of each hunk
  Given the test run of fixture <fixture> writes the <format> report <report>
  And hunk <hunk> adds the lines <added>, of which the report marks <executed> as executed
  When the test run of the snapshot completes
  Then the evidence output records lines <executed> of <hunk> as executed and the other added lines as not executed
  And <hunk> is not cleared by the passing-tests rule

  Examples:
    | fixture | format | report | hunk | added | executed |
    | `tool-go` | LCOV | `coverage/lcov.info` | `internal/cart/total.go#1` | 20 to 24 | 20 to 22 |
    | `svc-java` | Cobertura XML | `target/site/cobertura/coverage.xml` | `src/main/java/shop/Cart.java#1` | 50 to 53 | 50 and 51 |
```
```gherkin
Scenario: C001-TS-520 — A coverage report in another format gives no executed lines
  Given the test run of fixture `tool-go` writes only a coverage report in the Go cover profile format `coverage.out`
  When the test run of the snapshot completes
  Then the evidence output records no executed lines for `internal/cart/total.go#1`
  And the triage output records for `internal/cart/total.go#1` test coverage 0 % labelled "unknown"
```

## C001-REQ-508

#### C001-AC-508.1 — When the tests cannot run, test evidence is marked unavailable with its reason and the analysis continues
```gherkin
Scenario Outline: C001-TS-521 — Each failure to obtain test results marks the evidence unavailable
  Given the review of fixture `shop-ts` <situation>
  When the analysis of the snapshot completes
  Then the snapshot's test evidence is marked unavailable with the reason "<reason>"
  And the triage output holds the intent map and a risk score for each of the 12 hunks
  And no hunk is cleared by the passing-tests rule

  Examples:
    | situation | reason |
    | has no test command given and none in the review configuration of the base commit | no test command |
    | has the test command `npx jset`, which fails to start with "command not found" | the test command failed to start |
    | has the test command `npm run lint`, which exits with status 0 without reporting test results | the test command reported no test results |
    | has the test command `npx jest`, which the developer cancels 30 seconds after it starts | cancelled by the developer |
```
```gherkin
Scenario: C001-TS-522 — Failing tests are evidence, not a failure to run
  Given the review of fixture `shop-ts` has the test command `npx jest`
  And `npx jest` exits with status 1 and reports 40 passing and 3 failing tests
  When the analysis of the snapshot completes
  Then the snapshot's test evidence is available
  And the evidence output records the 3 failing tests
```

## C001-REQ-509

#### C001-AC-509.1 — Results of runs on file content that differs from the snapshot are not evidence
```gherkin
Scenario: C001-TS-523 — A test run that adds a file the ignore rules do not exclude produces no evidence
  Given the review of fixture `shop-ts` has the test command `npm test`, whose test "report › writes summary" writes the file `report-summary.json` next to `package.json`
  And no ignore rule of the snapshot excludes `report-summary.json`
  When the test run of the snapshot completes
  Then the evidence output records no result of that test run
  And the developer is notified with ERR-EVID-005 that the files no longer match the snapshot, naming `report-summary.json`
```
```gherkin
Scenario: C001-TS-524 — An evidence-bundle command that rewrites a file of the snapshot is not recorded
  Given the evidence bundle of intent "Apply a coupon" of fixture `shop-ts` holds the confirmed command `node scripts/seed-coupons.js`, which rewrites `src/coupon/data.json` and exits with status 0
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the evidence output records no run of `node scripts/seed-coupons.js` as evidence
  And the developer is notified with ERR-EVID-005 that the files no longer match the snapshot, naming `src/coupon/data.json`
```
```gherkin
Scenario: C001-TS-525 — A test command that rewrites source files produces no evidence
  Given the review of fixture `shop-ts` has the test command `npm test`, whose script rewrites `src/api/generated/client.ts` before it runs the tests
  When the test run of the snapshot completes
  Then the evidence output records no result of that test run
  And the developer is notified that the files no longer match the snapshot
```
```gherkin
Scenario: C001-TS-558 — A run that writes only files the ignore rules exclude keeps its results
  Given the review of fixture `shop-ts` has the test command `npx jest`, whose run writes `coverage/lcov.info` and `dist/cart.js`
  And the ignore rules of the snapshot exclude `coverage/` and `dist/`
  And `npx jest` reports 40 passing tests
  When the test run of the snapshot completes
  Then the evidence output records the 40 passing tests as evidence of the snapshot
  And no notice ERR-EVID-005 is shown
```

## C001-REQ-510

#### C001-AC-510.1 — Each intent keeps an evidence bundle of entered and proposed commands
```gherkin
Scenario: C001-TS-526 — The bundle holds entered commands and commands proposed from agent runs and scenarios
  Given the developer entered the command `npm run demo:coupon` for intent "Apply a coupon" of fixture `shop-ts`
  And `agent-log.md` records the run `node scripts/try-coupon.js SAVE10` linked to intent "Apply a coupon"
  And the acceptance scenario at `features/coupon.feature` line 12 belongs to intent "Apply a coupon"
  When the developer opens the evidence bundle of intent "Apply a coupon"
  Then the bundle lists `npm run demo:coupon` as entered by the developer
  And it lists `node scripts/try-coupon.js SAVE10` as proposed from `agent-log.md`
  And it lists a command proposed from the acceptance scenario at `features/coupon.feature` line 12
```
```gherkin
Scenario: C001-TS-527 — A run linked to another intent is not proposed for this intent
  Given `agent-log.md` records the run `node scripts/vat.js` linked only to intent "Charge VAT"
  When the developer opens the evidence bundle of intent "Apply a coupon"
  Then the bundle does not list `node scripts/vat.js`
```
```gherkin
Scenario: C001-TS-528 — An intent without commands has an empty bundle
  Given intent "Rename cart fields" of fixture `shop-ts` has no linked agent run, no acceptance scenario and no entered command
  When the developer opens the evidence bundle of intent "Rename cart fields"
  Then the bundle lists no command
```

## C001-REQ-511

#### C001-AC-511.1 — A proposed command runs only after the developer confirms it
```gherkin
Scenario: C001-TS-529 — An unconfirmed command proposed from the agent transcript is not run
  Given `agent-log.md` records the run `node scripts/touch-marker.js` linked to intent "Apply a coupon", which creates the file `marker.txt` when it runs
  And the developer has not confirmed the proposed command `node scripts/touch-marker.js`
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the file `marker.txt` does not exist
  And the evidence output records no run of `node scripts/touch-marker.js`
```
```gherkin
Scenario: C001-TS-530 — A confirmed proposed command is run
  Given the developer confirmed the proposed command `node scripts/try-coupon.js SAVE10` of intent "Apply a coupon"
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the evidence output records one run of `node scripts/try-coupon.js SAVE10`
```
```gherkin
Scenario: C001-TS-531 — An unconfirmed command proposed from an acceptance scenario is not run
  Given the evidence bundle of intent "Apply a coupon" holds a command proposed from the acceptance scenario at `features/coupon.feature` line 12
  And the developer has not confirmed it
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the evidence output records no run of that command
```
```gherkin
Scenario: C001-TS-555 — A run requested for one unconfirmed proposed command is refused
  Given `agent-log.md` records the run `node scripts/touch-marker.js` linked to intent "Apply a coupon", which creates the file `marker.txt` when it runs
  And the developer has not confirmed the proposed command `node scripts/touch-marker.js`
  When the review UI requests the run of that single proposed command
  Then the local review HTTP API answers 409 with the code ERR-EVID-007 naming `node scripts/touch-marker.js` and `agent-log.md`
  And the file `marker.txt` does not exist
  And the evidence output records no run of `node scripts/touch-marker.js`
```

## C001-REQ-512

#### C001-AC-512.1 — Running a bundle records each confirmed command's exit status, standard output and standard error as produced
```gherkin
Scenario: C001-TS-532 — A successful command is recorded as produced
  Given the evidence bundle of intent "Apply a coupon" holds the confirmed command `node scripts/try-coupon.js SAVE10`, which prints "total 90.00" and exits with status 0
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the evidence output records for the run exit status 0, standard output "total 90.00" followed by a line end, and an empty standard error
```
```gherkin
Scenario: C001-TS-533 — A failing command is recorded as produced
  Given the evidence bundle of intent "Apply a coupon" holds the confirmed command `node scripts/try-coupon.js BOGUS`, which writes "unknown coupon BOGUS" to standard error and exits with status 3
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the evidence output records for the run exit status 3, an empty standard output and standard error "unknown coupon BOGUS" followed by a line end
```
```gherkin
Scenario: C001-TS-534 — A command with no output is recorded with empty outputs
  Given the evidence bundle of intent "Apply a coupon" holds the confirmed command `node -e "process.exit(0)"`
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the evidence output records for the run exit status 0, an empty standard output and an empty standard error
```
```gherkin
Scenario: C001-TS-535 — The real output is recorded, not the output the agent reported
  Given `agent-log.md` records the output "total 0.00" for the run `node scripts/try-coupon.js SAVE10`
  And the developer confirmed that proposed command, which prints "total 90.00" when run on the snapshot
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the evidence output records standard output "total 90.00" followed by a line end for the run
```
```gherkin
Scenario: C001-TS-554 — Entered and confirmed commands run, unconfirmed proposed commands do not
  Given the evidence bundle of intent "Apply a coupon" holds the command `npm run demo:coupon` entered by the developer and never separately confirmed
  And it holds the proposed command `node scripts/try-coupon.js SAVE10`, confirmed by the developer
  And it holds the proposed command `node scripts/touch-marker.js`, not confirmed, which creates the file `marker.txt` when it runs
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the evidence output records one run each of `npm run demo:coupon` and `node scripts/try-coupon.js SAVE10` with their exit status, standard output and standard error
  And it records no run of `node scripts/touch-marker.js`
  And the file `marker.txt` does not exist
```
```gherkin
Scenario: C001-TS-582 — A bundle run asked for during the mutation copy waits for the copy and then runs in the test run's workspace
  Given the test run of the `shop-ts` snapshot "S1" has ended, its check after the run has passed, and the evidence runner is copying its workspace for mutation testing
  And no other evidence workspace of "S1" is free
  And the evidence bundle of intent "Apply a coupon" holds the confirmed command `node scripts/try-coupon.js SAVE10`, which prints "total 90.00" and exits with status 0
  When the developer runs the evidence bundle of intent "Apply a coupon" before the copy ends
  Then the command starts after the copy has ended, with the root of the test run's evidence workspace as its working directory
  And the evidence workspaces of "S1" are the test run's workspace and the mutation copy only
  And the evidence output of "S1" records the run with exit status 0 and standard output "total 90.00" followed by a line end
```
```gherkin
Scenario Outline: C001-TS-583 — Bundle commands run in the test run's workspace while mutation testing runs and after it has ended
  Given the test run of the `shop-ts` snapshot "S1" has ended and the copy of its workspace for mutation testing has been made
  And mutation testing of "S1" <state>
  And the evidence bundle of intent "Apply a coupon" holds 10 confirmed commands, `node scripts/echo.js 01` to `node scripts/echo.js 10`, each of which prints its number and exits with status 0
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then each of the 10 commands runs with the root of the test run's evidence workspace as its working directory
  And the evidence workspaces of "S1" are <workspaces>
  And the evidence output of "S1" records 10 runs, each with exit status 0 and its number on standard output followed by a line end

  Examples:
    | state | workspaces |
    | is running on `src/coupon/rules.ts#1` | the test run's workspace and the mutation copy only |
    | has ended | the test run's workspace only |
```

The time that the analysis core adds to these runs, C001-NFR-018 (c), is measured only by
C001-DOD-014 on the reference machine; no scenario of this file asserts it.

## C001-REQ-513

#### C001-AC-513.1 — A completed run shows its differences from the reference run
```gherkin
Scenario: C001-TS-536 — A re-run shows the differences from the previous run
  Given the previous run of `node scripts/try-coupon.js SAVE10` by the analysis core recorded exit status 0 and standard output "total 90.00"
  And the command now prints "total 81.00" and exits with status 0
  When the run of `node scripts/try-coupon.js SAVE10` completes
  Then the review UI shows the standard output line "total 90.00" as removed and "total 81.00" as added
  And it shows the exit status as unchanged
```
```gherkin
Scenario: C001-TS-537 — The first run of an agent-recorded command is compared with the agent's recorded output
  Given `agent-log.md` records the output "total 0.00" for the run `node scripts/try-coupon.js SAVE10`
  And the analysis core has not run the command before
  When the first run of `node scripts/try-coupon.js SAVE10`, which prints "total 90.00", completes
  Then the review UI shows the line "total 0.00" of the agent's recorded output as removed and "total 90.00" as added
```
```gherkin
Scenario: C001-TS-538 — The first run of an entered command has no comparison
  Given the developer entered the command `npm run demo:coupon` for intent "Apply a coupon" and it has never run
  When the first run of `npm run demo:coupon` completes
  Then the review UI shows the run's outputs without a comparison
```

## C001-REQ-514

#### C001-AC-514.1 — Mutation testing runs on changed deep-ecosystem lines that passing tests executed, riskiest hunk first
```gherkin
Scenario: C001-TS-539 — Mutants are generated on executed changed lines in descending risk score of their hunks
  Given the test run of fixture `shop-ts` completed with test results
  And passing tests executed changed lines of hunk `src/coupon/rules.ts#1` with risk score 9 and of hunk `src/cart/total.ts#1` with risk score 3
  When mutation testing of the snapshot runs
  Then every mutant of `src/coupon/rules.ts#1` is recorded before the first mutant of `src/cart/total.ts#1`
  And every mutant lies on a changed line that a passing test executed
```
```gherkin
Scenario: C001-TS-540 — Lines not executed by a passing test get no mutant
  Given hunk `src/cart/total.ts#1` of fixture `shop-ts` adds lines 10 to 14
  And passing tests executed lines 10 to 12, only the failing test "total › rounds" executed line 13, and no test executed line 14
  When mutation testing of the snapshot completes
  Then the evidence output records mutants of `src/cart/total.ts#1` on lines 10 to 12 only
```
```gherkin
Scenario: C001-TS-541 — Files outside the deep ecosystems get no mutation testing
  Given the test run of fixture `tool-go` completed with test results and an LCOV report showing `internal/cart/total.go#1` executed
  When mutation testing of the snapshot completes
  Then the evidence output records no mutant for `internal/cart/total.go#1`
```
```gherkin
Scenario: C001-TS-542 — A test run without results starts no mutation testing
  Given the test command `npm run lint` of the review of fixture `shop-ts` exits without reporting test results
  When the test run of the snapshot completes
  Then the evidence output records no mutant for any hunk of the snapshot
```
```gherkin
Scenario: C001-TS-581 — With the project installed in editable mode in the test run's workspace, mutants are tested in the mutation copy
  Given the evidence workspace of the test run of fixture `shop-py` holds the virtual environment `.venv`, made available there, in which the package `shop` is installed in editable mode from that workspace's own sources
  And mutation testing generates on line 22 of hunk `shop/cart/total.py#3` the mutant replacing "+" by "-"
  And the passing test `tests/test_total.py::test_sums_lines` fails when it executes line 22 with that mutation
  When mutation testing of the snapshot completes
  Then the evidence of `shop/cart/total.py#3` records that mutant as killed
  And no notice ERR-EVID-011 is shown
```

## C001-REQ-515

#### C001-AC-515.1 — Each surviving mutant is recorded in its hunk's evidence with its line and mutation
```gherkin
Scenario: C001-TS-543 — A surviving mutant is recorded with its line and mutation
  Given mutation testing of fixture `shop-ts` generates on line 12 of hunk `src/cart/total.ts#1` the mutant replacing ">=" by ">"
  And no test detects that mutant
  When mutation testing of the snapshot completes
  Then the evidence of `src/cart/total.ts#1` records a surviving mutant on line 12 with the mutation "replace >= by >"
```
```gherkin
Scenario: C001-TS-544 — Only surviving mutants are recorded as surviving
  Given mutation testing generates 5 mutants on the changed lines of hunk `src/cart/total.ts#1`, of which the tests detect 3
  When mutation testing of the snapshot completes
  Then the evidence of `src/cart/total.ts#1` records exactly 2 surviving mutants, each with its line and mutation
```

## C001-REQ-516

#### C001-AC-516.1 — Mutation evidence that cannot be produced is recorded as unavailable with its reason
```gherkin
Scenario Outline: C001-TS-545 — Missing mutation evidence is recorded as unavailable
  Given passing tests executed the changed lines of hunk <hunk> of fixture <fixture>
  And <situation>
  When mutation testing of the snapshot ends
  Then the mutation evidence of <hunk> is recorded as unavailable with the reason "<reason>"
  And the test evidence items of <hunk> have evidence strength 3

  Examples:
    | fixture | hunk | situation | reason |
    | `shop-cs` | `src/Shop/Cart/Cart.cs#2` | no mutation-testing tool for C#/.NET is installed | no mutation-testing tool installed |
    | `shop-ts` | `src/cart/total.ts#1` | the developer cancels mutation testing before it reaches the hunk | mutation testing did not complete |
```
```gherkin
Scenario: C001-TS-546 — Hunks finished before a cancellation keep their results
  Given mutation testing of fixture `shop-ts` has recorded all results of hunk `src/coupon/rules.ts#1` and none of hunk `src/cart/total.ts#1`
  When the developer cancels mutation testing
  Then the mutation results of `src/coupon/rules.ts#1` remain recorded
  And the mutation evidence of `src/cart/total.ts#1` is recorded as unavailable with the reason "mutation testing did not complete"
```
```gherkin
Scenario: C001-TS-580 — Files that the mutation tests load from the test run's workspace get unavailable mutation evidence and ERR-EVID-011
  Given the developer's environment activates the virtual environment `~/.venvs/shop`, outside the working-tree root of fixture `shop-py`
  And `~/.venvs/shop` holds the package `shop` installed in editable mode from the test run's evidence workspace, so that it imports `shop` from that workspace
  And passing tests executed the changed lines of hunks `shop/cart/total.py#3`, `shop/cart/vat.py#1` and `scripts/export.py#1`
  And the tests import `export` through the setting `pythonpath = ["scripts"]` of the snapshot's `pyproject.toml`
  When mutation testing of the snapshot ends
  Then the mutation evidence of `shop/cart/total.py#3` and of `shop/cart/vat.py#1` is recorded as unavailable with the reason "loaded outside the mutation workspace"
  And no mutant of `shop/cart/total.py#3` or of `shop/cart/vat.py#1` is recorded as killed or surviving
  And the developer is notified with ERR-EVID-011 that names the count 2 and the files `shop/cart/total.py` and `shop/cart/vat.py`, each loaded from the test run's evidence workspace
  And no notice ERR-EVID-006 is shown for `shop/cart/total.py#3` or `shop/cart/vat.py#1`
  And the test evidence items of `shop/cart/total.py#3` have evidence strength 3
  And the evidence output records the mutation results of `scripts/export.py#1`
```
```gherkin
Scenario: C001-TS-585 — A failed copy of the test run's workspace is removed and makes the mutation evidence of every hunk unavailable
  Given the test run of `npx jest` on the `shop-ts` snapshot "S1" has ended with 40 passing tests and its check after the run has passed
  And passing tests executed changed lines of hunks `src/coupon/rules.ts#1` and `src/cart/total.ts#1`
  And the file system that holds the evidence workspaces of "S1" has 1 MiB free, less than the size of the test run's workspace
  When the evidence runner's copy of the test run's workspace for mutation testing fails for lack of disk space
  Then the evidence workspaces of "S1" are the test run's workspace only, with no part of the copy left on disk
  And the mutation evidence of `src/coupon/rules.ts#1` and of `src/cart/total.ts#1` is recorded as unavailable with a reason that states that the copy of the test run's workspace could not be made
  And the developer is notified with ERR-EVID-006 for `src/coupon/rules.ts#1` and for `src/cart/total.ts#1`
  And no mutant of `src/coupon/rules.ts#1` or of `src/cart/total.ts#1` is recorded as killed or surviving
  And the evidence output of "S1" still records the 40 passing tests of the test run
  And the test evidence items of `src/coupon/rules.ts#1` and of `src/cart/total.ts#1` have evidence strength 3
```

## C001-REQ-517

#### C001-AC-517.1 — A failing property test's counter-example is recorded on every deep-ecosystem hunk it executed
```gherkin
Scenario: C001-TS-547 — A counter-example is attached to every hunk the failing property test executed
  Given the property-based test "total is never negative" of fixture `shop-ts` executes changed lines of hunks `src/cart/total.ts#1` and `src/coupon/apply.ts#1`
  When the test run fails that test with the counter-example `[{ price: -1, qty: 1 }]`
  Then the evidence of `src/cart/total.ts#1` and of `src/coupon/apply.ts#1` records the counter-example `[{ price: -1, qty: 1 }]` and the test name
```
```gherkin
Scenario: C001-TS-548 — A counter-example from a Python property test is attached
  Given the property-based test `tests/test_total.py::test_total_never_negative` of fixture `shop-py` executes changed lines of hunk `shop/cart/total.py#3`
  When the test run fails that test with the counter-example `price=-1, qty=1`
  Then the evidence of `shop/cart/total.py#3` records the counter-example `price=-1, qty=1`
```
```gherkin
Scenario: C001-TS-549 — A hunk the failing property test did not execute gets no counter-example
  Given the property-based test "total is never negative" of fixture `shop-ts` executes no changed line of hunk `src/cart/format.ts#1`
  When the test run fails that test with the counter-example `[{ price: -1, qty: 1 }]`
  Then the evidence of `src/cart/format.ts#1` records no counter-example
```

## C001-REQ-518

#### C001-AC-518.1 — Every evidence item has one of the five evidence strengths
```gherkin
Scenario Outline: C001-TS-550 — Each kind of evidence item gets its strength
  Given the snapshot of fixture `shop-ts` has the evidence item <item>
  When the developer exports the evidence of the snapshot
  Then the item has evidence strength <strength>

  Examples:
    | item | strength |
    | pure-move proof of `src/cart/total.ts#6` | 1 |
    | pure-rename proof of `src/cart/total.ts#7` | 1 |
    | formatting proof of `src/cart/total.ts#1` | 1 |
    | generated-file declaration of `src/api/generated/client.ts#1` | 1 |
    | tool-run test result of `src/cart/total.ts#4`, whose changed lines have mutation results and no surviving mutant | 2 |
    | mutation result of `src/cart/total.ts#4`, with every mutant killed | 2 |
    | tool-run test result of `src/coupon/apply.ts#1`, whose mutation evidence is unavailable | 3 |
    | tool-run test result of `src/cart/total.ts#2`, which has a surviving mutant | 3 |
    | property counter-example on `src/cart/total.ts#2` | 3 |
    | run of the evidence-bundle command `node scripts/try-coupon.js SAVE10` | 4 |
    | the claim "all 212 tests pass" in `agent-log.md` | 5 |
```
```gherkin
Scenario: C001-TS-551 — An agent's claim of mutation results stays agent-reported evidence
  Given `agent-log.md` states "mutation score 100 % on src/cart/total.ts" and the analysis core ran no mutation testing
  When the developer exports the evidence of the snapshot
  Then the claim is an evidence item with evidence strength 5
  And `src/cart/total.ts#1` has no mutation result with evidence strength 2
```

## C001-REQ-519

#### C001-AC-519.1 — The review UI shows the evidence strength beside every evidence item it shows
```gherkin
Scenario: C001-TS-552 — The evidence of a hunk shows the strength of each item
  Given hunk `src/cart/total.ts#2` of fixture `shop-ts` has a tool-run test result, a surviving mutant and a property counter-example
  When the developer opens `src/cart/total.ts#2` in the review UI
  Then each of the 3 evidence items shown has the evidence strength 3 beside it
```
```gherkin
Scenario: C001-TS-553 — Bundle runs and agent claims show their strengths
  Given intent "Apply a coupon" has one run of `node scripts/try-coupon.js SAVE10` and the agent-reported claim "all 212 tests pass"
  When the developer opens the evidence of intent "Apply a coupon" in the review UI
  Then the bundle run is shown with evidence strength 4
  And the agent-reported claim is shown with evidence strength 5
```

## C001-REQ-520

#### C001-AC-520.1 — A test judgement on an intent without test hunks is refused
```gherkin
Scenario Outline: C001-TS-556 — A judgement on an intent with no test hunk is refused and nothing is stored
  Given intent "Rename cart fields" of the `shop-ts` snapshot "S1" has 4 hunks, none of them a test hunk, and no test judgement
  And the review record of snapshot "S1" holds 7 entries
  When the developer records that the test hunks of intent "Rename cart fields" <judgement>
  Then the analysis core refuses the judgement with a message that intent "Rename cart fields" has no test hunks
  And the review state of snapshot "S1" holds no test judgement for intent "Rename cart fields"
  And the review record of snapshot "S1" still holds 7 entries

  Examples:
    | judgement |
    | express the intent |
    | do not express the intent |
```
```gherkin
Scenario: C001-TS-557 — An intent whose only test hunk was moved to orphan code has no test hunks
  Given intent "Apply a coupon" of the `shop-ts` snapshot "S1" had the single test hunk `src/coupon/apply.test.ts#1` and no test judgement
  And the developer moved `src/coupon/apply.test.ts#1` to orphan code
  When the developer records that the test hunks of intent "Apply a coupon" express the intent
  Then the analysis core refuses the judgement with a message that intent "Apply a coupon" has no test hunks
  And the review state of snapshot "S1" holds no test judgement for intent "Apply a coupon"
```

## C001-REQ-521

#### C001-AC-521.1 — Evidence runs leave the working tree, the index, every branch, tag and commit unchanged, whether they complete, fail, are cancelled or end with the process, except for changes the command or project code makes through a working-tree or git-directory path the analysis core did not supply
```gherkin
Scenario Outline: C001-TS-559 — A completed run that writes files leaves the repository unchanged
  Given the review of fixture `shop-ts` and the repository record taken before <run> starts
  And <run> rewrites <path> and writes the new file `tmp/run-output.txt` in its working directory
  When <run> completes
  Then every value of the repository record is identical
  And the file-system watcher recorded no write under the working-tree root

  Examples:
    | run | path |
    | the test run of `npm test` | `src/api/generated/client.ts` |
    | the run of the confirmed bundle command `node scripts/seed-coupons.js` | `src/coupon/data.json` |
    | mutation testing of `src/cart/total.ts#1` | `src/cart/total.ts` |
```
```gherkin
Scenario Outline: C001-TS-560 — A mutation run that ends early leaves no mutated code in the working tree
  Given mutation testing of fixture `shop-ts` is running and has applied the mutant replacing ">=" by ">" on line 12 of `src/cart/total.ts` in the code it tests
  And the repository record was taken before mutation testing started
  When <end>
  Then line 12 of `src/cart/total.ts` in the working tree holds ">=" as in the snapshot
  And every value of the repository record is identical
  And the file-system watcher recorded no write under the working-tree root

  Examples:
    | end |
    | the developer cancels mutation testing |
    | the analysis core's process is killed |
    | the mutation tool exits with status 1 before its last mutant |
```
```gherkin
Scenario Outline: C001-TS-561 — A test run or bundle run that fails or is cancelled leaves the repository unchanged
  Given the review of fixture `shop-ts` and the repository record taken before <run> starts
  And <run> rewrites `src/cart/total.ts` in its working directory before it ends
  When <end>
  Then every value of the repository record is identical
  And the file-system watcher recorded no write under the working-tree root

  Examples:
    | run | end |
    | the test run of `npm test` | the developer cancels the test run 30 seconds after it starts |
    | the test run of `npm test` | the test command exits with status 2 without reporting test results |
    | the run of the confirmed bundle command `node scripts/rewrite-total.js` | the analysis core's process is killed during the run |
```
```gherkin
Scenario: C001-TS-562 — A bundle command that runs git commands changes no branch, tag, index or commit of the repository
  Given the evidence bundle of intent "Apply a coupon" of fixture `shop-ts` holds the confirmed command `git add -A && git commit -m "pwned" && git tag pwned && git branch pwned`
  And the repository record was taken before the run
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then every value of the repository record is identical
  And the repository has no tag "pwned" and no branch "pwned"
```

## C001-REQ-523

#### C001-AC-523.1 — A change of the working tree, the index, HEAD, a branch or a tag while an evidence run's command runs raises a notice with the run, the count and up to 10 paths, and leaves the recording of the run's results unchanged
```gherkin
Scenario: C001-TS-568 — Files a test writes to an absolute working-tree path are reported and the results are kept
  Given the review of fixture `shop-py`, whose ignore rules exclude `reports/`, with the test command `pytest`, and no folder `reports/` in the working tree
  And the developer's environment sets `SHOP_REPORT_DIR` to the absolute path of the folder `reports` under the working-tree root of `shop-py`
  And the passing test `tests/test_export.py::test_writes_reports` writes the files `total.csv` and `vat.csv` into the folder that `SHOP_REPORT_DIR` names
  When the test run of `pytest` on the snapshot completes
  Then the developer is notified with ERR-EVID-009 that names the test run of `pytest`, the count 2 and the paths `reports/total.csv` and `reports/vat.csv`
  And the notice states that the run or another program changed these paths
  And the evidence output records the results of the test run as evidence of the snapshot, with `tests/test_export.py::test_writes_reports` passing
  And no notice ERR-EVID-005 is shown
  And no notice ERR-EVID-010 is shown
```
```gherkin
Scenario: C001-TS-569 — A bundle command that changes into the working-tree root and writes there is reported
  Given the evidence bundle of intent "Apply a coupon" of fixture `shop-ts` holds the entered command `cd "<working-tree root>" && node scripts/seed-coupons.js`, with the absolute path of the working-tree root of `shop-ts` in its text
  And `scripts/seed-coupons.js` rewrites `src/coupon/data.json` in its working directory and prints "seeded 3 coupons"
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the working-tree file `src/coupon/data.json` holds the content the script wrote
  And the developer is notified with ERR-EVID-009 that names the run of that command, the count 1 and the path `src/coupon/data.json`
  And the evidence output records the run with exit status 0 and standard output "seeded 3 coupons" followed by a line end
  And no notice ERR-EVID-005 is shown
```
```gherkin
Scenario: C001-TS-570 — A developer edit during a test run raises the notice and leaves the results unchanged
  Given the analysis core is running the test command `npx jest` on the snapshot of fixture `shop-ts`, a run that records 40 passing tests when no file changes during it
  When the developer saves a change to `src/cart/total.ts` in the working tree before the test run completes
  Then the developer is notified with ERR-EVID-009 that names the test run of `npx jest`, the count 1 and the path `src/cart/total.ts`, stating that the run or another program changed it
  And the evidence output records the results of that test run as evidence of the snapshot, with the same 40 passing tests
  And no notice ERR-EVID-005 is shown
```
```gherkin
Scenario Outline: C001-TS-571 — The notice states the number of changed paths and names at most 10 of them
  Given the evidence bundle of intent "Apply a coupon" of fixture `shop-ts` holds the entered command `node scripts/touch-files.js "<working-tree root>" <n>`, which creates <n> new files, numbered from `tmp/f01.txt` on, under the absolute path of the working-tree root of `shop-ts` given in its text, and exits with status 0
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then <notice>
  And the evidence output records the run with exit status 0

  Examples:
    | n  | notice                                                                                                   |
    | 0  | no notice ERR-EVID-009 is shown                                                                          |
    | 1  | the developer is notified with ERR-EVID-009 that names the count 1 and the path `tmp/f01.txt`            |
    | 10 | the developer is notified with ERR-EVID-009 that names the count 10 and each of the 10 paths             |
    | 11 | the developer is notified with ERR-EVID-009 that names the count 11 and exactly 10 of the 11 paths       |
```
```gherkin
Scenario: C001-TS-572 — A bundle command that tags the developer's repository through its absolute path is reported
  Given the evidence bundle of intent "Apply a coupon" of fixture `shop-ts` holds the entered command `git -C "<working-tree root>" tag pwned`, with the absolute path of the working-tree root of `shop-ts` in its text
  And the repository has no tag "pwned"
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the developer is notified with ERR-EVID-009 that names the run of that command, the count 1 and the ref `refs/tags/pwned`
  And the evidence output records the run with exit status 0
```
```gherkin
Scenario: C001-TS-573 — A run whose workspace check fails stays unrecorded when the working tree also changes
  Given the analysis core is running the test command `npm test` on the snapshot of fixture `shop-ts`, a run that rewrites `src/api/generated/client.ts` in its evidence workspace
  When the developer saves a change to `src/cart/total.ts` in the working tree before the test run completes
  Then the developer is notified with ERR-EVID-005 that names `src/api/generated/client.ts`
  And the developer is notified with ERR-EVID-009 that names the test run of `npm test`, the count 1 and the path `src/cart/total.ts`
  And the evidence output records no result of that test run as evidence
```

## C001-REQ-524

#### C001-AC-524.1 — An evidence run whose observation of the working tree, the index, HEAD, a branch or a tag is incomplete raises ERR-EVID-010 with the run, each cause and the part not observed, and leaves the recording of the run's results unchanged
```gherkin
Scenario: C001-TS-575 — A watch limit reached during the observation is reported and the results are kept
  Given the analysis core runs the test command `npx jest` on the snapshot of fixture `shop-ts`, a run that records 40 passing tests
  And when the observation of the run starts, the operating system refuses further watches after every directory under the working-tree root is watched except the 12 directories `node_modules/pkg01/` to `node_modules/pkg12/`
  And no path of the working tree and no ref or index of the repository changes during the run
  When the test run of `npx jest` completes
  Then the developer is notified with ERR-EVID-010 that names the test run of `npx jest`, the cause "watch limit", the count 12 and exactly 10 of the 12 directories
  And the notice states that changes in the part not observed during the run may be missing from the list of changed paths
  And no notice ERR-EVID-009 is shown
  And the evidence output records the 40 passing tests as evidence of the snapshot
  And no notice ERR-EVID-005 is shown
```
```gherkin
Scenario Outline: C001-TS-576 — Lost change events are reported as not observed, by directory or as the whole working tree
  Given the analysis core runs the test command `npx jest` on the snapshot of fixture `shop-ts`, a run that records 40 passing tests
  And during the run the change notification <loss>
  And no path of the working tree and no ref or index of the repository changes during the run
  When the test run of `npx jest` completes
  Then the developer is notified with ERR-EVID-010 that names the test run of `npx jest`, the cause "events lost" and <part>
  And the notice states that changes in the part not observed during the run may be missing from the list of changed paths
  And no notice ERR-EVID-009 is shown
  And the evidence output records the 40 passing tests as evidence of the snapshot

  Examples:
    | loss | part |
    | reports lost events for the directory `src/coupon/` | the count 1 and the directory `src/coupon/` |
    | reports a queue overflow that names no directory | the whole working tree |
```
```gherkin
Scenario Outline: C001-TS-577 — A part that cannot be read when the observation starts is reported as not readable
  Given the evidence bundle of intent "Apply a coupon" of fixture `shop-ts` holds the confirmed command `node scripts/try-coupon.js SAVE10`, which prints "total 90.00" and exits with status 0
  And when the observation of the run starts, <unreadable>
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the developer is notified with ERR-EVID-010 that names the run of `node scripts/try-coupon.js SAVE10`, the cause "not readable" and <part>
  And no notice ERR-EVID-009 is shown
  And the evidence output records the run with exit status 0 and standard output "total 90.00" followed by a line end

  Examples:
    | unreadable | part |
    | the directory `data/private/` under the working-tree root cannot be listed or watched (permission denied) | the count 1 and the directory `data/private/` |
    | the index and the refs of the repository cannot be read or watched (permission denied on the git directory) | the repository's index and refs |
```
```gherkin
Scenario: C001-TS-578 — An observation interrupted during mutation testing raises its own notice next to the change notice
  Given mutation testing of the `shop-ts` snapshot "S1" is running on `src/coupon/rules.ts#1` and `src/cart/total.ts#1`
  And the developer saves a change to `src/cart/total.ts` in the working tree 10 seconds after the mutation run starts
  And the observer of the working-tree part fails 20 seconds after the mutation run starts and is not restarted before the run ends
  When mutation testing of "S1" completes
  Then the developer is notified with ERR-EVID-009 that names the mutation run, the count 1 and the path `src/cart/total.ts`
  And the developer is notified with a separate notice ERR-EVID-010 that names the mutation run, the cause "observation interrupted" and the whole working tree
  And the evidence output of "S1" records the mutation results of `src/coupon/rules.ts#1` and of `src/cart/total.ts#1`
```
```gherkin
Scenario: C001-TS-579 — A command that floods the working tree with changes cannot hide a write behind lost events
  Given the evidence bundle of intent "Apply a coupon" of fixture `shop-ts` holds the entered command `node scripts/flood.js "<working-tree root>"`, with the absolute path of the working-tree root of `shop-ts` in its text
  And `scripts/flood.js` creates 20,000 files under `tmp/flood/` of that root, then rewrites `src/coupon/data.json` there, and exits with status 0
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the run is followed by ERR-EVID-010 with the cause "events lost" for the whole working tree or for a part that holds `src/coupon/data.json`, or by ERR-EVID-009 with the count 20,001
  And the evidence output records the run with exit status 0
```

## C001-REQ-522

#### C001-AC-522.1 — Evidence runs continue on the snapshot and count as its evidence when the working tree or HEAD moves on
```gherkin
Scenario: C001-TS-563 — A file saved in the working tree during the test run voids nothing
  Given the analysis core is running the test command `npx jest` on the snapshot of fixture `shop-ts`, in which the test "total › sums lines" passes
  When the developer saves a change to `src/cart/total.ts` in the working tree that would make "total › sums lines" fail, before the test run completes
  Then the evidence output records the results of that test run as evidence of the snapshot, with "total › sums lines" passing
  And no notice ERR-EVID-005 is shown
```
```gherkin
Scenario: C001-TS-564 — A new commit during mutation testing voids no mutation result
  Given mutation testing of the `shop-ts` snapshot "S1", taken with HEAD at C2, is running on `src/coupon/rules.ts#1` and `src/cart/total.ts#1`
  When a new commit C3 that changes `src/cart/total.ts` becomes HEAD before mutation testing completes
  Then the evidence output of "S1" records the mutation results of `src/coupon/rules.ts#1` and of `src/cart/total.ts#1`
  And no mutation evidence of "S1" is recorded as unavailable
```
```gherkin
Scenario: C001-TS-565 — A bundle run started after the working tree moved on runs on the snapshot
  Given the confirmed command `node scripts/try-coupon.js SAVE10` of intent "Apply a coupon" prints "total 90.00" on the `shop-ts` snapshot "S1"
  And after the snapshot was taken the developer edited `src/coupon/apply.ts` in the working tree so that the command run there prints "total 0.00"
  When the developer runs the evidence bundle of intent "Apply a coupon"
  Then the evidence output of "S1" records the run with standard output "total 90.00" followed by a line end
  And no notice ERR-EVID-005 is shown
```
```gherkin
Scenario: C001-TS-566 — The moved-on notice reports the edit while the evidence of the snapshot stays
  Given the test run of the `shop-ts` snapshot "S1" completed with 40 passing tests while `src/cart/total.ts` was edited in the working tree
  When the developer asks for the decision status of the review of "S1"
  Then the review assistant shows the moved-on notice ERR-INTAKE-007 that names `src/cart/total.ts`
  And the evidence output of "S1" still records the 40 passing tests
```

## Coverage table

| REQ | happy | alternate | boundary | error | authorization | concurrency/idempotency | abuse |
|---|---|---|---|---|---|---|---|
| C001-REQ-501 | TS-501 | TS-501 | TS-502 | n/a: classification reads paths; no input makes it fail | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: classification runs once per analysis of a snapshot | n/a: a file named as a test only moves forward in reading; its tests clear nothing without a judgement (TS-509) |
| C001-REQ-502 | TS-503 | TS-505 | TS-504 | n/a: every intent has an order; no failing input | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: ordering changes under review actions are tested under REQ-403 (TS-409, TS-410) | n/a: the order changes no clearing and no verdict |
| C001-REQ-503 | TS-506 | TS-506 | TS-508 | TS-556 (C001-REQ-520) | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-507 | n/a: the judgement is the developer's own; its effect on clearing is tested under REQ-504 |
| C001-REQ-504 | TS-509 | TS-509 | TS-510 | TS-509 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: a judgement changed after clearing is tested under REQ-411 (TS-442) | TS-511 |
| C001-REQ-505 | TS-512 | TS-513 | TS-514 | n/a: a missing or failing command is the error path of REQ-508 (TS-521) | TS-515 | n/a: one test run per analysis of a snapshot; working-tree edits during the run are REQ-522 (TS-563) | TS-515 |
| C001-REQ-506 | TS-516 | TS-517, TS-567 | TS-518 | TS-516, TS-574, TS-584 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: results of a run on changed files are rejected under REQ-509 (TS-523) | n/a: only the analysis core's own run is recorded; agent claims are tested in TS-440 |
| C001-REQ-507 | TS-519 | TS-519 | n/a: the requirement has no numeric limit; every added line is executed or not | TS-520 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: one report per test run | n/a: full coverage outside the deep ecosystems clears nothing (TS-519) |
| C001-REQ-508 | TS-521 | TS-521 | TS-522 | TS-521 | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-521 | n/a: unavailable evidence only keeps more hunks open |
| C001-REQ-509 | TS-523 | TS-524 | TS-558 | TS-523, TS-525 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: working-tree edits during a run void nothing (REQ-522, TS-563) | TS-525 |
| C001-REQ-510 | TS-526 | TS-527 | TS-528 | n/a: an unreadable transcript is refused at intake by REQ-113 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: the bundle is listed, not run, by this requirement | n/a: proposed commands are not run unconfirmed (TS-529) |
| C001-REQ-511 | TS-530 | TS-531 | n/a: a command is confirmed or not; no numeric limit | TS-555 | TS-529 | n/a: one run action of the developer at a time | TS-529 |
| C001-REQ-512 | TS-532 | TS-534, TS-554 | TS-534 | TS-533 | n/a: confirmation is tested under REQ-511 (TS-529) | TS-582 (run asked for during the mutation copy), TS-583 (run while mutation testing runs); runs that change their own files: REQ-509 (TS-524); a working tree edited before the run: REQ-522 (TS-565) | TS-535 |
| C001-REQ-513 | TS-536 | TS-537 | TS-538 | n/a: a run without a reference run shows no comparison (TS-538) | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-536 | TS-537 |
| C001-REQ-514 | TS-539 | TS-541, TS-581 | TS-540 | TS-542 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: the time bound of mutation testing is C001-NFR-018 | n/a: mutants are generated by the tool on the snapshot; the change cannot select them |
| C001-REQ-515 | TS-543 | TS-544 | TS-544 | n/a: a mutation run that fails is REQ-516 (TS-545) | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: each mutant is recorded once when its result arrives | n/a: agent claims of mutation results are tested under REQ-518 (TS-551) |
| C001-REQ-516 | TS-545 | TS-545 | TS-546 | TS-545, TS-580, TS-585 (failed copy of the test run's workspace) | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-546 | n/a: unavailable evidence lowers strength to 3 and clears nothing more |
| C001-REQ-517 | TS-547 | TS-548 | TS-549 | n/a: a failing property test without a reported counter-example is outside the trigger | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: one record per failing test run | n/a: a counter-example only keeps hunks open (REQ-410) |
| C001-REQ-518 | TS-550 | TS-550 | TS-550 | n/a: every evidence item has a kind and so a strength | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: strength is set once per evidence item | TS-551 |
| C001-REQ-519 | TS-552 | TS-553 | n/a: display rule with no numeric limit | n/a: display of existing evidence; no failing input | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: covered by the UI response NFR-003 | n/a: display only |
| C001-REQ-520 | n/a: unwanted-behaviour requirement, its scenarios are in the error column | TS-557 | TS-557 | TS-556 | n/a: one local developer, no accounts or roles in v1 (scope §2) | n/a: one judgement action at a time; concurrent record writes are C001-REQ-917 | n/a: the refusal only keeps a judgement without an object out of the record |
| C001-REQ-521 | TS-559 | TS-561, TS-568 and TS-569 (the stated exception: a working-tree path named in the developer's environment or in the command text) | TS-560 | TS-560, TS-561 | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-560 (process killed during the run) | TS-562 |
| C001-REQ-523 | TS-568 | TS-569 | TS-571 | TS-573 | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-570 | TS-572 |
| C001-REQ-524 | TS-575 | TS-576, TS-577 | TS-575 (12 parts not observed, 10 named), TS-576 (the whole working tree) | TS-577, TS-578 | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-578 (change notice and incomplete-observation notice after one run) | TS-579 |
| C001-REQ-522 | TS-563 | TS-564, TS-565 | TS-566 | n/a: runs whose own files differ from the snapshot are REQ-509 (TS-523, TS-524) | n/a: one local developer, no accounts or roles in v1 (scope §2) | TS-563, TS-564 | n/a: an edit of the working tree cannot reach a run (TS-565); a command that rewrites its own files is TS-525 |
