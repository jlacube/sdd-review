import type { IntakeSummary } from '../generated/analysis-results.js';

/** The intake summary as text (C001-IF-001 Output); the lines grow with the intake tasks. */
export function intakeSummaryText(summary: IntakeSummary, namedValue: string): string {
  const how = summary.baseChoice === 'named' ? `named ${namedValue}` : summary.baseChoice;
  const lines = [
    `Base commit: ${summary.baseCommit.hash} ${summary.baseCommit.subject}`.trimEnd(),
    `Chosen: ${how}`,
    `Changed files: ${summary.changedFiles}; changed lines: ${summary.changedLines}`,
    `Intent context: ${summary.intentContext.sddChanges.length} SDD changes, ${summary.intentContext.commits} commits, ${summary.intentContext.namedFiles.length} named files, documented architecture: ${summary.intentContext.documentedArchitecture}`,
    `Test command: ${summary.testCommand ? `${summary.testCommand.command} (${summary.testCommand.origin})` : 'none'}`,
  ];
  if (summary.sizeWarning)
    lines.push(`${summary.sizeWarning.code}: ${summary.sizeWarning.message}`);
  return `${lines.join('\n')}\n`;
}
