---
id: C001-T-025
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Default base commit and refusals of unusable bases
milestone: C001-M-02
status: todo
depends_on: [C001-T-008]
implements: [C001-REQ-103, C001-REQ-104, C001-REQ-105, C001-REQ-106]
satisfies_ac: [C001-AC-103.1, C001-AC-104.1, C001-AC-105.1, C001-AC-106.1]
verified_by: [C001-TS-106, C001-TS-107, C001-TS-108, C001-TS-109, C001-TS-157, C001-TS-159, C001-TS-111, C001-TS-112, C001-TS-113, C001-TS-114]
components: [C001-COMP-004, C001-COMP-003]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-025 — Default base commit and refusals of unusable bases

## Intent
Choose the base commit when none is named, by the rules of C001-IF-012 §4: merge base with the
upstream branch; else with the default branch of the remote or a local `main` or `master`; else
HEAD. Refuse an unknown base commit and a directory without git history with their error codes.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intake/base.ts › choose base commit` | rule order of C001-IF-012 §4, the rule and branch that chose it kept for the intake summary |
| add | `src/core/intake/base.ts › refusals` | unknown base commit, no git history (codes of `errors.md`) |
| add | `test/unit/intake/base.test.ts` | each rule and refusal on `fx-default` variants |

## Preconditions
- C001-T-008 done.

## Step outline
1. Implement the rule order with the git operations of C001-T-006.
2. Keep the chosen rule and branch in the intake document for C001-T-033.
3. Implement both refusals; they change nothing (architecture §6, Error handling).

## Verification
- `npm test -- test/unit/intake/base.test.ts`
- `npm run acceptance -- --scenario C001-TS-106 --scenario C001-TS-107 --scenario C001-TS-108 --scenario C001-TS-109 --scenario C001-TS-157 --scenario C001-TS-159`
- `npm run acceptance -- --scenario C001-TS-111 --scenario C001-TS-112 --scenario C001-TS-113 --scenario C001-TS-114`

## Done when
- [ ] All listed scenarios pass on the three CI operating systems.
