---
id: C001-T-001
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Package scaffold, build, formatters and linters, and hosted CI matrix
milestone: C001-M-01
status: done
depends_on: []
implements: [C001-REQ-913, C001-NFR-016]
satisfies_ac: [C001-AC-913.1]
verified_by: [C001-TS-928]
components: [C001-COMP-001, C001-COMP-002]
risk_refs: [C001-RISK-017]
estimate: L
report: { commit: 122e5ee, completed_at: 2026-11-20, notes: "Scaffold, linters, CI green on 4 hosted runners (run 44650146468), lint:cs verified on .NET 10, main protected; PR approval deferred to the M-01 milestone merge into main" }
---
# C001-T-001 — Package scaffold, build, formatters and linters, and hosted CI matrix

## Intent
Create the one npm package of C001-ADR-001 with the source layout of `10-strategy.md` §4, the
build, the formatter and linter of each language the package ships (TypeScript, Python, C#;
`10-strategy.md` §4, constitution code-style rule, DOD-G-04) with the module-boundary rule of
C001-CON-09, and a CI pipeline on the hosted runners of the operating systems of C001-NFR-016.
The Windows 11 self-hosted runner of Q-ci-02 is set up by C001-T-104. Every later task builds and
verifies inside this scaffold.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `package.json › name, bin.sdd-review, scripts, engines.node, files` | package with the `sdd-review` executable, Node.js 22 or later, the scripts of `10-strategy.md` §4 (`lint` runs `lint:ts`, `lint:py` and `lint:cs`), `files` limited to the built package and `runtime/` |
| add | `tsconfig.json`, `tsconfig.web.json` | strict TypeScript for core, CLI, server and web client |
| add | `eslint.config.js › typescript-eslint rules, module-boundary rule` | fails when a module under `src/core/` imports `src/ui-server/` or `web/` (C001-CON-09) |
| add | `.prettierrc.json`, `.prettierignore` | Prettier for TypeScript, JavaScript, JSON, YAML and Markdown of the package (`prettier --check` in `lint:ts`) |
| add | `runtime/python/ruff.toml` | Ruff linter and formatter for the Python code shipped in `runtime/python/` (`ruff check` and `ruff format --check` in `lint:py`) |
| add | `runtime/dotnet/.editorconfig`, `runtime/dotnet/Directory.Build.props` | .NET analysers with `EnforceCodeStyleInBuild` and warnings as errors; `dotnet format --verify-no-changes` in `lint:cs` |
| add | `.github/workflows/ci.yml › matrix` | GitHub Actions (Q-ci-01): on every push and pull request the hosted runners `windows-2025`, the hosted macOS x86-64 image, `macos-15` (arm64) and `ubuntu-24.04`; build, lint (all three languages), unit, acceptance, licence, audit, secret scan |
| add | repository settings › branch protection of `main` | merge only through a pull request with one approving review by a person other than the author and the CI checks green (DOD-G-03 review record, `handoff.md` Reporting protocol) |
| add | `src/cli/main.ts`, `src/core/api/index.ts` | empty entry points that build |

## Preconditions
- Node.js 22 or later and git 2.34 or later on the developer machine (`.sdd/_constitution/toolchain.md`);
  Python 3.12 with Ruff and the SDK of the .NET line of `10-strategy.md` §4 for `lint:py` and
  `lint:cs`.
- The dev tools added here (TypeScript, typescript-eslint, ESLint, Prettier, the licence-check, audit
  and secret-scan tools, Ruff, `dotnet format`) are confirmed by C001-T-002 retroactively; a tool
  that fails the check is replaced there (`10-strategy.md` §2).

## Step outline
1. Choose the package `name` and confirm with `npm view <name>` that it is free on the public npm
   registry; a taken name goes to P-01 before the name is used anywhere (`75-rollout.md` Publish
   procedure step 1; C001-T-105 checks it again before `1.0.0-rc.1`).
2. Create the package and the folders of `10-strategy.md` §4 with placeholder entry points.
3. Configure TypeScript strict mode, ESLint with typescript-eslint and Prettier; configure Ruff for
   `runtime/python/` and the .NET analysers and `dotnet format` for `runtime/dotnet/`. Each `lint:*`
   script runs on its folder even while the folder holds only a placeholder, so the wiring is proven.
4. Add the module-boundary rule with a failing self-test of the rule.
5. Add `licence-check` (fails on any licence of the constitution's forbidden list), `audit` (fails on
   high or critical advisories) and `secret-scan` scripts (NFR-D-01 to NFR-D-03).
6. Add the CI pipeline with the four hosted runner kinds and one job per script; CI installs Ruff at
   a pinned version and the SDK of the .NET line of `10-strategy.md` §4 for the lint job; confirm that a hosted runner label exists
   for each kind and note any announced retirement (C001-RISK-017).
7. Protect `main`: pull request with one approving review by another person, CI checks required.

## Verification
- `npm run build`
- `npm run lint`
- `npm run licence-check`
- `npm run audit`
- `npm run secret-scan`

## Done when
- [ ] The pipeline runs green on all four hosted runner kinds, the lint job included.
- [ ] `npm run lint` fails on a deliberately misformatted file in each of `src/`, `runtime/python/`
      and `runtime/dotnet/`, and passes once the file is formatted.
- [ ] A test import of `src/ui-server/` from `src/core/` makes `npm run lint` fail.
- [ ] A pull request to `main` cannot be merged without an approving review by another person.
- [ ] `sdd-review --version` prints the package version after `npm run build`.
