---
id: "C001-IF-013"
artifact: spec/interface
change: "CHG-001"
phase: 10-spec
status: draft
kind: conventions
---
# C001-IF-013 — Evidence run conventions

How C001-COMP-011 runs the project's own commands and reads their results (C001-CAP-05). The
review assistant writes no test (C001-NG-01). Results are stored as the evidence types of
C001-IF-008. Every run starts in an evidence workspace (§2), never in the developer's working tree
(C001-REQ-521, C001-REQ-522, C001-CON-22). What the analysis core guarantees for the working tree,
and what it only detects, is stated in §9.

## §1 Running a command
1. A command (test command, mutation tool, bundle command) runs with the root of an evidence
   workspace (§2) as its working directory and with the developer's environment, without the git
   repository-locating variables of item 7 and otherwise unchanged,
   through `/bin/sh -c` on macOS and Linux and `cmd.exe /d /s /c` on Windows (C001-NFR-016).
2. Standard output and standard error are captured up to 1 MiB each; beyond that the stream is
   truncated and flagged.
3. The developer can cancel a running command; cancellation ends its process tree. A process that
   outlives the analysis core's process (ended by a crash or a kill) can write only into its
   evidence workspace, which §2 item 6 removes.
4. One test run per snapshot at a time; bundle commands run one after another. No two runs use the
   same evidence workspace at the same time (§2 item 3). Mutation testing leaves capacity for
   bundle runs, because the bound of C001-NFR-018 (c) holds while it runs (Q-overhead-01, §8
   item 2): it uses at most one worker fewer than the machine's logical CPU cores, and at least
   one, and its processes run at a lower scheduling priority than the analysis core and the bundle
   commands (for example a raised nice value on macOS and Linux, the below-normal priority class on
   Windows). The ADR named in C001-CON-22 may replace these means with others that keep (c) within
   its threshold while mutation testing runs; it measures their cost to (b) (§8 item 4).
5. Commands run on the local machine only (C001-CON-01); their own network use is outside the
   review assistant's control (C001-REQ-803 rationale).
6. A command whose text names a path of the working tree (for example `cd <working-tree root>`)
   acts there as the developer's own command; the analysis core runs it as given, records it like
   any other run (C001-REQ-512) and reports what changed in the working tree during the run (§9
   item 3).
