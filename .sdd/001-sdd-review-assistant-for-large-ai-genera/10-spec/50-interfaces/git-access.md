---
id: "C001-IF-012"
artifact: spec/interface
change: "CHG-001"
phase: 10-spec
status: draft
kind: conventions
---
# C001-IF-012 — Git access port

## §1 Purpose
Every read of the repository's git data goes through this port, provided by C001-COMP-003. The
port is implemented by running the git program that the developer installed, as a separate
program (C001-ADR-004, accepted; C001-CON-14, C001-CON-18); the checks of that program before
the first read are in §6. This file fixes what the implementation must do. Replacing it, for
example by a git library, needs a new ADR checked against this file and C001-CON-14.

## §2 Safety rules (every operation)
These rules hold for every repository the port reads: the repository of G-01 and the submodule
repositories of G-16.

1. **Read-only.** No operation writes the index, refs, objects, configuration, hooks, the
   working tree or any lock file of the repository (C001-REQ-120, C001-REQ-707). With the git
   program this includes setting `GIT_OPTIONAL_LOCKS=0` and passing `--no-optional-locks`, so that
   status and diff never refresh the index.
2. **No repository-configured program runs:** no hook, `core.fsmonitor` program, external diff,
   textconv driver, clean or smudge filter, credential helper or pager. Working-tree content is
   read as bytes; git's built-in end-of-line conversion (`core.autocrlf`, `core.eol`, `text` and
   `eol` attributes) is applied so that line endings do not count as changes. A Git LFS file is
   therefore compared through the SHA-256 hash and the size of its working-tree bytes with the Git
   LFS pointer file that git stores for it, and any other file under a clean filter by the blob
   that git's index records for it when the index records it as up to date; a file that neither
   rule settles is compared by its working-tree bytes (§7). A file under no clean filter is always
   compared by its working-tree bytes, whatever git's index records for it; a path outside a sparse
   checkout is read from its index entry (§8).
3. **No network:** no fetch, no remote query; the upstream branch and the default branch of the
   remote are local remote-tracking refs (C001-NFR-011).
4. **Values are data:** a value the developer gives is passed as a revision only after it is
   checked by G-03; it is never placed where it can be read as an option.
5. Errors are returned as the codes of `errors.md`; nothing is retried.

