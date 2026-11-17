---
id: "C001-SPEC-SEQ-signing-with-unread-hunks"
artifact: spec/sequence
change: "CHG-001"
phase: 10-spec
status: draft
---
# Signing an intent with unread hunks (realizes C001-TS-138, C001-TS-701, C001-TS-706, C001-TS-708, C001-TS-709, C001-TS-710, C001-TS-732, C001-TS-913, C001-TS-944)

Flow of `architecture.md` §3. Verdict states: `40-domain/state-machines.md` §2; entry format:
`50-interfaces/review-record.schema.json` `VerdictEntry`; order of the verdict checks:
`50-interfaces/core-api.md` §4. The `opt` block ends the flow when the git identity is not set
(ERR-ACT-006, C001-REQ-721); the orchestrator applies the same identity check to every action that
writes a record entry.

```mermaid
sequenceDiagram
  actor Dev as P-02 developer
  participant C001_COMP_019 as Local review UI web client
  participant C001_COMP_018 as Local review UI server
  participant C001_COMP_002 as Core API and orchestrator
  participant C001_COMP_004 as Intake and snapshot builder
  participant C001_COMP_013 as Verdict and record service
  participant C001_COMP_012 as Review coverage tracker
  participant C001_COMP_003 as Git access adapter
  participant C001_COMP_014 as Review state store
  Note over Dev,C001_COMP_014: Realizes C001-TS-138, C001-TS-701, C001-TS-706, C001-TS-708, C001-TS-709, C001-TS-710, C001-TS-732, C001-TS-913, C001-TS-944
  Dev->>C001_COMP_019: sign intent
  C001_COMP_019->>C001_COMP_018: POST verdicts kind sign, token, own origin
  C001_COMP_018->>C001_COMP_018: host, token and origin checks
  C001_COMP_018->>C001_COMP_002: giveVerdict(one intent, sign, no confirmation)
  C001_COMP_002->>C001_COMP_004: checkMovedOn
  C001_COMP_004->>C001_COMP_003: workingState(snapshot)
  C001_COMP_004-->>C001_COMP_002: moved-on notice or none
  C001_COMP_002->>C001_COMP_013: validate intent and text (ERR-ACT-001, ERR-ACT-003, ERR-ACT-004)
  C001_COMP_013-->>C001_COMP_002: input valid
  C001_COMP_002->>C001_COMP_003: userIdentity (G-10)
  C001_COMP_003-->>C001_COMP_002: user.name and user.email, each possibly none
  opt user.name or user.email not set
    C001_COMP_002-->>C001_COMP_018: ERR-ACT-006 naming the missing settings, nothing recorded
    C001_COMP_018-->>C001_COMP_019: 409 problem with missing
    C001_COMP_019-->>Dev: message to set the git identity, no confirmation offered
  end
  C001_COMP_002->>C001_COMP_013: sign with the git user
  C001_COMP_013->>C001_COMP_012: open hunks of the intent and their changed lines
  C001_COMP_012-->>C001_COMP_013: 3 open hunks, 120 changed lines
  C001_COMP_013-->>C001_COMP_002: ERR-ACT-002 with the two numbers
  C001_COMP_002-->>C001_COMP_018: refusal, nothing recorded
  C001_COMP_018-->>C001_COMP_019: 409 problem with openHunks and changedLines
  C001_COMP_019-->>Dev: prompt stating the open hunks and changed lines
  alt developer declines
    Note over C001_COMP_019: nothing recorded
  else developer confirms
    C001_COMP_019->>C001_COMP_018: POST verdicts with confirmOpenHunks 3 and 120
    C001_COMP_018->>C001_COMP_002: giveVerdict(sign, confirmation)
    C001_COMP_002->>C001_COMP_003: userIdentity (G-10), set
    C001_COMP_002->>C001_COMP_013: sign with confirmation and the git user
    C001_COMP_013->>C001_COMP_012: intent shares and coverage statement
    C001_COMP_013->>C001_COMP_013: build entry with basis, shares, coverage statement, user, time
    C001_COMP_013->>C001_COMP_014: append verdict entry under the record lock
    C001_COMP_014->>C001_COMP_014: flush to disk
    C001_COMP_014-->>C001_COMP_013: sequence number
    C001_COMP_013-->>C001_COMP_002: verdict status signed
    C001_COMP_002-->>C001_COMP_018: sequence number, revision, moved-on notice when it applies
    C001_COMP_018-->>C001_COMP_019: 201 verdict result
    C001_COMP_019-->>Dev: intent shown as signed
  end
```
