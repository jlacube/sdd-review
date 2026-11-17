---
id: "C001-CAP-05"
artifact: spec/requirements
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Test-first reading and executable evidence"
---
# C001-CAP-05 — Requirements

Stories: `stories.md`. Systems and terms: `40-domain/glossary-delta.md`. The review assistant runs
the project's own tests and commands and writes none (C001-NG-01); deep ecosystems follow
Q-languages-01 (`10-context/scope.md` §1).

## Test-first reading

### C001-REQ-501 — Recognise test hunks
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL classify as a test hunk every hunk of a file that follows the test-file conventions of a deep ecosystem, is a Gherkin feature file, holds acceptance scenarios of the repository's SDD workspace, or matches a test path pattern of the review configuration.
- **Rationale:** test-first reading (C001-R-002 paradigm 6) needs the changed tests and acceptance scenarios of each intent (C001-US-501). Test files outside the deep ecosystems are recognised through configured patterns (Q-languages-01).
- **Stories:** C001-US-501
- **Priority:** Must
- **Acceptance:** C001-AC-501.1
- **Open items:** test-file conventions per ecosystem: C001-IF-005 §10.

### C001-REQ-502 — Put an intent's tests before its implementation
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL put the test hunks of each intent before its other hunks in intent order.
- **Rationale:** paradigm 6, chosen in Q-extras-01; test-driven review experiment in C001-R-002 §B (same share of production defects found, more test defects found). This is the first key of the intent order; the order within the test hunks and within the other hunks is C001-REQ-403. The review UI lists and walks through an intent in intent order (C001-REQ-318, C001-REQ-322).
- **Stories:** C001-US-501, C001-US-307
- **Priority:** Must
- **Acceptance:** C001-AC-502.1

### C001-REQ-503 — Record the developer's judgement of an intent's tests
- **Pattern:** event-driven
- **Statement:** WHEN the developer records whether the test hunks of an intent express the intent, THE analysis core SHALL store that judgement, expresses or does not express, with the intent for the snapshot.
- **Rationale:** C001-US-501 (record whether the tests express the intent). The judgement decides which changed tests may clear hunks (C001-REQ-504). An intent without test hunks: C001-REQ-520.
- **Stories:** C001-US-501
- **Priority:** Must
- **Acceptance:** C001-AC-503.1

### C001-REQ-504 — Count only reviewed tests as clearing evidence
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL treat a test as qualifying for the passing-tests rule only when every changed line of a test hunk that the test executed belongs to an intent whose test hunks the developer has judged as expressing the intent.
- **Rationale:** C001-US-501 value (the tests that clear hunks have themselves been reviewed); agent-written tests can be weak (`ideation.md` §9). Q-clearing-05 (judge first, measure after): kept as stated, so code that the change's own tests execute clears only after the developer has judged those tests; C001-NFR-005 is measured after that judgement. A test that executes no changed line of a test hunk qualifies without a judgement. A changed fixture or helper in a test hunk (a file of the test-file conventions or of a test path pattern, C001-REQ-501) needs the judgement like the test itself; a changed helper outside every test hunk is code under review, needs no judgement and is cleared or left open on its own evidence. A repository that keeps test helpers elsewhere makes them test hunks through a test path pattern. Test hunks in orphan code belong to no intent, so tests that execute them (orphan tests, glossary) do not qualify; the developer can still group such a hunk under an intent and judge it. Effect on clearing: C001-REQ-410, C001-REQ-411.
- **Stories:** C001-US-501, C001-US-403
- **Priority:** Must
- **Acceptance:** C001-AC-504.1

### C001-REQ-520 — Refuse a test judgement on an intent without test hunks
- **Pattern:** unwanted-behaviour
- **Statement:** IF the developer records a test judgement for an intent under which no test hunk is grouped, THEN THE analysis core SHALL refuse the judgement with a message that the intent has no test hunks.
- **Rationale:** a test judgement is about the changed tests of an intent (C001-REQ-503); with none there is nothing to judge, and the intent's hunks can clear only on tests that execute no changed test line (C001-REQ-504). Refusing keeps the review record free of judgements without an object.
- **Stories:** C001-US-501
- **Priority:** Must
- **Acceptance:** C001-AC-520.1

