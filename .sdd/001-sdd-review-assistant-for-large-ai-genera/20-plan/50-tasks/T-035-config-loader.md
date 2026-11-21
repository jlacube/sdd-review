---
id: C001-T-035
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Configuration loader — base-commit configuration, floor and effective policy
milestone: C001-M-02
status: done
depends_on: [C001-T-006, C001-T-003]
implements: [C001-REQ-426, C001-REQ-425, C001-REQ-820, C001-REQ-819]
satisfies_ac: [C001-AC-426.1, C001-AC-425.1, C001-AC-820.1, C001-AC-819.1]
verified_by: [C001-TS-476, C001-TS-477, C001-TS-478, C001-TS-479, C001-TS-474, C001-TS-475, C001-TS-858, C001-TS-859, C001-TS-860, C001-TS-856]
components: [C001-COMP-006]
risk_refs: []
estimate: L
report: { commit: 5d09b0f, completed_at: 2026-11-21, notes: "Config loader from base commit, floor, effective policy, config validate; 67 unit tests, TS-861; other scenarios await T-049/T-053/T-085/T-086; combined tree verified (1,265 tests, 57 CI scenarios); CI green on 4 runners at cad9d3f; shared wiring in ed6f09c; PR at M-01/M-02 merge" }
---
# C001-T-035 — Configuration loader: base-commit configuration, floor and effective policy

## Intent
Read `.sdd-review/config.json` from the base commit (never from the working tree), validate it
against C001-IF-004, remove and report settings that weaken a built-in guarded area, refuse
credential-store services outside the `sdd-review` namespace (ERR-CFG-004), and merge the rest with
the built-in policy of C001-IF-005 into the effective configuration, or yield the unreadable state
that makes triage clear nothing and the gateway use no model.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/config/load.ts › read from base commit` | blob read through the git port; absent file means defaults |
| add | `src/core/config/validate.ts › schema and floor` | C001-IF-004 schema, `formatVersion`, `keyCredential.service` pattern, removal of weakening settings with notices |
| add | `src/core/config/builtin-policy.ts › built-in policy` | C001-IF-005 §1 to §11 as data |
| add | `src/core/config/effective.ts › effective configuration` | merge result or the unreadable state with its reason |
| add | `test/unit/config/` | valid, invalid, weakening, foreign service, edited in working tree only |

## Preconditions
- C001-T-006 and C001-T-003 done.

## Step outline
1. Read the file from the base commit; an edit in the working tree has no effect.
2. Validate; any error yields the unreadable state with its code.
3. Remove weakening settings with a notice per setting.
4. Encode the built-in policy and merge; record source and ignored settings for the triage document.

## Verification
- `npm test -- test/unit/config`
- `npm run acceptance -- --scenario C001-TS-476 --scenario C001-TS-477 --scenario C001-TS-478 --scenario C001-TS-479`
- `npm run acceptance -- --scenario C001-TS-474 --scenario C001-TS-475` (with C001-T-049)
- `npm run acceptance -- --scenario C001-TS-858 --scenario C001-TS-859 --scenario C001-TS-860 --scenario C001-TS-856` (with C001-T-085)

## Done when
- [ ] The configuration is never read from the working tree.
- [ ] Every scenario listed passes once its consumer exists.
