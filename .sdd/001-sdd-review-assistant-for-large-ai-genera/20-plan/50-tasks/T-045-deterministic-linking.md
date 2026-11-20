---
id: C001-T-045
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Intent mapper — deterministic links, orphan code and unmet intents
milestone: C001-M-03
status: todo
depends_on: [C001-T-044, C001-T-037]
implements: [C001-REQ-301, C001-REQ-306, C001-REQ-307, C001-REQ-309, C001-REQ-311, C001-REQ-319, C001-NFR-015]
satisfies_ac: [C001-AC-301.1, C001-AC-306.1, C001-AC-307.1, C001-AC-309.1, C001-AC-311.1, C001-AC-319.1]
verified_by: [C001-TS-301, C001-TS-302, C001-TS-310, C001-TS-312, C001-TS-313, C001-TS-314, C001-TS-315, C001-TS-316, C001-TS-320, C001-TS-322, C001-TS-323, C001-TS-324, C001-TS-339]
components: [C001-COMP-009, C001-COMP-002]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-045 — Intent mapper: deterministic links, orphan code and unmet intents

## Intent
Link each hunk to an intent by its strongest deterministic link signal (the link-signal table of
`CAP-03-intent-map/requirements.md`), show alternatives when signals tie, group unlinked hunks as
orphan code, list unmet intents, record confidence and reason of every link, and keep every hunk in
exactly one group. Publish the intent-map document of C001-IF-008 as a revision.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intent-map/signals.ts › link signals` | each signal of the table, from mentions (C001-T-032), symbols (C001-T-037), commits and paths |
| add | `src/core/intent-map/linking.ts › link hunks` | strongest signal, ordered tie-breaks, alternatives |
| add | `src/core/intent-map/orphans.ts › orphan code, unmet intents` | grouping invariant: each hunk once |
| add | `src/core/intent-map/document.ts › intent-map document` | C001-IF-008 schema; published by the orchestrator |
| add | `test/unit/intent-map/linking.test.ts` | each signal, ties, orphans, unmet, determinism |

## Preconditions
- C001-T-044 and C001-T-037 done.

## Step outline
1. Implement each signal of the table with its strength.
2. Link each hunk by the strongest signal; record confidence and reason; keep tied alternatives.
3. Group the rest as orphan code; list intents with no hunk as unmet.
4. Publish the document after the architecture delta; check reproducibility.

## Verification
- `npm test -- test/unit/intent-map`
- `npm run acceptance -- --scenario C001-TS-301 --scenario C001-TS-302 --scenario C001-TS-310 --scenario C001-TS-312 --scenario C001-TS-313`
- `npm run acceptance -- --scenario C001-TS-314 --scenario C001-TS-315 --scenario C001-TS-316 --scenario C001-TS-320`
- `npm run acceptance -- --scenario C001-TS-322 --scenario C001-TS-323 --scenario C001-TS-324 --scenario C001-TS-339`
- `npm run bench -- reproducibility --document intent-map`

## Done when
- [ ] Every hunk of every fixture belongs to exactly one group.
- [ ] All listed scenarios pass.
