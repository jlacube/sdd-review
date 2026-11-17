---
id: "C001-SPEC-GLOSSARY"
artifact: spec/glossary-delta
change: "CHG-001"
phase: 10-spec
status: draft
---
# C001 — Glossary delta

Every term below is new to the workspace glossary (`.sdd/_living/glossary.md` does not exist yet).
Requirements, NFRs and acceptance scenarios of CHG-001 use these terms with exactly these
meanings. Where a definition names a rule, the rule itself lives in the requirement cited.

## 1. Domain terms

### 1.1 Change, intake and snapshot
| Term | Definition |
|---|---|
| change | The change under review: every difference between the base commit and the working tree of a git repository, including the commits made since the base commit and the untracked files that the repository's ignore rules do not exclude (C001-REQ-101). Not to be confused with an SDD change. |
| base commit | The commit the change is compared with, chosen at intake by C001-REQ-102 to C001-REQ-104. |
| upstream branch | The remote-tracking branch that git records as the upstream of the current local branch. |
| default branch of the remote | The remote-tracking branch that the symbolic reference `refs/remotes/<remote>/HEAD` names, where `<remote>` is `origin` when the repository has a remote of that name and otherwise its only remote; with several remotes and none named `origin`, or without that symbolic reference, there is none. When no upstream branch exists, the base commit is the merge base of HEAD with the first of these that exists and has a merge base with HEAD: the default branch of the remote, then the local branch `main`, then the local branch `master`; with none, HEAD itself (C001-REQ-104, Q-intake-01; rule: `50-interfaces/git-access.md` G-14 and §4). |
| changed file | A file of the change that is added, deleted, modified or renamed. |
| changed line | A line that the change adds or deletes in a text file. A line modified in place counts as one deleted and one added line. Binary files have no changed lines. Unit of the supported size and of the shares. |
| supported size | The change size the first version is designed for: at most 10,000 changed lines and at most 300 changed files (C001-DEC-007, C001-CON-06). |
| hunk | A contiguous run of changed lines in one changed file, shown with its surrounding lines. The unit that is linked to an intent, scored, cleared, read and shown. |
| hunk content key | The identity of a hunk's content across snapshots, computed from its file path and its changed lines with their added or deleted marker, line numbers excluded, so that a hunk that only moves to other line numbers keeps its key (rule: `40-domain/domain-model.md` §3; C001-REQ-715). |
| intake | The first step of a review: taking in the change as a snapshot and gathering its intent context (C001-CAP-01). |
| intake summary | The report shown when intake completes: base commit and how it was chosen, a warning when the base commit is HEAD itself (only uncommitted edits are reviewed), change size, intent context found, and the test command that will run or none (C001-REQ-114). |
| snapshot | The identified, frozen state of the change taken at intake: base commit, HEAD commit and the content of every changed file, identified by a snapshot ID. Analysis results, read marks, clearings, hunk moves and verdicts each refer to exactly one snapshot. |
| snapshot ID | The identifier of a snapshot; identical for identical base commit, HEAD and changed-file content, different otherwise (C001-REQ-115). |
| moved-on notice | The notice that the working tree or HEAD no longer matches the snapshot under review (C001-REQ-117). |
| review | The work of one developer on one snapshot, from intake to the last verdict; it can span more than one review session. |
| review session | One sitting during which the developer works on a review in the CLI or the review UI. |
| analysis results | What the analysis core computes for a snapshot: architecture delta, intent map, risk scores, clearings and evidence records. |
| static analysis | The part of the analysis that neither runs project code nor calls a model provider: intake, architecture delta, intent map from deterministic link signals, and risk scores from deterministic signals. |
| decision status | The report of the numbers of intents that are signed, rejected, deferred, stale and without a verdict, and of orphan hunks neither attached to an intent nor rejected (C001-REQ-711). |
| notice | A message that the review assistant reports, and logs, while the operation it concerns goes on; an error, by contrast, stops the operation and changes nothing. Each notice and error has a code in `50-interfaces/errors.md`. |

