---
id: C001-T-094
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Review UI response benchmark over a 500-action session
milestone: C001-M-07
status: todo
depends_on: [C001-T-084, C001-T-023, C001-T-105]
implements: [C001-NFR-003]
satisfies_ac: [C001-AC-904.1]
verified_by: [C001-TS-904]
components: [C001-COMP-019]
risk_refs: [C001-RISK-010]
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-094 — Review UI response benchmark over a 500-action session

## Intent
Produce the benchmark report of C001-DOD-012: replay a scripted session of 500 actions (open
component, intent and hunk; mark, move, decide) on each 10,000-line benchmark change in each
supported browser, measured with browser performance marks from input to rendered view.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `bench/ui/session-500.ts › scripted session` | action mix of C001-NFR-003 Statement |
| add | `bench/results/ui-<version>.md` | p95 and maximum per browser and change |

## Preconditions
- C001-T-084 and C001-T-023 done; the release candidate of C001-T-105 is the subject and its
  version is named in the report.

## Step outline
1. Script the session with every action kind.
2. Replay it in Chrome, Edge and Firefox (two latest major versions) on the reference machine.
3. Report p95 and maximum; a miss is reported to P-01 as a defect.

## Verification
- `npm run bench -- nfr-003`

## Done when
- [ ] p95 ≤ 200 ms and maximum ≤ 1 s in each browser, or a defect is recorded.
