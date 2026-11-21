# Moderator session log

This is the procedure and the paper log for one session (`60-test-plan.md` §6 items 5 to 8; tasks
C001-T-113 to C001-T-116). After the session, the moderator types the entries into the session's
`log.json` (layout in `../README.md`). Personal data stays out of both the log and the notes.

## Before the session block

- [ ] The release candidate is installed with `npm install -g <package>@1.0.0-rc.<n>`. It is a
      fixed version, never `@next`, and the same one for every session (`75-rollout.md`).
      `sdd-review --version` shows it.
- [ ] The seeded HEAD of each change is checked out from the private study repository, as
      recorded in clear in `sealed/<change>.sealed.json`. The moderator never opens a sealed list.

## Before each session

1. Run `npm run study -- g8-new-session --row <n> --session <k> --rc 1.0.0-rc.<n>`. It creates
   the session folder with `log.json` (change and method from the table of §6 item 5) and a blank
   `form.md`.
2. In `form.md`, fill in the header and the requested behaviours B1, B2, … of the change. They
   come from the change's written task description (`pool.json`).
3. **Session with the review assistant:** hold the 30-minute tutorial on the practice change
   (`../tutorial.md`) directly before the session. Then open the change with
   `sdd-review review` on the change's intake.
4. **Standard diff review:** the participant uses their usual diff viewer (terminal or IDE) with
   files in its default order. Check that AI assistance is off: no assistant, chat or AI code
   review, including in the IDE.

## During the session

- Write down the clock time when the change is opened. That time is `opened`.
- Write down the start and end of each break. Breaks are subtracted from the review time.
- Do not help with the review. Answer only questions about the tool's controls or the form.
- At **3 hours of active time** (breaks excluded), stop the session. The defects written down
  until then count. Set `capped` to true and use the stop time as `lastDecision`.
- Otherwise, write down the clock time of the participant's last decision. That time is
  `lastDecision`.

## After the session

- Collect the form. Check that it has no name, e-mail address or other personal detail, and that
  the decision on the change as a whole is filled in.
- Type the times into `log.json`, then run `npm run study -- g8-check-record --rows <n>`. A missing
  second session of the row is expected until it has taken place.
- A participant who drops out: record it on the paper log, keep the folder, and record the reserve
  with `npm run study -- g8-assign --replace-row <n> --reserve <code>`. The reserve starts at the
  row's first session.

## Paper log

| Field                                         | Entry (local time, with date)               |
| --------------------------------------------- | ------------------------------------------- |
| Participant code                              | P__                                         |
| Row / session                                 | row _ / session _                           |
| Change / method                               | _ / review assistant · standard diff review |
| Release candidate                             | 1.0.0-rc._                                  |
| Tutorial held before (assistant session only) | yes · no                                    |
| Change opened (`opened`)                      |                                             |
| Break 1 start / end                           |                                             |
| Break 2 start / end                           |                                             |
| Break 3 start / end                           |                                             |
| Last decision (`lastDecision`)                |                                             |
| Stopped at the 3-hour cap (`capped`)          | yes · no                                    |
| Notes (no personal data)                      |                                             |