### 1.2 Intent context and intents
| Term | Definition |
|---|---|
| SDD workspace | Specification artifacts (requirements, tasks, acceptance scenarios) kept in the snapshot, either as a folder in the `.sdd/` format or as a neutral intent-and-architecture file (C001-REQ-111, Q-intent-sources-01). |
| `.sdd/` format | The layout of an SDD workspace kept in a `.sdd/` folder, as used by this repository's own workspace; read natively by the first version (Q-intent-sources-01). The layout read is defined in `50-interfaces/`. |
| neutral intent-and-architecture file | A documented file format, defined in `50-interfaces/`, in which any tool can state spec items, the links between them and a documented architecture, so that SDD tools other than the `.sdd/` format can feed a review (Q-intent-sources-01, C001-REQ-111, C001-REQ-207). |
| SDD change | A unit of work inside an SDD workspace that holds its own spec items (for example a change folder of the `.sdd/` format). An open SDD change is one the workspace does not mark as archived. |
| spec item | A requirement, task or acceptance scenario of an SDD workspace, identified by its ID (C001-DEC-006). |
| intent context | The material gathered at intake that states the purpose of the change: the SDD workspace, the commits of the change with their messages, and the pull-request text, agent plan and agent transcript files the developer names. |
| pull-request text | A Markdown or plain-text file the developer names at intake as the description of the change; it is read from the local machine, never fetched from a hosting platform (C001-NG-02, C001-REQ-112). |
| agent plan | A Markdown or plain-text file the developer names at intake in which the coding agent stated what it planned to do (C001-REQ-112). |
| plan item | One item of an agent plan, as delimited by the plan-item rule (C001-REQ-314). |
| plan-item rule | The rule, defined in `50-interfaces/`, that delimits the plan items of a Markdown or plain-text agent plan (C001-REQ-314). |
| agent transcript | A Markdown or plain-text file the developer names at intake that records the coding agent's session (C001-REQ-112). |
| recorded run | A command that an agent plan or agent transcript shows the agent running, with the output the agent recorded for it when there is one; evidence bundles propose commands from the recorded runs linked to an intent (C001-REQ-510; recognition rules: C001-IF-007 §9). |
| intent | A unit of purpose the change is meant to fulfil; the unit under which hunks are grouped and on which the developer gives a verdict. An intent is taken from a requirement of an SDD change (C001-REQ-305, Q-intent-unit-01), is an extracted intent, or is named by the developer (C001-US-704). |
| extracted intent | An intent taken from the commits, pull-request text, agent plan or agent transcript when no SDD change applies (C001-DEC-006). |
| intent fallback | The mode in which the intents of a review are extracted intents because no SDD change applies (C001-DEC-006). |
| intent source | The item an intent comes from: a spec item ID, a commit, a plan item or transcript passage (file and line), or the developer. |
| intent key | The identity of an intent across snapshots, derived from its intent source: the SDD change and requirement ID, the commit hash, the plan file and item ordinal, the model-written title, or the name the developer gave (rule: `40-domain/domain-model.md` §3). An intent taken again from the same source in a later snapshot has the same key (C001-REQ-715, C001-REQ-717). |
| spec-edit flag | The mark on the intent map that a hunk of the change adds, modifies or deletes a spec item of the SDD change the intents come from, naming the spec item and the hunk (C001-REQ-328). |
| source order | The order of intents by their sources: spec items in ID order, commits from oldest to newest, plan items in file order, developer-named intents in the order they were named. |
| intent map | The intents of a snapshot with the hunks grouped under each, together with orphan code and the list of unmet intents (C001-CAP-03). |
| link | The connection between a hunk and the intent it is grouped under. Every link has a link signal, a link confidence and a link reason. |
| link signal | An observable fact that ties a hunk to an intent, from the table in `20-capabilities/CAP-03-intent-map/requirements.md` §1. |
| confidence scale | The confidence levels shared by links and model output: high and medium (deterministic link signals), low (a model judgement and every other model output), developer (a hunk move) (`20-capabilities/CAP-03-intent-map/requirements.md` §1, C001-REQ-811). |
| confidence level | One level of the confidence scale. |
| link confidence | The confidence level of a link, set by its link signal. |
| link reason | The human-readable statement of the link signal behind a link, for example "commit 3f2a1c9 names C004-REQ-012". |
| alternative intent | Another intent that a hunk's strongest link signals also point to; shown on the hunk, not grouped (C001-REQ-307). |
| orphan code | The hunks of a snapshot that are linked to no intent (C001-R-002 paradigm 3). |
| unmet intent | An intent under which no hunk of the change is grouped. |
| hunk move | The developer's correction that groups a hunk under another intent or under orphan code (C001-US-306). |
| intent order | The one reading order of the hunks of an intent: test hunks first (C001-REQ-502), then the keys of C001-REQ-403 within the test hunks and within the other hunks. The intent list (C001-REQ-318) and the walkthrough (C001-REQ-322) use it. |
| walkthrough | The presentation of the hunks of one intent in intent order, opened by its walkthrough account (C001-REQ-322). |
| walkthrough account | The short statement, at the start of a walkthrough, of what the intent changes: the deterministic account of C001-REQ-324 and, with a model provider, the model-written account of C001-REQ-325. Also called account of the intent. |

