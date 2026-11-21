# bench: benchmark set, reference machine and measurement harness

Task C001-T-013. Everything the NFR measurements of C001-M-01 and C001-M-07 run on is fixed here,
before any measurement: the reference repositories, the benchmark changes with their intake and
environment, and the harness that times runs and samples memory.

## The rule

**The set is fixed before any measurement and is not chosen for how much of it can be cleared**
(`10-spec/30-nfr/nfr.md` section 0). The same holds for each change's intake and environment. Once
`bench/set/benchmark-set.json` has `"frozen": true` and is committed, no repository, commit,
benchmark change, intake, named file, test command or environment changes because of a measurement
result. A change to the set after the freeze is a new, recorded set, and measurements taken on the
old set are not mixed with it.

## Reference machine

The owner designated this PC as the reference machine (nfr.md section 0: 8 logical cores, 16 GiB
RAM, SSD, no other user workload during a measurement).

| Item          | Value (read from the machine on 2026-11-20)                            |
| ------------- | ---------------------------------------------------------------------- |
| CPU           | Intel Core i7-10510U @ 1.80 GHz, 4 cores, 8 logical processors         |
| RAM           | 16 GiB (2 x 8 GiB at 2133 MT/s; 16,968,355,840 bytes reported to Node) |
| Disk          | SAMSUNG MZVLQ512HALU, NVMe SSD, 512 GB, NTFS                           |
| OS            | Windows 11 Famille (Home), version 10.0.26200, 64-bit                  |
| Node.js / npm | 22.13.0 / 10.9.2                                                       |
| Python        | 3.13.9                                                                 |
| .NET          | SDK 10.0.404 (and 8.0.300); runtimes 10.0.15 and 8.0.5                 |
| Rust / Cargo  | 1.99.0 / 1.99.0                                                        |
| git           | 2.45.1.windows.1                                                       |

During a measurement nothing else runs on the machine: close IDEs, browsers, agents and
indexers, and keep the machine on mains power.

## Reference repositories

Checked out outside this repository, in `../sdd-bench/ref/<name>` next to it (or under
`SDD_BENCH_ROOT`). Nothing of them is committed here. Licences are permissive and every repository
has at most 500,000 lines (measured with `bench/harness/loc.ts`: tracked files, minus lock files,
minified, binary and vendored paths).

| Ecosystem                                  | Repository                                                                   | Licence           | Commit                                     |   Lines | Test command                                                                                                                              |               Duration | Result                   |
| ------------------------------------------ | ---------------------------------------------------------------------------- | ----------------- | ------------------------------------------ | ------: | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------: | ------------------------ |
| TypeScript                                 | class-validator, `https://github.com/typestack/class-validator.git`          | MIT               | `2e1a5c27dbd65b80e27fe96b49bd6e6641fa3603` |  16,572 | `npx jest --coverage=false`                                                                                                               |                 10.0 s | 806 passed               |
| Python                                     | faker, `https://github.com/joke2k/faker.git`                                 | MIT               | `affa2c5aada23fc5c00127298a8e904375d32832` | 383,516 | `python -m pytest -q -p no:cacheprovider -p faker.contrib.pytest.plugin --deselect tests/pytest/test_unique_clear.py::test_unique_clears` |                 49.8 s | 2,458 passed, 11 skipped |
| C#/.NET                                    | FluentValidation, `https://github.com/FluentValidation/FluentValidation.git` | Apache-2.0        | `5903fa65863ec66dabf10646b9c09b33130a03e8` |  32,540 | `dotnet test src/FluentValidation.Tests/FluentValidation.Tests.csproj -f net10.0`                                                         | 8.2 s (build included) | 894 passed, 1 skipped    |
| Outside the deep ecosystems (C001-NFR-008) | fd (Rust), `https://github.com/sharkdp/fd.git`                               | MIT OR Apache-2.0 | `b80cd53e65615060a62a5ea349a0d78b65d7029e` |  13,264 | `cargo test`                                                                                                                              |          5.6 s (built) | 266 passed               |

Durations are wall-clock, warm (second run), measured with this harness. They are a record, not a
threshold. The one deselected faker test needs the project installed (see its environment file).

## Files

- `set/benchmark-set.json`: the set. `references.<ecosystem>.{repository, commit}` is the part
  `baseFromBenchmarkSet` of `test/fixtures/builder/fixture-repo.ts` reads. A set with
  `"frozen": false` is a draft: the fields of the benchmark changes (`baseCommit`, `headCommit`,
  `agentCommits`, `changeLocation`, `changedLines`, `changedFiles`, `taskDescriptionFile`,
  `namedFiles`, `intake`, and `sddChange` for a change with an SDD workspace) may be `null`. With
  `"frozen": true`, every one of them is set, and `validate-set` also checks, against the git data
  of `changeLocation.checkout` when that checkout exists, that the change has 9,000 to 10,000
  changed lines (added plus deleted) over 250 to 300 files, that the recorded numbers equal the git
  data, and that `agentCommits` lie between base and head. `namedFiles` holds the files named at
  intake: the task description as `pull-request-text`, and the agent's `agent-plan` and
  `agent-transcript` files where its session produced them; nothing else is named.
