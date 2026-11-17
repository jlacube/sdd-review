---
id: "C001-SPEC-SEQ-headless-and-cli-verdict"
artifact: spec/sequence
change: "CHG-001"
phase: 10-spec
status: draft
---
# Headless analysis and CLI verdict (realizes C001-TS-926, C001-TS-928, C001-TS-929, C001-TS-932, C001-TS-933, C001-TS-937)

Flow of `architecture.md` §3. Commands and exit codes: `50-interfaces/review-cli.md`. The headless
analysis writes no record entry and needs no git identity; the verdict does (C001-REQ-721).

```mermaid
sequenceDiagram
  actor Dev as P-02 developer
  participant C001_COMP_001 as CLI
  participant C001_COMP_002 as Core API and orchestrator
  participant C001_COMP_003 as Git access adapter
  participant C001_COMP_013 as Verdict and record service
  participant C001_COMP_014 as Review state store
  participant C001_COMP_018 as Local review UI server
  Note over Dev,C001_COMP_018: Realizes C001-TS-926, C001-TS-928, C001-TS-929, C001-TS-932, C001-TS-933, C001-TS-937
  Dev->>C001_COMP_001: analyse --headless --out results
  C001_COMP_001->>C001_COMP_002: startReview, runStaticAnalysis, startJobs
  Note over C001_COMP_001,C001_COMP_002: the UI server is neither loaded nor started
  C001_COMP_002-->>C001_COMP_001: jobs completed or unavailable
  C001_COMP_001->>C001_COMP_002: exportResults(results)
  alt every file written
    C001_COMP_002-->>C001_COMP_001: five analysis documents and the review record
    C001_COMP_001-->>Dev: exit 0
  else a file cannot be written
    C001_COMP_002-->>C001_COMP_001: ERR-CLI-002, files of this run removed
    C001_COMP_001-->>Dev: exit 7
  end
  Dev->>C001_COMP_001: sign intent with the UI of the same review open
  C001_COMP_001->>C001_COMP_002: giveVerdict(sign)
  C001_COMP_002->>C001_COMP_003: userIdentity (G-10), after the intent check
  alt git user.name or user.email not set
    C001_COMP_002-->>C001_COMP_001: ERR-ACT-006 naming the missing settings
    C001_COMP_001-->>Dev: exit 6, nothing recorded, no prompt
  else open hunks and no matching confirmation
    C001_COMP_002->>C001_COMP_013: sign with the git user
    C001_COMP_013-->>C001_COMP_001: ERR-ACT-002 with the numbers
    C001_COMP_001-->>Dev: terminal prompt, or exit 6 without a terminal
  else confirmed or no open hunk
    C001_COMP_002->>C001_COMP_013: sign with the git user
    par CLI process
      C001_COMP_013->>C001_COMP_014: append verdict entry under the record lock
    and UI server process
      C001_COMP_018->>C001_COMP_014: append read-mark entry under the record lock
    end
    C001_COMP_014-->>C001_COMP_013: entries kept in arrival order, sequence numbers consecutive
    C001_COMP_001-->>Dev: exit 0
  end
  Note over C001_COMP_018,C001_COMP_014: the UI server re-reads appended entries, the CLI verdict appears in the UI
```
