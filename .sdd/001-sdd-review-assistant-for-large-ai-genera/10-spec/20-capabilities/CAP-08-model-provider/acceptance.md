---
id: "C001-CAP-08"
artifact: spec/acceptance
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Model provider and model-free mode"
---
# C001-CAP-08 — Acceptance criteria and scenarios

Terms: `40-domain/glossary-delta.md`. "The review configuration" is the one read from the base
commit (C001-REQ-426). Provider endpoints are recording stubs: "the local stub" listens on
`127.0.0.1:11434` and speaks the OpenAI-compatible chat API; "the cloud stub" listens on the
non-loopback host `llm.cloud.test` of an isolated test network and speaks the API the scenario
names. "Network capture" is the per-process capture of C001-NFR-011 and C001-NFR-012; it counts
the connections of the review assistant's processes and of the review UI page, not those of the
project's own commands.

## C001-REQ-801

#### C001-AC-801.1 — With no provider named, the review runs in model-free mode
```gherkin
Scenario: C001-TS-801 — A configuration without a provider gives model-free mode
  Given a base commit whose review configuration sets clearing rules and names no model provider
  And the local stub is running
  When the developer starts a review of the change
  Then the local stub receives no request
  And the extracted intents, the walkthrough accounts and the design critique of the review are labelled reduced
```
```gherkin
Scenario: C001-TS-802 — No review configuration at all gives model-free mode
  Given a base commit that holds no review configuration
  When the developer starts a review of the change
  Then network capture records no connection to a non-loopback address
  And the walkthrough accounts of the review are labelled reduced
```
```gherkin
Scenario: C001-TS-803 — A provider added by the change under review is not used for its own review
  Given a base commit whose review configuration names no model provider
  And the change under review adds the local stub as model provider to the review configuration
  When the developer starts a review of the change
  Then the local stub receives no request
  And the review runs in model-free mode
```

## C001-REQ-802

#### C001-AC-802.1 — Every step of the review flow completes without a model
```gherkin
Scenario: C001-TS-804 — Full flow on a repository with an SDD workspace, offline
  Given a repository with an SDD workspace whose open SDD change holds 5 requirements, a change of 40 changed files, and no model provider configured
  And the machine has no network access
  When the developer runs the review flow from intake to a sign verdict on 1 intent
  Then the review shows the intake summary, the architecture delta, the intent map with 5 intents, the triage and the evidence records
  And the review record holds the sign verdict
```
```gherkin
Scenario: C001-TS-805 — Full flow on a repository without an SDD workspace
  Given a repository without an SDD workspace, whose change has 3 commits with messages, and no model provider configured
  When the developer runs the review flow from intake to a defer verdict on 1 intent
  Then the intent map holds the intents extracted from the 3 commit messages, labelled reduced
  And the review record holds the defer verdict
```

## C001-REQ-803

#### C001-AC-803.1 — No repository content leaves the machine in model-free mode
```gherkin
Scenario: C001-TS-806 — A full review flow opens no connection off the machine
  Given a repository with a change of 120 changed files and no model provider configured
  And network capture is running
  When the developer runs the review flow from intake to verdicts on every intent in the local review UI
  Then network capture records 0 connections to non-loopback addresses
```
```gherkin
Scenario: C001-TS-807 — The project's own commands are not counted against the review assistant
  Given no model provider configured
  And an evidence bundle of intent "REQ-012" with the command "curl https://status.example.test/health"
  And network capture is running
  When the developer runs the evidence bundle of "REQ-012"
  Then the bundle command's own process is the only one that connects to "status.example.test"
  And network capture records 0 connections to non-loopback addresses from the review assistant's processes
```
```gherkin
Scenario: C001-TS-808 — Remote links in the intent context are not fetched
  Given no model provider configured
  And an agent plan named at intake that contains "![status](https://tracker.example.test/pixel.png)"
  And a spec item whose text links to "https://docs.example.test/coupons"
  And network capture is running
  When the developer opens the walkthrough of every intent
  Then network capture records 0 connections to non-loopback addresses
```

## C001-REQ-804

