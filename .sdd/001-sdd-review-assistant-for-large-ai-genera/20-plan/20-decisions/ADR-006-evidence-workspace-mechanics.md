---
id: "C001-ADR-006"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: accepted
date: 2026-11-18
deciders: ["P-01"]
amended: 2026-11-19
---
# C001-ADR-006 — Evidence-workspace mechanics

> **Amended on 2026-11-19** (Amendments 1 and 2 at the end of this file): Amendment 1 aligns it
> with the specification re-approved at G2 on 2026-11-19; Amendment 2 records the measurement
> results outside this ADR. The decision is unchanged.

## Context and problem

Every evidence run happens in an evidence workspace outside the working tree and the git
directory (C001-CON-22, C001-IF-013 §2). The specification fixes the guarantee (C001-REQ-521,
C001-IF-013 §9 item 1), the content of a workspace (§2 item 1), the reset and check (§2 item 3,
§3), the mutation copy (§2 item 3), the Python import rule (§2 item 7), the detection notices
ERR-EVID-009 and ERR-EVID-010 (C001-REQ-523, C001-REQ-524) and where each workspace step counts
in C001-NFR-018 (§8). It leaves to this ADR the location, the filling, the ignored paths made
available, package links, git metadata, submodules, the Python redirection mechanism, the
self-contained copy, the means that keep CPU capacity free, the observation mechanism with its
per-OS causes of incomplete observation, and the measurements and kill tests. Without this
decision each implementer of C001-COMP-011 would choose, and the guarantee, C001-NFR-018 (a) ≤ 3.0,
(b) ≤ 60 min and (c) ≤ 1 s, and assumption C001-AS-08 would rest on untested choices.

Dependencies on other decisions: C001-ADR-001 (Node.js; native calls for `clonefile`, `FICLONE`,
inotify, FSEvents and `ReadDirectoryChangesW`, and a watcher binding that exposes overflow and drop
flags), C001-ADR-004 (blob reads with git's checkout end-of-line conversion, reads from submodule
repositories) and C001-ADR-005 (where the sweep of §1 runs). The coverage adapters and load
monitors that this ADR uses are set by C001-ADR-007.

## Considered options

Options analysis: `OA-008-evidence-workspace-mechanics.md` (C001-OA-008).

- **Copy-in with copy-on-write** (4.10) — dependencies copied from the working tree as clones or
  byte copies, links retargeted, Python redirected by an import hook.
- **Dependency cache keyed by lock files from the start** (3.80) — the same, with a persistent
  cache and kept workspaces.
- **Snapshot files only** (3.60) — no ignored path made available.

Rejected there: offline install per workspace (2.50) and links into the working tree (3.40,
violates C001-CON-22).

## Decision outcome

**Accepted by P-01 on 2026-11-18.** Question Q-workspace-02 (`20-plan/questions-log.md`, round 2),
answer: "Copy-on-write copy-in (Recommended)".

Chosen: **copy-in with copy-on-write**. It keeps the guarantee whole, lets the developer's usual
test command run in the workspace on every supported operating system, and keeps the C001-IF-013
§8 item 3 mitigations (dependency cache, kept workspaces) as additions that the C001-AS-08
measurement can trigger without undoing anything. The mechanics below apply to it. The
measurements W1 to W5 and the kill tests K1 to K6 of §11 are preconditions of this acceptance, as
C001-CON-22 requires.

## Design

### 1. Location, naming and lifetime

