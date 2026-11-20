---
id: C001-T-076
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Sign, reject and defer verdicts with basis and git identity
milestone: C001-M-05
status: todo
depends_on: [C001-T-074]
implements: [C001-REQ-701, C001-REQ-702, C001-REQ-703, C001-REQ-704, C001-REQ-705, C001-REQ-706, C001-REQ-712, C001-REQ-721]
satisfies_ac: [C001-AC-701.1, C001-AC-702.1, C001-AC-703.1, C001-AC-704.1, C001-AC-705.1, C001-AC-706.1, C001-AC-712.1, C001-AC-721.1]
verified_by: [C001-TS-701, C001-TS-702, C001-TS-703, C001-TS-704, C001-TS-705, C001-TS-706, C001-TS-707, C001-TS-708, C001-TS-710, C001-TS-711, C001-TS-712, C001-TS-713, C001-TS-714, C001-TS-715, C001-TS-716, C001-TS-717, C001-TS-718, C001-TS-719, C001-TS-720, C001-TS-721, C001-TS-764, C001-TS-732, C001-TS-733, C001-TS-734, C001-TS-758, C001-TS-759, C001-TS-760, C001-TS-761, C001-TS-762, C001-TS-763, C001-TS-765]
components: [C001-COMP-013, C001-COMP-002]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-076 — Sign, reject and defer verdicts with basis and git identity

## Intent
Record a verdict only on the developer's action on one intent: sign (with the open-hunk
confirmation and its counts), reject with a reason, defer with a note (refusing a blank reason or
note), each entry carrying its basis, shares, coverage statement and git user (C001-REQ-712). Every
one of the ten recorded actions of C001-IF-003 §4 is refused while `user.name` or `user.email` is
not set (ERR-ACT-006); this task makes the check uniform across them.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/verdicts/verdicts.ts › build verdict entries` | sign, reject, defer; basis per C001-IF-009 |
| add | `src/core/verdicts/open-hunks.ts › open-hunk confirmation` | refusal with counts, confirmed sign with counts |
| modify | `src/core/orchestrator/identity.ts › identity for all recorded actions` | applied to all ten actions; read-only commands, bundle runs and headless analysis need none |
| modify | `src/core/api/index.ts › sign, reject, defer` | moved-on check, identity, append, confirm |
| add | `test/unit/verdicts/` | entry content, refusals, identity matrix over the ten actions |

## Preconditions
- C001-T-074 done (coverage statement for the basis).

## Step outline
1. Implement the three verdicts with their validations and refusal codes.
2. Implement the open-hunk confirmation flow (architecture §3, Signing flow).
3. Apply the identity check to all ten recorded actions and test the matrix.
4. Write entries with the content of C001-REQ-712.

## Verification
- `npm test -- test/unit/verdicts`
- `npm run acceptance -- --scenario C001-TS-701 --scenario C001-TS-702 --scenario C001-TS-703 --scenario C001-TS-704 --scenario C001-TS-705 --scenario C001-TS-706 --scenario C001-TS-707`
- `npm run acceptance -- --scenario C001-TS-708 --scenario C001-TS-710 --scenario C001-TS-711 --scenario C001-TS-712 --scenario C001-TS-713 --scenario C001-TS-714 --scenario C001-TS-715 --scenario C001-TS-716`
- `npm run acceptance -- --scenario C001-TS-717 --scenario C001-TS-718 --scenario C001-TS-719 --scenario C001-TS-720 --scenario C001-TS-721 --scenario C001-TS-764 --scenario C001-TS-732 --scenario C001-TS-733 --scenario C001-TS-734`
- `npm run acceptance -- --scenario C001-TS-758 --scenario C001-TS-759 --scenario C001-TS-760 --scenario C001-TS-761 --scenario C001-TS-762 --scenario C001-TS-763 --scenario C001-TS-765`

## Done when
- [ ] No verdict is recorded without the developer's action on one intent.
- [ ] Each of the ten recorded actions is refused without a git identity.
- [ ] The listed scenarios pass (UI-only steps with C001-T-083).
