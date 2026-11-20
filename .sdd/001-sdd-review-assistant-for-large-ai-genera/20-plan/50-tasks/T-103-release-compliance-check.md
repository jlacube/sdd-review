---
id: C001-T-103
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Release compliance — secrets, vulnerabilities, licences, error logging and the 1.0.0 publication
milestone: C001-M-07
status: todo
depends_on: [C001-T-092, C001-T-093, C001-T-094, C001-T-095, C001-T-096, C001-T-097, C001-T-098, C001-T-099, C001-T-100, C001-T-101, C001-T-102]
implements: []
satisfies_ac: [C001-AC-809.1]
verified_by: [C001-TS-825]
components: [C001-COMP-001, C001-COMP-002, C001-COMP-018, C001-COMP-019]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-103 — Release compliance: secrets, vulnerabilities, licences, error logging and the 1.0.0 publication

## Intent
At the closing commit, produce the evidence of C001-DOD-029 to C001-DOD-031: secret scan with 0
secrets (provider keys included), dependency audit with 0 high or critical vulnerabilities, licence
check with 0 non-permissive licences over the whole tree, and a code review against the error
catalogue that finds a contextual log entry on every error path of C001-CAP-01 to C001-CAP-09;
with the same review, the requirement check of the unit-test titles (`60-test-plan.md` §1, rule 2).
Then publish `1.0.0` to the public npm registry under the dist-tag `latest` (P-01's answer to
Q-release-01) with the publish procedure of `75-rollout.md`. Effort: about 1 day for the
error-path review of every code of `errors.md` and the unit-test check, about 1 day for the scans,
the closing commit, its CI run and the publication. The task implements no requirement; the secret
scan evidences C001-AC-809.1 for the package's own repository (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `docs/compliance/release-<version>.md` | the three command outputs, the error-path review record (one row per code of `errors.md`: log call, operation, identifying inputs, cause), the unit-test requirement check and the `npm pack --dry-run` file list |
| modify | `package.json › version` | `1.0.0` |
| modify | `CHANGELOG.md › 1.0.0` | release notes of `75-rollout.md` Communication, linking the compliance report |

## Preconditions
- All other tasks of C001-M-07 done.
- The npm account with two-factor authentication and the name check of C001-T-105 are done.
- The reviewer of the error-path review is not the author of the code reviewed (DOD-G-03).

## Step outline
1. Run the three scans on the candidate closing commit.
2. Review every code of `errors.md` against its log call (operation, identifying inputs, cause).
3. From the Vitest JSON report of `npm test`, list the requirements of CAP-01 to CAP-09 that no
   `describe` title names; give each a unit test or record why it has no logic outside its
   acceptance scenarios (`60-test-plan.md` §1, rule 2).
4. Record the outputs and the reviews; a finding is fixed or reported as a defect, and a fix gives a
   new release candidate (C001-T-105 reopened) before this task continues.
5. Set the version to `1.0.0` and write the release notes; commit them with the compliance report.
   This commit is the closing commit: run the three scans on it again, tag it `v1.0.0` and wait for
   its CI run to be green on every runner kind, including the job on the Windows 11 self-hosted
   runner `win11`.
6. From a clean checkout of `v1.0.0`: `npm ci`, `npm run build`, `npm pack --dry-run`; check that the
   file list holds the built package only and record it in the compliance report.
7. Publish with `npm publish --tag latest`; then move `next` to the same version with
   `npm dist-tag add <package>@1.0.0 next`, so no install of `@next` gets an older release candidate.
8. Check the dist-tags, install `<package>@1.0.0` globally on a clean machine and run
   `sdd-review --version`; attach the release notes and the compliance report to the GitHub release
   of `v1.0.0`. A defect found after publication follows C001-RB-001.

## Verification
- `npm run secret-scan`
- `npm run audit`
- `npm run licence-check`
- `npm test -- --reporter=json --outputFile=docs/compliance/vitest-<version>.json`
- `npm pack --dry-run`
- `npm view <package> dist-tags` (shows `latest: 1.0.0` and `next: 1.0.0`)
- `sdd-review --version` after `npm install -g <package>@1.0.0` on a clean machine (prints `1.0.0`)

## Done when
- [ ] All three scans report 0 findings at the closing commit.
- [ ] The error-path review covers 100 % of the codes of `errors.md`.
- [ ] Every requirement of CAP-01 to CAP-09 is named by a unit-test title or has a recorded reason.
- [ ] `<package>@1.0.0` is on the public npm registry with the dist-tags `latest` and `next` pointing at it.
- [ ] A clean global install of `<package>@1.0.0` prints `1.0.0` for `sdd-review --version`.