## §3 Operations
| ID | Operation | Result | Semantics | Requirements |
|---|---|---|---|---|
| G-01 | `discover(directory)` | working-tree root, git directory, common git directory, object format | fails with ERR-INTAKE-001 outside a working tree, and with ERR-INTAKE-008 when git refuses the repository it finds (§6) | C001-REQ-106, C001-REQ-125 |
| G-02 | `head()` | HEAD commit hash, current branch or detached | fails with ERR-INTAKE-002 when HEAD resolves to no commit | C001-REQ-106 |
| G-03 | `resolveCommit(value)` | commit hash | a value starting with `-`, containing a control character or `..`, or not resolving to exactly one commit fails with ERR-INTAKE-003; hashes, abbreviated hashes, branch, tag and remote-tracking names and `<rev>~<n>`, `<rev>^` forms are accepted | C001-REQ-102, C001-REQ-105 |
| G-04 | `mergeBase(a, b)` | commit hash or none | best common ancestor; with several, the one git's merge-base algorithm picks first | C001-REQ-102 to C001-REQ-105 |
| G-05 | `upstream(branch)` | remote-tracking ref and its commit, or none | from the branch's `remote` and `merge` configuration; none for a detached HEAD | C001-REQ-103, C001-REQ-104 |
| G-06 | `commitsBetween(base, head)` | commits with hash, parents, author name, e-mail and time, message, changed files; oldest first; merges included | the commits reachable from head and not from base | C001-REQ-109 |
| G-07 | `changeAgainst(base)` | changed files with change type, previous path, binary flag, content hash, file mode of each side (regular, executable, symbolic link); text content of both sides | base tree versus the working tree, staged and unstaged edits together, untracked files not excluded by the ignore rules (`.gitignore` files, `.git/info/exclude`, `core.excludesFile`); renames detected at 50 % similarity; files under a clean filter, Git LFS files included: §7; every other file is compared by its working-tree bytes whatever git's index records for it (stat data, assume-unchanged and skip-worktree flags), and a path outside a sparse checkout is read from its index entry: §8 | C001-REQ-101, C001-REQ-107, C001-REQ-108, C001-REQ-126, C001-REQ-127, C001-REQ-128 |
| G-08 | `readBlob(commit, path)` | bytes or none | content of a path in a commit's tree | C001-REQ-116, C001-REQ-426 |
| G-09 | `attributeLines(base, head, path)` | for each added line, the commit that added it or "uncommitted"; for each deleted line, the commit that deleted it or "uncommitted" | over the commits of G-06, following the file through renames | C001-REQ-110 |
| G-10 | `userIdentity()` | `user.name` and `user.email` of the repository's effective configuration, each possibly none | read only; a value that is empty or only whitespace is returned as none; the environment variables `GIT_AUTHOR_*` and `GIT_COMMITTER_*` and host-name guesses are not used. The caller (C001-COMP-002) reads it for each of the ten recorded actions of C001-IF-003 §4 and refuses the action when either value is none (ERR-ACT-006) | C001-REQ-712, C001-REQ-721 |
| G-11 | `attributes(commit, paths, name)` | attribute value per path | from the `.gitattributes` files of the commit's tree only (C001-REQ-426); `.git/info/attributes`, the file that `core.attributesFile` names and the system-wide attributes file are not read; used for `linguist-generated` and, at the base commit, for the `filter` attribute of §7 | C001-REQ-409, C001-REQ-127, C001-REQ-128 |
| G-12 | `workingState(snapshot)` | HEAD hash and the content hash of every path that differs from the snapshot | the comparison of G-07 against the snapshot's base, with the hash reuse of §8 item 3 and its Windows limit (Q-movedon-01), compared file by file with the snapshot; used for the moved-on notice only, never to judge an evidence run (C001-IF-013 §3 item 4) | C001-REQ-117 |
| G-13 | `treeEntries(commit)` | every file of the commit's tree with its path, file mode (regular, executable, symbolic link, submodule) and blob hash | read from the object database only; content through G-08; a submodule entry (gitlink) gives the commit recorded for it, whose files G-16 reads; used by C001-COMP-011 to fill evidence workspaces outside the repository (C001-IF-013 §2) | C001-REQ-521, C001-REQ-522, C001-REQ-526 |
| G-14 | `defaultBranches()` | in this order, each only when it exists: the default branch of the remote, `refs/heads/main`, `refs/heads/master`; each as full ref name and commit | the **default branch of the remote** is the remote-tracking ref that the symbolic ref `refs/remotes/<remote>/HEAD` names, where `<remote>` is `origin` when the repository has a remote of that name and otherwise its only remote; with several remotes and none named `origin`, or without that symbolic ref, there is none. Full ref names are used, so a tag named `main` is never taken. The caller (C001-COMP-004) takes the first entry that has a merge base with HEAD (G-04) and uses HEAD when none has (§4) | C001-REQ-104 |
| G-15 | `indexState(paths)` | for each path: none when the index of the working tree holds no entry at stage 0 for it or the entry is marked intent-to-add; otherwise the blob hash and file mode that the entry records, whether the file is up to date in the index (§7 item 1) and the stat data of the working-tree file that the test read | the current state, read from the index file and the files' stat data only, with the stat data computed as §7 item 1 states; reads no file content and runs no filter (§2 item 2); used by C001-COMP-011 before and after it copies a file under a clean filter other than a Git LFS file into an evidence workspace (§7 item 6, C001-IF-013 §2 item 1); never used for a Git LFS file | C001-REQ-527 |
| G-16 | `submoduleTree(parent, path, commit)` | the submodule's local repository with the tree entries of `commit` in it, as G-13 gives them, and the content of its files through G-08 applied to that repository; or **absent**, with one cause: no local repository, commit not in its repository, or repository refused by git (with git's first error line) | `parent` is the repository of G-01, or a repository that G-16 returned, so nested submodules are read one level at a time; `path` is a submodule entry of the parent's tree (G-13, or the snapshot for the repository of G-01) and `commit` the commit the snapshot records for it. The local repository is found from the parent's data only, as git finds it: the submodule name that the parent's `.gitmodules` gives `path` (the snapshot's file for the repository of G-01, the file of the recorded commit for a nested parent), then the directory `modules/<name>` of the parent's common git directory, else a `.git` directory or `.git` file at `path` below the parent's working tree when the parent has one. A name that git would refuse (for example one with a `..` component) gives "no local repository". §2 and the repository check of §6 apply to that repository; a refusal makes the submodule absent and does not stop the command. Nothing is fetched (§2 item 3). The commit hash identifies the content, so the place it is read from does not change it. Used by C001-COMP-011 to fill submodule paths of evidence workspaces (C001-IF-013 §2 item 8); part of preparing a workspace (§5) | C001-REQ-526 |