### 1.3 Architecture delta
| Term | Definition |
|---|---|
| component | A named part of the repository's architecture and the files it contains: a documented component or a derived component. |
| documented architecture | The components, layers and allowed dependencies that the first source of the documented-architecture source order holding an architecture declares, in the `.sdd/` format or in a neutral intent-and-architecture file, read from the snapshot (C001-REQ-207). At least one of its components gives the path patterns of its files; an architecture in which none does is not a documented architecture (C001-REQ-223). An architecture held in a place that the source order does not name is not read. |
| documented-architecture source order | The places, in order, from which the analysis core reads the documented architecture of a snapshot, as set in C001-IF-007 §4 item 1 (C001-REQ-207, C001-REQ-211). |
| derived component | A component the analysis core derives from the repository's directory, package, module or project structure when no documented architecture exists (C001-REQ-210). |
| layer | An ordered level of a documented architecture to which components belong. |
| dependency | A use of one component by another, or of an external package by a component, observed in import or reference statements or in package manifests. |
| external package | A third-party package that a package manifest of the repository declares. |
| new coupling | A dependency between two components that exists in the snapshot and not at the base commit. |
| architecture delta | The view of what the change does to the architecture: the components it touches with the amount of change in each, the dependencies it adds or removes (new couplings marked), the external packages it adds, removes or re-versions, drift and design-quality findings. The review opens on it (C001-DEC-001, C001-REQ-201). |
| drift | A departure of the snapshot from the documented architecture: a dependency the documented architecture does not allow, a changed file outside every documented component, or an architecture edit (C001-REQ-208, C001-REQ-209, C001-REQ-222). |
| architecture edit | The kind of drift of a hunk that adds a line from which the snapshot's documented architecture is read, or deletes a line from which the base commit's documented architecture is read (C001-REQ-222, Q-drift-01). |
| design-quality finding | A finding about the design of the changed code: a new dependency cycle, a layer bypass, duplicated logic, or a design critique item. |
| dependency cycle | A chain of dependencies between components that leads back to its first component. |
| layer bypass | A dependency from a component to a component more than one layer below it. |
| duplicated logic | A run of added lines that repeats, after whitespace normalisation, a run of lines found elsewhere in the snapshot that is at least the minimum clone length long (C001-REQ-215). |
| minimum clone length | The setting of the review configuration that gives the shortest run of lines counted as duplicated logic. |
| design critique | Design-quality findings produced by a model provider; model output. |

