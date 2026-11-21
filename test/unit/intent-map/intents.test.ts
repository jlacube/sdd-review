import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type {
  IntakeDocument,
  PlanItem,
  SddChange,
  SpecItem,
} from '../../../src/generated/analysis-results.js';
import {
  compareIds,
  createIntents,
  intentIdOf,
  intentSourcesOf,
  planKeyPath,
  type IntentSourcesInput,
} from '../../../src/core/intent-map/intents.js';
import { textHash } from '../../../src/core/intent-sources/text.js';

// C001-T-044 (C001-REQ-302, C001-REQ-305, C001-REQ-313, C001-REQ-314, C001-REQ-317), unit level of
// C001-TC-302, C001-TC-305, C001-TC-313 and C001-TC-314: the intents of a review from the selected
// SDD change, from commits only, from plan items only and from both, with their intent sources,
// intent keys (domain model §3) and source order.

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const item = (id: string, kind: SpecItem['kind'], line: number): SpecItem => ({
  id,
  kind,
  title: `Title of ${id}`,
  text: `Text of ${id}`,
  textHash: textHash(`Text of ${id}`),
  links: [],
  files: [],
  location: { path: '.sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/requirements.md', line },
});

const CHG_042: SddChange = {
  id: 'CHG-042',
  title: 'Cart',
  origin: 'sdd-folder',
  items: [
    item('C042-REQ-004', 'requirement', 12),
    item('C042-T-007', 'task', 1),
    item('C042-REQ-003', 'requirement', 8),
    item('C042-AC-003.1', 'acceptance-criterion', 3),
    item('C042-TS-010', 'scenario', 5),
    item('C042-REQ-1000', 'requirement', 40),
    item('C042-REQ-999', 'requirement', 30),
  ],
};

const C1 = 'a'.repeat(40);
const C2 = 'b'.repeat(40);
const COMMITS = [
  { hash: C1, subject: 'Add cart totals', message: 'Add cart totals\n' },
  {
    hash: C2,
    subject: 'Refactor pricing',
    message: 'Refactor pricing\n\nMoves the rules into Pricing.   \n',
  },
];

const plan = (file: string, ordinal: number, line: number): PlanItem => ({
  file,
  ordinal,
  title: `Step ${ordinal}`,
  text: `- Step ${ordinal}`,
  textHash: textHash(`- Step ${ordinal}`),
  location: { path: file, line },
  files: [],
});
const PLAN = [plan('plan.md', 1, 3), plan('plan.md', 2, 7), plan('plan.md', 3, 12)];

const input = (over: Partial<IntentSourcesInput>): IntentSourcesInput => ({
  sddChange: null,
  commits: [],
  planItems: [],
  ...over,
});
const MODEL_FREE = { modelFree: true } as const;

