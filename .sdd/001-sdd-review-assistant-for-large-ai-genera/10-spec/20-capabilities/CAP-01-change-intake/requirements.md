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
- **Rationale:** agent checkpoints miss shell-made and subagent edits (C001-R-001 §D, C001-R-003 Implications 6); the working tree is the complete record of the agent's output (C001-DEC-005). A file under no clean filter is compared by its working-tree content, and no stat data, blob or flag that git's index records (assume-unchanged, skip-worktree, fsmonitor-valid) makes it count as unchanged, so an index entry never hides a change (C001-IF-012 §8 item 1); a path outside the sparse checkout, for example one whose index entry is marked skip-worktree and at which the working tree holds no file, takes the blob that its index entry records, whatever its filter (C001-IF-012 §8 item 2). Rule: C001-IF-012 §8. Files under a clean filter: C001-REQ-126 to C001-REQ-128.
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
- **Rationale:** a git repository is the unit of review [ASSUMPTION: C001-AS-03]; constitution principle 4. A git program that is missing, too old or refuses the repository: C001-REQ-125.
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
- **Statement:** WHILE the working tree or HEAD no longer matches the snapshot under review, where on Windows a file whose only difference from the snapshot is an edit that keeps the file's size, made after the last intake or moved-on check, with the file's modification time set back to the value it had at that check, counts as matching the snapshot (C001-IF-012 §8 item 3), WHEN the developer resumes the review, records a verdict or asks for the decision status of the review, THE review assistant SHALL show a moved-on notice that names each file that differs from the snapshot and states whether HEAD moved.
- **Rationale:** no verdict on code that changed underneath it (C001-US-104); stale verdicts themselves: C001-US-706. The decision status is the report of C001-REQ-711; asking for it is the developer's way to check the snapshot at any time. Accepted limit, decided by P-01 with Q-movedon-01 (`10-spec/questions-log.md` Round 17): on Windows, the edit that the WHILE state counts as matching the snapshot is missing from the moved-on notice; such an edit never reaches a snapshot or an evidence workspace (C001-IF-012 §7 item 5, §8 item 3). Clock-lag limit, on every system: where file times come from a clock behind the machine's by more than the margin of C001-IF-012 §8 item 3 allows (more than 1 s on FAT, about 3 s with sub-second time stamps), for example the server of a network share, a write that keeps the file's size, made in the same time-stamp step as the read that hashed the file, can be missing from the moved-on notice; this limit, too, concerns the moved-on notice only, not snapshots or evidence workspaces (C001-IF-012 §8 item 3). Edits that C001-REQ-127 keeps out of the change (Q-nonlfs-01, C001-IF-012 §7 item 8) are missing from the notice too, as they are from the change itself. Notice ERR-INTAKE-007 (`50-interfaces/errors.md`).
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

### C001-REQ-125 — Stop every command that reads the repository when git cannot be used
- **Pattern:** unwanted-behaviour
- **Statement:** IF the git program is not found or cannot be started, prints a version older than 2.34 or no readable version, or refuses to read the repository, THEN THE analysis core SHALL stop each command that reads the repository, with no further read of git data, no snapshot and no review created, and with an error message that names the cause and, when a git program was found, its path and the version text it printed.
- **Rationale:** every read of git data goes through the git access port, which runs the git program (C001-IF-012, C001-ADR-004); git 2.34 or later is a prerequisite (C001-CON-18). The check applies to intake and to every other command that reads git data, for example a command that records a verdict and reads the git user (C001-IF-012 G-10); it runs before the first git read of the command (C001-IF-012 §6). A version text from which no version number can be read counts as too old, because the analysis core cannot show that the prerequisite holds. Git refuses, for example, a repository owned by another user (its `safe.directory` ownership check) or a repository format that the installed git cannot read; the analysis core reports the refusal and does not override it (C001-ADR-004). A directory outside every git working tree, or a repository without a commit: C001-REQ-106. Constitution principle 4. Error ERR-INTAKE-008 (`50-interfaces/errors.md`).
- **Stories:** C001-US-101
- **Priority:** Must
- **Acceptance:** C001-AC-125.1

### C001-REQ-126 — Keep and report files under a clean filter compared by their working-tree bytes
- **Pattern:** event-driven
- **Statement:** WHEN intake finds one or more files under a clean filter that the base commit holds at the same path, whose working-tree bytes, read without running the filter, differ from the base commit's content at that path, and each of which is a Git LFS file that C001-REQ-128 does not read from a Git LFS pointer file, or a file under a clean filter other than a Git LFS file that is not up to date in the index, has no entry in git's index or has an index entry whose blob cannot be read from git's object database, THE analysis core SHALL list each of these files as a changed file and report notice ERR-INTAKE-009 with the number of these files, their filter drivers and up to 10 of their paths, each path with its cause: no matching Git LFS pointer file, not up to date in the index, no entry in git's index or an index blob that cannot be read.
- **Rationale:** Q-cleanfilter-01, Q-cleanfilter-02 (answer: LFS by hash + harden rest). C001-REQ-128 reads a Git LFS file from the Git LFS pointer file whose SHA-256 hash and size its working-tree bytes have; C001-REQ-127 reads every other file under a clean filter from its index blob when the file is up to date in the index and that blob can be read; this requirement covers every remaining file under a clean filter that the base commit holds, so the three requirements partition them. A remaining file under a clean filter that the base commit does not hold is an added file with its working-tree bytes, listed like every added file (C001-REQ-101, C001-IF-012 §7 item 3) and named in no notice (C001-IF-012 §7 item 4; CR-47). For such a file the content git would store is unknown unless the filter runs, and the analysis core runs no filter (C001-IF-012 §2 item 2, C001-CON-13): for example a Git LFS file whose new content the agent did not stage, so that its bytes match neither pointer file; or a file of another filter that was edited or touched since checkout or `git add`, has a racy index entry, differs from its index entry in a stat field that git's own settings ignore and the hardened test compares (glossary, up to date in the index), is no longer held by the index (for example after `git rm --cached`), or has an index entry that names a blob missing from the object database. The file is therefore compared by its working-tree bytes after git's built-in end-of-line conversion (C001-ADR-004). It stays in the change, as every difference does (C001-REQ-101), and the notice tells the developer why it can show as changed although git might store the same content. A binary working-tree content counts zero changed lines (C001-REQ-108). Rule: C001-IF-012 §7. Terms: clean filter, up to date in the index, Git LFS file, Git LFS pointer file (glossary). Notice ERR-INTAKE-009 (`50-interfaces/errors.md`).
- **Stories:** C001-US-101
- **Priority:** Should
- **Acceptance:** C001-AC-126.1

