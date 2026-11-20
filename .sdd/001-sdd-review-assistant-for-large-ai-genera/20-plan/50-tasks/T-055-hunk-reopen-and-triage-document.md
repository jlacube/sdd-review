---
id: C001-T-055
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Hunk review states, developer reopen and the triage document
milestone: C001-M-03
status: todo
depends_on: [C001-T-053, C001-T-051, C001-T-054]
implements: [C001-REQ-422, C001-NFR-015]
satisfies_ac: [C001-AC-422.1]
verified_by: [C001-TS-467, C001-TS-468]
components: [C001-COMP-010, C001-COMP-002]
risk_refs: []
estimate: S
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-055 — Hunk review states, developer reopen and the triage document

## Intent
Implement the hunk review-state machine of `40-domain/state-machines.md`, let the developer reopen
a cleared hunk for reading as a recorded action, and publish the triage document of C001-IF-008
(guarded areas, risk, clearings, evidence records, hunk states, test classification, walkthrough
order) as a revision after the intent map.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/triage/hunk-state.ts › hunk review state` | transitions of the state machine; illegal transitions refused |
| modify | `src/core/api/index.ts › reopenHunk` | recorded action: checks, identity, append, apply |
| add | `src/core/triage/document.ts › triage document` | C001-IF-008 schema, deterministic order |
| modify | `src/core/orchestrator/pipeline.ts › triage stage` | published after the intent map |

## Preconditions
- C001-T-053, C001-T-051 and C001-T-054 done.

## Step outline
1. Encode the state machine and test every transition.
2. Implement the reopen action as a recorded action.
3. Assemble and publish the triage document; run the reproducibility check.

## Verification
- `npm test -- test/unit/triage`
- `npm run acceptance -- --scenario C001-TS-467 --scenario C001-TS-468`
- `npm run bench -- reproducibility --document triage`

## Done when
- [ ] Every transition of the hunk state machine has a test.
- [ ] The triage document validates and is equal over 5 analyses of each benchmark change.