describe('C001-REQ-305: one intent per requirement of the SDD change', () => {
  const intents = createIntents(
    input({ sddChange: CHG_042, commits: COMMITS, planItems: PLAN }),
    MODEL_FREE,
  );

  it('C001-TS-307: requirements become intents; tasks, criteria and scenarios do not', () => {
    expect(intents.map((i) => i.source.reference)).toEqual([
      'C042-REQ-003',
      'C042-REQ-004',
      'C042-REQ-999',
      'C042-REQ-1000',
    ]);
    expect(intents.every((i) => i.kind === 'spec-requirement')).toBe(true);
  });

  it('C001-REQ-313/314 apply only without an SDD change: no commit or plan intent', () => {
    expect(intents.some((i) => i.kind !== 'spec-requirement')).toBe(false);
  });

  it('keys, IDs, source and source order (domain model §3, C001-REQ-317)', () => {
    const first = intents[0]!;
    expect(first.intentKey).toBe('spec:CHG-042:C042-REQ-003');
    expect(first.intentId).toBe(`i-${sha('spec:CHG-042:C042-REQ-003').slice(0, 16)}`);
    expect(first.intentId).toMatch(/^i-[0-9a-f]{16}$/);
    expect(first.title).toBe('Title of C042-REQ-003');
    expect(first.source).toEqual({
      type: 'spec-item',
      reference: 'C042-REQ-003',
      location: { path: CHG_042.items[2]!.location!.path, line: 8 },
      text: 'Text of C042-REQ-003',
      textHash: textHash('Text of C042-REQ-003'),
    });
    expect(intents.map((i) => i.sourceOrder)).toEqual([0, 1, 2, 3]);
    expect(intents.every((i) => i.unmet)).toBe(true);
  });

  it('C001-TS-308: an SDD change without requirements yields no intent, also in model-free mode', () => {
    const empty: SddChange = { ...CHG_042, items: [item('C042-T-007', 'task', 1)] };
    expect(createIntents(input({ sddChange: empty, commits: COMMITS }), MODEL_FREE)).toEqual([]);
  });

  it('a neutral-file change keys its intents by its prefixed ID', () => {
    const neutral = { ...CHG_042, id: 'neutral:CHG-042', origin: 'neutral-file' as const };
    expect(createIntents(input({ sddChange: neutral }), MODEL_FREE)[0]!.intentKey).toBe(
      'spec:neutral:CHG-042:C042-REQ-003',
    );
  });
});

describe('C001-REQ-313: one extracted intent per commit in model-free mode', () => {
  it('C001-TS-327/329: titled with the subject line, commits oldest first', () => {
    const intents = createIntents(input({ commits: COMMITS }), MODEL_FREE);
    expect(intents.map((i) => i.title)).toEqual(['Add cart totals', 'Refactor pricing']);
    expect(intents.map((i) => i.kind)).toEqual(['extracted-commit', 'extracted-commit']);
    expect(intents[1]).toEqual({
      intentId: intentIdOf(`commit:${C2}`),
      intentKey: `commit:${C2}`,
      title: 'Refactor pricing',
      kind: 'extracted-commit',
      source: {
        type: 'commit',
        reference: C2,
        location: null,
        text: COMMITS[1]!.message,
        textHash: textHash('Refactor pricing\n\nMoves the rules into Pricing.\n'),
      },
      sourceOrder: 1,
      unmet: true,
    });
  });

  it('C001-TS-330: no commit and no plan yield no intent', () => {
    expect(createIntents(input({}), MODEL_FREE)).toEqual([]);
  });

  it('with a model provider in use, extraction is not deterministic (C001-REQ-315)', () => {
    expect(
      createIntents(input({ commits: COMMITS, planItems: PLAN }), { modelFree: false }),
    ).toEqual([]);
  });
});

describe('C001-REQ-314: one extracted intent per plan item in model-free mode', () => {
  it('C001-TS-331: plan items yield intents with their file and line as source', () => {
    const intents = createIntents(input({ planItems: PLAN }), MODEL_FREE);
    expect(intents.map((i) => i.kind)).toEqual(Array(3).fill('extracted-plan-item'));
    expect(intents.map((i) => i.source.location)).toEqual([
      { path: 'plan.md', line: 3 },
      { path: 'plan.md', line: 7 },
      { path: 'plan.md', line: 12 },
    ]);
    expect(intents.map((i) => i.source.reference)).toEqual(Array(3).fill('plan.md'));
    expect(intents.map((i) => i.intentKey)).toEqual([
      'plan:plan.md#1',
      'plan:plan.md#2',
      'plan:plan.md#3',
    ]);
    expect(intents[0]!.source.textHash).toBe(PLAN[0]!.textHash);
    expect(intents[0]!.title).toBe('Step 1');
  });

  it('the plan key path comes from the given resolver', () => {
    const intents = createIntents(input({ planItems: [plan('docs\\plan.txt', 1, 1)] }), {
      modelFree: true,
      planKeyPath: (file) => `/abs/${file}`,
    });
    expect(intents[0]!.intentKey).toBe('plan:/abs/docs\\plan.txt#1');
    expect(
      createIntents(input({ planItems: [plan('docs\\plan.txt', 1, 1)] }), MODEL_FREE)[0]!.intentKey,
    ).toBe('plan:docs/plan.txt#1');
  });

  it('a plan named twice gives its items once', () => {
    expect(createIntents(input({ planItems: [...PLAN, ...PLAN] }), MODEL_FREE)).toHaveLength(3);
  });
});

