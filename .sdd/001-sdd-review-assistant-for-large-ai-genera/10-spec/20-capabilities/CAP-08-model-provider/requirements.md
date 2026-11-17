---
id: "C001-CAP-08"
artifact: spec/requirements
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Model provider and model-free mode"
---
# C001-CAP-08 — Requirements

### C001-REQ-801 — Run in model-free mode when no provider is configured
- **Pattern:** optional-feature
- **Statement:** WHERE the review configuration of the repository names no model provider, THE analysis core SHALL run the review in model-free mode.
- **Rationale:** C001-DEC-004; C001-CON-05; C001-SC-07 (default configuration).
- **Stories:** C001-US-801
- **Priority:** Must
- **Acceptance:** C001-AC-801.1

### C001-REQ-802 — Complete the review flow in model-free mode
- **Pattern:** state-driven
- **Statement:** WHILE the analysis core runs in model-free mode, THE analysis core SHALL complete every step of the review flow, from intake through the architecture delta, the intent map, triage and evidence to verdicts.
- **Rationale:** C001-DEC-004 Consequences; C001-CON-05; C001-SC-06. The model-free result of each step is set in the capability that owns it (C001-CAP-01 to C001-CAP-07).
- **Stories:** C001-US-801
- **Priority:** Must
- **Acceptance:** C001-AC-802.1

### C001-REQ-803 — Keep repository content on the machine in model-free mode
- **Pattern:** state-driven
- **Statement:** WHILE the analysis core runs in model-free mode, THE analysis core SHALL send no repository content to any host outside the local machine.
- **Rationale:** C001-CON-01; C001-SC-07. The project's test commands and evidence bundle commands run as the developer's own commands (C001-CAP-05); their network use is outside this requirement.
- **Stories:** C001-US-801
- **Priority:** Must
- **Acceptance:** C001-AC-803.1

### C001-REQ-804 — Label reduced results
- **Pattern:** event-driven
- **Statement:** WHEN the analysis core produces a result of a model-assisted feature (intent extraction, hunk-to-intent grouping, walkthrough account, design critique) without a model, THE analysis core SHALL label that result as reduced and name the feature that ran without a model.
- **Rationale:** C001-CON-05 (a reduced result is labelled as reduced); model-assisted features: `ideation.md` §8, C001-US-307.
- **Stories:** C001-US-801, C001-US-805, C001-US-806
- **Priority:** Must
- **Acceptance:** C001-AC-804.1

### C001-REQ-805 — Use the configured model provider
- **Pattern:** optional-feature
- **Statement:** WHERE the review configuration of the repository names a model provider that C001-REQ-806 does not exclude, THE analysis core SHALL send the requests of intent extraction, hunk-to-intent grouping, walkthrough accounts and design critique to that provider through the provider API the configuration names, the OpenAI-compatible chat API or the Anthropic Messages API.
- **Rationale:** C001-DEC-004 (pluggable provider, local model or cloud API, chosen per repository); `ideation.md` §8. Provider APIs of the first version: Q-provider-01 (the OpenAI-compatible chat API, also served by local runtimes, and the Anthropic Messages API). The provider interface: C001-IF-010. Another provider API named in the configuration: C001-REQ-819.
- **Stories:** C001-US-802, C001-US-803
- **Priority:** Must
- **Acceptance:** C001-AC-805.1

### C001-REQ-806 — Withhold content from a non-local provider without the cloud opt-in
- **Pattern:** unwanted-behaviour
- **Statement:** IF the endpoint of the configured model provider, judged from its text without name resolution, is neither a local socket, nor an IP address literal in 127.0.0.0/8 or ::1, nor the host name `localhost`, and the review configuration of the repository lacks the cloud opt-in setting, THEN THE analysis core SHALL run the review in model-free mode.
- **Rationale:** C001-DEC-004 Consequences (sending code to a cloud provider is an explicit per-repository choice); C001-CON-01; C001-SC-07. A provider described as local but reached through a non-local endpoint falls under this requirement (C001-US-802). Q-provider-02 (localhost local, others not): the default endpoints of local runtimes work without the opt-in, and every other host name needs it whatever it resolves to, so no DNS answer can turn a cloud host into a local one; a host name on the local network, or a name that resolves to a loopback address, always needs the opt-in. Classification rules (case of `localhost`, trailing dot, subdomains): C001-IF-010 §6.
- **Stories:** C001-US-802, C001-US-803
- **Priority:** Must
- **Acceptance:** C001-AC-806.1

### C001-REQ-807 — Show a cloud provider in use in the local review UI
- **Pattern:** state-driven
- **Statement:** WHILE the analysis core sends repository content to a model provider outside the local machine, THE local review UI SHALL show on every view the name of that provider and a notice that repository content is sent to it.
- **Rationale:** C001-US-803 (every developer sees during a review that code is sent and where); C001-DEC-004 Consequences.
- **Stories:** C001-US-803
- **Priority:** Must
- **Acceptance:** C001-AC-807.1

### C001-REQ-808 — Announce a cloud provider in the CLI
- **Pattern:** event-driven
- **Statement:** WHEN the CLI starts an analysis that sends repository content to a model provider outside the local machine, THE CLI SHALL print the name of that provider and a notice that repository content is sent to it before the first request to that provider.
- **Rationale:** C001-US-803; headless runs show no UI (C001-REQ-912).
- **Stories:** C001-US-803
- **Priority:** Must
- **Acceptance:** C001-AC-808.1

### C001-REQ-809 — Keep provider keys out of the repository
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL read model-provider keys only from environment variables or from a credential store outside the repository.
- **Rationale:** C001-CON-07; constitution NFR-D-01 and forbidden technologies (no secrets in the repository). A key that cannot be found: C001-REQ-816.
- **Stories:** C001-US-803
- **Priority:** Must
- **Acceptance:** C001-AC-809.1

