---
id: C001-T-113
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Comparison study — sessions of participant rows 1 and 2
milestone: C001-M-07
status: todo
depends_on: [C001-T-093, C001-T-100, C001-T-101, C001-T-105, C001-T-111, C001-T-112]
implements: []
satisfies_ac: [C001-AC-610.1, C001-AC-301.1]
verified_by: [C001-TC-007]
components: [C001-COMP-019, C001-COMP-001]
risk_refs: [C001-RISK-015]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-113 — Comparison study: sessions of participant rows 1 and 2

## Intent
The moderator runs the four sessions of participant rows 1 and 2 of `60-test-plan.md` §6 item 5
(changes A and B), each assistant session preceded by the 30-minute tutorial on the practice
change, with the protocol of `60-test-plan.md` §6 items 6 to 8 on the release candidate of
C001-T-105. Moderator effort per participant: up to 7.5 hours (two sessions capped at 3 hours, the
tutorial, set-up). The four session tasks C001-T-113 to C001-T-116 are chained because one
moderator runs them; their calendar is the session window of `10-strategy.md` §5. `satisfies_ac`
names the criteria whose value the study measures (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `study/g8/record/row-1/`, `study/g8/record/row-2/` | per session: moderator log (start, breaks, last decision), session form, release-candidate version, method, change label |

## Preconditions
- C001-T-105 done: the release candidate `1.0.0-rc.<n>` is published; C001-T-093 and C001-T-100
  passed on it, so no new release candidate is expected during the sessions.
- C001-T-101 done (tutorial script `study/g8/tutorial.md`); C001-T-111 done (seeded changes, sealed
  lists); C001-T-112 done (participants, assignment, dates).

## Step outline
1. Install `<package>@1.0.0-rc.<n>` (never `@next`) on the session machine of E-STUDY
   (`75-rollout.md` Communication).
2. Per session: tutorial before the assistant session; open the seeded change with the method of
   the row; log the time; collect the session form.
3. File the records under the participant row; never open a sealed list.

## Verification
- `npm run study -- g8-check-record --rows 1,2` (every session has a log, a form, the release-candidate version and a time)

## Done when
- [ ] The four sessions of rows 1 and 2 are recorded with time, form and release-candidate version.
- [ ] Every session of this block ran on the same release candidate.