## Tool-run test evidence

### C001-REQ-505 — Run the project's tests on the snapshot
- **Pattern:** event-driven
- **Statement:** WHEN the analysis of a snapshot starts, THE analysis core SHALL run on the snapshot the test command given by the developer for the review or, when none is given, the test command set in the review configuration.
- **Rationale:** C001-US-502 (evidence produced by the tool, not claimed by the agent; agentic manual testing in C001-R-002 §B). Relies on C001-AS-02; commands run on the local machine (C001-CON-01). The test command of the review configuration is the base commit's (C001-REQ-426, Q-clearing-03). Run time: C001-NFR-018.
- **Stories:** C001-US-502
- **Priority:** Must
- **Acceptance:** C001-AC-505.1

### C001-REQ-506 — Record which tests execute each changed line
- **Pattern:** event-driven
- **Statement:** WHEN a test run of the snapshot completes, THE analysis core SHALL record, for each line that a hunk of a file of a deep ecosystem adds, the passing tests and the failing tests that executed it.
- **Rationale:** C001-US-502; per-test coverage of changed lines is provided for the deep ecosystems (Q-languages-01). Feeds C001-REQ-401, C001-REQ-410 and C001-REQ-504. Python project modules are imported from the evidence workspace even when the project is installed in editable mode from the working tree (C001-IF-013 §2 item 7). A test that still executes the working-tree copy of a file of the snapshot, for example through a Node or .NET package link, an absolute path or a Python process started with `-I` or `-E`, executes no line of the snapshot; that execution counts for no hunk and is reported by notice ERR-EVID-008 (C001-IF-013 §4 item 2). Execution of other working-tree files, such as third-party packages of a virtual environment under the working-tree root, is neither counted nor reported.
- **Stories:** C001-US-502
- **Priority:** Must
- **Acceptance:** C001-AC-506.1

### C001-REQ-507 — Read standard coverage reports for other languages
- **Pattern:** event-driven
- **Statement:** WHEN a test run of the snapshot writes a coverage report in LCOV or Cobertura XML format, THE analysis core SHALL record, for each hunk of a file outside the deep ecosystems, which of the lines it adds the run executed.
- **Rationale:** the language-agnostic core reads standard coverage report formats (Q-languages-01); LCOV and Cobertura XML are named here so that the requirement is testable, and 20-plan may add formats. The report carries no per-test attribution, so these hunks feed the test-coverage signal (C001-REQ-401) and are not cleared by the passing-tests rule (C001-REQ-410).
- **Stories:** C001-US-502
- **Priority:** Should
- **Acceptance:** C001-AC-507.1

### C001-REQ-508 — Continue without test evidence when tests cannot run
- **Pattern:** unwanted-behaviour
- **Statement:** IF no test command is known for the review, or the test command fails to start, ends without reporting test results or is cancelled by the developer, THEN THE analysis core SHALL mark the snapshot's test evidence as unavailable, with the reason, and continue the analysis without it.
- **Rationale:** C001-AS-02 "If wrong" (evidence falls back to static signals, `ideation.md` §10); constitution principle 4. Consequences: no hunk clears by the passing-tests rule (C001-REQ-410) and test coverage scores as unknown (C001-REQ-404).
- **Stories:** C001-US-502
- **Priority:** Must
- **Acceptance:** C001-AC-508.1

### C001-REQ-509 — Take evidence only from runs on the snapshot
- **Pattern:** unwanted-behaviour
- **Statement:** IF a test run or an evidence-bundle command executes on file content that differs from the snapshot, THEN THE analysis core SHALL record none of its results as evidence and notify the developer that the files no longer match the snapshot.
- **Rationale:** evidence must describe the code under review (C001-US-502 "on the code I review"); review state is anchored to the snapshot (C001-US-104, `ideation.md` §9). The files compared are those the run executes on; C001-REQ-521 and C001-REQ-522 keep them apart from the working tree, so an edit of the working tree during a run voids no evidence. A command that rewrites the files it runs on, for example a test that updates its stored snapshots, still triggers this requirement. Notice ERR-EVID-005 (`50-interfaces/errors.md`).
- **Stories:** C001-US-502, C001-US-503
- **Priority:** Must
- **Acceptance:** C001-AC-509.1

