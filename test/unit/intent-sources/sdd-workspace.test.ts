import { describe, expect, it } from 'vitest';
import { NoticeCollector } from '../../../src/core/intent-sources/notices.js';
import {
  readSddIntentSources,
  readSddWorkspace,
} from '../../../src/core/intent-sources/sdd-workspace.js';
import { textHash } from '../../../src/core/intent-sources/text.js';
import { treeOf } from '../../../src/core/intent-sources/tree.js';

// C001-TC-111, C001-TC-123 (unit level): the `.sdd/` workspace rules of C001-IF-007 §2 and §3 on
// well-formed, partial and broken workspaces, and the lines read on both sides (C001-REQ-328).

const change = (id: string, extra = '') =>
  `---\nid: "${id}"\ntitle: "Cart for ${id}"\nprofile: "full"\nstatus: active\nphase: 20-plan\nphases:\n  10-spec: { status: approved }\n${extra}---\n\n# ${id}\n`;

const REQUIREMENTS = [
  '---', // 1
  'id: C042-CAP-01', // 2
  '---', // 3
  '', // 4
  '# Requirements', // 5
  '', // 6
  '### C042-REQ-003 — Total of the cart', // 7
  '- **Statement:** THE cart SHALL show its total.', // 8
  '', // 9
  '### C042-REQ-004 — Empty cart', // 10
  '- **Statement:** THE cart SHALL show an empty state.', // 11
  '', // 12
  '#### Notes', // 13
  'still part of REQ-004', // 14
  '', // 15
  '## 2. Other', // 16
  'not part of any requirement', // 17
].join('\n');

const ACCEPTANCE = [
  '# Acceptance', // 1
  '', // 2
  '## C042-REQ-003', // 3
  '', // 4
  '#### C042-AC-003.1 — Total shown', // 5
  '```gherkin', // 6
  'Scenario: C042-TS-010 — The total is shown', // 7
  '  Given a cart with 2 items', // 8
  '  # a Gherkin comment, not a heading', // 9
  '  Then the total is shown', // 10
  'Scenario Outline: C042-TS-011 — Totals', // 11
  '  Given <n> items', // 12
  '', // 13
  '  Examples:', // 14
  '    | n |', // 15
  '```', // 16
  '```gherkin', // 17
  'Scenario: C042-TS-012 — A second block', // 18
  '  Then it is linked to the same criterion', // 19
  '```', // 20
].join('\n');

const TASK = [
  '---', // 1
  'id: C042-T-007', // 2
  'title: Cart total', // 3
  'implements: [C042-REQ-003]', // 4
  'satisfies_ac: [C042-AC-003.1]', // 5
  'report: { commit: null, completed_at: null, notes: null }', // 6
  '---', // 7
  '# C042-T-007 — Cart total', // 8
  '', // 9
  'Compute the total in src/cart/total.ts.', // 10
].join('\n');

function wellFormed(): Record<string, string> {
  return {
    '.sdd/registry.json': '{}',
    '.sdd/042-cart/change.md': change('CHG-042'),
    '.sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/requirements.md': REQUIREMENTS,
    '.sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/acceptance.md': ACCEPTANCE,
    '.sdd/042-cart/20-plan/50-tasks/T-007-cart-total.md': TASK,
    '.sdd/041-old/change.md': change('CHG-041').replace('status: active', 'status: archived'),
    '.sdd/041-old/10-spec/20-capabilities/CAP-01-x/requirements.md':
      '### C041-REQ-001 — Old\ntext\n',
  };
}

async function read(files: Record<string, string>) {
  const sink = new NoticeCollector();
  const reading = await readSddWorkspace(treeOf(files), sink);
  return { reading, notices: sink.notices };
}

