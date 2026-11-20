import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { buildFxHostile, type HostileFixture } from '../../fixtures/repos/fx-hostile.js';
import { buildFxIntake } from '../../fixtures/repos/fx-intake.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { GIT_VERSIONS, versionOf } from './support/versions.js';
import { runAllOperations } from './support/all-operations.js';

// C001-T-006 / C001-REQ-120: every operation of the git adapter leaves the repository
// byte-identical (no lock file, no refreshed index), starts no program of the repository and opens
// no connection, on the hostile repository and on a repository with hidden-edit index flags.

function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        out[relative(root, full).replace(/\\/g, '/')] =
          `${statSync(full).size}:${createHash('sha256').update(readFileSync(full)).digest('hex')}`;
      }
    }
  };
  walk(root);
  return out;
}

describe.each(GIT_VERSIONS)(
  'every operation is read-only on $label',
  ({ path, expect: pinned }) => {
    const enabled = path !== undefined;
    let hostile: HostileFixture;
    let flagged: FixtureRepo;

    beforeAll(async () => {
      if (!path) return;
      if (pinned) expect(versionOf(path)).toContain(`git version ${pinned}.`);
      hostile = await buildFxHostile();
      flagged = buildFxIntake();
      flagged.commit('C1', { files: { 'src/cart.ts': 'export const cart = 1;\n' } });
      flagged.git('update-index', '--assume-unchanged', 'src/util.ts');
      flagged.git('update-index', '--skip-worktree', 'src/order.ts');
      flagged.write('src/util.ts', 'hidden edit\n').write('src/order.ts', 'hidden edit 2\n');
      flagged.write('untracked.txt', 'u\n');
    });
    afterAll(async () => {
      if (!enabled) return;
      await hostile?.dispose();
      flagged?.dispose();
    });

    it.skipIf(!enabled)(
      'the hostile repository: no program, no connection, no changed byte, no lock file',
      { timeout: 180_000 },
      async () => {
        const before = snapshot(hostile.repo.dir);
        hostile.clearStarted();
        const adapter = new GitAdapter({ gitPath: path });
        try {
          const results = await runAllOperations(adapter, hostile.repo.dir, [
            'src/a.txt',
            'hostile.dat',
            'lfs.bin',
          ]);
          // each operation answered (a ReviewError would be recorded as { error })
          for (const id of ['G-01', 'G-02', 'G-07', 'G-12', 'G-13', 'G-15']) {
            expect(results[id], id).not.toHaveProperty('error');
          }
          const changed = (results['G-07'] as Array<{ path: string }>).map((f) => f.path);
          expect(changed).toEqual(expect.arrayContaining(['src/a.txt', 'src/b.txt']));
        } finally {
          await adapter.close();
        }
        expect(hostile.started()).toEqual([]);
        expect(hostile.connections()).toBe(0);
        expect(snapshot(hostile.repo.dir)).toEqual(before);
        expect(Object.keys(before).filter((f) => f.endsWith('.lock'))).toEqual([]);
      },
    );

    it.skipIf(!enabled)(
      'a repository with assume-unchanged and skip-worktree edits is not modified, and the edits are seen',
      { timeout: 180_000 },
      async () => {
        const before = snapshot(flagged.dir);
        const adapter = new GitAdapter({ gitPath: path });
        let results: Record<string, unknown>;
        try {
          results = await runAllOperations(adapter, flagged.dir, ['src/cart.ts', 'src/util.ts']);
        } finally {
          await adapter.close();
        }
        const changed = (results['G-07'] as Array<{ path: string }>).map((f) => f.path).sort();
        expect(changed).toEqual(['src/cart.ts', 'src/order.ts', 'src/util.ts', 'untracked.txt']);
        expect(snapshot(flagged.dir)).toEqual(before);
      },
    );
  },
);
