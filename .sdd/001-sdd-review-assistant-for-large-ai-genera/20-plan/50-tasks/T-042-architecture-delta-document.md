---
id: C001-T-042
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Publish the architecture-delta document first
milestone: C001-M-03
status: todo
depends_on: [C001-T-041]
implements: [C001-REQ-201, C001-REQ-211, C001-NFR-001, C001-NFR-015]
satisfies_ac: [C001-AC-201.1, C001-AC-211.1]
verified_by: [C001-TS-201, C001-TS-203, C001-TS-224, C001-TS-225]
components: [C001-COMP-008, C001-COMP-002]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-042 — Publish the architecture-delta document first

## Intent
Assemble the architecture-delta document of C001-IF-008 from C001-T-039 to C001-T-041, state when
drift was not checked, and have the orchestrator publish it as the first revision after intake,
before any model or test work (C001-CON-19), so that the review opens on it within C001-NFR-001.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/architecture/document.ts › architecture-delta document` | C001-IF-008 schema, deterministic order |
| modify | `src/core/orchestrator/pipeline.ts › static stage order` | architecture delta published before intent map, triage and jobs |
| modify | `src/cli/commands/analyse.ts › headless output` | writes the document |

## Preconditions
- C001-T-041 done.

## Step outline
1. Build the document and validate it against the schema in tests.
2. Publish it as a revision right after intake; later stages add revisions.
3. State "drift not checked" with its reason when no architecture is documented.
4. Run the reproducibility check on the benchmark set (5 analyses, equal documents).

## Verification
- `npm run acceptance -- --scenario C001-TS-201 --scenario C001-TS-203 --scenario C001-TS-224 --scenario C001-TS-225`
- `npm run bench -- reproducibility --document architecture-delta`

## Done when
- [ ] The document validates against C001-IF-008 for every fixture.
- [ ] Five analyses of each benchmark change give equal documents.
