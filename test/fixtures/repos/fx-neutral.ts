import { FixtureRepo, type FixtureOptions } from '../builder/fixture-repo.js';

/**
 * `fx-neutral` (CAP-01 and CAP-02 acceptance, C001-REQ-111, C001-REQ-124, C001-REQ-207): the base
 * commit B0 holds the neutral intent-and-architecture file `.sdd-review/workspace.json` with the
 * open SDD change "FEAT-9" — the requirements "R-1" and "R-2" and the task "T-1" linked to "R-1" —
 * and an architecture with the components "Api" (`server/**`) and "Ui" (`client/**`), the layers
 * "edge" (Ui) and "core" (Api) and the allowed dependency Ui to Api. The working tree edits
 * "server/api.ts", so a review naming B0 has a change; the neutral file is read from B0 unless a
 * scenario edits it.
 */

export const FX_NEUTRAL_FILE = '.sdd-review/workspace.json';

export const FX_NEUTRAL_TEXT: Readonly<Record<string, string>> = {
  'R-1': 'The API SHALL return the order total.',
  'R-2': 'The UI SHALL show the order total.',
  'T-1': 'Add the total to the order endpoint in server/api.ts.',
};

/** The neutral file of B0, as a value; scenarios that break it start from a copy. */
export function fxNeutralDocument() {
  return {
    $schema: 'https://example.invalid/sdd-review/workspace.schema.json',
    formatVersion: 1,
    producer: 'fixture-tool 1.0',
    changes: [
      {
        id: 'FEAT-9',
        title: 'Order total',
        status: 'open',
        items: [
          {
            id: 'R-1',
            kind: 'requirement',
            title: 'Total in the API',
            text: FX_NEUTRAL_TEXT['R-1'],
          },
          {
            id: 'R-2',
            kind: 'requirement',
            title: 'Total in the UI',
            text: FX_NEUTRAL_TEXT['R-2'],
          },
          {
            id: 'T-1',
            kind: 'task',
            title: 'Order endpoint total',
            text: FX_NEUTRAL_TEXT['T-1'],
            links: [{ to: 'R-1', type: 'implements' }],
            files: ['server/api.ts'],
          },
        ],
      },
    ],
    architecture: {
      layers: ['edge', 'core'],
      components: [
        { id: 'Ui', name: 'Ui', layer: 'edge', paths: ['client/**'], dependsOn: ['Api'] },
        { id: 'Api', name: 'Api', layer: 'core', paths: ['server/**'] },
      ],
    },
  };
}

export const neutralText = (document: unknown) => `${JSON.stringify(document, null, 2)}\n`;

export function buildFxNeutral(options: FixtureOptions = {}): FixtureRepo {
  const repo = FixtureRepo.create(options);
  repo.commit('B0', {
    subject: 'B0: order service with a neutral intent-and-architecture file',
    files: {
      'server/api.ts': 'export const order = (prices: number[]) => ({ items: prices });\n',
      'client/ui.ts': "import { order } from '../server/api';\nexport const view = order;\n",
      'src/cart.ts': 'export const cart = (n: number) => n * 2;\n',
      [FX_NEUTRAL_FILE]: neutralText(fxNeutralDocument()),
    },
  });
  repo.write(
    'server/api.ts',
    'export const order = (prices: number[]) => ({ items: prices, total: prices.reduce((a, b) => a + b, 0) });\n',
  );
  return repo;
}
