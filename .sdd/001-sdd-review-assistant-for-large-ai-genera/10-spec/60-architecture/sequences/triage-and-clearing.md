---
id: "C001-SPEC-SEQ-triage-and-clearing"
artifact: spec/sequence
change: "CHG-001"
phase: 10-spec
status: draft
---
# Triage and clearing with evidence (realizes C001-TS-419, C001-TS-435, C001-TS-442, C001-TS-445, C001-TS-459, C001-TS-460, C001-TS-462, C001-TS-512, C001-TS-516, C001-TS-523, C001-TS-539, C001-TS-543, C001-TS-570)

Flow of `architecture.md` §3. Hunk states: `40-domain/state-machines.md` §1; test run and mutation
states: §4 and §5; run conventions and evidence workspaces: `50-interfaces/evidence-runs.md`;
revisions: `architecture.md` §4.2. No step of the analysis core writes to the developer's working
tree, and no run starts in it; the working tree is only observed during a run, for notice
ERR-EVID-009 and, for parts it could not observe, ERR-EVID-010 (C001-REQ-521, C001-REQ-522,
C001-REQ-523, C001-REQ-524, `50-interfaces/evidence-runs.md` §9). Mutation testing runs in a
self-contained copy of the test run's workspace and leaves CPU capacity for bundle runs
(`50-interfaces/evidence-runs.md` §1 item 4, §2 item 3, §5 item 4).

```mermaid
sequenceDiagram
  actor Dev as P-02 developer or agent
  participant C001_COMP_002 as Core API and orchestrator
  participant C001_COMP_010 as Triage and clearing engine
  participant C001_COMP_007 as Language analysis
  participant C001_COMP_011 as Evidence runner
  participant C001_COMP_003 as Git access adapter
  participant C001_COMP_012 as Review coverage tracker
  participant C001_COMP_014 as Review state store
  participant C001_COMP_019 as Local review UI web client
  Note over Dev,C001_COMP_019: Realizes C001-TS-419, C001-TS-435, C001-TS-442, C001-TS-445, C001-TS-459, C001-TS-460, C001-TS-462, C001-TS-512, C001-TS-516, C001-TS-523, C001-TS-539, C001-TS-543, C001-TS-570
  C001_COMP_002->>C001_COMP_010: triage the snapshot with the effective configuration
  C001_COMP_010->>C001_COMP_007: syntax trees, name resolution, public API of base and snapshot
  C001_COMP_007-->>C001_COMP_010: symbols, moves, renames, formatting-only hunks
  C001_COMP_010->>C001_COMP_010: guarded areas and design findings keep hunks open
  C001_COMP_010->>C001_COMP_010: clear by pure-move, pure-rename, formatting, generated-file with evidence records
  C001_COMP_010-->>C001_COMP_012: cleared hunks per rule
  C001_COMP_012->>C001_COMP_012: draw samples with the review seed
  C001_COMP_002->>C001_COMP_014: save revision (triage document with samples), then show it
  C001_COMP_002->>C001_COMP_011: start test run job
  C001_COMP_011->>C001_COMP_003: treeEntries(base) and readBlob (G-13, G-08)
  C001_COMP_011->>C001_COMP_014: snapshot content of the changed files
  C001_COMP_011->>C001_COMP_011: fill an evidence workspace outside the working tree, check it against the snapshot
  alt no workspace can be prepared
    C001_COMP_011-->>C001_COMP_002: test evidence unavailable, ERR-EVID-002
  else workspace ready
    C001_COMP_011->>C001_COMP_011: run test command in the workspace with per-test coverage adapters, Python project modules loaded from the workspace, observe the working tree, index and refs
    opt the developer or the agent edits the working tree during the run
      Dev->>Dev: edits files, commits
      Note over C001_COMP_011: the run continues on the snapshot's files (C001-REQ-522)
    end
    C001_COMP_011->>C001_COMP_011: workspace check after the run
    opt paths of the working tree, the index or refs changed during the run
      C001_COMP_011-->>C001_COMP_002: notice ERR-EVID-009 with up to 10 paths, results unaffected
    end
    opt a part of the working tree, the index or refs was not observed for the whole run
      C001_COMP_011-->>C001_COMP_002: notice ERR-EVID-010 with the cause and up to 10 paths, results unaffected
    end
    alt workspace still matches and results reported
      C001_COMP_011-->>C001_COMP_002: test results, passing and failing tests per added line of workspace files, ERR-EVID-008 for executed working-tree files
      C001_COMP_002->>C001_COMP_010: evaluate passing-tests rule with qualifying tests
      C001_COMP_010-->>C001_COMP_002: newly cleared hunks with tests and run as evidence
      C001_COMP_002->>C001_COMP_014: save revision, then show it
      C001_COMP_002->>C001_COMP_011: mutation testing on executed changed lines, hunks by descending risk
      C001_COMP_011->>C001_COMP_011: copy the test run's workspace with its build outputs as a self-contained mutation workspace
      Note over C001_COMP_011: copy window, a run asking for the test run's workspace waits until the copy ends, no workspace is prepared for it
      alt the copy fails
        C001_COMP_011->>C001_COMP_011: remove the partial copy
        C001_COMP_011-->>C001_COMP_002: mutation evidence of every hunk unavailable with the cause, ERR-EVID-006
      else copy made
        Note over C001_COMP_011: the test run's workspace is free again for bundle runs, mutation workers leave CPU capacity for them
        C001_COMP_011->>C001_COMP_011: self-containment check, first unmutated test execution in the copy with coverage adapters
        opt files of the snapshot executed outside the copy
          C001_COMP_011-->>C001_COMP_002: their hunks' mutation evidence unavailable, notice ERR-EVID-011
        end
        loop each hunk as its mutants finish
          C001_COMP_011-->>C001_COMP_002: mutation results or unavailable with reason
          opt a surviving mutant in a test-cleared hunk
            C001_COMP_002->>C001_COMP_010: passing-tests condition no longer holds
            C001_COMP_010-->>C001_COMP_002: hunk reopened unless read or cleared by another rule, evidence record updated with the condition
          end
          C001_COMP_002->>C001_COMP_014: save revision, then show it
        end
        C001_COMP_011->>C001_COMP_011: remove the mutation copy
      end
    else the run changed files of the snapshot in its workspace, or no results
      C001_COMP_011-->>C001_COMP_002: discarded (ERR-EVID-005) or unavailable with reason
    end
  end
  C001_COMP_019->>C001_COMP_002: getIntent through the UI server on the new revision
  C001_COMP_002-->>C001_COMP_019: cleared hunks collapsed with rules and strongest evidence strength
```
