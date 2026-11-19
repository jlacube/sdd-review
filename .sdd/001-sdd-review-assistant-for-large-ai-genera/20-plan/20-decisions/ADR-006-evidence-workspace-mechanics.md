---
id: "C001-ADR-006"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: accepted
date: 2026-11-18
deciders: ["P-01"]
---
# C001-ADR-006 — Evidence-workspace mechanics

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