describe('readSddWorkspace: well-formed workspace', () => {
  it('reads the change folders with ID, title, status, phases and openness (§2)', async () => {
    const { reading, notices } = await read(wellFormed());
    expect(notices).toEqual([]);
    expect(reading.present).toBe(true);
    expect(reading.changes.map((c) => [c.id, c.folder, c.open])).toEqual([
      ['CHG-041', '.sdd/041-old', false],
      ['CHG-042', '.sdd/042-cart', true],
    ]);
    const cart = reading.changes[1]!;
    expect(cart).toMatchObject({
      title: 'Cart for CHG-042',
      status: 'active',
      profile: 'full',
      phase: '20-plan',
      phases: { '10-spec': 'approved' },
    });
  });

  it('reads requirements with their text, up to the next heading of level 1 to 3 (§3)', async () => {
    const cart = (await read(wellFormed())).reading.changes[1]!;
    const req3 = cart.items.find((i) => i.id === 'C042-REQ-003')!;
    expect(req3).toMatchObject({
      kind: 'requirement',
      title: 'Total of the cart',
      text: '- **Statement:** THE cart SHALL show its total.',
      links: [],
      files: [],
      location: {
        path: '.sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/requirements.md',
        line: 7,
      },
    });
    expect(req3.textHash).toBe(textHash(req3.text));
    const req4 = cart.items.find((i) => i.id === 'C042-REQ-004')!;
    expect(req4.text).toContain('still part of REQ-004');
    expect(req4.text).not.toContain('not part of any requirement');
    expect(cart.linesRead.get('C042-REQ-003')!.lines).toEqual([7, 8, 9]);
    expect(cart.linesRead.get('C042-REQ-004')!.lines).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('links criteria to their requirement and scenarios to the criterion above them', async () => {
    const cart = (await read(wellFormed())).reading.changes[1]!;
    const byId = new Map(cart.items.map((i) => [i.id, i]));
    expect(byId.get('C042-AC-003.1')).toMatchObject({
      kind: 'acceptance-criterion',
      title: 'Total shown',
      links: [{ to: 'C042-REQ-003', type: 'refines' }],
    });
    for (const ts of ['C042-TS-010', 'C042-TS-011', 'C042-TS-012']) {
      expect(byId.get(ts)).toMatchObject({
        kind: 'scenario',
        links: [{ to: 'C042-AC-003.1', type: 'verifies' }],
      });
    }
    expect(byId.get('C042-TS-010')!.text).toBe(
      '  Given a cart with 2 items\n  # a Gherkin comment, not a heading\n  Then the total is shown',
    );
    // A scenario runs to the next Scenario line or the end of its block.
    expect(cart.linesRead.get('C042-TS-010')!.lines).toEqual([7, 8, 9, 10]);
    expect(cart.linesRead.get('C042-TS-011')!.lines).toEqual([11, 12, 13, 14, 15]);
    // The criterion runs to the next heading of level 1 to 4 (here: the end of the file).
    expect(cart.linesRead.get('C042-AC-003.1')!.lines).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 5),
    );
  });

  it('reads task files: frontmatter ID, title, links, body text, every line read', async () => {
    const cart = (await read(wellFormed())).reading.changes[1]!;
    const task = cart.items.find((i) => i.id === 'C042-T-007')!;
    expect(task).toMatchObject({
      kind: 'task',
      title: 'Cart total',
      text: '# C042-T-007 — Cart total\n\nCompute the total in src/cart/total.ts.',
      links: [
        { to: 'C042-REQ-003', type: 'implements' },
        { to: 'C042-AC-003.1', type: 'relates' },
      ],
      location: { path: '.sdd/042-cart/20-plan/50-tasks/T-007-cart-total.md', line: 1 },
    });
    expect(cart.linesRead.get('C042-T-007')!.lines).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('reads a lite change from spec.md and plan.md', async () => {
    const spec = [
      '### C050-REQ-001 — Lite requirement',
      'text',
      '#### C050-AC-001.1 — Lite criterion',
      '```gherkin',
      'Scenario: C050-TS-001 — Lite scenario',
      '  Then ok',
      '```',
    ].join('\n');
    const plan = [
      '# Plan',
      '### C050-T-001 — Do it',
      '- **Implements:** C050-REQ-001,',
      '  C050-REQ-002',
      '- **Files:** x',
      '### Not a task',
    ].join('\n');
    const { reading, notices } = await read({
      '.sdd/050-lite/change.md': change('CHG-050').replace('"full"', '"lite"'),
      '.sdd/050-lite/10-spec/spec.md': spec,
      '.sdd/050-lite/20-plan/plan.md': plan,
      // Not read for a lite change.
      '.sdd/050-lite/20-plan/50-tasks/T-001.md': TASK,
    });
    expect(notices).toEqual([]);
    const items = reading.changes[0]!.items;
    expect(items.map((i) => [i.id, i.kind])).toEqual([
      ['C050-REQ-001', 'requirement'],
      ['C050-AC-001.1', 'acceptance-criterion'],
      ['C050-TS-001', 'scenario'],
      ['C050-T-001', 'task'],
    ]);
    expect(items[3]!.links).toEqual([
      { to: 'C050-REQ-001', type: 'implements' },
      { to: 'C050-REQ-002', type: 'implements' },
    ]);
    expect(reading.changes[0]!.linesRead.get('C050-T-001')!.lines).toEqual([2, 3, 4, 5]);
  });

  it('normalises CRLF and a byte-order mark before reading and hashing', async () => {
    const files = wellFormed();
    const crlf = Object.fromEntries(
      Object.entries(files).map(([p, t]) => [p, `\ufeff${t.replace(/\n/g, '\r\n')}`]),
    );
    const lf = (await read(files)).reading.changes[1]!.items;
    const other = (await read(crlf)).reading.changes[1]!.items;
    expect(other).toEqual(lf);
  });
});

describe('readSddWorkspace: no and partial workspaces', () => {
  it('finds no workspace without change folders (C001-TS-126)', async () => {
    expect((await read({ 'src/a.ts': 'x' })).reading).toEqual({ present: false, changes: [] });
    // A folder that does not match the pattern, one without change.md, and the archive are no
    // change folders.
    const { reading, notices } = await read({
      '.sdd/_archive/040-old/change.md': change('CHG-040'),
      '.sdd/notes/change.md': change('CHG-X'),
      '.sdd/043-promo/readme.md': 'x',
      '.sdd/044-Upper/change.md': change('CHG-044'),
      '.sdd/045-deep/sub/change.md': change('CHG-045'),
    });
    expect(reading).toEqual({ present: false, changes: [] });
    expect(notices).toEqual([]);
  });

  it('reads a change folder without spec items', async () => {
    const { reading } = await read({ '.sdd/042-cart/change.md': change('CHG-042') });
    expect(reading.changes[0]!.items).toEqual([]);
  });

  it('ignores headings without the form of a spec-item ID (C001-TS-153)', async () => {
    const files = wellFormed();
    const path = '.sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/requirements.md';
    files[path] = `${files[path]}\n### Open questions — cart\n#### C042-REQ-009 — wrong level\n`;
    const { reading, notices } = await read(files);
    expect(notices).toEqual([]);
    const reqs = reading.changes[1]!.items.filter((i) => i.kind === 'requirement');
    expect(reqs.map((r) => r.id)).toEqual(['C042-REQ-003', 'C042-REQ-004']);
  });

  it('does not read headings and scenarios inside other fenced blocks', async () => {
    const files = wellFormed();
    const path = '.sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/requirements.md';
    files[path] =
      `${files[path]}\n\`\`\`markdown\n### C042-REQ-099 — in a fence\nScenario: C042-TS-099 — x\n\`\`\`\n`;
    const { reading, notices } = await read(files);
    expect(notices).toEqual([]);
    expect(reading.changes[1]!.items.some((i) => i.id.endsWith('099'))).toBe(false);
  });
});

describe('readSddWorkspace: broken entries are left out with ERR-SDD-005 (C001-REQ-123)', () => {
  it.each([
    ['---\ntitle: x\nstatus: [open\n---\n', 3, 'frontmatter is not YAML'],
    ['---\ntitle: no id\n---\n', 1, 'frontmatter has no ID'],
    ['---\nid: ""\n---\n', 1, 'frontmatter has no ID'],
    ['# CHG-043\nno frontmatter\n', 1, 'file has no YAML frontmatter'],
    ['---\nid: CHG-043\n', 1, 'frontmatter is not closed'],
  ])('skips a change folder whose change.md is %j', async (text, line, reason) => {
    const files = wellFormed();
    files['.sdd/043-promo/change.md'] = text;
    files['.sdd/043-promo/10-spec/20-capabilities/CAP-01/requirements.md'] =
      '### C043-REQ-001 — Promo\n';
    const { reading, notices } = await read(files);
    expect(reading.changes.map((c) => c.id)).toEqual(['CHG-041', 'CHG-042']);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ code: 'ERR-SDD-005', subject: '.sdd/043-promo/change.md' });
    expect(notices[0]!.message).toMatch(
      new RegExp(
        `^Skipped change folder in "\\.sdd/043-promo/change\\.md" line ${line}: ${reason}`,
      ),
    );
  });

  it.each([
    ['id: [C042-T-007', 2, 'frontmatter is not YAML'],
    ['artifact: plan/task', 1, 'frontmatter has no ID'],
  ])('skips a task file whose frontmatter holds %j (C001-TS-151)', async (line2, line, reason) => {
    const files = wellFormed();
    const path = '.sdd/042-cart/20-plan/50-tasks/T-008.md';
    files[path] = `---\n${line2}\ntitle: Broken\n---\nbody\n`;
    const { reading, notices } = await read(files);
    const cart = reading.changes[1]!;
    expect(cart.items.some((i) => i.location?.path === path)).toBe(false);
    expect(cart.items.map((i) => i.id)).toContain('C042-REQ-003');
    expect(notices).toEqual([
      expect.objectContaining({
        code: 'ERR-SDD-005',
        subject: path,
        message: expect.stringMatching(
          new RegExp(`^Skipped task in "${path.replace(/\./g, '\\.')}" line ${line}: ${reason}`),
        ),
      }),
    ]);
  });

  it.each([
    ['requirements.md', '### C042-REQ-3 — Short number', 'requirement', 'does not match'],
    ['requirements.md', '### C042-REQ-005 Missing dash', 'requirement', 'lacks the " — <title>"'],
    ['requirements.md', '### C042-REQ-005 —', 'requirement', 'lacks the " — <title>"'],
    ['requirements.md', '### C42-REQ-005 — Two digits', 'requirement', 'does not match'],
    [
      'acceptance.md',
      '#### C042-AC-003 — No criterion number',
      'acceptance criterion',
      'does not match',
    ],
    ['acceptance.md', '#### C042-AC-003.2 no title', 'acceptance criterion', 'lacks'],
    [
      'acceptance.md',
      '```gherkin\nScenario: C042-TS-13 — Short\n```',
      'scenario',
      'does not match',
    ],
    ['acceptance.md', '```gherkin\nScenario: C042-TS-013 no title\n```', 'scenario', 'lacks'],
  ])('skips a malformed item in %s: %j', async (file, entry, kind, reason) => {
    const files = wellFormed();
    const path = `.sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/${file}`;
    const before = files[path]!.split('\n').length;
    const at = before + (entry.startsWith('```') ? 2 : 1);
    files[path] = `${files[path]}\n${entry}\ntext\n`;
    const { reading, notices } = await read(files);
    const added = reading.changes[1]!.items.filter(
      (i) => i.location!.path === path && i.location!.line > before,
    );
    expect(added).toEqual([]);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toContain(`Skipped ${kind} in "${path}" line ${at}`);
    expect(notices[0]!.message).toContain(reason);
  });

  it('keeps the first of two items with the same ID in one change', async () => {
    const files = wellFormed();
    const path = '.sdd/042-cart/10-spec/20-capabilities/CAP-02-more/requirements.md';
    files[path] = '### C042-REQ-003 — Again\nsecond text\n';
    const { reading, notices } = await read(files);
    const req3 = reading.changes[1]!.items.filter((i) => i.id === 'C042-REQ-003');
    expect(req3).toHaveLength(1);
    expect(req3[0]!.title).toBe('Total of the cart');
    expect(notices).toEqual([
      expect.objectContaining({
        code: 'ERR-SDD-005',
        message: expect.stringContaining(
          `Skipped requirement in "${path}" line 1: ID C042-REQ-003`,
        ),
      }),
    ]);
  });

  it('allows the same ID in two different changes', async () => {
    const files = wellFormed();
    files['.sdd/043-promo/change.md'] = change('CHG-043');
    files['.sdd/043-promo/10-spec/20-capabilities/CAP-01/requirements.md'] =
      '### C042-REQ-003 — Same ID elsewhere\n';
    const { notices } = await read(files);
    expect(notices).toEqual([]);
  });

  it('logs every notice with its operation, inputs and cause (NFR-D-04)', async () => {
    const logged: unknown[] = [];
    const log = { recordError: (e: unknown, op: string) => logged.push([e, op]) };
    const sink = new NoticeCollector(log as never);
    const files = wellFormed();
    files['.sdd/043-promo/change.md'] = '# none';
    await readSddWorkspace(treeOf(files), sink);
    expect(logged).toHaveLength(1);
    const [error, operation] = logged[0] as [
      { code: string; context: { inputs: object; cause: string } },
      string,
    ];
    expect(operation).toBe('read-intent-sources');
    expect(error.code).toBe('ERR-SDD-005');
    expect(error.context.inputs).toEqual({
      file: '.sdd/043-promo/change.md',
      line: 1,
      entryKind: 'change folder',
    });
    expect(error.context.cause).toBe('file has no YAML frontmatter');
  });
});

