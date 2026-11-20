---
id: C001-T-027
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Commits of the change and hunk attribution
milestone: C001-M-02
status: todo
depends_on: [C001-T-008]
implements: [C001-REQ-109, C001-REQ-110]
satisfies_ac: [C001-AC-109.1, C001-AC-110.1]
verified_by: [C001-TS-118, C001-TS-119, C001-TS-120, C001-TS-121, C001-TS-122, C001-TS-123]
components: [C001-COMP-004, C001-COMP-003]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-027 — Commits of the change and hunk attribution

## Intent
Keep the commits between the base commit and HEAD in the intent context (C001-IF-007 §11) and
attribute each hunk to the commits that changed its lines, with uncommitted lines attributed to the
working tree, so that commit-based intents (C001-REQ-313) and staleness have their input.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intake/commits.ts › commits of the change` | hash, subject, message, author per commit, in order |
| add | `src/core/intake/attribution.ts › attribute hunks` | line-level attribution through the git port, deterministic for merges |
| add | `test/unit/intake/attribution.test.ts` | linear history, merges, uncommitted edits |

## Preconditions
- C001-T-008 done.

## Step outline
1. Read the commits of the range through the git port.
2. Attribute each hunk's changed lines to commits; record the set per hunk.
3. Write both into the intake document.

## Verification
- `npm test -- test/unit/intake/attribution.test.ts`
- `npm run acceptance -- --scenario C001-TS-118 --scenario C001-TS-119 --scenario C001-TS-120`
- `npm run acceptance -- --scenario C001-TS-121 --scenario C001-TS-122 --scenario C001-TS-123`

## Done when
- [ ] All listed scenarios pass.
