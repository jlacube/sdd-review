---
id: "C001-ADR-004"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: accepted
date: 2026-11-18
deciders: ["P-01"]
amended: 2026-11-19
---
# C001-ADR-004 — Git access: the installed git program, read-only plumbing

> **Amended on 2026-11-19** (Amendments 1 and 2 at the end of this file): Amendment 1 aligns it
> with the specification re-approved at G2 on 2026-11-19; Amendment 2 records P-01's decision on
> the environment of the adapter's git processes (Q-hookenv-01). The decision is unchanged.

## Context and problem
Every read of git data goes through the git access port C001-IF-012, provided by the git access
adapter C001-COMP-003 and used by C001-COMP-002, C001-COMP-004, C001-COMP-006 and C001-COMP-011.
The port's safety rules (C001-IF-012 §2, C001-CON-13) forbid writes, programs from the repository's
configuration and network use. C001-CON-14 leaves the implementation to this ADR: the git program
the developer installed (GPL-2.0, only as a separate program, never linked, bundled or
redistributed) or a git library with a permissive licence; the ADR states whether running the git
program is a copyleft dependency under the constitution (NFR-D-03) and rejects it if so. Further
forces: the platforms of C001-CON-15 (C001-NFR-016), the budget of C001-NFR-001 for G-07 and G-09
(C001-IF-012 §5), results fixed per release (C001-CON-17), and the repository left untouched
(C001-REQ-120, C001-REQ-707). Without a decision, intake (C001-REQ-101 to C001-REQ-110) has no
implementation.

## Considered options
Analysis: C001-OA-006 (five candidates, weighted criteria, sensitivity, licence position).

- **Installed git program, read-only plumbing** (4.50 with the licence reading P-01 confirmed; 4.10
  while it was open) — git's own semantics for every operation and repository format. Recommended.
- **gitoxide through an in-house native module** (3.80) — permissive, broad coverage, but no
  maintained Node.js binding and no reftable support.
- **isomorphic-git plus in-house code** (3.65) — permissive pure JavaScript, with several operations
  built in house.

Rejected: libgit2 through nodegit (3.05, GPL-2.0 with linking exception shipped in the package,
against C001-CON-14), in-house git reader (3.50); reasons in C001-OA-006.

## Decision outcome
**Accepted by P-01 on 2026-11-18.** Question Q-gitaccess-01 (`20-plan/questions-log.md`, round 1),
answer: "Installed git, read-only (Recommended)".

Chosen: **the installed git program, run for read-only plumbing only**. Git answers every
operation of C001-IF-012 with its own semantics for every repository format the developer's git can
write, with the least in-house code.

**Licence position (C001-CON-14).** The review assistant runs the developer-installed `git` as a
separate process and exchanges data only through arguments, environment variables and pipes; it
neither links, bundles nor redistributes git, so git is absent from the package's dependency tree.
P-01 confirmed the reading that C001-CON-14 asks this ADR to state: running the separately
installed git program, which the review assistant neither links nor ships, is not a forbidden
copyleft dependency under the constitution (NFR-D-03); git is an external prerequisite like the
shell of C001-IF-013 §1. With that reading the option scores 4.50 (C001-OA-006, Sensitivity). The
reading covers this use only: a later change that links, bundles or redistributes git, or ships a
git binary in the package, falls outside it and needs a new ADR.

What the decision fixes:

1. **Program:** the `git` executable found on `PATH`, resolved once to an absolute path; the
   repository directory and the current directory are never searched. Minimum version 2.34, the
   version of Ubuntu 22.04 LTS, the oldest supported system of C001-CON-15; the version is checked
   when the adapter starts.
2. **Commands:** only commands that read the object database, references, configuration and file
   listings (for example `rev-parse`, `cat-file --batch`, `ls-tree`, `merge-base`, `for-each-ref`,
   `symbolic-ref`, `rev-list`, `config --get`, `ls-files`); no command that writes the index, refs,
   objects or configuration, so no hook fires. Blobs come from one long-lived `cat-file --batch`
   process per review; output uses NUL-separated formats.
