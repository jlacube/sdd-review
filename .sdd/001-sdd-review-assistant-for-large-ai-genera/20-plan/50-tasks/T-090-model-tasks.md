---
id: C001-T-090
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Model tasks — extracted intents, model links, design critique and accounts
milestone: C001-M-06
status: todo
depends_on: [C001-T-089, C001-T-045, C001-T-046, C001-T-041]
implements: [C001-REQ-308, C001-REQ-315, C001-REQ-325, C001-REQ-327, C001-REQ-216, C001-REQ-812, C001-NFR-002]
satisfies_ac: [C001-AC-308.1, C001-AC-315.1, C001-AC-325.1, C001-AC-327.1, C001-AC-216.1, C001-AC-812.1]
verified_by: [C001-TS-317, C001-TS-318, C001-TS-319, C001-TS-332, C001-TS-333, C001-TS-351, C001-TS-352, C001-TS-356, C001-TS-357, C001-TS-358, C001-TS-237, C001-TS-832, C001-TS-834]
components: [C001-COMP-009, C001-COMP-008, C001-COMP-002]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-090 — Model tasks: extracted intents, model links, design critique and accounts

## Intent
Run the model tasks of C001-IF-010 §2 as background jobs after the static stage: extract intents,
link the hunks that no deterministic signal linked (dropping a link to an intent the map does not
hold), add the design critique after the deterministic findings, and add a model-written account
after the deterministic one; each result recorded as a new revision with deterministic results
always shown first.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intent-map/model-intents.ts › extract intents` | through the gateway; marked output |
| add | `src/core/intent-map/model-links.ts › model links` | only unlinked hunks; unknown intents dropped |
| add | `src/core/architecture/critique.ts › design critique` | after deterministic findings |
| add | `src/core/intent-map/model-accounts.ts › model-written account` | after the deterministic account |
| modify | `src/core/orchestrator/jobs.ts › model jobs` | scheduled after the static stage (C001-CON-19) |

## Preconditions
- C001-T-089, C001-T-045, C001-T-046 and C001-T-041 done.

## Step outline
1. Implement each task's request from the snapshot and intent context, excluded paths removed.
2. Validate and apply results; drop links to intents the map does not hold.
3. Order every list so deterministic items come before model items.
4. Record each result as a revision; measure C001-NFR-002 with `stub-llm` latency profiles.

## Verification
- `npm test -- test/unit/intent-map`
- `npm run acceptance -- --scenario C001-TS-317 --scenario C001-TS-318 --scenario C001-TS-319 --scenario C001-TS-332 --scenario C001-TS-333`
- `npm run acceptance -- --scenario C001-TS-351 --scenario C001-TS-352 --scenario C001-TS-356 --scenario C001-TS-357 --scenario C001-TS-358`
- `npm run acceptance -- --scenario C001-TS-237 --scenario C001-TS-832 --scenario C001-TS-834`

## Done when
- [ ] The listed scenarios pass against `stub-llm`.
- [ ] Deterministic results come first in every list that holds model output.
