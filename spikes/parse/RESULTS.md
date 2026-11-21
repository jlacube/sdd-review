# Spike C001-T-014: parsing speed and memory at the supported size

> **NOT YET MEASURED.** This file is the template for the results. The harness is built and was
> smoke-tested on a tiny fixture only; the 5 cold runs per benchmark change have not been run. Every
> value marked `—` below is to be filled from `bench/results/parse-spike-<bench-id>-<time>.md` after
> the real runs on the idle reference machine. Nothing here is a result yet.

## Pass condition (fixed by the plan before the spike runs)

For every benchmark change, over 5 cold runs (task C001-T-014; no NFR threshold changes):

- maximum wall-clock time of the git reads G-07 and G-09 plus parsing plus the representative
  symbol and import extraction ≤ **60 s** (50 % of the 120 s of C001-NFR-001); and
- peak resident memory of the core process ≤ **1 GiB** (50 % of the 2 GiB of C001-NFR-004).

Either value above its limit on one benchmark change is a miss.

## How to run the measurement

On the reference machine (`bench/README.md`), with nothing else running (close IDEs, browsers,
agents, indexers; mains power), each reference checkout at the head of its benchmark change and
clean (the runner refuses otherwise):

```
npm run bench -- spike-parse all
```

This makes 5 runs of each of `bench-ts`, `bench-py` and `bench-cs` (one at a time; `npm run bench --
spike-parse bench-ts` for one change) and writes one `bench/results/parse-spike-<bench-id>-<time>.json`
and `.md` per change. Options: `--runs N` (default 5), `--workers N` (default: logical CPUs − 1, 7 on
the reference machine), `--heap-mb M` (default 256), `--g09 batched|adapter` (default `batched`),
`--eager-grammars` (load all five grammars in every worker at start; default: on first use).

## What one run does

Before the runs (not measured) the runner compiles the spike and the core modules it uses with
`spikes/parse/tsconfig.json` into `node_modules/.cache/sdd-parse-spike/`, so that the measured
process runs compiled JavaScript as the shipped package would, without the tsx loader in the main
thread and in each worker (on the smoke fixture tsx added about 30 MiB per worker). One run is then
`node node_modules/.cache/sdd-parse-spike/spikes/parse/run-once.js ...` in a fresh process, timed
and sampled by the harness of C001-T-013 (`bench/harness/run.ts`, `sampler.ts`). Inside it, phases
in this order:

| Phase                      | Kind    | What                                                                                                                     |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `parse-setup`              | parse   | start the worker pool; each worker loads `web-tree-sitter` (grammars: on first use, or all five with `--eager-grammars`) |
| `git-discover`             | git     | G-01 (program and repository check), G-03, G-02; refuses a checkout not at the head                                      |
| `git-g07`                  | git     | G-07 `changeAgainst(base)`: changed files with both sides                                                                |
| `git-g09`                  | git     | G-09 line attribution of every changed text file (read path below)                                                       |
| `git-snapshot-read`        | git     | G-13 tree of the head, every deep-ecosystem blob through `cat-file --batch` (changed files from G-07)                    |
| `extract-identifier-index` | extract | per-snapshot index of identifier text (C001-ADR-003 decision 4)                                                          |
| `parse-changed`            | parse   | both sides of every changed deep-ecosystem file (and grammar loads); trees are kept                                      |
| `extract-changed`          | extract | symbol definitions, imports and identifier nodes of each tree (`spikes/parse/languages.ts`), then the tree is freed      |
| `extract-rename-select`    | extract | rename candidates (names gone from or new on a changed file) and the files of the index that mention them                |
| `git-rename-set-read`      | git     | the rename search set read through `cat-file --batch`                                                                    |
| `parse-rename-set`         | parse   | parse of the rename search set                                                                                           |
| `extract-rename-set`       | extract | extraction on it                                                                                                         |
| `shutdown`                 | other   | workers ended, git processes closed                                                                                      |

- **Time judged against 60 s:** the wall-clock of the whole run process, from spawn to exit. It
  includes Node.js start-up, module loading, worker start and grammar loading, and shutdown, so it is an upper bound of "git reads plus parsing plus extraction".
