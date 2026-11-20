import { execFileSync, spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { buildFxIntake } from '../../fixtures/repos/fx-intake.js';
import { REMOVED_GIT_VARIABLES } from '../../../src/core/git/environment.js';
import { GitProcessRunner, type GitTarget, type SpawnFn } from '../../../src/core/git/process.js';
import { GIT_VERSIONS, versionOf } from './support/versions.js';

// C001-TC-025 (C001-ADR-004 A2.2, Q-hookenv-01): with each variable of the "Removed" list set to a
// decoy repository, index or object store, and with the variables set as a pre-commit hook sets
// them, every read of the adapter returns the target repository's data and never uses the decoy.

const fwd = (p: string) => p.replace(/\\/g, '/');

function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else
        out[relative(root, full)] =
          `${statSync(full).size}:${createHash('sha256').update(readFileSync(full)).digest('hex')}`;
    }
  };
  walk(root);
  return out;
}

interface Reads {
  head: string;
  index: string;
  tree: string;
  refs: string;
  revList: string;
  user: string;
  blob: string | null;
}

async function reads(runner: GitProcessRunner, target: GitTarget): Promise<Reads> {
  const text = async (command: string, args: string[]) =>
    (await runner.run(command, args, { target })).stdout.toString('latin1');
  const batch = runner.batch(target);
  const blob = await batch.read('HEAD:src/cart.ts');
  await batch.close();
  return {
    head: await text('rev-parse', ['HEAD']),
    index: await text('ls-files', ['-s', '-z']),
    tree: await text('ls-tree', ['-r', '-z', 'HEAD']),
    refs: await text('for-each-ref', ['--format=%(refname) %(objectname)']),
    revList: await text('rev-list', ['HEAD']),
    user: await text('config', ['--get', 'user.name']),
    blob: blob?.content.toString('utf8') ?? null,
  };
}