### 1.4 Languages
| Term | Definition |
|---|---|
| deep ecosystem | A language and test ecosystem for which the first version provides language-specific signals and acceptance tests: TypeScript/JavaScript, Python, C#/.NET (Q-languages-01). |
| language-specific signal | Information obtained by parsing a file of a deep ecosystem: symbols and their definitions and uses, import and reference statements, public API, syntax-aware moves and renames. |
| language-agnostic core | The analysis available for a file of any language: line-based hunks, directory-based components, changed-line counts, test and mutation results read from the standard report formats the plan selects; files outside the deep ecosystems get only this. |
| public API | The symbols of a component or package that code outside it can use (exported or public symbols). |
| symbol | A named definition in code: function, method, class, type, variable or constant. |
| executable line | An added line that the coverage measurement of a test run reports as executed or not executed: the per-test coverage of its ecosystem for a file of a deep ecosystem (C001-REQ-506), a LCOV or Cobertura XML report for another file (C001-REQ-507). Blank lines and comment-only lines are not executable lines (C001-REQ-401, C001-REQ-410). |

### 1.5 Triage, clearing and evidence
| Term | Definition |
|---|---|
| risk score | The score the analysis core gives each hunk from its risk signals (C001-CAP-04). |
| risk signal | An observed property of a hunk that raises or lowers its risk score: guarded area, size, novelty, test coverage or dependency change (C001-REQ-401). |
| clearing | The act by which the analysis core collapses a low-risk hunk under a clearing rule and attaches the evidence record that justified it. A cleared hunk stays visible and can be opened. Clearing is not acceptance (C001-DEC-003). |
| cleared hunk | A hunk in the cleared state: collapsed, with its evidence record, and not reopened. |
| clearing rule | A rule that clears a hunk on one kind of evidence, mechanical proof or passing tests (Q-clearing-01): the pure-move, pure-rename, formatting, generated-file and passing-tests rules, and no other (C001-REQ-412). Built in and adjustable in the review configuration, within the floor of the guarded areas (Q-clearing-02). |
| pure-move rule | The clearing rule for hunks that only move whole files or whole symbol definitions with an identical abstract syntax tree and unchanged name resolution (C001-REQ-406). |
| pure-rename rule | The clearing rule for hunks whose only differences replace symbol names consistently at the definition and every use, with unchanged name resolution (C001-REQ-407). |
| formatting rule | The clearing rule for hunks whose code keeps the same abstract syntax tree and comment text as in the base commit (C001-REQ-408). |
| generated-file rule | The clearing rule for hunks of files the repository declares as generated (C001-REQ-409). |
| generated-file pattern | A path pattern of the review configuration that declares the matching files as generated (C001-REQ-409). |
| passing-tests rule | The clearing rule for hunks whose executable lines are all executed by passing qualifying tests, with no failing test and no surviving mutant (C001-REQ-410). |
| mechanical change | A hunk whose behaviour cannot differ from the base: a pure rename, a pure move, a formatting-only change, or a change to a generated file (Q-clearing-01). |
| guarded area | A category of code whose hunks are never cleared automatically, whatever their evidence. Built in: security and authentication, data migrations, dependency, build and configuration files, public API changes (Q-clearing-01). A repository may add guarded areas and may not remove a built-in one (Q-clearing-02). |
| open hunk | A hunk that is not cleared and has no read mark. A reopened hunk is open until it is marked read. |
| reopen | The developer's or the analysis core's act that returns a cleared hunk to the open state. |
| test hunk | A hunk of a test file of a deep ecosystem, of a Gherkin feature file, of the acceptance scenarios of the SDD workspace, or of a file matching a test path pattern of the review configuration (C001-REQ-501). |
| test path pattern | A path pattern of the review configuration that marks the matching files as test files (C001-REQ-501). |
| test judgement | The developer's record, per intent and snapshot, of whether the intent's test hunks express the intent: "expresses" or "does not express" (C001-REQ-503). |
| qualifying test | A test whose passing result counts for the passing-tests rule, under the condition of C001-REQ-504 on test judgements. |
| orphan test | A test that executes a changed line of a test hunk in orphan code. It is never a qualifying test, because a test hunk in orphan code belongs to no intent whose tests the developer can judge (C001-REQ-504); grouping the hunk under an intent and judging that intent's tests ends this (C001-NFR-005 reports the open share it causes). |
| test run | A run of the project's test command on the snapshot by the analysis core (C001-REQ-505). |
| evidence run | A test run, a mutation-testing run (C001-REQ-514) or a run of the commands of an evidence bundle (C001-REQ-512) that the analysis core starts on the snapshot (rules for the working tree: C001-REQ-521, C001-REQ-522). |
| evidence workspace | A directory on the local machine, outside the working-tree root and the git directory and below neither, that holds the files of the snapshot and serves as the working directory of evidence runs, so that no evidence run executes in the developer's working tree (C001-REQ-521, C001-REQ-522, C001-CON-22; content, preparation and removal: `50-interfaces/evidence-runs.md` §2). |
| cold build | A build of the project in a directory that holds no build output of an earlier build, so that every part is built; the first run of a test command in a newly prepared evidence workspace includes one (C001-NFR-018, C001-AS-08). |
| editable install | An installation of a package into an environment, for example a Python virtual environment through `pip install -e`, that loads the package's files from where they lie instead of from a copy. In an evidence run, project modules of the snapshot are imported from the evidence workspace even when an editable install points into the working tree (`50-interfaces/evidence-runs.md` §2 item 7); working-tree execution remains possible only through other routes such as package links or absolute paths (C001-REQ-506, C001-REQ-521, C001-REQ-523). |
| package link | A link that makes a package directory appear as an installed package of another place, for example through `npm link` or a project reference by absolute path; one that points into the working tree has the effect of an editable install (C001-REQ-521). |
| installed copy | A copy of files of the project itself that an installation puts into an environment, at paths that are not files of the snapshot: for example the modules that a regular, non-editable `pip install .` copies under `site-packages`, or a package of the project's own code restored into `node_modules/` or a package cache. Execution of an installed copy counts for no hunk, because the executed file is not a file of the snapshot (`50-interfaces/evidence-runs.md` §4 item 2); the environment of a benchmark change allows none (`30-nfr/nfr.md` §0, C001-NFR-005). |
| evidence item | One piece of evidence about a hunk or an intent: deterministic proof, a tool-run test result, a mutation result, a property counter-example, an evidence bundle run, or an agent-reported run. |
| tool-run evidence | Evidence the review assistant produced itself by running a command on the snapshot. |
| agent-reported evidence | Evidence that the coding agent claims in its output or transcript and the review assistant did not reproduce. |
| evidence record | The record attached to every clearing: the clearing rule, the evidence items with their evidence strength, and the snapshot. The developer can open it from the cleared hunk (C001-DEC-003). |
| evidence bundle | The set of commands attached to an intent that the review assistant runs itself on the snapshot, with the recorded outputs of each run; it can be re-run on demand (C001-R-002 paradigm 7). |
| reference run | The run an evidence-bundle command run is compared with: the previous run by the analysis core, or for a first run of a command taken from the agent's records, the output the agent recorded (C001-REQ-513). |
| evidence strength | The rank of an evidence item by the trust it deserves, from 1 (strongest) to 5, shown wherever the item is shown (C001-US-506; ranks set in C001-REQ-518). |
| test-first reading | Reading an intent's changed tests and acceptance scenarios before its implementation hunks (C001-R-002 paradigm 6). |
| mutant | A small deliberate change to a changed line, made to check whether the project's tests detect it. |
| surviving mutant | A mutant on a changed line executed by tests that no test detects. |
| property counter-example | The shrunk input for which a property-based test of the project fails. |