describe('commits and plan items together', () => {
  it('commits first, then plan items in file order (source order)', () => {
    const intents = createIntents(input({ commits: COMMITS, planItems: PLAN }), MODEL_FREE);
    expect(intents.map((i) => [i.kind, i.sourceOrder])).toEqual([
      ['extracted-commit', 0],
      ['extracted-commit', 1],
      ['extracted-plan-item', 2],
      ['extracted-plan-item', 3],
      ['extracted-plan-item', 4],
    ]);
  });

  it('the intent keys are stable: the same sources give the same intents', () => {
    const sources = input({ commits: COMMITS, planItems: PLAN });
    expect(createIntents(sources, MODEL_FREE)).toEqual(createIntents(sources, MODEL_FREE));
    expect(new Set(createIntents(sources, MODEL_FREE).map((i) => i.intentId)).size).toBe(5);
  });
});

describe('intentSourcesOf: the stored intake document', () => {
  const intake = (selected: boolean) =>
    ({
      intakeSummary: {
        intentContext: { sddChanges: [{ id: 'CHG-042', specItems: 7, selected }] },
      },
      intentContext: {
        sddChanges: [CHG_042],
        commits: COMMITS,
        planItems: PLAN,
      },
    }) as unknown as IntakeDocument;

  it('takes the selected SDD change', () => {
    expect(intentSourcesOf(intake(true)).sddChange).toBe(CHG_042);
  });

  it('an open change that was not selected is not the source (intent fallback)', () => {
    const sources = intentSourcesOf(intake(false));
    expect(sources.sddChange).toBeNull();
    expect(sources.commits).toBe(COMMITS);
    expect(sources.planItems).toBe(PLAN);
  });
});

describe('compareIds: ID order', () => {
  it('orders numbers numerically and text by code unit', () => {
    const ids = ['C042-REQ-010', 'C042-REQ-1000', 'C041-REQ-999', 'C042-REQ-003', 'C042-REQ-03'];
    expect([...ids].sort(compareIds)).toEqual([
      'C041-REQ-999',
      'C042-REQ-03',
      'C042-REQ-003',
      'C042-REQ-010',
      'C042-REQ-1000',
    ]);
  });
});

describe('planKeyPath (domain model §3)', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdd-plankey-'));
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'docs'), { recursive: true });
  writeFileSync(join(repo, 'docs', 'plan.md'), '- a\n');
  writeFileSync(join(root, 'outside.md'), '- a\n');
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('repository-relative with / for a plan in the repository, whatever the current directory', () => {
    expect(planKeyPath('docs/plan.md', repo, repo)).toBe('docs/plan.md');
    expect(planKeyPath('plan.md', repo, join(repo, 'docs'))).toBe('docs/plan.md');
    expect(planKeyPath(join(repo, 'docs', 'plan.md'), repo, root)).toBe('docs/plan.md');
  });

  it('absolute for a plan outside the repository', () => {
    const key = planKeyPath('../outside.md', repo, repo);
    expect(key.endsWith('outside.md')).toBe(true);
    expect(key).not.toMatch(/^\.\./);
    expect(planKeyPath(key, repo, repo)).toBe(key);
  });

  it('a plan that no longer exists still resolves inside the repository', () => {
    expect(planKeyPath('gone/plan.md', repo, repo)).toBe('gone/plan.md');
  });
});
