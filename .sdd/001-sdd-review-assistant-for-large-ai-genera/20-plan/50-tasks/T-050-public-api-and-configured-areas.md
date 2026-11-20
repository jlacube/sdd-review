---
id: C001-T-050
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Public API area, configured guarded areas and disabled rules
milestone: C001-M-03
status: todo
depends_on: [C001-T-049, C001-T-038]
implements: [C001-REQ-417, C001-REQ-423, C001-REQ-424]
satisfies_ac: [C001-AC-417.1, C001-AC-423.1, C001-AC-424.1]
verified_by: [C001-TS-454, C001-TS-455, C001-TS-456, C001-TS-469, C001-TS-470, C001-TS-471, C001-TS-472, C001-TS-473]
components: [C001-COMP-010, C001-COMP-006]
risk_refs: [C001-RISK-011]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-050 — Public API area, configured guarded areas and disabled rules

## Intent
Recognise the public API area exactly as C001-REQ-417 and C001-IF-005 §7 state (API description
files, public API symbols, declaration heads, matching hunks, criterion recorded), add the guarded
areas the review configuration declares, and apply the clearing rules the configuration disables.

## Targets
| Kind | Target | Change |
|---|---|---|
| modify | `src/core/triage/guarded-areas.ts › public API area` | §7.1 to §7.4, using C001-T-038 |
| modify | `src/core/triage/guarded-areas.ts › configured areas` | patterns from the effective configuration |
| add | `src/core/triage/rule-switches.ts › disabled rules` | rules switched off by the configuration |
| add | `test/unit/triage/public-api.test.ts` | per ecosystem, declaration head edits, API description files |

## Preconditions
- C001-T-049 and C001-T-038 done.

## Step outline
1. Implement public API matching per §7.3 and record the criterion per §7.4.
2. Add configured areas to the matcher.
3. Apply disabled rules before any clearing runs.

## Verification
- `npm test -- test/unit/triage`
- `npm run acceptance -- --scenario C001-TS-454 --scenario C001-TS-455 --scenario C001-TS-456`
- `npm run acceptance -- --scenario C001-TS-469 --scenario C001-TS-470 --scenario C001-TS-471 --scenario C001-TS-472 --scenario C001-TS-473`

## Done when
- [ ] All listed scenarios pass once C001-T-055 publishes the triage document.
