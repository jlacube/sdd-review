import { describe, expect, it } from 'vitest';
import { FileMentions } from '../../../src/core/intent-sources/mentions.js';
import { locatePlanItems, planItemsOf } from '../../../src/core/intent-sources/plan-items.js';
import { textHash } from '../../../src/core/intent-sources/text.js';

// C001-TC-314 (unit level, C001-TS-331): the plan-item rule of C001-IF-007 §8 — Markdown rules 1
// to 6 in order, the plain-text rules, extent, title and ordinal — and the files each plan item
// names (§10, link signal "plan item names the file").

const none = new FileMentions([]);
const md = (text: string, mentions = none) =>
  planItemsOf({ path: 'plan.md', format: 'markdown', text }, mentions);
const txt = (text: string, mentions = none) =>
  planItemsOf({ path: 'plan.txt', format: 'plain-text', text }, mentions);
const lines = (items: ReadonlyArray<{ location: { line: number } }>) =>
  items.map((i) => i.location.line);
const titles = (items: ReadonlyArray<{ title: string }>) => items.map((i) => i.title);

describe('C001-TS-331 fixtures: 3 plan items at lines 3, 7 and 12', () => {
  it('Markdown plan', () => {
    const text = [
      '# Coupon plan', // 1
      '', // 2
      '1. Add the coupon model', // 3
      '   with a code and a rate', // 4
      '   - nested detail', // 5
      '', // 6
      '2. Apply the coupon in `src/cart.ts`', // 7
      '', // 8
      '   ```bash', // 9
      '   npm test', // 10
      '   ```', // 11
      '3. Show the discount', // 12
    ].join('\n');
    const items = md(text, new FileMentions(['src/cart.ts', 'src/model.ts']));
    expect(lines(items)).toEqual([3, 7, 12]);
    expect(items.map((i) => i.ordinal)).toEqual([1, 2, 3]);
    expect(titles(items)).toEqual([
      'Add the coupon model',
      'Apply the coupon in src/cart.ts',
      'Show the discount',
    ]);
    expect(items[0]!.text).toBe(
      '1. Add the coupon model\n   with a code and a rate\n   - nested detail',
    );
    expect(items[1]!.text).toContain('npm test');
    expect(items[1]!.files).toEqual(['src/cart.ts']);
    expect(items[0]!.files).toEqual([]);
    expect(items[0]!.textHash).toBe(textHash(items[0]!.text));
    expect(items[0]!.file).toBe('plan.md');
    expect(items[0]!.location.path).toBe('plan.md');
  });

  it('plain-text plan', () => {
    const text = [
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
    ].join('\n');
    const items = txt(text);
    expect(lines(items)).toEqual([3, 7, 12]);
    expect(titles(items)).toEqual([
      'Add the coupon model',
      'Apply the coupon',
      'Show the discount',
    ]);
    expect(items[1]!.text).toBe('- Apply the coupon\n  in the cart\n\n  checked by tests');
  });

  it('CRLF line endings give the same items as LF', () => {
    const text = '# T\n\n- [ ] one\n- [x] two\n';
    expect(md(text.replace(/\n/g, '\r\n'))).toEqual(md(text));
  });
});

