---
id: "C001-PLAN-OBSERVABILITY"
artifact: plan/observability
change: "CHG-001"
phase: 20-plan
status: draft
---
# C001 — Observability

The review assistant is a local tool with no telemetry (C001-CON-11). Its only runtime signal
channel is the per-repository log file in the store, one entry per error and notice with
operation, identifying inputs and cause (architecture §6, NFR-D-04, C001-T-003). Every other signal
below is local: a measurement of the benchmark harness of C001-T-013, a browser performance mark
read by the browser tests, a timestamp in the review record or analysis documents, or a CI job
result (GitHub Actions, Q-ci-01). Nothing is sent off the machine.

The signals are release evidence for `10-spec/70-dod.md`: the task named in "Implemented by"
builds the signal; the measuring task checks it against the threshold of `10-spec/30-nfr/nfr.md`.
A signal named here is part of the scope of the tasks named in its row (`handoff.md`, Rules).

## 1. One signal per NFR

| NFR | Signal | Kind | Implemented by | Read in | Alert (failing check) |
|---|---|---|---|---|---|
| C001-NFR-001 | Wall-clock time from the start command to the architecture delta shown in the review UI, model-free, cold, maximum of 5 runs per benchmark change | metric (harness timer to the delta view element) | C001-T-042 (delta published first), C001-T-014 (spike), C001-T-093 (suite) | `bench/results/release-<version>.md` (C001-TC-001); spike: `spikes/parse/RESULTS.md` | `npm run bench -- nfr-001` fails above 120 s; the spike against its pass condition of C001-T-014 |
| C001-NFR-002 | Time from the start command to the last model output recorded for the snapshot, maximum of 3 runs, reference cloud provider | metric (record timestamps of model-output revisions) | C001-T-090 (model outputs recorded as revisions), C001-T-093 (suite) | `bench/results/release-<version>.md` (C001-TC-003) | suite fails above 15 min; local-provider value reported only |
| C001-NFR-003 | Time from input event to updated view per action, p95 and maximum over the 500-action session | metric (browser performance marks set by the web client) | C001-T-056 (performance marks in the web client), C001-T-023 (prototype measured with the same marks), C001-T-094 (session benchmark) | `bench/results/ui-<version>.md` per browser (C001-TC-004); prototype: `spikes/ui/RESULTS.md` | p95 above 200 ms or maximum above 1 s fails the benchmark run |
| C001-NFR-004 | Peak resident memory of the analysis core's processes, sampled every 100 ms during the C001-NFR-001 runs | metric (harness sampler) | C001-T-013 (sampler), C001-T-036 (worker heap limits; a worker over its limit raises a logged error), C001-T-093 (suite) | `bench/results/release-<version>.md` (C001-TC-001) | suite fails above 2 GiB |
| C001-NFR-005 | Open share of the whole change with the split by first reason, taken at the state of the NFR-005 Method | metric (shares of C001-CAP-06 and evidence records of C001-CAP-04 in the analysis documents) | C001-T-074 (coverage statement and shares), C001-T-098 (measurement and validity rule) | `bench/results/open-share-<version>.md` per benchmark change (C001-TC-006) | above 30 % on one benchmark change; a run with environment-fault reasons is flagged invalid |
| C001-NFR-006 | Ratio of mean review time with the review assistant to mean time with the standard diff review | manual record (moderator log, study analysis) | C001-T-109 (record layout, `npm run study -- g8-analyse`), C001-T-113 to C001-T-116 (session logs), C001-T-102 (analysis) | `study/g8/RESULTS.md`, records in `study/g8/record/` (C001-TC-007) | ratio above 0.50 is reported to P-01 as a defect |
| C001-NFR-007 | Mean share of seeded defects found with the review assistant minus the share with the standard diff review | manual record (two raters' sheets, study analysis) | C001-T-109 (rating sheet, analysis command), C001-T-113 to C001-T-116 (session forms), C001-T-102 (rating and analysis) | `study/g8/RESULTS.md`, rating sheets in `study/g8/record/rating/` (C001-TC-007) | difference below 0 points is reported to P-01 as a defect |
| C001-NFR-008 | Pass share of the language-specific scenarios per deep ecosystem; completion of the full flow outside the deep ecosystems with each reduced label; per file, the reduced label with its cause | CI check and log entry (notice per reduced file) | C001-T-036 (reduced label for unparsed and other files), C001-T-100 (language runs) | CI job "language" per ecosystem; `bench/results/matrix-<version>.md` | any failing language scenario fails the job |
| C001-NFR-009 | Listening sockets of the review assistant and their bound addresses; connection attempts from a second host | CI check (socket listing and remote attempt in the security suite) | C001-T-011 (binds loopback only), C001-T-092 (suite) | CI job "security" per runner kind (socket listing, C001-TC-009); `bench/results/second-host-<version>.md` per machine of E-LAN | any non-loopback socket or accepted remote connection fails the run |
| C001-NFR-010 | Count of accepted requests from the cross-origin and DNS-rebinding test set; each refused request leaves a log entry with its cause | CI check and log entry | C001-T-011 (host, token and origin checks with refusal log), C001-T-092 (suite) | CI job "security" per browser; repository log file | any accepted request fails the job |
| C001-NFR-011 | Count of connections to non-loopback addresses by the review assistant's processes and the UI page during a full flow, model-free and with a local provider | CI check (per-process network capture) | C001-T-088 (gateway egress rules), C001-T-095 (capture tests) | egress run on the reference machine (E-REF, `npm run test:security -- egress`): `bench/results/egress-<version>.md` with the capture files (C001-TC-011) | any such connection fails the run |
| C001-NFR-012 | Destinations of connections with a cloud provider configured; provider requests containing marker strings of model-excluded paths | check on the reference machine (capture and recording stub search) | C001-T-088 (egress rules, excluded paths), C001-T-095 (recording-stub tests) | egress run on E-REF with E-NET: `bench/results/egress-<version>.md` with the recorded requests (C001-TC-012) | any other destination or any marker found fails the run |
| C001-NFR-013 | Pass share of the scenarios that need no model provider with network disabled; completion of both full flows to a verdict | CI check (offline job) | C001-T-085 (model-free mode), C001-T-097 (offline job and full flows) | CI job "offline" | below 100 % or an incomplete flow fails the job |
| C001-NFR-014 | Share of confirmed review record entries present with their state after a kill at a random point, 20 repetitions per OS; each confirmation follows the flush of its entry | metric (fault-injection comparison) and log entry (store errors such as ERR-STORE-003) | C001-T-007 (append and flush before confirmation), C001-T-080 (restore), C001-T-096 (fault injection) | `bench/results/fault-<version>.md` per OS (C001-TC-014) | one missing or changed confirmed entry fails the suite |
| C001-NFR-015 | Equality of architecture delta, intent map and static risk scores over 5 model-free analyses per benchmark change, timestamps and run identifiers excluded | CI check (document comparison) | C001-T-042, C001-T-055 (documents written in a deterministic order), C001-T-097 (comparison) | CI job "reproducibility"; diff of the first unequal document as artefact | any difference fails the job |
| C001-NFR-016 | Pass share of the acceptance suite per operating system | CI check (matrix job per runner kind) | C001-T-001 (hosted matrix), C001-T-104 (Windows 11 runner `win11`), C001-T-100 (release runs) | CI matrix status per OS; `bench/results/matrix-<version>.md` | below 100 % on one OS fails the release matrix |
| C001-NFR-017 | Pass share of the review UI scenarios per browser, two latest majors of Chrome, Edge and Firefox | CI check (Playwright job per browser) | C001-T-012 (browser test set-up), C001-T-100 (pinned browser versions) | CI browser jobs; `bench/results/matrix-<version>.md` | below 100 % in one browser fails the release matrix |
| C001-NFR-018 | (a) test-run overhead ratio, (b) mutation-testing time, (c) evidence-bundle overhead during and after mutation testing, each with its split (reset, checks, observation, shell start, save; copy time, mutant count, time per mutant) | metric (harness timers and timestamps of recorded run results) | C001-T-020 and C001-T-021 (W1 to W6), C001-T-064 (mutation job), C001-T-065 (bundles), C001-T-093 (suite) | `bench/results/workspace-<date>.md` (W1 to W6, C001-TC-019), `bench/results/release-<version>.md` (C001-TC-018) | (a) above 3.0, (b) above 60 min or (c) above 1 s fails the suite; at DP-1 a joint miss of (b) and (c) goes to P-01 (C001-RISK-001) |

## 2. Rules

- Every measurement record names the package version (`sdd-review --version`), the operating system,
  the benchmark change and the date (`75-rollout.md`, Versioning).
- No signal logs a provider key, a secret value or file content of a model-excluded path
  (C001-CON-21, NFR-D-01).
- A failing check is an alert to the task's owner; at release it is reported with
  `sdd defect add --ref <NFR-ID> --summary "…"`. No task relaxes a threshold.
