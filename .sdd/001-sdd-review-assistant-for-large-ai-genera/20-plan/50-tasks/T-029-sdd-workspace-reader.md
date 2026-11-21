---
id: C001-T-029
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Intent source reader — `.sdd/` workspace, spec items and documented architecture
milestone: C001-M-02
status: in-progress
depends_on: [C001-T-008]
implements: [C001-REQ-111, C001-REQ-123, C001-REQ-207, C001-REQ-223]
satisfies_ac: [C001-AC-111.1, C001-AC-123.1, C001-AC-207.1, C001-AC-223.1]
verified_by: [C001-TS-124, C001-TS-125, C001-TS-126, C001-TS-152, C001-TS-153, C001-TS-216, C001-TS-257]
components: [C001-COMP-005]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-029 — Intent source reader: `.sdd/` workspace, spec items and documented architecture

## Intent
Read the `.sdd/` workspace of the snapshot into the intent context by the rules of C001-IF-007 §1 to
§4: SDD changes, spec items in the `.sdd/` format with the lines each is read from, in the snapshot
and at the base commit, and the documented architecture with component paths. Unreadable entries
are left out with a notice; an architecture without component paths is dropped with a notice.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intent-sources/sdd-workspace.ts › read workspace` | changes, phases, spec items (§2, §3), lines read on both sides |
| add | `src/core/intent-sources/architecture.ts › documented architecture` | components with paths and allowed dependencies (§4); drop without paths with its notice (C001-REQ-223) |
| add | `src/core/intent-sources/notices.ts › unreadable entries` | skip and report (C001-REQ-123) |
| add | `test/unit/intent-sources/` | well-formed, partial and broken workspaces |

## Preconditions
- C001-T-008 done (snapshot content available to the reader).

## Step outline
1. Parse the workspace layout and the spec item formats of C001-IF-007 §3.
2. Record for each spec item and documented component the lines it is read from, in the snapshot
   and at the base commit (input of C001-REQ-222 and C001-REQ-328).
3. Read the documented architecture; drop and report one without component paths.
4. Skip unreadable entries with a notice and continue.

## Verification
- `npm test -- test/unit/intent-sources`
- `npm run acceptance -- --scenario C001-TS-124 --scenario C001-TS-125 --scenario C001-TS-126 --scenario C001-TS-152 --scenario C001-TS-153`
- `npm run acceptance -- --scenario C001-TS-216 --scenario C001-TS-257` (with C001-T-039)

## Done when
- [ ] The listed CAP-01 scenarios pass; the CAP-02 scenarios pass once C001-T-039 is done.
- [ ] Lines read are recorded on both sides for every spec item and documented component.
