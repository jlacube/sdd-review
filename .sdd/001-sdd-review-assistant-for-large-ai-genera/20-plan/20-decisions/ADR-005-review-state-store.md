---
id: "C001-ADR-005"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: accepted
date: 2026-11-20
deciders: ["P-01"]
---
# C001-ADR-005 — Review state store: per-user application-data folder with plain files

## Context and problem
C001-CON-16 requires the review state store (C001-COMP-014) to keep review state on the local
machine, outside the working tree and outside git objects, refs and index, one directory per
snapshot, and leaves the exact location to this ADR. The layout below the root
(`60-architecture/architecture.md` §4.1), the save, restore and crash-safety design (§4.2) and the
record format (C001-IF-009) are fixed by the spec; §4.3 rejected committed record files and git
notes. The store must lose no confirmed entry when a process ends unexpectedly (C001-NFR-014,
C001-REQ-918, C001-REQ-920), keep concurrent entries in order (C001-REQ-917), keep earlier snapshots
(C001-REQ-118), keep the record readable without the UI (C001-REQ-714), and keep the UI server's
token private (C001-CON-10). Without a decision, the store, the CLI's `reviews` output
(C001-IF-001) and the fault-injection test of C001-NFR-014 have no location to work with.

## Considered options
Analysis: C001-OA-007 (four candidates, weighted criteria, sensitivity).

- **Per-user application-data folder, plain files** (4.45) — the layout of §4.1 in the operating
  system's per-user data folder. Recommended.
- **Per-user folder, embedded database** (3.70) — transactional revisions, but a second persistence
  mechanism and a dependency.
- **Common git directory, plain files** (3.55) — travels with the repository, but writes into the
  git directory and inherits its permissions.

Rejected: ignored folder in the working tree (3.60, violates C001-CON-16); reasons in C001-OA-007.

## Decision outcome
Chosen for proposal: **per-user application-data folder with the plain-file layout of §4.1**. It
leaves the repository untouched, keeps the store private to the developer's account, implements
§4.1 and §4.2 with no dependency, and keeps the record a plain file to hand to others. The lead is
0.75, with no near tie. The decision adds no dependency and changes no interface, so it needed no
question to P-01; status stays proposed: accepted with the plan at gate G3. Accepted by P-01 with the plan at gate G3 on 2026-11-20 ("Approve").

What the decision fixes:

1. **Root (store root of §4.1):** Windows `%LOCALAPPDATA%\sdd-review\` (local, not roaming: the
   repository keys are paths of this machine); macOS `~/Library/Application Support/sdd-review/`;
   Linux `$XDG_DATA_HOME/sdd-review/`, `~/.local/share/sdd-review/` when the variable is unset.
   Tests isolate the store by setting these standard variables; no new option is added to
   C001-IF-001.
2. **Repository key (§4.1):** SHA-256 of the canonical path of the common git directory: absolute,
   symbolic links resolved, in the letter case the file system reports, encoded as UTF-8, so that
   two spellings of one path give one key.
3. **Privacy:** on macOS and Linux the root and every directory below it are created with
   owner-only permissions (0700) and files with 0600; on Windows the per-user folder's inherited
   access rules apply. `server.lock` holds the port and token (§4.1).
4. **Record append (§4.2 item 2):** under the record lock, each entry is written as one LF-terminated
   line with one write to a file opened for appending, then flushed with `fsync` (FlushFileBuffers on
   Windows) before the action is confirmed; a defect report and its escalation share one write and
   one flush.
5. **Revision switch (§4.2 item 3):** the documents of a revision are written and flushed in
   `analysis/<revision>/`; `analysis/current` is replaced by writing a temporary file, flushing it
   and renaming it over `current`; on macOS and Linux the directory is flushed after the rename. On
   Windows a rename refused because another program holds the file briefly (for example a virus
   scanner) is retried for up to 2 s; if it still fails, the revision does not become current, its
   job result is not shown and the failure is logged with its context (§4.2 items 3 and 5,
   NFR-D-04).
6. **Record lock (C001-REQ-917):** a lock file next to the record, created with exclusive creation,
   holding the owner's process ID and a random token, and held only for one append and flush.
   Acquisition retries until 10 s, then fails with ERR-STORE-003. A lock file whose owner process is
   no longer running, or that is older than 30 s, is stale and removed before retrying, so a process
   killed while holding the lock does not block the next one (C001-NFR-014).
7. **Plain files:** every document of §4.1 stays a UTF-8 JSON file and the record a JSON Lines file
   (C001-IF-009); no database.

## Consequences
- Good: nothing is written into the working tree or the git directory, so evidence-run observation
  (C001-IF-013 §9) never sees the store's own writes, and intake leaves the repository unchanged
  (C001-REQ-120, C001-REQ-707).
- Good: the token in `server.lock` is readable by the developer's account only.
- Good: losing a rename in a system crash only leaves the previous revision current; by §4.2 item 5
  its job runs again, and no confirmed entry depends on the rename.
- Bad: a moved or renamed repository gets a new key and starts with an empty review list; earlier
  reviews stay on disk under the old key (C001-REQ-118). Re-keying is left to a later change.
- Bad: on macOS, `fsync` does not force the drive's cache; an operating-system crash or power loss
  could drop the last confirmed entries. C001-NFR-014 (a process end) is unaffected; the limit is
  stated in the user documentation.
- Bad: Node.js offers no operating-system file lock (C001-ADR-001), so the lock-file protocol must
  handle stale locks itself; process-ID reuse is covered by the 30 s age limit, which no legitimate
  holder reaches.
- Follow-up: the fault-injection test of C001-NFR-014 kills the process while it holds the record
  lock, between a defect report and the flush, and during a revision switch, on every operating
  system of C001-CON-15.
- Follow-up: the location of evidence workspaces is decided by C001-ADR-006 (C001-CON-22), not
  here; the store root is not used for them.
- Affected constraints: C001-CON-10, C001-CON-15, C001-CON-16. Affected components: C001-COMP-002,
  C001-COMP-014.