3. **Hardening profile on every call:** `GIT_OPTIONAL_LOCKS=0` and `--no-optional-locks`;
   `core.fsmonitor=false`; `protocol.allow=never`, so no transport connects, a partial clone's lazy
   fetch included; empty credential helpers; no pager and no terminal prompt; developer values passed
   after `--end-of-options` and only after the checks of G-03 (C001-IF-012 §2 item 4); no shell
   between the adapter and git.
4. **Working tree:** git never reads working-tree content. The adapter reads working-tree files as
   bytes, applies git's built-in end-of-line rules (`core.autocrlf`, `core.eol`, `text` and `eol`
   attributes) itself and hashes the content in the repository's object format, so no clean or
   smudge filter, textconv driver or external diff can run (C001-IF-012 §2 item 2). The list of
   untracked, not-ignored files comes from `ls-files`.
5. **Hunks and attribution in process:** G-07 hunks and G-09 line attribution are computed from the
   file sides (G-06, G-08) with the diff implementation fixed per release, not by `git diff` or `git
   blame`, so the results do not change with the installed git version (C001-CON-17).
6. **Attributes of a commit's tree (G-11):** read from that tree's `.gitattributes` blobs and
   matched in process, since git 2.34 cannot read attributes from a tree.

## Consequences
- Good: git's merge-base choice (G-04), effective configuration with includes (G-05, G-10), ignore
  rules (G-07) and every repository format the developer's git writes, reftable and SHA-256
  included, come from the reference implementation.
- Good: nothing GPL is linked or shipped; the package's licence check of NFR-D-03 sees no git code.
- Good: the port C001-IF-012 keeps the choice reversible; a library adapter can replace this one
  without changing any consumer.
- Bad: git is a prerequisite with versions from 2.34 upward; the intake must report a missing or too
  old git. `50-interfaces/errors.md` has no code for that condition today (see below).
- Bad: the hardening profile is a deny list. Follow-up task: an integration test with a hostile
  repository fixture (configured fsmonitor, filters, textconv, external diff, pager, hooks,
  credential helper, promisor remote) on git 2.34 and on the latest git release, run in CI on every
  target of C001-CON-15, asserting that no program runs, no file of the repository changes and no
  connection opens (C001-NFR-011).
- Bad: process starts cost tens of milliseconds on Windows; the adapter batches reads and keeps one
  `cat-file` process, and the spike of C001-ADR-001 measures G-07 and G-09 against C001-NFR-001
  (C001-IF-012 §5).
- Risk: files under a clean filter (for example Git LFS) are compared as raw working-tree bytes
  against the stored blob, so they show as changed whenever the filter changes their content. This
  follows from C001-IF-012 §2 item 2 and applies to every candidate; it is reported for the spec
  owner, not decided here, and recorded as defect D-007 in `change.md` (Q-specfix-01).
- Risk: git refuses a repository owned by another user (its `safe.directory` check); the adapter
  maps that refusal to an error instead of overriding it.
- Proposed for a spec revision (not edited here, the spec is approved): an error row in
  `50-interfaces/errors.md` for "git program not found, older than 2.34, or refusing the
  repository", with its CLI exit code; and a constraint "git 2.34 or later is a prerequisite run only
  as a separate program with the hardening profile of C001-ADR-004", source C001-ADR-004, affecting
  C001-COMP-003. Recorded as defects D-001 and D-002 in `change.md` (Q-specfix-01).
- Not verified online in this session: git's licence (GPL-2.0), the git version of Ubuntu 22.04 LTS
  (2.34.1), the effect of each setting of the hardening profile and the formats git writes come
  from the architect's knowledge as of 2026-06 (C001-OA-006, Sources). The git adapter task
  confirms the versions and settings; the licence check of C001-CON-07 (NFR-D-03) must confirm that
  the package's dependency tree holds no git code.
- Affected constraints: C001-CON-13, C001-CON-14, C001-CON-15, C001-CON-17. Affected components:
  C001-COMP-003, C001-COMP-004, C001-COMP-006, C001-COMP-011.