## §4 Choice of the base commit
C001-COMP-004 applies the rules of C001-REQ-102 to C001-REQ-104 in this order and records how the
base commit was chosen (`baseChoice` and `baseRef` of C001-IF-008 `Snapshot`):

| Case | Operations | `baseChoice` | `baseRef` |
|---|---|---|---|
| The developer names a commit | G-03, then G-04 with HEAD; no merge base fails with ERR-INTAKE-004 | `named` | none |
| No commit named, HEAD on a branch with an upstream branch | G-02, G-05, then G-04 with HEAD | `upstream-merge-base` | the upstream ref |
| No commit named, no upstream branch (detached HEAD included) | G-14, then G-04 with HEAD for each entry in order; the first entry with a merge base is used | `default-branch-merge-base` | the ref of that entry |
| No commit named, no upstream branch, no entry of G-14 with a merge base | G-14 and G-04 as in the row above, with no entry qualifying; HEAD (G-02) is the base | `head` | none |

The intake summary states the case (C001-REQ-114, C001-IF-001 §Output).

## §5 Performance
G-07 and G-09 for a change of 10,000 changed lines over 300 files in a repository of 500,000 lines
of code must fit, together with the rest of intake and static analysis, in the budget of
C001-NFR-001; the ADR records a measurement. At each intake, G-07 reads the working-tree content of
every file that it compares by its bytes, whether or not the change touches it: every file under
no clean filter that is not outside a sparse checkout (§8 item 1), every Git LFS file, whose bytes
it also hashes with SHA-256 (§7 item 7), and every file of §7 item 3. That time counts toward
C001-NFR-001 (C001-REQ-101, C001-REQ-128) and grows with the size of the checked-out working
tree, not with the size of the change. The benchmark changes of C001-NFR-001 measure it for files
under no clean filter, which make up their reference repositories; Git LFS content is measured
only where a reference repository holds some (`30-nfr/nfr.md` §0). G-12 reads and hashes again
only the files whose stat data changed since G-07 or an earlier G-12 of the same process hashed
them, and the files whose hash was not kept because they were written less than three seconds
before that hashing started, or later (§8 item 3, §7 item 5). A verdict asks for the moved-on
check (C001-REQ-117), so in the review UI it adds, to the stat reads of every file that git's own
status makes as well, only the reading of the files edited since they were last hashed or
shortly before; this keeps a verdict within
C001-NFR-003, whose scripted session measures it. A command that runs the moved-on check in a
process of its own, for example a verdict recorded through the CLI (C001-IF-001), reads every such
file once; C001-NFR-003 does not bound it, because it measures the review UI. G-13 and G-16 with
G-08 over the whole tree of a repository of 500,000 lines of code, its submodules included, are
part of preparing an evidence workspace, which falls
under no threshold of C001-NFR-018 and is measured as a risk by the ADR named in C001-CON-22
(C001-IF-013 §8 item 3).

## §6 The git program (C001-REQ-125)
C001-ADR-004 implements this port with the installed git program, a prerequisite of version 2.34
or later (C001-CON-18). Before the first git read of every command that reads git data, intake
included, the adapter checks the program and the repository; when a check fails, the command
stops with ERR-INTAKE-008, reads no further git data and creates no snapshot or review. The
message names the cause and, when a program was found, its path; for the causes below that
involve `git --version`, also what it printed, and for "cannot start", the operating system's
reason.

| Cause | Condition |
|---|---|
| not found | no `git` program is found on `PATH`; the program is resolved once to an absolute path, and the repository directory and the current directory are never searched (C001-ADR-004) |
| cannot start | a `git` program is found on `PATH` but the operating system cannot start it, for example a file that is not an executable program or that the developer may not run |
| no readable version | `git --version` ends with a non-zero exit status, or prints no text from which a version of at least two numbers can be read (for example "git version custom-build") |
| too old | the first two numbers of the version that `git --version` prints are below 2.34 (for example 2.33.8) |
| repository refused | git finds a repository at or above the directory but refuses to open it: another user owns it and git's `safe.directory` setting does not list it, its repository format version or one of its extensions is unknown to this git, or git gives another reason, shown as git's first error line |

