---
id: "C001-CAP-01"
artifact: spec/requirements
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Change intake"
---
# C001-CAP-01 — Requirements

Greenfield change: no requirement carries a Delta (`10-context/current-state.md`). Terms:
`40-domain/glossary-delta.md`.

### C001-REQ-101 — Take in the change against the base commit
- **Pattern:** event-driven
- **Statement:** WHEN the developer starts a review, THE analysis core SHALL take in as the change every difference between the base commit and the working tree, including added, deleted, modified and renamed files and the untracked files that the repository's ignore rules do not exclude.
- **Rationale:** agent checkpoints miss shell-made and subagent edits (C001-R-001 §D, C001-R-003 Implications 6); the working tree is the complete record of the agent's output (C001-DEC-005).
- **Stories:** C001-US-101
- **Priority:** Must
- **Acceptance:** C001-AC-101.1

### C001-REQ-102 — Base commit from a named commit
- **Pattern:** event-driven
- **Statement:** WHEN the developer starts a review and names a commit, THE analysis core SHALL use the merge base of that commit and HEAD as the base commit.
- **Rationale:** a named ancestor of HEAD is its own merge base, and a named branch that moved on since the agent branched off (for example the main branch) still yields only the agent's work.
- **Stories:** C001-US-101
- **Priority:** Must
- **Acceptance:** C001-AC-102.1

### C001-REQ-103 — Default base commit with an upstream branch
- **Pattern:** complex
- **Statement:** WHILE HEAD is on a branch that has an upstream branch, WHEN the developer starts a review without naming a commit, THE analysis core SHALL use the merge base of the upstream branch and HEAD as the base commit.
- **Rationale:** the review covers the agent's commits not yet pushed together with the uncommitted edits (C001-DEC-005 Consequences).
- **Stories:** C001-US-101, C001-US-102
- **Priority:** Must
- **Acceptance:** C001-AC-103.1

### C001-REQ-104 — Default base commit without an upstream branch
- **Pattern:** complex
- **Statement:** WHILE HEAD is not on a branch that has an upstream branch, WHEN the developer starts a review without naming a commit, THE analysis core SHALL use as the base commit the merge base of HEAD and the first branch of this list that exists and has a merge base with HEAD: the default branch of the remote, a local branch named `main`, a local branch named `master`; and HEAD itself when no branch of the list qualifies.
- **Rationale:** Q-intake-01 (merge base with the default branch). An agent that commits on a new local branch has no upstream branch until the first push; this rule keeps its commits and their commit intents in the review (C001-US-102, C001-REQ-109, C001-REQ-313). A review-configuration edit that the agent committed stays out of the base commit, so the configuration of the base commit judges it (Q-clearing-03, C001-REQ-426). HEAD is the last resort: the review then covers the uncommitted edits only. The intake summary states which rule chose the base commit (C001-REQ-114), so that the developer can name another one (C001-REQ-102). Default branch of the remote: glossary.
- **Stories:** C001-US-101, C001-US-102
- **Priority:** Must
- **Acceptance:** C001-AC-104.1

### C001-REQ-105 — Refuse an unknown base commit
- **Pattern:** unwanted-behaviour
- **Statement:** IF the commit the developer names does not resolve to a commit of the repository or has no merge base with HEAD, THEN THE analysis core SHALL stop intake with an error message that names the value given.
- **Rationale:** constitution principle 4 (error behaviour written down); NFR-D-04.
- **Stories:** C001-US-101
- **Priority:** Must
- **Acceptance:** C001-AC-105.1

### C001-REQ-106 — Refuse a directory without git history
- **Pattern:** unwanted-behaviour
- **Statement:** IF the developer starts a review in a directory outside a git working tree or in a repository that has no commit, THEN THE analysis core SHALL stop intake with an error message that names the directory.
- **Rationale:** a git repository is the unit of review [ASSUMPTION: C001-AS-03]; constitution principle 4.
- **Stories:** C001-US-101
- **Priority:** Must
- **Acceptance:** C001-AC-106.1

