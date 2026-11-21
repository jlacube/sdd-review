# Spike C001-T-020: coverage and mutation harness for the workspace measurements

**Spike-grade code.** Nothing under `spikes/evidence/` (nor `bench/fixtures/w6-filtered/`) is
shipped: the package `files` list holds only `dist/` and `runtime/`, and no module of `src/` imports
from here. It exists so that C001-T-021 can take W1 to W4 and W6 of C001-ADR-006 §11 (with its
Amendment 1, A1.6) on the production workspace, copier, observer, runner and store, before the
product's adapters and evidence jobs exist. The measurements themselves are C001-T-021; their
results go to `bench/results/` and `RESULTS.md` (still a template).

## What it is built from

Production code, unchanged: intake (`src/core/intake`) into a scratch store
(`src/core/store`, revisions included), workspace preparation, copier, index, watcher, reset and
check (`src/core/evidence/workspace`), the mutation copy with root rewrite (`mutation-copy.ts`),
the working-tree observer (`src/core/evidence/observer`, backend per OS), and the command runner
(`src/core/evidence/runner`: environment, priority, job object). The timing and memory harness is
`bench/harness` (C001-T-013).

Spike code, to be replaced:

| Spike part                                                  | What it does                                                                                                                                                                                               | Replaced by                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `coverage/node/sddr-preload.cjs`                            | Node preload (`NODE_OPTIONS=--require`): istanbul instrumentation of the changed files inside Jest's `vm.Script`, source maps back to TS, per-test counters from a jest-circus event handler; load monitor | C001-T-057 (Jest, Vitest, Mocha, `node:test`)      |
| `coverage/python/sitecustomize.py`, `sddr_pytest.py`        | coverage.py started by the hook with the `ctrace` core forced (D-009), `include` = changed files, context = pytest node ID; outcomes and durations; load monitor                                           | C001-T-058 (with the import redirection, unittest) |
| `coverage/dotnet/sddr.targets`                              | `CustomAfterMicrosoftCommonTargets`: AltCover in place after the test project's build (assemblies of the snapshot, changed files, call context on test attributes), runner mode and collect; TRX logger    | C001-T-059 (with the startup-hook load monitor)    |
| `coverage/readers.ts`, `coverage/inject.ts`                 | reading the adapters' output into one per-test model; the injections per ecosystem                                                                                                                         | C001-T-057 to C001-T-060                           |
| `mutation/stryker.ts`, `mutation/run.ts`                    | StrykerJS (`inPlace`, `perTest`, line ranges) and Stryker.NET (character spans, D-012) in the mutation copy, two tiers, worker count and low priority of ADR-006 §8; report → `MutationResult`             | C001-T-062, C001-T-064                             |
| `mutation/python/sddr_mutate.py`, `mutation/python-plan.ts` | Python engine with the operators of ADR-007 §3, applied at import time (no file written), one pytest process per mutant, first unmutated run with load monitor                                             | C001-T-063                                         |
| `bundle/bundle.ts`, `documents.ts`                          | 10 fixed-text commands with reset, checks, observation, shell start and a revision save each; the revision document set (evidence document real, the other three stand-ins sized by the hunks)             | C001-T-065 (and the documents of their tasks)      |
| `filtered/covered.ts`, `bench/fixtures/w6-filtered/`        | covered-file fill and reset in the order of ADR-006 A1.4 (copier on one file, SHA-256 and size against the pointer, G-15 before and after); the W6 fixture                                                 | C001-T-028, C001-T-067                             |
| `session.ts`, `runner.ts`, `changed.ts`, `tools.ts`         | orchestration of one session per protocol, step timings, risk order (stand-in: the hunk's changed lines; C001-COMP-010 gives the real score), tool discovery, CLI                                          | C001-T-060, C001-T-064, C001-T-065                 |

## Tools (developer-installed, outside this package)

C001-ADR-007 §1 runs the mutation tools as programs the developer installs; nothing was added to
`package.json`. For the spike they were installed under `<bench root>/tools/` (default
`../sdd-bench/tools/`, next to the reference checkouts, outside every working tree so that no
intake sees them). Versions and licences are those confirmed by C001-T-002
(`docs/compliance/licence-and-version-report.md`, rows S-01, S-02, M-04, M-05, S-10, S-13):

| Tool                                   | Version | Licence    | Installed with                                                                                                                                  |
| -------------------------------------- | ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `@stryker-mutator/core`, `jest-runner` | 10.1.1  | Apache-2.0 | `npm install --save-exact @stryker-mutator/core@10.1.1 @stryker-mutator/jest-runner@10.1.1` in `<bench root>/tools/stryker-js`                  |
| Stryker.NET (`dotnet-stryker`)         | 5.1.0   | Apache-2.0 | `dotnet tool install dotnet-stryker --version 5.1.0 --tool-path <bench root>/tools/dotnet`                                                      |
| AltCover (`altcover.global`)           | 9.0.189 | MIT        | `dotnet tool install altcover.global --version 9.0.189 --tool-path <bench root>/tools/dotnet`                                                   |
| coverage.py (vendored copy)            | 7.17.3  | Apache-2.0 | `<faker>/.venv/Scripts/python -m pip install --target <bench root>/tools/python-vendor coverage==7.17.3` (the faker environment is not changed) |

The variables `SDDR_STRYKER_JS`, `SDDR_DOTNET_STRYKER`, `SDDR_ALTCOVER` and `SDDR_PYTHON_VENDOR` name
other locations. `npm run bench -- spike-evidence --dry-run` lists what it finds.

## Running

See `RESULTS.md` for the measurement commands. Smoke runs on a small repository of your own:

```
npm run bench -- spike-evidence W3 --repo <dir> --base <commit> --eco ts|py|cs --test-command "<cmd>"
```

A report with `validForMeasurement: false` is a smoke run and never a result for C001-T-021.
Runtime files are written to `<evidence root>/runtime/spike-evidence/` (C001-ADR-006 §1);
workspaces go under the production evidence root and are removed when the run ends.
