---
id: C001-T-032
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Plan items, transcript passages, recorded runs and mentions
milestone: C001-M-02
status: done
depends_on: [C001-T-030]
implements: [C001-REQ-314, C001-REQ-510]
satisfies_ac: [C001-AC-314.1, C001-AC-510.1]
verified_by: [C001-TS-331, C001-TS-526]
components: [C001-COMP-005]
risk_refs: []
estimate: M
report: { commit: d8a1a28, completed_at: 2026-11-21, notes: "Plan items, transcript passages, recorded runs, ID/file mentions; 287 unit tests; TS-331 awaits T-044, TS-526 T-065; combined tree verified (1,651 tests, 117 CI scenarios); CI green on 4 runners incl. first real POSIX acceptance at 2f889af; shared wiring in f04891a; PR at M-02 merge" }
---
# C001-T-032 — Plan items, transcript passages, recorded runs and mentions

## Intent
Apply the plan-item rule of C001-IF-007 §8 to named plans, find transcript passages and recorded
runs (§9) that evidence bundles start from, and find the ID and file mentions (§10) behind the link
signals of C001-CAP-03.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intent-sources/plan-items.ts › plan-item rule` | Markdown and plain-text plans |
| add | `src/core/intent-sources/transcripts.ts › passages, recorded runs` | commands with their recorded outputs |
| add | `src/core/intent-sources/mentions.ts › ID and file mentions` | per source text, with positions |
| add | `test/unit/intent-sources/plan-items.test.ts`, `mentions.test.ts` | rule cases of §8 and §10 |

## Preconditions
- C001-T-030 done (named files read).

## Step outline
1. Implement the plan-item rule and emit plan items with their source lines.
2. Implement transcript parsing for recorded runs.
3. Implement mention detection for IDs and repository paths.

## Verification
- `npm test -- test/unit/intent-sources`
- `npm run acceptance -- --scenario C001-TS-331` (with C001-T-044)
- `npm run acceptance -- --scenario C001-TS-526` (with C001-T-065)

## Done when
- [ ] Plan items, recorded runs and mentions are in the intent context with their source lines.
- [ ] The listed scenarios pass once their consumers exist.