### C001-REQ-107 — Stop on an empty change
- **Pattern:** unwanted-behaviour
- **Statement:** IF the change contains no difference, THEN THE analysis core SHALL stop intake without creating a snapshot and report that the change is empty.
- **Rationale:** a review with nothing to review would record verdicts on no code (C001-DEC-003).
- **Stories:** C001-US-101
- **Priority:** Must
- **Acceptance:** C001-AC-107.1

### C001-REQ-108 — List binary files without changed lines
- **Pattern:** event-driven
- **Statement:** WHEN intake finds a changed binary file, THE analysis core SHALL list it in the change with its path and change type and count it as zero changed lines.
- **Rationale:** the review covers every changed file (C001-US-101); changed lines are defined for text files only (glossary, changed line).
- **Stories:** C001-US-101
- **Priority:** Should
- **Acceptance:** C001-AC-108.1

### C001-REQ-109 — Keep the commits of the change in the intent context
- **Pattern:** event-driven
- **Statement:** WHEN the base commit differs from HEAD, THE analysis core SHALL add each commit between the base commit and HEAD to the intent context with its hash, author, time, message and changed files.
- **Rationale:** agents that commit their own work are reviewed like the others, and commit messages are an intent source (C001-R-003 §B, §D; C001-DEC-006).
- **Stories:** C001-US-102, C001-US-103
- **Priority:** Must
- **Acceptance:** C001-AC-109.1

### C001-REQ-110 — Attribute each hunk to the commits that changed it
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL record for each hunk the commits between the base commit and HEAD that added or deleted its changed lines, and whether the hunk holds uncommitted changed lines.
- **Rationale:** commit boundaries are a link signal of the intent map (C001-US-102 notes; `CAP-03-intent-map/requirements.md` §1).
- **Stories:** C001-US-102
- **Priority:** Must
- **Acceptance:** C001-AC-110.1

### C001-REQ-111 — Read the SDD workspace into the intent context
- **Pattern:** optional-feature
- **Statement:** WHERE the snapshot contains an SDD workspace, in the `.sdd/` format or as a neutral intent-and-architecture file, THE analysis core SHALL add the spec items of its open SDD changes, with their IDs, their text and the links between them, to the intent context.
- **Rationale:** specs when present (C001-DEC-006); SDD tools use different formats (C001-R-002 §A). Formats read in the first version: Q-intent-sources-01 (the `.sdd/` format natively, plus a documented neutral file that any other tool can produce). The spec items are read from the snapshot, so that a spec-driven change can add its own requirements; every spec item the change edits is flagged instead (C001-REQ-328, the rule of Q-drift-01 applied to spec items). Damaged entries: C001-REQ-123, C001-REQ-124.
- **Stories:** C001-US-103
- **Priority:** Must
- **Acceptance:** C001-AC-111.1
- **Open items:** reading rules: C001-IF-007; neutral file format: C001-IF-006.

### C001-REQ-112 — Read named pull-request text, plan and transcript files
- **Pattern:** event-driven
- **Statement:** WHEN the developer names at intake a Markdown or plain-text file as pull-request text, agent plan or agent transcript, THE analysis core SHALL add the file's content to the intent context under that role.
- **Rationale:** intent fallback sources (C001-DEC-006); agent plan files (C001-R-003 Implications 2); local only, no hosting platform (C001-NG-02, C001-CON-01). Plans and transcripts are read as Markdown or plain text (Q-intent-sources-01); pull-request text is a local text file (glossary).
- **Stories:** C001-US-103
- **Priority:** Must
- **Acceptance:** C001-AC-112.1