- `set/environments/<bench-id>.json`: the environment of a benchmark change (`bench-ts`,
  `bench-py`, `bench-cs`), schema `sdd-review-benchmark-environment/1`:
  - `workingTreeInstall`: how the ignored dependencies are installed in the working tree (commands
    and ignored paths);
  - `evidenceWorkspace`: how they are made available in each evidence workspace
    (`ignoredPathsMadeAvailable`, `preparationCommands`), consistent with C001-ADR-006;
  - `activeEnvironment`: the environment in which the review is started (for Python, the active
    virtual environment), with the variables that must be set and must be unset;
  - `testCommand` and `testCommandNotes`: the test command given to the review;
  - `isolationRules`: the three rules of nfr.md section 0 (project never installed editable from
    the working tree, never installed as a copy, no working-tree path on an import path), each
    recorded as `false` for "happens".
- `harness/`: the harness (below). `results/`: reports of runs; real results are committed by the
  tasks that measure.

SDD workspace: `bench-ts` (class-validator) is produced from an SDD change held in the repository;
`bench-py` and `bench-cs` have none.

## Harness

```
npm run bench -- harness-selftest      # harness on a small fixture: wall-clock and peak memory
npm run bench -- validate-set          # structure of benchmark-set.json (draft or frozen)
npm run bench -- count-lines <dir>     # lines of the tracked files of a repository
npm run bench -- measure <name> -- <command ...>   # run, time, sample, write bench/results
npm run bench -- spike-parse <bench-id|all> [--runs 5]   # C001-T-014 parse spike, spikes/parse/RESULTS.md
```

- `harness/run.ts`: `runCommand` (spawns a command; its tree is measured) and `runFunction`
  (an in-process async function; this process's tree). Phases are timed with `run.phase(name, fn)`
  or, for a command, by the lines `@@bench-phase <name>` it prints.
- `harness/sampler.ts`: resident memory of the process tree every 100 ms, summed over the tree's
  processes (shared pages count once per process, so the figure is an upper bound). Linux reads
  `/proc/<pid>/status`, macOS runs `ps -A -o pid=,ppid=,rss=`, Windows keeps one resident Windows
  PowerShell process that answers from a Toolhelp snapshot and `GetProcessMemoryInfo` (working
  set), and is left out of the measured tree. The report records the mean and longest gap between
  samples so a slow sample is visible.
- `harness/report.ts`: one JSON (`sdd-review-bench-run/1`) and one markdown report per run,
  `<name>-<timestamp>.json|md`.
- `harness/set.ts`, `harness/loc.ts`: the set validation and the line counter.

For C001-NFR-004 the measured root is the review process; the processes of the project's own
commands and of a local model runtime are not part of the core's tree and are left out by the
caller of the harness.

## Preparing the reference checkouts on a machine

```
git clone <repository> ../sdd-bench/ref/<name> && git -C ../sdd-bench/ref/<name> checkout <commit>
class-validator:   npm ci
faker:             python -m venv .venv && .venv\Scripts\python -m pip install tzdata freezegun pytest python-stdnum ukpostcodeparser validators pillow xmltodict
FluentValidation:  dotnet restore FluentValidation.sln
fd:                cargo test   (builds target/)
```

## Restoring the frozen benchmark changes

The agent commits of each benchmark change are also kept as a git bundle in `bench/set/bundles/`
(`<bench-id>.bundle`, holding `<baseCommit>..bench/<bench-id>`). To restore a change on another
machine: clone the reference repository at its `commit` (`references` in `benchmark-set.json`), then
`git fetch <path>/bench/set/bundles/<bench-id>.bundle bench/<bench-id>:bench/<bench-id>`. The head
must equal the `headCommit` recorded in the set.

## Calibration corpus

`bench/calibration/corpus.json` holds the 12 agent changes of the calibration corpus of
C001-ADR-009 §4 (C001-T-106): 4 per deep ecosystem, 2,000 to 10,000 changed lines each, each from
an older release tag of a reference repository than its benchmark change, with 15–25% of changed
lines in files that exist at the base. Each change has its task description in
`bench/calibration/tasks/`, its environment in `bench/calibration/environments/` (based on the
benchmark recipe of the same repository) and its agent commits as a bundle in
`bench/calibration/bundles/` (restore as for the benchmark changes, branch `calib/<eco>-<n>`).
`npm run bench -- calibration --check-overlap` validates the corpus and fails when a change shares a
commit range or a task description with the benchmark set or with the G-8 pool
(`study/g8/pool.json`, once C001-T-110 writes it). Seeded defects follow in C001-T-107 and C001-T-108.
