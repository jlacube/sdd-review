import { ReviewError } from '../errors/review-error.js';
import type { UserIdentity } from '../git/port.js';
import type { ContextualLog } from '../log/log.js';

/**
 * The git identity check of the ten recorded actions (C001-IF-003 §4 step 4, C001-REQ-721,
 * C001-INV-10). The orchestrator reads `user.name` and `user.email` through the git access port
 * (C001-IF-012 G-10) for every recorded action and refuses the action with ERR-ACT-006 while either
 * is not set, so that no component writes an entry without the git user. Nothing is cached: the
 * developer can set the values between two attempts.
 */

export interface IdentitySource {
  userIdentity(): Promise<UserIdentity>;
}

export interface IdentityCheck {
  /** The core operation that asked, for the error context. */
  readonly operation: string;
  readonly snapshotId?: string;
  readonly log?: Pick<ContextualLog, 'recordError'>;
}

export interface GitIdentity {
  readonly name: string;
  readonly email: string;
}

const blank = (value: string | null): boolean => value === null || value.trim() === '';

/**
 * The identity to write into an entry; ERR-ACT-006 (exit 6, HTTP 409) when `user.name` or
 * `user.email` is not set, empty or whitespace only. A failing git read is passed on as it is.
 */
export async function requireGitIdentity(
  git: IdentitySource,
  check: IdentityCheck,
): Promise<GitIdentity> {
  const identity = await git.userIdentity();
  const missing = [
    ...(blank(identity.name) ? (['user.name'] as const) : []),
    ...(blank(identity.email) ? (['user.email'] as const) : []),
  ];
  if (identity.name !== null && identity.email !== null && missing.length === 0) {
    return { name: identity.name, email: identity.email };
  }
  const error = new ReviewError('ERR-ACT-006', {
    operation: check.operation,
    inputs: { snapshotId: check.snapshotId, missing },
    params: { 'user.name and/or user.email': missing.join(' and ') },
  });
  try {
    check.log?.recordError(error, check.operation);
  } catch {
    /* the refusal itself is what matters */
  }
  throw error;
}
