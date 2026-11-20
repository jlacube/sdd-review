---
id: C001-T-053
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Formatting and generated-file clearing, evidence records and the keep-open guards
milestone: C001-M-03
status: todo
depends_on: [C001-T-052, C001-T-049, C001-T-050, C001-T-041]
implements: [C001-REQ-408, C001-REQ-409, C001-REQ-412, C001-REQ-419, C001-REQ-427, C001-REQ-217, C001-REQ-418]
satisfies_ac: [C001-AC-408.1, C001-AC-409.1, C001-AC-412.1, C001-AC-419.1, C001-AC-427.1, C001-AC-217.1, C001-AC-418.1]
verified_by: [C001-TS-427, C001-TS-428, C001-TS-429, C001-TS-430, C001-TS-431, C001-TS-432, C001-TS-433, C001-TS-434, C001-TS-443, C001-TS-444, C001-TS-459, C001-TS-460, C001-TS-461, C001-TS-480, C001-TS-481, C001-TS-239, C001-TS-249, C001-TS-457, C001-TS-458, C001-TS-486]
components: [C001-COMP-010, C001-COMP-006]
risk_refs: [C001-RISK-011]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-053 — Formatting and generated-file clearing, evidence records and the keep-open guards

## Intent
Complete the static clearing stage: clear formatting-only hunks and files the repository declares
as generated (C001-IF-005 §11, read from the base commit), clear by no other means than the five
rules, attach an evidence record to every cleared hunk, keep open every hunk with a deterministic
architecture or design-quality finding, and clear nothing while the configuration is unreadable.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/triage/rules/formatting-only.ts › formatting proof` | tree equality ignoring layout per ecosystem; text rule outside them |
| add | `src/core/triage/rules/generated.ts › generated files` | declarations of §11 at the base commit |
| add | `src/core/triage/clearing.ts › static clearing stage` | the closed set of rules, guard, keep-open checks, unreadable-configuration stop |
| add | `src/core/triage/evidence-records.ts › evidence records` | one per cleared hunk with rule and proof |
| add | `test/unit/triage/clearing.test.ts` | closed rule set, keep-open, unreadable configuration |

## Preconditions
- C001-T-052, C001-T-049, C001-T-050 and C001-T-041 done.

## Step outline
1. Implement the formatting-only and generated-file rules.
2. Implement the clearing stage over the closed rule set (C001-REQ-412) with the guard and the
   switches; scores never clear a hunk.
3. Keep open hunks with deterministic findings (C001-REQ-217, C001-REQ-418).
4. Clear nothing and say why when the configuration is unreadable (C001-REQ-427).
5. Attach an evidence record to every cleared hunk.

## Verification
- `npm test -- test/unit/triage`
- `npm run acceptance -- --scenario C001-TS-427 --scenario C001-TS-428 --scenario C001-TS-429 --scenario C001-TS-430 --scenario C001-TS-431 --scenario C001-TS-432 --scenario C001-TS-433 --scenario C001-TS-434`
- `npm run acceptance -- --scenario C001-TS-443 --scenario C001-TS-444 --scenario C001-TS-459 --scenario C001-TS-460 --scenario C001-TS-461 --scenario C001-TS-480 --scenario C001-TS-481`
- `npm run acceptance -- --scenario C001-TS-239 --scenario C001-TS-249 --scenario C001-TS-457 --scenario C001-TS-458 --scenario C001-TS-486`

## Done when
- [ ] Every cleared hunk carries an evidence record.
- [ ] The listed scenarios pass once C001-T-055 publishes the triage document.
