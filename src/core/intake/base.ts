import type { BaseChoice } from '../../generated/analysis-results.js';
import { ReviewError } from '../errors/review-error.js';
import type { GitAccessPort } from '../git/port.js';
import type { ContextualLog } from '../log/log.js';
import { fail } from './change.js';

/**
 * The base commit of a review (C001-REQ-102 to C001-REQ-106) by the rules of C001-IF-012 §4, with
 * how it was chosen for the snapshot and the intake summary (`baseChoice`, `baseRef`, C001-IF-008).
 *
 * Refusals (architecture §6, Error handling): they happen before anything is written, so a refused
 * intake changes nothing.
 * - ERR-INTAKE-001: the directory is outside every git working tree — raised when the repository is
 *   located (G-01, `openCore`), before intake.
 * - ERR-INTAKE-002: the repository has no commit — G-02 (`head`), the first git read of intake.
 * - ERR-INTAKE-003: the named value names no commit or has the shape of an option — G-03.
 * - ERR-INTAKE-004: the named commit has no merge base with HEAD — here.
 */

export interface ChosenBase {
  /** The base commit hash. */
  readonly base: string;
  /** The HEAD commit hash. */
  readonly head: string;
  readonly baseChoice: BaseChoice;
  /** Full ref name whose merge base with HEAD is the base commit; `null` for `named` and `head`. */
  readonly baseRef: string | null;
  /** The value the developer named; `null` when none was named. */
  readonly namedValue: string | null;
}

/**
 * Chooses the base commit (C001-IF-012 §4, in this order):
 * 1. a named value: the merge base of the commit it names (G-03) and HEAD (C001-REQ-102), refused
 *    with ERR-INTAKE-003 or ERR-INTAKE-004 (C001-REQ-105);
 * 2. HEAD on a branch with an upstream branch (G-05): the merge base of the upstream branch and
 *    HEAD (C001-REQ-103);
 * 3. otherwise the merge base of HEAD and the first entry of G-14 (the default branch of the
 *    remote, `refs/heads/main`, `refs/heads/master`) that has one (C001-REQ-104);
 * 4. otherwise HEAD itself.
 *
 * HEAD that resolves to no commit fails with ERR-INTAKE-002 (C001-REQ-106) before any rule runs.
 */
export async function chooseBase(
  git: GitAccessPort,
  namedValue: string | undefined,
  log?: ContextualLog,
): Promise<ChosenBase> {
  const head = await git.head();

  if (namedValue !== undefined) {
    const named = await git.resolveCommit(namedValue);
    const base = await git.mergeBase(named, head.commit);
    if (base === null) {
      fail(
        log,
        new ReviewError('ERR-INTAKE-004', {
          operation: 'intake',
          inputs: { value: namedValue, head: head.commit },
          params: { value: namedValue },
          cause: `no merge base of ${named} and HEAD ${head.commit}`,
        }),
      );
    }
    return { base, head: head.commit, baseChoice: 'named', baseRef: null, namedValue };
  }

  if (head.branch !== null) {
    const upstream = await git.upstream(head.branch);
    if (upstream !== null) {
      const base = await git.mergeBase(upstream.commit, head.commit);
      // An upstream branch with no common history with HEAD has no rule of its own in
      // C001-REQ-103 (spec defect D-024); until it has one, the rules of C001-REQ-104 apply.
      if (base !== null) {
        return {
          base,
          head: head.commit,
          baseChoice: 'upstream-merge-base',
          baseRef: upstream.ref,
          namedValue: null,
        };
      }
    }
  }

  for (const entry of await git.defaultBranches()) {
    const base = await git.mergeBase(entry.commit, head.commit);
    if (base !== null) {
      return {
        base,
        head: head.commit,
        baseChoice: 'default-branch-merge-base',
        baseRef: entry.ref,
        namedValue: null,
      };
    }
  }

  return {
    base: head.commit,
    head: head.commit,
    baseChoice: 'head',
    baseRef: null,
    namedValue: null,
  };
}
