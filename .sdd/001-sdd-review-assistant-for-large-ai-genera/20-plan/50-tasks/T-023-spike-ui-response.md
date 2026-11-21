---
id: C001-T-023
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Spike — hunk list and file context response time
milestone: C001-M-01
status: blocked
depends_on: [C001-T-012, C001-T-013]
implements: []
satisfies_ac: [C001-AC-909.1]
verified_by: [C001-TS-920, C001-TC-005]
components: [C001-COMP-019]
risk_refs: [C001-RISK-010]
estimate: M
report: { commit: null, completed_at: null, notes: "blocked: Harness built at c03fbf9 (CI green); measurement waits for the owner's go-ahead to keep the reference machine idle (npm run bench -- spike-ui)" }
---
# C001-T-023 — Spike: hunk list and file context response time

## Intent
C001-ADR-002 estimates the response-time margin of React with virtualised lists. Before the review
views are built, a prototype of the hunk list and the file context on a 10,000-line benchmark change
is timed with browser performance marks as C001-NFR-003 measures them (p95 ≤ 200 ms, maximum
≤ 1 s). Spike code is never shipped, so the task implements no requirement: C001-REQ-909 is
implemented by C001-T-056 and the NFR evidence comes from C001-T-094; `satisfies_ac` names the
criterion whose view the spike de-risks (`10-strategy.md` §2). Environment as C001-TC-005: E-REF,
latest major of Chrome, Edge and Firefox.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `spikes/ui/ › hunk list and file context prototype` | TanStack Virtual lists, memoised rows, text-only rendering, data from a benchmark change's intake document |
| add | `spikes/ui/RESULTS.md` | p95 and maximum per browser over a scripted session of open, scroll, mark and move actions |

## Preconditions
- C001-T-012 (web client shell) and C001-T-013 (benchmark set) done.

## Step outline
1. Build the prototype with the list sizes of the largest benchmark change.
2. Script a session of at least 200 actions and record performance marks from input to rendered view.
3. Run in the latest major version of Chrome, Edge and Firefox on the reference machine (E-REF of
   `60-test-plan.md` §3).

## Verification
- `npm run bench -- spike-ui`

## Done when
- [ ] `spikes/ui/RESULTS.md` reports p95 and maximum per browser.
- [ ] The result is stated as pass or miss against C001-NFR-003 for C001-T-024.
