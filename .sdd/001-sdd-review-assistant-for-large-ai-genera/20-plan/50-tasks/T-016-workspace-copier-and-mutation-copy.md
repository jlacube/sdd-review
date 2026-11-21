---
id: C001-T-016
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Copier, ignored paths made available, link retargeting and mutation copy
milestone: C001-M-01
status: in-progress
depends_on: [C001-T-015]
implements: [C001-REQ-509, C001-REQ-516]
satisfies_ac: [C001-AC-509.1, C001-AC-516.1]
verified_by: [C001-TS-525, C001-TS-545, C001-TS-580, C001-TS-585, C001-TC-554]
components: [C001-COMP-011]
risk_refs: [C001-RISK-012]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-016 — Copier, ignored paths made available, link retargeting and mutation copy

## Intent
Make the ignored dependency directories of the built-in list available in a workspace by
copy-on-write clone or byte copy, never by hard link, leaving out transform caches and build
output (C001-ADR-006 §3, C001-IF-013 §2 item 4); retarget links that lead into the working tree
(§4); and make the self-contained mutation copy of a test run's workspace with the root rewrite,
link retargeting and removal of C001-ADR-006 §7 (C001-IF-013 §2 item 3).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/evidence/workspace/copier.ts › clone or copy` | APFS `clonefile`, `FICLONE`, ReFS block cloning, parallel byte copy; modification times kept; free-space check |
| add | `src/core/evidence/workspace/available-paths.ts › ignored paths made available` | the table of C001-ADR-006 §3 and the exclusions of §3.2 |
| add | `src/core/evidence/workspace/links.ts › link retargeting` | links into the working tree point into the workspace; links into the git directory fail the preparation (ERR-EVID-002) |
| add | `src/core/evidence/workspace/mutation-copy.ts › mutation copy` | copy window, equal-length roots, root rewrite in UTF-8 and UTF-16LE, link retargeting, removal, ERR-EVID-006 on failure |
| add | `test/unit/evidence/copier/` | logic without a real file system: built-in list and exclusions per ecosystem, link-target classification (working tree, git directory, outside), equal-length root rewrite in UTF-8 and UTF-16LE on byte buffers |
| add | `test/integration/evidence/copier/` | C001-TC-554, on the real file system of each CI runner: clone detection per file system, no hard link, manifest equality (K3 precondition), link retargeting, mutation copy and its removal on a simulated disk-full failure (ERR-EVID-006) |

## Preconditions
- C001-T-015 done; C001-T-002 confirmed the licences of any native binding used for cloning.

## Step outline
1. Detect clone support per destination file system once per process; implement both paths.
2. Implement the built-in list per ecosystem and the exclusions.
3. Implement link resolution and retargeting with the rules of C001-ADR-006 §4.
4. Implement the mutation copy with the copy window, the root rewrite and the retargeting; a
   failure removes the copy and reports ERR-EVID-006.

## Verification
- `npm test -- test/unit/evidence/copier`
- `npm test -- test/integration/evidence/copier`
- `npm run acceptance -- --scenario C001-TS-525 --scenario C001-TS-545 --scenario C001-TS-580 --scenario C001-TS-585` (with C001-T-064)

## Done when
- [ ] No file of a workspace or a copy is a hard link to a working-tree file.
- [ ] After a copy, no file of the copy names the source workspace root.
- [ ] A failed copy leaves no copy directory and raises ERR-EVID-006.
