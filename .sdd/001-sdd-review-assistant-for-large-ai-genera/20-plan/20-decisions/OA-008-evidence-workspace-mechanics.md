---
id: "C001-OA-008"
artifact: plan/option-analysis
change: "CHG-001"
phase: 20-plan
status: draft
---
# OA-008 — Evidence-workspace mechanics

## Problem

C001-CON-22 leaves to one ADR how an evidence workspace is filled and where it lies, which ignored
paths of the working tree are made available and how, how package links, git metadata and
submodules are handled, how Python project modules load from the workspace (C001-IF-013 §2
item 7), how the mutation copy is made self-contained (§2 item 3), how mutation testing keeps
capacity free for bundle runs (§1 item 4), how the working tree is observed (§9 items 3 and 4),
and which measurements and kill tests show the result against C001-NFR-018 and C001-AS-08. The
guarantee itself is fixed by the specification: nothing the analysis core supplies leads into the
working tree or the git directory (C001-REQ-521, §9 item 1), no compiled or transformed form of
the project's files comes from the working tree (C001-REQ-509, §2 item 4), and no process of the
review assistant downloads anything at run time (C001-CON-11). The fork that separates real
alternatives is how a workspace gets the project's installed third-party dependencies
(`node_modules/`, restored packages, virtual environments): it decides how exposed the guarantee
is, whether the tests run in a workspace at all (C001-AS-02, C001-NFR-005) and the time that
C001-AS-08 leaves without a threshold. The other mechanics (location, fill, reset and check,
Python redirection, observation, CPU capacity) are common to the candidates unless a candidate
says otherwise; C001-ADR-006 sets them. Out of scope: coverage adapters and mutation tools
(C001-OA-009), the review state store location and the git access implementation (architect A's
ADRs of this plan).

## Criteria

| Criterion | Weight (%) |
|---|---|
| Working-tree guarantee and snapshot fidelity | 30 |
| Evidence available without extra developer work | 20 |
| Short time to the first test result and to the mutation copy | 20 |
| Portability over the supported operating systems | 10 |
| Simplicity and reversibility | 20 |

- **Working-tree guarantee and snapshot fidelity** — nothing the core makes available leads into
  the working tree or the git directory, no run can write a working-tree file through the
  workspace, no working-tree build output enters, and the dependencies match what the developer
  runs (C001-CON-22, C001-REQ-509, C001-REQ-521).
- **Evidence available without extra developer work** — the developer's usual test command runs
  in a workspace and produces results, also offline (C001-AS-02, C001-NFR-005, C001-NFR-013).
- **Short time to the first test result and to the mutation copy** — preparation and cold build
  of a session (C001-AS-08) and the copy that counts in C001-NFR-018 (b).
- **Portability** — an implementation on every operating system of C001-CON-15.
- **Simplicity and reversibility** — constitution principles 1 and 2; parts that can be added
  later without undoing earlier ones.

## Candidates

- **1 — Copy-in with copy-on-write** — snapshot files written from git objects and the store; a
  fixed list of ignored dependency directories copied from the working tree, as copy-on-write
  clones where the file system supports them and as byte copies elsewhere, with transform caches
  left out and links retargeted into the workspace; Python dependencies stay in the developer's
  selected environment and project modules are redirected by an import hook; .NET packages come
  from the NuGet global packages folder, which lies outside the working tree.
- **2 — Dependency cache keyed by lock files from the start** — as 1, but the copied dependency
  directories are kept in a cache outside the working tree, keyed by the content of the snapshot's
  package manifests and lock files, and cloned into each workspace; workspaces are kept across
  sessions (the first and third mitigations of C001-IF-013 §8 item 3, adopted at once).
- **3 — Snapshot files only (do less)** — the workspace holds the snapshot's files and nothing
  else; the developer's test command must install or restore what it needs (for example
  `npm ci && npm test`).
- **4 — Offline install per workspace** — the analysis core runs each package manager's install
  in offline mode in every new workspace (`npm ci --offline`, `pnpm install --offline`, Yarn with
  network disabled, `dotnet restore` from the global packages folder); Python as in 1.
- **5 — Links into the working tree** — symbolic links or junctions from the workspace to the
  working tree's `node_modules/` and package folders.

Also searched, not scored: overlay file systems (Linux overlayfs, Windows Projected File System,
macFUSE) have no implementation on all three operating systems without elevated rights or a
component that is not permissively licensed (C001-CON-15, C001-CON-07); a git worktree is excluded
by C001-CON-22.

## Scores

| Candidate | Working-tree guarantee and snapshot fidelity | Evidence available without extra developer work | Short time to the first test result and to the mutation copy | Portability over the supported operating systems | Simplicity and reversibility | Weighted |
|---|---|---|---|---|---|---|
| Weights | 30 | 20 | 20 | 10 | 20 | 100 |
| 1 — Copy-in with copy-on-write | 5 | 4 | 3 | 4 | 4 | 4.10 |
| 2 — Dependency cache keyed by lock files from the start | 4 | 4 | 5 | 4 | 2 | 3.80 |
| 3 — Snapshot files only (do less) | 5 | 1 | 2 | 5 | 5 | 3.60 |
| 4 — Offline install per workspace | 3 | 2 | 2 | 4 | 2 | 2.50 |
| 5 — Links into the working tree | 1 | 5 | 5 | 3 | 4 | 3.40 |

Justifications (sources: section Sources; none opened in this session):

