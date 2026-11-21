import { describe, expect, it } from 'vitest';
import { FileMentions, IdMentions } from '../../../src/core/intent-sources/mentions.js';
import { locatePlanItems } from '../../../src/core/intent-sources/plan-items.js';
import {
  recordedRunsOf,
  runLiesIn,
  runMentions,
  transcriptPassages,
} from '../../../src/core/intent-sources/transcripts.js';

// C001-TC-510 (unit level, C001-TS-526): transcript passages and recorded runs of C001-IF-007 §9 —
// the commands an agent plan or transcript shows the agent running, with their recorded outputs,
// and the facts the intent map links them by (§9 item 3).

const md = (text: string, path = 'agent-log.md') => ({ path, format: 'markdown' as const, text });
const txt = (text: string, path = 'agent-log.txt') => ({
  path,
  format: 'plain-text' as const,
  text,
});
const summary = (runs: ReturnType<typeof recordedRunsOf>) =>
  runs.map((r) => [r.command, r.recordedOutput, r.location.line]);

describe('recorded runs in Markdown (§9 item 2)', () => {
  it('prompt lines are commands and the lines up to the next prompt their output', () => {
    const text = [
      '# Coupon', // 1
      '```console', // 2
      '$ node scripts/try-coupon.js SAVE10', // 3
      'Total: 90.00', // 4
      '', // 5
      'PS> Get-Item x', // 6
      'PS C:\\repo> npm test', // 7
      'ok', // 8
      'C:\\repo>dir', // 9
      '> echo hi', // 10
      'hi', // 11
      '$ ', // 12
      'orphan output', // 13
      '```', // 14
    ].join('\n');
    expect(summary(recordedRunsOf(md(text)))).toEqual([
      ['node scripts/try-coupon.js SAVE10', 'Total: 90.00', 3],
      ['Get-Item x', null, 6],
      ['npm test', 'ok', 7],
      ['dir', null, 9],
      ['echo hi', 'hi', 10],
    ]);
    const first = recordedRunsOf(md(text))[0]!;
    expect(first.location.path).toBe('agent-log.md');
    expect(first.intentIds).toEqual([]);
  });

  it('accepts every shell info string, by its first word and in any case', () => {
    for (const info of [
      'console',
      'terminal',
      'shell-session',
      'sh',
      'bash',
      'zsh',
      'shell',
      'powershell',
      'pwsh',
      'ps1',
      'cmd',
      'bat',
      'Bash title="x"',
    ]) {
      expect(recordedRunsOf(md(`\`\`\`${info}\n$ make\n\`\`\`\n`)), info).toHaveLength(1);
    }
    expect(recordedRunsOf(md('```js\n$ make\n```\n'))).toEqual([]);
    expect(recordedRunsOf(md('$ make outside a block\n'))).toEqual([]);
  });

  it('without prompts each non-comment line is a command; a following output block belongs to the last', () => {
    const text = [
      '```bash', // 1
      '# install', // 2
      'npm ci', // 3
      '', // 4
      'npm run demo:coupon', // 5
      '```', // 6
      '', // 7
      '```text', // 8
      'Discount applied', // 9
      '```', // 10
    ].join('\n');
    expect(summary(recordedRunsOf(md(text)))).toEqual([
      ['npm ci', null, 3],
      ['npm run demo:coupon', 'Discount applied', 5],
    ]);
    expect(summary(recordedRunsOf(md('```cmd\nREM x\n:: y\ndir\n```\n```\nout\n```\n')))).toEqual([
      ['dir', 'out', 4],
    ]);
  });

  it('an output block only counts right after the shell block and with an output info string', () => {
    expect(summary(recordedRunsOf(md('```sh\nmake\n```\nprose\n```text\nout\n```\n')))).toEqual([
      ['make', null, 2],
    ]);
    expect(summary(recordedRunsOf(md('```sh\nmake\n```\n```json\n{}\n```\n')))).toEqual([
      ['make', null, 2],
    ]);
    expect(summary(recordedRunsOf(md('```sh\nmake\n```\n~~~output\nok\n~~~\n')))).toEqual([
      ['make', 'ok', 2],
    ]);
  });

  it('an unclosed block runs to the end of the file; CRLF is read as LF', () => {
    expect(summary(recordedRunsOf(md('```console\r\n$ ls\r\na\r\n')))).toEqual([['ls', 'a', 2]]);
  });
});

describe('recorded runs in plain text (§9 item 2)', () => {
  it('lines starting with "$ " are commands, the lines up to the next blank line their output', () => {
    const text = [
      'intro',
      '$ npm test',
      'pass',
      'done',
      '',
      'after',
      '$ ls',
      '$ pwd',
      '/repo',
    ].join('\n');
    expect(summary(recordedRunsOf(txt(text)))).toEqual([
      ['npm test', 'pass\ndone', 2],
      ['ls', null, 7],
      ['pwd', '/repo', 8],
    ]);
    expect(recordedRunsOf(txt('  $ indented\n> not a plain prompt\n'))).toEqual([]);
  });
});

describe('transcript passages (§9 item 1)', () => {
  it('splits a Markdown transcript at headings, not at headings inside fenced blocks', () => {
    const text = ['preface', '', '# One', 'a', '```sh', '# comment', '```', '## Two', 'b', ''].join(
      '\n',
    );
    const passages = transcriptPassages(md(text));
    expect(passages.map((p) => [p.location.line, p.lastLine])).toEqual([
      [1, 1],
      [3, 7],
      [8, 9],
    ]);
    expect(passages[2]!.text).toBe('## Two\nb');
    expect(passages[0]!.file).toBe('agent-log.md');
  });

  it('splits a plain-text transcript at blank lines', () => {
    const passages = transcriptPassages(txt('a\nb\n\n\nc\n'));
    expect(passages.map((p) => [p.location.line, p.lastLine, p.text])).toEqual([
      [1, 2, 'a\nb'],
      [5, 5, 'c'],
    ]);
  });
});

describe('links of recorded runs (§9 item 3)', () => {
  it('a run lies in the plan item or passage whose lines hold it', () => {
    const plan = md(
      '- [ ] Apply a coupon\n  ```sh\n  node scripts/try-coupon.js SAVE10\n  ```\n- [ ] Charge VAT\n',
      'plan.md',
    );
    const [coupon, vat] = locatePlanItems(plan, new FileMentions([]));
    const [run] = recordedRunsOf(plan);
    expect(run!.command).toBe('node scripts/try-coupon.js SAVE10');
    expect(runLiesIn(run!, { location: coupon!.item.location, lastLine: coupon!.lastLine })).toBe(
      true,
    );
    expect(runLiesIn(run!, { location: vat!.item.location, lastLine: vat!.lastLine })).toBe(false);
    const [passage] = transcriptPassages(md('x\n', 'other.md'));
    expect(runLiesIn(run!, passage!)).toBe(false);
  });

  it('a run names spec items and changed files in its command or output', () => {
    const [run] = recordedRunsOf(
      md(
        '```console\n$ npx vitest test/coupon.test.ts\nC001-TS-526 passed in src/coupon.ts\n```\n',
      ),
    );
    const mentions = runMentions(
      run!,
      new IdMentions([{ id: 'C001-TS-526' }]),
      new FileMentions(['src/coupon.ts', 'test/coupon.test.ts']),
    );
    expect(mentions).toEqual({
      ids: ['C001-TS-526'],
      files: ['src/coupon.ts', 'test/coupon.test.ts'],
    });
  });
});
