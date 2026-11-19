---
id: "C001-ADR-002"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: accepted
date: 2026-11-18
deciders: ["P-01"]
---
# C001-ADR-002 — UI stack: React single-page client on a built-in Node.js HTTP server

## Context and problem
The local review UI consists of the UI server (C001-COMP-018) and the web client
(C001-COMP-019), joined by the HTTP API of C001-IF-002. C001-CON-18 requires the client to ship as
static assets that the server serves. The stack must keep the response time of C001-NFR-003 (p95
≤ 200 ms over 500 actions on a 10,000-line change), work in the browsers of C001-NFR-017, and hold
the protections of C001-CON-10: loopback binding, Host, token, Origin and Sec-Fetch-Site checks, no
CORS, and a self-only Content-Security-Policy without inline script, inline style or `eval`
(C001-REQ-905 to C001-REQ-908, C001-NFR-009, C001-NFR-010). All repository content is rendered as
text (C001-CON-20). Without a decision, each UI task would pick its own libraries, and the CSP and
text-rendering rules would be checked case by case.

## Considered options
Analysis: C001-OA-004 (five candidates, weighted criteria, sensitivity).

- **React SPA, built-in HTTP server** (4.45) — React 19 with virtualised lists, built by Vite;
  server on `node:http`. Recommended.
- **SolidJS SPA, Hono server** (4.30) — fine-grained updates; smaller ecosystem.
- **Svelte SPA, built-in HTTP server** (4.25) — compiled components; run-time style insertion of
  its transitions must be banned under the CSP.

Rejected: web components without a framework (3.75), server-rendered HTML with htmx (2.75); reasons
in C001-OA-004.

## Decision outcome
**Accepted by P-01 on 2026-11-18.** Question Q-uistack-01 (`20-plan/questions-log.md`, round 1),
answer: "React + Node HTTP (Recommended)".

Chosen: **React single-page client on a built-in Node.js HTTP server**. React renders text by
default and needs no exception to the
self-only policy, and it is the stack implementers and browser test tools know best; virtualised
lists give it enough margin under C001-NFR-003. Its lead over SolidJS (0.15) rests on the effort
weight; the tie-breaker is delivery risk across the more than 30 requirements of C001-COMP-019.

What the decision fixes:

1. **Web client (C001-COMP-019):** React 19 and React DOM; TanStack Virtual for every list that can
   exceed one screen (hunks, intents, file context); built by Vite into hashed static files with no
   inline script or style; styles in static CSS files, no CSS-in-JS library that inserts `<style>`
   elements at run time.
2. **Text rendering (C001-CON-20):** repository content, named files, transcripts and model output
   are rendered only as React text nodes; `dangerouslySetInnerHTML`, `innerHTML` and HTML-producing
   highlighters are forbidden and caught by a lint rule. Any syntax colouring is built from token
   ranges as text spans.
3. **Contract:** client types are generated from `50-interfaces/openapi.yaml` at build time; the
   client learns of new revisions by calling `getSession` at a fixed interval (C001-IF-003 §2),
   because C001-IF-002 has no push channel; the interval is a default set by the UI task.
4. **UI server (C001-COMP-018):** Node.js's built-in `node:http` module with a small hand-written
   router, listening on 127.0.0.1 only. Each request passes, in this order, the Host check
   (ERR-UI-001), then for `/api` the token check in constant time and the Origin and Sec-Fetch-Site
   checks (ERR-UI-002), before any review state is read; responses carry the CSP header of
   C001-IF-002 and no CORS header; static files are served from the package with fixed content
   types; request bodies are validated against the schemas of `openapi.yaml` with the JSON Schema
   validator that the core uses (chosen outside this ADR); errors are problem details (RFC 9457)
   with the code of `50-interfaces/errors.md`.

## Consequences
- Good: one language and generated types from server to client (C001-ADR-001); the security front
  check sits in one small module without a framework, which a reviewer can audit line by line.
- Good: the CSP of C001-IF-002 holds without exceptions; a test loads every view under that policy
  and fails on any violation report, as part of the C001-NFR-010 suite.
- Bad: React re-renders more than fine-grained frameworks; list rows must be memoised and lists
  virtualised from the start.
- Bad: polling `getSession` adds one small request per interval while a review is open.
- Risk: response-time margin is estimated, not measured. Follow-up task early in the UI milestone:
  a prototype of the hunk list and file context on a benchmark change, timed with browser
  performance marks as C001-NFR-003 measures them; if p95 exceeds 200 ms after virtualisation, the
  choice returns to P-01 with SolidJS and Svelte as the presented alternatives.
- Follow-up: lint rules for the forbidden HTML constructs and for imports of CSS-in-JS libraries,
  and the CSP violation test, in the definition of done of every UI task.
- C001-ADR-001 is accepted for TypeScript on Node.js (Q-language-01), so the server part runs on
  `node:http` as fixed above.
- Not verified online in this session: the versions and licences of React, React DOM, TanStack
  Virtual and Vite (MIT as far as known) and of the type generator come from the architect's
  knowledge as of 2026-06 (C001-OA-004, Sources). The licence check of C001-CON-07 (NFR-D-03) must
  confirm each licence when the dependency is added; the UI task pins the versions.
- Affected constraints: C001-CON-09, C001-CON-10, C001-CON-18, C001-CON-20. Affected components:
  C001-COMP-018, C001-COMP-019.
