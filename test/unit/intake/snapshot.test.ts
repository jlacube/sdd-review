import { readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { buildFxIntake } from '../../fixtures/repos/fx-intake.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import { StoreLayout } from '../../../src/core/store/root.js';
import { SnapshotStore } from '../../../src/core/store/snapshots.js';
import { canonicalJson, snapshotIdOf, takeInChange } from '../../../src/core/intake/snapshot.js';
import type { ChangeFile } from '../../../src/core/intake/change.js';
import type { ChangedFile } from '../../../src/core/git/port.js';
import { cleanTempDirs, loggedCodes, sha256, tempDir } from '../store/helpers.js';

// C001-REQ-101, C001-REQ-102, C001-REQ-115 on fixture repositories: the git port and the store are
// the real ones; the intake is the pure core module.

// Each test builds a repository with a few dozen git processes: slow on Windows.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const NOW = new Date('2026-11-20T10:00:00.000Z');
const cartLines = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `export const ${tag}${i} = ${i};\n`).join('');

interface Rig {
  readonly fx: FixtureRepo;
  readonly git: GitAdapter;
  readonly store: SnapshotStore;
  readonly logFile: string;
  intake(namedBase: string): ReturnType<typeof takeInChange>;
}

const rigs: Array<Rig & { owned: boolean }> = [];

async function rig(fx: FixtureRepo, owned = true): Promise<Rig> {
  const dir = tempDir('intake');
  const logFile = join(dir, 'log.jsonl');
  const log = new ContextualLog(logFile);
  const git = new GitAdapter({ log });
  const location = await git.discover(fx.dir);
  const layout = new StoreLayout(join(dir, 'root'), 'k'.repeat(64));
  const store = new SnapshotStore({ log, lockPollMs: 5 }, layout);
  const made: Rig = {
    fx,
    git,
    store,
    logFile,
    intake: (namedBase) =>
      takeInChange(
        { git, store, log, repositoryRoot: location.workTreeRoot, now: () => NOW },
        { namedBase },
      ),
  };
  rigs.push({ ...made, owned });
  return made;
}

afterEach(async () => {
  for (const r of rigs.splice(0)) {
    await r.git.close();
    if (r.owned) r.fx.dispose();
  }
  cleanTempDirs();
});

/** fx-intake with the working tree of C001-TS-101: B0, then C1 on HEAD, plus uncommitted edits. */
function intakeFixture(): FixtureRepo {
  const fx = buildFxIntake();
  fx.commit('C1', {
    subject: 'C1: cart',
    files: { 'src/cart.ts': 'export const cart = (n: number) => n * 2;\nexport const c1 = 1;\n' },
  });
  fx.write('src/order.ts', `${fx.read('src/order.ts')}// uncommitted\n`);
  return fx;
}

