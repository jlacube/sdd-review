// Transcribed from the error catalogue of 10-spec/50-interfaces/errors.md (C001-IF-001, C001-IF-002).
// The unit test test/unit/errors/catalogue.test.ts fails on any difference.

export type ErrorKind = 'error' | 'notice';

export interface ErrorEntry {
  readonly code: string;
  readonly kind: ErrorKind;
  /** CLI exit code, or null when the CLI cannot raise the code. */
  readonly exitCode: number | null;
  /** HTTP status, or null when the UI server cannot raise the code. */
  readonly httpStatus: number | null;
  /** A notice answered with status 200 and a notice member. */
  readonly withNotice: boolean;
  readonly message: string;
  readonly fix: string;
  readonly spec: string;
  readonly condition: string;
}

export const ERROR_CATALOGUE: readonly ErrorEntry[] = [
  {
    code: 'ERR-INTAKE-001',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message: 'Cannot review "<directory>": it is not inside a git working tree.',
    fix: 'Run the command inside the repository or pass `--repo`',
    spec: 'C001-REQ-106',
    condition: 'The directory is outside every git working tree',
  },
  {
    code: 'ERR-INTAKE-002',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message: 'Cannot review "<directory>": the repository has no commit yet.',
    fix: 'Commit a first version, then start the review',
    spec: 'C001-REQ-106',
    condition: 'The repository has no commit',
  },
  {
    code: 'ERR-INTAKE-003',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message: '"<value>" does not name a commit of this repository.',
    fix: 'Name a commit hash, branch or tag',
    spec: 'C001-REQ-105',
    condition:
      'The named value does not resolve to one commit, or has the shape of a command option',
  },
  {
    code: 'ERR-INTAKE-004',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message: '"<value>" has no common ancestor with HEAD.',
    fix: 'Name a commit of the history of HEAD',
    spec: 'C001-REQ-105',
    condition: 'The named commit has no merge base with HEAD',
  },
  {
    code: 'ERR-INTAKE-005',
    kind: 'error',
    exitCode: 4,
    httpStatus: null,
    withNotice: false,
    message:
      'The change is empty: the working tree matches base commit <hash>. No review was created.',
    fix: 'Name another base commit with `--base`',
    spec: 'C001-REQ-107',
    condition: 'The change holds no difference',
  },
  {
    code: 'ERR-INTAKE-006',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'This change has <lines> changed lines in <files> files; the supported size is 10,000 changed lines and 300 files. Results and response times may fall outside the stated limits.',
    fix: 'None needed; split the change for results within the limits',
    spec: 'C001-REQ-121',
    condition: 'The change exceeds the supported size',
  },
  {
    code: 'ERR-INTAKE-007',
    kind: 'notice',
    exitCode: 0,
    httpStatus: 200,
    withNotice: true,
    message:
      'The working tree has moved on since snapshot <snapshot-id>: <n> files differ (<list>)<; HEAD moved from <hash> to <hash>>. This review still shows the snapshot.',
    fix: 'Start a new review to review the current state',
    spec: 'C001-REQ-117',
    condition: 'The working tree or HEAD no longer matches the snapshot',
  },
  {
    code: 'ERR-INTAKE-008',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message:
      'Cannot read the repository at "<directory>" with git: <the git program was not found on PATH / the git program at "<git path>" could not be started (<operating system\'s reason>) / git at "<git path>" printed no readable version ("<printed text>"); version 2.34 or later is required / git <version> at "<git path>" is older than 2.34, the oldest supported version / git <version> at "<git path>" refused to open the repository (<git\'s message>)>.',
    fix: 'Install git 2.34 or later and put it on `PATH`; if the program at the named path cannot be started or prints no version, repair or replace it, or put a working git earlier on `PATH`; for a repository that another user owns, run the command as that user or, if you trust the repository, add it with `git config --global --add safe.directory "<directory>"`; for an unknown repository format, install a git release that supports it',
    spec: 'C001-REQ-125',
    condition:
      'The git program cannot be used for the repository, for one of the causes of C001-IF-012 §6: no `git` program is found on `PATH`; the one found cannot be started; `git --version` prints no readable version; the version it prints is older than 2.34; or git finds the repository but refuses to open it, for example because another user owns it and `safe.directory` does not list it, or because its repository format or an extension is unknown to this git. Checked before the first git read of every command that reads git data; nothing is read or created',
  },
  {
    code: 'ERR-INTAKE-009',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      "<n> files under a clean filter (<filter drivers>) are listed as changed by their working-tree bytes, because the review assistant does not run the filter and neither a Git LFS pointer file nor git's index gives the content git stores for them; git may store the same content for some of them (<up to 10 entries: <path> (<content matches no Git LFS pointer file / not up to date in git's index / no entry in git's index / index blob missing>)>).",
    fix: "None needed. For a Git LFS file whose content matches no pointer file, stage it with `git add` if its new content belongs to the change. For a file not up to date in git's index, run `git status`, which runs the filter and records the file again in git's index; if the file is still listed, change its modification time first (for example with `touch`) and run `git status` again. For a file with no entry in git's index, stage it with `git add` if it belongs to the change; for a missing index blob, run `git fsck` and stage the file again with `git add` to restore the blob. Then start a new review to compare these files by the content git stores",
    spec: 'C001-REQ-126',
    condition:
      "Intake lists as changed one or more files under a clean filter (the `filter` attribute taken from the `.gitattributes` files of the base commit's tree only, C001-IF-012 §7) that it compares by their working-tree bytes (C001-IF-012 §7 item 3), and whose bytes, read without running the filter, differ from the content that the base commit holds at the same path (C001-IF-012 §7 item 4; Q-cleanfilter-01, Q-cleanfilter-02). The cause of each file: a Git LFS file whose working-tree bytes have neither the SHA-256 hash and size that the Git LFS pointer file of the base side names nor those of the pointer file that git's index records, or whose blobs are not Git LFS pointer files (C001-IF-012 §7 item 7); a file under another filter that is not up to date in the index under the test of C001-IF-012 §7 item 1, which compares every stat field it names whatever `core.checkStat` and `core.trustctime` say, that has no index entry, or whose up-to-date index entry names a blob that cannot be read from the object database. Git LFS files whose bytes match a pointer file (C001-REQ-128), and files under another filter that are up to date in the index with a readable index blob (C001-REQ-127), raise no notice",
  },
  {
    code: 'ERR-CTX-001',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message: 'Cannot use "<file>" as <role>: the file does not exist.',
    fix: 'Correct the path',
    spec: 'C001-REQ-113',
    condition: 'A named intent-context file does not exist',
  },
  {
    code: 'ERR-CTX-002',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message: 'Cannot use "<file>" as <role>: the file cannot be read (<cause>).',
    fix: 'Grant read access or name another file',
    spec: 'C001-REQ-113',
    condition: 'A named intent-context file cannot be read',
  },
  {
    code: 'ERR-CTX-003',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message: 'Cannot use "<file>" as <role>: the file is not a Markdown or plain-text file.',
    fix: 'Export the plan or transcript as Markdown or plain text',
    spec: 'C001-REQ-113',
    condition: 'A named intent-context file is not Markdown or plain text (C001-IF-007 §7)',
  },
  {
    code: 'ERR-SDD-001',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message:
      'The SDD workspace holds <n> open SDD changes: <id list>. Name the one to review with `--sdd-change`.',
    fix: 'Name one SDD change',
    spec: 'C001-REQ-304',
    condition: 'More than one open SDD change and none named',
  },
  {
    code: 'ERR-SDD-002',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message:
      'No open SDD change "<value>" in the SDD workspace of the snapshot. Open SDD changes: <id list, or "none">.',
    fix: 'Name one of the open SDD changes listed',
    spec: 'C001-REQ-326',
    condition:
      'The SDD change named at intake is not an open SDD change of the SDD workspace in the snapshot: no open change matches the value (C001-IF-007 §6), or the matching change is archived',
  },
  {
    code: 'ERR-SDD-003',
    kind: 'error',
    exitCode: 3,
    httpStatus: null,
    withNotice: false,
    message:
      'The neutral intent-and-architecture file "<path>" is invalid at line <n> (<JSON pointer>): <reason>.',
    fix: 'Correct the file or the tool that produced it',
    spec: 'C001-REQ-124',
    condition:
      'The neutral intent-and-architecture file of the snapshot does not validate against C001-IF-006',
  },
  {
    code: 'ERR-SDD-004',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'The architecture in "<path>" gives no component paths, so it is not used as the documented architecture: components are derived from the repository\'s structure and drift is not checked.',
    fix: 'Add `Paths` to the component entries',
    spec: 'C001-REQ-223',
    condition:
      'The architecture held in the `.sdd/` format or in the neutral file gives a path pattern for none of its components (C001-IF-007 §4)',
  },
  {
    code: 'ERR-SDD-005',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message: 'Skipped <entry kind> in "<file>" line <n>: <reason>.',
    fix: 'Correct the entry',
    spec: 'C001-REQ-123',
    condition:
      'An entry of the `.sdd/` workspace (change folder, spec item or component) has the form of such an entry but cannot be read under C001-IF-007 §2 to §4; the entry is left out of the intent context',
  },
  {
    code: 'ERR-ARCH-001',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Package changes of "<manifest>" were not analysed: the manifest cannot be parsed <at base commit <hash> / in the snapshot> (<parse error>).',
    fix: 'Correct the manifest; its hunks stay open in the guarded area in any case',
    spec: 'C001-REQ-224',
    condition:
      'A package manifest of C001-REQ-205 that the change edits cannot be parsed at the base commit or in the snapshot; its package changes are labelled not analysed',
  },
  {
    code: 'ERR-CFG-001',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'The review configuration "<path>" at base commit <hash> cannot be read: <cause>. No hunk is cleared and no model provider is used in this review.',
    fix: 'Fix the configuration in a commit that becomes the base of later reviews',
    spec: 'C001-REQ-427, C001-REQ-819',
    condition:
      'The review configuration of the base commit cannot be read or does not validate against C001-IF-004, including one that names a provider API other than `openai-chat` and `anthropic-messages`',
  },
  {
    code: 'ERR-CFG-002',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Ignored setting "<JSON pointer>": built-in guarded areas cannot be removed or narrowed.',
    fix: 'Remove the setting',
    spec: 'C001-REQ-425',
    condition: 'A setting removes or narrows a built-in guarded area',
  },
  {
    code: 'ERR-CFG-003',
    kind: 'error',
    exitCode: 10,
    httpStatus: null,
    withNotice: false,
    message: '"<path>" is not a valid review configuration: <JSON pointer>: <reason>.',
    fix: 'Correct the file',
    spec: 'C001-REQ-427',
    condition: '`config validate` finds the file invalid',
  },
  {
    code: 'ERR-CFG-004',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'The review configuration "<path>" at base commit <hash> cannot be read: credential-store service "<service>" is outside the names the review assistant accepts ("sdd-review" and names beginning with "sdd-review/"). No hunk is cleared and no model provider is used in this review.',
    fix: 'Name the service `sdd-review` or `sdd-review/<name>`, store the key in that entry, and fix the configuration in a commit that becomes the base of later reviews',
    spec: 'C001-REQ-820',
    condition:
      'The review configuration of the base commit names a credential-store service (`model.provider.keyCredential.service`, C001-IF-004) that is neither `sdd-review` nor a name beginning with `sdd-review/` (`README.md` §2); the configuration is treated as one that cannot be read, as for ERR-CFG-001, and this code is reported in place of ERR-CFG-001. `config validate` reports such a file with ERR-CFG-003',
  },
  {
    code: 'ERR-MODEL-001',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" was not used: its endpoint "<host>" is not on this machine and the cloud opt-in setting is missing. <n> items were produced in model-free mode.',
    fix: 'Add the cloud opt-in setting, or give a local endpoint (`localhost`, 127.0.0.1, [::1] or a local socket)',
    spec: 'C001-REQ-806, C001-REQ-817',
    condition:
      'The provider endpoint is non-local (C001-IF-010 §6: neither a local socket, nor an IP literal in 127.0.0.0/8 or ::1, nor the host name `localhost`) and the cloud opt-in setting is missing',
  },
  {
    code: 'ERR-MODEL-002',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" was not used for <n> items on model-excluded paths; they were produced in model-free mode.',
    fix: 'None needed',
    spec: 'C001-REQ-815, C001-REQ-817',
    condition: 'Content lies on a model-excluded path',
  },
  {
    code: 'ERR-MODEL-003',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" is unreachable (<cause>). <n> items were produced in model-free mode.',
    fix: 'Start the local runtime or check the endpoint',
    spec: 'C001-REQ-816, C001-REQ-817',
    condition:
      'The provider endpoint cannot be reached: connection refused or failed, TLS failure, or the connection closes before an HTTP status line',
  },
  {
    code: 'ERR-MODEL-004',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" did not answer within <s> s. <n> items were produced in model-free mode.',
    fix: 'Raise the provider timeout or use a faster model',
    spec: 'C001-REQ-816, C001-REQ-817',
    condition: 'The provider does not answer within the provider timeout',
  },
  {
    code: 'ERR-MODEL-005',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" returned unusable output (<reason>). <n> items were produced in model-free mode.',
    fix: 'Use a model that follows structured output',
    spec: 'C001-REQ-816, C001-REQ-817',
    condition:
      'An HTTP 200 answer does not match the response format of its provider API or C001-IF-011',
  },
  {
    code: 'ERR-MODEL-006',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" was not used: no key found in <environment variable "<keyEnv>" or credential-store entry "<service>/<account>">. <n> items were produced in model-free mode.',
    fix: 'Set the environment variable or store the key in the credential-store entry',
    spec: 'C001-REQ-809, C001-REQ-816, C001-REQ-817',
    condition:
      'The provider needs a key (C001-IF-010 §7) and neither the environment variable nor the credential-store entry holds one; no request is sent',
  },
  {
    code: 'ERR-MODEL-007',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" rejected the key (HTTP <status>). <n> items were produced in model-free mode.',
    fix: 'Replace the key, or grant it access to model "<model>"',
    spec: 'C001-REQ-816, C001-REQ-817',
    condition: 'The provider answers HTTP 401 or 403: the key is rejected or lacks permission',
  },
  {
    code: 'ERR-MODEL-008',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" refused the request: rate or quota limit reached (HTTP 429). <n> items were produced in model-free mode.',
    fix: 'Wait until the limit resets, or raise the limit with the provider',
    spec: 'C001-REQ-816, C001-REQ-817',
    condition: 'The provider answers HTTP 429: rate or quota limit reached',
  },
  {
    code: 'ERR-MODEL-009',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" failed with a server error (HTTP <status>). <n> items were produced in model-free mode.',
    fix: "Check the provider's status or the local runtime's log",
    spec: 'C001-REQ-816, C001-REQ-817',
    condition: 'The provider answers an HTTP status from 500 to 599',
  },
  {
    code: 'ERR-MODEL-010',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" refused the request (HTTP <status>). <n> items were produced in model-free mode.',
    fix: 'Check the endpoint, the model name, `maxRequestBytes` and `maxOutputTokens`',
    spec: 'C001-REQ-816, C001-REQ-817',
    condition:
      'The provider answers any other HTTP status than 200, 401, 403, 429 or 500 to 599 (for example 400, 404, 413)',
  },
  {
    code: 'ERR-MODEL-011',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Model provider "<name>" linked <n> hunks to intents this review does not hold; those hunks stay in orphan code with a reduced grouping.',
    fix: 'None needed; move the hunks if they belong to an intent',
    spec: 'C001-REQ-327, C001-REQ-817',
    condition:
      'A hunk-linking answer names, for a hunk, an intent ID that the intent map of the snapshot does not hold; that hunk gets no model link, and the other links of the answer are kept',
  },
  {
    code: 'ERR-EVID-001',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message: 'No test evidence: no test command was given and the review configuration sets none.',
    fix: 'Pass `--test-command` or set `tests.command`',
    spec: 'C001-REQ-508',
    condition: 'No test command is known for the review',
  },
  {
    code: 'ERR-EVID-002',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message: 'No test evidence: the test command "<command>" could not start (<cause>).',
    fix: 'Correct the command, or free disk space for the evidence workspace',
    spec: 'C001-REQ-508',
    condition:
      'The test command fails to start, or no evidence workspace can be prepared for it (C001-IF-013 §2)',
  },
  {
    code: 'ERR-EVID-003',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message: 'No test evidence: "<command>" ended with status <code> and reported no test results.',
    fix: 'Check that the command runs the tests of a deep ecosystem or writes a coverage report',
    spec: 'C001-REQ-508',
    condition: 'The test command ends without reporting test results',
  },
  {
    code: 'ERR-EVID-004',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message: 'No test evidence: the test run was cancelled.',
    fix: 'Re-run the analysis to produce test evidence',
    spec: 'C001-REQ-508',
    condition: 'The developer cancels the test run',
  },
  {
    code: 'ERR-EVID-005',
    kind: 'notice',
    exitCode: 0,
    httpStatus: 200,
    withNotice: true,
    message:
      'Results of "<command>" were not recorded: the run changed <n> files of snapshot <snapshot-id> in its evidence workspace (<list>).',
    fix: "Make the command leave the repository's files unchanged, for example run the tests without updating stored test snapshots",
    spec: 'C001-REQ-509',
    condition:
      "A test run or bundle command ran on files that differ from the snapshot: the workspace check of C001-IF-013 §3 finds, in its evidence workspace, a file of the snapshot changed or removed, or a file added that the snapshot's ignore rules do not exclude; edits of the working tree never raise it (C001-REQ-522)",
  },
  {
    code: 'ERR-EVID-006',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message: 'Mutation evidence unavailable for <path>:<line> (<reason>).',
    fix: 'Install the mutation tool of the ecosystem; if the copy failed, free disk space for the mutation workspace',
    spec: 'C001-REQ-516',
    condition:
      "Mutation testing cannot run or does not complete for a hunk, including when the copy of the test run's workspace that mutation testing takes cannot be made (C001-IF-013 §2 item 3); a hunk of a file loaded outside the mutation workspace raises ERR-EVID-011 instead",
  },
  {
    code: 'ERR-EVID-007',
    kind: 'error',
    exitCode: null,
    httpStatus: 409,
    withNotice: false,
    message: '"<command>" was proposed from <source> and has not been confirmed; it was not run.',
    fix: 'Confirm the command first',
    spec: 'C001-REQ-511',
    condition: 'A run is requested for a proposed bundle command that is not confirmed',
  },
  {
    code: 'ERR-EVID-008',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Execution of <n> files outside the evidence workspace was not counted for "<command>" (<up to 10 paths>): they were loaded from the working tree, not from snapshot <snapshot-id>.',
    fix: 'Make the test command load the project from its working directory, for example without a package link or an absolute path that points at the working tree, and without starting Python with `-I` or `-E`',
    spec: 'C001-REQ-506, C001-REQ-509',
    condition:
      'A test run reports execution of files under the working-tree root whose relative paths are files of the snapshot, instead of the evidence workspace (C001-IF-013 §4 item 2); that execution counts for no hunk and the rest of the run is kept',
  },
  {
    code: 'ERR-EVID-009',
    kind: 'notice',
    exitCode: 0,
    httpStatus: 200,
    withNotice: true,
    message:
      'While "<command>" ran, <n> paths of the working tree or the repository changed (<up to 10 paths>). The review assistant wrote none of them; the run may have written them through project code that addresses the working tree (for example an absolute path or a package link), or another program changed them.',
    fix: 'Check the listed paths; make the command load and write the project only below its working directory, for example without a package link or an absolute path that points at the working tree',
    spec: 'C001-REQ-523',
    condition:
      "While a test run, a mutation run or a bundle command was running, a path under the working-tree root outside the git directory (ignored paths included) or the index, `HEAD`, `packed-refs` or a ref of the repository was created, changed or removed (C001-IF-013 §9 item 3); the run's results are kept or discarded by the workspace check alone. Raised only when at least one such path changed; an incomplete observation alone raises ERR-EVID-010, never this notice",
  },
  {
    code: 'ERR-EVID-010',
    kind: 'notice',
    exitCode: 0,
    httpStatus: 200,
    withNotice: true,
    message:
      'While "<command>" ran, part of the working tree or the repository was not fully observed: <for each cause: <cause>: <n> paths (<up to 10 paths>) / the whole working tree / the repository\'s index and refs>. Changes there during the run may be missing from the list of changed paths.',
    fix: 'Check the listed paths; for "not readable", grant read access; for "watch limit", raise the operating system\'s watch limit; for "events lost", run the command again with less other file activity in the working tree; for "observation interrupted", keep the working-tree root and the git directory in place during the run',
    spec: 'C001-REQ-524',
    condition:
      "While a test run, a mutation run or a bundle command was running, part of the observed scope of C001-IF-013 §9 item 3 was not observed for the whole run, for one or more causes of §9 item 4 (not readable, watch limit, events lost, observation interrupted); one notice per run, with each cause apart; raised whether or not a path changed, and separate from ERR-EVID-009, which a run can raise as well; the run's results are kept or discarded by the workspace check alone",
  },
  {
    code: 'ERR-EVID-011',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message:
      'Mutation evidence unavailable for <n> files (<up to 10 paths, each with the place it was loaded from>): the tests of mutation testing loaded them from <another evidence workspace / the working tree>, not from the mutation workspace, so their mutants could not be tested.',
    fix: 'Make the project load and build its own files relative to its working directory, for example without a package link, an absolute path in its configuration or build outputs, or an environment variable that names another directory of the project',
    spec: 'C001-REQ-516',
    condition:
      "The self-containment check of mutation testing (C001-IF-013 §5 item 4) reports execution of files under another evidence workspace of the snapshot or under the working-tree root whose relative paths are files of the snapshot, instead of the mutation workspace; no mutant of those files counts as killed or surviving, their hunks' mutation evidence is recorded unavailable, and mutation testing of the other files goes on",
  },
  {
    code: 'ERR-EVID-012',
    kind: 'notice',
    exitCode: 0,
    httpStatus: 200,
    withNotice: true,
    message:
      'Submodule files missing for "<command>": <n> submodules are empty in its evidence workspace because their recorded commits cannot be read on this machine (<up to 10 entries: <path> at <commit hash> (<no local repository / commit not in its repository / repository refused by git: <git\'s message>>)>). Results that need these files may differ from a checkout with the submodules.',
    fix: 'Run `git submodule update --init --recursive` to fetch the recorded commits, then run the command again; for a submodule repository that git refuses, apply the fix of ERR-INTAKE-008 to that repository',
    spec: 'C001-REQ-526',
    condition:
      "The commit that the snapshot records for a submodule, at any depth of nesting, cannot be read on the local machine through the git access port (C001-IF-012 G-16): the submodule has no local repository, its repository lacks the commit, or git refuses to open its repository; so the submodule's path is an empty directory in the evidence workspace of a test run, mutation run or bundle command (C001-IF-013 §2 item 8); the run goes on, nothing is fetched, and the run's results are kept or discarded by the workspace check alone",
  },
  {
    code: 'ERR-EVID-013',
    kind: 'notice',
    exitCode: 0,
    httpStatus: 200,
    withNotice: true,
    message:
      'Filtered files in their stored form for "<command>": <n> files under a clean filter hold the content git stores (for Git LFS a pointer file) instead of their checked-out content in its evidence workspace (<up to 10 entries: <path> (<filter driver>: <content differs from its Git LFS pointer file / not up to date in git\'s index / another blob in git\'s index / changed during the copy / unreadable / not in the working tree>)>). Results that read these files may differ from a run in the working tree.',
    fix: "For a Git LFS file whose content differs from its pointer file: if its content was never downloaded, check it out with Git LFS (for example `git lfs pull`); if it was edited since the snapshot, start a review of the current state. For a file under another filter: if it was only touched, run `git status` so that git's index records it as up to date again (if it stays listed, change its modification time first, for example with `touch`), then run the command again; if it was edited or staged again since the snapshot, start a review of the current state to test its new content. For a file not in the working tree: for a path outside a sparse checkout whose checked-out content the run needs, add its directory with `git sparse-checkout add <directory>` and run the command again; for a file deleted since the snapshot, start a review of the current state",
    spec: 'C001-REQ-528',
    condition:
      "The evidence workspace of a test run, mutation run or bundle command holds the stored form of one or more files under a clean filter whose snapshot side is a blob that git stores (for Git LFS a Git LFS pointer file, for git-crypt the encrypted content), because when the workspace was filled or the file was written again: for a Git LFS file, the SHA-256 hash or the size of its copy in the workspace differed from those that its pointer file names (C001-REQ-529), for example after an edit since the snapshot, or when its content was never downloaded and the working tree holds the pointer file itself; for a file under another filter, it was not up to date in the index under the test of C001-IF-012 §7 item 1, its index entry recorded another blob than its snapshot side, or its stat data changed during the copy (C001-REQ-527); or the file could not be read, or the working tree held no file at its path, for example a path outside a sparse checkout (C001-IF-012 §8 item 2) (C001-IF-013 §2 item 1; Q-filterworkspace-01, Q-cleanfilter-02); one notice per run; no filter runs, nothing is fetched, and the run's results are kept or discarded by the workspace check alone",
  },
  {
    code: 'ERR-ACT-001',
    kind: 'error',
    exitCode: 6,
    httpStatus: 400,
    withNotice: false,
    message:
      'A <reason / note / text / command / name> is required: it must contain a character other than whitespace.',
    fix: 'Enter the text',
    spec: 'C001-REQ-706, C001-REQ-719',
    condition:
      'A reject or defer verdict, an orphan-hunk rejection, a defect report, a bundle command or a new intent is given with a reason, note, text, command or name that is empty or contains only whitespace',
  },
  {
    code: 'ERR-ACT-002',
    kind: 'error',
    exitCode: 6,
    httpStatus: 409,
    withNotice: false,
    message:
      'Intent <id> has <n> open hunks with <m> changed lines not read. Confirm to sign anyway.',
    fix: 'Confirm the prompt, or pass `--confirm-open-hunks <n>`',
    spec: 'C001-REQ-703',
    condition: 'Sign on an intent with open hunks, not confirmed',
  },
  {
    code: 'ERR-ACT-003',
    kind: 'error',
    exitCode: 6,
    httpStatus: 400,
    withNotice: false,
    message: 'A sign action must name exactly one intent.',
    fix: 'Name one intent',
    spec: 'C001-REQ-702',
    condition: 'A sign action names no intent or more than one',
  },
  {
    code: 'ERR-ACT-004',
    kind: 'error',
    exitCode: 5,
    httpStatus: 404,
    withNotice: false,
    message: 'No <kind> "<value>" in review <snapshot-id>.',
    fix: 'Use an ID listed by `intents` or shown in the UI',
    spec: 'C001-REQ-916',
    condition:
      'An intent, hunk or command ID is unknown in the review, or an ID prefix is ambiguous',
  },
  {
    code: 'ERR-ACT-005',
    kind: 'error',
    exitCode: null,
    httpStatus: 409,
    withNotice: false,
    message:
      'Hunk <id> is grouped under intent <intent-id> ("<title>"), not in orphan code. Nothing was recorded.',
    fix: 'Move the hunk to orphan code first, or decide it through the verdict on its intent',
    spec: 'C001-REQ-709, C001-REQ-710, C001-REQ-720',
    condition:
      'The developer rejects as orphan code, or creates an intent for, a hunk that is grouped under an intent; the first such hunk is named',
  },
  {
    code: 'ERR-ACT-006',
    kind: 'error',
    exitCode: 6,
    httpStatus: 409,
    withNotice: false,
    message: 'Not recorded: git <user.name and/or user.email> is not set for this repository.',
    fix: 'Run `git config user.name "<name>"` and `git config user.email "<e-mail>"`, then repeat the action',
    spec: 'C001-REQ-712, C001-REQ-721',
    condition:
      "One of the ten recorded actions of C001-IF-003 §4 (read mark, hunk reopen, hunk move, intent creation, orphan-hunk rejection, test judgement, defect report, attention budget, bundle command added or confirmed, verdict) is requested while `user.name` or `user.email` of the repository's effective git configuration is not set, empty or whitespace only (C001-IF-012 G-10); checked after the input checks of the action and before the open-hunk confirmation",
  },
  {
    code: 'ERR-ACT-007',
    kind: 'error',
    exitCode: null,
    httpStatus: 409,
    withNotice: false,
    message: 'Intent <id> has no test hunks, so there are no tests to judge. Nothing was recorded.',
    fix: "None needed; the intent's hunks clear only on tests that execute no changed test line",
    spec: 'C001-REQ-520',
    condition: 'A test judgement is recorded for an intent under which no test hunk is grouped',
  },
  {
    code: 'ERR-ACT-008',
    kind: 'error',
    exitCode: null,
    httpStatus: 400,
    withNotice: false,
    message:
      '"<value>" is not a valid <time budget / reading rate>: give a number greater than zero<, in minutes / in changed lines per hour>.',
    fix: 'Enter a number greater than zero',
    spec: 'C001-REQ-615',
    condition:
      'A time budget or reading rate is stated that is not a number greater than zero; the time budget and the reading rate in effect stay unchanged',
  },
  {
    code: 'ERR-ACT-009',
    kind: 'error',
    exitCode: null,
    httpStatus: 409,
    withNotice: false,
    message:
      'The name "<name>" is already used by intent <intent-id> ("<name of that intent as typed>") in this review. Nothing was recorded.',
    fix: 'Choose another name, or move the hunks to intent <intent-id>',
    spec: 'C001-REQ-719',
    condition:
      'A new intent is named with a name whose normalised form (whitespace collapsing, then Unicode case folding, `40-domain/domain-model.md` §3) equals that of another developer-named intent of the review',
  },
  {
    code: 'ERR-STORE-001',
    kind: 'error',
    exitCode: 8,
    httpStatus: 503,
    withNotice: false,
    message: 'The action was not saved: <cause>. Nothing was recorded.',
    fix: 'Free disk space or fix permissions of the review state store, then repeat the action',
    spec: 'C001-REQ-920',
    condition: 'A review action cannot be saved to persistent storage',
  },
  {
    code: 'ERR-STORE-002',
    kind: 'error',
    exitCode: 8,
    httpStatus: 500,
    withNotice: false,
    message:
      'The review record of snapshot <snapshot-id> is damaged at line <n>; no entry is written until it is restored.',
    fix: 'Restore the record from a backup',
    spec: 'C001-REQ-713',
    condition:
      'A review record line other than an unfinished last line fails to parse, or its previous-line hash does not match',
  },
  {
    code: 'ERR-STORE-003',
    kind: 'error',
    exitCode: 8,
    httpStatus: 503,
    withNotice: false,
    message: 'The review record is busy; the action was not saved.',
    fix: 'Repeat the action',
    spec: 'C001-REQ-917',
    condition: 'The record lock is not obtained within 10 s',
  },
  {
    code: 'ERR-STORE-004',
    kind: 'error',
    exitCode: 5,
    httpStatus: 404,
    withNotice: false,
    message: 'No review of snapshot "<value>" in this repository.',
    fix: 'List reviews with `reviews`',
    spec: 'C001-REQ-918',
    condition: 'No review exists for the given snapshot ID',
  },
  {
    code: 'ERR-UI-001',
    kind: 'error',
    exitCode: null,
    httpStatus: 403,
    withNotice: false,
    message: 'Request refused.',
    fix: 'Open the address the CLI printed',
    spec: 'C001-REQ-906',
    condition:
      "A request names a host other than 127.0.0.1, [::1] or localhost with the server's port",
  },
  {
    code: 'ERR-UI-002',
    kind: 'error',
    exitCode: null,
    httpStatus: 403,
    withNotice: false,
    message: 'Request refused.',
    fix: 'Use the page served by the review',
    spec: 'C001-REQ-907',
    condition:
      'A request lacks the review token, or its Origin or Sec-Fetch-Site shows another origin',
  },
  {
    code: 'ERR-UI-003',
    kind: 'notice',
    exitCode: 0,
    httpStatus: null,
    withNotice: false,
    message: 'No web browser could be opened. The review is served at <address>.',
    fix: 'Open the address manually',
    spec: 'C001-REQ-902',
    condition: 'The CLI cannot open a web browser',
  },
  {
    code: 'ERR-UI-004',
    kind: 'error',
    exitCode: 9,
    httpStatus: null,
    withNotice: false,
    message: 'Cannot serve the review on 127.0.0.1:<port> (<cause>).',
    fix: 'Pass another `--port`, or use the CLI commands',
    spec: 'C001-REQ-905',
    condition: 'The UI server cannot listen on a loopback address',
  },
  {
    code: 'ERR-CLI-001',
    kind: 'error',
    exitCode: 2,
    httpStatus: null,
    withNotice: false,
    message: '<detail>. Run `sdd-review --help`.',
    fix: 'Correct the command line',
    spec: 'C001-REQ-914',
    condition: 'Unknown command, unknown option or missing argument',
  },
  {
    code: 'ERR-CLI-002',
    kind: 'error',
    exitCode: 7,
    httpStatus: null,
    withNotice: false,
    message: 'Cannot write results to "<directory>" (<cause>).',
    fix: 'Name a writable directory',
    spec: 'C001-REQ-912',
    condition: 'The output directory of a headless run cannot be written',
  },
  {
    code: 'ERR-CLI-003',
    kind: 'error',
    exitCode: 1,
    httpStatus: 500,
    withNotice: false,
    message: 'Internal error in <operation>: <cause>. The review state is unchanged.',
    fix: 'Report the logged context',
    spec: 'C001-REQ-914',
    condition: 'An unexpected internal error',
  },
];

const BY_CODE = new Map(ERROR_CATALOGUE.map((e) => [e.code, e]));

export function lookupError(code: string): ErrorEntry {
  const entry = BY_CODE.get(code);
  if (!entry) throw new Error(`unknown error code ${code}`);
  return entry;
}
