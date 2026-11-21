import { describe, expect, it } from 'vitest';
import {
  containmentConflict,
  evidenceRootCandidates,
} from '../../../../src/core/evidence/workspace/root.js';

// C001-T-015, C001-ADR-006 §1: the evidence root per operating system and the containment check
// on given real paths (C001-CON-22, C001-IF-013 §2 item 2). No file system is touched.

describe('evidence root per operating system', () => {
  it('Windows: %LOCALAPPDATA%\\sddr, then the temporary directory', () => {
    const c = evidenceRootCandidates({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' },
      home: 'C:\\Users\\dev',
      tmpdir: 'C:\\Temp',
    });
    expect(c).toEqual(['C:\\Users\\dev\\AppData\\Local\\sddr', 'C:\\Temp\\sddr']);
  });
  it('Windows without LOCALAPPDATA falls back to the profile folder', () => {
    const c = evidenceRootCandidates({
      platform: 'win32',
      env: {},
      home: 'C:\\Users\\dev',
      tmpdir: 'C:\\Temp',
    });
    expect(c[0]).toBe('C:\\Users\\dev\\AppData\\Local\\sddr');
  });
  it('macOS: ~/Library/Caches/sdd-review', () => {
    const c = evidenceRootCandidates({
      platform: 'darwin',
      env: { XDG_CACHE_HOME: '/ignored' },
      home: '/Users/dev',
      tmpdir: '/private/tmp',
    });
    expect(c).toEqual(['/Users/dev/Library/Caches/sdd-review', '/private/tmp/sdd-review']);
  });
  it('Linux: $XDG_CACHE_HOME/sdd-review, default ~/.cache/sdd-review', () => {
    expect(
      evidenceRootCandidates({
        platform: 'linux',
        env: { XDG_CACHE_HOME: '/data/cache' },
        home: '/home/dev',
        tmpdir: '/tmp',
      })[0],
    ).toBe('/data/cache/sdd-review');
    expect(
      evidenceRootCandidates({ platform: 'linux', env: {}, home: '/home/dev', tmpdir: '/tmp' }),
    ).toEqual(['/home/dev/.cache/sdd-review', '/tmp/sdd-review']);
  });
  it('a relative XDG_CACHE_HOME is ignored, as the XDG specification says', () => {
    expect(
      evidenceRootCandidates({
        platform: 'linux',
        env: { XDG_CACHE_HOME: 'rel/cache' },
        home: '/home/dev',
        tmpdir: '/tmp',
      })[0],
    ).toBe('/home/dev/.cache/sdd-review');
  });
});

describe('containment check on real paths', () => {
  const repo = {
    workTreeRoot: '/home/dev/project',
    gitDir: '/home/dev/project/.git/worktrees/wt',
    commonGitDir: '/home/dev/project/.git',
  };
  const check = (candidate: string, caseInsensitive = false) =>
    containmentConflict(candidate, repo, { caseInsensitive, separator: '/' });

  it('accepts a root outside all three directories', () => {
    expect(check('/home/dev/.cache/sdd-review')).toBeNull();
  });
  it('refuses a root below the working-tree root, the git directory or the common git directory', () => {
    expect(check('/home/dev/project/.cache/sdd-review')).toEqual({
      kind: 'working tree',
      path: '/home/dev/project',
    });
    expect(check('/home/dev/project/.git/sdd')).toMatchObject({ path: '/home/dev/project' });
    const outsideTree = containmentConflict(
      '/srv/git/repo.git/cache',
      { workTreeRoot: '/w', gitDir: '/srv/git/repo.git', commonGitDir: '/srv/git/repo.git' },
      { caseInsensitive: false, separator: '/' },
    );
    expect(outsideTree).toEqual({ kind: 'git directory', path: '/srv/git/repo.git' });
  });
  it('refuses a root equal to one of them', () => {
    expect(check('/home/dev/project')).not.toBeNull();
  });
  it('a common prefix that is not a parent directory is no conflict', () => {
    expect(check('/home/dev/project-cache/sdd-review')).toBeNull();
  });
  it('compares without letter case where the file system ignores it', () => {
    expect(check('/HOME/dev/Project/cache')).toBeNull();
    expect(check('/HOME/dev/Project/cache', true)).not.toBeNull();
  });
  it('handles Windows separators and drive letters', () => {
    const c = containmentConflict(
      'c:\\users\\dev\\repo\\sddr',
      {
        workTreeRoot: 'C:\\Users\\dev\\repo',
        gitDir: 'C:\\Users\\dev\\repo\\.git',
        commonGitDir: 'C:\\Users\\dev\\repo\\.git',
      },
      { caseInsensitive: true, separator: '\\' },
    );
    expect(c).toEqual({ kind: 'working tree', path: 'C:\\Users\\dev\\repo' });
  });
  it('a bare repository (no working tree) is checked against its git directory only', () => {
    const c = containmentConflict(
      '/srv/cache',
      { workTreeRoot: '', gitDir: '/srv/repo.git', commonGitDir: '/srv/repo.git' },
      { caseInsensitive: false, separator: '/' },
    );
    expect(c).toBeNull();
  });
});
