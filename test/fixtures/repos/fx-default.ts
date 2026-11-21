import { FixtureRepo, type FixtureOptions } from '../builder/fixture-repo.js';

/**
 * `fx-default` (CAP-01 acceptance, C001-REQ-104): the local branch "agent/cart", created at M1
 * (whose parent is M0) and holding the agent commits C1 and C2, which change "src/cart.ts" and
 * "src/tax.ts", with no upstream branch; the working tree holds an uncommitted edit of
 * "src/order.ts". D1 is a commit with no common history with HEAD, reachable from no ref until a
 * scenario points one at it. No remote, no local branch "main" or "master": scenarios add the
 * remotes, remote-tracking refs, local branches and the position of HEAD they state
 * (`DefaultSetup`).
 */
export function buildFxDefault(options: FixtureOptions = {}): FixtureRepo {
  const repo = FixtureRepo.create({ ...options, initialBranch: 'agent/cart' });
  repo.commit('M0', {
    subject: 'M0: first version',
    files: {
      'src/cart.ts': 'export const cart = (n: number) => n * 2;\n',
      'src/tax.ts': 'export const tax = (n: number) => n * 0.2;\n',
      'src/order.ts': 'export const order = () => [1, 2, 3];\n',
    },
  });
  repo.commit('M1', {
    subject: 'M1: shipping',
    files: { 'src/shipping.ts': 'export const shipping = () => 5;\n' },
  });

  // D1: an orphan commit, then back to the agent branch and the orphan branch is removed.
  repo.git('checkout', '-q', '--orphan', 'fixture-orphan');
  repo.git('rm', '-r', '-q', '--cached', '.');
  repo.git('clean', '-f', '-d', '-q');
  repo.commit('D1', {
    subject: 'D1: unrelated history',
    files: { 'docs/site.md': '# Site\n' },
  });
  repo.git('checkout', '-q', '-f', 'agent/cart');
  repo.git('branch', '-q', '-D', 'fixture-orphan');

  repo.commit('C1', {
    subject: 'C1: cart totals',
    files: { 'src/cart.ts': 'export const cart = (n: number) => n * 2 + 1;\n' },
  });
  repo.commit('C2', {
    subject: 'C2: tax rounding',
    files: { 'src/tax.ts': 'export const tax = (n: number) => Math.round(n * 0.2);\n' },
  });
  // A base repository (`--repo <ecosystem>`) may bring local branches of its own.
  for (const name of ['main', 'master']) {
    if (repo.git('branch', '--list', name) !== '') repo.git('branch', '-q', '-D', name);
  }
  repo.write('src/order.ts', 'export const order = () => [1, 2, 3, 4];\n');
  return repo;
}

/** The refs a scenario of `fx-default` sets up; commits are named by their labels. */
export const DefaultSetup = {
  /** A remote with no repository behind it (nothing is fetched) and its fetch refspec. */
  remote(repo: FixtureRepo, name: string): void {
    repo.setConfig(`remote.${name}.url`, `file:///nonexistent/${name}.git`);
    repo.setConfig(`remote.${name}.fetch`, `+refs/heads/*:refs/remotes/${name}/*`);
  },
  /** The remote-tracking ref `refs/remotes/<remote>/<branch>` at a commit. */
  remoteBranch(repo: FixtureRepo, remote: string, branch: string, label: string): void {
    repo.git('update-ref', `refs/remotes/${remote}/${branch}`, repo.label(label).hash);
  },
  /** The symbolic ref `refs/remotes/<remote>/HEAD` naming `target` (a full ref name). */
  remoteHead(repo: FixtureRepo, remote: string, target: string): void {
    repo.git('symbolic-ref', `refs/remotes/${remote}/HEAD`, target);
  },
  localBranch(repo: FixtureRepo, name: string, label: string): void {
    repo.git('branch', '-f', name, repo.label(label).hash);
  },
  tag(repo: FixtureRepo, name: string, label: string): void {
    repo.git('tag', name, repo.label(label).hash);
  },
  /** HEAD detached at a commit; the uncommitted edit stays in the working tree. */
  detach(repo: FixtureRepo, label: string): void {
    repo.git('checkout', '-q', '--detach', repo.label(label).hash);
  },
};