### C001-REQ-810 — Mark model output as such
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL mark every item that a model produced (extracted intent, hunk-to-intent link, walkthrough account, design critique finding) as model output, with the names of the provider and of the model.
- **Rationale:** `ideation.md` §9 (model explanations can narrow attention); C001-R-002 §B.
- **Stories:** C001-US-804
- **Priority:** Should
- **Acceptance:** C001-AC-810.1

### C001-REQ-811 — Give model output the confidence level low
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL attach to every item marked as model output the confidence level low of the confidence scale.
- **Rationale:** `ideation.md` §9 (show uncertainty; deterministic signals first); C001-R-002 Implications. One scale for links and model output (C001-US-305, C001-US-804): the link confidence of `CAP-03-intent-map/requirements.md` §1 already gives a model judgement low (C001-REQ-308), so every model output ranks below every deterministic link signal and can be weighed against it (C001-REQ-812).
- **Stories:** C001-US-804
- **Priority:** Should
- **Acceptance:** C001-AC-811.1

### C001-REQ-812 — Show deterministic results before model output
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL order deterministic results before model output wherever both are reported for the same hunk, intent or component.
- **Rationale:** `ideation.md` §9 (deterministic signals first).
- **Stories:** C001-US-804
- **Priority:** Should
- **Acceptance:** C001-AC-812.1

### C001-REQ-814 — Send no content of excluded paths to a model
- **Pattern:** optional-feature
- **Statement:** WHERE the review configuration of the repository lists model-excluded path patterns (glob patterns relative to the repository root), THE analysis core SHALL send to no model provider any content of a file whose path at the base commit or in the snapshot matches one of those patterns.
- **Rationale:** C001-CON-01; C001-US-805. Both paths are matched, so a file renamed out of an excluded path, or into one, stays excluded.
- **Stories:** C001-US-805
- **Priority:** Should
- **Acceptance:** C001-AC-814.1

### C001-REQ-815 — Analyse excluded paths in model-free mode
- **Pattern:** optional-feature
- **Statement:** WHERE the review configuration of the repository lists model-excluded path patterns, THE analysis core SHALL analyse in model-free mode the hunks of every file whose path at the base commit or in the snapshot matches those patterns.
- **Rationale:** C001-US-805 Context (excluded content is analysed in model-free mode only); labels: C001-REQ-804.
- **Stories:** C001-US-805
- **Priority:** Should
- **Acceptance:** C001-AC-815.1

### C001-REQ-816 — Continue without the provider when it fails
- **Pattern:** unwanted-behaviour
- **Statement:** IF the model provider is unreachable, answers with an HTTP status other than 200, does not answer within the provider timeout of the review configuration, or returns output that does not match the response format of its provider API, or the provider key that the review configuration refers to is not found, THEN THE analysis core SHALL produce the items of that request in model-free mode, using none of that request's output.
- **Rationale:** C001-DEC-004 Consequences (degrade gracefully); constitution principle 4 (error behaviour written down). A reachable provider can still refuse a request, for example with 401 (key rejected), 429 (rate limit) or a 5xx status; one request is not retried (C001-IF-010 §3). Failure mapping: C001-IF-010 §7.
- **Stories:** C001-US-806
- **Priority:** Must
- **Acceptance:** C001-AC-816.1
- **Open items:** the default provider timeout: C001-IF-010 §3.

### C001-REQ-817 — Report why a configured provider was not used
- **Pattern:** complex
- **Statement:** WHILE a model provider is configured for the repository, WHEN the analysis core produces items in model-free mode, THE analysis core SHALL report a notice naming the provider, the cause and the number of items produced in model-free mode, where the cause is one of: cloud opt-in setting missing, model-excluded path, provider unreachable, timeout, unusable output, provider key not found, key rejected (HTTP 401 or 403), rate or quota limit reached (HTTP 429), provider server error (HTTP 500 to 599), or provider refused the request (any other HTTP status than 200, with that status).
- **Rationale:** C001-US-806 (continue with a notice); C001-US-803; C001-CON-05. One notice code per cause: ERR-MODEL-001 to ERR-MODEL-010 in `50-interfaces/errors.md`; failure mapping in C001-IF-010 §7.
- **Stories:** C001-US-806, C001-US-803
- **Priority:** Must
- **Acceptance:** C001-AC-817.1

### C001-REQ-818 — Keep the review state when the provider fails
- **Pattern:** unwanted-behaviour
- **Statement:** IF a request to the model provider fails, THEN THE analysis core SHALL leave the verdicts, read marks and mapping corrections of the review unchanged.
- **Rationale:** C001-US-806 (a provider failure never corrupts the review); C001-DEC-004 Consequences.
- **Stories:** C001-US-806
- **Priority:** Must
- **Acceptance:** C001-AC-818.1

### C001-REQ-819 — Use no model when the configuration cannot be read
- **Pattern:** unwanted-behaviour
- **Statement:** IF the review configuration cannot be read, including a configuration that names a provider API other than the OpenAI-compatible chat API and the Anthropic Messages API, THEN THE analysis core SHALL run the review in model-free mode.
- **Rationale:** without a readable configuration, neither the cloud opt-in setting nor the model-excluded path patterns are known, so no content may be sent (C001-CON-01, C001-SC-07). A configuration that names another provider API does not conform to its format (C001-IF-004), so it cannot be read: clearing stops as well and the configuration notice is reported (C001-REQ-427, ERR-CFG-001 in `50-interfaces/errors.md`).
- **Stories:** C001-US-801, C001-US-803
- **Priority:** Must
- **Acceptance:** C001-AC-819.1