- The adapter never overrides a refusal: it passes no `safe.directory` value and changes no
  ownership or configuration (§2 item 1).
- A directory in which git finds no repository fails G-01 with ERR-INTAKE-001; a repository
  without a commit fails G-02 with ERR-INTAKE-002.
- The check runs once per process, before the local review UI starts, so no request of
  C001-IF-002 raises ERR-INTAKE-008.

## §7 Files under a clean filter (C001-REQ-126 to C001-REQ-128, C001-REQ-527 to C001-REQ-529, Q-cleanfilter-01, Q-cleanfilter-02, Q-nonlfs-01)
A file is **under a clean filter** when the `filter` attribute that the `.gitattributes` files of
the base commit's tree give its path (G-11) names a driver for which the repository's effective
configuration sets `filter.<driver>.clean` or `filter.<driver>.process`. No other source of
attributes counts: neither `.git/info/attributes`, nor the file that `core.attributesFile` names,
nor the system-wide attributes file, nor a `.gitattributes` file that the change adds or edits
puts a file under a clean filter or takes one out (P-01's answer to Q-cleanfilter-02,
`questions-log.md` Round 15; CR-37). A **Git LFS file** is a file under a clean filter whose
`filter` attribute is `lfs`, the driver that Git LFS installs. The blob that git stores for a file
under a clean filter is the filter's output (for Git LFS a Git LFS pointer file, item 7), which
the working-tree bytes do not show. No filter ever runs (§2 item 2, C001-ADR-004). A path outside
a sparse checkout follows §8 item 2, whatever its filter, and the rest of this section does not
apply to it. G-07 and G-12 therefore take the snapshot-side content of any other file under a
clean filter as follows:

- a Git LFS file: from the blob of the base side or of its index entry when its working-tree bytes
  match that blob by hash and size (item 7, C001-REQ-128), and from its working-tree bytes
  otherwise (item 3, C001-REQ-126); git's index and the file's stat data are not trusted;
- any other file under a clean filter: from git's index when the file is up to date in the index
  and its index blob can be read (items 1 and 2, C001-REQ-127), and from its working-tree bytes
  otherwise (item 3, C001-REQ-126; P-01's answer to Q-cleanfilter-01, `questions-log.md`
  Round 13), with the limit of item 8: on every operating system an index entry written or
  refreshed after an edit, and on Windows also a same-size edit with its modification time set
  back, keeps the edit out of the change (P-01's decision Q-nonlfs-01).

1. **Up to date** (C001-REQ-126, C001-REQ-127). Applies to files under a clean filter other than
   Git LFS files. The file's entry in the index of the working tree (the index file in the git
   directory of G-01) is up to date when all of the following hold; the test reads the index and
   the file's stat data only and compares no file content:
   - the entry is at stage 0 (no merge conflict) and is not marked intent-to-add;
   - the file's stat data equal the entry's in each of these fields, whatever the repository's
     `core.checkStat` and `core.trustctime` settings say: file type, size, modification time,
     change time, inode, user and group numbers; and the executable bit unless `core.fileMode` is
     false (the bit does not reveal a content edit). Times are compared to the second, and to
     the nanosecond when the entry records a nanosecond part other than zero. The
     assume-unchanged and skip-worktree flags are ignored, so the stat data always decide (CR-37);
   - the entry is not racy: the modification time it records is earlier than the modification
     time of the index file. Git settles a racy entry by comparing content, which runs the filter;
     this port counts a racy entry as not up to date instead.

   On Windows, the stat data compared are those that Git for Windows records in the index, and
   the port computes the working-tree file's values the same way, not as the operating system
   reports them where the two differ: the last-write time as modification time, the creation time
   as change time, and zero as inode, user and group numbers. On Linux and macOS every write to a
   file sets its change time to the current time, which a program cannot set back without changing
   the system clock, so an edit made after git recorded the entry fails this test
   whatever the edit does to the file's size and modification time. A file that fails the test,
   also when git's own settings would count it as unchanged, is compared by its working-tree bytes
   (item 3).
2. **Index blob** (C001-REQ-127). For a file other than a Git LFS file whose up-to-date entry
   names a blob that can be read from the object database, the entry's blob is the snapshot-side
   content and is compared with the blob of the base side: equal blobs mean the file is
   unchanged, for example a git-crypt file checked out decrypted and not edited since; different
   blobs make the file changed (modified, or added when the base commit has no file at that path),
   for example a git-crypt file whose new content was staged with `git add`, which shows as a
   change of its encrypted content.
