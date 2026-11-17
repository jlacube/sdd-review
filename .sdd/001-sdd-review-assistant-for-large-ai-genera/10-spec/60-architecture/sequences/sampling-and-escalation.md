---
id: "C001-SPEC-SEQ-sampling-and-escalation"
artifact: spec/sequence
change: "CHG-001"
phase: 10-spec
status: draft
---
# Sampling, defect report and escalation (realizes C001-TS-610, C001-TS-617, C001-TS-622, C001-TS-624, C001-TS-626, C001-TS-743)

Flow of `architecture.md` §3. Sample rule: C001-INV-16; rule states: `40-domain/state-machines.md`
§6; sample membership: §8 of the same file; save and restore of the entries and the samples:
`architecture.md` §4.2. The `opt` block ends the flow when the git identity is not set
(C001-REQ-721).

```mermaid
sequenceDiagram
  actor Dev as P-02 developer
  participant C001_COMP_019 as Local review UI web client
  participant C001_COMP_018 as Local review UI server
  participant C001_COMP_002 as Core API and orchestrator
  participant C001_COMP_003 as Git access adapter
  participant C001_COMP_012 as Review coverage tracker
  participant C001_COMP_010 as Triage and clearing engine
  participant C001_COMP_014 as Review state store
  participant C001_COMP_013 as Verdict and record service
  Note over Dev,C001_COMP_013: Realizes C001-TS-610, C001-TS-617, C001-TS-622, C001-TS-624, C001-TS-626, C001-TS-743
  C001_COMP_019->>C001_COMP_018: GET reading-queue
  C001_COMP_018->>C001_COMP_002: getReadingQueue
  C001_COMP_002->>C001_COMP_012: open hunks and unread sampled hunks by risk per minute
  C001_COMP_012-->>C001_COMP_019: reading queue with each rule's sample
  Dev->>C001_COMP_019: reads a sampled hunk, reports a defect
  C001_COMP_019->>C001_COMP_018: POST defect-reports with token
  C001_COMP_018->>C001_COMP_002: reportDefect(hunk, text)
  C001_COMP_002->>C001_COMP_003: userIdentity (G-10), after the hunk and text checks
  opt user.name or user.email not set
    C001_COMP_002-->>C001_COMP_019: 409 ERR-ACT-006, nothing recorded, no escalation
  end
  C001_COMP_002->>C001_COMP_012: defect in the hunk, with the git user
  C001_COMP_012->>C001_COMP_012: rules that had cleared the hunk, possibly none (C001-REQ-617)
  alt no rule had cleared the hunk
    C001_COMP_012->>C001_COMP_014: append defect-report entry naming no rule, flush
    C001_COMP_012-->>C001_COMP_002: recorded, no escalation
  else rules had cleared it
    C001_COMP_012->>C001_COMP_010: escalate those rules
    C001_COMP_010->>C001_COMP_010: reopen every unread hunk they cleared, rules clear nothing more
    C001_COMP_010-->>C001_COMP_012: reopened hunks, withdrawn evidence records
    C001_COMP_012->>C001_COMP_012: reopened hunks leave the sample populations, read hunks keep theirs
    C001_COMP_012->>C001_COMP_012: samples of the rules not escalated refilled by rank, an escalated rule takes no new hunk into its sample, even below its target (C001-INV-16)
    C001_COMP_012->>C001_COMP_014: append defect-report and escalation entries in one write, flush
  end
  C001_COMP_002->>C001_COMP_013: current verdicts relying on withdrawn clearings
  C001_COMP_013-->>C001_COMP_002: those verdicts stale with cause evidence
  C001_COMP_002-->>C001_COMP_019: action confirmed, escalated rules and reopened hunks
  C001_COMP_002->>C001_COMP_014: save revision with hunk states and samples (architecture.md §4.2)
  C001_COMP_019-->>Dev: reopened hunks shown with the defect report
```
