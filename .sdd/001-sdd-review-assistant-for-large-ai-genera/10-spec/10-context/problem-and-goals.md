---
id: "C001-SPEC-CTX-01"
artifact: spec/context/problem-and-goals
change: "CHG-001"
phase: 10-spec
status: draft
---
# Problem and goals

## 1. Problem statement
The problem is stated, with its evidence, in `00-ideation/ideation.md` §2 (approved at G1). This
specification addresses it for the primary persona P-02 (`stakeholders-and-personas.md`,
C001-DEC-005) through the review paradigm of C001-DEC-001 and the form factor of C001-DEC-002.

## 2. Goals
Each goal is the approved goal of `ideation.md` §4.1 with the label shown; its wording is not
repeated here.

| ID | Goal | Measured by |
|---|---|---|
| C001-GOAL-01 | Scale — `ideation.md` §4.1 G-1 (C001-DEC-007) | C001-SC-01 |
| C001-GOAL-02 | Review effort independent of raw size — §4.1 G-2 (C001-DEC-001, C001-DEC-003) | C001-SC-02 |
| C001-GOAL-03 | Spec conformance visible — §4.1 G-3 (C001-DEC-001, C001-DEC-006) | C001-SC-03 |
| C001-GOAL-04 | Architecture lens — §4.1 G-4 (C001-DEC-001) | C001-SC-04 |
| C001-GOAL-05 | Accountable verdict — §4.1 G-5 (C001-DEC-003) | C001-SC-05 |
| C001-GOAL-06 | Works with or without specs — §4.1 G-6 (C001-DEC-006) | C001-SC-06 |
| C001-GOAL-07 | Local and private by default — §4.1 G-7 (C001-DEC-002, C001-DEC-004) | C001-SC-07 |
| C001-GOAL-08 | Disruptive workflow — §4.1 G-8 | C001-SC-08 |

## 3. Success criteria
Thresholds decided by P-01 cite the question that set them (`10-spec/questions-log.md`). Time and
resource thresholds belong to the performance NFRs (`30-nfr/nfr.md`).

| ID | Criterion | Goal |
|---|---|---|
| C001-SC-01 | A change of 10,000 changed lines over 300 files is taken in, analysed and opened for review on the developer's machine in one local review session, within the performance NFR thresholds of `30-nfr/nfr.md` | C001-GOAL-01 |
| C001-SC-02 | On a 10,000-line agent change, the hunks left open for human reading cover at most 30 % of changed lines, and the read, cleared and open shares are shown (Q-g2-target-01; measurement conditions: C001-NFR-005, Q-clearing-05) | C001-GOAL-02 |
| C001-SC-03 | 100 % of intents list their linked hunks and evidence; 100 % of hunks linked to no intent appear in the orphan-code list; 100 % of intents with no hunk appear in the unmet-intent list | C001-GOAL-03 |
| C001-SC-04 | The review opens on the architecture delta, and 100 % of intents and open hunks are reachable from a component shown in it | C001-GOAL-04 |
| C001-SC-05 | 0 intents are accepted without a developer signature; 100 % of cleared hunks have an evidence record; 100 % of verdicts are recorded against the snapshot they were given on | C001-GOAL-05 |
| C001-SC-06 | The full review flow, intake to verdict, completes on a repository with an SDD workspace and on a repository without one | C001-GOAL-06 |
| C001-SC-07 | With the default configuration, 0 bytes of repository content leave the machine during a review, excluding the network use of the project's own test and evidence-bundle commands that the review runs (C001-REQ-803) | C001-GOAL-07 |
| C001-SC-08 | In a comparison with a standard diff review on seeded-defect agent changes of 2,000–10,000 lines, review time is at least 50 % lower and the share of seeded defects found is not lower (Q-g8-target-01); protocol by sdd-test-designer (`ideation.md` §11) | C001-GOAL-08 |

## 4. Non-goals
Source: `ideation.md` §4.2 (items 1 to 5, same order).

- C001-NG-01: Generating or fixing code, or steering the agent (Q-arch-insight-01).
- C001-NG-02: Replacing team pull-request review on hosting platforms (C001-OA-002, C001-DEC-005).
- C001-NG-03: Automatic acceptance or commit of any code by the tool (C001-DEC-003).
- C001-NG-04: Formal verification of code against specs.
- C001-NG-05: Changes above about 10,000 changed lines (Q-scale-01, C001-DEC-007).
