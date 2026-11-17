---
id: "C001-IF-003"
artifact: spec/interface
change: "CHG-001"
phase: 10-spec
status: draft
kind: conventions
---
# C001-IF-003 — Core API

## §1 Purpose and binding
The core API is the only entry point into the analysis core (C001-COMP-002). The CLI
(C001-COMP-001) and the UI server (C001-COMP-018) call it in process; neither reaches another core
component directly, and the core imports neither of them (C001-CON-09). The language binding
(function signatures, async model) is set with the implementation language by ADR in 20-plan;
this file fixes the operations, their inputs, outputs and errors. Each HTTP operation of C001-IF-002
has the `operationId` of the core operation it calls.

## §2 Conventions
- Every operation takes the repository root; review operations also take a snapshot ID.
- Outputs are the types of C001-IF-008 and C001-IF-009, or the view types of C001-IF-002
  `components/schemas`, which only assemble them.
- A failing operation returns one code of `errors.md` and changes no state.
- **Write operations** (§4) save every record entry they write durably before they return
  (C001-REQ-920), through C001-COMP-014, which orders concurrent writers (C001-REQ-917). They return
  the entry's sequence number and the moved-on notice when it applies. `openReview` restores the
  entries and the review state they set (C001-REQ-918); the save, restore and crash-safety design
  is `60-architecture/architecture.md` §4.2.
- **Revision:** every review has a revision number that increases when an analysis result or a
  record entry is added; read operations return it so that a surface can refresh.

## §3 Read and lifecycle operations
| Operation | Input | Output | Errors | Requirements |
|---|---|---|---|---|
| `startReview` | intake options (base, SDD change, named files by role, test command) | snapshot ID, intake summary, `reopened` flag, notices (ERR-SDD-004, ERR-SDD-005) | ERR-INTAKE-001 to ERR-INTAKE-005, ERR-CTX-001 to ERR-CTX-003, ERR-SDD-001 to ERR-SDD-003 | C001-REQ-101 to C001-REQ-124, C001-REQ-223, C001-REQ-326 |
| `runStaticAnalysis` | snapshot ID | architecture delta, intent map, triage (deterministic part) | ERR-CLI-003 | C001-REQ-201, C001-NFR-001 |
| `startJobs` | snapshot ID | job list (test run, mutation, model tasks) | — | C001-REQ-505, C001-REQ-514, C001-REQ-805 |
| `listJobs` / `cancelJob` | snapshot ID, job ID | job states | ERR-ACT-004 | C001-REQ-508 |
| `openReview` | snapshot ID | session info | ERR-STORE-004 | C001-REQ-918, C001-REQ-919 |
| `listReviews` | — | snapshot IDs with base, HEAD, time and decision status | — | C001-REQ-118 |
| `getSession` | snapshot ID | session info: provider status, notices, moved-on notice, revision, jobs | — | C001-REQ-807, C001-REQ-817 |
| `checkMovedOn` | snapshot ID | moved-on notice or none | — | C001-REQ-117 |
| `getIntakeSummary` | snapshot ID | intake summary | — | C001-REQ-114 |
| `getArchitectureDelta` | snapshot ID | architecture delta with component shares and the unmet-intent entry | — | C001-REQ-201 to C001-REQ-221 |
| `getComponent` | snapshot ID, component ID | intents with a hunk in it, its open hunks | ERR-ACT-004 | C001-REQ-220 |
| `getIntentMap` | snapshot ID | orphan code, unmet intents, intents in display order with shares and verdict status | — | C001-REQ-310, C001-REQ-312, C001-REQ-318 |
| `getIntent` / `getWalkthrough` | snapshot ID, intent ID | hunks in intent order with evidence, accounts, test judgement, bundle | ERR-ACT-004 | C001-REQ-318, C001-REQ-322 to C001-REQ-325 |
| `getEvidenceBundle` | snapshot ID, intent ID | commands, runs and differences from reference runs | ERR-ACT-004 | C001-REQ-510, C001-REQ-513 |
| `getHunk` | snapshot ID, hunk ID | lines, file context, intent, component, risk signals, evidence, move partner, labels | ERR-ACT-004 | C001-REQ-909 to C001-REQ-911 |
| `getFileContent` | snapshot ID, path, side (base or snapshot) | whole file content from the snapshot or the base commit | ERR-ACT-004 | C001-REQ-116, C001-REQ-909 |
| `getReadingQueue` | snapshot ID | reading queue with budget fit and remainder | — | C001-REQ-610 to C001-REQ-612 |
| `getCoverageStatement` | snapshot ID | coverage statement | — | C001-REQ-613, C001-REQ-614 |
| `getDecisionStatus` | snapshot ID | counts and per-intent verdict status with stale causes | — | C001-REQ-711, C001-REQ-718 |
| `getRecord` | snapshot ID | review record entries | ERR-STORE-002 | C001-REQ-714 |
| `exportResults` | snapshot ID, directory | the files of C001-IF-001 §Output | ERR-CLI-002 | C001-REQ-912 |
| `validateConfiguration` | file path | validation result and ignored settings | ERR-CFG-003 | C001-REQ-425, C001-REQ-427 |

