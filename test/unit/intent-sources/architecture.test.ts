import { describe, expect, it } from 'vitest';
import {
  parseSddArchitecture,
  readSddArchitecture,
} from '../../../src/core/intent-sources/architecture.js';
import { NoticeCollector } from '../../../src/core/intent-sources/notices.js';
import { readSddIntentSources } from '../../../src/core/intent-sources/sdd-workspace.js';
import { treeOf } from '../../../src/core/intent-sources/tree.js';

// C001-TC-207, C001-TC-223 (unit level): the documented architecture in the `.sdd/` format
// (C001-IF-007 §4): components, paths, layers and allowed dependencies, the drop without paths
// (ERR-SDD-004), damaged components (ERR-SDD-005) and the lines read on both sides (C001-REQ-222).

const FILE = '.sdd/042-cart/10-spec/60-architecture/architecture.md';

const ARCH = [
  '---', // 1
  'id: C042-SPEC-ARCH', // 2
  '---', // 3
  '# Architecture', // 4
  '', // 5
  '## 1. Context', // 6
  '### C042-COMP-99 — Not in the catalogue', // 7
  '- **Paths:** `ignored/**`', // 8
  '', // 9
  '## 2. Component catalogue', // 10
  '', // 11
  '### C042-COMP-01 — Cart', // 12
  '- **Status:** new', // 13
  '- **Depends on:** C042-COMP-02, C042-COMP-03', // 14
  '- **Paths:** `src/cart/**`,', // 15
  '  `src/basket/**`', // 16
  '- **Layer:** 2 — application', // 17
  '', // 18
  '### C042-COMP-02 — Pricing', // 19
  '- **Depends on:** none', // 20
  '- **Paths:** `src/pricing/**`', // 21
  '- **Layer:** 3 — domain', // 22
  '', // 23
  '### C042-COMP-03 — Api', // 24
  '- **Evidence:** `server/routes.ts:12`, `server/app/index.ts`, `package.json`', // 25
  '- **Layer:** 1 — edge', // 26
  '', // 27
  '### C042-COMP-04 — Docs', // 28
  '- **Responsibility:** no paths at all', // 29
  '', // 30
  '### Notes — not a component', // 31
  '- **Paths:** `notes/**`', // 32
  '', // 33
  '## 3. Dependency rules', // 34
  '### C042-COMP-05 — After the catalogue', // 35
].join('\n');

function parse(text: string) {
  const sink = new NoticeCollector();
  return { result: parseSddArchitecture(text, FILE, sink), notices: sink.notices };
}