3. **Working-tree bytes** (C001-REQ-126). A Git LFS file that item 7 does not settle, and a file
   other than a Git LFS file that is not up to date in the index (item 1), that has no index entry
   (for example after `git rm --cached`) or whose up-to-date entry names a blob that cannot be
   read from the object database, is compared by its working-tree bytes, after git's built-in
   end-of-line conversion, with the blob of the base side. Equal bytes mean the file is
   unchanged. Different bytes make the file changed, with the working-tree bytes as its
   snapshot-side content, also when git, running the filter, would store the blob of the base
   side; for example a Git LFS file whose new content is not staged, or a git-crypt file touched
   since git last recorded its stat data. Its changed lines follow from those bytes, zero when
   they are binary (C001-REQ-108), and count toward the supported size (ERR-INTAKE-006).
4. Intake raises notice ERR-INTAKE-009 (C001-REQ-126) once when item 3 makes one or more files
   changed that the base commit holds at the same path, naming their number, their filter drivers
   and up to 10 of them, each with the reason item 3 applies to it: matches no Git LFS pointer
   file (item 7), not up to date in the index, no index entry, or index blob unreadable. Files of
   items 2 and 7 raise no notice.
5. G-12 applies items 1 to 3 and 7 to the current state. When git later refreshes its index (for
   example during `git status`) or the agent stages a Git LFS file, a file can pass from item 3 to
   item 2 or 7 without a change of its content; G-12 then counts it among the files that differ
   from the snapshot (ERR-INTAKE-007). An edit that item 8 keeps out of the change is missing from
   the moved-on notice as well. G-12 serves the moved-on notice only (C001-REQ-117), so it reuses
   the hash that G-07 or an earlier G-12 of the same process computed for a Git LFS file while the
   file's stat data, computed and compared as in item 1, have not changed since, and only when
   that hash was kept under the time-stamp rule of §8 item 3.
   **Windows gap of the moved-on notice for Git LFS files** (accepted by P-01 with Q-movedon-01):
   on Windows, an edit of a Git LFS file made after it was last hashed that keeps the file's size
   and sets its modification time back leaves those stat data unchanged, so G-12 reuses the old
   hash and the edit is missing from the moved-on notice. On Linux and macOS every write sets the
   change time, which item 1 compares, so with the time-stamp rule of §8 item 3 the gap does not
   exist there while the file times come from a clock that lags the machine's clock by no more
   than that rule's margin less their time-stamp step, as when the machine's own operating system
   stamps them. Where they lag by more, for example on a network share whose server's clock lags,
   a write in the same time-stamp step as the hashing that keeps the file's size can be missing
   from the moved-on notice on every operating system (clock-lag limit of §8 item 3). Both gaps
   are in the moved-on notice only:
   G-07 hashes every Git LFS file again for each snapshot, and evidence workspaces check each copy
   by its hash (item 7, C001-IF-013 §2 item 1), so such an edit never reaches a snapshot or an
   evidence workspace. Files under no clean filter have the same gaps (§8 item 3).
6. G-15 applies item 1 to the current state of the paths it is given, for C001-COMP-011, which
   copies a file under a clean filter other than a Git LFS file from the working tree into an
   evidence workspace only while the file is up to date in the index and its entry records the
   blob of its snapshot side (C001-IF-013 §2 item 1, C001-REQ-527, Q-filterworkspace-01); the
   limit of item 8 applies to that copy: in the cases item 8 names, the checks pass for an edited
   file and the workspace receives its edited bytes. A Git LFS file is copied and the copy is then
   checked by its SHA-256 hash and size against the Git LFS pointer file of its snapshot side, with
   no read of the index (C001-IF-013 §2 item 1, C001-REQ-529).
