---
id: C001-T-049
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Built-in guarded areas — security, data migration, dependency and build
milestone: C001-M-03
status: todo
depends_on: [C001-T-035, C001-T-036]
implements: [C001-REQ-413, C001-REQ-414, C001-REQ-415, C001-REQ-416, C001-REQ-425]
satisfies_ac: [C001-AC-413.1, C001-AC-414.1, C001-AC-415.1, C001-AC-416.1, C001-AC-425.1]
verified_by: [C001-TS-445, C001-TS-446, C001-TS-447, C001-TS-448, C001-TS-449, C001-TS-450, C001-TS-451, C001-TS-452, C001-TS-453, C001-TS-474]
components: [C001-COMP-010]
risk_refs: [C001-RISK-011]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-049 — Built-in guarded areas: security, data migration, dependency and build

## Intent
Place hunks in the built-in guarded areas of C001-IF-005 §2 to §6 — security and authentication
(term and library lists), data migration, dependency, build and configuration — record the matching
criterion, and enforce that no clearing rule ever clears a hunk in a guarded area. Settings that
would weaken a built-in area have been removed by the loader (C001-T-035).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/triage/guarded-areas.ts › match built-in areas` | pattern syntax of §1, lists of §3 to §6, matched criterion recorded |
| add | `src/core/triage/guard.ts › never-clear guard` | a single check every clearing rule passes through |
| add | `test/unit/triage/guarded-areas.test.ts` | each area, each list, imports of security libraries per ecosystem |

## Preconditions
- C001-T-035 and C001-T-036 done.

## Step outline
1. Encode the area matchers from the effective configuration's built-in policy.
2. Record for each match the area and criterion (GuardedAreaMatch).
3. Implement the guard and route every clearing rule through it (C001-T-052, C001-T-053, C001-T-061).

## Verification
- `npm test -- test/unit/triage`
- `npm run acceptance -- --scenario C001-TS-445 --scenario C001-TS-446 --scenario C001-TS-447 --scenario C001-TS-448 --scenario C001-TS-449`
- `npm run acceptance -- --scenario C001-TS-450 --scenario C001-TS-451 --scenario C001-TS-452 --scenario C001-TS-453 --scenario C001-TS-474`

## Done when
- [ ] All listed scenarios pass once C001-T-055 publishes the triage document.
- [ ] No code path clears a hunk without passing the guard (checked by a unit test over every rule).
