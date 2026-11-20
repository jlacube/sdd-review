---
id: C001-T-002
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Confirm the licence and version facts of the ADRs
milestone: C001-M-01
status: done
depends_on: [C001-T-001]
implements: []
satisfies_ac: [C001-AC-505.1, C001-AC-514.1]
verified_by: [C001-TS-512, C001-TS-539]
components: [C001-COMP-007, C001-COMP-011, C001-COMP-015, C001-COMP-019]
risk_refs: [C001-RISK-002]
estimate: M
report: { commit: 4f295d1, completed_at: 2026-11-20, notes: "Report docs/compliance/licence-and-version-report.md; licence-check/audit/lint/sdd lint pass; defects D-008..D-013 raised (D-011 Vite8 MPL-2.0 needs P-01); PR approval at M-01 merge" }
---
# C001-T-002 — Confirm the licence and version facts of the ADRs

## Intent
C001-ADR-001 to C001-ADR-009 state licences, minimum versions and support facts from the
architect's knowledge, not verified online. Under C001-CON-07 (NFR-D-02, NFR-D-03) each fact is
confirmed from its primary source before the dependency is added, so that no copyleft dependency
enters the package and the version pins of later tasks rest on checked facts. Every task after
C001-T-001 reaches this task through `depends_on` (C001-T-003 and C001-T-013 depend on it), so no
later task adds a dependency before its licence is confirmed (`10-strategy.md` §2). This task
implements no requirement; `satisfies_ac` names the criteria whose tools it confirms
(`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `docs/compliance/licence-and-version-report.md` | one row per ADR fact: claim, ADR and section, primary source, confirmed value, outcome; the rows for the "to verify" items of C001-ADR-007 §2 and §3 included |
| add | `licence-allowlist.json` | permissive licences accepted by `npm run licence-check` |
| add | `package.json › dependencies, devDependencies` | pinned versions of the confirmed dependencies only |

## Preconditions
- C001-T-001 done (licence-check script exists).

## Step outline
1. List every licence, version and support claim of C001-ADR-001 to C001-ADR-009, including:
   supported Node.js LTS lines (`10-strategy.md` §4); tree-sitter runtime and the three grammars
   (C001-ADR-003); React, React DOM, TanStack Virtual, Vite and the type generator (C001-ADR-002);
   git 2.34 features used (C001-ADR-004) and the git option and behaviour facts of C001-ADR-004
   Amendment 1 marked "Not verified online": the effect of each hardening-profile option on a
   read-only command, `core.untrackedCache=false` (A1.3) included, the handling of racy index
   entries, the fields that `git ls-files` prints for index versions 2 to 4 and split and sparse
   indexes (A1.2), and the stat values that Git for Windows records; StrykerJS and Stryker.NET
   minimum versions, runner plugins, istanbul-lib-instrument, trace-mapping, coverage.py, AltCover
   (C001-ADR-007 §5), and the .NET line of `10-strategy.md` §4 (the planner's assumption: .NET 8
   support ended on 2026-11-10 and .NET 10 is the oldest line in Microsoft support at release; SDK
   of CI, `win11` and the publish procedure, target framework of the startup hook of C001-T-059);
   native bindings for the copier and the observer (C001-ADR-006);
   credential-store bindings (C001-ADR-008); the diff study and JGit licence cited by C001-ADR-009;
   the plan's test tools (Vitest, fast-check, Cucumber.js, Playwright); and the dev tools that
   C001-T-001 added before this check (TypeScript, typescript-eslint, ESLint, Prettier, the
   licence-check, audit and secret-scan tools, Ruff, `dotnet format`).
2. Confirm each from the project's own licence file, registry metadata or release notes; record
   the source and date. Confirm the git facts from the git documentation and release notes of 2.34
   and of the latest release; the empirical proof on both versions follows in C001-T-005 and
   C001-T-006, which add their result to the same report row.
3. Pin confirmed versions; add the licences to the allowlist. A dev tool of C001-T-001 that fails
   its check is replaced by a permissive alternative in this task.
4. For any claim that does not hold, run `sdd defect add --ref <ADR-ID> --summary "…"` and leave
   the dependency out; a copyleft licence sends the ADR back to P-01. No ADR is edited
   (`10-strategy.md` §2).
5. Record the confirmed state of each "to verify" item of C001-ADR-007 §2 and §3 as a row of the
   report; an item that does not hold is a defect on C001-ADR-007, not an edit of it.
6. Confirm the .NET line from the .NET support policy (end-of-support dates of .NET 8, .NET 9 and
   .NET 10, and any line released since); record in the report the oldest line in support at the
   planned release, its SDK version to install and its target framework moniker. That recorded line
   is the one every task naming the .NET line of `10-strategy.md` §4 uses.

## Verification
- `npm run licence-check`
- `npm run audit`
- `sdd lint 001`

## Done when
- [ ] Every claim of the ADRs and every dev tool of C001-T-001 has a row with a primary source and an
      outcome, including each git fact of C001-ADR-004 Amendment 1 marked "Not verified online" and
      each "to verify" item of C001-ADR-007 §2 and §3.
- [ ] The report names the confirmed .NET line (SDK version and target framework) with the
      support-policy source and date.
- [ ] `npm run licence-check` and `npm run audit` pass with the pinned dependencies.
- [ ] Every failed claim has a defect recorded in `change.md`; no file under `.sdd/` other than
      through `sdd defect add` is changed.