### C001-REQ-127 — Read a file under a clean filter other than Git LFS from the index when it is up to date there
- **Pattern:** event-driven
- **Statement:** WHEN intake finds a file under a clean filter, other than a Git LFS file, that is up to date in the index and whose index entry names a blob that can be read from git's object database, THE analysis core SHALL read the file's content from that blob instead of from its working-tree bytes.
- **Rationale:** Q-cleanfilter-01 (answer: index blob if up to date), hardened and limited to filters other than Git LFS by Q-cleanfilter-02 (answer: LFS by hash + harden rest); Git LFS files: C001-REQ-128. The blob that git's index records for a file is what git stores for the file as it was when git last recorded its stat data; while the file is up to date in the index, its stat data show no change since then, so that blob is what git would store now, and no filter runs (C001-IF-012 §2 item 2, C001-CON-13). A checked-out file of another filter that the agent left alone, for example a git-crypt file, is then unchanged instead of showing as changed in every review (C001-ADR-004, D-007), and a filtered file that the agent edited and staged with `git add` shows the change of its stored content. The test is stricter than git's own (CR-37): only the `.gitattributes` files of the base commit's tree put a file under a clean filter, so neither the change, `.git/info/attributes` nor `core.attributesFile` can place a source file under one, and every stat field that C001-IF-012 §7 names is compared whatever the repository's git configuration sets for git's own stat comparison, so no setting can switch off the field that reveals an in-place write; a file that fails the test is compared by its working-tree bytes (C001-REQ-126). A racy index entry makes the file not up to date in the index, so a same-second edit is never hidden. Residual limit, for files under a clean filter other than Git LFS, accepted by P-01 with Q-nonlfs-01, which widens the Windows-only limit that Q-cleanfilter-02 named: on every system, an index entry written or refreshed after an edit so that it records the edited file's stat data with a blob that does not hold the edit, for example the base commit's, makes the entry up to date, whether it is written into the index file directly or by git refreshing its index with another clean command for the file's filter driver (for example one given with `git -c` to `git update-index --refresh`); on Windows, an edit that keeps the file's size and sets its modification time back also leaves the stat data that git compares unchanged. In each case intake reads the index blob and the edit is not part of the change, while evidence workspaces receive the edited bytes (C001-REQ-527, C001-IF-012 §7 item 8). Git LFS files are not affected: their bytes are checked by hash (C001-REQ-128). Reading the index writes nothing (C001-REQ-120). Rule: C001-IF-012 §7. Other files under a clean filter, an up-to-date entry whose blob cannot be read included: C001-REQ-126. Terms: clean filter, up to date in the index (glossary).
- **Stories:** C001-US-101
- **Priority:** Should
- **Acceptance:** C001-AC-127.1

### C001-REQ-128 — Read a Git LFS file from the pointer file that its working-tree bytes match
- **Pattern:** event-driven
- **Statement:** WHEN intake finds a Git LFS file whose working-tree bytes have the SHA-256 hash and the size that a Git LFS pointer file names, where that pointer file is the file's blob in the base commit or the blob, readable from git's object database, that git's index records for its path, THE analysis core SHALL read the file's content from that pointer file, the base commit's when both qualify, instead of from its working-tree bytes.
- **Rationale:** Q-cleanfilter-02 (answer: LFS by hash + harden rest). A Git LFS pointer file names the SHA-256 hash and the size of the content it stands for, so working-tree bytes with that hash and size are content whose stored form is that pointer file, whatever git's index and the file's stat data record; the check trusts neither, and no filter runs (C001-IF-012 §2 item 2, C001-CON-13). A forged index entry or a modification time set back therefore cannot hide an edit of a Git LFS file (CR-37): edited content matches neither pointer file and is compared by its working-tree bytes (C001-REQ-126). A checked-out Git LFS file that the agent left alone matches the base commit's pointer file and is unchanged instead of showing as changed in every review (D-007); new content that the agent staged with `git add` matches the pointer file that git's index records, so the file shows the change of its pointer file. A blob that is not a Git LFS pointer file, for example the content of a file committed before the repository tracked it with Git LFS, names no hash, and the file falls under C001-REQ-126. The cost that P-01 accepted with this answer: intake reads and hashes the working-tree bytes of every Git LFS file it finds, time that counts toward intake (C001-NFR-001). Reading the index and the object database writes nothing (C001-REQ-120). Rule: C001-IF-012 §7. Other files under a clean filter: C001-REQ-126, C001-REQ-127. Terms: Git LFS file, Git LFS pointer file, stored form (glossary).
- **Stories:** C001-US-101
- **Priority:** Should
- **Acceptance:** C001-AC-128.1
