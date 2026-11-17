---
id: "C001-SPEC-NFR"
artifact: spec/nfr
change: "CHG-001"
phase: 10-spec
status: draft
---
# C001 — Non-functional requirements

Thresholds are set against the supported size of C001-DEC-007 (C001-CON-06). Terms:
`40-domain/glossary-delta.md`. The constitution defaults are inherited as listed in §7. Each NFR
names the item of `70-dod.md` that covers it.

## 0. Reference environment
- **Reference machine:** 8 logical CPU cores, 16 GiB RAM, SSD storage, no other user workload
  running (Q-perf-01).
- **Reference repositories:** one open-source repository per deep ecosystem (TypeScript/JavaScript,
  Python, C#/.NET) with a test suite that runs on the reference machine, of at most 500,000 lines
  of code in total (Q-perf-01), plus one repository in a language outside the deep ecosystems for
  C001-NFR-008.
- **Benchmark changes:** on each reference repository of a deep ecosystem, at least one agent
  change of 9,000 to 10,000 changed lines over 250 to 300 changed files, produced by a coding agent
  from a written task description. The set is fixed before any measurement and is not chosen for
  how much of it can be cleared. At least one benchmark change has an SDD workspace and at least
  one has none (C001-GOAL-06). Each benchmark change names the test command that runs the test
  suite of its repository; the measurements that need test evidence give it as the test command
  of the review (C001-REQ-505).
- **Intake of a benchmark change:** fixed for each benchmark change together with the set, before
  any measurement, and not chosen for how much it clears. The base commit is the commit from which
  the agent started, named at intake (C001-REQ-102); the commits of the change are those the agent
  made, as it left them. A benchmark change with an SDD workspace is reviewed with the SDD change
  the agent worked from, held in the snapshot (C001-REQ-111). Every benchmark change is reviewed
  with the written task description named as pull-request text, and with the agent plan and agent
  transcript files of the agent's session named as such where the session produced them
  (C001-REQ-112). No other file is named.
- **Environment of a benchmark change:** fixed for each benchmark change together with the set,
  before any measurement, and not chosen for how much it clears. It names how the ignored
  dependencies of the reference repository are installed in its working tree as a developer has
  them (for example `node_modules/`, a virtual environment, restored packages), how they are made
  available in each evidence workspace
  (C001-IF-013 §2 item 4), and the environment in which the review is started (for the Python
  repository: which virtual environment is active). In it, every file of the project that a test
  run of the benchmark change executes is loaded from its snapshot path in the evidence workspace,
  so the tests run the workspace's sources and nothing else of the project:
  - no file of the repository is loaded from the working tree: the project is never installed in
    editable mode or through a package link from the working tree, and no environment variable
    puts a path of the working tree on an import path of the tests (for example `PYTHONPATH`);
  - no installed copy of the project (glossary) is loaded: the project is never installed as a
    regular, non-editable copy, in the evidence workspace or elsewhere (for example `pip install .`
    into a virtual environment, which copies its modules under `site-packages`). Where its tests
    need the project itself installed, it is installed in editable mode from the evidence
    workspace's own sources (for example by a preparation command, C001-IF-013 §2 item 4), or the
    project's own test configuration puts the workspace's source root on the import path; in the
    copy that mutation testing takes, C001-IF-013 §2 item 3 applies.

  This is stricter than C001-IF-013 §2 item 7, which imports Python project modules from the
  evidence workspace even with an editable install from the working tree, so that no measurement
  of this file depends on that rule; the editable-install case is shown by the ADR named in
  C001-CON-22. With this environment, a test run of a benchmark change raises no notice
  ERR-EVID-008 (C001-REQ-506) and executes no installed copy of the project; a run that does
  either is reported with the measurement under a reason of its own (C001-NFR-005 split) and is
  not the measurement (C001-NFR-005 Method, validity).
- Every measurement of an NFR of this file that starts a review of a benchmark change starts it
  with this intake and in this environment.
- **Seeded-defect changes** for C001-NFR-006 and C001-NFR-007 are defined in §3.

## 1. Performance efficiency

### C001-NFR-001 — Static analysis time at the supported size
- **Category:** Performance efficiency / time behaviour
- **Statement:** WHEN the developer starts a review of a change within the supported size, THE review assistant SHALL show the architecture delta in the review UI within the threshold.
- **Metric:** wall-clock time from the start command to the architecture delta shown in the review UI, in model-free mode, with no cached analysis results; project test runs, evidence bundle runs and mutation runs excluded (they are bounded by C001-NFR-018); maximum of 5 runs per benchmark change.
- **Threshold:** ≤ 120 s for each benchmark change (Q-perf-01).
- **Method:** automated timing test, cold start, 5 runs per benchmark change, maximum reported.
- **Environment:** reference machine, benchmark changes (§0), no model provider.
- **Rationale:** C001-GOAL-01, C001-SC-01, C001-DEC-007; deterministic pre-pass against the risk of slow analysis at 10,000 lines (`ideation.md` §9); replaces NFR-D-05 for this change.
- **DoD:** C001-DOD-010.

### C001-NFR-002 — Model-assisted analysis time at the supported size
- **Category:** Performance efficiency / time behaviour
- **Statement:** WHERE a cloud provider is configured, WHEN the developer starts a review of a change within the supported size, THE analysis core SHALL record every model output for its snapshot within the threshold.
- **Metric:** wall-clock time from the start command to the last model output (extracted intents, model links, design critique, accounts of intents) recorded for the snapshot, provider latency included; maximum of 3 runs per benchmark change.
- **Threshold:** ≤ 15 min for each benchmark change with the reference cloud provider; with a local provider, measured and reported without a threshold (Q-perf-01).
- **Method:** automated timing test, 3 runs per benchmark change; the reference cloud provider and model are named in `20-plan/60-test-plan.md`.
- **Environment:** reference machine, benchmark changes (§0), network access to the reference cloud provider.
- **Rationale:** `ideation.md` §9 (analysis too slow or costly at 10,000 lines); the review opens on the static results first (C001-REQ-201).
- **DoD:** C001-DOD-011.

### C001-NFR-003 — Review UI response time
- **Category:** Performance efficiency / time behaviour
- **Statement:** WHEN the developer opens a component, an intent or a hunk, or marks, moves or decides on one, THE review UI SHALL show the updated view within the threshold.
- **Metric:** time from the input event to the updated view rendered, measured with browser performance marks; p95 and maximum over a scripted session of 500 actions.
- **Threshold:** p95 ≤ 200 ms and maximum ≤ 1 s (Q-perf-01).
- **Method:** automated browser test that replays the scripted session on each benchmark change of 10,000 changed lines.
- **Environment:** reference machine, each supported browser (C001-NFR-017).
- **Rationale:** a review that lasts hours keeps a steady pace (C001-US-907, C001-GOAL-08).
- **DoD:** C001-DOD-012.

### C001-NFR-004 — Memory use of the analysis core
- **Category:** Performance efficiency / resource utilisation
- **Statement:** WHILE the analysis core analyses a change within the supported size, THE analysis core SHALL keep its memory use within the threshold.
- **Metric:** peak resident memory of the analysis core's processes, sampled every 100 ms; processes of the project's own commands and of a local model runtime excluded.
- **Threshold:** ≤ 2 GiB (Q-perf-01).
- **Method:** memory sampling during the C001-NFR-001 runs.
- **Environment:** as C001-NFR-001.
- **Rationale:** the tool runs on the developer's machine next to the IDE, the agent and the project's tests (C001-DEC-002).
- **DoD:** C001-DOD-013.

### C001-NFR-018 — Evidence run time at the supported size
- **Category:** Performance efficiency / time behaviour
- **Statement:** WHEN the analysis core runs the tests, the mutation testing and the evidence-bundle commands of a change within the supported size, THE analysis core SHALL keep the test-run overhead, the mutation-testing time and the evidence-bundle overhead within the threshold.
- **Metric:** (a) test-run overhead: wall-clock time of the analysis core's test run with per-test coverage of the changed lines (C001-REQ-505, C001-REQ-506) divided by the wall-clock time of the project's test command run alone on the same snapshot. Both runs happen in an evidence workspace of the snapshot, prepared in the same way and holding no build output of an earlier run, so each includes a cold build; the preparation of the workspace comes before both timings and counts on neither side; which other workspace steps count in the analysis core's run: C001-IF-013 §8 item 1. (b) mutation-testing time: wall-clock time from the end of that test run to the last mutation result recorded for the snapshot (C001-REQ-514); every step between these two points counts, including the copy of the test run's workspace that mutation testing takes and the observation of the working tree during mutation runs (C001-IF-013 §2 item 3, §8 item 4); no workspace is prepared in that time. (c) evidence-bundle overhead: time from the developer's run action to the recorded output of a command (C001-REQ-512) minus the command's own run time, with the test run's evidence workspace of the snapshot already prepared and free, so the preparation of a workspace does not count (C001-IF-013 §8 item 2); (c) is taken both while mutation testing of the snapshot runs and after it has ended, and its threshold holds in each of these two states (Q-overhead-01). Maximum over 3 runs per benchmark change. "Preparation" of a workspace in this NFR never includes the copy that mutation testing takes, which counts in (b) (C001-IF-013 §8 item 4). Under no threshold of this NFR: the preparation of a workspace and the extra time of a cold build compared with the project's test command in the developer's built working tree, which each review session pays again [ASSUMPTION: C001-AS-08].
- **Threshold:** (a) ≤ 3.0; (b) ≤ 60 min for each benchmark change; (c) ≤ 1 s per command (Q-evidence-time-01).
- **Method:** automated timing test, 3 runs per benchmark change, maximum reported. For (a), each run starts a new process of the analysis core, and the baseline run and the analysis core's test run each take a newly prepared evidence workspace. (c) is measured with a bundle of 10 commands that each print a fixed text and exit, run in the same process after its test run of the snapshot has ended, in that test run's workspace (C001-IF-013 §8 item 2). Of the 3 runs per benchmark change, at least one starts while mutation testing of the snapshot runs and at least one after it has ended (Q-overhead-01). A run taken while mutation testing runs starts after the copy of the test run's workspace that mutation testing takes has been made (C001-IF-013 §2 item 3), so the time in which that copy is made falls within no run of (c); that copy counts in (b) only. Reported with each run, without a threshold (C001-AS-08): the preparation time of the workspace, and the time from the start of that preparation to the recorded results of the first test run divided by the time of the project's test command run alone in the developer's working tree right after an earlier run of the same command there.
- **Environment:** reference machine; benchmark changes (§0) with their test command, intake and environment, the ignored dependencies of each reference repository installed in its working tree as that environment names them; model-free mode.
- **Rationale:** C001-NFR-001 excludes these runs; C001-AS-06 (mutation testing on executed changed lines completes within one review session); `ideation.md` §9 (analysis too slow at 10,000 lines). The duration of the project's own tests is outside the review assistant's control, so (a) is a ratio to it. Late mutation results reopen test-cleared hunks (C001-REQ-411); (b) bounds how late. P-01 set the thresholds when the runs were to happen in the working tree; since every run now happens in an evidence workspace (C001-CON-22), (a) compares two runs in the same kind of workspace, and the cost that the workspace adds before and beyond that comparison is the subject of C001-AS-08 rather than of a threshold the specification would set on its own.
- **DoD:** C001-DOD-014.

## 2. Functional suitability and usability

### C001-NFR-005 — Open share of a 10,000-line agent change
- **Category:** Functional suitability / functional appropriateness
- **Statement:** WHEN triage, the evidence runs and the test judgements of a benchmark change are complete, THE review assistant SHALL leave open a share of the changed lines within the threshold.
- **Metric:** open share of the whole change (C001-REQ-602), taken when the test run and the mutation testing have ended and the test judgement "expresses" is recorded on every intent with test hunks, and before any hunk is marked read, reopened, moved or reported defective and before the developer names an intent. Every hunk in a guarded area counts as open; the public API area is recognised exactly as C001-REQ-417 states, without narrowing for the measurement. Reported with the total: the open share split by the first reason, in this order, that keeps each open hunk open: a built-in guarded area (each area apart, in the order of C001-REQ-414 to C001-REQ-417); a deterministic design-quality finding (C001-REQ-418); orphan tests, where passing tests execute every executable line of the hunk, no failing test executes it and no mutant of it survives, but on at least one of its lines every passing test that executes it is an orphan test (C001-REQ-504); passing-test evidence refused for working-tree execution, where at least one executable line of the hunk is executed by no passing test in the evidence workspace and the test run reported execution of the hunk's file under the working-tree root (C001-REQ-506, ERR-EVID-008); passing-test evidence lost to an installed copy, where at least one executable line of the hunk is executed by no passing test in the evidence workspace and the test run reported execution of an installed copy of the hunk's file, that is of a file outside the working-tree root and at no path of the snapshot in the evidence workspace whose content equals the snapshot content of the hunk's file (§0, C001-IF-013 §4 item 2); no clearing rule applies.
- **Threshold:** ≤ 30 % on each benchmark change (Q-g2-target-01).
- **Method:** automated measurement on each benchmark change (§0): (1) start the review in the environment of the benchmark change (§0), with its intake (§0) and its test command given as the test command of the review (C001-REQ-505); (2) wait until the test run and the mutation testing have ended (C001-REQ-514); (3) record the test judgement "expresses" on every intent under which a test hunk is grouped (C001-REQ-503), as Q-clearing-05 sets, without moving a hunk or naming an intent; (4) read the total and the split from the shares of C001-CAP-06 and the evidence records of C001-CAP-04; the files whose execution under the working-tree root the test run reported (C001-IF-013 §4 item 2), all of them and not only the 10 that ERR-EVID-008 names; and every file at no path of the snapshot in the evidence workspace and outside the working-tree root whose execution the test run reported, from the run's coverage data before the attribution of C001-IF-013 §4 item 2, compared by content with the snapshot files of the open hunks; (5) validity: a run with any hunk under the reason "refused for working-tree execution" or "lost to an installed copy" broke §0 and is not the measurement: it is reported as an environment fault with its split, the environment is brought in line with §0 and the benchmark change is measured again, before any other step of the "If wrong" path of C001-AS-07; a run whose test run records a passing test for no line that a hunk of a deep-ecosystem file adds is reported as a suspected environment fault, the environment is checked against §0, and the run is repeated after a correction where the environment breaks §0 and stands otherwise. The judgements of step 3 stand in for the developer's; they are not a statement that the benchmark tests express their intents.
- **Environment:** reference machine; benchmark changes with runnable tests [ASSUMPTION: C001-AS-02], each with its named test command, its intake and its environment (§0); default review configuration; no model provider (model-free mode); mutation-testing tools of the deep ecosystems installed.
- **Rationale:** C001-GOAL-02, C001-SC-02, Q-g2-target-01; measured without a model so that the target holds in the default configuration (C001-CON-05). Q-clearing-05 (judge first, measure after): changed tests clear code only after the developer's judgement (C001-REQ-504), so the open share is measured in the state after that judgement, which every review reaches before reading the implementation. In model-free mode, the intent context given at intake decides which test hunks are grouped under an intent (link signals of C001-CAP-03) and so which tests can qualify; the intake is therefore fixed per benchmark change (§0), no hunk is moved before the reading, and the orphan-tests share shows how much of the open share comes from test hunks left in orphan code. Which files a test run executes depends on the environment the review starts in: through a Node or .NET package link or an absolute path that points into the working tree, or a Python process outside the import rule of C001-IF-013 §2 item 7, tests execute working-tree copies of files of the snapshot, and the hunks of those files do not clear by passing tests (C001-REQ-506, C001-IF-013 §4 item 2); and through an installed copy of the project, tests execute files at no path of the snapshot, which count for no hunk either and raise no notice. The environment is therefore fixed per benchmark change (§0), hunks whose passing-test evidence was refused for working-tree execution or lost to an installed copy are reported under reasons of their own, and a run with such hunks is measured again (Method step 5), so that such a miss is not taken for an effect of the guards. Whether ≤ 30 % is reachable under the built-in guarded areas, in particular the public API recognition of C001-REQ-417, has not been estimated: [ASSUMPTION: C001-AS-07]. The split by reason shows which guard holds the open share when the threshold is missed.
- **DoD:** C001-DOD-015.

### C001-NFR-006 — Review time against a standard diff review
- **Category:** Usability / efficiency of use
- **Statement:** THE review assistant SHALL reduce the time developers need to review seeded-defect agent changes of 2,000 to 10,000 changed lines, compared with a standard diff review of the same changes, by at least the threshold.
- **Metric:** ratio of the mean review time of the sessions with the review assistant to the mean review time of the sessions with the standard diff review (§3).
- **Threshold:** ≤ 0.50, that is at least 50 % lower (Q-g8-target-01).
- **Method:** the comparison protocol of §3.
- **Environment:** reference machine or the participant's own machine meeting it; seeded-defect changes of §3.
- **Rationale:** C001-GOAL-08, C001-SC-08, Q-g8-target-01.
- **DoD:** C001-DOD-016, C001-DOD-018.

### C001-NFR-007 — Seeded defects found against a standard diff review
- **Category:** Functional suitability / functional correctness
- **Statement:** THE review assistant SHALL keep the share of seeded defects that developers find at or above the share they find with a standard diff review of the same changes.
- **Metric:** mean share of seeded defects found per session with the review assistant minus the mean share found per session with the standard diff review (§3).
- **Threshold:** ≥ 0 percentage points (Q-g8-target-01).
- **Method:** the comparison protocol of §3, same sessions as C001-NFR-006.
- **Environment:** as C001-NFR-006.
- **Rationale:** C001-GOAL-08, C001-SC-08, Q-g8-target-01; less reading must not mean fewer defects found (`ideation.md` §9).
- **DoD:** C001-DOD-017, C001-DOD-018.

### C001-NFR-008 — Language coverage
- **Category:** Functional suitability / functional completeness
- **Statement:** THE review assistant SHALL provide the language-specific signals of its requirements for files of the deep ecosystems and the language-agnostic core for files of every other language.
- **Metric:** (a) share of acceptance scenarios that depend on language-specific signals passing on the reference repository of each deep ecosystem; (b) completion of the full review flow, intake to verdict, on the reference repository outside the deep ecosystems, with each reduced result labelled.
- **Threshold:** (a) 100 % for TypeScript/JavaScript, for Python and for C#/.NET; (b) completed.
- **Method:** acceptance suite per deep ecosystem in CI; one end-to-end run on the repository outside the deep ecosystems.
- **Environment:** CI, reference repositories (§0).
- **Rationale:** Q-languages-01, `10-context/scope.md` §1, C001-CON-05.
- **DoD:** C001-DOD-019.

## 3. G-8 comparison protocol
Method of C001-NFR-006 and C001-NFR-007 (C001-SC-08, `ideation.md` §11). The sdd-test-designer
turns it into the executable protocol in `20-plan/60-test-plan.md`.

1. **Participants:** 8 developers who use coding agents, have not worked on the review assistant
   and have not seen the changes (Q-g8-protocol-01).
2. **Changes:** a pool of four agent changes produced by a coding agent from written task
   descriptions, one in each band of 2,000–3,000, 3,001–5,000, 5,001–8,000 and 8,001–10,000
   changed lines; at least one per deep ecosystem; at least one with an SDD workspace and one
   without.
3. **Seeded defects:** before the sessions, a person who is not a participant seeds at least 8
   defects into each change, at least one of each kind: wrong logic, behaviour nobody asked for,
   requested behaviour missing, architecture violation, a test that does not check its subject,
   security weakness. The list stays sealed until every session has ended.
4. **Design:** crossover. Each participant reviews two changes of the pool, one with the review
   assistant and one with the standard diff review. The change given to each method and the
   order of the methods are counterbalanced so that each change is reviewed equally often with
   each method and each method comes first equally often.
5. **Standard diff review:** the participant's usual diff viewer (terminal or IDE), files in its
   default order, with no AI assistance.
6. **Training:** before the session with the review assistant, a 30-minute tutorial on a practice
   change outside the pool.
7. **Task:** decide, for the change as a whole and for each requested behaviour, whether to
   accept it, and write down every defect found. Sessions are self-paced with a cap of 3 hours
   per change (Q-g8-protocol-01); a capped session counts at the cap, with the defects found until
   then.
8. **Review time:** wall-clock time from opening the change to the last decision, breaks
   excluded, logged by the moderator.
9. **Defects found:** two raters match the participant's notes to the sealed list independently
   and settle disagreements by discussion; findings outside the list are logged and not counted.
10. **Analysis:** per method, the mean review time and the mean share of seeded defects found over
    all sessions, also reported per change; the comparison is descriptive.

## 4. Security

### C001-NFR-009 — Review UI reachable from the local machine only
- **Category:** Security / confidentiality
- **Statement:** THE review UI SHALL accept connections on loopback addresses only.
- **Metric:** (a) count of listening sockets of the review assistant bound to a non-loopback address; (b) count of successful connections from a second host on the same network.
- **Threshold:** (a) 0; (b) 0.
- **Method:** automated check of the listening sockets during a review; connection attempt from a second host (or a container on a bridged network) to every port the review assistant listens on.
- **Environment:** each supported operating system (C001-NFR-016), default configuration.
- **Rationale:** C001-CON-02, C001-DEC-002 Consequences, `ideation.md` §9 (local server exposed beyond the machine).
- **DoD:** C001-DOD-020.

### C001-NFR-010 — Requests from other web origins refused
- **Category:** Security / integrity
- **Statement:** IF a request reaches the review UI from a web origin other than its own or names a host other than a loopback name or address, THEN THE review UI SHALL refuse the request without reading or changing review state.
- **Metric:** count of requests accepted from a test set of cross-origin and DNS-rebinding requests that covers every request type of the review UI.
- **Threshold:** 0.
- **Method:** automated security test: a page served from another origin, and a host name that resolves to 127.0.0.1, send every request type of the review UI.
- **Environment:** each supported browser (C001-NFR-017), default configuration.
- **Rationale:** a local server can be reached by any web page open in the developer's browser; protects the code under review and the review record (`ideation.md` §9, C001-CON-02).
- **DoD:** C001-DOD-021.

### C001-NFR-011 — No network traffic off the machine by default
- **Category:** Security / confidentiality
- **Statement:** WHILE no cloud provider is configured, THE review assistant SHALL open no network connection to a non-loopback address.
- **Metric:** count of network connections to non-loopback addresses opened by the review assistant's processes and by the review UI page during a full review flow, intake to verdict. Connections opened by the project's own commands (tests, evidence bundle commands) are not counted.
- **Threshold:** 0.
- **Method:** per-process network capture during a full review flow on each benchmark change, once with no model provider and once with a local provider.
- **Environment:** reference machine, default configuration.
- **Rationale:** C001-SC-07 (0 bytes of repository content leave the machine), measured through this stricter count because encrypted payloads cannot be inspected; C001-CON-01, C001-GOAL-07.
- **DoD:** C001-DOD-022.

### C001-NFR-012 — Content sent only to the configured cloud provider
- **Category:** Security / confidentiality
- **Statement:** WHILE a cloud provider is configured, THE review assistant SHALL open network connections to non-loopback addresses only to the endpoint of the configured cloud provider.
- **Metric:** (a) count of connections to other non-loopback destinations; (b) count of provider requests that contain content of a file on a model-excluded path.
- **Threshold:** (a) 0; (b) 0.
- **Method:** full review flow against a recording stub of the cloud provider, with marker strings placed in files on model-excluded paths; per-process network capture and search of the recorded requests for the markers.
- **Environment:** reference machine, isolated test network.
- **Rationale:** C001-CON-01, C001-DEC-004 Consequences, C001-US-805.
- **DoD:** C001-DOD-023.

## 5. Reliability

### C001-NFR-013 — Full review flow in model-free mode
- **Category:** Reliability / fault tolerance
- **Statement:** WHILE no model provider is configured and the machine has no network access, THE review assistant SHALL pass every acceptance scenario that does not require a model provider.
- **Metric:** (a) share of the acceptance scenarios of C001-CAP-01 to C001-CAP-09 that do not require a model provider passing in that state; (b) completion of the full review flow, intake to verdict, on a repository with an SDD workspace and on a repository without one.
- **Threshold:** (a) 100 %; (b) completed on both.
- **Method:** acceptance suite in CI with no model provider configured and network access disabled.
- **Environment:** CI, reference repositories (§0).
- **Rationale:** C001-CON-05, C001-DEC-004, C001-SC-06, C001-US-801.
- **DoD:** C001-DOD-024.

### C001-NFR-014 — Review state kept across an unexpected end
- **Category:** Reliability / recoverability
- **Statement:** IF a process of the review assistant ends unexpectedly, THEN THE review assistant SHALL keep every review record entry that it confirmed to the developer before the end.
- **Metric:** share of the review record entries confirmed before the end that are present, with the review state they set (C001-REQ-918), when the review is resumed.
- **Threshold:** 100 %.
- **Method:** fault-injection test: a scripted session of 200 recorded actions that takes each of the ten kinds of recorded action of C001-REQ-721 at least 5 times, the analysis core process killed at a random point, 20 repetitions per supported operating system; the confirmed entries and the state they set compared with the resumed review.
- **Environment:** reference machine, each supported operating system (C001-NFR-016).
- **Rationale:** accountable verdicts (C001-GOAL-05, C001-SC-05); a review of a 10,000-line change spans more than one sitting (C001-US-906). Every kind counts: a lost test judgement changes which hunks clear (C001-REQ-504), and a lost defect report undoes an escalation (C001-REQ-606). Save before confirmation: C001-REQ-920.
- **DoD:** C001-DOD-025.

### C001-NFR-015 — Reproducible static analysis
- **Category:** Reliability / maturity
- **Statement:** WHILE the review runs in model-free mode, THE analysis core SHALL produce the same static analysis results for the same snapshot and review configuration.
- **Metric:** share of repeated analyses whose architecture delta, intent map and static risk scores equal those of the first analysis, timestamps and run identifiers excluded.
- **Threshold:** 100 % over 5 analyses of each benchmark change.
- **Method:** automated comparison of the machine-readable results (C001-US-904) in CI.
- **Environment:** CI, benchmark changes (§0), no model provider.
- **Rationale:** non-deterministic grouping (`ideation.md` §9); every scenario is automated (constitution principle 3).
- **DoD:** C001-DOD-026.

## 6. Portability and compatibility

### C001-NFR-016 — Supported operating systems
- **Category:** Portability / adaptability
- **Statement:** THE review assistant SHALL run the full review flow on each supported operating system.
- **Metric:** share of acceptance scenarios passing on each supported operating system.
- **Threshold:** 100 % on each of Windows 11 on x86-64, macOS 14 or later on x86-64 and on arm64, and Ubuntu 22.04 LTS or later on x86-64 (Q-platform-01).
- **Method:** acceptance suite in CI on each operating system.
- **Environment:** CI runners of each operating system.
- **Rationale:** the tool runs on the developer's machine (C001-DEC-002, C001-CON-01).
- **DoD:** C001-DOD-027.

### C001-NFR-017 — Supported browsers
- **Category:** Compatibility / interoperability
- **Statement:** THE review UI SHALL pass its acceptance scenarios in each supported browser.
- **Metric:** share of review UI acceptance scenarios passing in each supported browser.
- **Threshold:** 100 % in each of the two latest major versions of Chrome, Edge and Firefox at release time (Q-platform-01).
- **Method:** browser automation in CI for each browser.
- **Environment:** CI, one supported operating system per browser.
- **Rationale:** supported browsers are set in the NFRs (`10-context/scope.md` §5); Q-platform-01 (Safari not supported: a supported browser can be installed on every supported operating system).
- **DoD:** C001-DOD-028.

## 7. Inherited constitution defaults
The NFR defaults of `.sdd/_constitution/constitution.md` apply to CHG-001 as follows.

| Default | Applies | Note |
|---|---|---|
| NFR-D-01 | Unchanged | Covers model-provider keys (C001-CON-07) |
| NFR-D-02 | Unchanged | C001-CON-07 |
| NFR-D-03 | Unchanged | C001-CON-07; the git dependency is decided by ADR in 20-plan (`10-context/scope.md` §5) |
| NFR-D-04 | Unchanged | Applies to every error path of C001-CAP-01 to C001-CAP-09 |
| NFR-D-05 | Replaced | By C001-NFR-001 to C001-NFR-004 and C001-NFR-018 |