describe('takeInChange', () => {
  let r: Rig;
  // One repository for the tests that only edit the working tree; each test starts from the same state.
  let shared: FixtureRepo;
  beforeAll(() => {
    shared = intakeFixture();
  });
  afterAll(() => shared.dispose());
  beforeEach(async () => {
    shared.git('reset', '-q', '--hard', 'HEAD');
    shared.git('clean', '-q', '-fdx');
    shared.write(
      'src/order.ts',
      `${shared.read('src/order.ts')}// uncommitted
`,
    );
    r = await rig(shared, false);
  });

  it('takes in modified, deleted, renamed and untracked files with their hunks (TS-101)', async () => {
    const { fx } = r;
    fx.write('src/cart.ts', `${fx.read('src/cart.ts')}// edited\n`);
    fx.remove('src/legacy.ts');
    fx.moveInWorkingTree('src/util.ts', 'src/helpers.ts');
    fx.write('src/promo.ts', 'export const promo = true;\n');
    const result = await r.intake(fx.label('B0').hash);
    if (result.status !== 'created') throw new Error('expected a new snapshot');
    const { snapshot, hunks } = result.intake;
    const byPath = new Map(snapshot.changedFiles.map((f) => [f.path, f]));
    expect([...byPath.keys()]).toEqual([
      'src/cart.ts',
      'src/helpers.ts',
      'src/legacy.ts',
      'src/order.ts',
      'src/promo.ts',
    ]);
    expect(byPath.get('src/cart.ts')).toMatchObject({ changeType: 'modified', changedLines: 2 });
    expect(byPath.get('src/legacy.ts')).toMatchObject({ changeType: 'deleted', mode: null });
    expect(byPath.get('src/helpers.ts')).toMatchObject({
      changeType: 'renamed',
      oldPath: 'src/util.ts',
      changedLines: 0,
      hunkIds: [],
    });
    expect(byPath.get('src/promo.ts')).toMatchObject({ changeType: 'added', mode: 'regular' });
    expect(snapshot.changedLines).toBe(hunks.reduce((n, h) => n + h.changedLines, 0));
    expect(snapshot).toMatchObject({
      baseChoice: 'named',
      namedValue: fx.label('B0').hash,
      baseCommit: { hash: fx.label('B0').hash },
      headCommit: fx.label('C1').hash,
      createdAt: NOW.toISOString(),
    });
    for (const file of snapshot.changedFiles) {
      expect(file.hunkIds).toEqual(hunks.filter((h) => h.path === file.path).map((h) => h.hunkId));
    }
    expect(result.intake.intakeSummary).toMatchObject({ changedFiles: 5 });
  });

  it('names the subject of the base commit, empty for a root commit that the port cannot start a range at', async () => {
    const asC1 = await r.intake(r.fx.label('C1').hash);
    if (asC1.status !== 'created') throw new Error('expected a new snapshot');
    expect(asC1.intake.snapshot.baseCommit.subject).toBe('C1: cart');
    expect(asC1.intake.intakeSummary.baseCommit.subject).toBe('C1: cart');
    const asB0 = await r.intake(r.fx.label('B0').hash);
    if (asB0.status !== 'created') throw new Error('expected a new snapshot');
    expect(asB0.intake.snapshot.baseCommit.subject).toBe('');
  });

  it('stores the document and the snapshot-side content of the text and binary files', async () => {
    const { fx } = r;
    fx.write('src/promo.ts', 'export const promo = true;\n');
    fx.write('logo.bin', Buffer.from([0, 1, 2, 3]));
    const result = await r.intake(fx.label('B0').hash);
    if (result.status !== 'created') throw new Error('expected a new snapshot');
    const stored = await r.store.readSnapshot(result.snapshotId);
    expect(stored).toEqual(JSON.parse(JSON.stringify(result.intake)));
    const promo = stored.snapshot.changedFiles.find((f) => f.path === 'src/promo.ts')!;
    expect(promo.contentHash).toBe(sha256('export const promo = true;\n'));
    expect((await r.store.readBlob(result.snapshotId, promo.contentHash!)).toString()).toBe(
      'export const promo = true;\n',
    );
    const logo = stored.snapshot.changedFiles.find((f) => f.path === 'logo.bin')!;
    // C001-T-026: a binary file has no hunk and 0 changed lines, and its bytes are kept.
    expect(logo).toMatchObject({ binary: true, changedLines: 0, hunkIds: [] });
    expect(logo.contentHash).toBe(sha256(Buffer.from([0, 1, 2, 3])));
    expect(await r.store.readBlob(result.snapshotId, logo.contentHash!)).toEqual(
      Buffer.from([0, 1, 2, 3]),
    );
    expect(stored.hunks.some((h) => h.path === 'logo.bin')).toBe(false);
  });

  it('counts staged and unstaged edits alike (TS-102)', async () => {
    const { fx } = r;
    fx.write('src/cart.ts', `${fx.read('src/cart.ts')}${cartLines(4, 'staged')}`);
    fx.stage('src/cart.ts');
    fx.write('src/order.ts', `${fx.read('src/order.ts')}${cartLines(2, 'loose')}`);
    const result = await r.intake(fx.label('B0').hash);
    if (result.status !== 'created') throw new Error('expected a new snapshot');
    const files = new Map(result.intake.snapshot.changedFiles.map((f) => [f.path, f]));
    // cart.ts differs from B0 by C1's added line and the 4 staged lines; order.ts by 1 + 2 added lines
    expect(files.get('src/cart.ts')!.changedLines).toBe(1 + 4);
    expect(files.get('src/order.ts')!.changedLines).toBe(1 + 2);
  });

  it('leaves out untracked files that the ignore rules exclude (TS-103)', async () => {
    const { fx } = r;
    fx.ignore('dist/');
    fx.write('dist/bundle.js', 'x\n');
    fx.write('notes/todo.md', '- a\n');
    const result = await r.intake(fx.label('B0').hash);
    if (result.status !== 'created') throw new Error('expected a new snapshot');
    const paths = result.intake.snapshot.changedFiles.map((f) => f.path);
    expect(paths).toContain('notes/todo.md');
    expect(paths).not.toContain('dist/bundle.js');
  });

  it('reports an existing snapshot and writes nothing (C001-T-008 step 4)', async () => {
    const first = await r.intake(r.fx.label('B0').hash);
    expect(first.status).toBe('created');
    const file = join(r.store.snapshotDir(first.snapshotId), 'snapshot.json');
    const before = readFileSync(file);
    const again = await r.intake(r.fx.label('B0').hash);
    expect(again).toEqual({
      status: 'existing',
      snapshotId: first.snapshotId,
      baseCommit: r.fx.label('B0').hash,
      headCommit: r.fx.label('C1').hash,
    });
    expect(readFileSync(file)).toEqual(before);
    expect(await r.store.listReviews()).toHaveLength(1);
  });

  describe('snapshot ID (C001-REQ-115, TS-133, TS-134, TS-135)', () => {
    it('is the same for the same state on every run', async () => {
      const a = await r.intake(r.fx.label('B0').hash);
      const b = await r.intake(r.fx.label('B0').hash);
      expect(b.snapshotId).toBe(a.snapshotId);
      expect(a.snapshotId).toMatch(/^s-[0-9a-f]{64}$/);
    });

    it('is the same when the repository is rebuilt in another directory', async () => {
      const a = await r.intake(r.fx.label('B0').hash);
      const other = await rig(intakeFixture());
      expect(other.fx.dir).not.toBe(r.fx.dir);
      const b = await other.intake(other.fx.label('B0').hash);
      expect(b.snapshotId).toBe(a.snapshotId);
    });

    it('ignores a change of modification time without a change of content (TS-135)', async () => {
      const a = await r.intake(r.fx.label('B0').hash);
      const later = new Date(Date.now() + 3_600_000);
      utimesSync(r.fx.path('src/order.ts'), later, later);
      const b = await r.intake(r.fx.label('B0').hash);
      expect(b.snapshotId).toBe(a.snapshotId);
    });

    it('differs when one byte of the working tree differs', async () => {
      const a = await r.intake(r.fx.label('B0').hash);
      r.fx.write(
        'src/order.ts',
        `${r.fx.read('src/order.ts').replace('uncommitted', 'uncommittee')}`,
      );
      const b = await r.intake(r.fx.label('B0').hash);
      expect(b.status).toBe('created');
      expect(b.snapshotId).not.toBe(a.snapshotId);
      expect(await r.store.listReviews()).toHaveLength(2); // earlier snapshots stay
    });

    it('differs when HEAD moves or the base commit changes (TS-134)', async () => {
      const own = await rig(intakeFixture());
      const a = await own.intake(own.fx.label('B0').hash);
      const asC1 = await own.intake(own.fx.label('C1').hash);
      expect(asC1.snapshotId).not.toBe(a.snapshotId);
      own.fx.commit('C2', { files: { 'src/order.ts': own.fx.read('src/order.ts') } });
      const moved = await own.intake(own.fx.label('B0').hash);
      expect(moved.snapshotId).not.toBe(a.snapshotId);
    });
  });

  describe('base commit (C001-REQ-102, TS-105)', () => {
    it('takes the merge base of the named branch and HEAD: a branch that moved on adds nothing', async () => {
      const fx = FixtureRepo.create();
      fx.commit('M1', {
        files: { 'src/cart.ts': 'cart\n', 'docs/release.md': '# release\n' },
      });
      fx.git('checkout', '-q', '-b', 'agent/cart');
      fx.commit('C1', { files: { 'src/cart.ts': 'cart 1\n' } });
      fx.checkout('main');
      fx.commit('M2', { files: { 'docs/release.md': '# release 2\n' } });
      fx.commit('M3', { files: { 'docs/release.md': '# release 3\n' } });
      fx.checkout('agent/cart');
      const second = await rig(fx);
      const result = await second.intake('main');
      if (result.status !== 'created') throw new Error('expected a new snapshot');
      expect(result.intake.snapshot.baseCommit.hash).toBe(fx.label('M1').hash);
      expect(result.intake.snapshot.namedValue).toBe('main');
      expect(result.intake.snapshot.changedFiles.map((f) => f.path)).toEqual(['src/cart.ts']);
    });

    it('rejects a value that names no commit with ERR-INTAKE-003, logged', async () => {
      await expect(r.intake('no-such-branch')).rejects.toMatchObject({ code: 'ERR-INTAKE-003' });
      expect(loggedCodes(r.logFile)).toContain('ERR-INTAKE-003');
    });

    it('rejects a commit with no common ancestor with HEAD with ERR-INTAKE-004, logged', async () => {
      const own = await rig(intakeFixture());
      own.fx.git('checkout', '-q', '--orphan', 'other');
      own.fx.git('rm', '-rf', '-q', '.');
      own.fx.write('x.txt', 'x\n');
      own.fx.git('add', 'x.txt');
      own.fx.commit('O1');
      own.fx.checkout('main');
      await expect(own.intake('other')).rejects.toMatchObject({ code: 'ERR-INTAKE-004' });
      expect(loggedCodes(own.logFile)).toContain('ERR-INTAKE-004');
    });

    it('rejects an empty change with ERR-INTAKE-005 and creates no snapshot', async () => {
      r.fx.write('src/order.ts', 'export const order = () => [1, 2, 3];\n'); // as in B0 and C1
      await expect(r.intake(r.fx.label('C1').hash)).rejects.toMatchObject({
        code: 'ERR-INTAKE-005',
      });
      expect(loggedCodes(r.logFile)).toContain('ERR-INTAKE-005');
      expect(await r.store.listReviews()).toEqual([]);
    });
  });
});

