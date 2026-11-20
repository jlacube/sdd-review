---
id: C001-T-095
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Network egress tests — model-free, local provider and cloud provider
milestone: C001-M-07
status: todo
depends_on: [C001-T-091, C001-T-084, C001-T-105]
implements: [C001-NFR-011, C001-NFR-012]
satisfies_ac: [C001-AC-803.1, C001-AC-806.1, C001-AC-814.1, C001-AC-908.1]
verified_by: [C001-TS-806, C001-TS-807, C001-TS-814, C001-TS-835, C001-TS-917]
components: [C001-COMP-015, C001-COMP-019]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-095 — Network egress tests: model-free, local provider and cloud provider

## Intent
Produce the evidence of C001-DOD-022 and C001-DOD-023: a per-process network capture of a full
review flow, intake to verdict, on each benchmark change with no provider and with a local provider
(0 non-loopback connections from the review assistant's processes and the review UI page), and a
full flow against the recording cloud stub on an isolated network (0 other destinations, 0 requests
holding a marker string of a model-excluded path).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `test/security/egress/ › capture harness` | per-process capture per OS; project command processes excluded |
| add | `test/security/egress/cloud-stub/ › recording cloud stub` | marker search over recorded requests |

## Preconditions
- C001-T-091 and C001-T-084 done (complete flow to verdict, with and without a provider); the
  release candidate of C001-T-105 is the subject.
- Environment as C001-TC-011 and C001-TC-012: the reference machine (E-REF), with E-NET for the
  cloud stub; the report is `bench/results/egress-<version>.md` with the capture files and recorded
  requests.

## Step outline
1. Build the capture harness and script the full flow per benchmark change.
2. Run with no provider and with a local provider.
3. Run against the cloud stub with markers placed in excluded files.

## Verification
- `npm run test:security -- egress`
- `npm run acceptance -- --scenario C001-TS-806 --scenario C001-TS-807 --scenario C001-TS-814 --scenario C001-TS-835`
- `npm run acceptance:browser -- --scenario C001-TS-917`

## Done when
- [ ] Every count of C001-DOD-022 and C001-DOD-023 is 0 in `bench/results/egress-<version>.md`.
