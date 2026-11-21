import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { buildFxDefault, DefaultSetup as S } from '../../fixtures/repos/fx-default.js';
import { buildFxUpstream } from '../../fixtures/repos/fx-upstream.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import { chooseBase } from '../../../src/core/intake/base.js';
import { cleanTempDirs, loggedCodes, tempDir } from '../store/helpers.js';

// C001-T-025: the base commit rules of C001-IF-012 §4 (C001-REQ-102 to C001-REQ-104) and the
// refusals of C001-REQ-105 and C001-REQ-106, on the real git port and `fx-default` variants
// (C001-TC-103 to C001-TC-106 at unit level).

// Each test builds a repository with a few dozen git processes: slow on Windows.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

interface Rig {
  readonly git: GitAdapter;
  readonly logFile: string;
  readonly log: ContextualLog;
}

const open: Array<{ git: GitAdapter; fx?: FixtureRepo }> = [];

async function rig(dir: string, fx?: FixtureRepo): Promise<Rig> {
  const logFile = join(tempDir('base-log'), 'log.jsonl');
  const log = new ContextualLog(logFile);
  const git = new GitAdapter({ log });
  open.push({ git, ...(fx ? { fx } : {}) });
  await git.discover(dir);
  return { git, logFile, log };
}

async function choose(fx: FixtureRepo, named?: string) {
  const r = await rig(fx.dir, fx);
  return chooseBase(r.git, named, r.log);
}

afterEach(async () => {
  for (const o of open.splice(0)) {
    await o.git.close();
    o.fx?.dispose();
  }
  cleanTempDirs();
});

describe('chooseBase: named commit (C001-REQ-102)', () => {
  it('uses the merge base of the named commit and HEAD, without a ref', async () => {
    const fx = buildFxDefault();
    S.localBranch(fx, 'main', 'M1');
    const chosen = await choose(fx, fx.label('C1').hash);
    expect(chosen).toEqual({
      base: fx.label('C1').hash,
      head: fx.label('C2').hash,
      baseChoice: 'named',
      baseRef: null,
      namedValue: fx.label('C1').hash,
    });
  });
});

describe('chooseBase: upstream branch (C001-REQ-103, C001-TS-106, C001-TS-107)', () => {
  it('uses the merge base with the upstream branch and names the upstream ref', async () => {
    const fx = buildFxUpstream();
    const chosen = await choose(fx);
    expect(chosen.base).toBe(fx.label('U1').hash);
    expect(chosen.baseChoice).toBe('upstream-merge-base');
    expect(chosen.baseRef).toBe('refs/remotes/origin/agent/cart');
    expect(chosen.namedValue).toBeNull();
  });

  it('takes the merge base, not the tip, of an upstream branch that moved ahead', async () => {
    const fx = buildFxUpstream();
    const u2 = fx.git(
      'commit-tree',
      `${fx.label('U1').hash}^{tree}`,
      '-p',
      fx.label('U1').hash,
      '-m',
      'U2: shipping',
    );
    fx.git('update-ref', 'refs/remotes/origin/agent/cart', u2);
    const chosen = await choose(fx);
    expect(chosen.base).toBe(fx.label('U1').hash);
    expect(chosen.baseChoice).toBe('upstream-merge-base');
  });

  it('wins over a local main branch', async () => {
    const fx = buildFxUpstream(); // its local "main" is at U1 too; C1 would be the base if it won
    fx.git('branch', '-f', 'main', fx.label('C1').hash);
    expect((await choose(fx)).baseChoice).toBe('upstream-merge-base');
  });
});

