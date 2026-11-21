---
id: C001-T-087
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: OpenAI-compatible chat and Anthropic Messages adapters
milestone: C001-M-06
status: done
depends_on: [C001-T-085]
implements: [C001-REQ-805]
satisfies_ac: [C001-AC-805.1]
verified_by: [C001-TS-812, C001-TS-813]
components: [C001-COMP-016, C001-COMP-017]
risk_refs: []
estimate: M
report: { commit: f5f5a24, completed_at: 2026-11-21, notes: "OpenAI chat + Anthropic Messages adapters (HTTP, local socket, deadline, no retry, ERR-MODEL-003..010); 93 tests; TS-812/813 bound, await T-088/T-090; fail-safe until egress; combined tree verified (1,651 tests, 117 CI scenarios); CI green on 4 runners incl. first real POSIX acceptance at 2f889af; shared wiring in f04891a; PR at M-02 merge" }
---
# C001-T-087 — OpenAI-compatible chat and Anthropic Messages adapters

## Intent
Translate a model request to the OpenAI-compatible chat API over HTTP(S) or a local socket
(C001-IF-010 §4) and to the Anthropic Messages API with a forced tool call (§5), returning the
answer's JSON object or a failure that the gateway turns into a notice.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/model/adapters/openai-chat.ts › OpenAI-compatible adapter` | request shape, JSON response format, socket endpoints |
| add | `src/core/model/adapters/anthropic-messages.ts › Anthropic Messages adapter` | forced tool call, tool input returned |
| add | `test/unit/model/adapters/` | against `stub-llm` in both shapes; malformed answers |

## Preconditions
- C001-T-085 done.

## Step outline
1. Implement both adapters behind the port of C001-IF-010 §1.
2. Support HTTP, HTTPS and local sockets for the OpenAI-compatible adapter.
3. Return typed failures (timeout, HTTP error, no JSON object, no tool call).

## Verification
- `npm test -- test/unit/model/adapters`
- `npm run acceptance -- --scenario C001-TS-812 --scenario C001-TS-813`

## Done when
- [ ] Both adapters pass against `stub-llm`.
