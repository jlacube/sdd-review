---
id: C001-T-079
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Record integrity, reading the record without the UI, repository unchanged on decisions
milestone: C001-M-05
status: todo
depends_on: [C001-T-007, C001-T-076]
implements: [C001-REQ-713, C001-REQ-714, C001-REQ-707]
satisfies_ac: [C001-AC-713.1, C001-AC-714.1, C001-AC-707.1]
verified_by: [C001-TS-735, C001-TS-736, C001-TS-737, C001-TS-722, C001-TS-723]
components: [C001-COMP-014, C001-COMP-013, C001-COMP-003]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-079 — Record integrity, reading the record without the UI, repository unchanged on decisions

## Intent
Verify the record chain on every open and refuse an altered record (ERR-STORE-002), keep entries
unaltered, let a program read the record by its documented format without the UI (C001-IF-009), and
show that recording any decision changes nothing in the repository.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/store/verify.ts › verify record chain` | header, sequence, chain; ERR-STORE-002 |
| add | `test/acceptance/support/record-reader.ts › independent reader` | reads the record with the JSON Schema only, outside the package |
| add | `test/unit/store/verify.test.ts` | altered, reordered, truncated records |

## Preconditions
- C001-T-007 and C001-T-076 done.

## Step outline
1. Implement chain verification on open.
2. Write an independent reader that uses only `review-record.schema.json`.
3. Extend the repository manifest check to every recorded action.

## Verification
- `npm test -- test/unit/store`
- `npm run acceptance -- --scenario C001-TS-735 --scenario C001-TS-736 --scenario C001-TS-737 --scenario C001-TS-722 --scenario C001-TS-723`

## Done when
- [ ] An altered record is refused on open.
- [ ] The independent reader reads every fixture record.
- [ ] The listed scenarios pass.
