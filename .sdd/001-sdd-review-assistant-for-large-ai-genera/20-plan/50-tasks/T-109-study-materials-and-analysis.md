---
id: C001-T-109
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Comparison study — materials, record layout, assignment and analysis commands
milestone: C001-M-07
status: in-progress
depends_on: [C001-T-002]
implements: []
satisfies_ac: [C001-AC-610.1, C001-AC-301.1]
verified_by: [C001-TC-007]
components: [C001-COMP-019, C001-COMP-001]
risk_refs: [C001-RISK-015]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-109 — Comparison study: materials, record layout, assignment and analysis commands

## Intent
Prepare everything the G-8 study of `10-spec/30-nfr/nfr.md` §3 needs before its changes exist,
following the protocol of `60-test-plan.md` §6 (linked, not copied): the forms, the pseudonymised
record layout, the seeded assignment draw and the analysis command. First of the study tasks
(C001-T-109 to C001-T-116, C001-T-102), which split the former single study task by role and
session block (`10-strategy.md` §5, study calendar). The study tasks implement no requirement;
`satisfies_ac` names the criteria whose value the study measures (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `study/g8/README.md` | the study's file map and roles, linking `60-test-plan.md` §6 for the protocol |
| add | `study/g8/forms/` | consent form, session form (decisions per change and per requested behaviour, defects found), moderator session log, rating sheet |
| add | `study/g8/record/` | record layout: one folder per pseudonymous participant row; no name or contact detail in the repository |
| add | `scripts/study/ › g8-assign, g8-check-record, g8-analyse` | `npm run study -- g8-assign --seed <seed>` draws the participant rows of `60-test-plan.md` §6 item 5 and records seed and result; `npm run study -- g8-check-record --rows <list>` checks that every session of the rows has a log, a form, the release-candidate version and a time; `npm run study -- g8-analyse` computes per method the mean review time and mean found share over all sessions and per change, the C001-NFR-006 ratio, the C001-NFR-007 difference and the raters' agreement before discussion, into `study/g8/RESULTS.md` |
| add | `test/unit/study/` | analysis on synthetic records: capped sessions counted at the cap, breaks subtracted, findings outside the sealed list not counted |

## Preconditions
- C001-T-002 done (licences of any analysis dependency confirmed).
- P-01 has appointed the moderator, the study seeder and the two raters (`60-test-plan.md` §6 item 1).

## Step outline
1. Write the forms from the items of `60-test-plan.md` §6; have the moderator check them.
2. Lay out the record so each session's log, form and rating sheets sit in the participant row's
   folder; personal data (names, contact, signed consent) stays with the moderator outside the
   repository.
3. Implement `g8-assign` and `g8-analyse` with unit tests on synthetic records.

## Verification
- `npm test -- test/unit/study`
- `npm run study -- g8-analyse --input test/fixtures/study/synthetic-record`

## Done when
- [ ] Forms and record layout exist and the moderator has checked them.
- [ ] `g8-analyse` reproduces the expected numbers on the synthetic record, capped and paused
      sessions included.
