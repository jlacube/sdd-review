import { describe, expect, it } from 'vitest';
import { isReviewError } from '../../../src/core/errors/review-error.js';
import { NoticeCollector } from '../../../src/core/intent-sources/notices.js';
import { NEUTRAL_FILE } from '../../../src/core/intent-sources/neutral-file.js';
import { namesOf, selectSddChange } from '../../../src/core/intent-sources/select-change.js';
import {
  readSddIntentSources,
  readSddWorkspace,
  type WorkspaceChange,
} from '../../../src/core/intent-sources/sdd-workspace.js';
import { treeOf } from '../../../src/core/intent-sources/tree.js';

// C001-TC-302, C001-TC-303, C001-TC-304, C001-TC-326 (unit level): the selection rules of
// C001-IF-007 §6 — named open, named not open, one open, several open, none — with the stops
// ERR-SDD-001 and ERR-SDD-002 of `errors.md` (C001-REQ-302, -303, -304, -326).

const changeMd = (id: string, status = 'active') =>
  `---\nid: "${id}"\ntitle: "Change ${id}"\nstatus: ${status}\n---\n\n# ${id}\n`;

const REQ = (id: string) => `### ${id} — Something\n- **Statement:** THE cart SHALL do it.\n`;

/** fx-sdd as CAP-03 states it: CHG-042 open in 042-cart, CHG-041 archived in 041-legacy. */
const FX = {
  '.sdd/042-cart/change.md': changeMd('CHG-042'),
  '.sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/requirements.md': REQ('C042-REQ-003'),
  '.sdd/041-legacy/change.md': changeMd('CHG-041', 'archived'),
  '.sdd/041-legacy/10-spec/20-capabilities/CAP-01-legacy/requirements.md': REQ('C041-REQ-002'),
};
const WITH_043 = {
  ...FX,
  '.sdd/043-promo/change.md': changeMd('CHG-043'),
  '.sdd/043-promo/10-spec/20-capabilities/CAP-01-promo/requirements.md':
    REQ('C043-REQ-001') + '\n' + REQ('C043-REQ-002'),
};

async function changesOf(files: Record<string, string>): Promise<readonly WorkspaceChange[]> {
  return (await readSddWorkspace(treeOf(files), null)).changes;
}

/** The readable SDD changes of the workspace with two open changes, CHG-042 open first. */
const changesSync = (await changesOf(WITH_043)).filter((c) => c.open);

function stopOf(run: () => unknown): { code: string; message: string; exitCode: number } {
  try {
    run();
  } catch (error) {
    if (isReviewError(error)) return error;
    throw error;
  }
  throw new Error('selection did not stop');
}

