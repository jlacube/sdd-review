---
id: "C001-PLAN-ROLLOUT"
artifact: plan/rollout
change: "CHG-001"
phase: 20-plan
status: draft
---
# C001 — Rollout, versioning and rollback

CHG-001 is a greenfield local tool: one npm package with the `sdd-review` executable
(C001-ADR-001 item 2), run on the developer's machine, with no server, no shared database and no
earlier version in use. Rollout is therefore a release of the package on the public npm registry
(Q-release-01); rollback is a dist-tag and deprecation action on the registry or a reinstall on the
developer's machine. Risks: `70-risks.md`.

## Migration

No data migration: no earlier release exists, so there is no store, configuration or review record
to convert. The steps below take the package from the repository to users.

1. **Development builds (C001-M-01 to C001-M-06).** Not published. The team installs from the
   repository (`npm run build`, then `npm pack` and a global install of the tarball) on the
   operating systems of C001-NFR-016. CI (GitHub Actions, Q-ci-01) builds every commit.
2. **Release candidates (C001-M-07).** Version `1.0.0-rc.<n>`, published to the public npm
   registry under the dist-tag `next` (P-01's answer to Q-release-01, `questions-log.md` Round 6)
   by C001-T-105, once C001-T-084, C001-T-090 and C001-T-091 are done and the risk weights of
   C001-T-099 are committed. The publish procedure below applies. The release candidate is the
   subject of C001-T-092 to C001-T-098 and C001-T-100 and is the build that the participants of the
   study sessions C001-T-113 to C001-T-116 install with `npm install -g <package>@1.0.0-rc.<n>`; every
   measurement record names its version. A fix during C001-M-07 gives the next `rc.<n>`, published
   under `next` in the same way by reopening C001-T-105; measurements whose subject changed are
   taken again. A release candidate is never published under `latest`.
3. **Release `1.0.0`.** After C001-T-103 passes on the closing commit and every DoD item of
   `10-spec/70-dod.md` has its evidence (C001-M-07 exit criterion), C001-T-103 publishes `1.0.0`
   under the dist-tag `latest`, moves `next` to `1.0.0` as well, and adds the release notes and the
   compliance report of C001-T-103 to the GitHub release of the tag `v1.0.0`.
4. **Install on a developer machine.** Prerequisites Node.js 22 or later and git 2.34 or later
   (C001-CON-18, `engines.node` of C001-T-001; the git check of C001-T-005 refuses an older git with
   ERR-INTAKE-008). Install with `npm install -g <package>` (dist-tag `latest`); the first
   `sdd-review review` creates the store root of C001-ADR-005 item 1. Nothing is written into the
   repository (C001-REQ-120).
5. **Patch releases `1.0.<n>`.** For defects, a grammar update (C001-RISK-007), a new key in the git
   hardening profile (C001-RISK-014) or a dependency advisory. Each patch runs the full CI matrix of
   C001-T-100 and the scans of C001-T-103 before publication, then is published under `latest` with
   the publish procedure below.

`<package>` is the `name` in `package.json` (C001-T-001); the executable is `sdd-review` in every case.

### Publish procedure (public npm registry)

Run by the maintainer who owns C001-M-07: C001-T-105 for every release candidate, C001-T-103 for
`1.0.0`, and the patch release task of a later change for every patch.

1. **Once, before `1.0.0-rc.1` (C001-T-105; C001-T-001 made the first name check):** confirm with
   `npm view <package>` that the name is not taken on the public registry (a taken name goes to
   P-01 before any publish); publish from an npm account with two-factor authentication required
   for publishing; the npm credentials stay outside the repository (secret scan of C001-T-001).
2. Tag the commit `v<version>` and wait for its CI run to be green on every runner kind of
   C001-T-001, including the job on the Windows 11 self-hosted runner `win11` of C001-T-104
   (Q-ci-02).
3. From a clean checkout of the tag: `npm ci`, `npm run build` (it builds the .NET startup hook of
   C001-T-059, so the .NET SDK is installed), then `npm pack --dry-run` and check that the file list
   holds the built package and `runtime/` only (no `spikes/`, `test/`, `bench/`, `study/` or `.sdd/`).
4. Publish: `npm publish --tag next` for `1.0.0-rc.<n>`, `npm publish --tag latest` for `1.0.0` and
   `1.0.<n>`.
5. Check with `npm view <package> dist-tags` that the dist-tag points at the new version, install it
   with `npm install -g <package>@<version>` on a clean machine, and check that `sdd-review --version`
   prints it.

### Versioning

- Semantic versioning of the package. The public interfaces are those of `10-spec/50-interfaces/`:
  the CLI of C001-IF-001, the documents of C001-IF-008 and C001-IF-009, the review configuration and
  the neutral intent-and-architecture file. Every release of this change writes and reads exactly
  those formats, so any two `1.0.x` releases share one store. An incompatible change of an interface
  needs a new SDD change and a new major version.
- Grammar versions, the diff algorithm and the risk weights are fixed per release (C001-CON-17,
  C001-ADR-003, C001-ADR-009). A release that changes one of them changes static results, so its
  release notes say so, and C001-NFR-015 holds per release, not across releases.
- `sdd-review --version` prints the package version (C001-T-001); every record of C001-M-07 names it.

## Feature flags

None. The tool has no rollout flags. Behaviour that is off by default is review configuration that
the specification defines, not a flag: model-free mode is the default and a cloud provider needs an
explicit opt-in (C001-CON-01, C001-CON-05); its default values are those of
`10-spec/50-interfaces/review-config.schema.json`.

## Rollback

| ID | Situation | Steps | Linked to |
|---|---|---|---|
| C001-RB-001 | A published release or release candidate is defective (failed scan, broken platform, wrong result) | 1. Move the dist-tag back to the last good version: `npm dist-tag add <package>@<good-version> latest` (for a release candidate: `npm dist-tag add <package>@<good-rc> next`). 2. Deprecate the defective version: `npm deprecate <package>@<bad-version> "<defect>; use <good-version>"`; the version is not unpublished, so installs pinned to it keep working and see the warning. 3. Check with `npm view <package> dist-tags`. 4. Fix, run the CI matrix and the scans, publish the next patch with the publish procedure of the Migration section (for a release candidate: the next `rc.<n>` through C001-T-105). | C001-T-103, C001-T-105, C001-M-07 |
| C001-RB-002 | A developer needs to go back to an earlier version | `npm install -g <package>@<earlier-version>` over the current one. All `1.0.x` releases share the store formats, so reviews, records and snapshots stay readable; no migration runs. Before an upgrade, the store root of C001-ADR-005 item 1 can be copied as a backup. Documented on the user documentation page `downgrade`. | C001-T-007, C001-T-034, C001-T-101 |
| C001-RB-003 | DP-1 sends a finding to P-01 (`10-strategy.md` §3) | The dependent tasks are set to `blocked` with `sdd task set <T-ID> --status blocked`; no code is removed; the measurements stay recorded in their result files (`spikes/parse/RESULTS.md`, `spikes/ui/RESULTS.md`, `bench/results/workspace-<date>.md`, `bench/results/kill-tests-<date>.md`, `bench/results/dp-1.md`), and no approved artifact is edited; work resumes after P-01's decision, a superseding ADR or a plan revision (`/architect:revise plan`). | C001-T-024, C001-M-01 |
| C001-RB-004 | A grammar update makes language scenarios fail or changes static results unexpectedly | Pin the grammar of the previous release again in the parser port, run the language scenarios of C001-T-100, publish a patch; the update waits for a fixed grammar. | C001-T-036, C001-T-100 |
| C001-RB-005 | A change to the git hardening profile breaks reads on git 2.34 or on a newer git | Remove the profile entry, run the hostile-repository and hook-environment tests on git 2.34 and the latest git, publish a patch; a key that cannot be overridden is reported as a defect on C001-ADR-004. | C001-T-005 |
| C001-RB-006 | Evidence workspaces are left on disk after a crash, a killed process or an uninstall | The next process sweeps workspaces whose owner process has ended (C001-ADR-006 §1). After an uninstall, the user removes the workspace and store folders by hand as the user documentation page `uninstall-and-clean-up` describes (C001-T-101); the repository needs no clean-up, since no run writes into it (C001-REQ-521). | C001-T-015, C001-T-101 |
| C001-RB-007 | A developer wants to stop sending content to a cloud provider | Remove the provider from the review configuration or set it to a local provider; the next analysis runs model-free or locally (C001-REQ-802); recorded model outputs stay marked as such in the record. | C001-T-085, C001-T-088 |

Uninstall: `npm uninstall -g <package>`. The store root and any
left-over workspace folders remain until the user deletes them (C001-RB-006).

## Communication

- **Release notes** (`CHANGELOG.md`, one section per version): the grammar versions, the git
  hardening profile changes, the diff algorithm and risk-weight versions (the calibration result of
  C001-T-099), fixed defects, the accepted limits of C001-RISK-003, C001-RISK-004, the residual of
  C001-RISK-005 and C001-RISK-008 (Q-filterreopen-01), and the macOS durability limit of
  C001-ADR-005, each linked to the limits page of the user documentation (C001-T-101).
- **User documentation** (C001-T-101): prerequisites and installation from the public npm registry
  (`npm install -g <package>`, page `install`), store and workspace locations (`data-locations`),
  provider-key storage per operating system (`provider-keys`), how to downgrade (C001-RB-002,
  `downgrade`) and clean up after an uninstall (C001-RB-006, `uninstall-and-clean-up`), and the
  limits page.
- **Study participants** (C001-T-113 to C001-T-116): the moderator gives each participant the exact
  release-candidate version to install (`npm install -g <package>@1.0.0-rc.<n>`, never `@next`) and
  the tutorial; a release candidate is not changed during a participant's sessions.
- **Defective release**: the `npm deprecate` message of C001-RB-001 names the defect and the version
  to use; the release notes record the withdrawal.
- **Internal**: DP-1 outcomes and blocked tasks are reported to the conductor and P-01 through
  `sdd defect add` (C001-RB-003).