7. **Git LFS files** (C001-REQ-128, C001-REQ-126; Q-cleanfilter-02). A **Git LFS pointer file**
   is a blob smaller than 1024 bytes in the Git LFS pointer format version 1: the line
   `version https://git-lfs.github.com/spec/v1`, then the line
   `oid sha256:<64 lower-case hexadecimal digits>`, then the line
   `size <number of bytes in decimal>`, each ended by a line feed, and no other line. A pointer file with extension lines
   (`ext-…`) names the hash of a transformed content and does not count. The working-tree bytes of
   a Git LFS file **match** a blob when the blob is a Git LFS pointer file and the SHA-256 hash and
   the size of the bytes, read as they are and without end-of-line conversion (git hands the clean
   filter the bytes before its own conversion), equal the blob's `oid` and `size`. No stat data,
   no flag of the index entry and no racy test is used. The snapshot-side content is:
   - the blob of the base side, when the bytes match it or equal it after git's built-in
     end-of-line conversion (for example a Git LFS pointer file checked out without its content):
     the file is unchanged;
   - otherwise the blob that the file's index entry records, when the entry is at stage 0 and not
     marked intent-to-add, its blob can be read from the object database and the bytes match it:
     the file is changed (modified, or added when the base commit has no file at that path), for
     example a Git LFS file whose new content was staged with `git add`, which shows as a change of
     its pointer file;
   - otherwise its working-tree bytes (item 3): the bytes match neither pointer file, for example
     new content not staged, or the blob is not a Git LFS pointer file, for example the content of
     a file committed before the repository tracked its path with Git LFS.

   An index entry or a modification time that a program writes therefore cannot hide an edit of a
   Git LFS file: edited bytes match neither pointer file (CR-37).
8. **Limit of the stat rule** (P-01's decision Q-nonlfs-01, `questions-log.md` Round 16, which
   keeps the rule of Q-cleanfilter-02 with the full limit stated here). Items 1 and 2 trust the
   stat data and the blob that git's index records, and read no content of a file under a clean
   filter other than a Git LFS file. An edit of such a file is therefore kept out of the change in
   these cases:
   - **on every operating system:** an index entry written or refreshed after the edit so that it
     records the edited file's stat data with a blob that does not hold the edit, for example the
     blob of the base side. One git command does this and leaves no setting behind: git
     refreshing its index with another clean command for the file's filter driver, for example
     `git -c filter.<driver>.clean=<a command that prints the base blob> update-index --refresh`,
     which records the edited file as up to date with the blob that its entry already names. A
     program can also write the index file directly;
   - **on Windows, in addition:** an edit that keeps the file's size and sets its modification
     time back, because the stat data that Git for Windows records hold no value that every write
     changes and that a program cannot set back (a write leaves the creation time, which item 1
     compares as change time, as it was).

   In each case the file passes item 1 and intake reads its index blob (item 2, C001-REQ-127): the
   edit is in no hunk, no verdict covers it and the moved-on notice does not name it (item 5),
   while every evidence workspace filled or reset afterwards receives the edited bytes and runs
   them (item 6, C001-IF-013 §2 item 1, C001-REQ-527). The limit covers only paths that the
   `.gitattributes` files of the base commit's tree assign to a filter other than Git LFS (for
   example git-crypt, nbstripout or a filter of the project). Git LFS files are outside it at
   intake and in evidence workspaces (item 7); their moved-on notice has the Windows gap of
   item 5. Files under no clean filter are outside it (§8 item 1).

## §8 Files under no clean filter, and sparse checkouts (C001-REQ-101, C001-REQ-117; CR-46)
G-07 and G-12 compare every path that is not under a clean filter (§7) as items 1 and 3 state,
and every path outside a sparse checkout, under a clean filter or not, as item 2 states. git's own
diff of a commit against the working tree, run without refreshing the index (§2 item 1), takes
the blob of the index entry for a file whose stat data match the entry and does not look at a file
whose entry is marked assume-unchanged or skip-worktree; an adapter built on that diff alone does
not meet this section.

