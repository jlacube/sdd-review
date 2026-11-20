# Spike C001-T-014 input: read times of G-07 and G-09

Measured by C001-T-006 with `npx tsx spikes/parse-speed-memory/measure-git-reads.ts 3`. This file is
input for C001-T-014; it records measurements and does not judge them against C001-NFR-001.

**Host:** Windows 11 10.0.26200, Intel Core i7-10510U 1.80 GHz (8 logical cores), 16 GiB, Node.js
22.13.0, git 2.45.1 (Git for Windows). One host, one git version; Linux, macOS, git 2.34.0 and 2.56.1 not
measured. Fixture on the system temp directory (NTFS), generated, not one of the benchmark
repositories of C001-T-013.

**Fixture (C001-IF-012 §5 size):** 2,500 TypeScript-like files, 500,000 lines; 300 files changed against
the base commit with 9,900 added lines: 100 files edited in each of two commits and 100 in the working
tree (uncommitted). No file under a clean filter. Three runs each.

| Operation                                            | Run 1  | Run 2  | Run 3  | Note                                                                                                      |
| ---------------------------------------------------- | ------ | ------ | ------ | --------------------------------------------------------------------------------------------------------- |
| G-07 `changeAgainst(base)`, whole change             | 846 ms | 682 ms | 667 ms | reads and hashes all 2,500 working-tree files at every call (§5), 300 changed files with their base blobs |
| G-09 `attributeLines`, 300 files one after the other | 36.0 s | 35.5 s | 35.1 s | median 120 ms and maximum 136 ms per file                                                                 |

Reading of the numbers (not a verdict):

- G-07 is about 0.7 s on this host and grows with the checked-out working tree, as §5 says.
- G-09 costs about 120 ms per file here, dominated by the git processes it starts for each file
  (`log --follow` and `config --list`, about two spawns, tens of milliseconds each on Windows); the line
  matching itself is small. Called per file for 300 files it is 35 s, which C001-T-014 should weigh
  against C001-NFR-001 before intake calls it that way.
- Options for C001-T-014 if that is too slow, none implemented: one `log` over the whole range with all
  changed paths and `--name-status` instead of one `--follow` per file; reading the configuration once
  per intake instead of once per file; a cache of the blob chain per file.