#### C001-AC-804.1 — A model-assisted result made without a model is labelled reduced with its feature
```gherkin
Scenario Outline: C001-TS-809 — Each model-assisted feature names itself when it ran without a model
  Given no model provider configured
  When the analysis core produces <result>
  Then that result carries the label "reduced"
  And the label names the feature "<feature>"

  Examples:
    | result                                          | feature                  |
    | the extracted intents of a change without SDD   | intent extraction        |
    | the grouping of hunks with no deterministic link | hunk-to-intent grouping  |
    | the walkthrough account of intent "REQ-012"     | walkthrough account      |
    | the design-quality findings of component "billing" | design critique       |
```
```gherkin
Scenario: C001-TS-810 — Only the feature whose request failed is labelled reduced
  Given the local stub configured as model provider
  And the local stub answers intent-extraction requests and times out on design-critique requests
  When the analysis of the snapshot completes
  Then the design-quality findings carry the label "reduced" naming "design critique"
  And the extracted intents carry no "reduced" label
```
```gherkin
Scenario: C001-TS-811 — Results made with a working provider are not labelled reduced
  Given the local stub configured as model provider, answering every request in the format of its provider API
  When the analysis of the snapshot completes
  Then no result of intent extraction, hunk-to-intent grouping, walkthrough account or design critique carries the label "reduced"
```

## C001-REQ-805

#### C001-AC-805.1 — Model requests go to the configured provider through the configured API
```gherkin
Scenario Outline: C001-TS-812 — Each provider API of the first version receives the four request kinds
  Given a review configuration that names <endpoint> with the provider API "<api>"<opt_in>
  And the change has hunks without a deterministic link signal and no SDD workspace
  When the analysis of the snapshot completes
  Then the stub at <endpoint> has received requests in the request format of the <api> for intent extraction, hunk-to-intent grouping, walkthrough accounts and design critique
  And network capture records no connection to any other non-loopback address

  Examples:
    | endpoint                    | api                        | opt_in                           |
    | the local stub              | OpenAI-compatible chat API |                                  |
    | the cloud stub              | Anthropic Messages API     | and the cloud opt-in setting     |
    | the cloud stub              | OpenAI-compatible chat API | and the cloud opt-in setting     |
```
```gherkin
Scenario: C001-TS-813 — A local runtime reached through a local socket is used
  Given a review configuration that names a stub listening on a local socket with the provider API "OpenAI-compatible chat API" and no cloud opt-in setting
  When the analysis of the snapshot completes
  Then the stub on the local socket has received the intent-extraction requests
  And network capture records 0 connections to non-loopback addresses
```

## C001-REQ-806

#### C001-AC-806.1 — A non-local endpoint without the cloud opt-in gives model-free mode
```gherkin
Scenario: C001-TS-814 — A cloud provider without the opt-in receives nothing
  Given a review configuration that names the cloud stub with the provider API "Anthropic Messages API" and no cloud opt-in setting
  When the developer starts a review of the change
  Then network capture records no connection to "llm.cloud.test"
  And the review runs in model-free mode
```
```gherkin
Scenario: C001-TS-815 — A "local" runtime on another machine of the network counts as non-local
  Given a review configuration that names a model runtime at "http://192.168.1.20:11434" described as local, with no cloud opt-in setting
  When the developer starts a review of the change
  Then network capture records no connection to "192.168.1.20"
  And the review runs in model-free mode
```
```gherkin
Scenario Outline: C001-TS-816 — Loopback endpoints are used without the opt-in
  Given a stub listening on <address> port 11434, named in the review configuration with the OpenAI-compatible chat API and no cloud opt-in setting
  When the analysis of the snapshot completes
  Then the stub on <address> has received the intent-extraction requests

  Examples:
    | address           |
    | 127.0.0.1         |
    | 127.255.255.254   |
    | ::1               |
```
```gherkin
Scenario Outline: C001-TS-817 — Addresses just outside loopback need the opt-in
  Given a review configuration that names an endpoint on <address> port 11434 with no cloud opt-in setting
  When the developer starts a review of the change
  Then network capture records no connection to <address>
  And the review runs in model-free mode

  Examples:
    | address    |
    | 128.0.0.1  |
    | 126.255.255.255 |
    | 0.0.0.0    |
    | ::2        |
```
```gherkin
Scenario: C001-TS-818 — An opt-in added by the change under review is not applied to its own review
  Given a base commit whose review configuration names the cloud stub and has no cloud opt-in setting
  And the change under review adds the cloud opt-in setting to the review configuration
  When the developer starts a review of the change
  Then network capture records no connection to "llm.cloud.test"
  And the review runs in model-free mode
```
```gherkin
Scenario Outline: C001-TS-848 — The host name localhost is local and needs no opt-in
  Given the local stub listening on 127.0.0.1 port 11434
  And a review configuration that names the endpoint "<endpoint>" with the OpenAI-compatible chat API and no cloud opt-in setting
  And network capture is running
  When the analysis of the snapshot completes
  Then the local stub has received the intent-extraction requests
  And network capture records 0 DNS queries and 0 connections to non-loopback addresses

  Examples:
    | endpoint                       |
    | http://localhost:11434/v1      |
    | http://LocalHost:11434/v1      |
    | http://localhost.:11434/v1     |
```
```gherkin
Scenario Outline: C001-TS-849 — Every other host name is non-local, whatever it resolves to
  Given a stub listening on 127.0.0.1 port 11434
  And the hosts file of the machine maps "<host>" to 127.0.0.1
  And a review configuration that names the endpoint "http://<host>:11434/v1" with no cloud opt-in setting
  When the analysis of the snapshot completes
  Then the stub receives no request
  And the review runs in model-free mode and reports the notice ERR-MODEL-001 naming "<host>"

  Examples:
    | host              |
    | api.localhost     |
    | devbox.lan        |
    | llm.loopback.test |
```

