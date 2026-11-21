import { describe, expect, it } from 'vitest';
import type { NamedFile } from '../../../src/generated/analysis-results.js';
import type { ChangeFile } from '../../../src/core/intake/change.js';
import { namedFileSources } from '../../../src/core/intake/intent-context.js';
import { textHash } from '../../../src/core/intent-sources/text.js';

// C001-TC-314 and C001-TC-510 (unit level): intake puts the plan items of the named agent plans
// and the recorded runs of the named plans and transcripts into the intent context (C001-T-032).

const named = (role: NamedFile['role'], path: string, text: string): NamedFile =>
  ({
    role,
    path,
    size: text.length,
    format: path.endsWith('.md') ? 'markdown' : 'plain-text',
    text,
    textHash: textHash(text),
  }) as NamedFile;

const changed = (path: string) =>
  ({ file: { path }, contentSha256: null }) as unknown as ChangeFile;

describe('namedFileSources', () => {
  it('reads plan items from plans only and recorded runs from plans and transcripts, in naming order', () => {
    const files = [
      named('pull-request-text', 'pr.md', '- [ ] not a plan item\n```sh\n$ not a run\n```\n'),
      named('agent-plan', 'plan.md', '- [ ] Apply a coupon in `src/coupon.ts`\n- [ ] Charge VAT\n'),
      named(
        'agent-transcript',
        'agent-log.md',
        '```console\n$ node scripts/try-coupon.js SAVE10\nTotal: 90\n```\n',
      ),
      named('agent-plan', 'plan.txt', '$ npm test\nok\n'),
    ];
    const sources = namedFileSources(files, [changed('src/coupon.ts'), changed('src/vat.ts')]);
    expect(sources.planItems.map((p) => [p.file, p.ordinal, p.title, p.files])).toEqual([
      ['plan.md', 1, 'Apply a coupon in src/coupon.ts', ['src/coupon.ts']],
      ['plan.md', 2, 'Charge VAT', []],
      ['plan.txt', 1, '$ npm test', []],
    ]);
    expect(sources.recordedRuns).toEqual([
      {
        command: 'node scripts/try-coupon.js SAVE10',
        recordedOutput: 'Total: 90',
        location: { path: 'agent-log.md', line: 2 },
        intentIds: [],
      },
      {
        command: 'npm test',
        recordedOutput: 'ok',
        location: { path: 'plan.txt', line: 1 },
        intentIds: [],
      },
    ]);
  });

  it('gives empty lists without named files', () => {
    expect(namedFileSources([], [])).toEqual({ planItems: [], recordedRuns: [] });
  });
});
