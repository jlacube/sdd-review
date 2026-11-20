---
id: C001-T-062
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Mutation testing with StrykerJS and Stryker.NET in the mutation copy
milestone: C001-M-04
status: todo
depends_on: [C001-T-057, C001-T-059, C001-T-016]
implements: [C001-REQ-514, C001-REQ-515, C001-REQ-516]
satisfies_ac: [C001-AC-514.1, C001-AC-515.1, C001-AC-516.1]
verified_by: [C001-TS-539, C001-TS-540, C001-TS-541, C001-TS-542, C001-TS-543, C001-TS-544, C001-TS-545, C001-TS-546]
components: [C001-COMP-011]
risk_refs: [C001-RISK-002]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-062 — Mutation testing with StrykerJS and Stryker.NET in the mutation copy

## Intent
Run StrykerJS and Stryker.NET in the mutation copy on the executed changed lines, in two risk tiers
with results recorded hunk by hunk in strict descending risk (C001-ADR-007 §1, §3), convert their
reports to MutationResult, record surviving mutants with their hunk, and mark mutation evidence
unavailable with its reason (ERR-EVID-006) when a tool is missing, has no runner for the framework,
or fails.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/evidence/mutation/stryker-js.ts › StrykerJS run` | configuration in `<workspace>.aux/`, runner plugin per framework, `mutate` line ranges, `inPlace`, streaming reporter |
| add | `runtime/node/stryker-reporter.cjs › streaming reporter` | one result per mutant |
| add | `src/core/evidence/mutation/stryker-net.ts › Stryker.NET run` | per solution or test project, line spans, JSON report |
| add | `src/core/evidence/mutation/convert.ts › report conversion and ordering` | status mapping of C001-ADR-007 §1, hunk-by-hunk recording in risk order |
| add | `src/core/evidence/mutation/unavailable.ts › unavailable reasons` | the reasons of C001-ADR-007 §1 |

## Preconditions
- C001-T-057, C001-T-059 and C001-T-016 done; minimum tool versions fixed by C001-T-002.

## Step outline
1. Discover the tools (copy's `node_modules/`, global, `.config/dotnet-tools.json`, global tool).
2. Generate tier configurations from executed changed lines in risk order.
3. Run in the copy with the worker count and priority of C001-ADR-006 §8.
4. Convert and record results in strict risk order; record unavailable reasons.

## Verification
- `npm test -- test/unit/evidence/mutation`
- `npm run acceptance -- --scenario C001-TS-539 --scenario C001-TS-540 --scenario C001-TS-541 --scenario C001-TS-542`
- `npm run acceptance -- --scenario C001-TS-543 --scenario C001-TS-544 --scenario C001-TS-545 --scenario C001-TS-546`

## Done when
- [ ] Results are recorded in strict descending risk order (C001-TS-539).
- [ ] The listed scenarios pass for TypeScript/JavaScript and C#/.NET fixtures.