7. **Git repository-locating variables** (C001-REQ-525). Before a command starts, the evidence
   runner removes the variables below from the environment the command inherits; on Windows,
   names match whatever their letter case. A review started from a git hook, or from a shell that
   sets them, would otherwise hand them on, and a git command of the project's code would then use
   the developer's git directory, index or object store instead of finding no repository in the
   workspace, which holds no git metadata (§2 item 4).
   - **Removed:** the variables that git itself lists as local to one repository
     (`git rev-parse --local-env-vars`, as printed by git 2.45.1), except its command-line
     configuration variables: `GIT_DIR`, `GIT_WORK_TREE`, `GIT_IMPLICIT_WORK_TREE`,
     `GIT_COMMON_DIR`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`,
     `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_GRAFT_FILE`, `GIT_SHALLOW_FILE`, `GIT_CONFIG`,
     `GIT_REPLACE_REF_BASE`, `GIT_NO_REPLACE_OBJECTS` and `GIT_PREFIX`. Each names a part of one
     repository (its git directory, working tree, index, object store, or a file that git reads
     or writes in place of the repository's own), selects a view of that repository's history, or
     gives the place of the developer's git command inside its working tree. Also removed:
     `GIT_NAMESPACE`, which selects a part of the refs of that repository, and
     `GIT_QUARANTINE_PATH`, which names a directory of its object store during a `pre-receive`
     hook.
   - **Replaced:** `GIT_CEILING_DIRECTORIES` holds only the value that the evidence runner sets,
     the parent of the workspace root (C001-ADR-006); the developer's value is not kept. For a
     git command in the workspace, discovery already stops at that parent, so the developer's
     value adds nothing there, and kept, it could put a working-tree path into a variable that the
     analysis core sets (§9 item 1).
   - **Kept:** every other variable of the developer's environment, other `GIT_*` variables
     included, for example `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT` with its
     `GIT_CONFIG_KEY_<n>` and `GIT_CONFIG_VALUE_<n>` pairs, `GIT_CONFIG_GLOBAL`,
     `GIT_CONFIG_SYSTEM`, `GIT_EXEC_PATH`, `GIT_AUTHOR_*`, `GIT_COMMITTER_*` and
     `GIT_SSH_COMMAND`. They carry settings, identities and programs, not the location of a
     repository, and project tests may need them, for example a `safe.directory` value or an
     identity for the repositories that the tests create.
   - A command whose text sets a removed variable again (for example `GIT_DIR=… npm test`) is the
     developer's own command (item 6).

## §2 Evidence workspace
1. **Content.** An evidence workspace holds the files of the snapshot: the tree of the base commit
   (C001-IF-012 G-13, G-08) without the files the change deletes, with the snapshot content of
   every added, modified and renamed file (`40-domain/domain-model.md` §2.2), each with the file
   mode of its snapshot side (regular, executable or symbolic link) and with the line endings that
   git's built-in end-of-line conversion gives a checkout of the repository (C001-IF-012 §2
   item 2). No filter runs; files under a clean filter follow the rule below.
   **Files under a clean filter** (C001-REQ-527 to C001-REQ-529; P-01's answers to
   Q-filterworkspace-01, `questions-log.md` Round 14, and Q-cleanfilter-02, Round 15). The rule
   covers each regular or executable file of the snapshot that is under a clean filter
   (C001-IF-012 §7) and whose snapshot side is a blob that git stores: a file that the change
   leaves unchanged (its blob in the base commit's tree, C001-IF-012 G-13), a file that
   C001-IF-012 §7 item 2 or item 7 makes changed (the blob that git's index recorded for it at
   intake), for example a Git LFS file whose new content the agent staged with `git add`, or a path
   outside a sparse checkout that C001-IF-012 §8 item 2 makes changed (the blob of its index
   entry). A Git LFS file is covered only when that blob is a Git LFS pointer file (C001-IF-012
   §7 item 7); any other blob is the file's content, and the file holds it as this item writes any
   file. The
   **stored form** of a covered file is the content of that blob, written as this item writes any
   file and with no smudge filter run: for Git LFS the pointer file, for git-crypt the encrypted
   content. When the evidence runner fills the workspace, and whenever item 3 writes the file
   again, it gives the file one of the contents below. The **copy** is the file's working-tree
   bytes, copied into the workspace byte for byte, without end-of-line conversion, with the file
   mode of its snapshot side, through the copier of C001-ADR-006 (a copy-on-write clone where the
   file system supports it, else a byte copy, never a hard link), which reads the working-tree
   file and writes only in the workspace.
   - **Working-tree copy of a Git LFS file** (C001-REQ-529). The evidence runner makes the copy,
     then reads the copy in the workspace and computes its SHA-256 hash and its size, which must
     equal the `oid` and the `size` of the Git LFS pointer file of its snapshot side. The file
     then holds the content that the pointer file stands for, whatever git's index and the
     working-tree file's stat data record: the hash is taken over the copy, so an edit of the
     working-tree file before or during the copy cannot reach the workspace (CR-37). The index is
     not read.
   - **Working-tree copy of a file under another filter** (C001-REQ-527). The evidence runner
     reads the file's index entry through the git access port (C001-IF-012 G-15). When the file
     is up to date in the index under the test of C001-IF-012 §7 item 1 and its index entry
     records the blob of its snapshot side, it makes the copy. After the copy, it reads the
     index entry through G-15 again: the file must still be up to date in the index with the
     same blob, and its stat data must equal those read before the copy. The file then holds the
     content whose stored form, by git's own record, is the blob of its snapshot side, for
     git-crypt its decrypted content. This rests on git's index record, with the limit that
     C001-IF-012 §7 item 8 states and P-01 accepted with Q-nonlfs-01: on every operating system,
     an index entry written or refreshed after an edit of the working-tree file (for example by
     `git -c filter.<driver>.clean=… update-index --refresh`, or by writing the index file
     directly) can record the edited file as up to date with the blob of its snapshot side, and on
     Windows an edit that keeps the file's size and sets its modification time back leaves it up
     to date. The checks then pass, and the workspace receives and runs the edited bytes, which
     the snapshot does not show.
   - **Stored form** (C001-REQ-528). Otherwise the file holds its stored form, and a copy already
     made is replaced by it. For a Git LFS file: the copy's hash or size differs from its pointer
     file (for example the file was edited after the snapshot was taken, or its content was never
     downloaded, so that the working tree holds the pointer file itself), or the file cannot be
     read. For a file under another filter: the file is not up to date in the index (for example
     edited or touched since git last recorded its stat data, or its entry racy), its index
     entry records another blob (for example a new `git add`, or a move of HEAD), its stat data
     changed during the copy, or it cannot be read. For either kind, the working tree may also
     hold no file at its path, for example a path outside a sparse checkout (C001-IF-012 §8
     item 2); that cause is named apart from a file that cannot be read. Each test run, mutation
     run and bundle command whose workspace holds such a file in its stored form raises notice
     ERR-EVID-013, which names
     the run, the number of such files and up to 10 of them, each with its filter driver and the
     cause; like ERR-EVID-009, the notice changes no result.

   No copy of the working-tree bytes is kept outside the evidence workspaces, so workspaces of
   one snapshot can differ: a workspace filled or written again after such a file was edited
   holds its stored form while an earlier workspace holds its working-tree copy. The check of §3
   compares each workspace with the content that this item gave it. A file under a clean filter
   that intake compared by its working-tree bytes and listed as changed (C001-IF-012 §7 item 3)
   holds that snapshot content, like every changed file, and is not covered by this rule.
2. **Location.** A directory on the local machine outside the working-tree root and outside the
   git directory, and below neither (C001-CON-22). The exact place is set by ADR in 20-plan.
3. **Preparation and reuse.** The evidence runner prepares a workspace when a run of the snapshot
   needs one and none of the snapshot's workspaces is free. Before every run it resets the
   workspace it takes: every path of the snapshot whose content or mode differs from what item 1
   gave it in that workspace is written again by item 1, every file under a clean filter that
   holds its stored form (item 1) is written again by item 1, so that it gets its working-tree
   copy once the checks of item 1 pass again (for a Git LFS file, once its working-tree bytes
   match its pointer file; for another filter, once git's index records it again as up to date
   with the blob of its snapshot side), and
   every other path that the snapshot's ignore rules do not exclude is
   removed; ignored paths, such as build outputs of an earlier run, are kept. Workspaces stay with
   the process that runs the snapshot's jobs and are removed when that process ends.
   **Mutation workspace.** Mutation testing takes a workspace of its own, so that no test run or
   bundle run executes mutated code (§5): when a test run whose results are recorded ends and its
   check after the run (§3) passes, the evidence runner copies that workspace, ignored paths
   included, and gives the copy to mutation testing. The copy holds only the snapshot's files, the
   ignored paths made available under item 4 and the build outputs that the test run produced from
   the snapshot's files, so it matches the snapshot and needs no second cold build; it follows
   every rule of item 4. The copy is removed when mutation testing of the snapshot ends, because
   its ignored paths may hold build outputs of mutated code; it is never reset for another run.
   **Copy window.** From the end of that check to the end of the copy, the test run's workspace is
   taken by the copy: no run uses it and it is not free. A run of the snapshot that needs a
   workspace in this window while no other workspace of the snapshot is free waits until the copy
   ends and then takes the test run's workspace; no workspace is prepared for it
   [ASSUMPTION: Q-copy-window-01]. The copy ends
   when it is complete or when it fails (for example for lack of disk space); a failed copy is
   removed, and the mutation evidence of every hunk that mutation testing was to take is recorded
   as unavailable with the cause
   (C001-REQ-516, ERR-EVID-006). After the copy window, the test run's workspace is free for bundle
   runs and later test runs while mutation testing runs. How the window enters C001-NFR-018: §8
   items 2 and 4.
   **Self-contained copy.** Copying a directory does not change what in it names an absolute
   path: a virtual environment names its interpreter in its configuration and in the headers of
   its scripts, an editable install names its source directory in a path file or an import finder
   (as `pip install -e`, Poetry and uv write them), and symbolic links, package links and
   incremental-build state can name one too. In the copy, no path that the analysis core makes
   available or copies, symbolic-link targets and such absolute paths included, leads into another
   evidence workspace, the test run's included, into the working tree or into the git directory:
   a run in the copy loads and writes the project's files only in the copy, and third-party
   dependencies only as item 4 makes them available. This holds in particular when the project is
   installed in editable mode from the test run's workspace (`30-nfr/nfr.md` §0); otherwise the
   tests would load the unmutated files of that workspace, every mutant would survive, and
   C001-REQ-411 would reopen test-cleared hunks for surviving mutants that are false
   (C001-REQ-515). The means is set by the ADR named in C001-CON-22, for example replacing the root
   of the test run's workspace by the root of the copy in symbolic-link targets and in the files of
   the copied ignored paths that name it, making those ignored paths available in the copy by the
   means of item 4 instead of copying them, or extending item 7 and the package-link handling of
   item 4 to imports and links that lead into another evidence workspace. Whatever it does is part
   of making the copy, not a preparation of a workspace (§8 item 4). Loads that a run in the copy
   still makes from outside it are detected and reported by §5 item 4.
4. **Ignored paths.** Files that the repository's ignore rules exclude are not part of the
   snapshot (C001-IF-012 G-07), but a command may need some of them: installed dependencies (for
   example `node_modules/` or a virtual environment), restored packages, local settings. Which
   ignored paths of the working tree are made available in a workspace and how (for example
   copied, or produced in the workspace by a preparation command) are set by ADR in 20-plan
   within C001-CON-22. A workspace holds no git metadata: no `.git` directory or file
   (C001-ADR-006, accepted), so a git command run in it finds no repository (§1 item 7), and a
   build that reads its version from the git history runs without it. Submodule paths are filled
   by item 8. The ADR also states how a Node or .NET package link to the working tree is handled
   so that the run loads the workspace's files; for Python, item 7 sets the outcome. Whatever the
   mechanism, no path that the analysis core makes available in the workspace leads into the
   working tree or into the git directory, so no run can change a file of the working tree,
   ignored files included, or the index, a ref or an object of the repository through the
   workspace (§9 item 1).
   No compiled or transformed form of the project's own files is taken from the working tree
   (compiler outputs, bytecode, incremental-build state, transform caches): it was built from the
   working tree's current files, which can differ from the snapshot (C001-REQ-117), and the check
   of §3 does not see ignored paths, so a run could execute code that is not the snapshot's
   without being refused (C001-REQ-509). Installed third-party dependencies and restored packages
   are not such forms. Nor is the working-tree copy of a file under a clean filter (item 1): it is
   the snapshot's own file, kept for a Git LFS file only when the copy's SHA-256 hash and size
   equal its pointer file (C001-REQ-529), and for a file under another filter copied only while
   git's index records it, before and after the copy, as up to date with the blob of its
   snapshot side (C001-REQ-527, Q-filterworkspace-01), with the limit that item 1 states for it
   (C001-IF-012 §7 item 8).
5. **Edits of the working tree.** Edits of the working tree by the developer or the agent, and
   moves of HEAD, do not reach a workspace. A file under a clean filter gets its working-tree copy
   only under the checks of item 1; after an edit, or for a filter other than Git LFS a move of
   HEAD that changes its index entry, it gets its stored form instead (ERR-EVID-013). The one
   exception is the limit of C001-IF-012 §7 item 8 (Q-nonlfs-01), for files under a clean filter
   other than Git LFS only: an edit of such a file reaches every workspace filled or reset after
   it when, on any operating system, an index entry written or refreshed after the edit records
   the edited file as up to date with the blob of its snapshot side, or when, on Windows, the edit
   keeps the file's size and sets its modification time back; the snapshot does not show that
   edit. A run in progress continues and its results are
   evidence of the snapshot (C001-REQ-522); results already recorded stay; the moved-on notice
   reports the edits (C001-REQ-117) within the limits of C001-IF-012 §7 item 8 and §8 item 3
   (Q-nonlfs-01, Q-movedon-01): it does not name an edit that §7 item 8 keeps out of the change,
   nor, on Windows, an edit made after the file was last hashed that keeps its size and sets its
   modification time back. A review of the new state is a new snapshot with runs of its own
   (C001-REQ-118).
6. **End of the process.** When the analysis core's process ends during a run (cancellation,
   crash or kill), the run gets no result, the analysis core has changed nothing in the working
   tree (§9 item 1), and the next process of the review state store removes the workspace it left.
   On reopen, unfinished jobs start again in a fresh workspace (C001-REQ-919).
7. **Python project code loads from the workspace** (C001-CON-22, C001-REQ-506). In every test
   run, mutation run and bundle command, each module that a Python process of the run would
   import from a file under the working-tree root whose path relative to that root is a file of
   the snapshot is imported from the file of the same relative path in the workspace instead. This
   holds whatever puts the working-tree path on the import path: an editable install of the
   project (a path entry of a `.pth` file or an import hook of the build backend, as `pip install
   -e`, Poetry and uv install the project), an import path of the developer's environment (for
   example `PYTHONPATH`), or a virtual environment under the working-tree root. Third-party
   distributions are imported from the Python environment that the developer's environment
   selects. The means (for example an import hook that the analysis core puts first through the
   environment variables and files of §4 item 1, or an environment for the workspace in which the
   project is installed from the workspace and no distribution is installed in editable mode from
   the working tree) is set by the ADR named in C001-CON-22; every path it names lies outside the
   working tree and the git directory (§9 item 1), and it downloads nothing (C001-CON-11). A
   Python process that ignores those variables and files (for example one started with `python
   -I` or `-E`) is outside this rule; §4 item 2 applies to what it executes.
8. **Submodules** (C001-REQ-526). A submodule path of the snapshot (a gitlink entry,
   C001-IF-012 G-13) is filled from the commit that the snapshot records for it, read from the
   submodule's local repository through the git access port (C001-IF-012 G-16, under its safety
   rules), at every depth of nesting (C001-ADR-006). When G-16 gives the submodule as absent (the
   submodule has no local repository, its repository does not hold the commit, or git refuses to
   open its repository), the run is not refused: the path is an empty directory, as in a checkout
   whose submodule is not initialised, and the submodules nested in it are not read. Nothing is
   fetched (C001-IF-012 §2 item 3). The check of §3 compares a submodule path with the content
   this item gives it. Each test run, mutation run and bundle command whose workspace holds such
   an empty path raises notice ERR-EVID-012, which names the run, the number of such submodule
   paths and up to 10 of them, each with its recorded commit and the cause that G-16 gave; like
   ERR-EVID-009, the notice changes no result.

## §3 Workspace check
1. Before a test run or a bundle command starts and after it ends, the evidence runner compares
   its workspace with the snapshot: every path of the snapshot must hold the content and mode that
   §2 item 1 gave it in that workspace (for a file under a clean filter, its working-tree copy or
   its stored form), and no other path may exist unless the snapshot's ignore rules exclude it or it matches
   `tests.coverageReports` of the configuration (C001-IF-004). When runs follow one another in
   one workspace with nothing in between, the check after one run is the check before the next.
2. If the check fails, no result of the run is recorded as evidence, notice ERR-EVID-005 names the
   differing paths, and the run is shown as discarded (C001-REQ-509). A command that changes files
   of the snapshot in its workspace (for example a test that rewrites its stored snapshots, or
   writes a file that is not ignored) fails the check.
3. Mutation testing changes workspace files by design and is not checked this way; its workspace is
   the copy of §2 item 3, which matches the snapshot when mutation testing starts and is removed
   after it ends. Whether its tests load the copy's files is checked by §5 item 4.
4. The working tree never decides whether a run's results are evidence. C001-IF-012 G-12 serves
   the moved-on notice only (C001-REQ-117); the observation of §9 items 3 and 4 serves notices
   ERR-EVID-009 and ERR-EVID-010 only.

## §4 Test runs
1. The command is the developer's `--test-command` or else `tests.command` of the configuration
   read from the base commit (C001-REQ-505, C001-REQ-426). It runs unchanged; per-test coverage
   is collected by ecosystem adapters that act only through environment variables and files outside
   the working tree and outside the paths of the snapshot in the workspace. The adapter mechanism per
   deep ecosystem is set by ADR in 20-plan.
2. **Attribution to the snapshot:** an executed line counts only when the executed file lies inside
   the evidence workspace; it is mapped to the repository path relative to the workspace root.
   Execution reported for a file under the working-tree root whose path relative to that root is
   a file of the snapshot (for example through a Node or .NET package link, an absolute path, or a
   Python process outside §2 item 7) counts for no hunk, and notice ERR-EVID-008 names up to 10
   such files per run (C001-REQ-506, C001-REQ-509). Execution of other files under the
   working-tree root, such as third-party packages of a virtual environment there, is neither
   counted nor reported.
3. **Results:** the adapter of each deep ecosystem reports each test with its ID, name, outcome and,
   for property-based tests, the reported counter-example (C001-REQ-517); and, for each added line
   of a deep-ecosystem hunk, the passing and failing tests that executed it (C001-REQ-506).
4. **Coverage reports** for other files: every file of the workspace matching
   `tests.coverageReports` and modified after the run started is read as LCOV (`SF:` and `DA:`
   records) or Cobertura XML (`class` elements with `filename` and `line` elements with `number` and
   `hits`); a line counts as executed when its hit count is above 0 (C001-REQ-507). Paths in a
   report are resolved against the workspace root, and item 2 applies to them.
5. **Unavailable** (C001-REQ-508): no command known (ERR-EVID-001); the workspace cannot be
   prepared or the process cannot start (ERR-EVID-002); the run ends and neither an adapter nor a
   coverage report yields a test result (ERR-EVID-003); cancelled (ERR-EVID-004).

## §5 Mutation testing
1. Starts after a completed test run, on the changed lines of deep-ecosystem hunks executed by
   passing tests, hunks taken in descending risk score (C001-REQ-514), in the copy of the test
   run's workspace that §2 item 3 gives it and no other run uses. A cancelled, failed or interrupted mutation run leaves mutated code only
   in that workspace (C001-REQ-521).
2. One mutation tool per deep ecosystem, chosen by ADR in 20-plan under C001-CON-07; its results
   are converted to MutationResult (C001-IF-008).
3. A hunk whose mutants cannot all be run, or whose run does not complete, gets an unavailable
   result with the reason (C001-REQ-516, ERR-EVID-006). Results arrive while the review is open
   and can reopen test-cleared hunks (C001-REQ-411); C001-NFR-018 bounds the total time.
4. **Self-containment check** (§2 item 3, C001-REQ-516). The first unmutated execution of the
   tests in the copy runs with the coverage adapters of §4 item 1: the mutation tool's own initial
   run where the ADR named in C001-CON-22 attaches the adapters to it, otherwise a test run that
   the evidence runner starts in the copy before the first mutant. Execution reported for a file
   under another evidence workspace of the snapshot or under the working-tree root, whose path
   relative to that root is a file of the snapshot, means that the tests may not load the copy's
   version of that file, which is the one the mutants change. No mutant of such a file counts as
   killed or surviving: the mutation evidence of each of its hunks is recorded as unavailable with
   the reason "loaded outside the mutation workspace" (C001-REQ-516), and notice ERR-EVID-011,
   instead of ERR-EVID-006, names the number of such files, up to 10 of them and the place each
   was loaded from. Mutation testing of the other files goes on. The check counts in (b) (§8
   item 4).

## §6 Evidence bundles
1. **Proposed commands** of an intent (C001-REQ-510): the recorded runs linked to it
   (C001-IF-007 §9), with the agent's recorded output as their first reference run; and, when
   `evidence.scenarioCommand` is set, that template with `{id}` replaced by the ID of each
   acceptance scenario linked to the intent. A proposed command runs only once confirmed
   (C001-REQ-511, ERR-EVID-007); a command the developer enters is confirmed.
2. **Run** (C001-REQ-512): every confirmed command of the bundle runs as in §1 and is checked as in
   §3; exit status, standard output and standard error are recorded as produced. A command that
   cannot start, including when no workspace can be prepared, is recorded with no exit status and
   the cause in its standard error.
3. **Differences** (C001-REQ-513): exit status equal or not, and a line diff of each stream against
   the reference run (the previous run of the same command, or the agent's recorded output for
   the first run of an agent-run command).
4. **Overhead:** the time the core adds to a command is bounded by C001-NFR-018 (c); what it
   includes: §8 item 2.

## §7 Evidence strength
Strengths follow C001-REQ-518. A test-result item of a hunk has strength 2 when every changed line
of the hunk has mutation results and none survived, and 3 otherwise; the strength is derived when
the item is shown. The result digest of an item covers its outcome (test outcomes and executed
lines, mutation outcome, exit status and output), not its strength, so a verdict goes stale when
an outcome changes (C001-REQ-716) and not when mutation results only raise a strength.

## §8 Time added by the workspace
How the workspace enters the measurement of C001-NFR-018 (the metric and its baseline are stated
there; this section only places the workspace steps of §2 and §3 inside or outside it):

1. **Test-run overhead (a).** The baseline run (the project's test command alone) and the measured
   run (the analysis core's test run with per-test coverage) each run in an evidence workspace of
   the same snapshot, prepared in the same way (§2 items 1 and 4) and in the same state: without
   build outputs of an earlier run. A cold build therefore falls on both sides of the ratio.
   Preparing the workspace (filling it and making ignored paths available) happens before either
   run is timed and counts on neither side. The reset of §2 item 3, the checks of §3 before and
   after, and the observation of §9 item 3 count in the measured run.
2. **Bundle overhead (c).** Measured in a workspace of the snapshot that is already prepared and
   free: the workspace of the test run once the copy window of §2 item 3 has ended, which mutation
   testing leaves free because it runs in the copy. The threshold of (c) holds in both states of
   that workspace (Q-overhead-01): while mutation testing of the snapshot runs and after it has
   ended; how many runs take each state is stated in the Method of C001-NFR-018. While mutation
   testing runs, it keeps capacity free for bundle runs as §1 item 4 states, so that its workers
   do not delay the work the core adds to a command. The time the core adds to each command
   includes the reset of §2 item 3, the checks of §3 and the observation of §9 items 3 and 4. Not
   included: the preparation of a workspace, and the wait of a run asked for during the copy
   window. In that window the test run's workspace is not free and the run waits for the copy
   (§2 item 3); the wait falls under no threshold of C001-NFR-018 and lasts no longer than the
   copy, which counts in (b) (item 4).
3. **Outside every threshold.** The preparation of a workspace, including the one a bundle run
   needs when no workspace of its snapshot is free, and the extra time of a cold build in a fresh
   workspace compared with the project's test command in the developer's built working tree, fall
   under no threshold of C001-NFR-018. Workspaces are removed when the process that runs the
   snapshot's jobs ends (§2 item 3), so each review session pays both again. The expected size of
   this cost is assumption C001-AS-08; the times that test it are reported with each run of
   C001-NFR-018 without a threshold (its Method). The ADR named in C001-CON-22 measures them on
   each benchmark change; when C001-AS-08 does not hold, it adopts one or more of the mitigations
   below, states its effect on §2 item 3 and §9, and measures again. A bound on this cost is set
   only by P-01, as C001-AS-08 states; this contract sets none. Allowed mitigations, each reusing
   only what the analysis core itself produced from known content:
   - keeping a snapshot's workspaces (not the mutation copies of §2 item 3) with their build
     outputs across review sessions of the same snapshot, each reset and checked before every run
     as §2 item 3 and §3 state;
   - filling a new workspace with build outputs that runs of the analysis core produced in an
     earlier workspace of the same snapshot or of another snapshot with the same base commit (not
     a mutation copy), put in place before the
     snapshot's files are written, provided the ADR shows, for the build of each deep ecosystem,
     that a build in the workspace rebuilds every output whose inputs differ from the snapshot
     (a test in which one source file of the snapshot differs from the one the reused outputs
     were built from, and the run executes the snapshot's version);
   - a cache of installed third-party dependencies and restored packages that the analysis core
     keeps outside the working tree and the git directory, keyed by the content of the
     snapshot's package manifests and lock files, used instead of making them available again
     from the working tree (§2 item 4).

   Build outputs, bytecode, incremental-build state and transform caches of the working tree are
   never a mitigation (§2 item 4).
4. **Mutation-testing time (b).** The copy of the test run's workspace that mutation testing
   takes (§2 item 3) is made after the end of that test run and counts in (b), with everything the
   ADR named in C001-CON-22 does to make the copy self-contained and with the self-containment
   check of §5 item 4; none of it is the preparation of item 3, and no workspace is prepared within
   (b). The reset and checks of §3 do not apply to mutation testing (§3 item 3); its observation
   (§9 items 3 and 4) counts in (b). (b) is measured with the capacity that §1 item 4 keeps free
   for bundle runs, whether or not a bundle runs at the time; the mutation time this costs is a
   risk recorded for that ADR in C001-CON-22.

## §9 The working tree: guarantee, limit and detection
1. **Guaranteed by the analysis core** (C001-REQ-521, C001-CON-22). For every evidence run, from
   the preparation of its workspace to its removal, whether the run completes, fails, is cancelled
   or ends with the process of the analysis core:
   - the analysis core itself writes, moves and deletes nothing under the working-tree root, ignored
     files included, and nothing in the git directory; the mutation tool is given only paths of
     its workspace, so mutated code is written only there (§5);
   - the analysis core runs no git command against the developer's repository that changes refs,
     the index, objects, configuration or tracked files: every git read goes through C001-IF-012
     under its §2 safety rules (C001-CON-13), and the core adds no git command to an evidence
     command;
   - every command starts with the workspace root as working directory (§1 item 1); no argument
     that the core adds and no environment variable that the core sets (for example those of the
     coverage adapters, §4 item 1) names a path under the working-tree root or in the git
     directory; no path that the core makes available in the workspace (§2 item 4) leads into
     the working tree or into the git directory; and the git
     repository-locating variables of §1 item 7 are removed from every command's environment, so
     a git command run in the workspace finds no index, ref or object store of the developer's
     repository.
2. **Limit.** The analysis core runs the project's own code with the developer's environment and
   no operating-system sandbox, so it cannot stop that code from addressing the working tree on its
   own: through the command text (§1 item 6), a package link that points at the working tree (for
   example a Node or .NET link, or a Python process outside §2 item 7, in which CPython also
   writes `__pycache__` files next to the working-tree modules it imports), an absolute path in
   the project's configuration, or an environment variable of the developer's environment that
   names a working-tree path (for example `VIRTUAL_ENV`, whose virtual environment can receive
   files the run writes). Such writes are outside the guarantee of item 1; item 3 reports them,
   and ERR-EVID-008 reports the execution of working-tree files of the snapshot.
3. **Detection** (C001-REQ-523, notice ERR-EVID-009). For every test run, mutation run and bundle command, the
   evidence runner observes, from the start of the command to its end, every path under the
   working-tree root (ignored paths included, the git directory excluded) and the index, `HEAD`,
   `packed-refs` and refs of the repository (C001-IF-012 G-01 git directory and common git
   directory). When a path is created, changed or removed in that time, notice ERR-EVID-009 names
   the run, the number of such paths and up to 10 of them. A run in which no observed path changed
   raises no ERR-EVID-009, even when its observation was incomplete (item 4). The developer and the agent may edit the
   working tree while a run goes on (C001-REQ-522), so the notice states that the run or another
   program changed these paths; it does not attribute them. The notice changes no result: whether
   the run's results are evidence is decided by the workspace check of §3 alone. The mechanism
   (file-system change notification, or a comparison of the size, modification time and existence
   of the paths before and after the run) is chosen by the ADR named in C001-CON-22, on each
   operating system of C001-CON-15; its time counts as stated in §8. The observed scope is the
   working-tree part (every path under the working-tree root outside the git directory) and the
   repository part (the index, `HEAD`, `packed-refs` and the refs).
4. **Incomplete observation** (C001-REQ-524, notice ERR-EVID-010). A part of the observed scope
   is not observed for a run when the evidence runner cannot establish, for that part and for the
   whole time from the start of the command to its end, what its mechanism establishes for the
   rest of the scope. The causes, each reported under its own name:
   - **not readable:** a directory, a file, the index or a ref cannot be read or watched when
     the observation starts, or a directory created during the run cannot be watched or listed
     (for example permission denied, a path on a file system without change notification);
   - **watch limit:** the operating system refuses a further watch (for example the per-user
     inotify watch limit on Linux);
   - **events lost:** the change notification reports lost or merged events (for example an
     inotify queue overflow, `ERROR_NOTIFY_ENUM_DIR` on Windows, a dropped-events or rescan flag of
     FSEvents on macOS), or stops delivering events before the command ends;
   - **observation interrupted:** the observation starts after the command starts or ends before
     the command ends (for example the observer fails), or the working-tree root or the git
     directory is moved or removed during the run.

   A part whose observation falls back to a weaker means during the run (for example a comparison
   after lost events) still counts as not observed; changes that the fallback finds are reported
   with ERR-EVID-009. For each run with such a part, one notice ERR-EVID-010 names the run and, for
   each cause apart, the number of top-most paths not observed (a directory stands for everything
   below it) and up to 10 of them, or that the whole working-tree part or the whole repository
   part was not observed when the cause covers it (an event loss that the mechanism cannot place,
   an interrupted observation); it states that changes in these parts during the run may be
   missing from ERR-EVID-009. ERR-EVID-010 is raised whether or not a path changed. ERR-EVID-009
   and ERR-EVID-010 are separate notices with separate codes, never merged into one, and both can
   follow one run; like ERR-EVID-009, ERR-EVID-010 changes no result (§3 item 4). The ADR named in C001-CON-22 states, for
   its mechanism on each operating system of C001-CON-15, which conditions lead to which cause.