- **1 — Copy-in.** Guarantee 5: a clone or byte copy is an independent file, so a run writes only
  the workspace; links are retargeted; the copy leaves out transform caches such as
  `node_modules/.cache` (C001-IF-013 §2 item 4). Evidence 4: tests run wherever the working tree
  has its dependencies installed; a working tree whose installed dependencies no longer match the
  snapshot's lock file makes tests fail visibly. Time 3: APFS (`clonefile`), Btrfs and XFS
  (`FICLONE`) and ReFS Dev Drives (block cloning) clone in seconds; ext4 (Ubuntu default) and NTFS
  (Windows default) need byte copies of up to a few gigabytes per workspace. Portability 4:
  copy-on-write where available, byte copy everywhere. Simplicity 4: one copier serves the
  workspace and the mutation copy; the mitigations of §8 item 3 can be added later without undoing
  it.
- **2 — Cache from the start.** Guarantee 4: the cache lies outside the working tree, but a cache
  entry filled from a working tree whose installed dependencies do not match the key is reused by
  later snapshots and sessions, so a mismatch outlives one session. Evidence 4 as 1. Time 5:
  clones from the cache and kept workspaces avoid most copying and cold builds. Simplicity 2:
  keys, eviction, disk quota, invalidation and locking between processes.
- **3 — Snapshot only.** Guarantee 5. Evidence 1: TypeScript/JavaScript test commands fail without
  `node_modules/`; an install in the test command needs the network in every session (offline CI
  of C001-NFR-013 gets no evidence). Time 2: every session pays a full install inside the test
  run. Portability 5, simplicity 5.
- **4 — Offline install.** Guarantee 3: the core itself starts installs that run package lifecycle
  scripts and that may try the network despite offline flags, which C001-CON-11 forbids for
  processes of the review assistant. Evidence 2: an incomplete package cache fails the install;
  Python still needs the hook of 1. Time 2: 20 s to several minutes per workspace. Simplicity 2:
  one code path per package manager and flag set (npm, pnpm, Yarn classic and Berry, Bun, NuGet).
- **5 — Links.** Guarantee 1: a run that writes into a linked `node_modules/` (caches, postinstall
  outputs) writes the working tree, and the link is a path the core made available that leads into
  it; violates C001-CON-22. Evidence 5, time 5. Portability 3: junctions on Windows, symbolic-link
  rights vary. Simplicity 4.

## Sensitivity

- **1 against 2 (gap 0.30).** 1 − 2 = w(guarantee) − 2·w(time) + 2·w(simplicity). Candidate 2 leads
  when 2·w(time) exceeds w(guarantee) + 2·w(simplicity), for example guarantee 25, evidence 20,
  time 35, portability 10, simplicity 10 (2 at 4.15, 1 at 3.90). Such weights are plausible only
  once measurements show C001-AS-08 failing; candidate 2 is then candidate 1 plus the cache
  mitigation of C001-IF-013 §8 item 3, which C001-ADR-006 keeps ready, so the choice of 1 does not
  block that path.
- **1 against 3 (gap 0.50).** 1 − 3 = 3·w(evidence) + w(time) − w(portability) − w(simplicity).
  With the other three of these weights unchanged (the remainder moved to the guarantee, on which
  both score 5), candidate 3 leads only when evidence availability weighs below about 3 %, which
  contradicts C001-AS-02 and the open-share target C001-NFR-005; not plausible.
- **Score risk.** If byte copies on NTFS and ext4 turn out slower than a minute per workspace, the
  time score of 1 drops to 2 (total 3.90) and 1 still leads 2 by 0.10 on these weights; the
  measurement W1 of C001-ADR-006 decides whether the cache mitigation is adopted.

## Presented

1. **1 — Copy-in with copy-on-write** (4.10) — recommended.
2. **2 — Dependency cache keyed by lock files from the start** (3.80) — faster sessions at the cost
   of a cache to manage.
3. **3 — Snapshot files only** (3.60) — the do-less option.

## Recommendation

**1 — Copy-in with copy-on-write**: it keeps the working-tree guarantee whole while the
developer's usual test command runs in the workspace, works on every supported operating system,
and leaves the cache and workspace-reuse mitigations of C001-IF-013 §8 item 3 as later additions
when the C001-AS-08 measurement asks for them. No near tie applies (lead 0.30 over 2).

## Rejected

- **4 — Offline install per workspace** (2.50) — the core would start package installs that run
  lifecycle scripts and can reach the network (C001-CON-11), and an incomplete cache fails them.
- **5 — Links into the working tree** (3.40) — a path the core makes available would lead into the
  working tree, so a run can write working-tree files; violates C001-CON-22 and C001-REQ-521.

## Sources

Not opened in this session (2026-11-18); facts from the architect's knowledge, to be confirmed by a
research note before the plan gate:

- `clonefile(2)` man page, macOS (directory hierarchies are cloned recursively on APFS).
- `ioctl_ficlone(2)` man page, Linux (Btrfs, XFS with reflink, bcachefs; not ext4).
- Microsoft Learn, "Block cloning on ReFS" and "Dev Drive" (Windows 11; `CopyFile2` uses block
  cloning on ReFS from Windows 11 24H2).
- npm, pnpm and Yarn documentation on `node_modules` layout, workspace links and Plug'n'Play files.
- NuGet documentation, "Managing the global packages, cache, and temp folders".