### 1.6 Review coverage
| Term | Definition |
|---|---|
| read mark | The developer's mark that a hunk has been read; a hunk with a read mark is a read hunk (C001-REQ-601). |
| read share | The share of the changed lines of the change, of an intent or of a component that lie in read hunks. |
| cleared share | The share of those changed lines that lie in cleared hunks without a read mark. |
| open share | The share of those changed lines that lie in open hunks. Read, cleared and open shares add up to 100 %. |
| reading queue | The ordered list of hunks the developer is asked to read: the open hunks and the sampled hunks not yet read (C001-REQ-610). |
| sample | The hunks of each clearing rule's sample population picked at random for reading; its unread hunks are in the reading queue (C001-REQ-604, C001-REQ-616, C001-R-002 paradigm 15). |
| sample population | The hunks of a snapshot whose clearing by a given clearing rule has not been withdrawn, read or not. A hunk leaves it when the developer reopens it, when escalation reopens it, or when its passing-tests clearing is withdrawn (C001-REQ-411, C001-REQ-422, C001-REQ-604, C001-REQ-606). |
| sample seed | A random value drawn once when a review is created and kept with it, from which the random order of every sample of the review is derived, so that the samples are the same in every review session of one review and differ between reviews (C001-REQ-604, C001-REQ-616, C001-REQ-918; rule: C001-INV-16). |
| defect report | The developer's statement, with a text, that a hunk contains a defect, recorded with the clearing rules that had cleared the hunk, if any (C001-REQ-617). A defect report on a hunk that a clearing rule cleared escalates that rule (C001-REQ-606). |
| sampling result | The outcome of reading a sampled hunk: its read mark and, when the developer finds a defect in it, the defect report. It is not an entry kind of its own; the coverage statement counts it per clearing rule (C001-REQ-614). |
| escalation | Reopening every unread hunk of the snapshot cleared by a clearing rule that also cleared a hunk in which the developer reported a defect, whether that hunk was in the sample or the developer expanded or reopened it; the rule then clears no more hunks in the snapshot and takes no new hunk into its sample (C001-REQ-606, C001-REQ-609, C001-REQ-616; C001-R-002 paradigm 15). |
| attention budget | The reading time (time budget) the developer states for a review, into which the review assistant fits the open hunks by risk per minute of reading and shows what does not fit (C001-R-002 paradigm 16). |
| reading rate | The changed lines per hour the attention budget assumes the developer reads (C001-REQ-611). |
| coverage statement | The statement of the risk covered by reading, by evidence and by sampling, and of the risk not covered, at a point of the review (C001-US-606, C001-REQ-613). |

