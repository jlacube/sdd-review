---
id: "C001-OA-004"
artifact: plan/option-analysis
change: "CHG-001"
phase: 20-plan
status: draft
---
# OA-004 — UI stack of the local review UI

## Problem
Decide the stack of the local review UI: the web client (C001-COMP-019) and the UI server
(C001-COMP-018) that serves it and the HTTP API of C001-IF-002 (`50-interfaces/openapi.yaml`).
C001-CON-18 requires the UI to ship as static assets served by the UI server. The binding forces:

- **Response time:** p95 ≤ 200 ms and maximum ≤ 1 s from input to updated view over a scripted
  session of 500 actions on a 10,000-line change (C001-NFR-003), with views that list up to about
  300 files, their hunks and whole-file context (C001-REQ-909).
- **Security:** the server listens on 127.0.0.1 only, checks the Host header, the per-start token,
  the Origin and Sec-Fetch-Site headers, sends no CORS header, and serves every page with the
  self-only Content-Security-Policy of C001-IF-002 (C001-CON-10, C001-REQ-905 to C001-REQ-907,
  C001-NFR-009, C001-NFR-010). That policy has no `unsafe-inline` and no `unsafe-eval`, so the
  client may use no inline script, no `<style>` element or style attribute in markup, and no
  `eval`. Every resource comes from the server (C001-REQ-908), and all repository content and model
  output is rendered as text (C001-CON-20).
- **Browsers:** the two latest major versions of Chrome, Edge and Firefox (C001-NFR-017).
- **Contract:** the client consumes the JSON API of C001-IF-002; the server maps each operation to
  the core operation of the same name (C001-IF-003).

