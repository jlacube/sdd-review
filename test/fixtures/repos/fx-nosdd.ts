import { FixtureRepo, type FixtureOptions } from '../builder/fixture-repo.js';

/**
 * Fixtures of the CAP-03 intent scenarios (C001-T-044).
 *
 * `fx-nosdd` (CAP-03 acceptance): the cart code of `fx-sdd` without any SDD workspace. The base
 * commit B0 holds three source files; HEAD is B0 on `main`, so a review without a named commit
 * takes HEAD as its base commit (C001-REQ-104). Scenarios add the commits, edits and plans they
 * state on top of B0.
 */
export const FX_NOSDD_FILES: Readonly<Record<string, string>> = {
  'src/cart/total.ts': 'export const total = (prices: number[]) => prices.length;\n',
  'src/cart/tax.ts': 'export const tax = (amount: number) => amount * 0.2;\n',
  'src/cart/pricing.ts': [
    'export const price = (amount: number) => amount;',
    '',
    'export const discount = (amount: number) => amount;',
    '',
    'export const label = (amount: number) => `${amount}`;',
    '',
  ].join('\n'),
};

export function buildFxNosdd(options: FixtureOptions = {}): FixtureRepo {
  const repo = FixtureRepo.create(options);
  repo.commit('B0', { subject: 'B0: cart without an SDD workspace', files: { ...FX_NOSDD_FILES } });
  return repo;
}

/**
 * The agent plans of C001-TS-331: each holds 3 plan items under the plan-item rule of C001-IF-007 §8,
 * starting at lines 3, 7 and 12 (the same texts as the unit tests of the rule).
 */
export const FX_NOSDD_PLANS: Readonly<Record<string, string>> = {
  'plan.md': [
    '# Coupon plan', // 1
    '', // 2
    '1. Add the coupon model', // 3
    '   with a code and a rate', // 4
    '   - nested detail', // 5
    '', // 6
    '2. Apply the coupon in `src/cart/total.ts`', // 7
    '', // 8
    '   ```bash', // 9
    '   npm test', // 10
    '   ```', // 11
    '3. Show the discount', // 12
    '',
  ].join('\n'),
  'plan.txt': [
    'Coupon plan', // 1
    '', // 2
    '- Add the coupon model', // 3
    '  with a code', // 4
    '  and a rate', // 5
    '', // 6
    '- Apply the coupon', // 7
    '  in the cart', // 8
    '', // 9
    '  checked by tests', // 10
    '', // 11
    '- Show the discount', // 12
    '',
  ].join('\n'),
};

/** The open SDD change of `fx-sdd-empty`. */
export const FX_SDD_EMPTY = { id: 'CHG-050', folder: '.sdd/050-empty' } as const;

/**
 * `fx-sdd-empty` (CAP-03 acceptance, C001-TS-308): the base commit B0 holds a `.sdd/` workspace
 * whose only open SDD change "CHG-050" has a task but 0 requirements, and the cart code of
 * `fx-nosdd`. The working tree edits the code in 5 hunks (one in each of `total.ts` and `tax.ts`,
 * three far apart in `pricing.ts`).
 */
export function buildFxSddEmpty(options: FixtureOptions = {}): FixtureRepo {
  const repo = FixtureRepo.create(options);
  repo.commit('B0', {
    subject: 'B0: cart with an SDD change without requirements',
    files: {
      ...FX_NOSDD_FILES,
      'src/cart/pricing.ts': pricingLines(() => ''),
      '.sdd/registry.json': '{ "changes": [] }\n',
      [`${FX_SDD_EMPTY.folder}/change.md`]: [
        '---',
        `id: "${FX_SDD_EMPTY.id}"`,
        'title: "Empty"',
        'profile: "full"',
        'status: active',
        '---',
        '',
      ].join('\n'),
      [`${FX_SDD_EMPTY.folder}/20-plan/50-tasks/T-001.md`]: [
        '---',
        'id: C050-T-001',
        'title: Prepare',
        'implements: []',
        '---',
        'Prepare the cart.',
        '',
      ].join('\n'),
    },
  });
  repo.write('src/cart/total.ts', `${FX_NOSDD_FILES['src/cart/total.ts']}// edited\n`);
  repo.write('src/cart/tax.ts', `${FX_NOSDD_FILES['src/cart/tax.ts']}// edited\n`);
  repo.write(
    'src/cart/pricing.ts',
    pricingLines((n) => (n === 1 || n === 20 || n === 40 ? ' // edited' : '')),
  );
  return repo;
}

/** 40 lines of pricing rules; `edit(n)` is appended to line n, so far-apart edits are separate hunks. */
function pricingLines(edit: (n: number) => string): string {
  const lines: string[] = [];
  for (let n = 1; n <= 40; n++) lines.push(`export const rule${n} = ${n};${edit(n)}`);
  return `${lines.join('\n')}\n`;
}
