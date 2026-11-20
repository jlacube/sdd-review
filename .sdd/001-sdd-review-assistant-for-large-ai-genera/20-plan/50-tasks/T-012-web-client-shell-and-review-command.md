---
id: C001-T-012
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Web client shell and the review command (walking skeleton complete)
milestone: C001-M-01
status: in-progress
depends_on: [C001-T-011, C001-T-010]
implements: [C001-REQ-901, C001-REQ-902, C001-NFR-017]
satisfies_ac: [C001-AC-901.1, C001-AC-902.1]
verified_by: [C001-TS-901, C001-TS-902, C001-TS-903]
components: [C001-COMP-019, C001-COMP-001]
risk_refs: []
estimate: M
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-012 — Web client shell and the review command

## Intent
Close the walking skeleton: `sdd-review review` starts the analysis, starts the UI server, and
opens the browser on a React page (C001-ADR-002 item 1) that lists the changed files of the
snapshot; when no browser opens, it prints the address (C001-REQ-902). The shell sets up the
build, the generated client types, polling of `getSession`, the text-only rendering rule and its
lint, and the CSP violation test that every UI task reuses.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `web/vite.config.ts`, `web/src/main.tsx › app shell` | hashed static files, no inline script or style |
| add | `web/src/api/client.ts › generated client, session polling` | types from `openapi.yaml`, `getSession` interval default |
| add | `web/src/views/ChangeList.tsx › changed files view` | first view of the skeleton, rendered as text nodes only |
| add | `eslint.config.js › forbidden HTML rule` | forbids `dangerouslySetInnerHTML`, `innerHTML`, HTML highlighters, CSS-in-JS imports (C001-ADR-002 items 1 and 2) |
| add | `test/acceptance/support/csp-violations.ts` | fails a browser scenario on any CSP violation report |
| add | `src/cli/commands/review.ts › review, open` | starts the server (loaded only here, C001-CON-09), opens the browser or prints the address |

## Preconditions
- C001-T-010 and C001-T-011 done.

## Step outline
1. Set up the Vite build into the package's static folder and the generated client.
2. Implement the shell with session polling and the changed-files view.
3. Add the lint rule and the CSP violation check to the browser harness.
4. Implement `review` and `open`: browser launch, address printing, exit on server stop.

## Verification
- `npm run build`
- `npm run lint`
- `npm run acceptance:browser -- --scenario C001-TS-901 --scenario C001-TS-902 --scenario C001-TS-903`

## Done when
- [ ] On each CI operating system, `sdd-review review` on `fx-intake` shows the changed files in Chrome, Edge and Firefox.
- [ ] The CSP violation check reports none.
- [ ] A test component using `dangerouslySetInnerHTML` fails the lint.