## Executable evidence bundle

### C001-REQ-510 — Keep an evidence bundle for each intent
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL keep for each intent an evidence bundle made of the commands the developer enters for the intent and the commands it proposes from the agent's recorded runs linked to the intent and from the intent's acceptance scenarios.
- **Rationale:** C001-R-002 paradigm 7; the agent's recorded runs come from the intent context gathered at intake (C001-US-103).
- **Stories:** C001-US-503
- **Priority:** Must
- **Acceptance:** C001-AC-510.1

### C001-REQ-511 — Run proposed commands only after confirmation
- **Pattern:** unwanted-behaviour
- **Statement:** IF the analysis core proposed a command of an evidence bundle and the developer has not confirmed it, THEN THE analysis core SHALL NOT run it.
- **Rationale:** C001-US-503 context (commands proposed from the agent's records run only after the developer's confirmation); commands taken from agent transcripts are untrusted input.
- **Stories:** C001-US-503
- **Priority:** Must
- **Acceptance:** C001-AC-511.1

### C001-REQ-512 — Run an evidence bundle and record the real outputs
- **Pattern:** event-driven
- **Statement:** WHEN the developer runs the evidence bundle of an intent, THE analysis core SHALL run on the snapshot each command of the bundle that the developer entered or confirmed and record its exit status, standard output and standard error as produced.
- **Rationale:** paradigm 7: the tool runs the command, so the agent cannot write the expected output (C001-R-002 §B). Commands run on the local machine only (C001-CON-01). Time the analysis core adds to a command: C001-NFR-018. A command the developer enters is confirmed by entering it; a proposed command needs the developer's confirmation (C001-REQ-511).
- **Stories:** C001-US-503
- **Priority:** Must
- **Acceptance:** C001-AC-512.1

### C001-REQ-513 — Show what changed since the reference run
- **Pattern:** event-driven
- **Statement:** WHEN a run of an evidence-bundle command that has a reference run completes, THE review UI SHALL show the differences in exit status and output between this run and the reference run, which is the previous run of the command by the analysis core or, for the first run of a command taken from the agent's recorded runs, the output the agent recorded.
- **Rationale:** C001-US-503 (re-run on demand with the differences from the previous run shown). Comparing a first run with the agent's recorded output shows where the agent's account and the real behaviour differ.
- **Stories:** C001-US-503
- **Priority:** Must
- **Acceptance:** C001-AC-513.1

## Mutation and property evidence

### C001-REQ-514 — Run mutation testing on executed changed lines
- **Pattern:** event-driven
- **Statement:** WHEN a test run of the snapshot completes with test results, THE analysis core SHALL run mutation testing on the changed lines of files of the deep ecosystems that passing tests executed, taking hunks in descending risk score.
- **Rationale:** C001-R-002 paradigm 8; mutants limited to changed, covered lines as in mutation testing at Google (C001-R-002 §B). Risk order gives the riskiest hunks their results first when the run cannot finish (C001-AS-06 "If wrong"). Mutation testing is run for the deep ecosystems (Q-languages-01). Run time: C001-NFR-018.
- **Stories:** C001-US-504
- **Priority:** Must
- **Acceptance:** C001-AC-514.1

### C001-REQ-515 — Record surviving mutants with their hunk
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL record each surviving mutant in the evidence of the hunk it was generated in, with the changed line it mutated and the mutation applied.
- **Rationale:** C001-US-504 (surviving mutants shown next to their hunk); evidence is shown beside the hunk (C001-US-903). Effect on clearing: C001-REQ-410.
- **Stories:** C001-US-504
- **Priority:** Must
- **Acceptance:** C001-AC-515.1

### C001-REQ-516 — Mark mutation evidence unavailable
- **Pattern:** unwanted-behaviour
- **Statement:** IF mutation testing cannot run for a hunk or does not complete for it, THEN THE analysis core SHALL record the hunk's mutation evidence as unavailable, with the reason.
- **Rationale:** C001-AS-06; mutation-testing tools are optional dependencies (`10-context/scope.md` §5); constitution principle 4. The hunk's test evidence then has evidence strength 3 (C001-REQ-518).
- **Stories:** C001-US-504
- **Priority:** Must
- **Acceptance:** C001-AC-516.1