describe('parseSddArchitecture', () => {
  it('reads the components of the catalogue with paths, layers and dependencies (§4 item 2)', () => {
    const { result, notices } = parse(ARCH);
    expect(notices).toEqual([]);
    expect(result.architecture).toEqual({
      origin: 'sdd-folder',
      location: FILE,
      layers: ['edge', 'application', 'domain'],
      components: [
        {
          id: 'C042-COMP-01',
          name: 'Cart',
          layer: 'application',
          paths: ['src/cart/**', 'src/basket/**'],
          allowedDependencies: ['C042-COMP-02', 'C042-COMP-03'],
        },
        {
          id: 'C042-COMP-02',
          name: 'Pricing',
          layer: 'domain',
          paths: ['src/pricing/**'],
          allowedDependencies: [],
        },
        {
          id: 'C042-COMP-03',
          name: 'Api',
          layer: 'edge',
          // Evidence paths give their directory; a root file gives none.
          paths: ['server/**', 'server/app/**'],
          allowedDependencies: [],
        },
        { id: 'C042-COMP-04', name: 'Docs', layer: null, paths: [], allowedDependencies: [] },
      ],
    });
  });

  it('records the lines read: catalogue heading, component headings and their four bullets', () => {
    const { result } = parse(ARCH);
    expect(result.linesRead).toEqual({
      path: FILE,
      lines: [10, 12, 14, 15, 16, 17, 19, 20, 21, 22, 24, 25, 26, 28],
    });
    expect(result.componentLines.get('C042-COMP-01')!.lines).toEqual([12, 14, 15, 16, 17]);
    expect(result.componentLines.get('C042-COMP-04')!.lines).toEqual([28]);
  });

  it('drops an architecture in which no component gives a path, with ERR-SDD-004 (C001-TS-256)', () => {
    const text = [
      '## 2. Component catalogue',
      '### C042-COMP-01 — Api',
      '- **Layer:** 1 — edge',
      '### C042-COMP-02 — Ui',
      '- **Depends on:** C042-COMP-01',
    ].join('\n');
    const { result, notices } = parse(text);
    expect(result.architecture).toBeNull();
    expect(result.linesRead).toBeNull();
    expect(notices).toEqual([
      {
        code: 'ERR-SDD-004',
        subject: FILE,
        message: `The architecture in "${FILE}" gives no component paths, so it is not used as the documented architecture: components are derived from the repository's structure and drift is not checked.`,
      },
    ]);
  });

  it('keeps an architecture in which one component has a path pattern (C001-TS-257)', () => {
    const text = [
      '## 2. Component catalogue',
      '### C042-COMP-01 — Api',
      '- **Paths:** `server/**`',
      '### C042-COMP-02 — Ui',
    ].join('\n');
    const { result, notices } = parse(text);
    expect(notices).toEqual([]);
    expect(result.architecture!.components.map((c) => [c.name, c.paths])).toEqual([
      ['Api', ['server/**']],
      ['Ui', []],
    ]);
  });

  it('drops an architecture without a component catalogue, with ERR-SDD-004', () => {
    const { result, notices } = parse('# Architecture\n\nNo catalogue here.\n');
    expect(result.architecture).toBeNull();
    expect(notices.map((n) => n.code)).toEqual(['ERR-SDD-004']);
  });

  // The damaged lines of C001-TS-161: line 40 is the heading, 42 Paths, 43 Layer.
  it.each([
    [40, '### C010-COMP-3 — Cart', 'does not match'],
    [40, '### C010-COMP-03 Cart', 'lacks the " — <name>" part'],
    [42, '- **Paths:** src/cart/**', 'holds no backticked pattern'],
    [43, '- **Layer:** application', 'does not have the form "<rank> — <name>"'],
  ])('leaves out a component whose line %i reads %j, with ERR-SDD-005', (line, damaged, reason) => {
    const lines = Array.from({ length: 50 }, () => '');
    lines[29] = '## 2. Component catalogue';
    lines[31] = '### C010-COMP-02 — Billing';
    lines[32] = '- **Paths:** `src/billing/**`';
    lines[33] = '- **Layer:** 2 — application';
    lines[39] = '### C010-COMP-03 — Cart';
    lines[41] = '- **Paths:** `src/cart/**`';
    lines[42] = '- **Layer:** 2 — application';
    lines[line - 1] = damaged;
    const { result, notices } = parse(lines.join('\n'));
    expect(result.architecture!.components.map((c) => c.name)).toEqual(['Billing']);
    expect(result.componentLines.has('C010-COMP-03')).toBe(false);
    expect(result.linesRead!.lines).not.toContain(40);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.code).toBe('ERR-SDD-005');
    expect(notices[0]!.message).toContain(`Skipped component in "${FILE}" line ${line}: `);
    expect(notices[0]!.message).toContain(reason);
  });

  it('ignores catalogue headings inside fenced blocks', () => {
    const text = [
      '```markdown',
      '## 2. Component catalogue',
      '### C042-COMP-01 — Fenced',
      '- **Paths:** `x/**`',
      '```',
    ].join('\n');
    expect(parse(text).result.architecture).toBeNull();
  });
});

describe('readSddArchitecture: lines read on both sides', () => {
  it('reads the snapshot with notices and the base commit silently', async () => {
    const before = ARCH.replace('- **Paths:** `src/pricing/**`', '- **Paths:** `src/price/**`');
    const after = ARCH.replace('### C042-COMP-04 — Docs', '### C042-COMP-04 Docs');
    const sink = new NoticeCollector();
    const reading = await readSddArchitecture(
      { tree: treeOf({ [FILE]: after }), folder: '.sdd/042-cart' },
      { tree: treeOf({ [FILE]: `${before}\n### C042-COMP-x — bad` }), folder: '.sdd/042-cart' },
      sink,
    );
    expect(sink.notices.map((n) => n.code)).toEqual(['ERR-SDD-005']);
    expect(reading.file).toBe(FILE);
    expect(reading.documented!.components.map((c) => c.id)).toEqual([
      'C042-COMP-01',
      'C042-COMP-02',
      'C042-COMP-03',
    ]);
    expect(reading.componentLines.get('C042-COMP-04')).toEqual({
      snapshot: null,
      base: { path: FILE, lines: [28] },
    });
    expect(reading.linesRead.base!.lines).toContain(28);
    expect(reading.linesRead.snapshot!.lines).not.toContain(28);
  });

  it('has no architecture when the change folder has no architecture.md', async () => {
    const reading = await readSddArchitecture(
      { tree: treeOf({}), folder: '.sdd/042-cart' },
      { tree: treeOf({}), folder: null },
      new NoticeCollector(),
    );
    expect(reading).toEqual({
      file: null,
      documented: null,
      linesRead: { snapshot: null, base: null },
      componentLines: new Map(),
    });
  });

  it('reads only the selected change, not the other change folders (§4 item 1)', async () => {
    const files = {
      '.sdd/042-cart/change.md': '---\nid: CHG-042\nstatus: active\n---\n',
      '.sdd/041-old/change.md': '---\nid: CHG-041\nstatus: archived\n---\n',
      '.sdd/041-old/10-spec/60-architecture/architecture.md': ARCH,
      '.sdd/_living/10-spec/60-architecture/architecture.md': ARCH,
    };
    const sink = new NoticeCollector();
    const result = await readSddIntentSources({
      snapshot: treeOf(files),
      base: treeOf(files),
      sink,
    });
    expect(result.selected?.id).toBe('CHG-042');
    expect(result.architecture.documented).toBeNull();
    expect(sink.notices).toEqual([]);
  });
});
