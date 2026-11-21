---
id: C001-T-030
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Neutral intent-and-architecture file and named files
milestone: C001-M-02
status: done
depends_on: [C001-T-029]
implements: [C001-REQ-112, C001-REQ-113, C001-REQ-124]
satisfies_ac: [C001-AC-112.1, C001-AC-113.1, C001-AC-124.1]
verified_by: [C001-TS-128, C001-TS-129, C001-TS-155]
components: [C001-COMP-005, C001-COMP-001]
risk_refs: []
estimate: M
report: { commit: f419c8a, completed_at: 2026-11-21, notes: "Neutral file + named files; TS-125/127/128/129/154/155 pass; D-027 (TS-256 nopaths row); combined tree verified (1,373 tests, 80 CI scenarios); CI green on 4 runners at a17e785; shared wiring in 9467acb; PR at M-02 merge" }
---
# C001-T-030 — Neutral intent-and-architecture file and named files

## Intent
Read `.sdd-review/workspace.json` from the snapshot against C001-IF-006 and stop intake on an
invalid file (C001-IF-007 §5); read the pull-request text, plan and transcript files that the
developer names (§7) and stop intake on a named file that cannot be used.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/intent-sources/neutral-file.ts › read neutral file` | schema validation against C001-IF-006, `formatVersion` check, stop with its code |
| add | `src/core/intent-sources/named-files.ts › read named files` | pull-request text, plans, transcripts; stop on an unreadable file with its code |
| modify | `src/cli/main.ts › named-file options` | options of C001-IF-001 that name the files |

## Preconditions
- C001-T-029 done.

## Step outline
1. Validate the neutral file and merge its intents and architecture into the intent context.
2. Read named files as data (C001-CON-20) with the encoding rules of C001-IF-007 §7.
3. Wire the CLI options.

## Verification
- `npm test -- test/unit/intent-sources`
- `npm run acceptance -- --scenario C001-TS-128 --scenario C001-TS-129 --scenario C001-TS-155`

## Done when
- [ ] All listed scenarios pass.
- [ ] An invalid neutral file and an unreadable named file stop intake and change nothing.
