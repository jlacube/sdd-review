---
id: C001-T-015
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Evidence workspace — location, fill, reset, check and lifetime
milestone: C001-M-01
status: in-progress
depends_on: [C001-T-006, C001-T-007, C001-T-008]
implements: [C001-REQ-509, C001-REQ-521, C001-REQ-522]
satisfies_ac: [C001-AC-509.1, C001-AC-521.1, C001-AC-522.1]
verified_by: [C001-TS-523, C001-TS-524, C001-TS-559, C001-TS-563, C001-TS-564, C001-TC-553]
components: [C001-COMP-011, C001-COMP-014]
risk_refs: [C001-RISK-012]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-015 — Evidence workspace: location, fill, reset, check and lifetime

## Intent
Every evidence run happens in a workspace outside the working tree and the git directory
(C001-CON-22, C001-IF-013 §2). This task builds the evidence root and its check, the layout with
owner files, the fill from the base tree and the snapshot content with git's checkout end-of-line
conversion, the per-path index, the touched-path reset and check (C001-IF-013 §3), the disk-space
check, removal at process end and the sweep of left-over workspaces (C001-ADR-006 §1 and §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/evidence/workspace/root.ts › evidence root and check` | per-OS root, outside and below none of working tree, git directory, common git directory; fallback to the OS temporary directory; ERR-EVID-002 |
| add | `src/core/evidence/workspace/fill.ts › fill workspace` | base tree minus deletions plus snapshot files, EOL conversion, modes, symbolic links and the Windows fallback, parallel writes |
| add | `src/core/evidence/workspace/index.ts › workspace index, reset, check` | size, times, file ID, SHA-256; touched-path comparison; full walk when events were lost |
| add | `src/core/evidence/workspace/ignore.ts › ignore rules` | git semantics in process, read once at intake |
| add | `src/core/evidence/workspace/lifetime.ts › owner files, removal, sweep` | states preparing, free, in run, copying, mutation; sweep on open |
| add | `test/unit/evidence/workspace/` | logic without git or real file system: containment check on given real paths, ignore-rule matching, owner-file state transitions, touched-path comparison of recorded index entries |
| add | `test/integration/evidence/workspace/` | C001-TC-553, against real git and the real file system: fill equals a git checkout of the snapshot; reset restores it; the check detects edits through the workspace watcher and by full walk on lost events; disk-space check; removal and sweep |

## Preconditions
- C001-T-006, C001-T-007, C001-T-008 done.
- Where C001-ADR-006 and C001-IF-013 disagree, C001-IF-013 applies (`10-strategy.md` §2).

## Step outline
1. Implement the root resolution and the containment check with real paths.
2. Implement the fill and compare it with a checkout of the snapshot made by git in an integration
   test.
3. Implement the index, the reset and the touched-path check with a workspace watcher; fall back
   to a full walk on lost events.
4. Implement owner files, disk-space check, removal and the sweep.

## Verification
- `npm test -- test/unit/evidence/workspace`
- `npm test -- test/integration/evidence/workspace`
- `npm run acceptance -- --scenario C001-TS-523 --scenario C001-TS-524 --scenario C001-TS-559 --scenario C001-TS-563 --scenario C001-TS-564` (with C001-T-060)

## Done when
- [ ] A filled workspace equals a git checkout of the snapshot byte for byte on each CI operating system.
- [ ] An evidence root inside the working tree is refused with ERR-EVID-002.
- [ ] Workspaces of a process that ended are removed by the next sweep.
