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
Every read of the repository's git data goes through this port, provided by C001-COMP-003. Whether
it is implemented by calling the installed git program or with a git library is decided by ADR in
20-plan (`60-architecture/constraints.md`, C001-CON-14); this file fixes what either
implementation must do, so the ADR can check candidates against it.

## §2 Safety rules (every operation)
1. **Read-only.** No operation writes the index, refs, objects, configuration, hooks, the
   working tree or any lock file of the repository (C001-REQ-120, C001-REQ-707). With the git
   program this includes setting `GIT_OPTIONAL_LOCKS=0` and passing `--no-optional-locks`, so that
   status and diff never refresh the index.
2. **No repository-configured program runs:** no hook, `core.fsmonitor` program, external diff,
   textconv driver, clean or smudge filter, credential helper or pager. Working-tree content is
   read as bytes; git's built-in end-of-line conversion (`core.autocrlf`, `core.eol`, `text` and
   `eol` attributes) is applied so that line endings do not count as changes.
3. **No network:** no fetch, no remote query; the upstream branch and the default branch of the
   remote are local remote-tracking refs (C001-NFR-011).
4. **Values are data:** a value the developer gives is passed as a revision only after it is
   checked by G-03; it is never placed where it can be read as an option.
5. Errors are returned as the codes of `errors.md`; nothing is retried.

## §3 Operations
| ID | Operation | Result | Semantics | Requirements |
|---|---|---|---|---|
| G-01 | `discover(directory)` | working-tree root, git directory, common git directory, object format | fails with ERR-INTAKE-001 outside a working tree | C001-REQ-106 |
| G-02 | `head()` | HEAD commit hash, current branch or detached | fails with ERR-INTAKE-002 when HEAD resolves to no commit | C001-REQ-106 |
| G-03 | `resolveCommit(value)` | commit hash | a value starting with `-`, containing a control character or `..`, or not resolving to exactly one commit fails with ERR-INTAKE-003; hashes, abbreviated hashes, branch, tag and remote-tracking names and `<rev>~<n>`, `<rev>^` forms are accepted | C001-REQ-102, C001-REQ-105 |
| G-04 | `mergeBase(a, b)` | commit hash or none | best common ancestor; with several, the one git's merge-base algorithm picks first | C001-REQ-102 to C001-REQ-105 |
| G-05 | `upstream(branch)` | remote-tracking ref and its commit, or none | from the branch's `remote` and `merge` configuration; none for a detached HEAD | C001-REQ-103, C001-REQ-104 |
| G-06 | `commitsBetween(base, head)` | commits with hash, parents, author name, e-mail and time, message, changed files; oldest first; merges included | the commits reachable from head and not from base | C001-REQ-109 |
| G-07 | `changeAgainst(base)` | changed files with change type, previous path, binary flag, content hash, file mode of each side (regular, executable, symbolic link); text content of both sides | base tree versus the working tree, staged and unstaged edits together, untracked files not excluded by the ignore rules (`.gitignore` files, `.git/info/exclude`, `core.excludesFile`); renames detected at 50 % similarity | C001-REQ-101, C001-REQ-107, C001-REQ-108 |
| G-08 | `readBlob(commit, path)` | bytes or none | content of a path in a commit's tree | C001-REQ-116, C001-REQ-426 |
| G-09 | `attributeLines(base, head, path)` | for each added line, the commit that added it or "uncommitted"; for each deleted line, the commit that deleted it or "uncommitted" | over the commits of G-06, following the file through renames | C001-REQ-110 |
| G-10 | `userIdentity()` | `user.name` and `user.email` of the repository's effective configuration, each possibly none | read only; a value that is empty or only whitespace is returned as none; the environment variables `GIT_AUTHOR_*` and `GIT_COMMITTER_*` and host-name guesses are not used. The caller (C001-COMP-002) reads it for each of the ten recorded actions of C001-IF-003 §4 and refuses the action when either value is none (ERR-ACT-006) | C001-REQ-712, C001-REQ-721 |
| G-11 | `attributes(commit, paths, name)` | attribute value per path | from the `.gitattributes` files of the commit's tree only (C001-REQ-426); used for `linguist-generated` | C001-REQ-409 |
| G-12 | `workingState(snapshot)` | HEAD hash and the content hash of every path that differs from the snapshot | G-07 against the snapshot's base, compared file by file with the snapshot; used for the moved-on notice only, never to judge an evidence run (C001-IF-013 §3 item 4) | C001-REQ-117 |
| G-13 | `treeEntries(commit)` | every file of the commit's tree with its path, file mode (regular, executable, symbolic link, submodule) and blob hash | read from the object database only; content through G-08; used by C001-COMP-011 to fill evidence workspaces outside the repository (C001-IF-013 §2) | C001-REQ-521, C001-REQ-522 |
| G-14 | `defaultBranches()` | in this order, each only when it exists: the default branch of the remote, `refs/heads/main`, `refs/heads/master`; each as full ref name and commit | the **default branch of the remote** is the remote-tracking ref that the symbolic ref `refs/remotes/<remote>/HEAD` names, where `<remote>` is `origin` when the repository has a remote of that name and otherwise its only remote; with several remotes and none named `origin`, or without that symbolic ref, there is none. Full ref names are used, so a tag named `main` is never taken. The caller (C001-COMP-004) takes the first entry that has a merge base with HEAD (G-04) and uses HEAD when none has (§4) | C001-REQ-104 |

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
C001-NFR-001; the ADR records a measurement. G-13 with G-08 over the whole tree of such a
repository is part of preparing an evidence workspace, which falls under no threshold of
C001-NFR-018 and is measured as a risk by the ADR named in C001-CON-22 (C001-IF-013 §8 item 3).