## C001-REQ-807

#### C001-AC-807.1 — Every UI view names the cloud provider that receives content
```gherkin
Scenario Outline: C001-TS-819 — The cloud notice is on every view
  Given a review configuration that names the cloud stub as provider "team-cloud" with the cloud opt-in setting
  And the analysis core sends repository content to "team-cloud"
  When the developer opens the <view>
  Then the view shows the provider name "team-cloud"
  And the view shows a notice that repository content is sent to "team-cloud"

  Examples:
    | view                                   |
    | architecture delta                     |
    | intent list                            |
    | walkthrough of intent "REQ-012"        |
    | hunk "src/coupon.ts" lines 10-24       |
    | coverage statement                     |
```
```gherkin
Scenario: C001-TS-820 — A local provider shows no cloud notice
  Given the local stub configured as model provider
  When the developer opens the architecture delta, the intent list and a hunk
  Then no view shows a notice that repository content is sent to a provider
```
```gherkin
Scenario: C001-TS-821 — A cloud provider without the opt-in shows no sending notice
  Given a review configuration that names the cloud stub as provider "team-cloud" and no cloud opt-in setting
  When the developer opens the architecture delta
  Then the view shows no notice that repository content is sent to "team-cloud"
```

## C001-REQ-808

#### C001-AC-808.1 — The CLI announces the cloud provider before its first request
```gherkin
Scenario: C001-TS-822 — The announcement precedes the first request
  Given a review configuration that names the cloud stub as provider "team-cloud" with the cloud opt-in setting
  When the developer runs the review command of the CLI
  Then the CLI output holds the provider name "team-cloud" and a notice that repository content is sent to it
  And the CLI printed that notice before the cloud stub recorded its first request
```
```gherkin
Scenario: C001-TS-823 — Headless runs announce the cloud provider too
  Given a review configuration that names the cloud stub as provider "team-cloud" with the cloud opt-in setting
  When the developer runs the analysis command of the CLI in headless mode
  Then the CLI output holds the provider name "team-cloud" and a notice that repository content is sent to it, before the cloud stub's first request
```
```gherkin
Scenario: C001-TS-824 — No announcement for a local provider
  Given the local stub configured as model provider
  When the developer runs the review command of the CLI
  Then the CLI output holds no notice that repository content is sent to a provider
```

## C001-REQ-809

