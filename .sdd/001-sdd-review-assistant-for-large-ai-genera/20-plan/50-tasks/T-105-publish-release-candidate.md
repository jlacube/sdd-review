---
id: C001-T-105
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Publishing account and release-candidate publication on the public npm registry
milestone: C001-M-07
status: todo
depends_on: [C001-T-084, C001-T-090, C001-T-091, C001-T-099, C001-T-104]
implements: []
satisfies_ac: [C001-AC-901.1]
verified_by: [C001-TS-901]
components: [C001-COMP-001]
risk_refs: [C001-RISK-020]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-105 — Publishing account and release-candidate publication on the public npm registry

## Intent
Publish the release candidate that C001-M-07 measures and the study participants install
(`75-rollout.md` Migration step 2, P-01's answer to Q-release-01). Once, before `1.0.0-rc.1`: check
the package name again and set up the npm account with two-factor authentication. For every
release candidate: run the publish procedure of `75-rollout.md` steps 2 to 5 under the dist-tag
`next`. A fix during C001-M-07 gives the next `rc.<n>` with this same task reopened
(`sdd task set C001-T-105 --status in-progress --note "rc.<n>: <reason>"`). The task implements no
requirement; it installs the published package and runs C001-TS-901 on it as a smoke check
(`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| modify | `package.json › version` | `1.0.0-rc.<n>` |
| modify | `CHANGELOG.md › 1.0.0-rc.<n>` | release-candidate notes per `75-rollout.md` Communication (weights of C001-T-099 included) |
| add | `docs/release/rc-<n>.md` | the signal-code check against the calibration commit, the `npm pack --dry-run` file list, the CI run of the tag, the `npm view <package> dist-tags` output and the smoke result |
| modify | `test/acceptance/runner/ › --installed option` | runs a scenario against the `sdd-review` executable found on `PATH` instead of the built tree (harness of C001-T-004) |
| add | npm account and package on the public registry | account of the maintainer who owns C001-M-07 with two-factor authentication required for publishing; credentials outside the repository |

## Preconditions
- C001-T-084, C001-T-090 and C001-T-091 done (feature-complete, model-free and with a provider).
- C001-T-099 done: release weights committed and the signal commit recorded.
- C001-T-104 done: the runner `win11` is online.
- An npm account for the maintainer, provided by P-01 (gate notes of G3).

## Step outline
1. Once, before `rc.1`: confirm again with `npm view <package>` that the name chosen in C001-T-001
   is free (a taken name goes to P-01 before any publish); set up the npm account with two-factor
   authentication required for publishing; keep the credentials outside the repository (secret scan
   of C001-T-001).
2. Check that no signal code changed since the commit recorded by C001-T-099:
   `git diff --stat <signal-commit> HEAD -- src/core/intake src/core/language src/core/triage src/core/evidence`
   lists no file other than `src/core/triage/risk.ts`; otherwise C001-T-099 step 3 runs again first.
3. Set the version to `1.0.0-rc.<n>`, write the notes, commit, tag `v1.0.0-rc.<n>` and wait for its
   CI run to be green on every runner kind, the job on `win11` included (`75-rollout.md` Publish
   procedure step 2).
4. From a clean checkout of the tag: `npm ci`, `npm run build` (the .NET startup hook of C001-T-059
   included), `npm pack --dry-run`; the file list holds the built package and `runtime/` only.
5. `npm publish --tag next`; check `npm view <package> dist-tags`; install
   `<package>@1.0.0-rc.<n>` globally on a clean machine; `sdd-review --version` prints it; run
   C001-TS-901 against the installed package.
6. Report the published version to the owners of C001-T-092 to C001-T-098, C001-T-100 and the study
   tasks; every record of C001-M-07 names it.

## Verification
- `git diff --stat <signal-commit> HEAD -- src/core/intake src/core/language src/core/triage src/core/evidence`
- `npm pack --dry-run`
- `npm view <package> dist-tags` (shows `next: 1.0.0-rc.<n>`)
- `sdd-review --version` after `npm install -g <package>@1.0.0-rc.<n>` on a clean machine
- `npm run acceptance -- --scenario C001-TS-901 --installed` (runs the scenario against the globally installed package)

## Done when
- [ ] The npm account requires two-factor authentication for publishing, and the name check is
      recorded in `docs/release/rc-1.md`.
- [ ] `npm view <package> dist-tags` shows `next: 1.0.0-rc.<n>`; `latest` is not set by this task.
- [ ] A clean global install prints `1.0.0-rc.<n>` and passes C001-TS-901.
- [ ] `docs/release/rc-<n>.md` records the signal-code check, the file list, the CI run and the
      smoke result.
