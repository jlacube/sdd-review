import { FixtureRepo, type CommitSpec, type FixtureOptions } from '../builder/fixture-repo.js';

/** The lines of "src/legacy.ts" in U1; C001-TS-123 has C1 delete four of them. */
export const LEGACY_LINES = [
  'export const legacyA = 1;\n',
  '\n',
  '// legacy helpers\n',
  'export const legacyB = () => 2;\n',
  'export const legacyC = () => 3;\n',
  'export const legacyD = () => 4;\n',
  '\n',
  'export const legacyZ = 26;\n',
];

/**
 * The agent commits C1 and C2 of `fx-upstream`, oldest first. A scenario that states other content,
 * authors or messages for them rebuilds them from a modified copy (`rebuildAgentCommits`).
 */
export function upstreamAgentCommits(): Record<'C1' | 'C2', CommitSpec> {
  return {
    C1: {
      subject: 'C1: cart totals',
      files: { 'src/cart.ts': 'export const cart = (n: number) => n * 2 + 1;\n' },
    },
    C2: {
      subject: 'C2: tax rounding',
      files: {
        'src/tax.ts': 'export const tax = (n: number) => Math.round(n * 0.2);\n',
        'src/cart.ts': 'export const cart = (n: number) => n * 2 + 2;\n',
      },
    },
  };
}

/** Moves "agent/cart" back to U1 and commits C1 and C2 again from `commits`. */
export function rebuildAgentCommits(
  repo: FixtureRepo,
  commits: Record<'C1' | 'C2', CommitSpec>,
): void {
  repo.git('reset', '-q', '--hard', repo.label('U1').hash);
  repo.forget('C1', 'C2');
  repo.commit('C1', commits.C1);
  repo.commit('C2', commits.C2);
}

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
      'src/legacy.ts': LEGACY_LINES.join(''),
    },
  });
  repo.git('checkout', '-q', '-b', 'agent/cart');
  repo.git('update-ref', 'refs/remotes/origin/agent/cart', repo.label('U1').hash);
  repo.setConfig('remote.origin.url', 'file:///nonexistent/origin.git');
  repo.setConfig('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
  repo.setConfig('branch.agent/cart.remote', 'origin');
  repo.setConfig('branch.agent/cart.merge', 'refs/heads/agent/cart');
  const agent = upstreamAgentCommits();
  repo.commit('C1', agent.C1);
  repo.commit('C2', agent.C2);
  return repo;
}

const plans = new WeakMap<FixtureRepo, Record<'C1' | 'C2', CommitSpec>>();

/**
 * The commit specs C1 and C2 of an `fx-upstream` repository as the scenario's steps have stated them
 * so far; a step changes the returned specs and calls `rebuildAgentCommits` with them.
 */
export function agentPlan(repo: FixtureRepo): Record<'C1' | 'C2', CommitSpec> {
  let plan = plans.get(repo);
  if (!plan) {
    plan = upstreamAgentCommits();
    plans.set(repo, plan);
  }
  return plan;
}
