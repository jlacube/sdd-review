import { FixtureRepo, type FixtureOptions } from '../builder/fixture-repo.js';

/**
 * `fx-upstream` (CAP-01 acceptance): HEAD on "agent/cart" with two commits C1 and C2 after the
 * commit U1, which is where the branch's upstream branch "origin/agent/cart" is. The remote-tracking
 * ref is written locally; the remote does not exist and nothing is fetched.
 */
export function buildFxUpstream(options: FixtureOptions = {}): FixtureRepo {
  const repo = FixtureRepo.create(options);
  repo.commit('U1', {
    subject: 'U1: upstream tip',
    files: {
      'src/cart.ts': 'export const cart = (n: number) => n * 2;\n',
      'src/tax.ts': 'export const tax = (n: number) => n * 0.2;\n',
      'src/order.ts': 'export const order = () => [1, 2, 3];\n',
      'src/shipping.ts': 'export const shipping = () => 5;\n',
    },
  });
  repo.git('checkout', '-q', '-b', 'agent/cart');
  repo.git('update-ref', 'refs/remotes/origin/agent/cart', repo.label('U1').hash);
  repo.setConfig('remote.origin.url', 'file:///nonexistent/origin.git');
  repo.setConfig('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
  repo.setConfig('branch.agent/cart.remote', 'origin');
  repo.setConfig('branch.agent/cart.merge', 'refs/heads/agent/cart');
  repo.commit('C1', {
    subject: 'C1: cart totals',
    files: { 'src/cart.ts': 'export const cart = (n: number) => n * 2 + 1;\n' },
  });
  repo.commit('C2', {
    subject: 'C2: tax rounding',
    files: {
      'src/tax.ts': 'export const tax = (n: number) => Math.round(n * 0.2);\n',
      'src/cart.ts': 'export const cart = (n: number) => n * 2 + 2;\n',
    },
  });
  return repo;
}
