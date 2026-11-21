import { describe, expect, it } from 'vitest';
import {
  buildEvidenceEnvironment,
  ceilingFor,
  EVIDENCE_REMOVED_VARIABLES,
  InjectionRefused,
  type Injection,
} from '../../../../src/core/evidence/runner/environment.js';
import { REMOVED_GIT_VARIABLES } from '../../../../src/core/git/environment.js';

// C001-T-019, C001-IF-013 §1 item 7 (Removed, Replaced, Kept), C001-ADR-006 A1.2 and C001-ADR-007
// §1 "Injection": the environment of an evidence command, built from a given map without starting
// a process.

const POSIX_WS = '/home/dev/.cache/sdd-review/0123456789abcdef/0123456789ab/w00';
const WIN_WS = 'C:\\Users\\dev\\AppData\\Local\\sddr\\0123456789abcdef\\0123456789ab\\w00';
const posixRepo = {
  workTreeRoot: '/home/dev/shop-ts',
  gitDir: '/home/dev/shop-ts/.git',
  commonGitDir: '/home/dev/shop-ts/.git',
};
const winRepo = {
  workTreeRoot: 'C:\\src\\shop-ts',
  gitDir: 'C:\\src\\shop-ts\\.git',
  commonGitDir: 'C:\\src\\shop-ts\\.git',
};

const posix = (base: NodeJS.ProcessEnv, inject: readonly Injection[] = []) =>
  buildEvidenceEnvironment({
    base,
    workspaceRoot: POSIX_WS,
    repository: posixRepo,
    inject,
    platform: 'linux',
  });
const windows = (base: NodeJS.ProcessEnv, inject: readonly Injection[] = []) =>
  buildEvidenceEnvironment({
    base,
    workspaceRoot: WIN_WS,
    repository: winRepo,
    inject,
    platform: 'win32',
  });

describe('evidence environment: removed variables (C001-TS-588)', () => {
  it('uses the one list of the git adapter, so the two never differ', () => {
    expect(EVIDENCE_REMOVED_VARIABLES).toBe(REMOVED_GIT_VARIABLES);
    expect(EVIDENCE_REMOVED_VARIABLES).toHaveLength(15);
  });

  it.each(REMOVED_GIT_VARIABLES.map((name) => [name]))('removes %s', (name) => {
    const env = posix({ [name]: '/home/dev/shop-ts/.git', PATH: '/usr/bin' });
    expect(Object.hasOwn(env, name)).toBe(false);
    expect(env.PATH).toBe('/usr/bin');
  });

  it('removes every variable of the list at once, as a git hook environment sets them', () => {
    const base = Object.fromEntries(REMOVED_GIT_VARIABLES.map((n) => [n, 'x']));
    const env = posix(base);
    expect(Object.keys(env).sort()).toEqual(['GIT_CEILING_DIRECTORIES']);
  });

  it('on Windows removes a variable whatever the letter case of its name (C001-TS-590)', () => {
    const env = windows({ Git_Dir: 'C:\\src\\shop-ts\\.git', git_dir: 'x', git_index_file: 'y' });
    expect(Object.keys(env)).toEqual(['GIT_CEILING_DIRECTORIES']);
  });

  it('on Linux and macOS matches names exactly, as the operating system does', () => {
    const env = posix({ git_dir: 'kept, not the variable GIT_DIR' });
    expect(env.git_dir).toBe('kept, not the variable GIT_DIR');
  });

  it('does not change its input', () => {
    const base = { GIT_DIR: '/x', GIT_CEILING_DIRECTORIES: '/home' };
    posix(base);
    expect(base).toEqual({ GIT_DIR: '/x', GIT_CEILING_DIRECTORIES: '/home' });
  });
});

