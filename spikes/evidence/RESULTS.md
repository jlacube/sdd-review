# Spike C001-T-020: workspace measurements W1 to W4 and W6 — harness and results template

> **NOT YET MEASURED.** This file is the template for C001-T-021. The harness is built and was
> smoke-tested on tiny repositories only (section "Smoke runs"). No measurement W1 to W6 has been
> taken on a benchmark change. Every `—` below is filled from
> `bench/results/spike-evidence-<bench-id>-<label>-<time>.md` after the real runs on the idle
> reference machine; C001-T-021 records the results in `bench/results/workspace-<date>.md`
> (C001-ADR-006 Amendment 2, A2.1). Nothing here is a result.

## Labels and pass conditions (C001-ADR-006 §11 and A1.6; no threshold changes)

| Label | Measured                                                                                                                                          | Pass condition                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| W1    | preparation time; time from its start to the first test results, divided by the test command in the developer's built working tree (C001-AS-08)   | reported; above 3.0 triggers mitigations |
| W2    | (a) with reset, checks and observation in the measured run, 3 runs                                                                                | ≤ 3.0                                    |
| W3    | (b) with the copy, root rewrite, self-containment check and 7 workers; copy time, mutant count, mean time per mutant                              | ≤ 60 min                                 |
| W4    | (c) with 10 fixed-text commands, at least one run during and one after mutation testing; split into reset, checks, observation, shell start, save | ≤ 1 s per command                        |
| W5    | full and touched-path check on 500,000 lines; observer set-up; per-run observation cost                                                           | reported (not part of this harness)      |
| W6    | on the W6 fixture: fill and reset time with every covered file in its working-tree copy, and in its stored form; share of (a) and (c)             | reported; input to W2 and W4             |

W5 is outside this harness (C001-T-021 step 1 builds it on the check and the observer directly).

## Before running

1. Reference machine idle (`bench/README.md`: no IDE, browser, agent, indexer; mains power).
2. Each reference checkout at the head of its benchmark change, clean, with its environment
   installed (`bench/README.md`, "Preparing the reference checkouts"); the faker virtual
   environment exists at `<checkout>/.venv` (the harness activates it as
   `bench/set/environments/bench-py.json` says).
3. Tools installed under `<bench root>/tools/` (`spikes/evidence/README.md`).
4. `npm run bench -- spike-evidence --dry-run` prints every tool and `head ok` for each change.

## Commands (exact)

Each command is one fresh Node.js process: intake into a scratch store, observer start, then the
protocol. Each writes `bench/results/spike-evidence-<id>-<label>-<time>.json` and `.md`.

```
npm run bench -- spike-evidence --dry-run

# W1, per benchmark change (also runs the test command twice in the working tree; the second, warm
# run is the denominator):
npm run bench -- spike-evidence bench-ts W1
npm run bench -- spike-evidence bench-py W1
npm run bench -- spike-evidence bench-cs W1

# W2, 3 runs per benchmark change (each a new process; baseline and measured run each in a newly
# prepared workspace):
npm run bench -- spike-evidence bench-ts W2      # three times
npm run bench -- spike-evidence bench-py W2      # three times
npm run bench -- spike-evidence bench-cs W2      # three times

# W3, 3 runs per benchmark change (7 workers on the reference machine by default):
npm run bench -- spike-evidence bench-ts W3      # three times
npm run bench -- spike-evidence bench-py W3      # three times
npm run bench -- spike-evidence bench-cs W3      # three times

# W4, 3 runs per benchmark change; `--state both` gives one bundle run during mutation testing
# (started after the copy window ended) and one after it in each run:
npm run bench -- spike-evidence bench-ts W4 --state both      # three times
npm run bench -- spike-evidence bench-py W4 --state both      # three times
npm run bench -- spike-evidence bench-cs W4 --state both      # three times

# W6: build the fixture once (default 20 Git LFS files of 1 MiB and 40 files of 16 KiB under the
# sddr-b64 filter, on top of bench-ts), then one run per state:
npm run bench -- spike-evidence build-w6
npm run bench -- spike-evidence w6 --state copy
npm run bench -- spike-evidence w6 --state stored
```

Options: `--workers N` (default logical CPUs − 1), `--no-wt-baseline` (W1), `--resets N` (W6,
default 3). `--hunk-limit N`, `--repo`, `--source`/`--ref`/`--base` make smoke runs only
(`validForMeasurement: false`).

## Where each value comes from in a report

