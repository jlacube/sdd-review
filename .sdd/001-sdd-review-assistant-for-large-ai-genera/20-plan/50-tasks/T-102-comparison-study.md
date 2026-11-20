---
id: C001-T-102
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Comparison study — rating and analysis against a standard diff review
milestone: C001-M-07
status: todo
depends_on: [C001-T-116]
implements: []
satisfies_ac: [C001-AC-610.1, C001-AC-301.1]
verified_by: [C001-TC-007, C001-TS-629, C001-TS-301]
components: [C001-COMP-019, C001-COMP-001]
risk_refs: [C001-RISK-015]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-102 — Comparison study: rating and analysis against a standard diff review

## Intent
Close the G-8 comparison protocol of `10-spec/30-nfr/nfr.md` §3, as made executable in
`60-test-plan.md` §6 items 9 and 10, and produce the evidence of C001-DOD-016 to C001-DOD-018:
after the last session the seeder opens the sealed lists, two raters match the 16 session forms
independently and then settle disagreements, and the analysis reports the C001-NFR-006 ratio and
the C001-NFR-007 difference. Preparation and sessions are C001-T-109 to C001-T-116. Effort: each
rater about 2 days in parallel (16 forms of up to 10,000-line changes), plus the analysis run;
calendar about 1 week (`10-strategy.md` §5). The study implements no requirement; `satisfies_ac`
names the criteria whose value it measures (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `study/g8/record/rating/` | each rater's sheet per session form, the settled sheet, the findings outside the lists |
| add | `study/g8/RESULTS.md` | output of `npm run study -- g8-analyse`: mean review time ratio, mean found-share difference, per change, agreement before discussion, the design items of C001-DOD-018 |

## Preconditions
- C001-T-116 done: all 16 sessions recorded; the seeder has been told that the last session ended.
- The two raters are appointed and are neither the seeder nor the moderator.

## Step outline
1. The seeder decrypts the sealed lists and hands them to the raters.
2. Each rater matches every session form to the lists alone; findings outside the lists are logged
   and not counted.
3. The raters settle disagreements by discussion; agreement before discussion is recorded.
4. Run `npm run study -- g8-analyse`; report against C001-NFR-006 and C001-NFR-007. A miss is
   reported with `sdd defect add --ref <NFR-ID> --summary "…"` with the per-change results; no
   threshold is changed (C001-RISK-015).

## Verification
- `npm run study -- g8-check-record --rows 1,2,3,4,5,6,7,8`
- `npm run study -- g8-analyse`

## Done when
- [ ] `study/g8/RESULTS.md` shows the design items of C001-DOD-018 and the agreement before
      discussion.
- [ ] Ratio ≤ 0.50 and found-share difference ≥ 0 points, or a defect is recorded for P-01.
