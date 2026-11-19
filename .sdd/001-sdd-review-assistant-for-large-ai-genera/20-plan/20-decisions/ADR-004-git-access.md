---
id: "C001-ADR-004"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: accepted
date: 2026-11-18
deciders: ["P-01"]
---
# C001-ADR-004 — Git access: the installed git program, read-only plumbing

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
