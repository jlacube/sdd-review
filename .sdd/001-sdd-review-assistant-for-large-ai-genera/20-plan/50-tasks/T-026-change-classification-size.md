---
id: C001-T-026
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Empty change, binary files and the supported-size warning
milestone: C001-M-02
status: done
depends_on: [C001-T-008, C001-T-012]
implements: [C001-REQ-107, C001-REQ-108, C001-REQ-121, C001-REQ-122]
satisfies_ac: [C001-AC-107.1, C001-AC-108.1, C001-AC-121.1, C001-AC-122.1]
verified_by: [C001-TS-115, C001-TS-116, C001-TS-117, C001-TS-147, C001-TS-148, C001-TS-149]
components: [C001-COMP-004, C001-COMP-001, C001-COMP-019]
risk_refs: []
estimate: M
report: { commit: acfc25a, completed_at: 2026-11-21, notes: "Empty change, binary files with stored content, size warning; TS-115/116/117 pass, TS-147..149 await T-039/T-043/T-045; combined tree verified (1,496 tests, 93 CI scenarios); CI green on 4 runners at e3d4fa0; shared wiring in fc1a355; PR at M-02 merge" }
---
# C001-T-026 — Empty change, binary files and the supported-size warning

## Intent
Stop intake on an empty change; list binary files with their change type and 0 changed lines;
measure the change against the supported size of C001-DEC-007 and warn with the measured counts
when it is exceeded, while the review continues above the size.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intake/classify.ts › empty change, binary detection` | binary rule of the intake; empty change stops with its code |
| add | `src/core/intake/size.ts › size measure and warning` | changed lines and files against the supported size; notice with counts |
| modify | `src/cli/commands/review.ts › size warning` | printed with the intake summary |
| modify | `web/src/views/ChangeList.tsx › size warning` | shown in the UI |

## Preconditions
- C001-T-008 and C001-T-012 done.

## Step outline
1. Implement the empty-change stop.
2. Implement binary detection and listing.
3. Implement the size measure and the notice; the review continues.
4. Show the warning in CLI and UI.

## Verification
- `npm test -- test/unit/intake`
- `npm run acceptance -- --scenario C001-TS-115 --scenario C001-TS-116 --scenario C001-TS-117`
- `npm run acceptance -- --scenario C001-TS-147 --scenario C001-TS-148 --scenario C001-TS-149`

## Done when
- [ ] All listed scenarios pass.
