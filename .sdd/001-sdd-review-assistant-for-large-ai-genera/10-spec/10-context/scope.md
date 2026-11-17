---
id: "C001-SPEC-CTX-03"
artifact: spec/context/scope
change: "CHG-001"
phase: 10-spec
status: draft
---
# Scope, assumptions, constraints and dependencies

## 1. In scope
In-scope items of `ideation.md` §5 and the extras chosen in Q-extras-01 (C001-R-002 paradigms 6,
7, 8, 15 and 16), each mapped to the capability that holds it.

| Item | Capability |
|---|---|
| Intake of a change (working tree and agent commits not yet pushed, versus a base commit) and of its intent context: SDD workspaces in the `.sdd/` format or as a neutral intent-and-architecture file; pull-request text, plans and transcripts as Markdown or plain text (Q-intent-sources-01) | C001-CAP-01 |
| Architecture impact and drift lens with design-quality findings; the review opens on it | C001-CAP-02 |
| Intent mapping from an SDD workspace or from the intent fallback, in one neutral intermediate form; orphan code and unmet intents | C001-CAP-03 |
| Risk triage with guarded clearing and evidence records (Q-clearing-01) | C001-CAP-04 |
| Test-first reading (paradigm 6), executable evidence bundle (paradigm 7), mutation and property evidence on changed lines (paradigm 8) | C001-CAP-05 |
| Read, cleared and open shares (C001-GOAL-02); sampling with escalation (paradigm 15); attention budget (paradigm 16) | C001-CAP-06 |
| Per-intent verdicts and their record | C001-CAP-07 |
| Pluggable model provider with a model-free deterministic mode | C001-CAP-08 |
| Analysis core with CLI; standalone local review UI | C001-CAP-09 |
| Programming languages and test ecosystems covered by the syntax-aware, coverage and mutation features: language-specific signals and acceptance tests for TypeScript/JavaScript, Python and C#/.NET (the deep ecosystems); the language-agnostic core for every other language (Q-languages-01) | C001-CAP-02, C001-CAP-04, C001-CAP-05 |

## 2. Out of scope
- The non-goals C001-NG-01 to C001-NG-05 (`problem-and-goals.md` §4).
- Hosting, multi-user collaboration and accounts (`ideation.md` §5).
- Later changes listed in `ideation.md` §5: IDE extension, Claude Code launcher and pull-request
  platform surface (C001-DEC-002); structured feedback sent back to the agent (C001-R-001 Gap 7);
  incremental re-review after agent revisions (C001-R-002 paradigm 20); changes beyond 10,000
  changed lines (C001-DEC-007).
- C001-R-002 paradigms 9, 10, 12, 13 and 19 (not chosen in Q-extras-01); paradigms 14, 18 and 20
  and the auto-acceptance tier of paradigm 5 (`ideation.md` §8).
- Writing tests, properties or fixes: the evidence features read and run the project's own tests
  (C001-NG-01).

