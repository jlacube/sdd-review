import type {
  BaseChoice,
  BaseRef,
  CommitRef,
  IntakeSummary,
  NamedFile,
  Notice,
} from '../../generated/analysis-results.js';
import type { EffectiveConfiguration } from '../config/effective.js';

/**
 * The intake summary (C001-REQ-114, C001-IF-008 `IntakeSummary`, C001-T-033): the base commit with
 * the rule and branch that chose it, the counts of changed files and changed lines, the intent
 * context found, the test command that will run on the snapshot with where it comes from, and the
 * size warning (C001-REQ-121). Built from the parts of the intake document, so that the CLI and the
 * UI show the same facts (C001-IF-001 Output, C001-IF-002 `getIntakeSummary`).
 */

export interface SummaryParts {
  readonly baseCommit: CommitRef;
  readonly baseChoice: BaseChoice;
  readonly baseRef?: BaseRef;
  readonly changedFiles: number;
  readonly changedLines: number;
  readonly sddChanges: IntakeSummary['intentContext']['sddChanges'];
  readonly documentedArchitecture: IntakeSummary['intentContext']['documentedArchitecture'];
  readonly commits: number;
  readonly namedFiles: readonly Pick<NamedFile, 'role' | 'path'>[];
  readonly testCommand: IntakeSummary['testCommand'];
  readonly sizeWarning: Notice | null;
}

export function buildIntakeSummary(parts: SummaryParts): IntakeSummary {
  return {
    baseCommit: parts.baseCommit,
    baseChoice: parts.baseChoice,
    ...(parts.baseRef !== undefined ? { baseRef: parts.baseRef } : {}),
    testCommand: parts.testCommand ?? null,
    changedFiles: parts.changedFiles,
    changedLines: parts.changedLines,
    intentContext: {
      sddChanges: parts.sddChanges.map(({ id, specItems, selected }) => ({
        id,
        specItems,
        selected,
      })),
      commits: parts.commits,
      namedFiles: parts.namedFiles.map(({ role, path }) => ({ role, path })),
      documentedArchitecture: parts.documentedArchitecture,
    },
    sizeWarning: parts.sizeWarning,
  } as IntakeSummary;
}

/**
 * The test command that C001-REQ-505 will run on the snapshot (C001-REQ-114): the one the developer
 * gave for the review (`--test-command`), else the one of the review configuration of the base
 * commit (C001-REQ-426), else none. An unreadable configuration names no command: the review then
 * runs without the configuration's settings (C001-REQ-819).
 */
export function testCommandOf(
  given: string | undefined,
  configuration: EffectiveConfiguration,
): IntakeSummary['testCommand'] {
  if (given !== undefined && given.trim().length > 0) {
    return { command: given, origin: 'developer' };
  }
  const configured = configuration.readable ? configuration.settings.tests.command : null;
  return configured ? { command: configured, origin: 'configuration' } : null;
}

/**
 * True when the base commit is HEAD itself, however it was chosen (C001-REQ-114): the review then
 * covers the uncommitted edits only, and the summary warns that another base commit can be named.
 */
export function baseIsHead(
  summary: Pick<IntakeSummary, 'baseCommit'>,
  headCommit: string,
): boolean {
  return summary.baseCommit.hash === headCommit;
}