describe.each(GIT_VERSIONS)('hook environment on $label', ({ path, expect: pinned }) => {
  const enabled = path !== undefined;
  let work: string;
  let target: FixtureRepo;
  let decoy: FixtureRepo;
  let targetC1 = '';
  let decoyIndex = '';

  beforeAll(() => {
    if (!path) return;
    if (pinned) expect(versionOf(path)).toContain(`git version ${pinned}.`);
    work = mkdtempSync(join(tmpdir(), 'sddhook-'));
    target = buildFxIntake();
    targetC1 = target.commit('C1', { files: { 'src/cart.ts': 'export const cart = 1;\n' } }).hash;
    // The target has a staged edit (in the index only) and an unstaged edit.
    target.write('src/util.ts', 'export const util = "staged";\n').stage('src/util.ts');
    target.write('src/order.ts', 'export const order = "unstaged";\n');

    decoy = FixtureRepo.create();
    decoy.commit('D0', { files: { 'decoy.txt': 'decoy\n', 'src/cart.ts': 'decoy cart\n' } });
    decoy.commit('D1', { files: { 'decoy2.txt': 'decoy 2\n' } });
    decoyIndex = join(work, 'decoy-index');
    writeFileSync(decoyIndex, readFileSync(join(decoy.dir, '.git', 'index')));
  });
  afterAll(() => {
    if (!enabled) return;
    target.dispose();
    decoy.dispose();
    rmSync(work, { recursive: true, force: true });
  });

  /** The value of each removed variable that points at the decoy (or otherwise misleads git). */
  const decoyValues = (): Record<string, string> => {
    const graft = join(work, 'graft');
    writeFileSync(graft, `${targetC1}\n`);
    const shallow = join(work, 'shallow');
    writeFileSync(shallow, `${targetC1}\n`);
    const config = join(work, 'decoy-config');
    writeFileSync(config, '[user]\n\tname = Decoy User\n');
    const decoyGit = join(decoy.dir, '.git');
    return {
      GIT_DIR: decoyGit,
      GIT_WORK_TREE: decoy.dir,
      GIT_IMPLICIT_WORK_TREE: '0',
      GIT_COMMON_DIR: decoyGit,
      GIT_INDEX_FILE: decoyIndex,
      GIT_OBJECT_DIRECTORY: join(decoyGit, 'objects'),
      GIT_ALTERNATE_OBJECT_DIRECTORIES: join(decoyGit, 'objects'),
      GIT_GRAFT_FILE: graft,
      GIT_SHALLOW_FILE: shallow,
      GIT_CONFIG: config,
      GIT_REPLACE_REF_BASE: 'refs/decoy-replace/',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_PREFIX: 'src/',
      GIT_NAMESPACE: 'decoy',
      GIT_QUARANTINE_PATH: join(decoyGit, 'objects'),
    };
  };

  const targetOf = (): GitTarget => ({ gitDir: join(target.dir, '.git'), workTree: target.dir });
  const cleanBase = (): NodeJS.ProcessEnv => {
    const env = { ...process.env };
    for (const n of REMOVED_GIT_VARIABLES) delete env[n];
    return env;
  };

  it.skipIf(!enabled)('the decoy values cover the whole "Removed" list', () => {
    expect(Object.keys(decoyValues()).sort()).toEqual([...REMOVED_GIT_VARIABLES].sort());
  });

  it.skipIf(!enabled)(
    'each removed variable set to a decoy changes no read',
    { timeout: 120_000 },
    async () => {
      const expected = await reads(
        new GitProcessRunner({ gitPath: path!, baseEnv: cleanBase() }),
        targetOf(),
      );
      expect(expected.blob).toBe('export const cart = 1;\n');
      expect(expected.head.trim()).toBe(targetC1);
      expect(expected.user).toContain('Fixture Author');
      const decoyBefore = snapshot(decoy.dir);
      const spawned: NodeJS.ProcessEnv[] = [];
      const spy: SpawnFn = (file, args, options) => {
        spawned.push(options.env);
        return nodeSpawn(file, [...args], options);
      };
      for (const [name, value] of Object.entries(decoyValues())) {
        const runner = new GitProcessRunner({
          gitPath: path!,
          baseEnv: { ...cleanBase(), [name]: value },
          spawn: spy,
        });
        expect(await reads(runner, targetOf()), name).toEqual(expected);
        // Discovery from the directory, as G-01 does, finds the target and not the decoy.
        const found = await runner.run('rev-parse', ['--show-toplevel'], {
          target: { discoverFrom: target.dir },
        });
        expect(resolve(found.stdout.toString('utf8').trim()), name).toBe(resolve(target.dir));
      }
      expect(spawned.length).toBeGreaterThan(50);
      // No process of the adapter had a variable of the list in its environment.
      const listed = new Set(REMOVED_GIT_VARIABLES);
      for (const env of spawned) {
        expect(Object.keys(env).filter((k) => listed.has(k.toUpperCase()))).toEqual([]);
      }
      expect(snapshot(decoy.dir)).toEqual(decoyBefore);
    },
  );

  it.skipIf(!enabled)(
    'controls: plain git does read the decoy through GIT_DIR and GIT_INDEX_FILE',
    async () => {
      const expected = await reads(
        new GitProcessRunner({ gitPath: path!, baseEnv: cleanBase() }),
        targetOf(),
      );
      const plain = (name: string, args: string[]) =>
        execFileSync(path!, ['--git-dir', join(target.dir, '.git'), ...args], {
          cwd: target.dir,
          env: { ...cleanBase(), [name]: decoyValues()[name]! },
        }).toString('latin1');
      expect(plain('GIT_INDEX_FILE', ['ls-files', '-s', '-z'])).not.toBe(expected.index);
      const viaDir = execFileSync(path!, ['rev-parse', 'HEAD'], {
        cwd: target.dir,
        env: { ...cleanBase(), GIT_DIR: decoyValues().GIT_DIR! },
      }).toString('latin1');
      expect(viaDir).not.toBe(expected.head);
    },
  );

  it.skipIf(!enabled)(
    'a review started from a real pre-commit hook reads the repository index, not the hook temporary index',
    { timeout: 120_000 },
    () => {
      const require = createRequire(import.meta.url);
      const tsx = pathToFileURL(require.resolve('tsx/esm')).href;
      const probe = resolve('test/integration/git/support/hook-probe.ts');
      const out = join(work, 'hook-result.json');
      const hook = join(target.dir, '.git', 'hooks', 'pre-commit');
      writeFileSync(
        hook,
        `#!/bin/sh\nexec "${fwd(process.execPath)}" --import "${tsx}" "${fwd(probe)}" "${fwd(out)}" "${fwd(path!)}"\n`,
      );
      chmodSync(hook, 0o755);

      // The index as a plain shell sees it before the commit.
      const plainBefore = execFileSync(path!, ['ls-files', '-s', '-z'], {
        cwd: target.dir,
        env: cleanBase(),
      }).toString('latin1');

      // A commit of chosen paths: git builds a temporary index and sets GIT_INDEX_FILE for the hook.
      target.git('commit', '-q', '-m', 'order only', '--', 'src/order.ts');
      const seen = JSON.parse(readFileSync(out, 'utf8')) as {
        present: string[];
        indexFile: string | null;
        adapterIndex: string;
        rawIndex: string;
        head: string;
        blob: string | null;
        status: number[];
      };

      expect(seen.status).toEqual([0, 0, 0]);
      // The hook really ran with a temporary index in its environment ...
      expect(seen.present).toContain('GIT_INDEX_FILE');
      expect(seen.indexFile).not.toBeNull();
      expect(resolve(target.dir, seen.indexFile!)).not.toBe(resolve(target.dir, '.git', 'index'));
      // ... which would have misled a plain git command (the staged edit of src/util.ts is not in it) ...
      expect(seen.rawIndex).not.toBe(plainBefore);
      // ... and the adapter read the repository's own index and objects.
      expect(seen.adapterIndex).toBe(plainBefore);
      expect(seen.head).toBe(targetC1);
      expect(seen.blob).toBe('export const cart = 1;\n');
      // The commit itself succeeded and holds the chosen path.
      expect(target.git('show', '--name-only', '--format=', 'HEAD')).toBe('src/order.ts');
    },
  );
});