describe('readSddIntentSources: intent context and lines read on both sides', () => {
  it('puts the open changes into the intent context and pairs lines by item ID', async () => {
    const base = wellFormed();
    const snapshot = { ...base };
    const req = '.sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/requirements.md';
    // The change adds a requirement before REQ-004 and deletes the task file.
    snapshot[req] = REQUIREMENTS.replace(
      '### C042-REQ-004',
      '### C042-REQ-005 — New one\nnew text\n\n### C042-REQ-004',
    );
    delete snapshot['.sdd/042-cart/20-plan/50-tasks/T-007-cart-total.md'];
    const sink = new NoticeCollector();
    const result = await readSddIntentSources({
      snapshot: treeOf(snapshot),
      base: treeOf(base),
      sink,
    });
    expect(result.sddChanges.map((c) => [c.id, c.origin, c.location])).toEqual([
      ['CHG-042', 'sdd-folder', '.sdd/042-cart'],
    ]);
    expect(result.selected?.id).toBe('CHG-042');
    const lines = result.specItemLines.get('CHG-042')!;
    expect(lines.get('C042-REQ-005')).toEqual({
      snapshot: { path: req, lines: [10, 11, 12] },
      base: null,
    });
    expect(lines.get('C042-REQ-004')).toEqual({
      snapshot: { path: req, lines: [13, 14, 15, 16, 17, 18] },
      base: { path: req, lines: [10, 11, 12, 13, 14, 15] },
    });
    expect(lines.get('C042-T-007')).toEqual({
      snapshot: null,
      base: {
        path: '.sdd/042-cart/20-plan/50-tasks/T-007-cart-total.md',
        lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
    });
    expect(result.specItemLines.has('CHG-041')).toBe(false);
  });

  it('reads the base side by change ID, also when the folder was renamed', async () => {
    const base = wellFormed();
    const snapshot: Record<string, string> = {};
    for (const [p, t] of Object.entries(base)) snapshot[p.replace('042-cart', '042-basket')] = t;
    const result = await readSddIntentSources({
      snapshot: treeOf(snapshot),
      base: treeOf(base),
      sink: new NoticeCollector(),
    });
    const pair = result.specItemLines.get('CHG-042')!.get('C042-REQ-003')!;
    expect(pair.snapshot!.path).toContain('042-basket');
    expect(pair.base!.path).toContain('042-cart');
  });

  it('reports notices of the snapshot only, not of the base commit', async () => {
    const base = wellFormed();
    base['.sdd/043-promo/change.md'] = '# broken at the base commit';
    const sink = new NoticeCollector();
    await readSddIntentSources({ snapshot: treeOf(wellFormed()), base: treeOf(base), sink });
    expect(sink.notices).toEqual([]);
  });

  it('stops with ERR-SDD-001 when several changes are open and none is named (C001-T-031)', async () => {
    const files = wellFormed();
    files['.sdd/043-promo/change.md'] = change('CHG-043');
    const read = (sddChange?: string) =>
      readSddIntentSources({
        snapshot: treeOf(files),
        base: treeOf(files),
        sink: new NoticeCollector(),
        ...(sddChange !== undefined ? { sddChange } : {}),
      });
    await expect(read()).rejects.toMatchObject({ code: 'ERR-SDD-001' });
    const result = await read('043-promo');
    expect(result.selected?.id).toBe('CHG-043');
    expect(result.sddChanges.map((c) => c.id)).toEqual(['CHG-042', 'CHG-043']);
    expect(result.architecture.documented).toBeNull();
  });
});
