---
id: "C001-OA-007"
artifact: plan/option-analysis
change: "CHG-001"
phase: 20-plan
status: draft
---
# OA-007 — Location and format of the review state store

## Problem
Decide where the review state store (C001-COMP-014) keeps its root and in which form it keeps the
state, within C001-CON-16: on the local machine, outside the working tree and outside git objects,
refs and index, one directory per snapshot, an append-only review record whose entries are flushed
to disk before an action is confirmed, and analysis results saved per revision as one complete set
before the revision is shown. The design of save, restore and crash safety is fixed in
`60-architecture/architecture.md` §4.2, the directory layout below the root in §4.1, and the record
format in C001-IF-009; §4.3 already rejected record files committed in the repository and git notes.
What is open: the root location (C001-CON-16 names the common git directory and the user's
application-data directory as examples) and whether the layout's analysis documents stay plain
files. Forces: no confirmed entry lost when a process ends unexpectedly (C001-NFR-014,
C001-REQ-918, C001-REQ-920); concurrent writers kept in order (C001-REQ-917); earlier snapshots
kept (C001-REQ-118); the record readable without the UI and given to others as a file
(C001-REQ-714, C001-IF-009); the token of the UI server kept in `server.lock` with owner-only
permissions (§4.1, C001-CON-10); every operating system of C001-CON-15. The decision assumes the
runtime of C001-ADR-001; it adds no dependency in its recommended form.

## Criteria
| Criterion | Weight (%) |
|---|---|
| Repository untouched and store private | 25 |
| Crash safety and concurrency on every OS | 25 |
| Record readable and shareable as a file | 15 |
| Association with the repository over time | 15 |
| Simplicity | 20 |

- **Repository untouched and store private:** nothing is written into the working tree or the git
  directory (C001-REQ-120, C001-REQ-707, C001-CON-16), no write disturbs the observation of evidence
  runs (C001-IF-013 §9), and the store, `server.lock` with its token included, is readable by the
  developer's account only.
- **Crash safety and concurrency on every OS:** append, flush, atomic replacement and locking behave
  as §4.2 needs on a local disk of every target (C001-NFR-014, C001-REQ-917).
- **Record readable and shareable as a file:** the record stays the documented JSON Lines file of
  C001-IF-009 and the analysis documents stay readable without the tool (C001-REQ-714).
- **Association with the repository over time:** reviews stay attached to their repository when it
  is moved or renamed, and leave with it when it is deleted.
- **Simplicity:** constitution principle 1; no extra dependency; one convention per operating
  system.

## Candidates
- **1 — Per-user application-data folder, plain files:** the root is the operating system's
  per-user data folder (`%LOCALAPPDATA%\sdd-review` on Windows, `~/Library/Application
  Support/sdd-review` on macOS, `$XDG_DATA_HOME/sdd-review` or `~/.local/share/sdd-review` on
  Linux); below it the layout of §4.1, keyed by repository. The simplest option: the layout as
  specified in a standard place.
- **2 — Common git directory, plain files:** the root is `<common git directory>/sdd-review/`, one
  per repository, with the snapshot directories of §4.1 below it.
- **3 — Per-user application-data folder, embedded database:** the root of candidate 1; the index,
  snapshot documents and analysis revisions in an embedded SQLite database per repository; the
  review record kept as the JSON Lines file of C001-IF-009.
- **4 — Ignored folder in the working tree:** the root is `.sdd-review/state/` in the working tree,
  excluded through the repository's ignore rules.

Four candidates only: the other places searched are a sibling folder next to the working tree
(writes outside the repository into a parent directory the developer may not own, with no gain over
candidate 1) and the system's temporary folder (cleared by the system, against C001-REQ-118 and
C001-NFR-014); neither is a genuine alternative.

## Scores
| Candidate | Repository untouched and store private | Crash safety and concurrency on every OS | Record readable and shareable as a file | Association with the repository over time | Simplicity | Weighted |
|---|---|---|---|---|---|---|
| Weights | 25 | 25 | 15 | 15 | 20 | 100 |
| 1 — Per-user application-data folder, plain files | 5 | 4 | 5 | 3 | 5 | 4.45 |
| 2 — Common git directory, plain files | 2 | 3 | 5 | 5 | 4 | 3.55 |
| 3 — Per-user folder, embedded database | 5 | 4 | 4 | 3 | 2 | 3.70 |
| 4 — Ignored folder in the working tree | 1 | 4 | 5 | 4 | 5 | 3.60 |

