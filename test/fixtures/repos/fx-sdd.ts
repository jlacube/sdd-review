import { FixtureRepo, type FixtureOptions } from '../builder/fixture-repo.js';

/**
 * `fx-sdd` (CAP-01 acceptance, C001-REQ-111, C001-REQ-123): the base commit B0 holds a `.sdd/`
 * workspace with the open SDD change "CHG-042" in ".sdd/042-cart/" — the requirements C042-REQ-003
 * and C042-REQ-004 and the task C042-T-007 that implements C042-REQ-003 — and the archived SDD
 * change "CHG-041" in ".sdd/041-checkout/" with the requirement C041-REQ-001. The working tree
 * edits "src/cart/total.ts", so a review naming B0 has a change; the `.sdd/` files are read from
 * B0 unless a scenario edits them.
 */
export const FX_SDD = {
  open: { id: 'CHG-042', folder: '.sdd/042-cart' },
  archived: { id: 'CHG-041', folder: '.sdd/041-checkout', items: ['C041-REQ-001'] },
  requirements: '.sdd/042-cart/10-spec/20-capabilities/CAP-01-cart/requirements.md',
  task: '.sdd/042-cart/20-plan/50-tasks/T-007.md',
} as const;

export const FX_SDD_TEXT: Readonly<Record<string, string>> = {
  'C042-REQ-003': '- **Statement:** THE cart SHALL show the total of its items.',
  'C042-REQ-004': '- **Statement:** THE cart SHALL show an empty state when it holds no item.',
  'C042-T-007': '# C042-T-007 — Cart total\n\nCompute the total in `src/cart/total.ts`.',
};

export function buildFxSdd(options: FixtureOptions = {}): FixtureRepo {
  const repo = FixtureRepo.create(options);
  repo.commit('B0', {
    subject: 'B0: cart with its SDD workspace',
    files: {
      'src/cart/total.ts': 'export const total = (prices: number[]) => prices.length;\n',
      '.sdd/registry.json': '{ "changes": [] }\n',
      [`${FX_SDD.open.folder}/change.md`]: [
        '---',
        'id: "CHG-042"',
        'title: "Cart"',
        'profile: "full"',
        'status: active',
        'phase: 20-plan',
        'phases:',
        '  10-spec: { status: approved }',
        '  20-plan: { status: approved }',
        '---',
        '',
        '# CHG-042 — Cart',
        '',
      ].join('\n'),
      [FX_SDD.requirements]: [
        '---',
        'id: "C042-CAP-01"',
        'artifact: spec/requirements',
        '---',
        '',
        '# C042-CAP-01 — Requirements',
        '',
        '### C042-REQ-003 — Show the cart total',
        FX_SDD_TEXT['C042-REQ-003'],
        '',
        '### C042-REQ-004 — Show an empty cart',
        FX_SDD_TEXT['C042-REQ-004'],
        '',
      ].join('\n'),
      [FX_SDD.task]: [
        '---',
        'id: C042-T-007',
        'title: Cart total',
        'status: todo',
        'implements: [C042-REQ-003]',
        'report: { commit: null, completed_at: null, notes: null }',
        '---',
        FX_SDD_TEXT['C042-T-007'],
        '',
      ].join('\n'),
      [`${FX_SDD.archived.folder}/change.md`]: [
        '---',
        'id: "CHG-041"',
        'title: "Checkout"',
        'profile: "full"',
        'status: archived',
        '---',
        '',
      ].join('\n'),
      [`${FX_SDD.archived.folder}/10-spec/20-capabilities/CAP-01-checkout/requirements.md`]: [
        '### C041-REQ-001 — Check out',
        '- **Statement:** THE cart SHALL check out.',
        '',
      ].join('\n'),
    },
  });
  repo.write(
    'src/cart/total.ts',
    'export const total = (prices: number[]) => prices.reduce((a, b) => a + b, 0);\n',
  );
  return repo;
}