### C001-REQ-113 — Refuse an unreadable intent-context file
- **Pattern:** unwanted-behaviour
- **Statement:** IF a file the developer names as intent context does not exist, cannot be read, or is not a Markdown or plain-text file, THEN THE analysis core SHALL stop intake with an error message that names the file and the reason.
- **Rationale:** a named source silently dropped would change the intent map without notice; constitution principle 4.
- **Stories:** C001-US-103
- **Priority:** Must
- **Acceptance:** C001-AC-113.1

### C001-REQ-114 — Show the intake summary
- **Pattern:** event-driven
- **Statement:** WHEN intake completes, THE review assistant SHALL show an intake summary that states the base commit with its hash and subject line, how it was chosen (named by the developer; derived by C001-REQ-103 or C001-REQ-104 from a branch, with the name of that branch; or HEAD because no branch of C001-REQ-104 qualified), whenever the base commit is HEAD itself, however it was chosen, a warning that only the uncommitted edits are reviewed and that another base commit can be named, the counts of changed files and changed lines, the intent context found, and the test command that C001-REQ-505 will run on the snapshot with where it comes from (given by the developer for the review, or the review configuration of the base commit) or that no test command will run.
- **Rationale:** the developer checks what is reviewed before investing time (C001-US-101, C001-US-105); explicit over implicit (constitution principle 4). Q-intake-01: the summary states which rule chose the base commit, so that a review of the uncommitted edits only (HEAD as base) is never a surprise. The warning follows the result, not the rule: a merge base with a local `main` or `master` on which HEAD itself sits, an upstream branch that already holds HEAD, or HEAD named by the developer also give HEAD as the base commit, and the agent's commits are then outside the review (C001-REQ-109). Naming another base commit: C001-REQ-102. The test command is the developer's or the repository's own command and its network use is outside the review assistant's control (C001-REQ-803), so the developer sees it before it runs (output form: `50-interfaces/review-cli.md` §Output).
- **Stories:** C001-US-101, C001-US-103, C001-US-105
- **Priority:** Must
- **Acceptance:** C001-AC-114.1

### C001-REQ-115 — Create an identified snapshot
- **Pattern:** event-driven
- **Statement:** WHEN intake completes, THE analysis core SHALL create a snapshot of the change whose snapshot ID is identical for an identical base commit, HEAD and changed-file content and differs when any of them differs.
- **Rationale:** review state is anchored to a snapshot (`ideation.md` §9); verdicts are recorded against the snapshot (C001-SC-05).
- **Stories:** C001-US-104
- **Priority:** Must
- **Acceptance:** C001-AC-115.1

### C001-REQ-116 — Review the content of the snapshot
- **Pattern:** ubiquitous
- **Statement:** THE review assistant SHALL use the file content recorded in the snapshot, not the current working tree, in every analysis result and every view of a review.
- **Rationale:** the map, the clearings and the verdicts refer to the code reviewed (C001-US-104).
- **Stories:** C001-US-104
- **Priority:** Must
- **Acceptance:** C001-AC-116.1

### C001-REQ-117 — Notice when the working tree or HEAD moved on
- **Pattern:** complex
- **Statement:** WHILE the working tree or HEAD no longer matches the snapshot under review, WHEN the developer resumes the review, records a verdict or asks for the decision status of the review, THE review assistant SHALL show a moved-on notice that names each file that differs from the snapshot and states whether HEAD moved.
- **Rationale:** no verdict on code that changed underneath it (C001-US-104); stale verdicts themselves: C001-US-706. The decision status is the report of C001-REQ-711; asking for it is the developer's way to check the snapshot at any time. Notice ERR-INTAKE-007 (`50-interfaces/errors.md`).
- **Stories:** C001-US-104
- **Priority:** Must
- **Acceptance:** C001-AC-117.1