#### C001-AC-809.1 — Provider keys come from the environment or a credential store outside the repository
```gherkin
Scenario: C001-TS-825 — A key from an environment variable is used
  Given a review configuration that names the cloud stub with the cloud opt-in setting
  And the environment variable that the configuration names for the key holds "sk-test-ENV-001"
  When the analysis of the snapshot completes
  Then every request recorded by the cloud stub carries the key "sk-test-ENV-001"
```
```gherkin
Scenario: C001-TS-826 — A key from the operating system's credential store is used
  Given a review configuration that names the cloud stub with the cloud opt-in setting
  And the operating system's credential store holds the key "sk-test-STORE-002" for that provider, and no environment variable holds a key
  When the analysis of the snapshot completes
  Then every request recorded by the cloud stub carries the key "sk-test-STORE-002"
```
```gherkin
Scenario: C001-TS-827 — A key written into the repository is never used
  Given a review configuration in the base commit that names the cloud stub with the cloud opt-in setting and also holds the value "sk-test-REPO-003" as a key
  And a file ".env" of the working tree holds "PROVIDER_KEY=sk-test-REPO-004"
  And the environment variable that the configuration names for the key holds "sk-test-ENV-001"
  When the analysis of the snapshot completes
  Then no request recorded by the cloud stub carries "sk-test-REPO-003" or "sk-test-REPO-004"
```

## C001-REQ-810

#### C001-AC-810.1 — Every model-produced item is marked with the provider and the model
```gherkin
Scenario Outline: C001-TS-828 — Each kind of model output carries its mark
  Given the local stub configured as provider "local-runtime" with the model "stub-model-1"
  When the local stub returns <item>
  Then that item is marked as model output with the provider "local-runtime" and the model "stub-model-1"

  Examples:
    | item                                                   |
    | an extracted intent "Add retry to the HTTP client"     |
    | a link of hunk "src/retry.ts" lines 1-30 to "REQ-012"  |
    | the walkthrough account of "REQ-012"                   |
    | a design critique finding on component "billing"       |
```
```gherkin
Scenario: C001-TS-829 — Deterministic items carry no model mark
  Given the local stub configured as model provider
  And hunk "src/coupon.ts" lines 10-24 linked to "REQ-012" because commit "3f2a1c9" names "REQ-012"
  When the analysis of the snapshot completes
  Then that link and the deterministic walkthrough account of "REQ-012" carry no model output mark
```

## C001-REQ-811

#### C001-AC-811.1 — Model output has the confidence level low
```gherkin
Scenario Outline: C001-TS-830 — Each kind of model output has confidence low
  Given the local stub configured as model provider
  When the local stub returns <item>
  Then that item has the confidence level low

  Examples:
    | item                                                   |
    | an extracted intent                                    |
    | a link of hunk "src/retry.ts" lines 1-30 to "REQ-012"  |
    | the walkthrough account of "REQ-012"                   |
    | a design critique finding on component "billing"       |
```
```gherkin
Scenario: C001-TS-831 — A model's own claim of certainty does not raise the level
  Given the local stub configured as model provider
  When the local stub returns a link of hunk "src/retry.ts" lines 1-30 to "REQ-012" with the text "confidence: high (0.99)"
  Then the link has the confidence level low
```

## C001-REQ-812

#### C001-AC-812.1 — Deterministic results come before model output for the same subject
```gherkin
Scenario: C001-TS-832 — Findings of a component
  Given component "billing" with a dependency-cycle finding and 2 design critique findings from the model provider
  When the developer opens the design-quality findings of "billing"
  Then the dependency-cycle finding is listed before both design critique findings
```
```gherkin
Scenario: C001-TS-833 — Accounts of an intent
  Given intent "REQ-012" with a deterministic walkthrough account and a model-written walkthrough account
  When the developer opens the walkthrough of "REQ-012"
  Then the deterministic account is shown before the model-written account
```
```gherkin
Scenario: C001-TS-834 — Model output stays after deterministic results whatever its content
  Given hunk "src/retry.ts" lines 1-30 with a deterministic alternative intent "REQ-013" of confidence medium and a model link to "REQ-012" that the model calls "most likely"
  When the developer opens hunk "src/retry.ts" lines 1-30
  Then the deterministic result for "REQ-013" is listed before the model link to "REQ-012"
```

## C001-REQ-814

