import { createHash } from 'node:crypto';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildFxHostile, type HostileFixture } from '../../fixtures/repos/fx-hostile.js';
import {
  GitCommandRejected,
  GitProcessRunner,
  type GitTarget,
} from '../../../src/core/git/process.js';
import { GIT_VERSIONS, versionOf } from './support/versions.js';

// C001-TC-024 (C001-ADR-004 A1.8): the hostile repository runs no program, opens no connection and
// changes no byte, on git 2.34.0 and on the latest git release. The git on PATH always runs; the
// other two run when SDD_GIT_234 and SDD_GIT_LATEST name their executables.

/** Every file of a directory tree with the hash of its bytes: the repository before and after. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const rel = relative(root, full).replace(/\\/g, '/');
        out[rel] =
          `${statSync(full).size}:${createHash('sha256').update(readFileSync(full)).digest('hex')}`;
      }
    }
  };
  walk(root);
  return out;
}

const execFileAsync = promisify(execFile);

describe.each(GIT_VERSIONS)('hostile repository on $label', ({ path, expect: pinned }) => {
  const enabled = path !== undefined;
  let fx: HostileFixture;
  let runner: GitProcessRunner;
  let target: GitTarget;

  beforeAll(async () => {
    if (!path) return;
    if (pinned) expect(versionOf(path)).toContain(`git version ${pinned}.`);
    fx = await buildFxHostile();
    runner = new GitProcessRunner({ gitPath: path });
    target = { gitDir: join(fx.repo.dir, '.git'), workTree: fx.repo.dir };
  });
  afterAll(async () => {
    await runner?.cancelAll();
    await fx?.dispose();
  });

  const READS: Array<[string, string[]]> = [
    ['rev-parse', ['HEAD']],
    ['rev-parse', ['--show-toplevel', '--git-dir', '--git-common-dir']],
    ['ls-files', ['-s', '-z']],
    ['ls-files', ['--debug', '-s']],
    ['ls-files', ['-o', '--exclude-standard', '-z']],
    ['ls-files', ['--eol', '-z']],
    ['ls-files', ['-d', '-z']],
    ['ls-tree', ['-r', '-z', 'HEAD']],
    ['for-each-ref', ['--format=%(refname) %(objectname)']],
    ['show-ref', []],
    ['symbolic-ref', ['HEAD']],
    ['rev-list', ['HEAD']],
    ['merge-base', ['HEAD', 'HEAD']],
    ['config', ['--get', 'core.autocrlf']],
    ['config', ['--list', '--null']],
    ['config', ['--get', 'filter.hostile.clean']],
    ['log', ['--format=%H', '--name-status', 'HEAD']],
    ['diff-tree', ['--no-commit-id', '--name-only', '-r', 'HEAD']],
  ];

  it.skipIf(!enabled)(
    'runs no program, opens no connection and writes nothing during the read operations',
    async () => {
      const before = snapshot(fx.repo.dir);
      fx.clearStarted();

      for (const [command, args] of READS) {
        const r = await runner.run(command, args, { target });
        // Exit status 1 is a legitimate answer for some reads (for example an unset key).
        expect(r.status === 0 || r.status === 1, `${command} ${args.join(' ')}: ${r.stderr}`).toBe(
          true,
        );
      }
      const discovered = await runner.run('rev-parse', ['--git-dir'], {
        target: { discoverFrom: fx.repo.dir },
      });
      expect(discovered.status).toBe(0);

      // The persistent process: a blob under a filter, and the blob that only the promisor remote has.
      const batch = runner.batch(target);
      const filtered = await batch.read('HEAD:hostile.dat');
      expect(filtered?.content.toString('utf8')).toBe('raw stored data\n');
      const lazy = await batch.read(fx.missingBlob).then(
        (o) => o,
        () => null,
      );
      expect(lazy).toBeNull();
      await batch.cancel();

      expect(fx.started()).toEqual([]);
      expect(fx.connections()).toBe(0);
      expect(snapshot(fx.repo.dir)).toEqual(before);
      expect(runner.liveProcessCount).toBe(0);
    },
  );

  it.skipIf(!enabled)('the probes are live: git without the profile starts them', async () => {
    // Control for the test above. The unhardened program runs the same repository, so a green
    // result above is not an artefact of probes that cannot start or a server that cannot be reached.
    fx.clearStarted();
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    // Asynchronous: the local server of the fixture must be able to accept while git waits.
    const git = (...args: string[]) =>
      execFileAsync(
        path!,
        ['--git-dir', join(fx.repo.dir, '.git'), '--work-tree', fx.repo.dir, ...args],
        { cwd: fx.repo.dir, env, timeout: 30_000 },
      );
    await git('status', '--porcelain');
    expect(fx.started()).toContain('fsmonitor');
    const connectionsBefore = fx.connections();
    try {
      await git('cat-file', '-p', fx.missingBlob);
    } catch {
      // the fetch fails: only the connection attempt matters
    }
    expect(fx.connections()).toBeGreaterThan(connectionsBefore);
    fx.clearStarted();
  });

  it.skipIf(!enabled)('rejects what is outside the read-only allowlist', async () => {
    const reject = async (command: string, args: string[]) =>
      await expect(runner.run(command, args, { target })).rejects.toBeInstanceOf(
        GitCommandRejected,
      );
    for (const command of [
      'status',
      'diff',
      'diff-files',
      'diff-index',
      'add',
      'commit',
      'fetch',
      'gc',
      'update-index',
      'checkout',
      'reset',
      'pull',
      'push',
      'clone',
      'blame',
      'grep',
      'init',
      'remote',
    ]) {
      await reject(command, []);
    }
    await reject('config', ['user.name', 'x']);
    await reject('config', ['--add', 'a.b', 'c']);
    await reject('config', ['--unset', 'a.b']);
    await reject('config', ['--edit']);
    await reject('ls-files', ['-m']);
    await reject('cat-file', ['--textconv', 'HEAD:hostile.dat']);
    await reject('cat-file', ['--filters', 'HEAD:hostile.dat']);
    await reject('log', ['-p']);
    await reject('log', ['--output=x.txt']);
    await reject('diff-tree', ['--stat', 'HEAD']);
  });

  it.skipIf(!enabled)('the hardening profile disables fsmonitor with an empty value', () => {
    // D-008: on git 2.34 `core.fsmonitor=false` is a program that git starts; the empty value is not.
    const startsProgram = (value: string): boolean => {
      const r = spawnSync(
        path!,
        ['-c', `core.fsmonitor=${value}`, '--no-optional-locks', 'ls-files', '-s'],
        {
          cwd: fx.repo.dir,
          env: { ...process.env, GIT_TRACE: '1' },
          encoding: 'utf8',
        },
      );
      return /run_command/.test(r.stderr);
    };
    expect(startsProgram('')).toBe(false);
    // Measured on 2.34.0 (report row G-05): the value "false" starts a program there.
    if (pinned === '2.34') expect(startsProgram('false')).toBe(true);
  });

  it.skipIf(!enabled)('cancellation leaves no git process behind', async () => {
    const batch = runner.batch(target);
    expect((await batch.read('HEAD:src/a.txt'))?.content.toString('utf8')).toBe('a\n');
    const pid = batch.pid!;
    // On Windows cmd\git.exe starts the real git as a child: collect the descendants first.
    const pids = new Set<number>([pid]);
    if (process.platform === 'win32') {
      const out = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${pid} } | ForEach-Object { $_.ProcessId }`,
        ],
        { encoding: 'utf8' },
      );
      for (const line of out.split(/\s+/).filter(Boolean)) pids.add(Number(line));
    }
    await batch.cancel();
    expect(runner.liveProcessCount).toBe(0);
    const alive = (p: number) => {
      try {
        process.kill(p, 0);
        return true;
      } catch {
        return false;
      }
    };
    expect([...pids].filter(alive)).toEqual([]);
    await expect(batch.read('HEAD:src/a.txt')).rejects.toBeInstanceOf(Error);
  });
});