| Value                   | Report field                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 preparation          | `result.preparationMs` (fill, ignored paths copied, index; the test run's workspace)                                                                                                |
| W1 ratio                | `result.ratioToWarmWorkingTree` = `firstResultsMs` (preparation + measured test run incl. reading the results and the revision save) / `workingTreeBaseline.warmMs`                 |
| W2 (a)                  | `result.ratioA` = `measured.totalMs` (reset + watcher + observer window + command with adapters + drains + check + reading results + revision save) / `baseline.commandMs`          |
| W2 split                | `result.measured.step` (`resetMs`, `watchStartMs`, `observeBeginMs`, `commandMs`, `observeEndMs`, `watchStopMs`, `checkMs`, `stateMs`), `readMs`, `saveMs`                          |
| W2 data check           | `result.measured.coverage` (tests by outcome; changed files with per-test data; added lines executed by passing tests)                                                              |
| W3 (b)                  | `result.mutation.totalMs` (and `bMinutes`): from the end of the test run to the last recorded result, copy, tool runs, observation and revision saves included                      |
| W3 copy, mutants, mean  | `result.mutation.copy.durationMs`, `.mutants`, `.meanPerMutantMs`, `.outcomes`, `.toolRuns[]` (per tier and tool, exit, notes), `.loadedOutside` (self-containment check)           |
| W4 (c)                  | `result.bundle.<during-mutation                                                                                                                                                     | after-mutation>.maxOverheadMs`, per command `overheadMs`=`totalMs`−`ownMs`; split `resetMs`, `checksMs`, `observationMs`, `shellStartMs`, `stateMs`, `saveMs` |
| W6                      | `result.coveredFill`, `result.coveredResets[]` (each with `g15BeforeMs`, `copyMs`, `hashMs`, `g15AfterMs`, `storedFormMs`, `statCheckMs`), `result.contents`, `result.storedCauses` |
| W6 share of (a) and (c) | computed by C001-T-021: covered reset time / W2 `measured.totalMs` of bench-ts, and covered reset time / W4 `maxOverheadMs` of bench-ts                                             |

## Results

| Label                                                | bench-ts | bench-py | bench-cs | Pass or miss |
| ---------------------------------------------------- | -------- | -------- | -------- | ------------ |
| W1 preparation (s), ratio                            | —        | —        | —        | reported     |
| W2 (a), max of 3                                     | —        | —        | —        | —            |
| W3 (b) (min), copy (s), mutants, mean per mutant (s) | —        | —        | —        | —            |
| W4 (c) max during / after (ms)                       | —        | —        | —        | —            |

| W6 (fixture on bench-ts) | working-tree copy | stored form |
| ------------------------ | ----------------- | ----------- |
| covered fill (ms)        | —                 | —           |
| covered reset (ms)       | —                 | —           |
| share of (a), of (c)     | —                 | —           |

## Smoke runs of the harness (not measurements)

Run on 2026-11-21 on the development machine (Windows 11, i7-10510U, 8 logical CPUs, Node 22.13.0),
not idle, on three tiny repositories built for the purpose (one changed source file and one test
file each, 21 to 27 added lines), with `--repo`; reports were deleted after reading. They show that
each path runs end to end, not how long the benchmark changes take.

| Path                                   | What was checked                                                                                                                                                                  | Outcome                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| TS: Jest 29.7 + ts-jest 29.1, W2, W3   | per-test lines through the preload (source maps to the `.ts` lines); StrykerJS 10.1.1 with jest-runner in the mutation copy (`inPlace`, line ranges, 2 workers), report converted | 5 tests, 13 of 22 added lines executed by passing tests; 12 mutants (8 killed, 4 survived); check clean      |
| Python: pytest 9.2, W2, W3, W4         | coverage.py 7.17.3 (vendored, `ctrace`) contexts per node ID; engine: 16 mutants, one process each, first unmutated run; bundle during and after mutation testing                 | 4 tests, 9 of 27 lines; 16 mutants (11 killed, 5 survived); 20 bundle commands, all checks clean             |
| C#: xUnit 2.2, W1, W3                  | AltCover 9.0.189 in place with call context, runner-mode collect, TRX join (theory rows folded); Stryker.NET 5.1.0 with character spans in the copy                               | 3 test methods, 9 of 21 lines; 6 mutants (4 killed, 2 survived)                                              |
| W6 on a fixture built from the TS repo | `build-w6` (3 LFS files of 256 KiB, 3 files under sddr-b64), both states, 2 resets each                                                                                           | copy state: 6 copies kept, resets skip all 6; stored state: 6 stored forms with their causes, resets retry 6 |

Observations from the smoke runs that matter for the real runs:

- A cold Jest run in a fresh workspace took 17 to 18 s for 4 tests against 2.3 s in the working
  tree (ts-jest's cache is keyed by path, so every workspace compiles cold; Windows Defender scans
  the freshly copied `node_modules`). This lands in W1 (outside every threshold) and on both sides
  of (a).
- StrykerJS took about 100 s for 12 mutants in a fresh copy (its own startup, initial run and cold
  ts-jest); the fixed part repeats per tier.
- The first owner-file state switch during mutation testing once took about 200 ms (rename retry
  on Windows while the owner file was being read); W4 reports it as `stateMs`.