#### C001-AC-814.1 — No content of a model-excluded path reaches any provider
```gherkin
Scenario: C001-TS-835 — An excluded file's content is absent from every request
  Given a review configuration with the cloud stub, the cloud opt-in setting and the model-excluded path pattern "secrets/**"
  And the change modifies "secrets/tokens.ts", which holds the marker string "MARKER-7f3c"
  When the analysis of the snapshot completes
  Then no request recorded by the cloud stub contains "MARKER-7f3c"
```
```gherkin
Scenario: C001-TS-836 — An intent with excluded and non-excluded hunks sends only the non-excluded ones
  Given a review configuration with the local stub and the model-excluded path pattern "secrets/**"
  And intent "REQ-012" with hunks in "src/auth.ts", holding the marker "MARKER-a1", and in "secrets/tokens.ts", holding the marker "MARKER-7f3c"
  When the local stub is asked for the walkthrough account of "REQ-012"
  Then the recorded request contains "MARKER-a1"
  And it does not contain "MARKER-7f3c"
```
```gherkin
Scenario: C001-TS-837 — Patterns are matched from the repository root
  Given a review configuration with the local stub and the model-excluded path pattern "secrets/**"
  And the change modifies "secrets/tokens.ts", holding "MARKER-7f3c", and "src/secrets/util.ts", holding "MARKER-b2", and neither hunk has a deterministic link signal
  When the analysis of the snapshot completes
  Then the hunk-to-intent grouping requests recorded by the local stub contain "MARKER-b2"
  And no recorded request contains "MARKER-7f3c"
```
```gherkin
Scenario: C001-TS-838 — A change cannot lift an exclusion for its own review
  Given a base commit whose review configuration names the cloud stub with the cloud opt-in setting and the model-excluded path pattern "secrets/**"
  And the change under review removes "secrets/**" from the review configuration and modifies "secrets/tokens.ts", holding "MARKER-7f3c"
  When the analysis of the snapshot completes
  Then no request recorded by the cloud stub contains "MARKER-7f3c"
```
```gherkin
Scenario Outline: C001-TS-850 — A file renamed out of or into an excluded path stays excluded
  Given a review configuration with the cloud stub, the cloud opt-in setting and the model-excluded path pattern "secrets/**"
  And the change renames "<base path>" to "<snapshot path>" and edits it so that it holds the marker string "MARKER-9d1e"
  When the analysis of the snapshot completes
  Then no request recorded by the cloud stub contains "MARKER-9d1e"

  Examples:
    | base path          | snapshot path      |
    | secrets/tokens.ts  | src/tokens.ts      |
    | src/keys.ts        | secrets/keys.ts    |
```

## C001-REQ-815

#### C001-AC-815.1 — Hunks on model-excluded paths are analysed in model-free mode
```gherkin
Scenario: C001-TS-839 — An excluded hunk without a deterministic link stays orphan code
  Given a review configuration with the local stub and the model-excluded path pattern "secrets/**"
  And hunk "secrets/tokens.ts" lines 3-9 has no deterministic link signal
  When the analysis of the snapshot completes
  Then hunk "secrets/tokens.ts" lines 3-9 is in the orphan code with no model link
  And its grouping carries the label "reduced" naming "hunk-to-intent grouping"
```
```gherkin
Scenario: C001-TS-840 — An excluded hunk with a deterministic link keeps it
  Given a review configuration with the local stub and the model-excluded path pattern "secrets/**"
  And hunk "secrets/tokens.ts" lines 3-9 was changed by commit "3f2a1c9", whose message names "REQ-012"
  When the analysis of the snapshot completes
  Then hunk "secrets/tokens.ts" lines 3-9 is linked to "REQ-012" by its deterministic link signal
  And the link carries no model output mark
```
```gherkin
Scenario: C001-TS-851 — A hunk of a file renamed out of an excluded path is analysed in model-free mode
  Given a review configuration with the local stub and the model-excluded path pattern "secrets/**"
  And the change renames "secrets/tokens.ts" to "src/tokens.ts" and adds hunk "src/tokens.ts" lines 3-9 with no deterministic link signal
  When the analysis of the snapshot completes
  Then hunk "src/tokens.ts" lines 3-9 is in the orphan code with no model link
  And its grouping carries the label "reduced" naming "hunk-to-intent grouping"
```

## C001-REQ-816