## §4 Write operations
**Recorded actions.** The ten kinds of recorded action are listed below in the order of
C001-REQ-721; this list is the reference for C001-REQ-721, ERR-ACT-006, C001-IF-012 G-10,
C001-IF-009 and `40-domain/` (C001-INV-10). Every operation of a recorded action writes the entries
named and can also return ERR-ACT-006 (git identity not set, C001-REQ-721), ERR-STORE-001 and
ERR-STORE-003; the Errors column lists the other codes. `runEvidenceBundle` and `cancelJob` (§3)
write no entry and are no recorded action; like every request of the local review UI, they pass
its origin check (C001-REQ-907).

| # | Recorded action | Operation | Input | Record entries (C001-IF-009) | Errors | Requirements |
|---|---|---|---|---|---|---|
| 1 | read mark | `markRead` | hunk IDs | `read-mark` | ERR-ACT-004 | C001-REQ-601 |
| 1 | read mark | `markIntentRead` | intent ID: all its open hunks | `read-mark` with the intent ID | ERR-ACT-004 | C001-REQ-601 |
| 2 | hunk reopen | `reopenHunk` | hunk ID | `hunk-reopen` | ERR-ACT-004 | C001-REQ-422 |
| 3 | hunk move | `moveHunk` | hunk ID, target intent ID or orphan code | `hunk-move` | ERR-ACT-004 | C001-REQ-320, C001-REQ-321, C001-REQ-722 |
| 4 | intent creation | `createIntent` | name, hunk IDs of orphan code | `intent-created` | ERR-ACT-001, ERR-ACT-004, ERR-ACT-005, ERR-ACT-009 | C001-REQ-709, C001-REQ-719, C001-REQ-720, C001-REQ-722 |
| 5 | orphan-hunk rejection | `rejectOrphanHunk` | hunk ID, reason | `orphan-rejection` | ERR-ACT-001, ERR-ACT-004, ERR-ACT-005 | C001-REQ-710, C001-REQ-720 |
| 6 | test judgement | `setTestJudgement` | intent ID, expresses or does-not-express | `test-judgement` | ERR-ACT-004, ERR-ACT-007 | C001-REQ-503, C001-REQ-520 |
| 7 | defect report | `reportDefect` | hunk ID, text | `defect-report` naming the rules that had cleared the hunk, possibly none; then `escalation` when it names at least one rule, both saved before the action is confirmed | ERR-ACT-001, ERR-ACT-004 | C001-REQ-606, C001-REQ-607, C001-REQ-617 |
| 8 | attention budget | `setAttentionBudget` | minutes, reading rate (optional) | `attention-budget` | ERR-ACT-008 | C001-REQ-610, C001-REQ-611, C001-REQ-615 |
| 9 | bundle command added or confirmed | `addBundleCommand` | intent ID, command text | `bundle-command-added` | ERR-ACT-001, ERR-ACT-004 | C001-REQ-510 |
| 9 | bundle command added or confirmed | `confirmBundleCommand` | intent ID, command ID | `bundle-command-confirmed` | ERR-ACT-004 | C001-REQ-511 |
| 10 | verdict | `giveVerdict` | intent ID (exactly one), sign, reject or defer, text, open-hunk confirmation (number of open hunks and changed lines as shown) | `verdict` | ERR-ACT-001 to ERR-ACT-004 | C001-REQ-701 to C001-REQ-708, C001-REQ-712, C001-REQ-721 |
| — | none | `runEvidenceBundle` | intent ID | none; a job whose runs are analysis results | ERR-ACT-004, ERR-EVID-007 | C001-REQ-512, C001-REQ-513 |

**Check order.** Every write operation checks in this order and returns the first failing code;
a refused operation writes no entry and changes no state:

1. the IDs it names (ERR-ACT-003, ERR-ACT-004);
2. its input values: empty texts and names (ERR-ACT-001), time budget and reading rate
   (ERR-ACT-008, both values checked before either applies);
3. the state of the review: hunks grouped under an intent (ERR-ACT-005, the first such hunk
   named), an intent without test hunks (ERR-ACT-007), a developer-named intent of the same
   normalised name (ERR-ACT-009, `40-domain/domain-model.md` §3);
4. the git identity, read through C001-IF-012 G-10 for every operation of this table except
   `runEvidenceBundle` (ERR-ACT-006, C001-REQ-721);
5. for `giveVerdict` with sign only, the open-hunk confirmation (ERR-ACT-002);
6. the save (ERR-STORE-001, ERR-STORE-003).

The identity check comes after the checks of the developer's input, so that the message names
every fault the developer can fix in the action itself, and before the confirmation, so that the
developer is never asked to confirm an action that cannot be recorded. With sign on an intent with
open hunks, `giveVerdict` succeeds only when the confirmation equals the current number of open
hunks and their changed lines; otherwise it returns ERR-ACT-002 with both numbers, which the
surface shows as the prompt (C001-REQ-703). The orchestrator (C001-COMP-002) performs step 4 for
every operation, so that no component writes an entry without the git user (C001-INV-10).
