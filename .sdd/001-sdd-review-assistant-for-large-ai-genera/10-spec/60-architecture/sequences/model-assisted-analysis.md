---
id: "C001-SPEC-SEQ-model-assisted-analysis"
artifact: spec/sequence
change: "CHG-001"
phase: 10-spec
status: draft
---
# Model-assisted analysis with fallback (realizes C001-TS-317, C001-TS-812, C001-TS-814, C001-TS-822, C001-TS-835, C001-TS-841, C001-TS-843, C001-TS-844, C001-TS-847)

Flow of `architecture.md` §3. Gateway checks and adapters: `50-interfaces/model-provider.md`;
endpoint classification §6, key lookup and failure codes (ERR-MODEL-nnn of
`50-interfaces/errors.md`) §7.
Shown for one hunk-linking batch; intent extraction, design critique and walkthrough accounts
follow the same path. C001-REQ-327 and C001-REQ-819 have no scenario IDs yet.

```mermaid
sequenceDiagram
  participant C001_COMP_002 as Core API and orchestrator
  participant C001_COMP_009 as Intent mapper
  participant C001_COMP_015 as Model gateway
  participant C001_COMP_006 as Configuration loader
  participant C001_COMP_016 as OpenAI-compatible chat adapter
  participant C001_COMP_017 as Anthropic Messages adapter
  participant C001_COMP_001 as CLI
  participant C001_COMP_014 as Review state store
  Note over C001_COMP_002,C001_COMP_014: Realizes C001-TS-317, C001-TS-812, C001-TS-814, C001-TS-822, C001-TS-835, C001-TS-841, C001-TS-843, C001-TS-844, C001-TS-847
  C001_COMP_002->>C001_COMP_009: link hunks without a deterministic signal
  C001_COMP_009->>C001_COMP_015: runTask(hunk-linking, intents and hunks)
  C001_COMP_015->>C001_COMP_006: provider, endpoint, opt-in, timeout, excluded paths
  C001_COMP_015->>C001_COMP_015: classify the endpoint from its text, no name resolution
  Note over C001_COMP_015: local = socket, 127.0.0.0/8, ::1 or localhost, any other host name is non-local
  alt no provider, configuration unreadable, or non-local endpoint without opt-in
    C001_COMP_015-->>C001_COMP_009: model-free result, labelled reduced, ERR-CFG-001 or ERR-MODEL-001 by cause
  else provider allowed
    C001_COMP_015->>C001_COMP_015: remove hunks on model-excluded paths, ERR-MODEL-002
    C001_COMP_015->>C001_COMP_015: read the key from the environment or the credential store
    alt key required and none found
      C001_COMP_015-->>C001_COMP_009: model-free result for this batch, ERR-MODEL-006, no request sent
    else key found or not required
      opt non-local provider and first request of the process
        C001_COMP_015-->>C001_COMP_001: cloud-use event
        Note over C001_COMP_001: prints the announcement before the request
      end
      alt provider API openai-chat
        C001_COMP_015->>C001_COMP_016: request with the provider timeout, localhost through 127.0.0.1 or ::1
        C001_COMP_016-->>C001_COMP_015: JSON object or failure with HTTP status
      else provider API anthropic-messages
        C001_COMP_015->>C001_COMP_017: request with forced tool call and the provider timeout
        C001_COMP_017-->>C001_COMP_015: tool input or failure with HTTP status
      end
      alt valid against C001-IF-011
        C001_COMP_015-->>C001_COMP_009: links marked as model output, confidence low
        C001_COMP_009->>C001_COMP_009: drop each link to an intent the map does not hold, hunk stays orphan with reduced grouping, ERR-MODEL-011
        Note over C001_COMP_009: the other links of the answer are kept (C001-REQ-327)
      else failure
        C001_COMP_015-->>C001_COMP_009: model-free result for this batch, one code per cause
        Note over C001_COMP_015: unreachable 003, timeout 004, unusable 005, key rejected 007, HTTP 429 008, HTTP 5xx 009, other status 010
      end
    end
  end
  C001_COMP_009-->>C001_COMP_002: updated intent map, notices with counts
  C001_COMP_002->>C001_COMP_014: store intent-map document as a new revision
  Note over C001_COMP_002,C001_COMP_014: no record entry is written, verdicts, read marks and moves stay unchanged
```