### C001-REQ-517 — Attach property-test counter-examples to hunks
- **Pattern:** event-driven
- **Statement:** WHEN a property-based test fails in a test run of the snapshot and reports a property counter-example, THE analysis core SHALL record the property counter-example in the evidence of every hunk of a file of a deep ecosystem whose changed lines the failing test executed.
- **Rationale:** paradigm 8 (property tests with shrinking, C001-R-002 §A); only the project's existing property tests are used (C001-NG-01). The failing test keeps the hunk open (C001-REQ-410).
- **Stories:** C001-US-505
- **Priority:** Could
- **Acceptance:** C001-AC-517.1
- **Open items:** the property-testing libraries whose counter-example output is read are chosen in 20-plan.

## Evidence strength

### C001-REQ-518 — Rank the strength of every evidence item
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL give every evidence item one of five evidence strengths, from 1, the strongest, to 5, the weakest: 1 deterministic proof of the pure-move, pure-rename, formatting or generated-file rule; 2 a tool-run test result or mutation result of a hunk whose changed lines have mutation results and no surviving mutant; 3 any other tool-run test result, mutation result or property counter-example; 4 an evidence bundle run; 5 agent-reported evidence.
- **Rationale:** `ideation.md` §9 (rank evidence strength); C001-R-002 Implications (evidence signals differ in cost and in trust); order given in C001-US-506. Only strengths 1 to 3 can clear a hunk (C001-REQ-412).
- **Stories:** C001-US-506
- **Priority:** Should
- **Acceptance:** C001-AC-518.1

### C001-REQ-519 — Show the evidence strength with every evidence item
- **Pattern:** ubiquitous
- **Statement:** THE review UI SHALL show the evidence strength next to every evidence item it shows.
- **Rationale:** C001-US-506 (strength shown wherever the evidence is shown); weak evidence is visible as weak (`ideation.md` §9).
- **Stories:** C001-US-506
- **Priority:** Should
- **Acceptance:** C001-AC-519.1

## Working tree during evidence runs

### C001-REQ-521 — Leave the repository unchanged during evidence runs
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL leave every file under the working-tree root, ignored files included, the index, every branch, every tag and every commit of the repository unchanged by an evidence run, from the start of the run and whether the run completes, fails, is cancelled or ends with the process of the analysis core, except for changes that the run's command or the project code it runs makes through a path of the working tree or of the git directory that the analysis core did not supply: a path named in the command text, in a file of the project or in the developer's environment, or reached through an editable install or a package link that points into the working tree.
- **Rationale:** mutation testing works by changing source lines, and project tests and bundle commands can write files; none of that may reach the developer's files, which the editor and the agent also use (C001-CON-04, C001-NG-03). Intake has the same guarantee (C001-REQ-120). A cancelled or crashed mutation run must not leave mutated code behind, so restoring files after the run does not meet this requirement. What the analysis core supplies, and so guarantees: the working directory of every command (an evidence workspace), the workspace content with the ignored paths made available in it, the arguments and environment variables it adds, and the mutation tool and coverage adapters with the paths given to them; none of these leads into the working tree or the git directory, and the analysis core itself writes nothing there (C001-IF-013 §9 item 1, C001-CON-22). The exception is stated because the analysis core runs project code with the developer's environment and no operating-system sandbox, so it cannot stop that code from addressing the working tree on its own (C001-IF-013 §9 item 2); for example, a Python process started with `-I` or `-E` is outside the import rule of C001-IF-013 §2 item 7, so an editable install makes it import working-tree modules, next to which CPython writes `__pycache__` files. Such changes are reported, not prevented (C001-REQ-523); execution of working-tree files counts for no hunk (C001-REQ-506). A command run as given: C001-REQ-505, C001-REQ-512.
- **Stories:** C001-US-502, C001-US-503, C001-US-504
- **Priority:** Must
- **Acceptance:** C001-AC-521.1

