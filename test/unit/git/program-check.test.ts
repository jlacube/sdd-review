import { delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GitAccessChecker,
  firstErrorEntry,
  parseGitVersion,
  resolveGitOnPath,
  type CaptureResult,
  type GitExec,
} from '../../../src/core/git/program-check.js';
import { isReviewError } from '../../../src/core/errors/review-error.js';

// None of these tests starts a git process: the program resolution reads an injected file system
// and the checker an injected executor.

const posix = { platform: 'linux' as NodeJS.Platform };
const abs = (...parts: string[]) => resolve('/', ...parts);

describe('resolveGitOnPath (C001-IF-012 §6, "not found")', () => {
  it('resolves to the first git on PATH, as an absolute path', () => {
    const a = abs('a');
    const b = abs('b');
    const found = resolveGitOnPath(
      { PATH: [a, b].join(delimiter) },
      { ...posix, isFile: (p) => p === join(b, 'git') },
    );
    expect(found).toBe(join(b, 'git'));
  });

  it('never searches the current or a relative directory', () => {
    const asked: string[] = [];
    const found = resolveGitOnPath(
      { PATH: ['', '.', 'bin', '..' + '/x'].join(delimiter) },
      {
        ...posix,
        isFile: (p) => {
          asked.push(p);
          return true;
        },
      },
    );
    expect(found).toBeUndefined();
    expect(asked).toEqual([]);
  });

  it('finds nothing when PATH is empty or absent', () => {
    expect(resolveGitOnPath({}, { ...posix, isFile: () => true })).toBeUndefined();
    expect(resolveGitOnPath({ PATH: '' }, { ...posix, isFile: () => true })).toBeUndefined();
  });

  it('reads the PATH variable whatever its case on Windows, and tries git.exe', () => {
    const dir = abs('tools');
    const found = resolveGitOnPath(
      { Path: dir },
      { platform: 'win32', isFile: (p) => p.endsWith('git.exe') },
    );
    expect(found).toBe(join(dir, 'git.exe'));
  });

  it('does not read a lower-case "path" on POSIX', () => {
    expect(resolveGitOnPath({ path: abs('a') }, { ...posix, isFile: () => true })).toBeUndefined();
  });
});

describe('parseGitVersion', () => {
  it.each([
    ['git version 2.45.1', 2, 45],
    ['git version 2.34.0', 2, 34],
    ['git version 2.34.1.windows.1', 2, 34],
    ['git version 2.39.5 (Apple Git-154)', 2, 39],
    ['git version 2.33.8\n', 2, 33],
    ['git version 1.34.0', 1, 34],
  ])('reads %j', (text, major, minor) => {
    expect(parseGitVersion(text)).toMatchObject({ major, minor });
  });

  it.each(['git version custom-build', 'git version 2', '', 'something else', 'git version .5'])(
    'reads no version from %j',
    (text) => {
      expect(parseGitVersion(text)).toBeUndefined();
    },
  );
});

describe('firstErrorEntry', () => {
  it('takes the first line, with the indented lines that continue it', () => {
    expect(firstErrorEntry('fatal: unknown repository extension found:\n\tfutureformat\n')).toBe(
      'fatal: unknown repository extension found: futureformat',
    );
  });

  it('stops at the next line that is not indented', () => {
    expect(
      firstErrorEntry(
        "fatal: detected dubious ownership in repository at '/r'\nTo add an exception for this directory, call:\n",
      ),
    ).toBe("fatal: detected dubious ownership in repository at '/r'");
  });

  it('skips blank lines at the start and gives an empty text for no output', () => {
    expect(firstErrorEntry('\n\nfatal: x\n')).toBe('fatal: x');
    expect(firstErrorEntry('')).toBe('');
  });
});

const GIT_PATH = abs('tools', 'git');

function checker(exec: GitExec, env: NodeJS.ProcessEnv = { PATH: abs('tools') }) {
  return new GitAccessChecker({
    env,
    platform: 'linux',
    isFile: (p) => p === GIT_PATH,
    exec,
  });
}

const ok = (stdout: string): CaptureResult => ({ kind: 'exited', status: 0, stdout, stderr: '' });

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(isReviewError(error)).toBe(true);
  return error as import('../../../src/core/errors/review-error.js').ReviewError;
}

