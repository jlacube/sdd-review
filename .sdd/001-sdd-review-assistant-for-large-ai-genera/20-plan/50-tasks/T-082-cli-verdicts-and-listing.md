---
id: C001-T-082
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: CLI verdict commands, intent listing and status
milestone: C001-M-05
status: todo
depends_on: [C001-T-078, C001-T-010]
implements: [C001-REQ-915, C001-REQ-916, C001-REQ-317, C001-REQ-711]
satisfies_ac: [C001-AC-915.1, C001-AC-916.1, C001-AC-317.1, C001-AC-711.1]
verified_by: [C001-TS-932, C001-TS-933, C001-TS-934, C001-TS-935, C001-TS-936, C001-TS-336, C001-TS-730]
components: [C001-COMP-001]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-082 — CLI verdict commands, intent listing and status

## Intent
Record sign, reject and defer from the CLI with the same checks as the UI (C001-IF-001 `sign`,
`reject`, `defer`), list the intents of a review with their source, verdict and staleness, and print
the decision status, each with its exit code.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/cli/commands/verdicts.ts › sign, reject, defer` | open-hunk confirmation prompt or option, identity refusal |
| add | `src/cli/commands/intents.ts › intents` | list with source, verdict, staleness causes |
| add | `src/cli/commands/status.ts › status` | decision status |

## Preconditions
- C001-T-078 and C001-T-010 done.

## Step outline
1. Implement the verdict commands on the core operations.
2. Implement the intent listing and the status command.
3. Map outcomes to exit codes.

## Verification
- `npm test -- test/unit/cli`
- `npm run acceptance -- --scenario C001-TS-932 --scenario C001-TS-933 --scenario C001-TS-934 --scenario C001-TS-935 --scenario C001-TS-936 --scenario C001-TS-336 --scenario C001-TS-730`

## Done when
- [ ] The listed scenarios pass.
