---
id: C001-T-028
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Files under a clean filter at intake — Git LFS pointers and other filters
milestone: C001-M-02
status: todo
depends_on: [C001-T-006, C001-T-008]
implements: [C001-REQ-126, C001-REQ-127, C001-REQ-128]
satisfies_ac: [C001-AC-126.1, C001-AC-127.1, C001-AC-128.1]
verified_by: [C001-TS-167, C001-TS-168, C001-TS-169, C001-TS-170, C001-TS-172, C001-TS-173, C001-TS-179, C001-TS-180, C001-TS-190, C001-TS-181, C001-TS-182, C001-TS-177, C001-TS-174, C001-TS-175, C001-TS-187, C001-TS-188]
components: [C001-COMP-003, C001-COMP-004]
risk_refs: [C001-RISK-003, C001-RISK-008]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-028 — Files under a clean filter at intake

## Intent
Run no filter program and still give a correct change for files under a clean filter (C001-IF-012
§7): a Git LFS file is read from the pointer file whose SHA-256 hash and size its working-tree bytes
match; a file under another clean filter is read from the index while git records it as up to date
there (hardened stat rule, racy entries excluded); otherwise the file is kept and reported by its
working-tree bytes with ERR-INTAKE-009 and its cause.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/git/clean-filter.ts › filter attribution` | which paths are under a clean filter, from the effective configuration and `.gitattributes`, without running a filter |
| add | `src/core/git/lfs.ts › pointer match` | parse pointer files, hash and size the working-tree bytes |
| add | `src/core/git/index-stat.ts › up-to-date rule` | stat data comparison and racy-entry rule of C001-IF-012 §7 |
| modify | `src/core/intake/change.ts › clean-filter files` | apply §7 to each such file; ERR-INTAKE-009 notices with cause texts of `errors.md` |
| add | `test/fixtures/repos/fx-lfs/`, `fx-crypt/` | fixtures with the filter stub that logs every call |

## Preconditions
- C001-T-006 and C001-T-008 done; the fixture builder of C001-T-004 can set filter configuration.

## Step outline
1. Implement filter attribution and verify on `fx-crypt` that the filter stub's log stays empty.
2. Implement the LFS pointer match and its fallbacks.
3. Implement the stat rule for other filters per OS (Windows time-resolution caveat of §7 item 5).
4. Report each kept file with its cause; residual limits stay as accepted by P-01 (Q-nonlfs-01).

## Verification
- `npm test -- test/unit/git/clean-filter`
- `npm run acceptance -- --scenario C001-TS-167 --scenario C001-TS-168 --scenario C001-TS-169 --scenario C001-TS-170 --scenario C001-TS-172 --scenario C001-TS-173`
- `npm run acceptance -- --scenario C001-TS-179 --scenario C001-TS-180 --scenario C001-TS-190 --scenario C001-TS-181 --scenario C001-TS-182 --scenario C001-TS-177`
- `npm run acceptance -- --scenario C001-TS-174 --scenario C001-TS-175 --scenario C001-TS-187 --scenario C001-TS-188`

## Done when
- [ ] All listed scenarios pass on the three CI operating systems.
- [ ] The filter stub's log is empty after every scenario.
