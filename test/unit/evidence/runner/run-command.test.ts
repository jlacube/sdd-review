import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkWorkingDirectory,
  OutputCapture,
  runInWorkspace,
  shellInvocation,
  type SpawnSeam,
} from '../../../../src/core/evidence/runner/run-command.js';
import { isReviewError, type ReviewError } from '../../../../src/core/errors/review-error.js';
import { ContextualLog } from '../../../../src/core/log/log.js';

// C001-T-019, C001-IF-013 §1 items 1 to 3 and C001-CON-22: shell per operating system, the check
// that refuses the working tree as working directory, and bounded output capture, without
// starting a process.

let scratch: string;
let repo: { workTreeRoot: string; gitDir: string; commonGitDir: string };
let workspace: string;

beforeAll(() => {
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'sddr-run-unit-')));
  const wt = join(scratch, 'shop-ts');
  mkdirSync(join(wt, '.git'), { recursive: true });
  mkdirSync(join(wt, 'src'));
  repo = { workTreeRoot: wt, gitDir: join(wt, '.git'), commonGitDir: join(wt, '.git') };
  workspace = join(scratch, 'evidence', 'w00');
  mkdirSync(workspace, { recursive: true });
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('working-directory check (C001-CON-22)', () => {
  it('accepts a workspace outside the repository', () => {
    expect(checkWorkingDirectory(workspace, repo)).toBeNull();
  });

  it.each([
    ['the working-tree root', () => repo.workTreeRoot],
    ['a directory of the working tree', () => join(repo.workTreeRoot, 'src')],
    ['the git directory', () => repo.gitDir],
  ])('refuses %s', (_label, dir) => {
    expect(checkWorkingDirectory(dir(), repo)).toMatch(/working tree|git directory/);
  });

  it('refuses a directory that holds the working tree', () => {
    expect(checkWorkingDirectory(scratch, repo)).toMatch(/holds the working tree/);
  });

  it('refuses a directory that does not exist', () => {
    expect(checkWorkingDirectory(join(scratch, 'missing'), repo)).toMatch(/does not exist/);
  });

  it('compares letter case as the file system of Windows and macOS does', () => {
    if (process.platform !== 'win32' && process.platform !== 'darwin') return; // case-sensitive FS
    expect(checkWorkingDirectory(repo.workTreeRoot.toUpperCase(), repo)).not.toBeNull();
  });
});

describe('shell of each operating system (C001-IF-013 §1 item 1)', () => {
  it('uses /bin/sh -c on Linux and macOS', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(shellInvocation('npm test', 'normal', platform, {})).toEqual({
        file: '/bin/sh',
        args: ['-c', 'npm test'],
        windowsVerbatimArguments: false,
      });
    }
  });

  it('passes the command as the argument of a prelude for a low-priority run', () => {
    const s = shellInvocation('npx stryker run', 'low', 'linux', {});
    expect(s.file).toBe('/bin/sh');
    expect(s.args[0]).toBe('-c');
    expect(s.args[1]).toContain('nice -n 10');
    expect(s.args.slice(2)).toEqual(['sddr-evidence', 'npx stryker run']);
  });

  it('uses cmd.exe /d /s /c from the system directory on Windows', () => {
    const s = shellInvocation('npm test', 'low', 'win32', { SystemRoot: 'C:\\Windows' });
    expect(s).toEqual({
      file: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', '"npm test"'],
      windowsVerbatimArguments: true,
    });
  });

  it('never takes cmd.exe from the working directory, whatever the environment holds', () => {
    expect(shellInvocation('x', 'normal', 'win32', {}).file).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(shellInvocation('x', 'normal', 'win32', { systemroot: 'D:\\Win' }).file).toBe(
      'D:\\Win\\System32\\cmd.exe',
    );
  });
});

describe('output capture (C001-IF-013 §1 item 2)', () => {
  it('keeps up to the limit and flags the rest as truncated', () => {
    const c = new OutputCapture(10);
    c.push(Buffer.from('12345'));
    c.push(Buffer.from('67890abc'));
    c.push(Buffer.from('def'));
    expect(c.result()).toEqual({
      bytes: Buffer.from('1234567890'),
      truncated: true,
      totalBytes: 16,
    });
  });

  it('is not truncated at exactly the limit', () => {
    const c = new OutputCapture(4);
    c.push(Buffer.from('abcd'));
    expect(c.result().truncated).toBe(false);
  });
});

describe('refusals before a process starts', () => {
  const failingSpawn: SpawnSeam = () => {
    throw new Error('spawn must not be called');
  };

  const expectRefusal = async (
    promise: Promise<unknown>,
    logFile: string,
    cause: RegExp,
  ): Promise<void> => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(isReviewError(error)).toBe(true);
    expect((error as ReviewError).code).toBe('ERR-EVID-002');
    expect((error as ReviewError).message).toMatch(cause);
    const logged = readFileSync(logFile, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(logged.at(-1)).toMatchObject({ code: 'ERR-EVID-002', operation: 'evidence-command' });
  };

  it('refuses the working tree as working directory, logged as ERR-EVID-002', async () => {
    const logFile = join(scratch, 'refuse-wt.jsonl');
    await expectRefusal(
      runInWorkspace({
        command: 'npm test',
        workspace: { root: repo.workTreeRoot, kind: 'run', state: 'in-run' },
        repository: repo,
        log: new ContextualLog(logFile),
        spawn: failingSpawn,
      }),
      logFile,
      /working tree/,
    );
  });

  it('refuses a workspace that no run has taken', async () => {
    const logFile = join(scratch, 'refuse-state.jsonl');
    await expectRefusal(
      runInWorkspace({
        command: 'npm test',
        workspace: { root: workspace, kind: 'run', state: 'free' },
        repository: repo,
        log: new ContextualLog(logFile),
        spawn: failingSpawn,
      }),
      logFile,
      /not taken by a run/,
    );
  });

  it('refuses an injected value that names the working tree', async () => {
    const logFile = join(scratch, 'refuse-inject.jsonl');
    await expectRefusal(
      runInWorkspace({
        command: 'npm test',
        workspace: { root: workspace, kind: 'run', state: 'in-run' },
        repository: repo,
        inject: [{ name: 'X', value: repo.workTreeRoot, position: 'append', separator: ' ' }],
        log: new ContextualLog(logFile),
        spawn: failingSpawn,
      }),
      logFile,
      /names a path/,
    );
  });

  it('reports a shell that cannot start as ERR-EVID-002 with its cause', async () => {
    const logFile = join(scratch, 'no-start.jsonl');
    const spawn: SpawnSeam = () => {
      const child = new EventEmitter() as ReturnType<SpawnSeam>;
      queueMicrotask(() => child.emit('error', new Error('spawn /bin/sh ENOENT')));
      return child;
    };
    await expectRefusal(
      runInWorkspace({
        command: 'npm test',
        workspace: { root: workspace, kind: 'run', state: 'in-run' },
        repository: repo,
        log: new ContextualLog(logFile),
        spawn,
      }),
      logFile,
      /ENOENT/,
    );
  });

  it('starts nothing for a run already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runInWorkspace({
      command: 'npm test',
      workspace: { root: workspace, kind: 'mutation', state: 'mutation' },
      repository: repo,
      signal: controller.signal,
      spawn: failingSpawn,
    });
    expect(result.ending).toBe('cancelled');
    expect(result.exitCode).toBeNull();
  });
});
