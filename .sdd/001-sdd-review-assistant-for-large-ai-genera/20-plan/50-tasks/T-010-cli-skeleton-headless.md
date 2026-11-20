---
id: C001-T-010
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: CLI skeleton, headless analysis output and exit codes
milestone: C001-M-01
status: todo
depends_on: [C001-T-009, C001-T-004]
implements: [C001-REQ-912, C001-REQ-914]
satisfies_ac: [C001-AC-912.1, C001-AC-914.1]
verified_by: [C001-TS-926, C001-TS-927, C001-TS-929, C001-TS-930, C001-TS-931]
components: [C001-COMP-001]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-010 — CLI skeleton, headless analysis output and exit codes

## Intent
Parse every command and option of C001-IF-001 (Synopsis, Commands), call the core API, and map
every outcome to the exit codes of C001-IF-001. `analyse --headless` runs intake and the analysis
available so far without the UI and writes the files of C001-IF-008 and C001-IF-009 (C001-REQ-912);
later tasks add their documents to the same output.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/cli/main.ts › command parser` | commands and options of C001-IF-001; unknown command or option is a usage error |
| add | `src/cli/commands/analyse.ts › analyse --headless` | writes the headless output files (C001-IF-001 Output) |
| add | `src/cli/exit-codes.ts › outcome to exit code` | from the catalogue of C001-T-003 |
| add | `test/unit/cli/` | parser and exit-code tests |

## Preconditions
- C001-T-009 done; C001-T-004 provides the headless-output reader.

## Step outline
1. Implement the parser for all commands; commands whose operations do not exist yet exit with the
   documented code for an internal error and say so.
2. Implement `analyse --headless` with its output location and formats.
3. Map every error and notice to its exit code; print notices to standard error.

## Verification
- `npm test -- test/unit/cli`
- `npm run acceptance -- --scenario C001-TS-926 --scenario C001-TS-927`
- `npm run acceptance -- --scenario C001-TS-929 --scenario C001-TS-930 --scenario C001-TS-931`

## Done when
- [ ] `sdd-review analyse --headless` on `fx-intake` writes a valid intake document.
- [ ] Every exit code of C001-IF-001 is reachable in a test.
