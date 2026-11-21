---
id: C001-T-107
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Calibration corpus — seed and label defects in changes 1 to 6
milestone: C001-M-07
status: done
depends_on: [C001-T-106]
implements: []
satisfies_ac: [C001-AC-401.1]
verified_by: [C001-TC-026]
components: [C001-COMP-010]
risk_refs: [C001-RISK-021]
estimate: L
report: { commit: 3ddcbbc, completed_at: 2026-11-21, notes: "56 seeded + 2 noticed defects in calib-cs-1..4, calib-py-1..2 (8-10 each, six kinds each) by appointed seeding agent; calibration --validate-corpus ok against git; CI green at 3ddcbbc; PR at M-01 merge" }
---
# C001-T-107 — Calibration corpus: seed and label defects in changes 1 to 6

## Intent
The calibration seeder (appointed by P-01; not the calibrator of C001-T-099) seeds at least 8
defects into each of the first 6 changes of the corpus, covering the six kinds of `30-nfr/nfr.md`
§3 item 3 in each change, and records each defect with file and lines, from which C001-T-099
derives the defective-hunk labels of C001-ADR-009 §4 item 1. About
20 minutes per defect including reading the surrounding code and writing its label: 48 defects or
more take about 2 days. `satisfies_ac` names the criterion whose weights the labels calibrate
(`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | commits on the corpus branches of changes 1 to 6 | one commit per change holding its seeded defects, on top of the agent's commits |
| modify | `bench/calibration/corpus.json › defects` | per seeded or noticed defect: file, lines, kind, description, origin (seeded or noticed); the seeder named |
| add | `bench/calibration/ › corpus validation` | `npm run bench -- calibration --validate-corpus`: each listed change has at least 8 seeded defects covering the six kinds, with file and lines that exist in the change |

## Preconditions
- C001-T-106 done.
- The calibration seeder is appointed and is not the person who runs C001-T-099.

## Step outline
1. Per change, choose spots for at least 8 defects, at least one of each of the six kinds; seed each
   as a small, plausible edit.
2. Record each seeded defect with origin `seeded` and, with origin `noticed`, every unseeded defect
   already in the agent's commits that the seeder notices while reading the change to seed it (the
   defects found when reviewing them of C001-ADR-009 §4 item 1: no separate full review is made,
   zero noticed defects is valid, and the change is read in a plain diff or editor, not in the
   review assistant).
3. Run the corpus validation. The defective hunks are derived from the recorded lines by
   C001-T-099 with the fixed diff of the release.

## Verification
- `npm run bench -- calibration --check-overlap`
- `npm run bench -- calibration --validate-corpus`

## Done when
- [ ] Changes 1 to 6 each hold at least 8 seeded defects covering the six kinds, each recorded with
      file and lines.
- [ ] The seeder is named in the corpus and is not the calibrator.
