import { FixtureRepo, type FixtureOptions } from '../builder/fixture-repo.js';

/**
 * `fx-local` (CAP-01 acceptance, fixture conventions): HEAD on branch "agent/cart" at commit C2, no
 * upstream branch, no remote and no local branch `main` or `master`, so that the default base
 * commit is HEAD (C001-REQ-104). C0 holds the files; C1 and C2 are agent commits on top of it.
 */
export function buildFxLocal(options: FixtureOptions = {}): FixtureRepo {
  const repo = FixtureRepo.create({ ...options, initialBranch: 'agent/cart' });
  repo.commit('C0', {
    subject: 'C0: start',
    files: {
      'src/cart.ts': 'export const cart = (n: number) => n * 2;\n',
      'src/tax.ts': 'export const tax = (n: number) => n * 0.2;\n',
      'src/order.ts': 'export const order = () => [1, 2, 3];\n',
    },
  });
  repo.commit('C1', {
    subject: 'C1: cart totals',
    files: { 'src/cart.ts': 'export const cart = (n: number) => n * 2 + 1;\n' },
  });
  repo.commit('C2', {
    subject: 'C2: tax rounding',
    files: { 'src/tax.ts': 'export const tax = (n: number) => Math.round(n * 0.2);\n' },
  });
  return repo;
}