The decision assumes the runtime of C001-ADR-001 (TypeScript on Node.js); the effect of the Rust
alternative is stated under Sensitivity. Out of scope: the desktop-wrapper form factor (settled by
C001-DEC-002: the UI runs in the developer's browser) and the visual design.

## Criteria
| Criterion | Weight (%) |
|---|---|
| Response-time headroom | 25 |
| Fit with the self-only CSP and text rendering | 25 |
| Low build and maintenance effort | 20 |
| Small permissive dependency set | 15 |
| Fit with the JSON HTTP contract | 15 |

- **Response-time headroom:** margin under C001-NFR-003 for long, changing lists (hunks, intents,
  file context) on the reference machine.
- **Fit with the self-only CSP and text rendering:** the stack works under the policy of
  C001-IF-002 without exceptions and renders text by default, so that an injection needs an
  explicit, lintable construct (C001-CON-10, C001-CON-20).
- **Low build and maintenance effort:** constitution principle 1; familiarity of implementers and
  coding agents; maturity of virtualised lists and browser test tooling for C001-NFR-017.
- **Small permissive dependency set:** few runtime packages in the server and in the built client,
  all permissive (NFR-D-02, NFR-D-03), and a security front check that a reviewer can audit.
- **Fit with the JSON HTTP contract:** the client consumes C001-IF-002 as specified, with types
  derived from `openapi.yaml`, and the server maps operations to C001-IF-003 directly.

## Candidates
- **1 — React SPA, built-in HTTP server:** React 19 single-page application with a virtualised
  list library (TanStack Virtual), built by Vite into static files; the server uses Node.js's
  built-in `node:http` module with a small hand-written router and the security checks of
  C001-IF-002; client types generated from `openapi.yaml` at build time.
- **2 — Svelte SPA, built-in HTTP server:** Svelte 5 compiled components built by Vite; same server
  as candidate 1.
- **3 — SolidJS SPA, Hono server:** SolidJS fine-grained reactive client built by Vite; the server
  uses the Hono framework with its Node.js adapter.
- **4 — Web components without an application framework, built-in HTTP server:** plain TypeScript
  with Lit templates, bundled by esbuild; routing and state written by hand; same server as
  candidate 1. The "do less" option: the smallest dependency set.
- **5 — Server-rendered HTML with htmx, built-in HTTP server:** the server renders HTML fragments
  for each view and action; htmx swaps them into the page; no client-side application.

## Scores
| Candidate | Response-time headroom | Fit with the self-only CSP and text rendering | Low build and maintenance effort | Small permissive dependency set | Fit with the JSON HTTP contract | Weighted |
|---|---|---|---|---|---|---|
| Weights | 25 | 25 | 20 | 15 | 15 | 100 |
| 1 — React SPA, built-in HTTP server | 4 | 5 | 5 | 4 | 4 | 4.45 |
| 2 — Svelte SPA, built-in HTTP server | 5 | 4 | 4 | 4 | 4 | 4.25 |
| 3 — SolidJS SPA, Hono server | 5 | 5 | 3 | 4 | 4 | 4.30 |
| 4 — Web components without a framework | 4 | 4 | 2 | 5 | 4 | 3.75 |
| 5 — Server-rendered HTML with htmx | 3 | 2 | 3 | 5 | 1 | 2.75 |

Justifications:

- **1 — React.** Response 4: the virtual DOM re-renders more than fine-grained frameworks, but
  with virtualised lists and memoised rows a 500-action session stays well inside 200 ms at p95 on
  the reference machine. CSP 5: text is escaped by default; the only way to insert HTML,
  `dangerouslySetInnerHTML`, is explicit and caught by a lint rule; React injects no styles and
  needs no `eval`. Effort 5: the most widely known UI library, with mature virtualisation and
  browser test tooling. Dependencies 4: React, React DOM and the list library in the bundle; the
  server adds no framework. Contract 4: types generated from `openapi.yaml`; request validation is
  wired by hand in the server.
- **2 — Svelte.** Response 5: compiled reactivity updates only what changed, with a small runtime.
  CSP 4: text is escaped by default and `{@html}` is lintable, but Svelte's transition helpers
  insert `<style>` elements at run time, which the policy blocks, so they must be banned. Effort 4:
  Svelte 5's runes are recent, implementers and coding agents often write the older syntax.
  Dependencies 4. Contract 4.
- **3 — SolidJS with Hono.** Response 5: fine-grained updates without a virtual DOM. CSP 5: JSX
  escapes text, and the `innerHTML` property is explicit and lintable. Effort 3: a smaller ecosystem
  and fewer implementers who know it; virtualisation libraries exist but have fewer users.
  Dependencies 4: Hono has no runtime dependencies; SolidJS is small. Contract 4: Hono's validators
  work, but its OpenAPI tooling is schema-library based rather than JSON-Schema based.
- **4 — Web components.** Response 4: Lit's templates update efficiently, and the virtual-list
  package is still a labs project. CSP 4: Lit escapes text and its `unsafeHTML` directive is
  lintable; component styles use constructable style sheets, with a `<style>` fallback that must
  stay off. Effort 2: routing, state and data loading for some fifteen views are written by hand.
  Dependencies 5: Lit only. Contract 4.
- **5 — htmx.** Response 3: every view and action renders HTML on the server, including large
  hunk and file-context fragments. CSP 2: every server template must escape repository content
  itself, making each template an injection point; htmx's inline event attributes need `eval`
  unless disabled, and its indicator styles need a configuration switch. Effort 3: server templates
  plus fragment endpoints. Dependencies 5. Contract 1: C001-IF-002 is a JSON API consumed by
  C001-COMP-019; htmx needs HTML endpoints, which would replace or duplicate that contract.

Sources (not opened in this session: no web tool was available on 2026-11-18; facts are the
architect's knowledge as of 2026-06; licences are verified by the licence check of C001-CON-07):
React <https://react.dev> (MIT); TanStack Virtual <https://tanstack.com/virtual> (MIT); Vite
<https://vite.dev> (MIT); Svelte <https://svelte.dev> (MIT); SolidJS <https://www.solidjs.com>
(MIT); Hono <https://hono.dev> (MIT); Lit <https://lit.dev> (BSD-3-Clause); htmx
<https://htmx.org> (BSD-family licence); openapi-typescript <https://openapi-ts.dev> (MIT);
Content-Security-Policy <https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy>.

## Sensitivity
- **Top two: 1 (4.45) and 3 (4.30), gap 0.15.** 1 − 3 = −w(response) + 2·w(effort). Moving 5
  points from effort to response time (30, 25, 15, 15, 15) ties them at 4.40; any further shift
  makes SolidJS lead, and moving 10 points brings Svelte level with React (SolidJS 4.50, React
  4.35, Svelte 4.35). The ranking among the three frameworks therefore depends on how much P-01
  values headroom above the threshold against familiarity. All three meet C001-NFR-003 with
  virtualised lists; the difference is margin, not feasibility.
- **Score risk.** If the scripted session of C001-NFR-003 showed React above 200 ms at p95
  (response 3), React would fall to 4.20, below SolidJS and Svelte. The UI task measures a
  prototype of the hunk list early (C001-ADR-002 Consequences).
- **Runtime.** If C001-ADR-001 chose Rust, the server part of every candidate becomes a Rust HTTP
  server with the same checks; the client scores do not change, so the ranking stands.
- Candidates 4 and 5 stay last under any single shift of up to 10 points.

## Presented
1. **1 — React SPA, built-in HTTP server** (4.45) — recommended.
2. **3 — SolidJS SPA, Hono server** (4.30) — the fine-grained alternative.
3. **2 — Svelte SPA, built-in HTTP server** (4.25) — the compiled alternative.

## Recommendation
**1 — React SPA, built-in HTTP server:** it renders text by default, needs no exception to the
self-only policy, and is the stack implementers and test tools know best, while its response-time
margin is sufficient with virtualised lists. No near tie applies (0.15 ahead of SolidJS), but the
lead rests on the effort weight; the tie-breaker is delivery risk: the web client realises more
than 30 requirements (C001-COMP-019), and the most familiar framework lowers the risk of defects in
them.

## Rejected
- **4 — Web components without a framework** (3.75) — routing, state and data loading for every
  view written by hand, for a dependency saving that the built bundle barely shows.
- **5 — Server-rendered HTML with htmx** (2.75) — replaces the JSON contract of C001-IF-002 with
  HTML endpoints and makes every server template an injection point under C001-CON-20.