#### C001-AC-816.1 — A failed provider request yields model-free items and none of its output
```gherkin
Scenario Outline: C001-TS-841 — Unreachable, slow and unusable providers
  Given a review configuration with the local stub as model provider and the provider timeout 2 s
  And the local stub <failure> on the intent-extraction request
  When the analysis of the snapshot completes
  Then the extracted intents are produced in model-free mode and labelled reduced naming "intent extraction"
  And no extracted intent holds text from the stub's answer

  Examples:
    | failure                                                                    |
    | is not running, so the connection is refused                               |
    | answers after 5 s                                                          |
    | answers with a body that is not valid JSON                                 |
    | answers with valid JSON that lacks the fields of the response format       |
    | answers with a response cut off after its first two intents                |
```
```gherkin
Scenario: C001-TS-842 — An answer within the timeout is used
  Given a review configuration with the local stub as model provider and the provider timeout 2 s
  And the local stub answers the intent-extraction request after 1 s in the response format of its provider API
  When the analysis of the snapshot completes
  Then the extracted intents are the stub's intents, marked as model output
```
```gherkin
Scenario: C001-TS-843 — A failure of one request leaves the other requests' output in use
  Given the local stub configured as model provider
  And the local stub answers the intent-extraction request and refuses the connection of the design-critique request
  When the analysis of the snapshot completes
  Then the extracted intents are the stub's intents, marked as model output
  And the design-quality findings are produced in model-free mode
```
```gherkin
Scenario Outline: C001-TS-852 — A provider that answers another status than 200 is not used and not retried
  Given a review configuration with the local stub as model provider
  And the local stub <answer> on the intent-extraction request
  When the analysis of the snapshot completes
  Then the extracted intents are produced in model-free mode and labelled reduced naming "intent extraction"
  And no extracted intent holds text from the stub's answer
  And the local stub has recorded exactly 1 intent-extraction request

  Examples:
    | answer                                                       |
    | answers HTTP 401                                             |
    | answers HTTP 403                                             |
    | answers HTTP 429                                             |
    | answers HTTP 500                                             |
    | answers HTTP 503                                             |
    | answers HTTP 400                                             |
    | answers HTTP 404                                             |
    | closes the connection after the request, before a status line |
```
```gherkin
Scenario: C001-TS-853 — A required key that is not found sends no request
  Given a review configuration that names the cloud stub with the provider API "Anthropic Messages API", the cloud opt-in setting and the key environment variable "TEAM_LLM_KEY"
  And "TEAM_LLM_KEY" is not set and the credential store holds no entry for that provider
  When the analysis of the snapshot completes
  Then the cloud stub receives no request
  And the review runs in model-free mode
```

## C001-REQ-817

