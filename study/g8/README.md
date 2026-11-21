# study/g8: G-8 comparison study

Materials, pseudonymised records and results of the comparison study that measures C001-NFR-006
(review time) and C001-NFR-007 (seeded defects found) against a standard diff review. The rule is
`10-spec/30-nfr/nfr.md` §3 of CHG-001. The protocol (who does what, in which order, with which
record) is `20-plan/60-test-plan.md` §6 in
`.sdd/001-sdd-review-assistant-for-large-ai-genera/`. This file does not repeat the protocol. It
maps the files and commands to the protocol items.

This folder is never shipped. package.json `files` lists only `dist/` and `runtime/`, and a unit
test checks that.

Placeholders that need a person's decision or identity are written `{{PLACEHOLDER: …}}`. List
them with `grep -rn "PLACEHOLDER" study/g8`.

## Roles (`60-test-plan.md` §6 item 1)

P-01 appoints the roles. Nobody holds two of them, and none of them is a participant. The study
seeder is not the calibration seeder of C001-T-107 and C001-T-108.

| Role                   | Person                                       | Tasks                                            |
| ---------------------- | -------------------------------------------- | ------------------------------------------------ |
| Moderator              | {{PLACEHOLDER: appointed by P-01}}           | C001-T-110, C001-T-112, C001-T-113 to C001-T-116 |
| Study seeder           | {{PLACEHOLDER: appointed by P-01}}           | C001-T-111, opens the sealed lists in C001-T-102 |
| Rater 1 (`rater-1`)    | {{PLACEHOLDER: appointed by P-01}}           | C001-T-102                                       |
| Rater 2 (`rater-2`)    | {{PLACEHOLDER: appointed by P-01}}           | C001-T-102                                       |
| Owner of the analysis  | {{PLACEHOLDER: owner of C001-T-102}}         | C001-T-102 (`g8-analyse`, `RESULTS.md`)          |
| Participants, reserves | in the repository by code only (`P01`…`P10`) | the sessions                                     |

## File map

| Path                               | What                                                                            | Written by                                   |
| ---------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| `forms/consent-form.md`            | consent form; the signed copies stay with the moderator, outside the repository | C001-T-109; used in C001-T-112               |
| `forms/session-form.md`            | session form: decisions per change and per requested behaviour, defects found   | C001-T-109; filled per session               |
| `forms/moderator-session-log.md`   | moderator's procedure and paper log per session; typed into `log.json`          | C001-T-109; used in C001-T-113 to C001-T-116 |
| `forms/rating-sheet.md`            | rating procedure and rules for the two raters                                   | C001-T-109; used in C001-T-102               |
| `forms/rating-sheet.template.json` | one rating sheet (per rater and per session)                                    | C001-T-109                                   |
| `forms/sealed-list.template.json`  | format of a plaintext sealed list; the filled list stays outside the repository | C001-T-109; used in C001-T-111               |
| `tutorial.md`                      | tutorial script on the practice change (§6 item 6)                              | C001-T-101                                   |
| `pool.json`                        | the change pool A to D and the practice change (§6 item 2)                      | C001-T-110                                   |
| `sealed/<A-D>.sealed.json`         | encrypted sealed lists, with the seeded HEAD in clear (§6 item 3)               | C001-T-111 (`g8-seal`)                       |
| `record/`                          | the pseudonymised record: layout below                                          | C001-T-112 to C001-T-116, C001-T-102         |
| `RESULTS.md`                       | the analysis (§6 item 10). Do not edit it by hand.                              | C001-T-102 (`g8-analyse`)                    |

## Record layout (`record/`)

```text
record/
  assignment.json                       seed, draw, reserves, replacements, planned dates (g8-assign)
  row-<n>/                              one folder per participant row of §6 item 5 (n = 1..8)
    <code>-s<k>/                        one folder per session: participant code, session 1 or 2
      log.json                          moderator log: change, method, release candidate, times, breaks, cap
      form.md                           the participant's session form
  rating/
    rater-1/row-<n>-<code>-s<k>.json    rater 1's sheet, made alone
    rater-2/row-<n>-<code>-s<k>.json    rater 2's sheet, made alone
    settled/row-<n>-<code>-s<k>.json    the sheet after discussion; the analysis counts this one
    seeded.json                         IDs and kinds of the opened sealed lists, and when they were opened (g8-unseal)
```

A dropped participant's sessions stay in their row folder under their own code. They are logged
and not counted (§6 item 4): the analysis counts only the participant `assignment.json` gives for
the row, which is the reserve once `g8-assign --replace-row` has recorded the replacement.

`log.json` fields: `participant`, `row`, `session`, `change` (A to D), `method` (`assistant` or
`diff`), `rcVersion` (`1.0.0-rc.<n>`), `tutorialDone` (true, false, or null for a diff session),
`opened` and `lastDecision` (ISO 8601 with offset, for example `2027-02-02T09:00:00+01:00`),
`breaks` (list of `{ "start", "end" }`), `capped` (true when the moderator stopped the session at
3 hours), `notes` (no personal data). `g8-new-session` writes the file with change and method
taken from the table.

