import { FixtureRepo, type FixtureOptions } from '../builder/fixture-repo.js';

/**
 * `fx-branches` (CAP-01 acceptance): "main" holds M1; "agent/cart" branches off M1 and holds C1 to
 * C3 that change "src/cart.ts"; "main" then moves on with M2 and M3 that change "docs/release.md"
 * only. HEAD is on "agent/cart" at C3.
 */
export function buildFxBranches(options: FixtureOptions = {}): FixtureRepo {
  const repo = FixtureRepo.create(options);
  repo.commit('M1', {
    subject: 'M1: main',
    files: {
      'src/cart.ts': 'export const cart = (n: number) => n * 2;\n',
      'docs/release.md': '# Release\n',
    },
  });
  repo.git('checkout', '-q', '-b', 'agent/cart');
  for (const n of [1, 2, 3]) {
    repo.commit(`C${n}`, {
      subject: `C${n}: cart step ${n}`,
      files: { 'src/cart.ts': `export const cart = (n: number) => n * 2 + ${n};\n` },
    });
  }
  repo.checkout('main');
  for (const n of [2, 3]) {
    repo.commit(`M${n}`, {
      subject: `M${n}: release notes ${n}`,
      files: { 'docs/release.md': `# Release ${n}\n` },
    });
  }
  repo.checkout('agent/cart');
  return repo;
}
