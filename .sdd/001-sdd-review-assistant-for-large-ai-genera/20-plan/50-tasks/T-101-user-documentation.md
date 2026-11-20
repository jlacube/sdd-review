---
id: C001-T-101
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: User documentation
milestone: C001-M-07
status: todo
depends_on: [C001-T-084, C001-T-082, C001-T-086, C001-T-110]
implements: [C001-REQ-111, C001-REQ-207, C001-REQ-426, C001-REQ-809]
satisfies_ac: [C001-AC-111.1, C001-AC-207.1, C001-AC-426.1]
verified_by: [C001-TS-124, C001-TS-216, C001-TS-476, C001-TS-826]
components: [C001-COMP-001, C001-COMP-005, C001-COMP-006, C001-COMP-015]
risk_refs: [C001-RISK-003, C001-RISK-004, C001-RISK-008, C001-RISK-018]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-101 — User documentation

## Intent
Write the user documentation of C001-DOD-032 and the user-facing part of DOD-G-05: the `.sdd/`
layout the tool reads, the neutral intent-and-architecture file format, every setting of the review
configuration, every CLI command with its exit codes, prerequisites and installation from the public
npm registry, where the tool keeps its data, how to downgrade and how to clean up after an
uninstall (`75-rollout.md` Communication, C001-RB-002, C001-RB-006), how to store provider keys per
OS (C001-ADR-008 follow-up), the evidence environment rules a project needs (nfr.md §0 as user
guidance), and the limits users must know: those accepted by P-01 (C001-RISK-003, C001-RISK-004,
the residual of C001-RISK-005, C001-RISK-008 per Q-filterreopen-01) and the macOS durability limit
of C001-ADR-005. Also the study tutorial script on the practice change of C001-T-110. Then have a
reviewer check it against `10-spec/50-interfaces/`.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `docs/user/ › getting-started, install, cli, configuration, intent-sources, neutral-file, provider-keys, evidence-environment, data-locations, downgrade, uninstall-and-clean-up, limits` | one page per topic, linking the interface files |
| add | `study/g8/tutorial.md` | the 30-minute tutorial of `60-test-plan.md` §6 item 6 on the practice change, built from `getting-started` |
| add | `docs/user/REVIEW.md` | reviewer's check record against `50-interfaces/` |

## Preconditions
- C001-T-084, C001-T-082 and C001-T-086 done; C001-T-110 done (practice change for the tutorial).

## Step outline
1. Draft each page from the interface files; do not restate rules that the schema states, link it.
2. `install`: prerequisites Node.js 22 or later and git 2.34 or later, `npm install -g <package>`
   (dist-tag `latest`), `sdd-review --version` (`75-rollout.md` Migration step 4).
3. `data-locations`: the store root of C001-ADR-005 item 1 per operating system, the repository key
   and the fact that a moved or renamed repository starts with an empty review list while earlier
   reviews stay under the old key (C001-ADR-005 Consequences), the evidence-workspace location of
   C001-ADR-006 §1, and that nothing is written into the repository (C001-REQ-120).
4. `downgrade`: C001-RB-002 (install an earlier `1.0.x`; the store stays readable; copy the store root
   first as a backup).
5. `uninstall-and-clean-up`: `npm uninstall -g <package>`, then which store and workspace folders to
   delete by hand (C001-RB-006); workspaces of ended processes are swept on the next run.
6. Add per-OS key storage commands from C001-ADR-008 §1.
7. On the limits page, state each accepted limit with the question that accepted it. For
   C001-RISK-008 (Q-filterreopen-01): a process that reopens a review computes the set of files
   under a clean filter again from the current filter-driver configuration; if a
   `filter.<driver>.clean` or `filter.<driver>.process` setting changed since intake, evidence runs
   can use a file's stored form where intake used its working-tree copy, or the reverse, so the user
   keeps the filter configuration unchanged while a review is open or starts a new review after
   changing it. For macOS (C001-ADR-005): `fsync` does not force the drive's cache, so an
   operating-system crash or power loss can drop the last confirmed review entries; a process end
   does not (C001-NFR-014).
8. Write the study tutorial on the practice change from `getting-started`.
9. Have a reviewer check every page against `50-interfaces/`; record the check.

## Verification
- `npm run docs:check`
- `npm run acceptance -- --scenario C001-TS-124 --scenario C001-TS-216 --scenario C001-TS-476 --scenario C001-TS-826`

## Done when
- [ ] Every CLI command and every configuration setting is documented.
- [ ] The `install`, `data-locations`, `downgrade` and `uninstall-and-clean-up` pages exist and
      match C001-RB-002, C001-RB-006, C001-ADR-005 item 1 and C001-ADR-006 §1.
- [ ] The limits page states the limits of C001-RISK-003, C001-RISK-004, C001-RISK-005 (residual)
      and C001-RISK-008, each with its accepting question, and the macOS durability limit of
      C001-ADR-005.
- [ ] `study/g8/tutorial.md` exists and the moderator has walked through it once on the practice
      change.
- [ ] The reviewer's check record exists.
