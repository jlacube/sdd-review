---
id: "C001-SPEC-SEQ-intake-to-architecture-delta"
artifact: spec/sequence
change: "CHG-001"
phase: 10-spec
status: draft
---
# Intake to architecture delta (realizes C001-TS-101, C001-TS-104, C001-TS-106, C001-TS-108, C001-TS-130, C001-TS-133, C001-TS-143, C001-TS-201, C001-TS-202, C001-TS-203, C001-TS-476, C001-TS-901, C001-TS-902, C001-TS-903)

Flow of `architecture.md` §3. Errors stop intake before any snapshot is stored
(`50-interfaces/errors.md`, ERR-INTAKE, ERR-CTX, ERR-SDD). The choice of the base commit follows
`50-interfaces/git-access.md` §4 (C001-REQ-102 to C001-REQ-104); the intake summary names the case
(`50-interfaces/review-cli.md` §Output).

```mermaid
sequenceDiagram
  actor Dev as P-02 developer
  participant C001_COMP_001 as CLI
  participant C001_COMP_002 as Core API and orchestrator
  participant C001_COMP_004 as Intake and snapshot builder
  participant C001_COMP_003 as Git access adapter
  participant C001_COMP_005 as Intent source reader
  participant C001_COMP_014 as Review state store
  participant C001_COMP_006 as Configuration loader
  participant C001_COMP_008 as Architecture delta analyser
  participant C001_COMP_009 as Intent mapper
  participant C001_COMP_010 as Triage and clearing engine
  participant C001_COMP_018 as Local review UI server
  participant C001_COMP_019 as Local review UI web client
  Note over C001_COMP_001,C001_COMP_019: Realizes C001-TS-101, C001-TS-104, C001-TS-106, C001-TS-108, C001-TS-130, C001-TS-133, C001-TS-143, C001-TS-201, C001-TS-202, C001-TS-203, C001-TS-476, C001-TS-901, C001-TS-902, C001-TS-903
  Dev->>C001_COMP_001: review with intake options
  C001_COMP_001->>C001_COMP_002: startReview(options)
  C001_COMP_002->>C001_COMP_004: take in the change
  C001_COMP_004->>C001_COMP_003: discover, head (G-01, G-02)
  alt the developer named a commit
    C001_COMP_004->>C001_COMP_003: resolveCommit, mergeBase with HEAD (G-03, G-04)
    C001_COMP_003-->>C001_COMP_004: base commit, baseChoice named, or ERR-INTAKE-003, ERR-INTAKE-004
  else HEAD on a branch with an upstream branch
    C001_COMP_004->>C001_COMP_003: upstream, mergeBase with HEAD (G-05, G-04)
    C001_COMP_003-->>C001_COMP_004: base commit, baseChoice upstream-merge-base, baseRef the upstream ref
  else no upstream branch or detached HEAD
    C001_COMP_004->>C001_COMP_003: defaultBranches (G-14): default branch of the remote, main, master
    loop each entry in order until one has a merge base with HEAD
      C001_COMP_004->>C001_COMP_003: mergeBase(entry, HEAD) (G-04)
    end
    C001_COMP_003-->>C001_COMP_004: base commit, baseChoice default-branch-merge-base with baseRef, or HEAD with baseChoice head
  end
  C001_COMP_004->>C001_COMP_003: changeAgainst(base), commitsBetween, attributeLines
  C001_COMP_003-->>C001_COMP_004: changed files with content, commits, line attribution
  opt the change holds no difference
    C001_COMP_004-->>C001_COMP_001: ERR-INTAKE-005, no snapshot created
  end
  C001_COMP_004->>C001_COMP_005: read SDD workspace of the snapshot and of the base commit, and named files
  opt named SDD change not open, or neutral file invalid
    C001_COMP_005-->>C001_COMP_001: ERR-SDD-002 or ERR-SDD-003, no snapshot created
  end
  C001_COMP_005-->>C001_COMP_004: intent context, selected SDD change, lines read on both sides, notices ERR-SDD-004 and ERR-SDD-005
  C001_COMP_004->>C001_COMP_004: cut hunks, measure size, compute snapshot ID
  C001_COMP_004->>C001_COMP_014: look up review by snapshot ID
  alt a review of this snapshot exists
    C001_COMP_014-->>C001_COMP_002: recorded analysis documents and record
    Note over C001_COMP_002: reopened without recomputing, unfinished jobs resumed
  else new snapshot
    C001_COMP_004->>C001_COMP_014: store snapshot, content and new sample seed
    C001_COMP_002->>C001_COMP_006: load configuration of the base commit
    C001_COMP_006->>C001_COMP_003: readBlob(base, configuration path), attributes(base)
    C001_COMP_006-->>C001_COMP_002: effective configuration, or unreadable with ERR-CFG-001
    C001_COMP_002->>C001_COMP_008: build architecture delta, architecture-edit drift, unanalysed manifests
    C001_COMP_002->>C001_COMP_009: create intents, link by deterministic signals, spec-edit flags
    C001_COMP_002->>C001_COMP_010: guarded areas, risk scores, mechanical clearing
    C001_COMP_002->>C001_COMP_014: store analysis documents, revision 1
  end
  C001_COMP_002-->>C001_COMP_001: intake summary, size warning
  C001_COMP_001-->>Dev: intake summary
  C001_COMP_001->>C001_COMP_018: start on 127.0.0.1 with a new token
  alt a browser can be opened
    C001_COMP_001-->>Dev: browser opened at the address with the token fragment
  else no browser
    C001_COMP_001-->>Dev: ERR-UI-003 notice with the address
  end
  C001_COMP_019->>C001_COMP_018: GET architecture-delta with token
  C001_COMP_018->>C001_COMP_002: getArchitectureDelta
  C001_COMP_002-->>C001_COMP_018: delta, component shares, intents with no code
  C001_COMP_018-->>C001_COMP_019: first view of the review
  Note over C001_COMP_002: background jobs start without delaying this view
```
