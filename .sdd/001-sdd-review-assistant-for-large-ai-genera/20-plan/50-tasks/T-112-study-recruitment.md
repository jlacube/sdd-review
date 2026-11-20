---
id: C001-T-112
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Comparison study — recruitment, consent and assignment draw
milestone: C001-M-07
status: todo
depends_on: [C001-T-109]
implements: []
satisfies_ac: [C001-AC-610.1, C001-AC-301.1]
verified_by: [C001-TC-007]
components: [C001-COMP-019, C001-COMP-001]
risk_refs: [C001-RISK-015]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-112 — Comparison study: recruitment, consent and assignment draw

## Intent
The moderator recruits 8 developers and 2 reserves who use coding agents, have not worked on the review assistant
and have not seen the changes (`60-test-plan.md` §6 item 4), collects the signed consent forms,
schedules the sessions and draws the participant rows with the seeded draw. The estimate is the
moderator's effort; the calendar time is about 6 weeks, set in `10-strategy.md` §5 (study
calendar). `satisfies_ac` names the criteria whose value the study measures (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `study/g8/record/assignment.json` | seed, participant row per pseudonym, session dates |
| add | moderator's private participant list (outside the repository) | names, contacts, signed consent forms, mapping to pseudonyms |

## Preconditions
- C001-T-109 done (consent form, `g8-assign`).
- Started at S − 6 weeks, S being the planned first session day of C001-T-113 (`60-test-plan.md` §6
  item 11); the conductor sets S from the study calendar of `10-strategy.md` §5 and re-plans it when
  the critical path moves.

## Step outline
1. Announce the study and screen candidates against the criteria of `60-test-plan.md` §6 item 4.
2. Collect signed consent forms; keep them outside the repository.
3. Schedule each participant's two sessions on different days inside the session window of the
   study calendar.
4. Run `npm run study -- g8-assign --seed <seed>`; record seed and result.
5. At S − 2 weeks, check the number of confirmed participants; fewer than 8 fires the trigger of
   C001-RISK-015, S moves by the weeks recruitment needs, and no session starts with fewer than 8.

## Verification
- `npm run study -- g8-assign --seed <seed> --dry-run` (the recorded draw is reproduced from the seed)

## Done when
- [ ] 8 participants confirmed with signed consent at S − 2 weeks.
- [ ] `study/g8/record/assignment.json` holds the seeded draw and the session dates.
