# Rating sheet: procedure for the two raters

This is the procedure for `60-test-plan.md` §6 item 9 (task C001-T-102). The raters are appointed
by P-01 and are neither the moderator nor the study seeder. Each rater matches every one of the 16
counted session forms to the opened sealed list of its change.

## Order

1. The last session has ended and `npm run study -- g8-check-record --rows 1,2,3,4,5,6,7,8`
   passes.
2. The study seeder runs `npm run study -- g8-unseal --change <A-D> --out <path>` for each
   change and gives the opened lists to both raters. The lists stay outside the repository.
   `rating/seeded.json` records the defect IDs, the kinds and the time each list was opened.
3. **Each rater works alone.** Rater 1 writes `record/rating/rater-1/<session>.json` and rater 2
   writes `record/rating/rater-2/<session>.json`, without seeing or discussing the other's
   sheets. Neither rater commits a sheet until both have finished all 16 sessions. Each sheet's
   `completedAt` is the time it was finished.
4. The raters then compare their sheets, settle each disagreement by discussion, and write the
   settled sheet `record/rating/settled/<session>.json`. Its `completedAt` comes after both rater
   sheets.
5. The owner of C001-T-102 runs `npm run study -- g8-analyse`. It reports agreement before
   discussion from the two rater sheets and counts from the settled sheets.

The file name of a sheet is the session ID with the slash replaced: session `row-3/P09-s1` has
the sheet `row-3-P09-s1.json`. The format is `rating-sheet.template.json`.

## Matching rules

- Each finding of the form (`F1`, `F2`, …) gets exactly one label: the ID of the seeded defect it
  describes (for example `A-03`), or `outside` when it describes none of them.
- Every finding of the form gets a label, and the sheet labels no finding that is not in the form.
- Several findings may name the same seeded defect. The defect then counts once.
- A finding outside the list is logged and does not count, whether it is a real defect or not.
  Use `note` for anything worth reporting.
- When a finding is a match: {{PLACEHOLDER: the two raters fix the matching criterion together
  before the lists are opened and record it here. A proposed default: the finding names the
  problem of the seeded defect, meaning what is wrong, in the file of the defect or in a place
  where the defect shows. A wrong or missing line number does not prevent a match. A finding that
  only says "this area looks suspicious" is no match.}}
- A finding that clearly describes two seeded defects: {{PLACEHOLDER: the raters decide before
  rating whether such a finding gets the defect that is described first (default) or is raised
  with the owner of C001-T-102. The label is one ID per finding, so the second defect is noted in
  `note`.}}

## Sheet fields

| Field         | Content                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| `session`     | the session ID, for example `row-3/P09-s1`                                                    |
| `change`      | A, B, C or D                                                                                  |
| `rater`       | `rater-1`, `rater-2` or `settled`                                                             |
| `completedAt` | ISO 8601 time with offset, when the sheet was finished                                        |
| `matches`     | one `{ "finding": "F1", "defect": "A-03" or "outside", "note": "…" }` per finding of the form |