- **Evidence root:** `%LOCALAPPDATA%\sddr\` on Windows, `~/Library/Caches/sdd-review/` on macOS,
  `$XDG_CACHE_HOME/sdd-review/` (default `~/.cache/sdd-review/`) on Linux; owner-only permissions.
  Not `/tmp`, which is a RAM file system on some distributions. The short Windows name keeps
  workspace paths below the 260-character limit that tools without long-path support hit.
- **Check before use:** the resolved real path of the evidence root must lie outside the
  working-tree root, the git directory and the common git directory (C001-IF-012 G-01) and below
  none of them (for example when the home directory is itself a working tree). Otherwise the OS
  temporary directory is tried with the same check; if it fails too, no workspace is prepared and
  the run reports ERR-EVID-002 with that cause.
- **Layout:** `<evidence root>/<repository key: 16 hex>/<snapshot key: 12 hex>/` holds run
  workspaces `w00` to `w99` and mutation copies `m00` to `m99`. A run workspace and its mutation
  copy therefore have root paths of equal byte length, which item 7 relies on. Each workspace has
  a sibling `<name>.aux/` for files the core gives to a run (adapter configuration, coverage data,
  reports, the Python bytecode prefix) and a sibling `<name>.owner` with the owning process ID,
  its start time and the workspace state (preparing, free, in run, copying, mutation). The
  workspace itself holds only snapshot files and ignored paths, so the check of C001-IF-013 §3
  never sees these files.
- **Runtime files:** adapter and hook files (C001-ADR-007) are written at process start to
  `<evidence root>/runtime/<release>/`, so that no environment variable names the installation
  directory, which may lie in the working tree's `node_modules/`.
- **Lifetime:** workspaces belong to the process that runs the snapshot's jobs and are removed when
  it ends (§2 item 3). When a process opens a snapshot's review state, it removes every workspace
  of that snapshot whose owner process no longer runs (§2 item 6). A removal that fails, for
  example on Windows while a left-over build server holds a handle, is retried at the next sweep.
- **Disk space:** before filling or copying, free space is checked against the expected size
  (snapshot files, the directories to copy, and for a copy the source workspace) with 20 % margin;
  too little space fails the preparation (ERR-EVID-002) or the copy (ERR-EVID-006) before writing.

### 2. Filling, resetting and checking

- **Fill:** the file list is the base commit's tree (C001-IF-012 G-13) without the files the change
  deletes, plus every added, modified and renamed file of the snapshot. Base content comes from
  G-08, snapshot content from the store (C001-COMP-014). Git's built-in checkout end-of-line
  conversion is applied with the repository's settings and the snapshot's `.gitattributes`; no
  filter, `ident` or textconv program runs (C001-IF-012 §2). Modes: executable bit on macOS and
  Linux; symbolic links as links, and on Windows, when the process cannot create links (no
  Developer Mode or privilege, tested once per process), as a regular file holding the link
  target, which is what a checkout with `core.symlinks=false` gives. Files are written in parallel.
- **Index:** after the fill the evidence runner keeps, per path, size, modification time, change
  time (POSIX), file ID and SHA-256.
- **Reset and check:** during each run a recursive watcher on the workspace (same mechanisms as
  item 9, limited to directories that the ignore rules do not exclude) records touched paths.
  After the run, only touched paths are compared with the index (stat first, SHA-256 when the stat
  differs). When the workspace watcher reports lost events, a full walk with the same comparison
  replaces it. The reset before a run rewrites differing snapshot paths and removes extra paths
  that the ignore rules do not exclude, as §2 item 3 states; since the check after one run is the
  check before the next (§3 item 1), consecutive bundle commands cost one touched-path check each.
- **Ignore rules:** the snapshot's `.gitignore` files, the repository's `info/exclude` and
  `core.excludesFile`, read once at intake through C001-COMP-003; evaluated in process with git's
  semantics (an excluded directory excludes everything below it).

### 3. Ignored paths made available

Only paths that the ignore rules exclude are made available, so the check is not disturbed. The
built-in list (not configurable in this release; review configuration C001-IF-004 has no such
setting):

| Ecosystem | Made available | How |
|---|---|---|
| TypeScript/JavaScript | every `node_modules/` directory next to a `package.json` of the snapshot; Yarn Plug'n'Play files `.pnp.cjs`, `.pnp.loader.mjs`, `.pnp.data.json`, `.yarn/cache/`, `.yarn/unplugged/`, `.yarn/install-state.gz` | copied (item 3.1) |
| Python | nothing | third-party distributions come from the environment that the developer's environment selects (§2 item 7); a virtual environment stays where it is |
| C#/.NET | nothing by default; a packages folder that a `nuget.config` of the snapshot places under the working-tree root (`globalPackagesFolder`, `repositoryPath`, a local feed directory) and that the ignore rules exclude | copied (item 3.1); otherwise packages come from the NuGet global packages folder in the user profile, and the test command's implicit restore produces `obj/` in the workspace |
| any | no local settings (`.env*` files and similar) | a test that needs one fails visibly; adding them is a later change of C001-IF-004 |

- **3.1 Copier:** copy-on-write clone where source and destination share a file system that
  supports it (APFS `clonefile`, which clones a directory tree in one call; `FICLONE` on Btrfs, XFS
  and bcachefs; block cloning on ReFS), else a parallel byte copy (`copy_file_range` on Linux).
  Hard links are never used: a write through one would change the working-tree file. Modification
  times are preserved.
- **3.2 Left out of every copy** (transform caches and generated code of the project's own files,
  C001-IF-013 §2 item 4): `node_modules/.cache/`, `.vite/`, `.vite-temp/`, `.vitest/`, `.prisma/`
  inside any copied `node_modules/`; `obj/` and `bin/` are never copied. A package that writes
  other compiled forms of project files into `node_modules/` during its own installation is a
  residual risk; the load monitors of C001-ADR-007 report execution of files that are not at a
  snapshot path.

### 4. Symbolic links and package links

- In every copied directory, each symbolic link or junction is resolved to its final target.
  A target under the working-tree root is retargeted to the same relative path under the
  workspace root (npm and pnpm workspace links, `npm link` chains, `file:` directory
  dependencies); a target under the git directory is not created; a target elsewhere (the pnpm
  store, a global tool folder) is kept. Relative links that stay inside the copy are kept as they
  are.
- A symbolic link of the snapshot whose target leads under the working-tree root is written with
  the equivalent target under the workspace root (the check compares against that target); a
  snapshot link whose target leads into the git directory makes the preparation fail with
  ERR-EVID-002, since writing it would hand the run a path into the git directory.
- .NET project references are relative and resolve inside the workspace. An absolute path in a
  project file (a `HintPath`, an imported `.props` or `.targets`) is the project's own
  configuration (C001-IF-013 §9 item 2); execution through it is reported with ERR-EVID-008.

### 5. Git metadata and submodules

- **Git metadata: none.** The workspace has no `.git`. Each command gets `GIT_CEILING_DIRECTORIES`
  set to the parent of the workspace root (prepended to any value already set), so a git command in
  the workspace finds no repository above it, including one whose working tree happens to contain
  the evidence root. Builds that read their version from git history degrade (MinVer falls back to
  a default version; GitVersion fails); a synthetic one-commit repository written by the core is
  the follow-up if a benchmark repository needs one. Git location variables that the developer's
  environment already sets (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and others) are left
  unchanged, as C001-IF-013 §1 item 1 requires; see Consequences.
- **Submodules:** each submodule path (gitlink in G-13) is filled from the commit that the snapshot
  records, read from the submodule's own object database through C001-COMP-003, recursively. When
  that commit is not available locally, the path stays an empty directory, as an uninitialised
  submodule would, and the cause is logged (no notice code exists for it; recorded as defect D-006
  in `change.md`, Q-specfix-01).

### 6. Python project modules load from the workspace (C001-IF-013 §2 item 7)

- **Means:** every evidence run gets `PYTHONPATH` with `<runtime>/python` prepended, holding a
  `sitecustomize.py`, and `SDDR_RUN` naming the run's configuration file in `<name>.aux/` (the
  working-tree root, the other evidence-workspace roots of the snapshot, the current root and the
  list of snapshot paths). CPython's `site` processes `.pth` files of the environment, including
  editable-install path entries and import finders of setuptools, Poetry, uv and Hatch, before it
  imports `sitecustomize`, so the hook runs after them.
- **Redirection:** the hook installs (a) a path hook for every import-path entry under the
  working-tree root or under another workspace root of the snapshot, which finds a module first at
  the same relative path in the current workspace when that path is a snapshot file, and otherwise
  in the original directory (so an ignored generated file such as `_version.py` still loads); and
  (b) a meta-path wrapper placed first, which rewrites the spec of an editable-install finder whose
  origin lies under those roots and is a snapshot file, and maps package search locations the same
  way. Third-party distributions are untouched. A `sitecustomize` that the environment already has
  is executed after the hook.
- **Bytecode:** `PYTHONPYCACHEPREFIX` points into `<name>.aux/`, so processes that honour the
  environment write no `__pycache__` next to working-tree modules and the mutation copy starts with
  no stale bytecode.
- **Limit:** a process started with `-I` or `-E` ignores both variables (C001-IF-013 §2 item 7); the
  load monitor of C001-ADR-007 does not run in it either, so its execution is neither redirected nor
  counted. Every path the hook names lies outside the working tree and the git directory, and it
  downloads nothing.

### 7. Mutation copy (C001-IF-013 §2 item 3)

1. When the test run's check after the run passes, the workspace enters the copy window and the
   copier of item 3.1 copies it, ignored paths included, to the mutation copy `m<nn>` with the same
   number as `w<nn>`.
2. **Root rewrite:** in every file of the copy that the test run created or changed in ignored
   paths (found by comparing with the index and the copy list of item 3; for example `obj/`,
   `bin/`, `dist/`, a virtual environment that `uv run` created in the workspace, `.pth` files,
   editable-install finders, script headers), each occurrence of the test run's workspace root is
   replaced by the copy's root, in UTF-8 and, on Windows, in UTF-16LE and with both separators.
   The two roots have equal byte length, so binary files keep their offsets. Copied dependency
   directories are not scanned: they were made available from the working tree and retargeted in
   item 4, and they never name a workspace root.
3. **Links:** links of the copy that lead into the test run's workspace are retargeted to the copy.
4. **Python:** the hook of item 6 in the copy redirects origins under the working-tree root and
   under every other workspace root of the snapshot, the test run's included.
5. **Check:** the self-containment check (C001-IF-013 §5 item 4) is the load monitor of
   C001-ADR-007 attached to the mutation tool's own first unmutated run, so it adds no test run of
   its own except for the engine that has no such run (C001-ADR-007).
6. The copy is removed when mutation testing of the snapshot ends; a failed copy is removed and
   the mutation evidence is unavailable (ERR-EVID-006).

### 8. CPU capacity for bundle runs (C001-IF-013 §1 item 4)

The means of §1 item 4 are kept: the mutation tool gets at most one worker fewer than the logical
CPU cores, and at least one (7 on the reference machine). Its processes run in a lower priority:
`nice` 10 on Linux and macOS (plus I/O priority best-effort 7 on Linux), and a Windows job object
with the below-normal priority class. The macOS background policy is not used, because it confines
processes to efficiency cores on Apple silicon and would lengthen (b) out of proportion.

### 9. Working-tree observation (C001-IF-013 §9 items 3 and 4)

- **Mechanism: a persistent change-notification observer** per process, started before the first
  evidence run and kept until the process ends; each run records the observer's event position at
  its start and end. A per-run comparison of size, modification time and existence was rejected:
  walking a working tree with installed dependencies (often over 200,000 entries) per command would
  break (c). Events outside every run window only keep the watch tables current; a loss between
  runs triggers a rebuild at low priority, and a run that starts while it is not complete reports
  the affected part as "observation interrupted".
- **Scope:** working-tree part = every path under the working-tree root, ignored paths included,
  outside the git directory; repository part = `index`, `HEAD`, `packed-refs`, `refs/` and
  `reftable/` of the git directory and the common git directory (linked worktrees included).
  Lock files (`*.lock`) are not reported; their rename onto the target is.
- **End of a run:** the observer is drained after the command's process ends: inotify queue read
  until empty, `FSEventStreamFlushSync` and the event ID window on macOS, repeated non-blocking
  `ReadDirectoryChangesW` reads on Windows until none returns data.

| Cause (§9 item 4) | Linux (Ubuntu 22.04+) | macOS 14+ | Windows 11 |
|---|---|---|---|
| Mechanism | inotify, one watch per directory; a directory created during a run is watched, then listed | FSEvents stream per root with file-level events | `ReadDirectoryChangesW` with subtree on the working-tree root, and on git directories outside it; 64 KiB buffer |
| not readable | adding a watch or listing fails (EACCES, EPERM); directory on NFS, SMB/CIFS, FUSE or 9p/drvfs (by `statfs` type), which notify local changes only | directory not listable at start; volume of type smbfs, nfs, afpfs, webdav or a FUSE file system | directory handle cannot be opened or listed; path on a `\\wsl$` share or a file system that rejects the call |
| watch limit | `inotify_add_watch` fails with ENOSPC (`max_user_watches`), or `inotify_init1` with EMFILE (`max_user_instances`) | never raised: FSEvents has no per-watch limit | never raised: one handle per root; a root handle that cannot be opened counts as not readable |
| events lost | `IN_Q_OVERFLOW`: cannot be placed, whole part | `MustScanSubDirs` (also with `UserDropped` or `KernelDropped`): the named subtree is the top-most path, the whole part when it is the root | completion with zero bytes or `ERROR_NOTIFY_ENUM_DIR`: whole part of that handle |
| observation interrupted | observer failure; `IN_DELETE_SELF`, `IN_MOVE_SELF` or `IN_UNMOUNT` on a root | `RootChanged`, stream invalidated, observer failure | handle error after a root is moved or removed, observer failure |

No fallback comparison is made after lost events in this release: the part is reported with
ERR-EVID-010 and the observer is rebuilt.

### 10. Time budget and the question of (b) against (c)

Planning estimate for the reference machine, to be replaced by measurement W2 to W4:

- **(c):** per bundle command the core adds a touched-path reset and check (milliseconds when the
  command writes nothing), the shell start (about 5 ms with `/bin/sh`, 30 to 60 ms with `cmd.exe`),
  the observer drain (under 50 ms) and the save of the result as a revision (C001-COMP-014; tens to
  a few hundred milliseconds for the document set of a 10,000-line change). Estimated 0.2 to 0.5 s,
  below 1 s in both states, because the mutation workers run at lower priority on one core fewer.
- **(b):** about 4,000 to 6,000 mutants on the executed changed lines of a 10,000-line benchmark
  change; with 7 workers and 60 min, the budget per mutant is about 4 s after the copy and the
  first unmutated run. StrykerJS with per-test selection typically needs well under 1 s per
  mutant; Stryker.NET with VSTest and the Python engine of C001-ADR-007 need 1 to 3 s, which is
  within the budget but with little margin. A byte copy on NTFS or ext4 can take several minutes.
- **Conclusion:** the analysis shows no conflict between (b) and (c); both can hold, with the
  smallest margin for (b) on the C#/.NET and Python benchmarks. If measurement shows (b) above
  60 min with one core kept free while (c) holds only with it kept free, the conflict goes back to
  P-01 and this ADR relaxes neither threshold (C001-CON-22).

### 11. Measurements and kill tests

These measurements and kill tests are preconditions of the accepted decision (C001-CON-22). Their
results are pending: they need the evidence runner, so a spike task of milestone 1 takes them and
records each result in this section; recording results adds evidence and does not change the
decision. A failed pass condition is handled as follows: W1 above 3.0 triggers the mitigations
below; a conflict between (b) and (c) goes back to P-01 as §10 states, and this ADR relaxes neither
threshold; any other failure that needs a different mechanism goes back to P-01 and is settled by
a new ADR that supersedes the affected part. Each measurement and kill test runs on every benchmark
change of C001-NFR-005 §0 in its environment; thresholds apply on the reference machine, reports
come from every operating system of C001-CON-15.

| Label | What is measured or tested | Pass condition |
|---|---|---|
| W1 | Preparation time, and the time from its start to the first test results divided by the test command in the developer's built working tree (C001-AS-08) | reported; above 3.0 triggers the mitigations below |
| W2 | (a) with reset, checks and observation in the measured run, 3 runs | ≤ 3.0 |
| W3 | (b) with the copy, root rewrite, self-containment check and 7 workers; copy time, mutant count and mean time per mutant reported | ≤ 60 min |
| W4 | (c) with 10 fixed-text commands, at least one run during and one after mutation testing; split into reset, checks, observation, shell start and save | ≤ 1 s per command |
| W5 | Full and touched-path workspace check on a 500,000-line tree; observer set-up on a working tree with installed dependencies; per-run observation cost | reported; inputs to W2 and W4 |
| K1 | The core process killed (SIGKILL, `TerminateProcess`) at 20 random points during mutation testing; every working-tree path (ignored paths included: existence, mode, SHA-256), `index`, `HEAD`, `packed-refs` and refs compared before and after | identical |
| K2 | As K1, during a test run and during a bundle run | identical |
| K3 | Manifest of the test run's workspace, ignored paths included, before the copy and after mutation testing | identical |
| K4 | Python benchmark with the project installed in editable mode from the working tree into the active environment (C001-CON-22) | passing tests recorded for its changed lines; no ERR-EVID-008 |
| K5 | Per deep ecosystem, project installed in editable mode in the test run's workspace where its tests need it: a mutant applied in the copy on a line a passing test executes | mutant killed; self-containment check reports no file |
| K6 | Lowered `max_user_watches` (Linux), 100,000 files created in the working tree during a run, an unreadable directory, the working-tree root renamed during a run | each cause raised as in item 9; no ERR-EVID-009 for paths that did not change |

**Mitigations when C001-AS-08 fails** (W1 above 3.0), in this order, each measured again: (1) a
dependency cache outside the working tree keyed by the snapshot's package manifests and lock files
(when copying dominates); (2) keeping a snapshot's run workspaces with their build outputs across
review sessions, reset and checked before every run (when the cold build dominates); (3) filling a
new workspace with build outputs of earlier runs of the same base commit, only with the per-build
rebuild proof that C001-IF-013 §8 item 3 requires. Working-tree build outputs are never used. If
the first test run still exceeds 3.0, a bound goes to P-01 as C001-AS-08 states.

## Consequences

- **Good:** the analysis core writes nothing in the working tree or the git directory for any run
  and hands no run a path into either; mutated code exists only in the copy; Python editable
  installs from the working tree no longer void test evidence; observation costs O(1) per command,
  which keeps (c) within reach; the mitigations of C001-IF-013 §8 item 3 stay available.
- **Bad:** byte copies of `node_modules/` on NTFS and ext4 cost disk space and minutes per
  workspace and per mutation copy; Windows Defender real-time scanning slows them further (a Dev
  Drive or an exclusion helps, but the tool changes no security setting); builds that need git
  history or ignored local settings fail in a workspace; a package that writes compiled project
  code into `node_modules/` at install time is not detected before the run.
- **Residual risk, proposed for a revision of C001-IF-013 §1 item 1:** when the review is started
  from a git hook, `GIT_DIR` and `GIT_INDEX_FILE` of the developer's environment reach the evidence
  commands unchanged, and a test that calls git then addresses the developer's repository; it is
  detected (ERR-EVID-009 on the index and refs) but not prevented. Removing the git location
  variables from evidence commands would close it but changes the "environment unchanged" rule.
  Recorded as defect D-004 in `change.md` (Q-specfix-01).
- **Not verified online in this session:** the operating-system facts this design relies on
  (copy-on-write support per file system, the notification flags and limits of inotify, FSEvents
  and `ReadDirectoryChangesW`, Windows block cloning and Dev Drive) and the package-manager layouts
  come from the architect's knowledge as of 2026-06 (C001-OA-008, Sources). The per-OS tasks and
  the spike of §11 confirm them; the licence check of C001-CON-07 (NFR-D-03) must confirm the
  licence of every native binding or library added for the copier and the observer.
- **Constraints:** realises the choices left open in C001-CON-22 within C001-CON-11, C001-CON-13,
  C001-CON-15 and C001-CON-18; no new constraint is added to the approved specification.
- **Components:** C001-COMP-011 (workspaces, copier, hook, observer), C001-COMP-003 (checkout
  conversion, submodule reads, ignore-rule inputs), C001-COMP-014 (snapshot content, sweep on
  open, revision save time inside (c)), C001-COMP-002 (job scheduling, copy window).
- **Follow-up tasks:** spike for W1 to W5 and K1 to K6 in milestone 1; observer per OS;
  copier with clone detection; Python hook; root rewrite; sweep of left-over workspaces.

## Amendment 1 — 2026-11-19: alignment with the revised specification

**Why.** This ADR raised defects D-004 and D-006, and C001-ADR-004 raised D-007, whose resolution
changed the fill rule (Q-specfix-01). The specification revision that closed them was re-approved
at G2 on 2026-11-19. It added:
- C001-REQ-525 and C001-IF-013 §1 item 7: git repository-locating variables;
- C001-REQ-526, C001-IF-013 §2 item 8, C001-IF-012 G-16 and ERR-EVID-012: submodules;
- C001-REQ-527 to C001-REQ-529, C001-IF-013 §2 items 1 and 3, C001-IF-012 G-15 and ERR-EVID-013:
  files under a clean filter.

These rest on P-01's answers to Q-filterworkspace-01, Q-cleanfilter-02 and Q-nonlfs-01
(`10-spec/questions-log.md`, rounds 14 to 16). C001-CON-22 now names the copier of this ADR for
those files, and asks this ADR to measure their copying and hashing at reset.

**What stays.** The decision is unchanged: copy-in with copy-on-write. P-01's acceptance of
2026-11-18 (Q-workspace-02) is unchanged, and the measurements and kill tests of §11 remain
preconditions of it. No new option was considered, so C001-OA-008 is unchanged. The text above
stays as it was accepted. Where it differs from this amendment, this amendment applies, and
C001-IF-013 is the contract for both.

| Passage above | Now |
|---|---|
| Context: what the specification fixes; the dependency on C001-ADR-004 | A1.1 |
| §1 Disk space | A1.4 |
| §2 Fill, Index, Reset and check | A1.4, A1.5 |
| §5 Git metadata: `GIT_CEILING_DIRECTORIES` "prepended to any value already set"; git location variables "left unchanged" | A1.2 (replaced) |
| §5 Submodules: "no notice code exists for it" | A1.3 |
| §10 Time budget | A1.5 |
| §11 Measurements and kill tests | A1.6, A1.7 |
| Consequences: "Residual risk, proposed for a revision of C001-IF-013 §1 item 1 …" | A1.2 (closed) |
| Consequences: Good, Bad, Constraints, Components, Follow-up tasks | A1.8 |

**A1.1 — Scope.** Besides the notices named in the Context, the specification now fixes
C001-REQ-525 to C001-REQ-529 and the notices ERR-EVID-012 and ERR-EVID-013. From C001-ADR-004, this
ADR also uses G-15 (index state of a file under a filter other than Git LFS) and G-16 (submodule
trees); see C001-ADR-004, Amendment 1, A1.7.

**A1.2 — Environment of evidence commands (C001-IF-013 §1 items 1 and 7, C001-REQ-525; D-004
closed).** This replaces both sentences of §5 on environment variables. Every command of an
evidence run gets its environment from the developer's, changed as C001-IF-013 §1 item 7 states.
That covers test commands, mutation tools, bundle commands and the runs that C001-ADR-007 starts in
a workspace. Before the command starts, the evidence runner:
- removes every variable on the "Removed" list of that item; on Windows, names match whatever
  their letter case;
- sets `GIT_CEILING_DIRECTORIES` to the parent of the workspace root alone, discarding the
  developer's value;
- keeps every other variable.

The "Removed" list is the fixed list of that item, built into the release. It is not taken from
the installed git at run time. A git command of project code in a workspace therefore finds no
repository, whether or not the review was started from a git hook. A command whose text sets a
removed variable again is the developer's own command (C001-IF-013 §1 item 6). This closes the
residual risk named in the Consequences.

**A1.3 — Submodules (C001-IF-013 §2 item 8, C001-REQ-526, ERR-EVID-012; D-006 closed).** This
completes §5 Submodules. Each submodule path is filled through G-16, one level of nesting at a time.
When G-16 gives a submodule as absent (no local repository, commit not in its repository, or
repository refused):
- the path stays an empty directory, the submodules nested in it are not read, and nothing is
  fetched;
- the workspace's state records the path with its recorded commit and the cause;
- each test run, mutation run and bundle command whose workspace holds such a path raises
  ERR-EVID-012. The mutation copy of §7 keeps the empty path, so mutation runs raise it too.

The workspace index of §2 records the empty directory, so the check of C001-IF-013 §3 compares
against it. A reset does not fill the path again (C001-IF-013 §2 item 3). A workspace prepared
later asks G-16 again.

**A1.4 — Filling files under a clean filter (C001-IF-013 §2 item 1, C001-REQ-527 to C001-REQ-529,
ERR-EVID-013; Q-filterworkspace-01, Q-cleanfilter-02, Q-nonlfs-01; D-007 closed).** This completes
§2 Fill. Its sentence "no filter, `ident` or textconv program runs" still holds. The evidence
runner writes the files that C001-IF-013 §2 item 1 covers as follows:
- **Covered files:** C001-COMP-003 gives the files of the snapshot that are under a clean filter,
  each with its driver (C001-IF-012 §7). The snapshot-side blob of each file comes from the
  snapshot (C001-COMP-014). A Git LFS file is covered only when that blob is a Git LFS pointer file
  (C001-TS-959).
- **Copy:** the copier of §3.1, applied to one file. It makes a copy-on-write clone where the file
  system supports one, else a byte copy, and never a hard link. It applies no end-of-line
  conversion, then sets the file mode of the snapshot side. It reads the working-tree file and
  writes only in the workspace.
- **Git LFS file:** after the copy, the runner reads the copy in the workspace and compares its
  SHA-256 hash and size with the `oid` and `size` of the pointer file. On a match the copy stays,
  and the workspace index of §2 records that hash. Otherwise the stored form replaces the copy.
  The repository's index is not read.
- **File under another filter:** the runner reads G-15 before the copy: the file must be up to
  date, with an entry that records the snapshot-side blob. It makes the copy, then reads G-15
  again: the file must still be up to date, with the same blob and the same stat data as before.
  Otherwise the file gets its stored form. The limit of C001-IF-012 §7 item 8, which P-01 accepted
  with Q-nonlfs-01, applies: in the cases it names, the checks pass for edited bytes.
- **Stored form:** the snapshot-side blob, written like any other file of the fill (for Git LFS the
  pointer file, for git-crypt the encrypted content). A file also gets its stored form when the
  working tree holds no file at its path (for example a path outside the sparse checkout) or when
  it cannot be read. The workspace's state records each file in its stored form, with its driver
  and cause. Every run in that workspace raises ERR-EVID-013. The mutation copy of §7 copies the
  test run's workspace, so it raises the notice for the same files.
- **Disk space (§1):** the expected size counts each covered file at its working-tree size. For a
  Git LFS file this can be far above the size of its pointer file.
- **No lasting copy:** working-tree bytes of covered files exist only inside workspaces
  (Q-filterworkspace-01).

**A1.5 — Reset, check and time (C001-IF-013 §2 item 3, §3, §8).** This completes §2 Reset and
check, and §10.
- **Reset:** before each run, the reset also writes again, by A1.4, every covered file that holds
  its stored form. Such a file gets its working-tree copy once its checks pass. A covered file that
  holds its working-tree copy, and that the check finds unchanged, is not copied again.
- **Check:** the workspace index holds the content that A1.4 gave each file, so the check compares
  each workspace with its own content. Workspaces of one snapshot can therefore differ
  (C001-IF-013 §2 item 1).
- **Time:** at fill, the cost of covered files belongs to preparation, outside every threshold
  (C001-IF-013 §8 item 3). At a reset, the rewriting, G-15 reads and hashing count in (a) and (c).
  In the mutation copy they count in (b) (C001-IF-013 §8 items 1, 2 and 4).

A reset adds nothing for covered files while none holds its stored form. The estimate of §10
therefore stands for repositories without such files.

**A1.6 — Measurement W6 (C001-CON-22).** C001-CON-22 now asks this ADR to measure reset including
the copying and hashing of files under a clean filter. The reference repositories of the benchmark
changes consist of files under no clean filter (C001-IF-012 §5, `30-nfr/nfr.md` §0). The spike of
§11 therefore adds:

| Label | What is measured or tested | Pass condition |
|---|---|---|
| W6 | On a fixture made from a benchmark change of C001-NFR-005 with added Git LFS files and files of another filter: fill and reset time, once with every covered file in its working-tree copy and once with every covered file in its stored form; the share of (a) and (c) that these resets take | reported; input to W2 and W4 |

K1 and K2 also run on this fixture, so the kill tests cover the copier's reads of covered files.
The results of W6 and of these runs are recorded as Amendment 2 states (A2.1).

**A1.7 — Test cases of the evidence runner.** On every operating system of C001-CON-15, the
evidence-runner tests implement these scenarios:
- environment: C001-TS-586 to C001-TS-590;
- submodules: C001-TS-591 to C001-TS-596 and C001-TS-952;
- files under a clean filter: C001-TS-597 to C001-TS-599, C001-TS-951, C001-TS-953 to
  C001-TS-959, C001-TS-961 and C001-TS-962.

Among them:
- a Git LFS file that the change leaves unchanged gets its working-tree copy and raises no notice
  (C001-TS-957);
- a Git LFS file whose new content was staged gets a copy checked against the pointer file of the
  index entry recorded at intake (C001-TS-957);
- a Git LFS file edited after intake, or never downloaded, gets its stored form with ERR-EVID-013
  (C001-TS-958). After the content is written back, the next reset gives the working-tree copy
  again (C001-TS-957);
- a file under another filter that was touched, edited, staged again or changed during the copy
  gets its stored form (C001-TS-598), and two workspaces filled before and after a touch differ
  (C001-TS-599);
- filtered paths outside a sparse checkout get their stored form (C001-TS-961, C001-TS-962).

**A1.8 — Consequences, updated.**
- **Good:** tests read the content of Git LFS and git-crypt files, not pointer files or encrypted
  content, whenever the checks pass. An edit of a Git LFS file never reaches a workspace. Git
  commands of project code no longer reach the developer's repository through inherited
  variables. A missing submodule is reported instead of leaving an unexplained gap.
- **Bad:**
  - every copy of a Git LFS file is read and hashed at each fill and each retry, a cost P-01
    accepted with Q-cleanfilter-02;
  - large Git LFS content adds disk space and copy time to every workspace and every mutation copy;
  - workspaces of one snapshot can differ in covered files;
  - for filters other than Git LFS, the limit of C001-IF-012 §7 item 8 (Q-nonlfs-01) lets edited
    bytes run in a workspace;
  - a project test that relied on an inherited `GIT_DIR` or on the developer's
    `GIT_CEILING_DIRECTORIES` now behaves as outside any repository, as C001-REQ-525 intends.
- **Constraints:** realises the choices of C001-CON-22 for copies of files under a clean filter. No
  new constraint.
- **Components:** C001-COMP-003 adds G-15 and G-16 (C001-ADR-004, Amendment 1). C001-COMP-014
  supplies the snapshot-side blobs of covered files.
- **Follow-up tasks, added:** environment builder with the "Removed" list; copier and checks for
  covered files, with ERR-EVID-013; submodule fill through G-16, with ERR-EVID-012; measurement
  W6.

## Amendment 2 — 2026-11-19: measurement results recorded outside this ADR

**Why.** §11 had the spike task of milestone 1 record each result in that section, and §10 calls
its estimate one "to be replaced by measurement". This ADR belongs to the plan that P-01 approves
at G3, and the approval covers its text. A result written into it after G3 would make the approved
plan stale, and implementers could no longer use it in the later milestones.

**What stays.** The decision, P-01's acceptance of 2026-11-18 (Q-workspace-02) and Amendment 1 are
unchanged. So are the labels W1 to W6 and K1 to K6, their pass conditions, the mitigations of §11
and the rule that this ADR relaxes neither threshold of C001-NFR-018 (§10, C001-CON-22). No new
option was considered, so C001-OA-008 is unchanged. Where the text above differs from this
amendment, this amendment applies.

**A2.1 — Where results are recorded.** This replaces, in §11, the words "and records each result in
this section", and the last sentence of A1.6.
- The results of W1 to W6 are recorded in the results file named in C001-T-021, those of K1 to K6
  in the results file named in C001-T-022. No task writes a result into this ADR.
- The planning estimate of §10 stays as written. Where the results differ from it, the results
  apply.
- A result adds evidence and does not change the decision.

**A2.2 — A result that calls for another decision.** Decision point DP-1 (C001-T-024) reads both
results files and takes the outcome for each label.
- W1 above 3.0 first triggers the mitigations of §11. Each mitigation is measured again, and its
  result is recorded outside this ADR in the same way.
- A result that needs another decision goes back to P-01 through DP-1: the conflict between (b)
  and (c) of §10, a bound for C001-AS-08 once the mitigations are used up, or a mechanism of this
  ADR that misses its measurement or fails its kill test.
- When P-01's decision changes a choice of this ADR, it is recorded in a new ADR, or in one that
  supersedes the affected part of this ADR. This ADR is not edited to record it.