The records are data. Prettier leaves them alone (`.prettierignore`), so the forms keep the
participants' own text.

## Confidentiality rules and how the tooling holds them

| Rule (protocol)                                                                                                                                          | Held by                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Participants appear by participant code only; names, contacts and signed consent forms stay with the moderator outside the repository (§6 intro, item 4) | `g8-assign` accepts only codes `P01`…`P99`. `g8-check-record` scans the whole record for e-mail addresses and phone numbers and reports them as errors. `.gitignore` excludes `study/g8/private/`.                                                                                                               |
| The sealed list stays sealed until every session has ended, and only the seeder holds the key (§6 item 3)                                                | `g8-seal` encrypts with AES-256-GCM under a scrypt key from a passphrase in `G8_SEAL_PASSPHRASE`, never on the command line. `g8-unseal` refuses while a counted session has no logged last decision, and records the opening time. `g8-analyse` checks that every list was opened after the last session ended. |
| The plaintext list never enters the repository                                                                                                           | `g8-seal --in` and `g8-unseal --out` refuse paths inside the repository. `.gitignore` excludes `study/g8/**/*.plain.json`.                                                                                                                                                                                       |
| Raters match independently, then settle (§6 item 9)                                                                                                      | Separate `rater-1/`, `rater-2/` and `settled/` sheets. `g8-analyse` reports agreement before discussion and checks that both sheets were completed before the settled one.                                                                                                                                       |
| Findings outside the list are logged and not counted (§6 item 9)                                                                                         | The label `outside` in the settled sheet. `g8-analyse` lists these findings and does not count them.                                                                                                                                                                                                             |
| Study materials are not shipped                                                                                                                          | package.json `files`, and the test in `test/unit/study/g8-check.test.ts`                                                                                                                                                                                                                                         |

The private study repositories of the pool (C001-T-110) stay readable by the moderator and the
seeder only. Nothing of them is copied here except the hashes in `pool.json` and `sealed/`.

## Commands (`npm run study -- <step>`)

Every step takes `--record <dir>` (default `study/g8/record`). `npm run study -- help` prints the
usage.

| Step                                               | Who, when                                                | Command                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Assignment draw (§6 items 4 and 5)                 | moderator, C001-T-112, once 8 participants are confirmed | `npm run study -- g8-assign --seed <seed> --participants P01,P02,P03,P04,P05,P06,P07,P08 --reserves P09,P10`        |
| Check the draw                                     | anyone, any time                                         | `npm run study -- g8-assign --dry-run` (repeats the draw from the recorded seed)                                    |
| Reserve replaces a dropped participant (§6 item 4) | moderator                                                | `npm run study -- g8-assign --replace-row <n> --reserve <code>`                                                     |
| Prepare a session folder                           | moderator, before each session                           | `npm run study -- g8-new-session --row <n> --session <1\|2> --rc 1.0.0-rc.<n>`                                      |
| Check a session block                              | moderator, end of C001-T-113 to C001-T-116               | `npm run study -- g8-check-record --rows 1,2` (then `3,4`, `5,6`, `7,8`)                                            |
| Seal a defect list (§6 item 3)                     | study seeder, C001-T-111                                 | `G8_SEAL_PASSPHRASE=… npm run study -- g8-seal --change A --in <path outside the repository>`                       |
| Open the sealed lists (§6 item 9)                  | study seeder, C001-T-102, after the last session         | `G8_SEAL_PASSPHRASE=… npm run study -- g8-unseal --change A --out <path outside the repository>`                    |
| Analysis (§6 item 10)                              | owner of C001-T-102                                      | `npm run study -- g8-check-record --rows 1,2,3,4,5,6,7,8`, then `npm run study -- g8-analyse` (writes `RESULTS.md`) |

`g8-analyse --input <dir>` analyses another record and prints the report, or writes it to
`--out <file>`. It writes `RESULTS.md` only for the study record. For example,
`npm run study -- g8-analyse --input test/fixtures/study/synthetic-record` runs on the synthetic
record that the unit tests use.

**Seed of the draw.** {{PLACEHOLDER: the moderator fixes how the seed is chosen before the draw,
for example three dice throws written down in front of a witness, and records the method in the
`notes` of the C001-T-112 report. The seed is chosen before the participant codes are final and is
never changed after a draw.}}

**Analysis.** It uses no dependency, only plain TypeScript (`scripts/study/`). Per session, the
review time is the time from opening to the last decision minus breaks, and a capped session (or
one over 180 minutes) counts as 180. The share found is the number of distinct seeded defects
matched in the settled sheet divided by the number of seeded defects of the change. Duplicates
count once, and `outside` findings count zero. The report gives, per method, the mean and sample
standard deviation over the 8 counted sessions and the means per change. The C001-NFR-006 ratio
is mean time with the assistant divided by mean time with the diff review (threshold ≤ 0.50). The
C001-NFR-007 difference is the mean share with the assistant minus the mean share with the diff
review, in percentage points (threshold ≥ 0). Agreement before discussion is reported as percent
agreement and Cohen's kappa over the finding labels of the two raters. The design items of
C001-DOD-018 are checked from the record.
