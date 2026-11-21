import { describe, expect, it } from 'vitest';
import type { ChangedFile, GitAccessPort, TreeEntry } from '../../../src/core/git/port.js';
import type { ChangeFile } from '../../../src/core/intake/change.js';
import {
  baseSourceTree,
  readIntakeIntentSources,
  snapshotSourceTree,
} from '../../../src/core/intake/intent-context.js';

// C001-TC-111 (unit level): the `.sdd/` workspace is read from the snapshot — snapshot content for
// changed files, base-commit content for the others (C001-IF-007 §1 item 1, C001-REQ-116) — and
// the base commit's own content for the lines read there.

const BASE: Record<string, string> = {
  '.sdd/042-cart/change.md': '---\nid: CHG-042\ntitle: Cart\nstatus: active\n---\n',
  '.sdd/042-cart/10-spec/20-capabilities/CAP-01/requirements.md':
    '### C042-REQ-003 — Total\nbase text\n',
  '.sdd/042-cart/20-plan/50-tasks/T-007.md':
    '---\nid: C042-T-007\nimplements: [C042-REQ-003]\n---\n',
  '.sdd/041-old/change.md': '---\nid: CHG-041\nstatus: archived\n---\n',
  'src/cart.ts': 'export {};\n',
};

function fakeGit(base: Record<string, string>, reads: string[] = []): GitAccessPort {
  const entries: TreeEntry[] = Object.keys(base).map((path) => ({
    path,
    mode: 'regular',
    blob: path,
  }));
  entries.push({ path: '.sdd/link.md', mode: 'symlink', blob: 'x' });
  return {
    treeEntries: async () => entries,
    readBlob: async (_commit: string, path: string) => {
      reads.push(path);
      return base[path] === undefined ? null : Buffer.from(base[path]!, 'utf8');
    },
  } as unknown as GitAccessPort;
}

function changed(
  path: string,
  changeType: ChangedFile['changeType'],
  content: string | null,
  previousPath: string | null = null,
): ChangeFile {
  return {
    file: {
      path,
      previousPath,
      changeType,
      binary: false,
      contentHash: null,
      baseMode: changeType === 'added' ? null : 'regular',
      currentMode: content === null ? null : 'regular',
      baseContent: null,
      currentContent: content === null ? null : Buffer.from(content, 'utf8'),
    },
    contentSha256: null,
  };
}

describe('intake source trees', () => {
  it('lists the base commit files under .sdd/, regular files only', async () => {
    const tree = await baseSourceTree(fakeGit(BASE), 'b0');
    expect(tree.paths).toEqual(
      Object.keys(BASE)
        .filter((p) => p.startsWith('.sdd/'))
        .sort(),
    );
  });

  it('applies the change: deleted and renamed-away files leave, changed files bring their content', async () => {
    const reads: string[] = [];
    const git = fakeGit(BASE, reads);
    const base = await baseSourceTree(git, 'b0');
    const req = '.sdd/042-cart/10-spec/20-capabilities/CAP-01/requirements.md';
    const tree = snapshotSourceTree(git, 'b0', base, [
      changed(req, 'modified', '### C042-REQ-003 — Total\nsnapshot text\n'),
      changed('.sdd/042-cart/20-plan/50-tasks/T-007.md', 'deleted', null),
      changed('.sdd/043-promo/change.md', 'added', '---\nid: CHG-043\n---\n'),
      changed(
        '.sdd/040-moved/change.md',
        'renamed',
        BASE['.sdd/041-old/change.md']!,
        '.sdd/041-old/change.md',
      ),
      changed('src/cart.ts', 'modified', 'export const x = 1;\n'),
    ]);
    expect(tree.paths).toEqual([
      '.sdd/040-moved/change.md',
      '.sdd/042-cart/10-spec/20-capabilities/CAP-01/requirements.md',
      '.sdd/042-cart/change.md',
      '.sdd/043-promo/change.md',
    ]);
    expect(Buffer.from((await tree.read(req))!).toString()).toContain('snapshot text');
    expect(reads).toEqual([]);
    await tree.read('.sdd/042-cart/change.md');
    expect(reads).toEqual(['.sdd/042-cart/change.md']);
  });
});

describe('readIntakeIntentSources', () => {
  it('fills the intent context, the summary counts and the lines read on both sides', async () => {
    const git = fakeGit(BASE);
    const req = '.sdd/042-cart/10-spec/20-capabilities/CAP-01/requirements.md';
    const result = await readIntakeIntentSources(git, 'b0', [
      changed(req, 'modified', '### C042-REQ-003 — Total\nsnapshot text\nmore\n'),
    ]);
    expect(result.intentContext.sddChanges).toHaveLength(1);
    const items = result.intentContext.sddChanges[0]!.items;
    expect(items.map((i) => [i.id, i.text])).toEqual([
      ['C042-REQ-003', 'snapshot text\nmore'],
      ['C042-T-007', ''],
    ]);
    expect(result.summary).toEqual({
      sddChanges: [{ id: 'CHG-042', specItems: 2, selected: true }],
      documentedArchitecture: 'none',
    });
    expect(result.intentContext.documentedArchitecture).toBeNull();
    expect(result.notices).toEqual([]);
    expect(result.sdd.specItemLines.get('CHG-042')!.get('C042-REQ-003')).toEqual({
      snapshot: { path: req, lines: [1, 2, 3] },
      base: { path: req, lines: [1, 2] },
    });
  });

  it('gives an empty intent context without a .sdd/ workspace (C001-TS-126)', async () => {
    const git = fakeGit({ 'src/cart.ts': 'x' });
    const result = await readIntakeIntentSources(git, 'b0', [
      changed('src/cart.ts', 'modified', 'y'),
    ]);
    expect(result.intentContext).toEqual({ sddChanges: [], documentedArchitecture: null });
    expect(result.summary).toEqual({ sddChanges: [], documentedArchitecture: 'none' });
    expect(result.sdd.present).toBe(false);
  });
});
