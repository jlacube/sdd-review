import { execFileSync } from 'node:child_process';
import { resolveGitOnPath } from '../../../../src/core/git/program-check.js';

/**
 * The git programs that the git integration tests run on. The git on PATH always runs. The
 * minimum-version and latest-release programs run when `SDD_GIT_234` (a git 2.34.0 executable) and
 * `SDD_GIT_LATEST` (the latest git release) name them; otherwise their tests are skipped.
 */
export interface GitVersionUnderTest {
  readonly label: string;
  readonly path: string | undefined;
  /** The `major.minor` that the program must print, when the variable pins one. */
  readonly expect?: string;
}

export const GIT_VERSIONS: GitVersionUnderTest[] = [
  { label: 'git on PATH', path: resolveGitOnPath(process.env) },
  { label: 'git 2.34.0 (SDD_GIT_234)', path: process.env.SDD_GIT_234, expect: '2.34' },
  { label: 'latest git (SDD_GIT_LATEST)', path: process.env.SDD_GIT_LATEST },
];

export function versionOf(gitPath: string): string {
  return execFileSync(gitPath, ['--version'], { encoding: 'utf8' }).trim();
}
