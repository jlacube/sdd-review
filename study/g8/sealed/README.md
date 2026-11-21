# study/g8/sealed: encrypted sealed defect lists

This folder holds one file per change, `<A-D>.sealed.json`, written by the study seeder with
`npm run study -- g8-seal` (C001-T-111; `60-test-plan.md` §6 item 3). Each file holds the list
(file, lines, kind and description per defect), encrypted with AES-256-GCM under a scrypt key
derived from the seeder's passphrase. The seeded HEAD hash is kept in clear so the moderator opens
exactly the seeded change.

- The plaintext list follows `../forms/sealed-list.template.json`. It is written and kept outside
  the repository, and `g8-seal` refuses a path inside the repository.
- Only the seeder knows the passphrase until the last session has ended. Never put it on the
  command line: set it in the `G8_SEAL_PASSPHRASE` environment variable. It needs at least 16
  characters.
- `g8-seal` checks the list first: at least 8 defects, at least one of each of the six kinds,
  IDs `<change>-<two digits>`.
- After the last session, `npm run study -- g8-unseal` opens a list (C001-T-102; see
  `../forms/rating-sheet.md`).