### C001-REQ-118 — Keep earlier snapshots when a new snapshot is taken
- **Pattern:** event-driven
- **Statement:** WHEN intake creates a snapshot whose snapshot ID differs from those of the existing reviews of the repository, THE analysis core SHALL keep every earlier snapshot and its review record unchanged.
- **Rationale:** stale-verdict detection (C001-US-706) and the review record (C001-US-705) need the earlier snapshot; incremental re-review stays out of scope (`ideation.md` §5 Later).
- **Stories:** C001-US-104
- **Priority:** Must
- **Acceptance:** C001-AC-118.1

### C001-REQ-119 — Reopen the review of an existing snapshot
- **Pattern:** event-driven
- **Statement:** WHEN intake produces the snapshot ID of an existing review, THE analysis core SHALL reopen that review with the analysis results recorded for it, without recomputing them.
- **Rationale:** model-assisted grouping can differ between runs; anchoring the results to the snapshot keeps the map stable (`ideation.md` §9, C001-R-001 Implications).
- **Stories:** C001-US-104
- **Priority:** Must
- **Acceptance:** C001-AC-119.1

### C001-REQ-120 — Leave the repository unchanged during intake
- **Pattern:** ubiquitous
- **Statement:** THE analysis core SHALL NOT change the working tree, the index, any branch, any tag or any commit of the repository during intake and snapshot creation.
- **Rationale:** the tool never stages, commits or reverts code (C001-CON-04, C001-NG-03). The same holds for the evidence runs after intake: C001-REQ-521.
- **Stories:** C001-US-104
- **Priority:** Must
- **Acceptance:** C001-AC-120.1

### C001-REQ-121 — Warn when the change exceeds the supported size
- **Pattern:** event-driven
- **Statement:** WHEN intake measures more than 10,000 changed lines or more than 300 changed files, THE review assistant SHALL show a size warning, stating the measured counts and the supported size, in the intake summary and on the architecture delta view.
- **Rationale:** C001-DEC-007, C001-CON-06, C001-NG-05; stated limits instead of silent degradation (C001-US-105).
- **Stories:** C001-US-105
- **Priority:** Should
- **Acceptance:** C001-AC-121.1

### C001-REQ-122 — Continue the review above the supported size
- **Pattern:** state-driven
- **Statement:** WHILE the change exceeds the supported size, THE analysis core SHALL take in and analyse the whole change.
- **Rationale:** the warning informs and does not block (C001-US-105); the NFR thresholds of `30-nfr/nfr.md` apply up to the supported size only.
- **Stories:** C001-US-105
- **Priority:** Should
- **Acceptance:** C001-AC-122.1

### C001-REQ-123 — Leave out unreadable entries of a `.sdd/` workspace
- **Pattern:** unwanted-behaviour
- **Statement:** IF an entry of the `.sdd/` workspace in the snapshot (a change folder, a spec item or a component of the documented architecture) has the form of such an entry but cannot be read under the reading rules of the `.sdd/` format, THEN THE analysis core SHALL leave that entry out of the intent context and report a notice that names its file, its line and the reason.
- **Rationale:** one damaged entry must not stop the review of a whole change, and the notice keeps the gap visible (constitution principle 4). Reading rules: C001-IF-007 §2 to §4. Notice ERR-SDD-005 (`50-interfaces/errors.md`).
- **Stories:** C001-US-103
- **Priority:** Must
- **Acceptance:** C001-AC-123.1

### C001-REQ-124 — Stop on an invalid neutral intent-and-architecture file
- **Pattern:** unwanted-behaviour
- **Statement:** IF the neutral intent-and-architecture file of the snapshot does not conform to its documented format, THEN THE analysis core SHALL stop intake with an error message that names the file, the place of the first nonconformity and the reason.
- **Rationale:** the neutral file is produced by a tool, so a nonconforming file is a fault of that tool that must be fixed before its intents are trusted (constitution principle 4). Format: C001-IF-006. Error ERR-SDD-003 (`50-interfaces/errors.md`).
- **Stories:** C001-US-103
- **Priority:** Must
- **Acceptance:** C001-AC-124.1