### 1.7 Verdicts and record
| Term | Definition |
|---|---|
| verdict | The developer's decision on one intent: sign, reject or defer. Only the developer gives verdicts; a verdict never stages, commits, reverts or pushes code (C001-CON-04). |
| sign | The verdict that accepts an intent; the only way any hunk of the change is accepted (C001-DEC-003). The recorded act is the signature. |
| reject | The verdict that refuses an intent, with the developer's reason. |
| defer | The verdict that postpones the decision on an intent, with the developer's note; a deferred intent is neither accepted nor rejected. |
| current verdict | The latest verdict recorded for an intent key in the review records of the repository; it applies to the intent with that key in each snapshot until a newer verdict replaces it, and it can be stale (C001-REQ-708, C001-REQ-715 to C001-REQ-718). |
| stale verdict | A verdict whose hunks, evidence or intent source changed after the developer gave it (C001-US-706). |
| review record | The durable, append-only record of a review: one review record entry per recorded action, and one per escalation that a defect report causes, each with its time and the git user who took the action; the entry kinds are those of C001-IF-009. A verdict entry also holds the coverage statement and the basis of the verdict (C001-REQ-712, C001-REQ-713, C001-US-705). |
| review record entry | One entry of the review record. |
| recorded action | An action of the developer that writes a review record entry. The ten kinds are listed in C001-REQ-721; running an evidence bundle is not one, as its runs are analysis results. |

