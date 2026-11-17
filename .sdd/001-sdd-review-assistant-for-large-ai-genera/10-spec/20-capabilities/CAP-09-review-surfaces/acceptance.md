---
id: "C001-CAP-09"
artifact: spec/acceptance
change: "CHG-001"
phase: 10-spec
status: draft
capability: "CLI and local review UI"
---
# C001-CAP-09 — Acceptance criteria and scenarios

Terms: `40-domain/glossary-delta.md`. Command names, options and exit statuses are those of
`50-interfaces/`; the scenarios name commands by their purpose ("the review command", "the
analysis command in headless mode"). `<port>` is the port the local review UI listens on for the
review. "The browser launcher" is the test double for the default web browser, which records the
address it is asked to open. "Network capture" is the method of C001-NFR-009 and C001-NFR-011.
UI scenarios state what the developer can do and see, not the layout.

## C001-REQ-901

#### C001-AC-901.1 — One command takes in the change, analyses it and opens its review
```gherkin
Scenario: C001-TS-901 — The review command opens the review of the new snapshot
  Given a git repository whose change has 12 changed files and 640 changed lines
  When the developer runs the review command of the CLI in that repository
  Then intake creates snapshot "s-4f1a" and the analysis of "s-4f1a" completes
  And the browser launcher is asked to open an address on 127.0.0.1 or ::1 port <port>
  And the page at that address shows the review of snapshot "s-4f1a"
```
```gherkin
Scenario: C001-TS-902 — Running the command again on an unchanged working tree opens the same snapshot
  Given the developer ran the review command, which created snapshot "s-4f1a"
  And the working tree and HEAD have not changed since
  When the developer runs the review command again
  Then the browser launcher opens the review of snapshot "s-4f1a"
  And the repository has a single review of snapshot "s-4f1a"
```

## C001-REQ-902

#### C001-AC-902.1 — Without a browser, the CLI prints the review address
```gherkin
Scenario: C001-TS-903 — No browser can be opened
  Given a git repository with a change and a machine on which the browser launcher fails to start a browser
  When the developer runs the review command of the CLI
  Then the CLI prints an address on 127.0.0.1 or ::1 port <port>
  And a browser opened later at that address shows the review of the snapshot
```

## C001-REQ-904

#### C001-AC-904.1 — One step moves between an intent, its hunks, a hunk's intent or orphan code, and its component
```gherkin
Scenario: C001-TS-904 — From an intent to each of its hunks
  Given a review open in the local review UI with intent "REQ-012" of 3 hunks in "src/coupon.ts" and "src/cart.ts"
  When the developer opens intent "REQ-012"
  Then each of the 3 hunks can be opened from it with one action
```
```gherkin
Scenario: C001-TS-905 — From a hunk to its intent and to its component
  Given a review open in the local review UI, and hunk "src/coupon.ts" lines 10-24 of intent "REQ-012" in component "billing"
  When the developer opens hunk "src/coupon.ts" lines 10-24
  Then one action opens intent "REQ-012"
  And one action opens component "billing" in the architecture delta
```
```gherkin
Scenario: C001-TS-906 — After a hunk move, the hunk leads to its new intent
  Given a review open in the local review UI, in which the developer moved hunk "src/retry.ts" lines 1-30 from intent "REQ-013" to intent "REQ-012"
  When the developer opens hunk "src/retry.ts" lines 1-30
  Then one action opens intent "REQ-012"
  And intent "REQ-013" no longer lists that hunk
```
```gherkin
Scenario: C001-TS-948 — A hunk of orphan code leads to the orphan code and to its component
  Given a review open in the local review UI, with hunk "src/telemetry.ts" lines 1-40 in orphan code and in component "observability"
  When the developer opens hunk "src/telemetry.ts" lines 1-40
  Then one action opens the orphan code entry that lists that hunk
  And one action opens component "observability" in the architecture delta
  And no action offers a move to an intent for that hunk
```

## C001-REQ-905

#### C001-AC-905.1 — The UI listens on loopback addresses only
```gherkin
Scenario: C001-TS-907 — Every listening socket is on loopback
  Given a review open in the local review UI with the default configuration
  When the listening sockets of the review assistant's processes are listed
  Then every listening socket is bound to 127.0.0.1 or ::1
```
```gherkin
Scenario: C001-TS-908 — Other interfaces of the machine get no socket
  Given a machine with the network interfaces 127.0.0.1, 192.168.1.20 and 172.17.0.1
  When the developer opens a review in the local review UI
  Then no socket of the review assistant listens on 192.168.1.20, on 172.17.0.1 or on 0.0.0.0
```
```gherkin
Scenario: C001-TS-909 — A second host of the network cannot connect
  Given a review open in the local review UI on a machine with the LAN address 192.168.1.20
  When a second host on the same network connects to 192.168.1.20 on <port> and on every other port the review assistant listens on
  Then every connection attempt fails
  And the second host receives no review content
```

## C001-REQ-906

#### C001-AC-906.1 — Requests that name a foreign host are rejected without content
```gherkin
Scenario Outline: C001-TS-910 — Foreign host names are rejected
  Given a review open in the local review UI on <port>, whose intent map holds intent "REQ-012" and file "src/coupon.ts"
  When a request reaches 127.0.0.1 on <port> naming the host "<host>"
  Then the request is rejected
  And the response holds no file path, hunk text or intent of the review

  Examples:
    | host                                 |
    | rebind.attacker.test:<port>          |
    | localhost.attacker.test:<port>       |
    | 192.168.1.20:<port>                  |
```
```gherkin
Scenario Outline: C001-TS-911 — Loopback names are served
  Given a review open in the local review UI on <port>
  When the developer's browser requests the review page naming the host "<host>"
  Then the response holds the review page

  Examples:
    | host              |
    | localhost:<port>  |
    | 127.0.0.1:<port>  |
    | [::1]:<port>      |
```
```gherkin
Scenario: C001-TS-912 — A DNS-rebinding page cannot read the review
  Given a review open in the local review UI on <port>
  And the developer's browser shows a page of "rebind.attacker.test", a name that first resolved to a public address and now resolves to 127.0.0.1
  When that page requests "http://rebind.attacker.test:<port>/" and the review data of the review
  Then every request is rejected
  And the page receives no review content
```

## C001-REQ-907

#### C001-AC-907.1 — Review state changes are accepted only from pages of that review's UI
```gherkin
Scenario: C001-TS-913 — A verdict from the review's own page is accepted
  Given a review open in the local review UI on <port>
  When the developer signs intent "REQ-012" from the page served by that UI
  Then the review record holds a sign verdict on "REQ-012"
```
```gherkin
Scenario Outline: C001-TS-914 — State changes and command runs from another web origin are rejected
  Given a review open in the local review UI on <port>, with a review record of 9 entries, and the developer's browser showing a page of "https://attacker.test"
  And intent "REQ-012" has no verdict, holds the open hunk "src/coupon.ts" lines 10-24, and its evidence bundle holds the confirmed command `node scripts/touch-marker.js`, which creates the file "marker.txt", and the proposed command `node scripts/try-coupon.js SAVE10`, not confirmed
  And intent "REQ-013" holds 2 test hunks and the hunk "src/retry.ts" lines 1-30, and has no test judgement
  And the unread sampled hunk "src/format.ts" lines 3-8 is cleared by the formatting rule, and the test run of the snapshot is running
  When that page sends a request for <change> to 127.0.0.1 on <port>
  Then the request is rejected with the error ERR-UI-002
  And the review record still holds 9 entries
  And <unchanged>

  Examples:
    | change                                                                       | unchanged                                                                                   |
    | a sign verdict on "REQ-012"                                                  | "REQ-012" has no verdict                                                                    |
    | a read mark on hunk "src/coupon.ts" lines 10-24                              | "src/coupon.ts" lines 10-24 is still an open hunk                                           |
    | a hunk move of "src/retry.ts" lines 1-30 to "REQ-012"                        | "src/retry.ts" lines 1-30 is still grouped under "REQ-013"                                  |
    | a read mark on the sampled hunk "src/format.ts" lines 3-8                    | "src/format.ts" lines 3-8 is still unread and in the reading queue                          |
    | a defect report on the sampled hunk "src/format.ts" lines 3-8                | every hunk cleared by the formatting rule is still cleared                                  |
    | a test judgement "expresses" on "REQ-013"                                    | "REQ-013" has no test judgement                                                             |
    | adding the command `rm -rf src` to the evidence bundle of "REQ-012"          | the evidence bundle of "REQ-012" does not list `rm -rf src`                                 |
    | confirming the proposed command `node scripts/try-coupon.js SAVE10`          | `node scripts/try-coupon.js SAVE10` is still not confirmed                                  |
    | running the evidence bundle of "REQ-012"                                     | no command of the bundle has run and no file "marker.txt" exists                            |
    | cancelling the running test run                                              | the test run of the snapshot is still running                                               |
```
```gherkin
Scenario: C001-TS-915 — The page of another review on the same machine is rejected
  Given review A of snapshot "s-4f1a" open in the local review UI on 127.0.0.1 port 5001, and review B open on 127.0.0.1 port 5002
  When a page served by the UI of review B sends a sign request for "REQ-012" to review A
  Then the request is rejected
  And review A has no new verdict
```
```gherkin
Scenario: C001-TS-916 — A request from a local program outside the UI page is rejected
  Given a review open in the local review UI on <port>
  When a program on the same machine sends an HTTP sign request for "REQ-012" directly to 127.0.0.1 on <port>, not from a page served by the UI
  Then the request is rejected
  And "REQ-012" has no new verdict
```

## C001-REQ-908

#### C001-AC-908.1 — Every UI resource is loaded from the local machine
```gherkin
Scenario: C001-TS-917 — The browser fetches nothing from outside the machine
  Given a review open in the local review UI, with the browser's network log recording
  When the developer opens the architecture delta, the intent list, a walkthrough, a hunk, the evidence of a hunk and the coverage statement
  Then every script, style sheet, font and image request in the network log goes to the review's loopback address
```
```gherkin
Scenario: C001-TS-918 — The UI renders completely on a machine without network access
  Given a machine without network access and a review open in the local review UI
  When the developer opens the architecture delta and a hunk
  Then the browser reports no failed script, style sheet, font or image load
```
```gherkin
Scenario: C001-TS-919 — Remote references inside the code under review are not fetched
  Given a change that adds "docs/index.html" with the lines '<img src="https://tracker.example.test/p.png">' and '<link rel="stylesheet" href="https://cdn.example.test/x.css">'
  And network capture is running
  When the developer opens the hunk of "docs/index.html"
  Then the UI shows both lines as text
  And network capture records no connection to "tracker.example.test" or "cdn.example.test"
```

## C001-REQ-909

#### C001-AC-909.1 — A hunk opens in one view with its file context, intent, risk signals and evidence
```gherkin
Scenario: C001-TS-920 — Everything about a hunk in one view
  Given hunk "src/coupon.ts" lines 40-52 of intent "REQ-012", with the risk signals size 13 changed lines and test coverage 100 %, and evidence record "ev-17"
  When the developer opens hunk "src/coupon.ts" lines 40-52
  Then the same view shows the hunk with lines of "src/coupon.ts" above and below it
  And it shows intent "REQ-012", the risk signals size and test coverage, and evidence record "ev-17"
```
```gherkin
Scenario: C001-TS-921 — The context expands to the whole file
  Given hunk "src/cart.ts" lines 900-910 in a file of 1,800 lines
  And the developer has opened that hunk
  When the developer expands the context to the whole file
  Then the view shows all 1,800 lines of "src/cart.ts" with the hunk marked in place
```

## C001-REQ-910

#### C001-AC-910.1 — Moved code is shown as one move from origin to destination
```gherkin
Scenario: C001-TS-922 — A function moved to another file
  Given the analysis core identifies function "applyCoupon" as moved from "src/cart.ts" lines 120-160 to "src/coupon.ts" lines 10-50
  When the developer opens that hunk
  Then the view shows one move from "src/cart.ts" lines 120-160 to "src/coupon.ts" lines 10-50
  And the view shows no separate deletion of "src/cart.ts" lines 120-160 and no separate addition of "src/coupon.ts" lines 10-50
```
```gherkin
Scenario: C001-TS-923 — A block moved within one file
  Given the analysis core identifies a block of "src/cart.ts" as moved from lines 300-320 to lines 20-40
  When the developer opens that hunk
  Then the view shows one move from "src/cart.ts" lines 300-320 to lines 20-40
```

## C001-REQ-911

#### C001-AC-911.1 — Each item shows the labels the analysis core reports for it
```gherkin
Scenario Outline: C001-TS-924 — Reduced, model-output and stale labels are shown
  Given the analysis core reports for <item> the label <label>
  When the developer opens a view that lists <item>
  Then the view shows <label> next to <item>

  Examples:
    | item                                           | label                                      |
    | the extracted intents of a change without SDD  | "reduced" naming "intent extraction"       |
    | the link of hunk "src/retry.ts" lines 1-30     | "model output" with confidence "low"       |
    | intent "REQ-012"                               | "stale" with the causes "hunks, evidence"  |
```
```gherkin
Scenario: C001-TS-925 — An item with two labels shows both
  Given an extracted intent produced by the model provider whose defer verdict is stale with the cause source
  When the developer opens the intent list
  Then the intent shows the label "model output" with confidence "low"
  And it shows the label "stale" with the cause "source"
```

## C001-REQ-912

#### C001-AC-912.1 — Headless mode writes the results as files and starts no UI
```gherkin
Scenario: C001-TS-926 — A headless run writes every result file
  Given a git repository with a change and an empty directory "out/review"
  When the developer runs the analysis command of the CLI in headless mode with the output directory "out/review"
  Then "out/review" holds the architecture delta, the intent map, the triage, the evidence and the review record of the snapshot
  And each file validates against its format in `50-interfaces/`
  And no process of the review assistant listened on a socket during the run
  And the CLI exits with status 0
```
```gherkin
Scenario: C001-TS-927 — Two headless runs on the same snapshot give the same results
  Given a git repository with a change, no model provider configured, and two empty directories "out/a" and "out/b"
  When the developer runs the headless analysis into "out/a" and then into "out/b" without changing the repository
  Then the architecture delta, intent map and triage files of "out/a" and "out/b" are equal, timestamps and run identifiers excluded
```

## C001-REQ-913

#### C001-AC-913.1 — The analysis core works with the UI neither installed nor running
```gherkin
Scenario: C001-TS-928 — Analysis and verdicts on an installation without the UI
  Given an installation of the review assistant from which the local review UI is removed
  When the developer runs the headless analysis and then signs intent "REQ-012" through the CLI
  Then both commands exit with status 0
  And the review record holds the sign verdict on "REQ-012"
```

## C001-REQ-914

#### C001-AC-914.1 — The exit status tells whether the command completed
```gherkin
Scenario: C001-TS-929 — A completed command exits with 0
  Given a git repository with a change and an empty output directory "out/review"
  When the developer runs the headless analysis into "out/review"
  Then the CLI exits with status 0
  And "out/review" holds every result file of C001-REQ-912
```
```gherkin
Scenario Outline: C001-TS-930 — A command that did not complete exits with a listed non-zero status
  Given <situation>
  When the developer runs <command>
  Then the CLI exits with a non-zero status
  And that status is listed for this failure in the error catalogue of `50-interfaces/`

  Examples:
    | situation                                                        | command                                                     |
    | a directory outside any git working tree                         | the review command                                          |
    | a repository whose output path "out/review" is an existing file  | the headless analysis into "out/review"                     |
    | a review without an intent "REQ-999"                             | the sign command for "REQ-999"                              |
    | a repository with a change                                       | an unknown command "revew"                                  |
```
```gherkin
Scenario: C001-TS-931 — An interrupted command does not exit with 0
  Given a git repository with a change of 9,000 changed lines
  When the developer interrupts the headless analysis with Ctrl+C before it ends
  Then the CLI exits with a non-zero status listed in the error catalogue of `50-interfaces/`
```

## C001-REQ-915

#### C001-AC-915.1 — CLI verdicts go into the same review record as UI verdicts
```gherkin
Scenario Outline: C001-TS-932 — Each verdict from the CLI appears in the UI
  Given a review of snapshot "s-4f1a" open in the local review UI, with intent "REQ-013" whose hunks are all read and without a verdict
  When the developer <action> "REQ-013" through the CLI
  Then the review record of "s-4f1a" holds the <verdict> verdict on "REQ-013"
  And the local review UI shows "REQ-013" as <state>

  Examples:
    | action                                         | verdict | state    |
    | signs                                          | sign    | signed   |
    | rejects with the reason "Tax is ignored"       | reject  | rejected |
    | defers with the note "Ask product"             | defer   | deferred |
```
```gherkin
Scenario: C001-TS-933 — Signing from the CLI with open hunks asks for the same confirmation
  Given intent "REQ-012" with 2 open hunks of 42 changed lines
  When the developer signs "REQ-012" through the CLI
  Then the CLI asks for confirmation, stating 2 open hunks and 42 changed lines
  And no sign verdict on "REQ-012" is recorded unless the developer confirms
```
```gherkin
Scenario: C001-TS-934 — A rejection from the CLI without a reason is refused
  Given intent "REQ-012" without a verdict
  When the developer rejects "REQ-012" through the CLI with the reason "   "
  Then the CLI refuses the action with the message that a reason is required
  And the review record is unchanged
```

## C001-REQ-916

#### C001-AC-916.1 — The CLI lists each intent with its verdict state and shares
```gherkin
Scenario: C001-TS-935 — Listing the intents of a review
  Given a review with intent "REQ-012" signed, with read share 50 %, cleared share 15 % and open share 35 %, and intent "REQ-013" deferred, with read share 100 %
  When the developer asks the CLI for the intents of the review
  Then the CLI prints "REQ-012" with the verdict sign and the shares 50 %, 15 % and 35 %
  And it prints "REQ-013" with the verdict defer and the shares 100 %, 0 % and 0 %
```
```gherkin
Scenario: C001-TS-936 — Intents without a verdict and stale intents are listed as such
  Given a review with intent "REQ-014" without a verdict and intent "REQ-012" whose signature is stale with the cause hunks
  When the developer asks the CLI for the intents of the review
  Then the CLI prints "REQ-014" as without a verdict
  And it prints "REQ-012" as stale and not as signed
```

## C001-REQ-917

#### C001-AC-917.1 — Entries written at the same time from both surfaces are all kept, in order of receipt
```gherkin
Scenario: C001-TS-937 — Fifty decisions from each surface at once
  Given a review with 100 intents without a verdict, open in the local review UI
  When a script defers 50 intents through the CLI while a browser script defers the other 50 intents through the local review UI, both at the same time
  Then the review record holds 100 defer entries, one per intent
  And the entries of each surface appear in the order in which that surface sent them
  And the times of the entries do not decrease from one entry to the next
```
```gherkin
Scenario: C001-TS-938 — Two surfaces deciding the same intent at once
  Given intent "REQ-012" without a verdict, open in the local review UI
  When the developer signs "REQ-012" through the CLI while the local review UI sends a rejection of "REQ-012" with the reason "Tax is ignored", at the same time
  Then the review record holds both entries on "REQ-012"
  And the current verdict of "REQ-012" is the verdict of the entry received last
```

## C001-REQ-918

#### C001-AC-918.1 — Reopening a snapshot's review restores its review state
```gherkin
Scenario: C001-TS-939 — Resuming where the developer left off
  Given a review of snapshot "s-4f1a" with 12 read marks, 1 hunk move, a sampling queue of 4 hunks of which 2 are read, and 3 verdicts
  And the developer closed the review and ended the review assistant's processes
  When the developer reopens the review of snapshot "s-4f1a"
  Then the review shows the same 12 read marks, the same hunk move, the same sampling queue with the same 2 hunks read, and the same 3 verdicts
```
```gherkin
Scenario: C001-TS-940 — Each snapshot keeps its own review state
  Given a review of snapshot "s-4f1a" with 12 read marks and a review of snapshot "s-9c2e" with 3 read marks, both closed
  When the developer reopens the review of snapshot "s-4f1a"
  Then the review shows the 12 read marks of "s-4f1a" and none of the read marks of "s-9c2e"
```
```gherkin
Scenario Outline: C001-TS-949 — Every kind of review record entry is restored with the state it set
  Given a review of snapshot "s-4f1a" in which the developer <action>
  And the developer closed the review and ended the review assistant's processes
  When the developer reopens the review of snapshot "s-4f1a"
  Then the review record holds the entry of that action
  And the review shows <state>

  Examples:
    | action                                                                                 | state                                                                                     |
    | reopened the cleared hunk "src/format.ts" lines 3-8                                    | "src/format.ts" lines 3-8 as reopened by the developer                                    |
    | created the intent "Telemetry" for orphan hunk "src/telemetry.ts" lines 1-40           | the developer-named intent "Telemetry" holding "src/telemetry.ts" lines 1-40              |
    | rejected orphan hunk "src/telemetry.ts" lines 1-40 with the reason "Not asked"         | "src/telemetry.ts" lines 1-40 as a rejected hunk of orphan code with the reason "Not asked" |
    | recorded that the test hunks of "REQ-013" express the intent                           | the test judgement "expresses" on "REQ-013", and the same hunks cleared by the passing-tests rule as before closing |
    | reported the defect "rounding changed" in the sampled hunk "src/format.ts" lines 3-8   | the defect report, the escalation of the formatting rule and its unread hunks open       |
    | stated a time budget of 45 minutes and the reading rate 600 changed lines per hour     | the time budget 45 minutes, the reading rate 600 and the reading queue ordered for them   |
    | added the command `npm run demo:coupon` to the evidence bundle of "REQ-012"            | `npm run demo:coupon` in the evidence bundle of "REQ-012"                                 |
    | confirmed the proposed command `node scripts/try-coupon.js SAVE10` of "REQ-012"        | `node scripts/try-coupon.js SAVE10` as confirmed                                          |
```

## C001-REQ-919

#### C001-AC-919.1 — Reopening a snapshot's review shows the same analysis results
```gherkin
Scenario: C001-TS-941 — Same map, scores and clearings in model-free mode
  Given a closed review of snapshot "s-4f1a" in model-free mode, whose intent map, risk scores and clearings were saved at the end of its last session
  When the developer reopens the review of snapshot "s-4f1a"
  Then the intent map, the risk scores and the clearings equal the saved ones
```
```gherkin
Scenario: C001-TS-942 — A model that now answers differently does not change the map
  Given a closed review of snapshot "s-4f1a" whose intent map links hunk "src/retry.ts" lines 1-30 to "REQ-012" through the model provider
  And the provider stub now links that hunk to "REQ-013"
  When the developer reopens the review of snapshot "s-4f1a"
  Then hunk "src/retry.ts" lines 1-30 is linked to "REQ-012" as at the end of the last session
```
```gherkin
Scenario: C001-TS-943 — An unreachable provider at reopening does not change the map
  Given a closed review of snapshot "s-4f1a" whose intent map holds 4 model links
  And the model provider is not reachable
  When the developer reopens the review of snapshot "s-4f1a"
  Then the intent map holds the same 4 model links, marked as model output
```

## C001-REQ-920

#### C001-AC-920.1 — Each review action is saved before it is confirmed
```gherkin
Scenario Outline: C001-TS-944 — A confirmed action survives an immediate kill
  Given a review open in the local review UI
  And the developer has <action> and the UI has confirmed it
  When the analysis core process is killed right after the confirmation
  Then after the developer reopens the review, it holds <result>

  Examples:
    | action                                                                                 | result                                                                              |
    | marked hunk "src/coupon.ts" lines 10-24 as read                                        | the read mark on that hunk                                                          |
    | moved hunk "src/retry.ts" lines 1-30 to "REQ-012"                                      | that hunk under "REQ-012"                                                           |
    | marked the sampled hunk "src/format.ts" lines 3-8 as read                              | that sampled hunk as read, counted as sampled and read in the coverage statement    |
    | reported the defect "rounding changed" in the sampled hunk "src/format.ts" lines 3-8   | the defect report and the escalation of the formatting rule, with its unread hunks open |
    | recorded that the test hunks of "REQ-013" express the intent                           | the test judgement "expresses" on "REQ-013"                                         |
    | added the command `npm run demo:coupon` to the evidence bundle of "REQ-012"            | `npm run demo:coupon` in the evidence bundle of "REQ-012"                           |
    | confirmed the proposed command `node scripts/try-coupon.js SAVE10` of "REQ-012"        | `node scripts/try-coupon.js SAVE10` as confirmed                                    |
    | signed "REQ-012"                                                                       | the sign verdict on "REQ-012"                                                       |
```
```gherkin
Scenario: C001-TS-945 — An action that cannot be saved is not confirmed
  Given a review open in the local review UI whose persistent storage has become read-only
  When the developer marks hunk "src/coupon.ts" lines 10-24 as read
  Then the UI does not confirm the read mark
  And after the developer reopens the review with writable storage, the hunk has no read mark
```

## C001-REQ-921

#### C001-AC-921.1 — Every listed review action has a keyboard command
```gherkin
Scenario Outline: C001-TS-946 — Each action with the keyboard alone
  Given a review open in the local review UI and no pointer input used
  When the developer presses the keyboard command for <action>
  Then <result>

  Examples:
    | action                                   | result                                                        |
    | moving to the next component             | the next component of the architecture delta is selected      |
    | moving to the previous component         | the previous component is selected                            |
    | moving to the next intent                | the next intent is selected                                   |
    | moving to the previous intent            | the previous intent is selected                               |
    | moving to the next hunk                  | the next hunk is selected                                     |
    | moving to the previous hunk              | the previous hunk is selected                                 |
    | moving down a level                      | the selected intent's first hunk is opened                    |
    | moving up a level                        | the opened hunk's intent is selected                          |
    | marking a hunk as read                   | the selected hunk has a read mark                             |
    | expanding a cleared hunk                 | the selected cleared hunk shows its changed lines             |
    | signing an intent                        | the sign action starts for the selected intent                |
    | rejecting an intent                      | the reject action asks for a reason for the selected intent   |
    | deferring an intent                      | the defer action asks for a note for the selected intent      |
```

## C001-REQ-922

#### C001-AC-922.1 — Keyboard help lists every command with its action
```gherkin
Scenario: C001-TS-947 — The help lists all keyboard commands
  Given a review open in the local review UI
  When the developer asks for keyboard help
  Then the UI lists every keyboard command with its action
  And the list holds a command for each of the 13 actions of C001-REQ-921
```

## Coverage table

| REQ | happy | alternate | boundary | error | authorization | concurrency/idempotency | abuse |
|---|---|---|---|---|---|---|---|
| C001-REQ-901 | TS-901 | TS-902 | n/a: size limits of intake are C001-CAP-01 | n/a: intake errors are C001-REQ-106 and C001-REQ-107; no browser is C001-REQ-902 | n/a | TS-902 | n/a: the opened address is loopback only (C001-REQ-905) |
| C001-REQ-902 | TS-903 | n/a: one fallback | n/a: no quantity bound | TS-903 | n/a | n/a: printed once per command | n/a: no input of its own |
| C001-REQ-904 | TS-904 | TS-905, TS-948 | TS-906, TS-948 | n/a: a navigation offer with no failure path | n/a | n/a: navigation changes no state | n/a: no input of its own |
| C001-REQ-905 | TS-907 | n/a: one rule for every socket | TS-908 | n/a: a binding rule with no failure path | n/a | n/a: holds for every socket | TS-909 |
| C001-REQ-906 | TS-910 | TS-911 | TS-910, TS-911 | TS-910 | n/a | n/a: decided per request | TS-912 |
| C001-REQ-907 | TS-913 | TS-915 | TS-915 | TS-914 | n/a | n/a: decided per request | TS-914 (including `rm -rf src` and bundle runs), TS-916 |
| C001-REQ-908 | TS-917 | TS-918 | TS-918 | n/a: a loading rule with no failure path | n/a | n/a: holds for every view | TS-919 |
| C001-REQ-909 | TS-920 | n/a: one view for every hunk | TS-921 | n/a: a display rule with no failure path | n/a | n/a: a display rule | n/a: hunk text holding markup or remote links is TS-919 |
| C001-REQ-910 | TS-922 | TS-923 | n/a: what counts as a move is set by C001-CAP-04 | n/a: a display rule with no failure path | n/a | n/a: a display rule | n/a: no input of its own |
| C001-REQ-911 | TS-924 | TS-925 | TS-925 | n/a: a display rule with no failure path | n/a | n/a: a display rule | n/a: no input of its own |
| C001-REQ-912 | TS-926 | n/a: one headless mode | n/a: output directory limits are not specified | n/a: failed runs are C001-REQ-914 (TS-930) | n/a | TS-927 | n/a: no input beyond the output directory, whose failure is TS-930 |
| C001-REQ-913 | TS-928 | n/a: one installation variant | n/a: no quantity bound | n/a: a packaging rule with no failure path | n/a | n/a: no shared state | n/a: no input of its own |
| C001-REQ-914 | TS-929 | TS-931 | TS-931 | TS-930 | n/a | n/a: one exit status per command | TS-930 |
| C001-REQ-915 | TS-932 | TS-933 | n/a: the bounds of each verdict are in C001-CAP-07 | TS-934 | n/a | TS-938 | n/a: a sign action naming two intents is C001-REQ-702 (TS-706) |
| C001-REQ-916 | TS-935 | TS-936 | TS-936 | n/a: an unknown review is an exit status of C001-REQ-914 | n/a | n/a: a read-only listing | n/a: a read-only listing |
| C001-REQ-917 | TS-937 | TS-938 | TS-938 | n/a: the requirement is the error handling of simultaneous writes | n/a | TS-937, TS-938 | n/a: other origins are refused by C001-REQ-907 |
| C001-REQ-918 | TS-939 | TS-940, TS-949 | TS-940 | n/a: a lost write is C001-REQ-920 (TS-945) | n/a | n/a: reopening reads state only | n/a: no input of its own |
| C001-REQ-919 | TS-941 | TS-942 | TS-943 | TS-943 | n/a | TS-942 | n/a: no input of its own |
| C001-REQ-920 | TS-944 | n/a: the action kinds vary within the outline of TS-944; all ten kinds of recorded action are exercised by the fault-injection test of C001-DOD-025 | TS-944 | TS-945 | n/a | TS-944 | n/a: no input of its own |
| C001-REQ-921 | TS-946 | n/a: one command per action | n/a: no quantity bound | n/a: a command offer with no failure path | n/a | n/a: a command offer | n/a: no input of its own |
| C001-REQ-922 | TS-947 | n/a: one help list | TS-947 | n/a: a display rule with no failure path | n/a | n/a: a display rule | n/a: no input of its own |

Authorization (every row): `n/a` — the first version has one developer per machine and no roles;
who may reach the local review UI and change review state is the subject of C001-REQ-905 to
C001-REQ-907 themselves, whose rejections are in their error and abuse columns.
