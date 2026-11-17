---
id: "C001-SPEC-CTX-04"
artifact: spec/context/current-state
change: "CHG-001"
phase: 10-spec
status: draft
---
# Current state

## Repository baseline (2026-11-17)
- CHG-001 is greenfield (`change.md`). No review assistant exists: the repository holds only the
  SDD workspace (`.sdd/`) and no application code (constitution, header note). There is no living
  spec (`.sdd/_living/` is empty), so no requirement of this change carries a Delta.
- No cartographer evidence applies; the baseline below is today's review practice outside this
  repository, as surveyed in the research notes.

## Today's review practice (by reference)
| Practice | Where it is described |
|---|---|
| Review surfaces inside agent tools work per edit, per turn, per file or per commit; none groups by intent | C001-R-001 §C; C001-R-003 §A–§D |
| Grouped, explained review of one large diff exists only as hosted pull-request services | C001-R-001 §A, §D (Change Stack, Devin Review, cubic) |
| Local pre-commit review gives findings lists (`/review`-style commands) or a plain diff UI | C001-R-001 §C, §D; C001-R-003 §C (Quick Review) |
| Large changes are mostly skipped, capped or split rather than restructured | C001-R-001 §D |
| No tool found maps hunks to requirement IDs or acceptance scenarios, or lists code no spec item covers | C001-R-001 Gap 2; C001-R-002 §A; C001-R-003 Implications 2 |
| Review state is kept per file or per hunk ("viewed"), never as a verdict per intent | C001-R-001 Gap 3; C001-R-003 Implications 3 |
| Agent checkpoints miss shell-made and subagent edits in some tools | C001-R-001 §D; C001-R-003 Implications 6 |
| Under auto-approve or bypass modes the developer first sees the change after it has landed | C001-R-003 §D |
| Review effectiveness and inspection rate fall as changes grow | C001-R-002 §B |

## Implications for the spec
- Intake compares the working tree and agent commits with a base commit, not agent checkpoints
  (C001-R-001 §D, C001-R-003 Implications 6) → C001-CAP-01.
- No capability relies on an approval given inside the agent tool before the change landed
  (C001-R-003 Implications, risk bullet) → C001-CAP-01, C001-CAP-04.
- The gaps of C001-R-001 §Gaps 1 to 6 and 8 are the space the capabilities fill (Gap 6 through
  the intent fallback of C001-CAP-03); Gap 7 is a later change (`scope.md` §2).
- Permissive-licence tools named in C001-R-001 §Implications and C001-R-003 §Implications may be
  references or dependencies; proprietary services and copyleft components may not (constitution,
  forbidden technologies).