describe('Markdown rules (§8)', () => {
  it('rule 1: task-list items win, at the smallest indentation, with any list marker', () => {
    const items = md(
      [
        '1. Context',
        '- [ ] first',
        '  - [ ] sub',
        '* [x] second',
        '+ [X] third',
        '3) [ ] fourth',
      ].join('\n'),
    );
    expect(titles(items)).toEqual(['first', 'second', 'third', 'fourth']);
    expect(items[0]!.text).toBe('- [ ] first\n  - [ ] sub');
  });

  it('rule 2: numbered headings at the shallowest level among them', () => {
    const items = md(
      [
        '# Plan',
        '## 1. Model',
        'text',
        '### 1.1 Detail',
        '## Step 2: Cart',
        '## Notes',
        'not part of step 2',
        '## 3) UI',
        '- bullet',
      ].join('\n'),
    );
    expect(titles(items)).toEqual(['1. Model', 'Step 2: Cart', '3) UI']);
    expect(items[0]!.text).toBe('## 1. Model\ntext\n### 1.1 Detail');
    expect(items[1]!.text).toBe('## Step 2: Cart');
    expect(items[2]!.text).toBe('## 3) UI\n- bullet');
  });

  it('rule 2 needs a number after Step, Phase, Stage, Task or Part', () => {
    const items = md('## Phase one\n## Part 2 x\n## Task 3\n');
    expect(titles(items)).toEqual(['Part 2 x', 'Task 3']);
  });

  it('rule 3: ordered-list items before unordered ones', () => {
    const items = md('- intro\n\n1. a\n2) b\n');
    expect(titles(items)).toEqual(['a', 'b']);
  });

  it('rule 4: unordered-list items at the smallest indentation', () => {
    const items = md('  - deep\n- a\n  - a.1\n* b\n+ c\n');
    expect(titles(items)).toEqual(['a', 'b', 'c']);
    expect(items[0]!.text).toBe('- a\n  - a.1');
  });

  it('a list item ends at a heading and at a paragraph after a blank line (end of its list)', () => {
    const items = md('- a\nlazy line\n\nparagraph\n\n- b\n# Heading\nafter\n');
    expect(items.map((i) => i.text)).toEqual(['- a\nlazy line', '- b']);
  });

  it('rule 5: headings at the shallowest level, a single level-1 title excluded', () => {
    expect(titles(md('# Title\n## A\ntext\n## B\n'))).toEqual(['A', 'B']);
    expect(titles(md('# A\n# B\n## B.1\n'))).toEqual(['A', 'B']);
    expect(md('# A\n# B\n## B.1\n')[1]!.text).toBe('# B\n## B.1');
  });

  it('rule 6: otherwise the whole file is one plan item; a blank file has none', () => {
    const items = md('# Only a title\n\nSome prose\nmore prose\n');
    expect(items).toHaveLength(1);
    expect(items[0]!.location.line).toBe(1);
    expect(items[0]!.title).toBe('Only a title');
    expect(items[0]!.text).toBe('# Only a title\n\nSome prose\nmore prose');
    expect(md('\n\n  \n')).toEqual([]);
  });

  it('ignores fenced code blocks, HTML comments and YAML frontmatter', () => {
    const text = [
      '```', // 1
      '- [ ] in a fence', // 2
      '```', // 3
      '<!-- - [ ] in a comment', // 4
      '1. still in the comment -->', // 5
      '- [ ] before a comment <!-- one-line -->', // 6
      '- [ ] real', // 7
    ].join('\n');
    const items = md(text);
    expect(lines(items)).toEqual([6, 7]);
    expect(titles(items)).toEqual(['before a comment', 'real']);
    // A YAML sequence in the frontmatter is not a list of plan items: rule 6 applies.
    const whole = md('---\n- a\n- b\n---\n\nProse\n');
    expect(whole).toHaveLength(1);
    expect(whole[0]!.location.line).toBe(6);
  });

  it('titles lose markers and inline markup, keep link text, and are cut to 200 characters', () => {
    const items = md(
      [
        '- [ ] **Bold** _it_ *em* `code` [link text](https://x.test) ![alt](a.png) ~~gone~~ snake_case_name',
        `- [ ] ${'é'.repeat(250)}`,
      ].join('\n'),
    );
    expect(items[0]!.title).toBe('Bold it em code link text alt gone snake_case_name');
    expect(Array.from(items[1]!.title)).toHaveLength(200);
  });
});

describe('plain-text rules (§8)', () => {
  it('checkbox lines first, optionally after - or *', () => {
    const items = txt('1. intro\n[ ] a\n- [x] b\n* [ ] c\n');
    expect(titles(items)).toEqual(['a', 'b', 'c']);
  });

  it('numbered lines, then bullet lines with -, *, + or •', () => {
    expect(titles(txt('- x\n1. a\n2) b\n'))).toEqual(['a', 'b']);
    expect(titles(txt('• a\n+ b\n'))).toEqual(['a', 'b']);
    expect(titles(txt('1.no space\n'))).toEqual(['1.no space']);
  });

  it('otherwise each paragraph separated by blank lines', () => {
    const items = txt('First para\nline two\n\n\nSecond para\n');
    expect(lines(items)).toEqual([1, 5]);
    expect(items[0]!.text).toBe('First para\nline two');
  });

  it('keeps Markdown-looking markup in plain-text titles', () => {
    expect(titles(txt('- **bold** item\n'))).toEqual(['**bold** item']);
  });
});

describe('extents for recorded-run links (§9 item 3)', () => {
  it('gives the last line of each item', () => {
    const located = locatePlanItems(
      { path: 'plan.md', format: 'markdown', text: '- a\n  more\n\n- b\n' },
      none,
    );
    expect(located.map((l) => [l.item.location.line, l.lastLine])).toEqual([
      [1, 2],
      [4, 4],
    ]);
  });
});

describe('files named by plan items (§10)', () => {
  it('lists the changed files a plan item names, sorted and once each', () => {
    const mentions = new FileMentions(['src/b.ts', 'src/a.ts', 'docs/readme.md']);
    const items = md('- [ ] change `src/b.ts`, then src\\a.ts and src/b.ts.\n', mentions);
    expect(items[0]!.files).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