Justifications:

- **1.** Untouched 5: nothing in the repository; per-user folders are private by default on Windows,
  and the root is created with owner-only permissions on macOS and Linux. Crash safety 4: append and
  flush, write-then-rename and lock files work on the local disks of every target; macOS's flush
  does not force the drive cache (no effect on a process end, the case of C001-NFR-014), and a
  rename on Windows can fail briefly while another program holds the file, so it is retried.
  Readable 5: the files of §4.1 as specified. Association 3: the repository key is derived from the
  path of the common git directory (§4.1), so a moved repository starts with an empty review list;
  the earlier reviews stay on disk. Simplicity 5: no dependency; one standard folder per system.
- **2.** Untouched 2: writes files into the git directory, which C001-CON-16 permits but which
  C001-REQ-707's intent ("verdicts change nothing in the repository") and the read-only stance of
  C001-IF-012 §2 argue against; the files inherit the repository's permissions, so in a shared
  repository the token in `server.lock` may be readable by other users. Crash safety 3: the git
  directory may sit on a network share or a cross-mounted file system where locks and atomic
  rename are unreliable. Readable 5. Association 5: moves and leaves with the repository.
  Simplicity 4: no location convention needed, but a read-only repository cannot hold reviews.
- **3.** Untouched 5. Crash safety 4: transactions make revisions atomic, but the record, the part
  C001-NFR-014 protects, is still a JSON Lines file, so two persistence mechanisms must be right.
  Readable 4: analysis documents leave plain files and need `export` (C001-REQ-912). Association 3.
  Simplicity 2: a database dependency (a native module, or a runtime module still settling) for no
  requirement that plain files miss.
- **4.** Untouched 1: writes into the working tree, against C001-CON-16; evidence-run observation
  would report the store's own writes (C001-IF-013 §9, ERR-EVID-009), and a clean of ignored files
  deletes every review. Crash safety 4. Readable 5. Association 4: moves with the repository but is
  lost on a clean. Simplicity 5.

Sources (not opened in this session: no web tool was available on 2026-11-18; facts are the
architect's knowledge as of 2026-06): XDG Base Directory Specification
<https://specifications.freedesktop.org/basedir-spec/latest/>; Apple File System Programming Guide,
Application Support directory
<https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/>;
Windows known folders (`LocalAppData`)
<https://learn.microsoft.com/windows/win32/shell/knownfolderid>; Node.js file system API (`fsync`,
`rename`, exclusive open) <https://nodejs.org/api/fs.html>; macOS `fsync` and `F_FULLFSYNC`
(`man 2 fsync`).

## Sensitivity
- **Top two valid candidates: 1 (4.45) and 3 (3.70), gap 0.75.** 1 − 3 = w(readable) +
  3·w(simplicity). No plausible weight change flips them: even with simplicity at 5 % and readability
  at 5 %, candidate 1 leads by 0.20.
- **Candidate 2.** 1 − 2 = 3·w(untouched) + w(crash safety) − 2·w(association) + w(simplicity);
  candidate 2 leads only when association with the repository outweighs the other criteria by far
  (for example association at 50 % with the others scaled down), which no requirement supports:
  C001-REQ-118 asks to keep snapshots, not to move them with the repository.
- **Score risk.** If developers move repositories often, association for candidate 1 could be 2;
  its total falls to 4.30 and still leads. A later change can add re-keying of a moved repository.
- Candidate 4 violates C001-CON-16 and is not presented, whatever the weights.

## Presented
1. **1 — Per-user application-data folder, plain files** (4.45) — recommended.
2. **3 — Per-user folder, embedded database** (3.70) — the transactional alternative.
3. **2 — Common git directory, plain files** (3.55) — the alternative that travels with the
   repository, named as an example in C001-CON-16.

## Recommendation
**1 — Per-user application-data folder, plain files:** it leaves the repository untouched, keeps
the store private to the developer's account, implements the layout and crash-safety design of
§4.1 and §4.2 with no dependency, and keeps the record a plain file to hand to others. No near tie
applies (0.75 ahead of candidate 3).

## Rejected
- **4 — Ignored folder in the working tree** (3.60) — writes into the working tree, against
  C001-CON-16, disturbs the observation of evidence runs and is deleted by a clean of ignored files.