### 1.8 Model provider and configuration
| Term | Definition |
|---|---|
| model provider | A language model the review assistant calls through a provider API, configured per repository: a local provider or a cloud provider (C001-DEC-004, C001-REQ-805). |
| local provider | A model provider whose endpoint is a loopback address (127.0.0.0/8 or ::1), the host name `localhost`, or a local socket (C001-REQ-806, Q-provider-02). |
| cloud provider | A model provider whose endpoint is neither a loopback address, nor the host name `localhost`, nor a local socket; any other host name makes it a cloud provider, whatever it resolves to. Repository content reaches it only when the review configuration has the cloud opt-in setting, the only way repository content leaves the machine (C001-REQ-806, C001-CON-01). |
| cloud opt-in setting | The setting of the review configuration by which P-03 allows the review assistant to send repository content to a cloud provider (C001-REQ-806, C001-DEC-004). |
| provider API | The API through which the analysis core calls a model provider: the OpenAI-compatible chat API or the Anthropic Messages API (Q-provider-01, C001-REQ-805). |
| OpenAI-compatible chat API | The chat-completions HTTP API published by OpenAI, also served by local model runtimes such as Ollama and llama.cpp server (Q-provider-01). |
| Anthropic Messages API | The Messages HTTP API of Anthropic (Q-provider-01). |
| provider timeout | The setting of the review configuration that gives how long the analysis core waits for an answer of the model provider (C001-REQ-816). |
| model output | Any item a model provider produced (extracted intent, link, walkthrough account, design critique), marked with the names of the provider and of the model (C001-REQ-810) and the confidence level low (C001-REQ-811). |
| model-free mode | The mode in which no model provider is used, because none is configured, the review configuration cannot be read, the cloud opt-in setting is missing, the configured provider failed, or the content is on a model-excluded path. Every capability works in it, and every reduced result is labelled (C001-CON-05, C001-REQ-819). |
| reduced result | A result produced in model-free mode or by the language-agnostic core that lacks what a model provider or a language-specific signal would add; it is labelled "reduced" with the missing part named (C001-REQ-804). |
| review configuration | The per-repository settings the review assistant reads, kept in the repository, owned by P-03, and read from the base commit of the snapshot (C001-REQ-426): clearing rules, added guarded areas, generated-file patterns, test path patterns, test command, minimum clone length, model provider and its provider API, cloud opt-in setting, provider timeout, model-excluded path patterns. |
| default configuration | The review configuration in effect when the base commit holds none: the built-in clearing rules and guarded areas and no model provider (C001-REQ-426, C001-REQ-801). |
| model-excluded path pattern | A glob pattern of the review configuration, relative to the repository root; the content of a file whose path at the base commit or in the snapshot matches it is never sent to any model provider (C001-REQ-814). Such a file is on a model-excluded path (C001-US-805). |

### 1.9 Architecture terms used by the requirements
| Term | Definition |
|---|---|
| core API | The only entry point into the analysis core, called in process by the CLI and the local review UI server; it fixes the operations with their inputs, outputs and errors (C001-IF-003, C001-COMP-002). |
| review state store | The local storage outside the working tree in which the analysis core keeps, per snapshot, the snapshot content, the analysis results and the review record; it is never part of the repository (C001-COMP-014; location: `50-interfaces/README.md` §2). |
| revision | The number of the state of a review; it increases each time an analysis result or a review record entry is added, so that the CLI and the local review UI can tell that what they show must be refreshed (C001-IF-003 §2). |

## 2. System names (allowed after `THE` in EARS statements)
| Name | Component |
|---|---|
| review assistant | The whole product of CHG-001: analysis core, CLI and review UI together (C001-DEC-002). |
| analysis core | The analysis component that takes in the change, computes the analysis results and keeps the review state; usable without the review UI (C001-DEC-002, C001-CON-03). COMP ID assigned in `60-architecture/`. |
| CLI | The command-line interface of the analysis core (C001-DEC-002); its executable and configuration folder names: `50-interfaces/README.md` §2 (Q-naming-01). |
| local review UI | The standalone local review UI, served on the developer's machine and opened in a web browser (C001-DEC-002, C001-CON-02). |
| review UI | Short form of local review UI; the same component. |
