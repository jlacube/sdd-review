import { describe, expect, it } from 'vitest';
import {
  classifyTarget,
  decideCopiedLink,
  decideSnapshotLink,
  relativeWithin,
  type LinkRules,
} from '../../../../src/core/evidence/workspace/links.js';

// C001-T-016, C001-ADR-006 §4 and §7 item 3: link-target classification (working tree, git
// directory, another evidence workspace, outside) and the decision for each link, on paths only.

const posixRules: LinkRules = {
  platform: 'linux',
  forbidden: ['/repo/.git', '/repo/.git'],
  redirects: [{ root: '/repo', label: 'working-tree' }],
  destinationRoot: '/cache/sdd-review/k/s/w00',
};

const winRules: LinkRules = {
  platform: 'win32',
  forbidden: ['C:\\src\\repo\\.git'],
  redirects: [{ root: 'C:\\src\\repo', label: 'working-tree' }],
  destinationRoot: 'C:\\Users\\u\\AppData\\Local\\sddr\\k\\s\\w00',
};

describe('relativeWithin', () => {
  it('gives the relative path below a root, or null', () => {
    expect(relativeWithin('/repo/a/b', '/repo', 'linux')).toBe('a/b');
    expect(relativeWithin('/repo', '/repo', 'linux')).toBe('');
    expect(relativeWithin('/repository/a', '/repo', 'linux')).toBeNull();
    expect(relativeWithin('/Repo/a', '/repo', 'linux')).toBeNull();
    expect(relativeWithin('/Repo/a', '/repo', 'darwin')).toBe('a');
    expect(relativeWithin('c:\\SRC\\repo\\x\\y', 'C:\\src\\repo\\', 'win32')).toBe('x/y');
    expect(relativeWithin('C:/src/repo/x', 'C:\\src\\repo', 'win32')).toBe('x');
    expect(relativeWithin('D:\\src\\repo\\x', 'C:\\src\\repo', 'win32')).toBeNull();
  });
});

describe('classifyTarget', () => {
  it('puts the git directory before the working tree that contains it', () => {
    expect(classifyTarget('/repo/.git/hooks/pre-commit', posixRules)).toEqual({
      kind: 'git-directory',
      root: '/repo/.git',
    });
    expect(classifyTarget('/repo/packages/b', posixRules)).toEqual({
      kind: 'redirect',
      label: 'working-tree',
      relative: 'packages/b',
    });
    expect(classifyTarget('/home/u/.pnpm-store/v3/x', posixRules)).toEqual({ kind: 'outside' });
  });

  it('takes the longest redirect root first (another workspace of the snapshot)', () => {
    const rules: LinkRules = {
      platform: 'linux',
      forbidden: [],
      redirects: [
        { root: '/c/k/s', label: 'workspace' },
        { root: '/c/k/s/w01', label: 'workspace' },
      ],
      destinationRoot: '/c/k/s/m00',
    };
    expect(classifyTarget('/c/k/s/w01/src/a.ts', rules)).toEqual({
      kind: 'redirect',
      label: 'workspace',
      relative: 'src/a.ts',
    });
  });

  it('compares Windows paths whatever their letter case and separator', () => {
    expect(classifyTarget('c:/SRC/repo/.GIT/config', winRules).kind).toBe('git-directory');
    expect(classifyTarget('C:\\src\\repo\\packages\\b', winRules)).toEqual({
      kind: 'redirect',
      label: 'working-tree',
      relative: 'packages/b',
    });
  });
});