describe('evidence environment: replaced and kept variables (C001-TS-589)', () => {
  it('sets GIT_CEILING_DIRECTORIES to the parent of the workspace root alone', () => {
    const env = posix({ GIT_CEILING_DIRECTORIES: '/home/dev/shop-ts:/home' });
    expect(env.GIT_CEILING_DIRECTORIES).toBe(
      '/home/dev/.cache/sdd-review/0123456789abcdef/0123456789ab',
    );
  });

  it('on Windows replaces the developer value whatever its letter case', () => {
    const env = windows({ git_ceiling_directories: 'C:\\src\\shop-ts' });
    expect(env).toEqual({
      GIT_CEILING_DIRECTORIES:
        'C:\\Users\\dev\\AppData\\Local\\sddr\\0123456789abcdef\\0123456789ab',
    });
  });

  it('computes the ceiling with the separator of the platform', () => {
    expect(ceilingFor('/a/b/w00', 'darwin')).toBe('/a/b');
    expect(ceilingFor('D:\\e\\w01', 'win32')).toBe('D:\\e');
  });

  it('keeps every other variable, other GIT_* variables included', () => {
    const kept = {
      GIT_CONFIG_PARAMETERS: "'safe.directory'='*'",
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.directory',
      GIT_CONFIG_VALUE_0: '*',
      GIT_CONFIG_GLOBAL: '/home/dev/ci.gitconfig',
      GIT_CONFIG_SYSTEM: '/etc/gitconfig',
      GIT_EXEC_PATH: '/usr/lib/git-core',
      GIT_AUTHOR_NAME: 'Dev One',
      GIT_COMMITTER_EMAIL: 'dev@example.test',
      GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
      SHOP_MODE: 'ci',
      // A developer value that names the working tree is the limit of C001-IF-013 §9 item 2.
      VIRTUAL_ENV: '/home/dev/shop-ts/.venv',
      PATH: '/usr/bin:/bin',
    };
    const env = posix({ ...kept, GIT_DIR: '/x' });
    expect(env).toEqual({ ...kept, GIT_CEILING_DIRECTORIES: ceilingFor(POSIX_WS, 'linux') });
  });
});

describe('evidence environment: injected values (C001-ADR-007 §1)', () => {
  it('prepends and appends to the developer value, never replacing it', () => {
    const env = posix({ NODE_OPTIONS: '--max-old-space-size=4096', PYTHONPATH: '/opt/lib' }, [
      { name: 'NODE_OPTIONS', value: '--import=/rt/hook.mjs', position: 'prepend', separator: ' ' },
      { name: 'PYTHONPATH', value: '/rt/python', position: 'prepend', separator: ':' },
      { name: 'PYTHONPATH', value: '/rt/late', position: 'append', separator: ':' },
    ]);
    expect(env.NODE_OPTIONS).toBe('--import=/rt/hook.mjs --max-old-space-size=4096');
    expect(env.PYTHONPATH).toBe('/rt/python:/opt/lib:/rt/late');
  });

  it('gives the value alone when the developer sets the variable to nothing or not at all', () => {
    // An empty PYTHONPATH entry would put the current directory on the import path.
    const env = posix({ PYTHONPATH: '' }, [
      { name: 'PYTHONPATH', value: '/rt/python', position: 'append', separator: ':' },
      { name: 'SDDR_AUX', value: '/aux', position: 'append', separator: ':' },
    ]);
    expect(env.PYTHONPATH).toBe('/rt/python');
    expect(env.SDDR_AUX).toBe('/aux');
  });

  it('on Windows merges into the developer variable whatever its spelling', () => {
    const env = windows({ Path: 'C:\\Windows' }, [
      { name: 'PATH', value: 'C:\\rt\\bin', position: 'prepend', separator: ';' },
    ]);
    expect(env.Path).toBe('C:\\rt\\bin;C:\\Windows');
    expect(Object.hasOwn(env, 'PATH')).toBe(false);
  });

  it.each([['GIT_DIR'], ['GIT_CEILING_DIRECTORIES'], ['git_index_file']])(
    'refuses to inject %s, which the runner removes or sets',
    (name) => {
      expect(() =>
        windows({}, [{ name, value: 'C:\\x', position: 'append', separator: ';' }]),
      ).toThrow(InjectionRefused);
    },
  );

  it.each([
    ['/home/dev/shop-ts'],
    ['/home/dev/shop-ts/src/hook.js'],
    ['--import=/home/dev/shop-ts/x.mjs'],
    ['/opt/a:/home/dev/shop-ts/.git/objects'],
    ['"/home/dev/shop-ts"'],
  ])('refuses an injected value that names the working tree or git directory: %s', (value) => {
    expect(() => posix({}, [{ name: 'X', value, position: 'append', separator: ':' }])).toThrow(
      InjectionRefused,
    );
  });

  it('refuses a Windows value naming the working tree in another letter case or as a file URL', () => {
    for (const value of ['c:\\SRC\\shop-ts\\x', 'file:///C:/src/shop-ts/hook.mjs']) {
      expect(() => windows({}, [{ name: 'X', value, position: 'append', separator: ';' }])).toThrow(
        InjectionRefused,
      );
    }
  });

  it('accepts a sibling directory whose name starts like the working tree', () => {
    const env = posix({}, [
      { name: 'X', value: '/home/dev/shop-ts-cache/a', position: 'append', separator: ':' },
    ]);
    expect(env.X).toBe('/home/dev/shop-ts-cache/a');
  });
});
