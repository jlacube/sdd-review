---
id: C001-T-077
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Orphan-hunk rejection and decisions through a later intent
milestone: C001-M-05
status: todo
depends_on: [C001-T-076, C001-T-047]
implements: [C001-REQ-710, C001-REQ-720, C001-REQ-722]
satisfies_ac: [C001-AC-710.1, C001-AC-720.1, C001-AC-722.1]
verified_by: [C001-TS-729, C001-TS-756, C001-TS-757, C001-TS-766, C001-TS-767, C001-TS-768]
components: [C001-COMP-013]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-077 — Orphan-hunk rejection and decisions through a later intent

## Intent
Let the developer reject a hunk of orphan code with a reason (an orphan-rejection entry), refuse
orphan-code decisions on a hunk that is grouped under an intent, and count a rejected orphan hunk
that was later grouped through its intent's verdict in the decision status.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/verdicts/orphan-rejection.ts › reject orphan hunk` | entry content, refusal for grouped hunks |
| add | `src/core/verdicts/orphan-resolution.ts › later-grouped rejected hunks` | resolves through the intent's verdict; used by the decision status of C001-T-078 |
| modify | `src/core/api/index.ts › rejectOrphanHunk` | recorded action |

## Preconditions
- C001-T-076 and C001-T-047 done.

## Step outline
1. Implement the rejection with its validation.
2. Refuse decisions on grouped hunks with the code of `errors.md`.
3. Resolve later-grouped hunks through the intent's verdict.

## Verification
- `npm test -- test/unit/verdicts`
- `npm run acceptance -- --scenario C001-TS-729 --scenario C001-TS-756 --scenario C001-TS-757 --scenario C001-TS-766 --scenario C001-TS-767 --scenario C001-TS-768`

## Done when
- [ ] The listed scenarios pass.