#### C001-AC-817.1 — A configured provider that was not used is reported with cause and count
```gherkin
Scenario Outline: C001-TS-844 — Each cause is named in the notice
  Given a review configuration that names provider "team-model" at <endpoint>
  And <situation>
  When the analysis of the snapshot completes
  Then the review reports the notice <code> that names "team-model", the cause "<cause>" and the number of items produced in model-free mode

  Examples:
    | endpoint        | situation                                                                          | cause                                   | code          |
    | the cloud stub  | the configuration has no cloud opt-in setting                                      | cloud opt-in setting missing            | ERR-MODEL-001 |
    | the local stub  | 3 hunks lie on the model-excluded path pattern "secrets/**"                        | model-excluded path                     | ERR-MODEL-002 |
    | the local stub  | the local stub is not running                                                      | provider unreachable                    | ERR-MODEL-003 |
    | the local stub  | the local stub answers after the provider timeout                                  | timeout                                 | ERR-MODEL-004 |
    | the local stub  | the local stub answers with a body that is not valid JSON                          | unusable output                         | ERR-MODEL-005 |
    | the cloud stub  | the cloud opt-in is set and no key is found for the Anthropic Messages API         | provider key not found                  | ERR-MODEL-006 |
    | the cloud stub  | the cloud opt-in is set and the cloud stub answers HTTP 401                        | key rejected (HTTP 401)                 | ERR-MODEL-007 |
    | the cloud stub  | the cloud opt-in is set and the cloud stub answers HTTP 429                        | rate or quota limit reached (HTTP 429)  | ERR-MODEL-008 |
    | the local stub  | the local stub answers HTTP 502                                                    | provider server error (HTTP 502)        | ERR-MODEL-009 |
    | the local stub  | the local stub answers HTTP 413                                                    | provider refused the request (HTTP 413) | ERR-MODEL-010 |
```
```gherkin
Scenario Outline: C001-TS-854 — Each HTTP status maps to one cause
  Given a review configuration with the local stub as model provider "team-model"
  And the local stub answers HTTP <status> on every request
  When the analysis of the snapshot completes
  Then the review reports the notice <code> that names "team-model" and the status <status>
  And it reports no notice of another ERR-MODEL code

  Examples:
    | status | code          |
    | 400    | ERR-MODEL-010 |
    | 401    | ERR-MODEL-007 |
    | 402    | ERR-MODEL-010 |
    | 403    | ERR-MODEL-007 |
    | 428    | ERR-MODEL-010 |
    | 429    | ERR-MODEL-008 |
    | 430    | ERR-MODEL-010 |
    | 499    | ERR-MODEL-010 |
    | 500    | ERR-MODEL-009 |
    | 599    | ERR-MODEL-009 |
    | 204    | ERR-MODEL-010 |
```
```gherkin
Scenario: C001-TS-855 — The body of a refused request is neither shown nor logged
  Given a review configuration with the local stub as model provider "team-model" and a change whose file "src/auth.ts" holds the marker string "MARKER-a1"
  And the local stub answers the intent-extraction request with HTTP 400 and a body that repeats the request, "MARKER-a1" included
  When the analysis of the snapshot completes
  Then the review reports the notice ERR-MODEL-010 that names "team-model" and the status 400
  And neither the notices, the CLI output nor the log of the review assistant contain "MARKER-a1"
```
```gherkin
Scenario: C001-TS-845 — Exact counts per cause
  Given a review configuration with the local stub, the model-excluded path pattern "secrets/**" and the provider timeout 2 s
  And 3 hunks without a deterministic link signal lie under "secrets/", and the design-critique request for 5 components times out
  When the analysis of the snapshot completes
  Then the review reports the cause "model-excluded path" with 3 items and the cause "timeout" with 5 items
```
```gherkin
Scenario: C001-TS-846 — No notice when no provider is configured
  Given a review configuration that names no model provider
  When the analysis of the snapshot completes
  Then the review reports no notice about an unused provider
```

## C001-REQ-818

#### C001-AC-818.1 — A provider failure leaves the review state unchanged
```gherkin
Scenario Outline: C001-TS-847 — Verdicts, read marks and hunk moves survive a failed request
  Given a review with 3 read marks, 1 hunk move of "src/retry.ts" lines 1-30 to "REQ-012", a sign verdict on "REQ-012" and a defer verdict on "REQ-013"
  And the local stub is the model provider
  When a request to the local stub for the walkthrough account of "REQ-014" fails because <failure>
  Then the review holds the same 3 read marks, the same hunk move and the same verdicts
  And the review record is unchanged

  Examples:
    | failure                                   |
    | the connection is refused                 |
    | no answer arrives within the timeout      |
    | the answer does not match the format      |
```

## C001-REQ-819

#### C001-AC-819.1 — A review configuration that cannot be read gives model-free mode
```gherkin
Scenario Outline: C001-TS-856 — An unreadable base-commit configuration sends nothing to any provider
  Given a base commit whose review configuration ".sdd-review/config.json" <fault>
  And the local stub and the cloud stub are running and network capture is running
  When the developer starts a review of the change
  Then neither the local stub nor the cloud stub receives a request
  And network capture records 0 connections to non-loopback addresses
  And the review runs in model-free mode and reports the notice ERR-CFG-001

  Examples:
    | fault                                                                                                   |
    | names the cloud stub with the provider API "google-gemini" and the cloud opt-in setting                |
    | names the local stub with the provider API "OpenAI-compatible chat API" and has a syntax error on line 3 |
    | names the cloud stub with the cloud opt-in setting and holds the key value "sk-test-REPO-003"            |
```
```gherkin
Scenario: C001-TS-857 — A configuration broken only in the snapshot does not stop the provider
  Given a base commit whose review configuration names the local stub with the provider API "OpenAI-compatible chat API"
  And the change under review leaves a syntax error on line 3 of the review configuration
  When the analysis of the snapshot completes
  Then the local stub has received the intent-extraction requests
  And the review reports no notice ERR-CFG-001
```

## Coverage table

