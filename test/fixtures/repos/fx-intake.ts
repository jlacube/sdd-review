import { FixtureRepo, type FixtureOptions } from '../builder/fixture-repo.js';
import { buildFxBranches } from './fx-branches.js';
import { buildFxDefault } from './fx-default.js';
import { buildFxCrypt, buildFxLfs } from './fx-lfs.js';
import { buildFxLocal } from './fx-local.js';
import { buildFxNeutral } from './fx-neutral.js';
import { buildFxSdd, buildFxSddArchived } from './fx-sdd.js';
import { buildFxSize } from './fx-size.js';
import { buildFxUpstream } from './fx-upstream.js';

/**
 * `fx-intake` (CAP-01 acceptance): a repository whose base commit B0 holds the files that the
 * intake scenarios edit, delete, rename and add.
 */
export const FX_INTAKE_FILES: Readonly<Record<string, string>> = {
  'src/cart.ts': 'export const cart = (n: number) => n * 2;\n',
  'src/legacy.ts': 'export const legacy = 1;\n',
  'src/util.ts': 'export const util = (s: string) => s.trim();\n',
  'src/order.ts': 'export const order = () => [1, 2, 3];\n',
  'docs/guide.md': '# Guide\n',
  'docs/api.md': '# API\n',
};

export function buildFxIntake(options: FixtureOptions = {}): FixtureRepo {
  const repo = FixtureRepo.create(options);
  repo.commit('B0', { subject: 'B0: base', files: { ...FX_INTAKE_FILES } });
  return repo;
}

export const NAMED_FIXTURES: Record<string, (options?: FixtureOptions) => FixtureRepo> = {
  'fx-intake': buildFxIntake,
  'fx-upstream': buildFxUpstream,
  'fx-branches': buildFxBranches,
  'fx-default': buildFxDefault,
  'fx-local': buildFxLocal,
  'fx-sdd': buildFxSdd,
  'fx-sdd-archived': buildFxSddArchived,
  'fx-neutral': buildFxNeutral,
  'fx-size': buildFxSize,
  'fx-lfs': buildFxLfs,
  'fx-crypt': buildFxCrypt,
};