describe('snapshotIdOf', () => {
  const file = (over: Partial<ChangedFile> = {}, contentSha256: string | null = 'a'.repeat(64)) =>
    ({
      file: {
        path: 'p',
        previousPath: null,
        changeType: 'modified',
        binary: false,
        contentHash: 'g'.repeat(40),
        baseMode: 'regular',
        currentMode: 'regular',
        baseContent: null,
        currentContent: null,
        ...over,
      },
      contentSha256,
    }) satisfies ChangeFile;
  const base = 'b'.repeat(40);
  const head = 'c'.repeat(40);

  it('does not depend on the order of the files', () => {
    const x = file({ path: 'a' });
    const y = file({ path: 'b' });
    expect(snapshotIdOf(base, head, [x, y])).toBe(snapshotIdOf(base, head, [y, x]));
  });

  it('depends on base, HEAD, path, previous path, change type and content', () => {
    const id = snapshotIdOf(base, head, [file()]);
    const others = [
      snapshotIdOf('d'.repeat(40), head, [file()]),
      snapshotIdOf(base, 'd'.repeat(40), [file()]),
      snapshotIdOf(base, head, [file({ path: 'q' })]),
      snapshotIdOf(base, head, [file({ previousPath: 'o' })]),
      snapshotIdOf(base, head, [file({ changeType: 'added' })]),
      snapshotIdOf(base, head, [file({}, 'e'.repeat(64))]),
      snapshotIdOf(base, head, [file({}), file({ path: 'z' })]),
    ];
    for (const other of others) expect(other).not.toBe(id);
    expect(new Set(others).size).toBe(others.length);
  });

  it('names a binary file by git hash of its bytes', () => {
    const one = file({ binary: true, contentHash: '1'.repeat(40) }, null);
    const two = file({ binary: true, contentHash: '2'.repeat(40) }, null);
    expect(snapshotIdOf(base, head, [one])).not.toBe(snapshotIdOf(base, head, [two]));
  });

  it('is built on a canonical JSON with sorted keys', () => {
    expect(canonicalJson({ b: [1, { d: null, c: 'x' }], a: undefined, z: true })).toBe(
      '{"b":[1,{"c":"x","d":null}],"z":true}',
    );
  });
});