## Amendment 1 — 2026-11-19: alignment with the revised specification

**Why.** This ADR raised defects D-001, D-002 and D-007 (Q-specfix-01). The specification revision
that closed them was re-approved at G2 on 2026-11-19. It added C001-REQ-125 with ERR-INTAKE-008
and C001-IF-012 §6 (check of the git program and the repository), the prerequisites of
C001-CON-18, C001-REQ-126 to C001-REQ-128 with ERR-INTAKE-009 and C001-IF-012 §7 (files under a
clean filter), C001-IF-012 §8 (files under no clean filter, sparse checkouts, hash reuse in G-12)
and the operations G-15 and G-16. These rest on P-01's answers to Q-cleanfilter-01,
Q-cleanfilter-02, Q-filterworkspace-01, Q-nonlfs-01 and Q-movedon-01 (`10-spec/questions-log.md`,
rounds 13 to 17).

**What stays.** The decision is unchanged: the installed git program, run for read-only plumbing
only. P-01's acceptance of 2026-11-18 (Q-gitaccess-01) and the licence position are unchanged.
No new option was considered, so C001-OA-006 is unchanged. The text above stays as it was
accepted. Where it differs from this amendment, this amendment applies, and C001-IF-012 is the
contract for both.

| Passage above | Now |
|---|---|
| Decision item 1: "the version is checked when the adapter starts" | A1.1 |
| Decision item 2 (commands) | A1.2 |
| Decision item 3 (hardening profile) | A1.3 |
| Decision item 4 (working tree): "git never reads working-tree content …" | A1.2, A1.4, A1.5 |
| Decision item 6 (attributes of a commit's tree) | A1.5 |
| Consequences: "Bad: git is a prerequisite … has no code for that condition today" | A1.1 |
| Consequences: "Bad: the hardening profile is a deny list" (integration test) | A1.8 |
| Consequences: "Bad: process starts cost …" (measurement) | A1.9 |
| Consequences: "Risk: files under a clean filter (for example Git LFS) are compared as raw working-tree bytes …" | A1.5 (no longer holds) |
| Consequences: "Risk: git refuses a repository owned by another user …" | A1.1 |
| Consequences: "Proposed for a spec revision …" | A1.1 (done) |

**A1.1 — Check of the program and the repository (C001-IF-012 §6, C001-REQ-125, C001-CON-18;
D-001 and D-002 closed).** The adapter runs the checks of C001-IF-012 §6 once per process. They
run before the first git read of every command that reads git data, and before the local review
UI starts. For each of the five causes that §6 lists, the command stops with ERR-INTAKE-008 (CLI
exit 3), with the details that §6 names. The adapter never overrides a refusal: it passes no
`safe.directory` value and changes no ownership or configuration. The repository check also applies
to submodule repositories. There a refusal does not stop the command: G-16 gives the submodule as
absent (A1.7).

**A1.2 — Reading the index; git commands that never decide a comparison (C001-IF-012 §7 item 1,
§8, G-15).** git settles a racy index entry by comparing content, and comparing content runs the
clean filter, which C001-IF-012 §2 item 2 forbids. A git diff without an index refresh takes the
index blob of an entry whose stat data match, and it skips entries marked assume-unchanged or
skip-worktree; §8 excludes both. So `git status`, `git diff-files`, `git diff-index`, `git diff`
against the working tree and `git update-index --refresh` never decide whether a file is changed
or up to date. These run in the adapter's own process: the up-to-date test with its racy test, the
Git LFS pointer check, every content comparison and the hash reuse of G-12.

Index entries are read without a lock, without a refresh and without running any program. That
covers the stage, the intent-to-add and skip-worktree flags, sparse-directory entries, the file
mode, the blob, and the stat fields of §7 item 1 with nanoseconds. Two means qualify, both reads
under C001-IF-012 §2 item 1: a read-only form of `git ls-files`, or reading the index file in
process. The git adapter task chooses one. It shows, on git 2.34 and on the latest git release,
that the chosen means yields every field that G-15 and §7 item 1 need, for index versions 2 to 4
and for split and sparse indexes. The modification time of the index file comes from the file's
own stat data.

**A1.3 — Hardening profile (C001-IF-012 §2, §8 item 1).** The profile of decision item 3 applies to
every repository the adapter reads: the repository of G-01 and every submodule repository of G-16.
It adds `core.untrackedCache=false`, so that no read uses the untracked cache.

**A1.4 — Files under no clean filter, and sparse checkouts (C001-IF-012 §8 items 1 and 2,
C001-REQ-101).** Decision item 4 holds for these files, with the precisions of §8:
- G-07 reads and hashes each such file at every intake and reuses no hash, whatever the index
  records for it. This covers every such file of the base tree and of the index, and every
  untracked file that the ignore rules do not exclude.
- A path outside the sparse checkout takes the blob and mode of its index entry, whatever its
  filter. No working-tree content is read for it.

The adapter decides whether a path is outside the sparse checkout from the index entry data of
A1.2 and whether a file exists at the path.

**A1.5 — Files under a clean filter (C001-IF-012 §7, C001-REQ-126 to C001-REQ-128,
ERR-INTAKE-009; Q-cleanfilter-01, Q-cleanfilter-02, Q-nonlfs-01; D-007 closed).** The risk above
("compared as raw working-tree bytes … show as changed") no longer holds. Still, no filter runs.
The adapter implements §7 as follows:
- **Under a clean filter, and its driver:** the `filter` attribute comes from the `.gitattributes`
  files of the base commit's tree only, read and matched in process as decision item 6 states
  (G-11). The driver's `filter.<driver>.clean` and `filter.<driver>.process` keys are read with
  `config --get`. No other attribute source counts (§7).
- **Git LFS files:** the adapter streams the working-tree bytes, without end-of-line conversion,
  and computes their SHA-256 hash and size. It compares them first with the pointer file of the
  base side, then with the pointer file of the index entry (§7 item 7). The pointer parser accepts
  only the version 1 format of item 7. No stat data, index flag or racy test is used.
- **Other filters:** the up-to-date test of §7 item 1 runs in process (A1.2), using the Windows
  values that item 1 names. It leads to the index blob or to the working-tree bytes (§7 items 2
  and 3). P-01 accepted the limit of §7 item 8 (Q-nonlfs-01).
- **Notice:** ERR-INTAKE-009 is raised once per intake, as §7 item 4 states.

**A1.6 — Hash reuse in G-12 (C001-IF-012 §8 item 3, §7 item 5, C001-REQ-117; Q-movedon-01).** For
each file that G-07 or G-12 compared by working-tree content, the adapter keeps the hash and the
stat data, computed as in §7 item 1. They are kept only in the memory of the adapter's process,
under the time-stamp rule of §8 item 3:
- the clock time is taken before the stat data are read;
- the stat data are read before the content;
- the hash is kept only when the modification time and the change time are both at least three
  seconds older than that clock time.

P-01 accepted the Windows gap and the clock-lag limit of the moved-on notice (Q-movedon-01).

**A1.7 — Operations G-15 and G-16 (C001-IF-012 §3).** C001-COMP-003 adds two operations. Both serve
C001-COMP-011 (C001-ADR-006, Amendment 1).
- **`indexState` (G-15)** reads the index entry data of A1.2 and the stat data of the working-tree
  file. It is never used for a Git LFS file.
- **`submoduleTree` (G-16)** locates the submodule's local repository from the parent's data only,
  as G-16 states. Every git call names that repository explicitly instead of discovering it from
  the path. The calls apply the profile of A1.3 and the repository check of A1.1. The result is
  the tree and blobs of the recorded commit, or "absent" with one of the three causes of G-16.

**A1.8 — Hostile-repository integration test.** The test named in the Consequences runs on git 2.34,
on the latest git release and on every target of C001-CON-15. It adds these fixtures:
- a clean filter and a `filter.<driver>.process` program that would leave a marker file; neither
  is ever started, also for a racy entry and during G-12, G-15 and G-16;
- Git LFS files: unchanged; staged; edited and not staged; checked out as a pointer file only;
  with a pointer file that has extension lines; with a blob that is not a pointer file; and with a
  forged index entry or modification time, which does not hide the edit;
- `filter` attributes in `.git/info/attributes`, in `core.attributesFile` and in a `.gitattributes`
  file that the change adds; none of them puts a file under a filter;
- assume-unchanged, skip-worktree and fsmonitor-valid flags and an untracked cache on files under
  no clean filter; none of them hides an edit;
- a sparse checkout with a sparse index;
- submodule repositories that are missing, that lack the commit, or that git refuses;
- the five causes of ERR-INTAKE-008.

It asserts, as before, that no program runs, no file of the repository changes and no connection
opens (C001-NFR-011). The intake scenarios C001-TS-162 to C001-TS-190 and C001-TS-192 to
C001-TS-194 run on the same fixtures.

**A1.9 — Measurement (C001-IF-012 §5).** The spike of C001-ADR-001 measures G-07 and G-09 against
C001-NFR-001. That measurement includes reading and hashing every checked-out file under no clean
filter at each intake. This time grows with the checked-out working tree, not with the change.
Git LFS hashing is measured where a reference repository holds Git LFS content. In the review UI,
the G-12 reads of a verdict fall under the scripted session of C001-NFR-003.

**Not verified online in this session.** These facts come from the architect's knowledge as of
2026-06 and from C001-IF-012: how git handles racy entries, the fields that `git ls-files` prints,
the effect of `core.untrackedCache=false` on a read-only command, and the stat values that Git for
Windows records. The git adapter task confirms them (A1.2).

**Affected constraints and components, added:** C001-CON-18 (prerequisites, ERR-INTAKE-008) and
C001-CON-22 (G-15 for copies of files under a clean filter); C001-COMP-011 as the consumer of
G-15 and G-16.

## Amendment 2 — 2026-11-19: environment of the adapter's git processes (Q-hookenv-01)

**Why.** C001-REQ-525 and C001-IF-013 §1 item 7 remove the git repository-locating variables from
evidence commands only. A review started from a git hook, or from a shell that sets them, would
also hand `GIT_DIR`, `GIT_INDEX_FILE`, `GIT_WORK_TREE` and the others to the adapter's own git
processes. A pre-commit hook can point `GIT_INDEX_FILE` at a temporary index, so the adapter could
read the wrong index, repository or object store.

**Decision of P-01.** Question Q-hookenv-01 (`20-plan/questions-log.md`, Round 4), answer: "Plan
task + risk (Recommended)", the option that reads "The git-adapter task starts every git read with
those variables cleared, with a test and a risk entry; consistent with the spec." No requirement or
interface of the specification changes.

**What stays.** The decision, P-01's acceptance of 2026-11-18 (Q-gitaccess-01), the licence
position and Amendment 1 are unchanged. No new option was considered, so C001-OA-006 is unchanged.

**A2.1 — Environment of every git process of the adapter.** This completes decision item 3 and
A1.3.
- Every git process that C001-COMP-003 starts gets the developer's environment without the
  variables of the "Removed" list of C001-IF-013 §1 item 7; on Windows, names match whatever their
  letter case. The list is the one built into the release that the evidence runner also uses
  (C001-ADR-006, Amendment 1, A1.2).
- This covers the checks of A1.1, the long-lived `cat-file --batch` process, every read of the
  repository of G-01 and every read of a submodule repository (G-16, A1.7).
- The "Replaced" and "Kept" rules of that item govern evidence commands only. The adapter keeps
  every other variable of the developer's environment, apart from those the hardening profile sets.
- G-01 finds the repository from the directory it receives. Every later read names the repository
  it reads explicitly; none is found through these variables.

**A2.2 — Residual and verification.** Residual (C001-RISK-005): a review started inside a git hook
reads the repository's own index, not the hook's temporary index. C001-T-005 implements A2.1, and
C001-TC-025 verifies it with the variables set as a pre-commit hook sets them.

**Affected constraints and components:** C001-CON-13 and C001-COMP-003. No new constraint.
