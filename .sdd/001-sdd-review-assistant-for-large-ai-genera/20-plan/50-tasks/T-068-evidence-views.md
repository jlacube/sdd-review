---
id: C001-T-068
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Evidence in the review UI — strength, bundles, judgements and comparisons
milestone: C001-M-04
status: todo
depends_on: [C001-T-065, C001-T-066, C001-T-056, C001-T-061]
implements: [C001-REQ-519, C001-REQ-513, C001-REQ-318, C001-REQ-511]
satisfies_ac: [C001-AC-519.1, C001-AC-513.1, C001-AC-318.1, C001-AC-511.1]
verified_by: [C001-TS-552, C001-TS-553, C001-TS-537, C001-TS-337, C001-TS-529]
components: [C001-COMP-019, C001-COMP-018]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-068 — Evidence in the review UI: strength, bundles, judgements and comparisons

## Intent
Show every evidence item with its strength in the hunk and intent views; show test runs, surviving
mutants and counter-examples; let the developer judge an intent's tests, confirm and run bundle
commands (with a confirmation prompt for proposed commands) and see what changed since the
reference run.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `web/src/components/EvidenceItem.tsx › evidence with strength` | every item kind of C001-IF-008 |
| add | `web/src/views/EvidenceBundle.tsx › bundle view` | commands, confirmation prompt, run, outputs, comparison |
| add | `web/src/components/TestJudgement.tsx › judge tests` | refusal shown when the intent has no test hunks |
| modify | `web/src/views/HunkDetail.tsx › evidence section` | fills the placeholder of C001-T-056 |
| modify | `src/ui-server/router.ts › evidence routes` | views and actions of `openapi.yaml` |

## Preconditions
- C001-T-065, C001-T-066, C001-T-056 and C001-T-061 done.

## Step outline
1. Render evidence items with strength as text.
2. Build the bundle view with explicit confirmation before a proposed command runs.
3. Add the test-judgement control.
4. Show bundle comparisons.

## Verification
- `npm run lint`
- `npm run acceptance:browser -- --scenario C001-TS-552 --scenario C001-TS-553 --scenario C001-TS-537 --scenario C001-TS-337 --scenario C001-TS-529`

## Done when
- [ ] The listed scenarios pass in Chrome, Edge and Firefox with no CSP violation.