describe('selectSddChange (C001-IF-007 §6)', () => {
  describe('a named value', () => {
    it.each(['CHG-043', '043', '043-promo'])(
      'selects the open SDD change whose ID, folder number or folder name is "%s" (C001-TS-303, C001-TS-354)',
      async (value) => {
        expect(selectSddChange(await changesOf(WITH_043), value)?.id).toBe('CHG-043');
      },
    );

    it('selects the named one among two open changes, even when the other comes first', async () => {
      expect(selectSddChange(await changesOf(WITH_043), 'CHG-042')?.folder).toBe('.sdd/042-cart');
    });

    it.each([
      ['CHG-099', 'an unknown ID'],
      ['CHG-041', 'the ID of an archived change'],
      ['041', 'the folder number of an archived change'],
      ['041-legacy', 'the folder name of an archived change'],
      ['../_archive/040-promo', 'a path to a folder under .sdd/_archive/ (C001-TS-355)'],
      ['.sdd/042-cart', 'a path to an open change folder'],
      ['chg-042', 'an ID in another case'],
      [' CHG-042', 'an ID with white space'],
      ['42', 'a folder number without its leading zero'],
      ['', 'an empty value'],
    ])('stops with ERR-SDD-002 for "%s", %s (C001-TS-353)', async (value) => {
      const files = {
        ...FX,
        '.sdd/_archive/040-promo/change.md': changeMd('CHG-040'),
      };
      const changes = await changesOf(files);
      const error = stopOf(() => selectSddChange(changes, value));
      expect(error.code).toBe('ERR-SDD-002');
      expect(error.exitCode).toBe(3);
      expect(error.message).toBe(
        `No open SDD change "${value}" in the SDD workspace of the snapshot. Open SDD changes: CHG-042.`,
      );
    });

    it('lists "none" when the snapshot holds no open SDD change', async () => {
      const error = stopOf(() => selectSddChange([], 'CHG-042'));
      expect(error.code).toBe('ERR-SDD-002');
      expect(error.message).toBe(
        'No open SDD change "CHG-042" in the SDD workspace of the snapshot. Open SDD changes: none.',
      );
    });

    it('stops with ERR-SDD-002 rather than guess when the value names two open changes', async () => {
      const files = {
        ...FX,
        '.sdd/042-other/change.md': changeMd('CHG-142'),
      };
      const changes = await changesOf(files);
      const stop = stopOf(() => selectSddChange(changes, '042'));
      expect(stop.code).toBe('ERR-SDD-002');
      expect(stop.message).toContain('Open SDD changes: CHG-042, CHG-142.');
      expect(selectSddChange(changes, '042-other')?.id).toBe('CHG-142');
    });
  });

  describe('without a named value', () => {
    it('selects the only open SDD change, an archived one beside it does not count (C001-TS-304)', async () => {
      expect(selectSddChange(await changesOf(FX), undefined)?.id).toBe('CHG-042');
    });

    it('selects none when no SDD change is open: intent fallback (C001-TS-305)', async () => {
      const files = {
        '.sdd/041-legacy/change.md': changeMd('CHG-041', 'archived'),
      };
      expect(selectSddChange(await changesOf(files), undefined)).toBeNull();
      expect(selectSddChange([], undefined)).toBeNull();
    });

    it('stops with ERR-SDD-001 listing the open SDD changes when there are several (C001-TS-306)', async () => {
      const error = stopOf(() => selectSddChange(changesSync, undefined));
      expect(error.code).toBe('ERR-SDD-001');
      expect(error.exitCode).toBe(3);
      expect(error.message).toBe(
        'The SDD workspace holds 2 open SDD changes: CHG-042, CHG-043. Name the one to review with `--sdd-change`.',
      );
    });
  });

  it('names a neutral-file change by its ID only, prefixed when it clashes (§5 item 3)', () => {
    const neutral: WorkspaceChange = {
      ...changesSync[0]!,
      id: 'neutral:CHG-042',
      origin: 'neutral-file',
      folder: NEUTRAL_FILE,
    };
    expect(namesOf(neutral)).toEqual(['neutral:CHG-042']);
    expect(namesOf(changesSync[0]!)).toEqual(['CHG-042', '042', '042-cart']);
    const candidates = [changesSync[0]!, neutral];
    expect(selectSddChange(candidates, 'neutral:CHG-042')).toBe(neutral);
    expect(selectSddChange(candidates, 'CHG-042')).toBe(changesSync[0]);
    expect(stopOf(() => selectSddChange(candidates, undefined)).message).toContain(
      'CHG-042, neutral:CHG-042',
    );
  });
});

describe('readSddIntentSources with the selection', () => {
  const read = (files: Record<string, string>, sddChange?: string) =>
    readSddIntentSources({
      snapshot: treeOf(files),
      base: treeOf(FX),
      sink: new NoticeCollector(),
      ...(sddChange !== undefined ? { sddChange } : {}),
    });

  it('hands the named change to the intent mapper and keeps every open change in the context', async () => {
    const result = await read(WITH_043, 'CHG-043');
    expect(result.selected?.id).toBe('CHG-043');
    expect(result.selected?.items.map((i) => i.id)).toEqual(['C043-REQ-001', 'C043-REQ-002']);
    expect(result.sddChanges.map((c) => c.id)).toEqual(['CHG-042', 'CHG-043']);
  });

  it('throws both stops from the reader', async () => {
    await expect(read(WITH_043)).rejects.toMatchObject({ code: 'ERR-SDD-001' });
    await expect(read(FX, 'CHG-041')).rejects.toMatchObject({ code: 'ERR-SDD-002' });
  });
});
