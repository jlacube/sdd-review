---
id: C001-T-108
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Calibration corpus — seed and label defects in changes 7 to 12
milestone: C001-M-07
status: todo
depends_on: [C001-T-107]
implements: []
satisfies_ac: [C001-AC-401.1]
verified_by: [C001-TC-026]
components: [C001-COMP-010]
risk_refs: [C001-RISK-021]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-108 — Calibration corpus: seed and label defects in changes 7 to 12

## Intent
Second half of the seeding of C001-T-107, by the same calibration seeder and with the same rules:
at least 8 defects in each of changes 7 to 12 (and in any change beyond 12), covering the six kinds
of `30-nfr/nfr.md` §3 item 3 in each change. Chained after C001-T-107 because one seeder does both.
After this task the corpus is complete for C001-T-099. `satisfies_ac` names the criterion whose
weights the labels calibrate (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | commits on the corpus branches of changes 7 to 12 | one commit per change holding its seeded defects, on top of the agent's commits |
| modify | `bench/calibration/corpus.json › defects` | per seeded or noticed defect: file, lines, kind, description, origin; the seeder named |

## Preconditions
- C001-T-107 done (validation command exists; first six changes seeded).

## Step outline
1. Seed at least 8 defects per change as in C001-T-107 steps 1 and 2.
2. Run the corpus validation over all changes.
3. Tell the owner of C001-T-099 that the corpus is complete.

## Verification
- `npm run bench -- calibration --check-overlap`
- `npm run bench -- calibration --validate-corpus`

## Done when
- [ ] Every change of the corpus (at least 12) holds at least 8 seeded defects covering the six
      kinds, each recorded with file and lines.
- [ ] The corpus validation and the overlap check pass over the whole corpus.
