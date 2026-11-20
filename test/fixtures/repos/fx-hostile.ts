import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureRepo } from '../builder/fixture-repo.js';

/**
 * `fx-hostile` (C001-TC-024, C001-ADR-004 Consequences and A1.8): a repository whose configuration,
 * hooks and attributes would start a program or open a connection if git ran them. Every program
 * is a probe that appends its name to a log outside the repository; a local server counts the
 * connections that the promisor remote would make.
 */
export interface HostileFixture {
  readonly repo: FixtureRepo;
  readonly probeDir: string;
  /** Names of the probes that were started, in order. */
  started(): string[];
  clearStarted(): void;
  /** Connections that the local server accepted. */
  connections(): number;
  /** Object id of a blob that the repository lacks and that its promisor remote would deliver. */
  readonly missingBlob: string;
  dispose(): Promise<void>;
}

const fwd = (path: string) => path.replace(/\\/g, '/');

export async function buildFxHostile(): Promise<HostileFixture> {
  const probeDir = mkdtempSync(join(tmpdir(), 'sddprobe-'));
  const probe = join(probeDir, 'probe.sh');
  const log = join(probeDir, 'started.log');
  writeFileSync(
    probe,
    `#!/bin/sh\necho "$1" >> "${fwd(log)}"\ncase "$1" in filter-*) cat;; esac\nexit 0\n`,
  );
  chmodSync(probe, 0o755);
  const run = (name: string) => `sh ${fwd(probe)} ${name}`;

  let connections = 0;
  const server: Server = createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;

  const repo = FixtureRepo.create();
  repo.commit('B0', {
    subject: 'B0: base',
    files: {
      '.gitattributes': '*.dat filter=hostile diff=hostile\n',
      'src/a.txt': 'a\n',
      'src/b.txt': 'b\n',
      'hostile.dat': 'raw stored data\n',
      'lfs.bin':
        'version https://git-lfs.github.com/spec/v1\noid sha256:' + '0'.repeat(64) + '\nsize 3\n',
    },
  });
  // Dirty states: an unstaged edit, a staged edit, an edit under the filter, an untracked file.
  repo.write('src/a.txt', 'a edited\n');
  repo.write('src/b.txt', 'b staged\n');
  repo.stage('src/b.txt');
  repo.write('hostile.dat', 'edited under a filter\n');
  repo.write('untracked.dat', 'new\n');

  // A blob that the repository will lack: written, then its loose object removed.
  const blobSource = repo.path('lazy.tmp');
  writeFileSync(blobSource, 'a blob that only the promisor remote has\n');
  const lazyOid = repo.git('hash-object', '-w', '--no-filters', blobSource);
  rmSync(blobSource);
  const looseObject = join(repo.dir, '.git', 'objects', lazyOid.slice(0, 2), lazyOid.slice(2));

  // The hostile configuration.
  const config: Array<[string, string]> = [
    ['core.fsmonitor', run('fsmonitor')],
    ['filter.hostile.clean', run('filter-clean')],
    ['filter.hostile.smudge', run('filter-smudge')],
    ['filter.hostile.process', run('filter-process')],
    ['diff.hostile.textconv', run('textconv')],
    ['diff.hostile.command', run('external-diff')],
    ['diff.external', run('external-diff-global')],
    ['core.pager', run('pager')],
    ['pager.log', run('pager-log')],
    ['pager.diff', run('pager-diff')],
    ['credential.helper', `!${run('credential')}`],
    ['core.sshCommand', run('ssh')],
    ['core.askPass', run('askpass')],
    ['core.editor', run('editor')],
    ['remote.origin.url', `git://127.0.0.1:${port}/hostile.git`],
    ['remote.origin.promisor', 'true'],
    ['remote.origin.partialclonefilter', 'blob:none'],
    ['remote.other.url', 'ssh://example.invalid/hostile.git'],
    ['core.repositoryformatversion', '1'],
    ['extensions.partialClone', 'origin'],
  ];
  for (const [key, value] of config) repo.setConfig(key, value);

  const hooks = [
    'pre-commit',
    'post-commit',
    'post-checkout',
    'post-merge',
    'post-rewrite',
    'post-index-change',
    'reference-transaction',
    'pre-push',
    'pre-auto-gc',
    'fsmonitor-watchman',
  ];
  mkdirSync(join(repo.dir, '.git', 'hooks'), { recursive: true });
  for (const hook of hooks) {
    const file = join(repo.dir, '.git', 'hooks', hook);
    writeFileSync(file, `#!/bin/sh\nsh ${fwd(probe)} hook-${hook}\n`);
    chmodSync(file, 0o755);
  }
  // Last, so that no builder command above fetches: the object that the remote would deliver.
  rmSync(looseObject, { force: true });

  return {
    repo,
    probeDir,
    started: () =>
      existsSync(log)
        ? readFileSync(log, 'utf8')
            .split('\n')
            .filter((l) => l.length > 0)
        : [],
    clearStarted: () => rmSync(log, { force: true }),
    connections: () => connections,
    missingBlob: lazyOid,
    async dispose() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      repo.dispose();
      rmSync(probeDir, { recursive: true, force: true });
    },
  };
}