describe('the five causes of C001-IF-012 §6 stop with ERR-INTAKE-008', () => {
  it('not found', async () => {
    const calls: string[] = [];
    const c = checker(
      (file) => {
        calls.push(file);
        return Promise.resolve(ok(''));
      },
      { PATH: abs('empty') },
    );
    const e = await failure(c.check(abs('repo')));
    expect(e.code).toBe('ERR-INTAKE-008');
    expect(e.exitCode).toBe(3);
    expect(e.message).toContain(`Cannot read the repository at "${abs('repo')}" with git:`);
    expect(e.message).toContain('the git program was not found on PATH');
    expect(calls).toEqual([]);
  });

  it('cannot start: names the path and the operating system reason', async () => {
    const e = await failure(
      checker(() =>
        Promise.resolve({ kind: 'not-started', reason: 'spawn EACCES' } satisfies CaptureResult),
      ).check(abs('repo')),
    );
    expect(e.code).toBe('ERR-INTAKE-008');
    expect(e.message).toContain(`the git program at "${GIT_PATH}" could not be started`);
    expect(e.message).toContain('spawn EACCES');
  });

  it.each([
    ['git version custom-build', 0],
    ['git version 2', 0],
    ['git version 2.45.1', 1],
    ['', 0],
  ])('no readable version: %j with status %i', async (printed, status) => {
    const e = await failure(
      checker(() =>
        Promise.resolve({ kind: 'exited', status, stdout: printed, stderr: '' } as CaptureResult),
      ).check(abs('repo')),
    );
    expect(e.code).toBe('ERR-INTAKE-008');
    expect(e.message).toContain(`git at "${GIT_PATH}" printed no readable version`);
    expect(e.message).toContain(`"${printed}"`);
    expect(e.message).toContain('2.34');
  });

  it.each([
    ['git version 2.33.8', '2.33.8'],
    ['git version 2.9.5', '2.9.5'],
    ['git version 1.34.0', '1.34.0'],
  ])('too old: %j', async (printed, shown) => {
    const e = await failure(checker(() => Promise.resolve(ok(printed))).check(abs('repo')));
    expect(e.code).toBe('ERR-INTAKE-008');
    expect(e.message).toContain(`git ${shown} at "${GIT_PATH}" is older than 2.34`);
    expect(e.message).toContain('2.34');
  });

  it('repository refused: names the version, the path and git first error line', async () => {
    const exec: GitExec = (_file, args) =>
      Promise.resolve(
        args[0] === '--version'
          ? ok('git version 2.45.1')
          : {
              kind: 'exited',
              status: 128,
              stdout: '',
              stderr: 'fatal: unknown repository extension found:\n\tfutureformat\n',
            },
      );
    const e = await failure(checker(exec).check(abs('repo')));
    expect(e.code).toBe('ERR-INTAKE-008');
    expect(e.message).toContain(`git 2.45.1 at "${GIT_PATH}" refused to open the repository`);
    expect(e.message).toContain('futureformat');
    expect(e.message).toContain(abs('repo'));
  });

  it('repository refused: another user owns it', async () => {
    const exec: GitExec = (_file, args) =>
      Promise.resolve(
        args[0] === '--version'
          ? ok('git version 2.45.1')
          : {
              kind: 'exited',
              status: 128,
              stdout: '',
              stderr:
                "fatal: detected dubious ownership in repository at '/r'\nTo add an exception for this directory, call:\n\n\tgit config --global --add safe.directory /r\n",
            },
      );
    const e = await failure(checker(exec).check(abs('repo')));
    expect(e.message).toContain('dubious ownership');
    expect(e.message).not.toContain('To add an exception');
  });
});

describe('accepted versions and repositories', () => {
  const seen: string[][] = [];
  const exec: GitExec = (_file, args) => {
    seen.push(args);
    return Promise.resolve(args[0] === '--version' ? ok('git version 2.34.0') : ok('.git\n'));
  };

  it('accepts 2.34.0 and finds a repository', async () => {
    const r = await checker(exec).check(abs('repo'));
    expect(r.program).toMatchObject({ path: GIT_PATH, major: 2, minor: 34 });
    expect(r.repositoryFound).toBe(true);
  });

  it('a directory with no repository is not a refusal (G-01 reports ERR-INTAKE-001)', async () => {
    const r = await checker((_f, args) =>
      Promise.resolve(
        args[0] === '--version'
          ? ok('git version 2.45.1')
          : {
              kind: 'exited',
              status: 128,
              stdout: '',
              stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
            },
      ),
    ).check(abs('repo'));
    expect(r.repositoryFound).toBe(false);
  });

  it('checks the program once and caches it for the process', async () => {
    let versions = 0;
    const c = checker((_f, args) => {
      if (args[0] === '--version') versions += 1;
      return Promise.resolve(args[0] === '--version' ? ok('git version 2.45.1') : ok('.git\n'));
    });
    await c.check(abs('repo'));
    await c.check(abs('repo2'));
    expect(versions).toBe(1);
  });

  it('runs the version command and the repository check with the hardening arguments', async () => {
    seen.length = 0;
    await checker(exec).check(abs('repo'));
    const repoCall = seen.find((a) => a[0] !== '--version')!;
    expect(repoCall).toContain('--no-optional-locks');
    expect(repoCall).toContain('rev-parse');
    expect(repoCall.join(' ')).not.toMatch(/safe\.directory/);
  });
});