| REQ | happy | alternate | boundary | error | authorization | concurrency/idempotency | abuse |
|---|---|---|---|---|---|---|---|
| C001-REQ-801 | TS-801 | TS-802 | n/a: two states only, provider named or not | TS-856 (an unreadable configuration: C001-REQ-819) | n/a | n/a: decided once per snapshot | TS-803 |
| C001-REQ-802 | TS-804 | TS-805 | n/a: step-level limits belong to C001-CAP-01 to C001-CAP-07 | n/a: step failures belong to the capability that owns the step | n/a | n/a: an end-to-end flow; repeatability is C001-NFR-015 | n/a: no input of its own |
| C001-REQ-803 | TS-806 | TS-807 | n/a: the threshold is 0 connections, TS-806 | n/a: a prohibition with no failure path | n/a | n/a: holds for the whole flow | TS-808 |
| C001-REQ-804 | TS-809 | TS-810 | TS-811 | TS-810 | n/a | n/a: labelling is per result | n/a: no input of its own |
| C001-REQ-805 | TS-812 | TS-813 | n/a: the endpoint bounds are C001-REQ-806 | TS-856 (another provider API: C001-REQ-819); provider failures are C001-REQ-816 | n/a | n/a: request scheduling is a plan decision | n/a: the opt-in bypass is C001-REQ-806 (TS-818) |
| C001-REQ-806 | TS-814 | TS-815, TS-848 | TS-816, TS-817, TS-848 | n/a: the requirement is itself the safe fallback; its notice is C001-REQ-817 (TS-844, TS-849) | n/a | n/a: decided once per snapshot | TS-818, TS-849 |
| C001-REQ-807 | TS-819 | TS-820 | TS-821 | n/a: a display rule with no failure path | n/a | n/a: a display rule | n/a: no input of its own |
| C001-REQ-808 | TS-822 | TS-823 | TS-824 | n/a: a display rule with no failure path | n/a | n/a: printed once per analysis | n/a: no input of its own |
| C001-REQ-809 | TS-825 | TS-826 | n/a: two key sources, both covered | TS-853 (no key found: C001-REQ-816) | n/a | n/a: keys are read per analysis | TS-827 |
| C001-REQ-810 | TS-828 | TS-829 | n/a: every kind of model output is in TS-828 | n/a: a marking rule with no failure path | n/a | n/a: marking is per item | n/a: a model's own claims are covered by TS-831 |
| C001-REQ-811 | TS-830 | n/a: one level for every item | n/a: one level for every item | n/a: a marking rule with no failure path | n/a | n/a: marking is per item | TS-831 |
| C001-REQ-812 | TS-832 | TS-833 | TS-834 | n/a: an ordering rule with no failure path | n/a | n/a: an ordering rule | TS-834 |
| C001-REQ-814 | TS-835 | TS-836, TS-850 | TS-837 | n/a: a prohibition with no failure path | n/a | n/a: holds for every request | TS-838, TS-850 |
| C001-REQ-815 | TS-839 | TS-840, TS-851 | n/a: the pattern bounds are in TS-837 and TS-850 | n/a: model-free analysis has no failure of its own | n/a | n/a: decided per hunk | TS-851 (a rename out of the excluded path) |
| C001-REQ-816 | TS-841 | TS-843, TS-853 | TS-842 | TS-841, TS-852, TS-853 | n/a | TS-852 (one request, no retry); each request fails or succeeds on its own, TS-843 | TS-841 |
| C001-REQ-817 | TS-844 | TS-846 | TS-845, TS-854 | TS-844, TS-854 | n/a | n/a: a report per analysis; notices of one code are merged per review (TS-845) | TS-855 |
| C001-REQ-818 | TS-847 | n/a: every failure kind is in the outline of TS-847 | n/a: no quantity bound | TS-847 | n/a | n/a: model requests write no review state | n/a: no input of its own |
| C001-REQ-819 | n/a: unwanted-behaviour requirement, its scenarios are in the error column | TS-856 | TS-857 | TS-856 | n/a | n/a: decided once per snapshot from the base commit | TS-856 (an opt-in in a configuration that does not validate) |

Authorization (every row): `n/a` — the provider is chosen per repository by P-03 through the review
configuration of the base commit (C001-REQ-426); the first version has no roles at review time.