1. **Working-tree bytes, always** (C001-REQ-101). Every path of the base tree and of the index
   whose entry is a file (regular, executable or symbolic link), and every untracked file that the
   ignore rules do not exclude (G-07), is compared by its working-tree content (the bytes of a
   file after git's built-in end-of-line conversion, §2 item 2, or the target of a symbolic link)
   with the blob of the base side, for example through the blob hash of that content in the
   repository's object format. Nothing that git's index records for the path makes the file count
   as unchanged: not the entry's stat data or blob, not the assume-unchanged, skip-worktree or
   fsmonitor-valid flag, not the data of a file-system monitor (a `core.fsmonitor` hook or git's
   built-in monitor), and not the untracked cache, which is never used to find untracked files.
   The index only tells which paths are tracked, and a tracked file is never excluded by an ignore
   rule. A path of the base tree that the working tree does not hold is deleted, except under
   item 2. An edit of the content of such a file therefore always reaches the change, whatever a
   program writes into the index or sets as the file's time stamps.
2. **Sparse checkouts.** A path is **outside the sparse checkout** when its index entry is at
   stage 0 and marked skip-worktree, or the path lies below a sparse-directory entry of a sparse
   index, and no file or symbolic link exists at the path in the working tree. Its snapshot-side
   content is the blob, with its file mode, that its index entry records (for a path below a
   sparse-directory entry, its entry in the tree that the sparse-directory entry names), as git
   counts it: equal to the blob of the base side, the path is unchanged and is not listed;
   different, the path is changed, for example after a commit on HEAD that changed a file outside
   the sparse checkout. This holds whether or not the path is under a clean filter, Git LFS files
   included, and takes precedence over §7; no working-tree content is read and no notice is
   raised. A path marked skip-worktree at which a file exists is not outside the sparse checkout:
   the flag is ignored, and the file is compared under item 1 or §7. A file that a program deletes
   from the working tree and marks skip-worktree therefore counts as present with its index blob,
   as git counts it and as a commit made then records it; evidence workspaces hold that blob
   (C001-IF-013 §2 item 1), so no content runs there that the snapshot does not hold.
3. **Hash reuse in G-12** (C001-REQ-117; P-01's decision Q-movedon-01, `questions-log.md`
   Round 17). G-07 reads every file of item 1 at each intake and reuses no hash. G-12 reuses the
   hash that G-07 or an earlier G-12 of the same process computed for a file that it compares by
   its working-tree content (a file of item 1, a Git LFS file, or a file of §7 item 3) while the
   file's stat data, computed and compared as in §7 item 1, have not changed since, and only when
   that hash was kept under the following **time-stamp rule**:
   - G-07 and G-12 read a file's stat data before its content, after taking the time of the
     machine's clock at the start of that read (for example once, at the start of the G-07 or
     G-12 that reads the file);
   - they keep the hash for reuse, with those stat data, only when the file's modification time
     and change time are both earlier than the start of that read by three seconds or more (the
     **margin**). Otherwise the hash serves that operation only, and the next G-12 reads and
     hashes the file again.

   A file written during or after its read, or shortly before it in the same time-stamp step, can
   show stat data equal to those read, so no hash is kept for it. A write made after the start of
   the read gets file times later than that start less one time-stamp step and less the lag of the
   clock that stamps them behind the machine's clock, so the margin covers every step and lag that
   add up to three seconds or less: steps of up to two seconds (FAT) with a lag of up to one
   second, which includes operating systems that take file time stamps from a clock running a
   fraction of a second behind the clock of the process (CR-53).
   The hashes and stat data are kept in the memory of the process, so no index entry, flag or file
   that a program writes can make G-12 reuse a hash.

   **Windows limit of the moved-on notice** (accepted by P-01 with Q-movedon-01). On Windows, an
   edit made after a file was last hashed that keeps its size and sets its modification time back
   leaves those stat data unchanged, because a write leaves the creation time, which §7 item 1
   compares as change time, as it was: G-12 reuses the old hash and the edit is missing from the
   moved-on notice. On Linux and macOS every write sets the change time to the current time, which
   a program cannot set back without changing the system clock, so with the time-stamp rule the
   gap does not exist there, outside the clock-lag limit below. The gap is in the moved-on notice
   only: G-07 reads every file again for each snapshot, and evidence workspaces hold the
   snapshot's content (C001-IF-013 §2 item 1), so such an edit never reaches a snapshot or a
   workspace. For Git LFS files the same gap is stated in §7 item 5.

   **Clock-lag limit of the moved-on notice** (every operating system; CR-53). The margin holds
   while file times come from a clock that lags the machine's clock by no more than the margin
   less their time-stamp step, as when the machine's own operating system stamps them. Where they
   come from a clock that lags by more (by more than one second on FAT, more than two seconds with
   steps of one second, about three seconds or more with steps of a fraction of a second), for
   example on a network share whose server's clock lags, a file written just before its read
   already shows times older than the margin and its hash is kept; a later write in place,
   stamped in the same time-stamp step, that keeps the file's size then leaves its stat data as
   they were read, on
   Linux and macOS as on Windows: G-12 reuses the old hash and the write is missing from the
   moved-on notice. This limit too is in the moved-on notice only: snapshots and evidence
   workspaces are unaffected, for the reasons the Windows limit gives. For Git LFS files it is
   stated in §7 item 5.
