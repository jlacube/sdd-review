import { describe, expect, it } from 'vitest';
import { requireGitIdentity } from '../../../src/core/orchestrator/identity.js';
import { ReviewError } from '../../../src/core/errors/review-error.js';
import type { UserIdentity } from '../../../src/core/git/port.js';

// C001-REQ-721, ERR-ACT-006: the orchestrator reads G-10 for each recorded action and refuses it
// while user.name or user.email is not set.

const git = (identity: UserIdentity) => ({ userIdentity: () => Promise.resolve(identity) });
const NAMED = { operation: 'markRead', snapshotId: `s-${'a'.repeat(64)}` };

describe('git identity check', () => {
  it('returns the identity when both values are set', async () => {
    expect(await requireGitIdentity(git({ name: 'Ada', email: 'ada@example.org' }), NAMED)).toEqual(
      { name: 'Ada', email: 'ada@example.org' },
    );
  });

  it.each([
    [{ name: null, email: 'ada@example.org' }, ['user.name'], 'user.name'],
    [{ name: 'Ada', email: null }, ['user.email'], 'user.email'],
    [{ name: null, email: null }, ['user.name', 'user.email'], 'user.name and user.email'],
    [{ name: '   ', email: '\t' }, ['user.name', 'user.email'], 'user.name and user.email'],
  ])('refuses %j with ERR-ACT-006 naming %j', async (identity, missing, named) => {
    const error = await requireGitIdentity(git(identity), NAMED).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReviewError);
    expect((error as ReviewError).code).toBe('ERR-ACT-006');
    expect((error as ReviewError).message).toContain(`git ${named} is not set`);
    expect((error as ReviewError).context.inputs).toMatchObject({ missing });
    expect((error as ReviewError).exitCode).toBe(6);
    expect((error as ReviewError).httpStatus).toBe(409);
  });

  it('reads the identity again for every call (no caching across actions)', async () => {
    let reads = 0;
    const port = {
      userIdentity: () => {
        reads++;
        return Promise.resolve(
          reads === 1 ? { name: null, email: null } : { name: 'Ada', email: 'ada@example.org' },
        );
      },
    };
    await expect(requireGitIdentity(port, NAMED)).rejects.toMatchObject({ code: 'ERR-ACT-006' });
    await expect(requireGitIdentity(port, NAMED)).resolves.toMatchObject({ name: 'Ada' });
    expect(reads).toBe(2);
  });

  it('records the refusal in the log when a log is given, and lets a git failure through unchanged', async () => {
    const logged: string[] = [];
    const log = { recordError: (e: ReviewError) => logged.push(e.code) } as never;
    await expect(
      requireGitIdentity(git({ name: null, email: null }), { ...NAMED, log }),
    ).rejects.toMatchObject({ code: 'ERR-ACT-006' });
    expect(logged).toEqual(['ERR-ACT-006']);
    const broken = {
      userIdentity: () => Promise.reject(new ReviewError('ERR-CLI-003', { operation: 'x' })),
    };
    await expect(requireGitIdentity(broken, NAMED)).rejects.toMatchObject({ code: 'ERR-CLI-003' });
  });
});
