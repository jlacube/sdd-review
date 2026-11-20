---
id: C001-T-003
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Generated interface types, error catalogue and contextual log
milestone: C001-M-01
status: done
depends_on: [C001-T-001, C001-T-002]
implements: [C001-REQ-914]
satisfies_ac: [C001-AC-914.1]
verified_by: [C001-TS-929, C001-TS-930]
components: [C001-COMP-001, C001-COMP-002, C001-COMP-018]
risk_refs: []
estimate: M
report: { commit: f2e5fce, completed_at: 2026-11-20, notes: "66-code catalogue test vs errors.md, log tests (9 unit tests), types generated in build; vite pinned 7.3.8 to avoid MPL-2.0; acceptance TS-929/930 run once T-010 exists; PR at M-01 merge" }
---
# C001-T-003 — Generated interface types, error catalogue and contextual log

## Intent
Generate the TypeScript types of the JSON documents and the HTTP API from `10-spec/50-interfaces/`
at build time (C001-ADR-001 item 3), and provide the one error type that carries a code of
`50-interfaces/errors.md` with its CLI exit code and HTTP status, plus the per-repository log file
that records operation, identifying inputs and cause for every error and notice (NFR-D-04).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `scripts/generate-types.mjs` | generates `src/generated/` from the schemas of C001-IF-004, C001-IF-006, C001-IF-008, C001-IF-009, C001-IF-011 and from `openapi.yaml` (C001-IF-002) |
| add | `src/core/errors/catalogue.ts › error codes` | every code of `errors.md` with kind (error or notice), exit code (C001-IF-001 Exit codes) and HTTP status |
| add | `src/core/errors/review-error.ts › ReviewError` | the error type that core operations reject with |
| add | `src/core/log/log.ts › contextual log` | appends one entry per error and notice to the repository's log file in the store (architecture §6 Observability) |
| add | `test/unit/errors/catalogue.test.ts` | the catalogue equals `errors.md` |

## Preconditions
- C001-T-001 done; C001-T-002 confirmed the licence and version of the type generator.

## Step outline
1. Add the generator and run it in `npm run build`; generated files are not edited by hand.
2. Transcribe the catalogue from `errors.md`; a unit test parses `errors.md` and fails on any
   difference in code, kind, exit code or HTTP status.
3. Implement the error type and the log; no provider key or secret value is ever logged
   (C001-CON-21).
4. Map every code to its exit code for the CLI and its status for the problem details of the API.

## Verification
- `npm run build`
- `npm test -- test/unit/errors`
- `npm run acceptance -- --scenario C001-TS-929 --scenario C001-TS-930` (runs once C001-T-010 exists)

## Done when
- [ ] Types are regenerated on every build and compile.
- [ ] The catalogue test passes against `errors.md`.
- [ ] Each log entry holds operation, identifying inputs and cause.
