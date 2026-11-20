---
id: C001-T-067
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Evidence workspaces — clean-filter files, Git LFS files and submodules
milestone: C001-M-04
status: todo
depends_on: [C001-T-015, C001-T-028, C001-T-060, C001-T-034]
implements: [C001-REQ-526, C001-REQ-527, C001-REQ-528, C001-REQ-529]
satisfies_ac: [C001-AC-526.1, C001-AC-527.1, C001-AC-528.1, C001-AC-529.1]
verified_by: [C001-TS-591, C001-TS-952, C001-TS-592, C001-TS-593, C001-TS-594, C001-TS-595, C001-TS-596, C001-TS-597, C001-TS-598, C001-TS-599, C001-TS-953, C001-TS-954, C001-TS-955, C001-TS-956, C001-TS-961, C001-TS-962, C001-TS-957, C001-TS-958, C001-TS-959]
components: [C001-COMP-011, C001-COMP-003]
risk_refs: [C001-RISK-003, C001-RISK-008]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-067 — Evidence workspaces: clean-filter files, Git LFS files and submodules

## Intent
Fill a workspace with the bytes a run needs for files under a clean filter (C001-IF-013 §2 item 1):
a Git LFS file gets its working-tree copy when the copy's SHA-256 hash and size match its pointer
file; a file under another clean filter gets its working-tree copy while git's index records it as
up to date with its snapshot-side blob; otherwise its stored form with ERR-EVID-013. Fill submodule
paths from their local repositories through the git port, and leave a path empty with ERR-EVID-012
when its commit cannot be read (§2 item 8; this overrides C001-ADR-006 §5).

## Targets
| Kind | Target | Change |
|---|---|---|
| modify | `src/core/evidence/workspace/fill.ts › clean-filter files` | rules of §2 item 1 using C001-T-028 |
| add | `src/core/evidence/workspace/submodules.ts › submodule fill` | recursive, through G-16; empty directory and ERR-EVID-012 with its three causes |
| add | `test/unit/evidence/workspace/filters.test.ts`, `submodules.test.ts` | `fx-lfs`, `fx-crypt`, nested and missing submodules |
| add | `test/unit/evidence/workspace/reopen-filter-set.test.ts` | the set of files under a clean filter, with drivers, recomputed by a second process equals the set intake used |

## Preconditions
- C001-T-015, C001-T-028 and C001-T-060 done; C001-T-034 done (reopen of a stored snapshot).

## Step outline
1. Reuse the pointer match and the up-to-date rule of C001-T-028 at fill time.
2. Write stored forms with ERR-EVID-013 where neither rule holds.
3. Fill submodules recursively; report each unreadable commit with its cause.
4. Reopened process: C001-IF-008 does not store which files are under a clean filter, so a process
   that reopens the snapshot (C001-T-034, C001-T-080) computes the set again from the
   `.gitattributes` files of the base commit's tree and the driver keys of the effective
   configuration (C001-IF-012 §7; C001-ADR-004 A1.5, C001-ADR-006 Amendment 1). Use one function
   for intake and for the evidence runner, so both apply the same rule. Test it: intake in process
   A, record the set from A's in-memory result; reopen in process B with the same configuration and
   fill a workspace; the set B uses equals A's, path by path and driver by driver.
5. Record, without asserting a rule, what B does when a driver's `filter.<driver>.clean` or
   `filter.<driver>.process` key was removed or added between A and B; P-01 accepted this case as
   a documented limit (Q-filterreopen-01, C001-RISK-008), which C001-T-101 states to users.

## Verification
- `npm test -- test/unit/evidence/workspace` (includes the reopen test)
- `npm run acceptance -- --scenario C001-TS-591 --scenario C001-TS-952 --scenario C001-TS-592 --scenario C001-TS-593 --scenario C001-TS-594 --scenario C001-TS-595 --scenario C001-TS-596`
- `npm run acceptance -- --scenario C001-TS-597 --scenario C001-TS-598 --scenario C001-TS-599`
- `npm run acceptance -- --scenario C001-TS-953 --scenario C001-TS-954 --scenario C001-TS-955 --scenario C001-TS-956 --scenario C001-TS-961 --scenario C001-TS-962 --scenario C001-TS-957 --scenario C001-TS-958 --scenario C001-TS-959`

## Done when
- [ ] The filter stub's log stays empty in every scenario.
- [ ] With an unchanged configuration, the set of files under a clean filter that a reopened process
      uses equals the set intake used, on the three CI operating systems.
- [ ] The listed scenarios pass on the three CI operating systems.