describe('chooseBase: default branches (C001-REQ-104)', () => {
  it('C001-TS-108: the default branch of the remote "origin"', async () => {
    const fx = buildFxDefault();
    S.remote(fx, 'origin');
    S.remoteBranch(fx, 'origin', 'main', 'M1');
    S.remoteHead(fx, 'origin', 'refs/remotes/origin/main');
    S.localBranch(fx, 'main', 'M0'); // the remote's default branch comes first
    const chosen = await choose(fx);
    expect(chosen).toMatchObject({
      base: fx.label('M1').hash,
      head: fx.label('C2').hash,
      baseChoice: 'default-branch-merge-base',
      baseRef: 'refs/remotes/origin/main',
    });
  });

  it('C001-TS-109: a detached HEAD follows the same rule', async () => {
    const fx = buildFxDefault();
    S.localBranch(fx, 'main', 'M1');
    S.detach(fx, 'C2');
    const chosen = await choose(fx);
    expect(chosen).toMatchObject({
      base: fx.label('M1').hash,
      baseChoice: 'default-branch-merge-base',
      baseRef: 'refs/heads/main',
    });
  });

  it('a detached HEAD ignores the upstream branch of the branch it left', async () => {
    const fx = buildFxDefault();
    S.remote(fx, 'origin');
    S.remoteBranch(fx, 'origin', 'agent/cart', 'C1');
    fx.setConfig('branch.agent/cart.remote', 'origin');
    fx.setConfig('branch.agent/cart.merge', 'refs/heads/agent/cart');
    S.localBranch(fx, 'master', 'M1');
    S.detach(fx, 'C2');
    expect(await choose(fx)).toMatchObject({
      base: fx.label('M1').hash,
      baseRef: 'refs/heads/master',
    });
  });

  it.each([
    {
      name: 'only the remote "upstream" with its symbolic ref HEAD',
      setup: (fx: FixtureRepo) => {
        S.remote(fx, 'upstream');
        S.remoteBranch(fx, 'upstream', 'main', 'M1');
        S.remoteHead(fx, 'upstream', 'refs/remotes/upstream/main');
      },
      ref: 'refs/remotes/upstream/main',
    },
    {
      name: '"origin" without a symbolic ref HEAD, local "main"',
      setup: (fx: FixtureRepo) => {
        S.remote(fx, 'origin');
        S.remoteBranch(fx, 'origin', 'main', 'M0');
        S.localBranch(fx, 'main', 'M1');
      },
      ref: 'refs/heads/main',
    },
    {
      name: 'two remotes, none named "origin", local "main"',
      setup: (fx: FixtureRepo) => {
        for (const remote of ['fork', 'upstream']) {
          S.remote(fx, remote);
          S.remoteBranch(fx, remote, 'main', 'M0');
          S.remoteHead(fx, remote, `refs/remotes/${remote}/main`);
        }
        S.localBranch(fx, 'main', 'M1');
      },
      ref: 'refs/heads/main',
    },
    {
      name: 'no remote, local "master" and no "main"',
      setup: (fx: FixtureRepo) => S.localBranch(fx, 'master', 'M1'),
      ref: 'refs/heads/master',
    },
    {
      name: 'no remote, local "main" before local "master"',
      setup: (fx: FixtureRepo) => {
        S.localBranch(fx, 'main', 'M1');
        S.localBranch(fx, 'master', 'M0');
      },
      ref: 'refs/heads/main',
    },
  ])('C001-TS-156: $name', async ({ setup, ref }) => {
    const fx = buildFxDefault();
    setup(fx);
    expect(await choose(fx)).toMatchObject({
      base: fx.label('M1').hash,
      baseChoice: 'default-branch-merge-base',
      baseRef: ref,
    });
  });

  it('C001-TS-157: a default branch with unrelated history is skipped for the next one', async () => {
    const fx = buildFxDefault();
    S.remote(fx, 'origin');
    S.remoteBranch(fx, 'origin', 'main', 'D1');
    S.remoteHead(fx, 'origin', 'refs/remotes/origin/main');
    S.localBranch(fx, 'master', 'M1');
    expect(await choose(fx)).toMatchObject({
      base: fx.label('M1').hash,
      baseRef: 'refs/heads/master',
    });
  });

  it.each([
    { name: 'no remote and no local "main" or "master"', setup: () => undefined },
    {
      name: 'local "main" with unrelated history and no "master"',
      setup: (fx: FixtureRepo) => S.localBranch(fx, 'main', 'D1'),
    },
    {
      name: 'C001-TS-159: a tag named "main" is not a branch',
      setup: (fx: FixtureRepo) => S.tag(fx, 'main', 'M1'),
    },
  ])('C001-TS-158: HEAD itself with $name', async ({ setup }) => {
    const fx = buildFxDefault();
    setup(fx);
    expect(await choose(fx)).toEqual({
      base: fx.label('C2').hash,
      head: fx.label('C2').hash,
      baseChoice: 'head',
      baseRef: null,
      namedValue: null,
    });
  });

  it('a local main at HEAD gives HEAD as the base, chosen by the default branch rule', async () => {
    const fx = buildFxDefault();
    S.localBranch(fx, 'main', 'C2');
    expect(await choose(fx)).toMatchObject({
      base: fx.label('C2').hash,
      baseChoice: 'default-branch-merge-base',
      baseRef: 'refs/heads/main',
    });
  });
});

describe('chooseBase: refusals (C001-REQ-105, C001-REQ-106)', () => {
  it.each(['no-such-branch', '0000000000000000000000000000000000000000', '--output=pwned.txt'])(
    'C001-TS-110, C001-TS-112: ERR-INTAKE-003 names %s',
    async (value) => {
      const fx = buildFxDefault();
      const r = await rig(fx.dir, fx);
      const failure = chooseBase(r.git, value, r.log);
      await expect(failure).rejects.toMatchObject({ code: 'ERR-INTAKE-003' });
      await expect(failure).rejects.toThrow(value);
      expect(loggedCodes(r.logFile)).toContain('ERR-INTAKE-003');
    },
  );

  it('C001-TS-111: ERR-INTAKE-004 names a commit with no merge base with HEAD, and logs it', async () => {
    const fx = buildFxDefault();
    S.localBranch(fx, 'docs-site', 'D1');
    const r = await rig(fx.dir, fx);
    const failure = chooseBase(r.git, 'docs-site', r.log);
    await expect(failure).rejects.toMatchObject({ code: 'ERR-INTAKE-004' });
    await expect(failure).rejects.toThrow('"docs-site" has no common ancestor with HEAD.');
    expect(loggedCodes(r.logFile)).toEqual(['ERR-INTAKE-004']);
  });

  it('C001-TS-113: ERR-INTAKE-001 names a directory outside every working tree', async () => {
    const dir = tempDir('plain');
    writeFileSync(join(dir, 'a.ts'), 'export {};\n');
    const git = new GitAdapter({ log: new ContextualLog(join(tempDir('base-log'), 'log.jsonl')) });
    open.push({ git });
    const failure = git.discover(dir);
    await expect(failure).rejects.toMatchObject({ code: 'ERR-INTAKE-001' });
    await expect(failure).rejects.toThrow(dir);
  });

  it('C001-TS-114: ERR-INTAKE-002 names a repository without any commit', async () => {
    const dir = tempDir('empty');
    execFileSync('git', ['init', '-q', dir]);
    writeFileSync(join(dir, 'a.ts'), 'export {};\n');
    const r = await rig(dir);
    const failure = chooseBase(r.git, undefined, r.log);
    await expect(failure).rejects.toMatchObject({ code: 'ERR-INTAKE-002' });
    await expect(failure).rejects.toThrow('the repository has no commit yet');
  });
});