describe('links in a copied directory', () => {
  const link = (linkPath: string, rawTarget: string, finalTarget: string | null) => ({
    linkPath,
    rawTarget,
    finalTarget,
    sourceRoot: '/repo',
    copiedRoot: 'node_modules',
  });

  it('keeps a relative link that stays inside the copy', () => {
    expect(
      decideCopiedLink(
        link(
          'node_modules/.bin/tsc',
          '../typescript/bin/tsc',
          '/repo/node_modules/typescript/bin/tsc',
        ),
        posixRules,
      ),
    ).toEqual({ action: 'keep', target: '../typescript/bin/tsc' });
  });

  it('retargets a workspace package link into the workspace', () => {
    expect(
      decideCopiedLink(link('node_modules/b', '../packages/b', '/repo/packages/b'), posixRules),
    ).toEqual({
      action: 'point',
      place: 'working-tree',
      absolute: '/cache/sdd-review/k/s/w00/packages/b',
    });
    // An absolute `npm link` chain resolves through the global folder into the working tree.
    expect(
      decideCopiedLink(
        link('node_modules/c', '/usr/lib/node_modules/c', '/repo/libs/c'),
        posixRules,
      ),
    ).toEqual({
      action: 'point',
      place: 'working-tree',
      absolute: '/cache/sdd-review/k/s/w00/libs/c',
    });
  });

  it('does not create a link into the git directory', () => {
    const d = decideCopiedLink(
      link('node_modules/h', '../.git/hooks', '/repo/.git/hooks'),
      posixRules,
    );
    expect(d.action).toBe('drop');
  });

  it('keeps the final target of a link elsewhere (pnpm store, global folder)', () => {
    expect(
      decideCopiedLink(
        link('node_modules/x', '../../home/u/store/x', '/home/u/store/x'),
        posixRules,
      ),
    ).toEqual({ action: 'point', place: 'outside', absolute: '/home/u/store/x' });
  });

  it('classifies a dangling link by its text', () => {
    expect(decideCopiedLink(link('node_modules/d', '../gone', null), posixRules)).toEqual({
      action: 'point',
      place: 'working-tree',
      absolute: '/cache/sdd-review/k/s/w00/gone',
    });
    expect(decideCopiedLink(link('node_modules/g', '/repo/.git/x', null), posixRules).action).toBe(
      'drop',
    );
  });

  it('retargets a Windows junction into the working tree', () => {
    expect(
      decideCopiedLink(
        {
          linkPath: 'node_modules/b',
          rawTarget: 'C:\\src\\repo\\packages\\b\\',
          finalTarget: 'C:\\src\\repo\\packages\\b',
          sourceRoot: 'C:\\src\\repo',
          copiedRoot: 'node_modules',
        },
        winRules,
      ),
    ).toEqual({
      action: 'point',
      place: 'working-tree',
      absolute: 'C:\\Users\\u\\AppData\\Local\\sddr\\k\\s\\w00\\packages\\b',
    });
  });

  it('in the mutation copy retargets links into the test run workspace and the working tree', () => {
    const rules: LinkRules = {
      platform: 'linux',
      forbidden: ['/repo/.git'],
      redirects: [
        { root: '/c/k/s/w00', label: 'workspace' },
        { root: '/repo', label: 'working-tree' },
      ],
      destinationRoot: '/c/k/s/m00',
    };
    const whole = (linkPath: string, rawTarget: string, finalTarget: string | null) => ({
      linkPath,
      rawTarget,
      finalTarget,
      sourceRoot: '/c/k/s/w00',
      copiedRoot: '',
    });
    expect(decideCopiedLink(whole('node_modules/b', '/c/k/s/w00/packages/b', null), rules)).toEqual(
      { action: 'point', place: 'workspace', absolute: '/c/k/s/m00/packages/b' },
    );
    expect(decideCopiedLink(whole('node_modules/b', '../packages/b', null), rules)).toEqual({
      action: 'keep',
      target: '../packages/b',
    });
    expect(decideCopiedLink(whole('x', '/repo/src', '/repo/src'), rules)).toEqual({
      action: 'point',
      place: 'working-tree',
      absolute: '/c/k/s/m00/src',
    });
  });
});

describe('symbolic links of the snapshot', () => {
  const rules = { platform: 'linux' as const, workTreeRoot: '/repo', forbidden: ['/repo/.git'] };
  const ws = '/c/k/s/w00';

  it('keeps a relative target that stays inside the repository', () => {
    expect(decideSnapshotLink('docs/up', '../README.md', ws, rules)).toEqual({
      action: 'keep',
      target: '../README.md',
    });
  });

  it('writes an absolute target under the working-tree root as the workspace equivalent', () => {
    expect(decideSnapshotLink('cfg', '/repo/config/app.json', ws, rules)).toEqual({
      action: 'point',
      absolute: '/c/k/s/w00/config/app.json',
      relative: 'config/app.json',
    });
  });

  it('writes a relative target that leaves and re-enters the root as the workspace equivalent', () => {
    expect(decideSnapshotLink('a/l', '../../repo/src', ws, rules)).toEqual({
      action: 'point',
      absolute: '/c/k/s/w00/src',
      relative: 'src',
    });
  });

  it('keeps the meaning of a target outside the repository', () => {
    expect(decideSnapshotLink('l', '/etc/hosts', ws, rules)).toEqual({
      action: 'keep',
      target: '/etc/hosts',
    });
    expect(decideSnapshotLink('l', '../other/x', ws, rules)).toEqual({
      action: 'point',
      absolute: '/other/x',
    });
  });

  it('refuses a target in the git directory', () => {
    expect(decideSnapshotLink('h', '.git/hooks/pre-commit', ws, rules).action).toBe(
      'git-directory',
    );
    expect(decideSnapshotLink('h', '/repo/.git', ws, rules).action).toBe('git-directory');
    const linked = {
      platform: 'linux' as const,
      workTreeRoot: '/wt',
      forbidden: ['/main/.git/worktrees/wt', '/main/.git'],
    };
    expect(decideSnapshotLink('h', '../main/.git/config', ws, linked).action).toBe('git-directory');
  });

  it('handles Windows roots', () => {
    const w = {
      platform: 'win32' as const,
      workTreeRoot: 'C:\\src\\repo',
      forbidden: ['C:\\src\\repo\\.git'],
    };
    expect(decideSnapshotLink('l', 'C:/src/repo/lib/x.dll', 'C:\\e\\w00', w)).toEqual({
      action: 'point',
      absolute: 'C:\\e\\w00\\lib\\x.dll',
      relative: 'lib/x.dll',
    });
    expect(decideSnapshotLink('l', 'src/x', 'C:\\e\\w00', w)).toEqual({
      action: 'keep',
      target: 'src/x',
    });
  });
});