## 3. Assumptions
| ID | Assumption | If wrong |
|---|---|---|
| C001-AS-01 | Agent changes reviewed today rarely exceed about 10,000 changed lines (`ideation.md` §10, Q-scale-01) | The scale target and the performance NFRs must be raised |
| C001-AS-02 | The developer can run the project's tests locally to produce evidence (`ideation.md` §10) | Evidence falls back to static signals; fewer hunks clear on tests (C001-US-403, C001-US-502, C001-US-504) and C001-SC-02 is at risk |
| C001-AS-03 | A git repository is the unit of review (`ideation.md` §10) | Intake must support other version-control systems (C001-CAP-01) |
| C001-AS-04 | Intent can be extracted well enough from commits, pull-request text, plans or transcripts when no spec exists (`ideation.md` §10, Q-spec-anchor-01) | The no-spec mode maps less and leaves more orphan code and open hunks (C001-US-302) |
| C001-AS-05 | A repository without a documented architecture has a module, package or directory structure from which components and their dependencies can be derived | The architecture delta falls back to a file-tree view without dependencies (C001-US-206) |
| C001-AS-06 | Mutation testing limited to changed lines that tests execute completes within one review session for a 10,000-line change on the developer's machine (approach from C001-R-002 §B, mutation testing at Google); measured by C001-NFR-018 | Mutation evidence is limited to a subset of hunks, for example the high-risk ones (C001-US-504) |
| C001-AS-07 | With the built-in clearing rules and guarded areas, the public API recognition of C001-REQ-417 included, the intake and the environment fixed for each benchmark change in `30-nfr/nfr.md` §0, model-free mode, and the test judgement "expresses" on every intent with test hunks, the open share of a 10,000-line agent change in a deep ecosystem can be at most 30 % (Q-g2-target-01, Q-clearing-05); not yet estimated. Orphan tests qualify for no clearing (C001-REQ-504), so the share also depends on how many test hunks the link signals of model-free mode group under an intent. To be checked by an estimate of the open share, split by the reasons of C001-NFR-005, on one sample agent change per deep ecosystem; measured by C001-NFR-005 | The split by reason of C001-NFR-005 decides the next step. Where hunks whose passing-test evidence was refused for working-tree execution (ERR-EVID-008) hold part of the share, the environment of the benchmark change broke `30-nfr/nfr.md` §0: it is brought in line with §0 and the measurement is repeated before any other step. Where orphan tests hold the share, the link signals that group test hunks under intents (C001-CAP-03) are revisited. A narrowing of the public API recognition of C001-REQ-417 (for example to symbols reachable from a package entry point or listed in `__all__`) is decided by P-01 on a proposal that gives the measured split by reason; no specialist narrows it (Q-clearing-06). Otherwise the threshold of C001-NFR-005 goes back to P-01; the specification does not change the threshold on its own |
| C001-AS-08 | Preparing an evidence workspace and the cold build in it, which C001-NFR-018 leaves under no threshold, keep the first test run of a review session, from the start of the preparation to the recorded test results, within 3.0 times the project's test command run alone in the developer's working tree in its usual built state: the comparison P-01 had in view when choosing 3.0 in Q-evidence-time-01, before evidence runs moved into evidence workspaces (C001-CON-22). A bundle run that finds no free workspace of its snapshot needs the same preparation. Not yet measured; measured by the ADR named in C001-CON-22 and reported with C001-NFR-018. Accepted by P-01 as stated, with no bound on the first test run of a session (Q-workspace-01) | The ADR adopts one or more of the mitigations that C001-IF-013 §8 item 3 allows and measures again; none takes compiled or transformed code from the working tree (C001-CON-22); if the first test run still takes more than 3.0 times, a bound on workspace preparation and cold build goes to P-01 as a question on C001-NFR-018; the specification does not set or change a threshold on its own |

## 4. Constraints
| ID | Constraint | Source |
|---|---|---|
| C001-CON-01 | The tool runs on the developer's machine; repository content leaves it only when the repository is configured for a cloud model provider | C001-DEC-002, C001-DEC-004, C001-GOAL-07 |
| C001-CON-02 | The local review UI accepts connections from the local machine only; remote access is off by default | C001-DEC-002 Consequences, `ideation.md` §9 |
| C001-CON-03 | The analysis core is usable without the UI and does not depend on it | C001-DEC-002 Consequences |
| C001-CON-04 | The tool never accepts, stages, commits, reverts or pushes code; acceptance is the developer's signature on an intent | C001-DEC-003, C001-NG-03 |
| C001-CON-05 | Every capability works with no language model configured; a reduced result is labelled as reduced | C001-DEC-004 Consequences |
| C001-CON-06 | The first version is sized for a change of about 10,000 changed lines over about 300 files | C001-DEC-007 |
| C001-CON-07 | Dependencies use OSI-approved permissive licences and have no known high or critical vulnerability; no secret is stored in the repository, including model-provider keys | Constitution NFR-D-01 to NFR-D-03 and forbidden technologies |
| C001-CON-08 | Review approaches added to the core flow come only from C001-R-002 paradigms 6, 7, 8, 15 and 16 | `ideation.md` §8, Q-extras-01 |

## 5. External dependencies
| Dependency | Version policy | Required? | Used by | License |
|---|---|---|---|---|
| Git access (the installed git program or a git library) | Supported releases set in 20-plan | Yes | C001-CAP-01, C001-CAP-07 | Depends on the choice, decided by ADR in 20-plan: the git program is GPL-2.0, so the ADR shows it is not a forbidden dependency under the constitution, or a permissive library is chosen |
| Syntax-tree parsing for the analysed languages | Set in 20-plan | Yes | C001-CAP-02, C001-CAP-03, C001-CAP-04 | Permissive only (C001-CON-07) |
| The project's own test runner and coverage report | The project's own | No (C001-AS-02) | C001-CAP-04, C001-CAP-05 | Not a dependency of the tool; run as the project's command |
| Mutation-testing tool for each analysed language | Set in 20-plan | No | C001-US-504 | Permissive only (C001-CON-07) |
| Language-model provider: a local model runtime or a cloud API, reached through the OpenAI-compatible chat API or the Anthropic Messages API (Q-provider-01) | Per-repository configuration (C001-DEC-004) | No (C001-CON-05) | C001-CAP-08 and the model-assisted parts of C001-CAP-02 and C001-CAP-03 | Per provider; cloud terms are the repository maintainer's choice |
| Web browser on the developer's machine | Supported browsers: C001-NFR-017 (Q-platform-01) | Yes for the UI, no for the headless CLI | C001-CAP-09 | Not a dependency of the tool |
