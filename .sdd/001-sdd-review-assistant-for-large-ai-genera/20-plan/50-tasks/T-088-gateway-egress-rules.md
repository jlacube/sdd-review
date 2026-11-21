---
id: C001-T-088
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Gateway egress rules — locality, cloud opt-in, excluded paths and announcement
milestone: C001-M-06
status: in-progress
depends_on: [C001-T-086, C001-T-087]
implements: [C001-REQ-806, C001-REQ-808, C001-REQ-814, C001-REQ-815, C001-NFR-011, C001-NFR-012]
satisfies_ac: [C001-AC-806.1, C001-AC-808.1, C001-AC-814.1, C001-AC-815.1]
verified_by: [C001-TS-814, C001-TS-815, C001-TS-816, C001-TS-817, C001-TS-818, C001-TS-848, C001-TS-849, C001-TS-822, C001-TS-823, C001-TS-824, C001-TS-835, C001-TS-836, C001-TS-837, C001-TS-838, C001-TS-850, C001-TS-839, C001-TS-840, C001-TS-851]
components: [C001-COMP-015, C001-COMP-001]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-088 — Gateway egress rules: locality, cloud opt-in, excluded paths and announcement

## Intent
Apply the gateway checks before sending (C001-IF-010 §6): decide locality from the endpoint text
(socket, 127.0.0.0/8, ::1 or `localhost`, connected through loopback addresses without name
resolution), withhold content from a non-local provider without the cloud opt-in, filter
model-excluded paths before any request and analyse them model-free, and announce cloud use in the
CLI before the first request.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/model/locality.ts › endpoint locality` | text rule; `localhost` connected to loopback addresses only |
| add | `src/core/model/egress.ts › opt-in and excluded paths` | checks before every request; excluded content never in a request |
| add | `src/core/model/announce.ts › cloud-use state` | announcement event for CLI and UI |
| modify | `src/cli/commands/review.ts`, `analyse.ts › cloud announcement` | printed before the first request |

## Preconditions
- C001-T-086 and C001-T-087 done.

## Step outline
1. Implement the locality rule from the endpoint text only.
2. Implement the opt-in check and the excluded-path filter; excluded files go the model-free path.
3. Implement the announcement in the CLI and the cloud-use state for the UI (C001-T-091).
4. Test with the recording cloud stub and marker strings in excluded files.

## Verification
- `npm test -- test/unit/model`
- `npm run acceptance -- --scenario C001-TS-814 --scenario C001-TS-815 --scenario C001-TS-816 --scenario C001-TS-817 --scenario C001-TS-818 --scenario C001-TS-848 --scenario C001-TS-849`
- `npm run acceptance -- --scenario C001-TS-822 --scenario C001-TS-823 --scenario C001-TS-824`
- `npm run acceptance -- --scenario C001-TS-835 --scenario C001-TS-836 --scenario C001-TS-837 --scenario C001-TS-838 --scenario C001-TS-850 --scenario C001-TS-839 --scenario C001-TS-840 --scenario C001-TS-851`

## Done when
- [ ] No recorded request holds a marker string of an excluded path.
- [ ] `localhost` is never resolved through DNS.
- [ ] The listed scenarios pass.