### C001-REQ-523 — Report changes of the repository while an evidence run runs
- **Pattern:** unwanted-behaviour
- **Statement:** IF a path under the working-tree root outside the git directory, ignored paths included, or the index, HEAD, a branch or a tag of the repository is created, changed or removed while the command of an evidence run runs, THEN THE analysis core SHALL notify the developer with the run, the number of changed paths and up to 10 of them, stating that the run or another program changed them, without changing whether the run's results are recorded as evidence.
- **Rationale:** the changes that C001-REQ-521 cannot prevent must not go unnoticed: the developer learns which files of the working tree changed while project code ran, for example `__pycache__` files that CPython writes next to working-tree modules imported by a Python process outside the import rule of C001-IF-013 §2 item 7, such as one started with `-I` or `-E`. The developer and the agent may edit the working tree while a run goes on (C001-REQ-522), so the notice does not attribute the changes to the run, and the workspace check alone decides whether the results are evidence (C001-REQ-509). A run with no changed path gets no such notice; a part of these paths and refs that was not observed for the whole command is reported by C001-REQ-524, an outcome that can fail independently of this one. Notice ERR-EVID-009; observation mechanism: C001-IF-013 §9 item 3. Execution of working-tree copies of files of the snapshot: notice ERR-EVID-008 (C001-IF-013 §4 item 2, C001-REQ-506).
- **Stories:** C001-US-502, C001-US-503, C001-US-504
- **Priority:** Must
- **Acceptance:** C001-AC-523.1

### C001-REQ-524 — Report an incomplete observation of the repository during an evidence run
- **Pattern:** unwanted-behaviour
- **Statement:** IF the analysis core cannot observe a path under the working-tree root outside the git directory, ignored paths included, or the index, HEAD, a branch or a tag of the repository for the whole time the command of an evidence run runs, THEN THE analysis core SHALL notify the developer with the run, each cause and the part not observed, given as the number of paths not observed, a directory counting for everything below it, and up to 10 of them, or as the whole working tree, or as the index and refs of the repository, stating that changes in that part during the run may be missing from the notice of changed paths, without changing whether the run's results are recorded as evidence.
- **Rationale:** an observation can miss changes, for example when file-system change notification drops events, a per-user watch limit is reached or a directory cannot be read. Without this notice the developer would read the absence of a notice of C001-REQ-523 as "nothing changed", and that notice is the only safeguard left for the exception of C001-REQ-521. With both requirements, the absence of both notices means that every path and ref named in the statement was observed for the whole command and none changed. The causes, each reported under its own name, are those of C001-IF-013 §9 item 4: not readable, watch limit, events lost and observation interrupted; a part whose observation falls back to a weaker means during the run still counts as not observed, and the changes that the fallback finds are reported under C001-REQ-523. The notice may follow a run together with the notice of C001-REQ-523, or alone. Notice ERR-EVID-010; which conditions of each operating system lead to which cause: the ADR named in C001-CON-22.
- **Stories:** C001-US-502, C001-US-503, C001-US-504
- **Priority:** Must
- **Acceptance:** C001-AC-524.1

### C001-REQ-522 — Keep evidence runs on the snapshot when the working tree moves on
- **Pattern:** state-driven
- **Statement:** WHILE a file of the working tree or HEAD differs from the snapshot, THE analysis core SHALL perform the evidence runs of the snapshot, including those already in progress when the difference arose, on the content of the snapshot and record their results as evidence of the snapshot.
- **Rationale:** a review of a 10,000-line change lasts hours (C001-US-906), and a test run (up to 3 times the project's own test time) or mutation testing (up to 60 min, C001-NFR-018) must not be voided by one save of the developer or the agent; otherwise the review would often end without test or mutation evidence, against C001-AS-06 and C001-NFR-005. The same holds for a bundle run started after the working tree moved on: it runs on the snapshot (C001-REQ-512). The evidence stays true because it belongs to the snapshot (C001-REQ-116); the developer learns that the working tree moved on through C001-REQ-117. Runs whose own files differ from the snapshot: C001-REQ-509.
- **Stories:** C001-US-502, C001-US-503, C001-US-504
- **Priority:** Must
- **Acceptance:** C001-AC-522.1
