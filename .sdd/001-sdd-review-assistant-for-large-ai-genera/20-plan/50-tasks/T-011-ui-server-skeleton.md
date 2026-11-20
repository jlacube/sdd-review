---
id: C001-T-011
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Local review UI server with host, token, origin and CSP checks
milestone: C001-M-01
status: todo
depends_on: [C001-T-009]
implements: [C001-REQ-905, C001-REQ-906, C001-REQ-907, C001-REQ-908, C001-NFR-009, C001-NFR-010]
satisfies_ac: [C001-AC-905.1, C001-AC-906.1, C001-AC-907.1, C001-AC-908.1]
verified_by: [C001-TS-907, C001-TS-910, C001-TS-911, C001-TS-913, C001-TS-914, C001-TS-917]
components: [C001-COMP-018]
risk_refs: []
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-011 — Local review UI server with host, token, origin and CSP checks

## Intent
Serve one review on 127.0.0.1 with Node's built-in HTTP module and a small router (C001-ADR-002
item 4). Every request passes the Host check, then for `/api/v1` the constant-time token check and
the Origin and Sec-Fetch-Site checks, before any review state is read; responses carry the CSP of
C001-IF-002 and no CORS header. Each API operation maps to the core operation of the same name.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/ui-server/server.ts › listen on loopback` | 127.0.0.1 only, port choice, per-start token |
| add | `src/ui-server/guards.ts › host, token, origin checks` | ERR-UI-001, ERR-UI-002 in the order of C001-ADR-002 item 4 |
| add | `src/ui-server/router.ts › API routes` | routes of `openapi.yaml`, body validation against its schemas, problem details (RFC 9457) |
| add | `src/ui-server/static.ts › static assets` | fixed content types, CSP header, no inline script or style |
| add | `test/unit/ui-server/guards.test.ts` | each check rejects before state is read |

## Preconditions
- C001-T-009 done.

## Step outline
1. Implement listening and token creation; the token is delivered in the URL fragment.
2. Implement the guards in order and prove with a spy that no core read happens before they pass.
3. Implement the router for the operations that exist; others answer with the problem details of
   "not implemented".
4. Serve static files with the CSP of C001-IF-002.

## Verification
- `npm test -- test/unit/ui-server`
- `npm run acceptance -- --scenario C001-TS-907 --scenario C001-TS-910 --scenario C001-TS-911`
- `npm run acceptance -- --scenario C001-TS-913 --scenario C001-TS-914 --scenario C001-TS-917`

## Done when
- [ ] The server binds no non-loopback address on any CI operating system.
- [ ] Requests with a foreign Host, a missing or wrong token, or a foreign Origin are refused without a state read.
- [ ] Every response carries the CSP of C001-IF-002.