- **Memory judged against 1 GiB:** peak of the summed resident set (Windows: working set) of the run
  process and its git child processes, sampled every 100 ms. Worker threads are inside the run
  process. Pages shared between processes count once per process, so the figure is an upper bound.
- **Cold run:** every run is a fresh Node.js process with fresh workers, grammars and git processes;
  nothing is carried over. The operating-system file cache is **not** flushed: on Windows that needs
  administrator rights (for example RAMMap "Empty Standby List"), which the reference set-up does not
  use, so files and git objects read by an earlier run may come from memory. The first run after the
  machine was idle is the closest to a cold disk; the maximum of the 5 runs is reported.
- **Workers and grammars:** the pool has one worker per logical CPU minus one (7 on the reference
  machine). Each worker holds its own grammar instances (C001-ADR-003, Consequences) and loads a
  grammar the first time it is sent a file of that language, so a change in one ecosystem loads one
  to three grammars per worker. Smoke fixture, 7 workers: 195 MiB peak with grammars on first use,
  372 MiB with all five loaded in every worker; a worker costs roughly 15 to 45 MiB before it parses
  anything.
- **Heap limit:** each worker runs with `resourceLimits.maxOldGenerationSizeMb` (256 MiB by default).
  It bounds the JavaScript heap of the worker only; the WebAssembly memory of the grammars and trees
  is outside it and is counted by the resident-memory sampling.
- **G-09 read path (`--g09 batched`, the default):** the adapter's `attributeLines` starts about two
  git processes per file (`log --follow`, `config --list`), about 120 ms per file on Windows
  (`spikes/parse-speed-memory/RESULTS.md`), 30 s or more for 250–300 files. The spike measures the
  realistic intake read path instead: one `git log --reverse -M -z --name-status` over the range,
  each file's chain through renames derived from it, every blob read through the persistent
  `cat-file --batch` process of the adapter (G-08, pipelined), the working-tree side from the G-07
  result, and the adapter's line matching (`spikes/parse/attribution.ts`). The unit test
  `test/unit/spikes/parse-spike.test.ts` checks that it attributes the same lines as the adapter.
  `--g09 adapter` measures the adapter's per-file calls instead (7 at a time), for comparison.

## Results per benchmark change (WebAssembly grammars)

Host: — (reference machine, `bench/README.md`). Date: —. Workers: —. Heap limit per worker: — MiB.
G-09 read path: —.

| Benchmark change | Changed files (deep) | Sides parsed | Rename search set (files) | Max git reads | Max parse | Max extraction | Max wall-clock (run) | Peak resident memory | Workers | Result (≤ 60 s, ≤ 1 GiB) | Margin time | Margin memory | Report |
| ---------------- | -------------------: | -----------: | ------------------------: | ------------: | --------: | -------------: | -------------------: | -------------------: | ------: | ------------------------ | ----------- | ------------- | ------ |
| bench-ts         |                    — |            — |                         — |             — |         — |              — |                    — |                    — |       — | NOT YET MEASURED         | — s (— %)   | — MiB (— %)   | —      |
| bench-py         |                    — |            — |                         — |             — |         — |              — |                    — |                    — |       — | NOT YET MEASURED         | — s (— %)   | — MiB (— %)   | —      |
| bench-cs         |                    — |            — |                         — |             — |         — |              — |                    — |                    — |       — | NOT YET MEASURED         | — s (— %)   | — MiB (— %)   | —      |

Per-run values (5 runs per change) are in the reports named in the last column.

## Outcome for C001-T-024

- WebAssembly grammars: NOT YET MEASURED (pass or miss against ≤ 60 s and ≤ 1 GiB, with the margin
  left, per benchmark change).
- Native-module alternative (native tree-sitter binding behind the same parser port, task step 4):
  measured only after a miss of the WebAssembly grammars, with the same runs and the same pass
  condition. Not built.

## Smoke test of the harness (not a measurement)

A tiny generated repository (5 files in TypeScript, Python and C#, 2 commits, a rename and a file
move), `npm run bench -- spike-parse --repo <fixture> --base <base> --name smoke-fixture --runs 2
--workers 2`: both runs finished, every phase ran, 8 sides parsed with no parse failure, G-09
batched gave the same attribution as the adapter. It shows that the harness works, nothing about
the supported size.
