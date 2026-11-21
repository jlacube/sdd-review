import { describe, expect, it } from 'vitest';
import { parseYaml, readFrontmatter } from '../../../src/core/intent-sources/frontmatter.js';

// C001-TC-123 (unit level): the YAML subset of `.sdd/` frontmatter and the fault line it reports
// (C001-IF-007 §2 item 5, §3 task files; C001-TS-151 line 2 "frontmatter is not YAML").

const yaml = (text: string) => parseYaml(text.split('\n'), 1);

describe('parseYaml', () => {
  it('reads the frontmatter shapes of sdd change and task files', () => {
    const value = yaml(
      [
        'id: "CHG-001"',
        "title: 'It''s a change'",
        'status: active',
        'phases:',
        '  00-ideation: { status: approved, approved_hash: "sha256:d07", approved_at: 2026-11-17 }',
        '  10-spec: { status: draft }',
        'implementation: { status: not-started }',
        'stopped: null',
        'owners: []',
        'depends_on: [C001-T-008, C001-T-009]',
        'report: { commit: null, completed_at: null, notes: null }',
        'count: 12',
        'flag: true',
        'defects:',
        '  - { id: D-001, summary: "a, b: c", status: closed }',
        '  - id: D-002',
        '    status: open',
        '# a comment',
        'url: https://example.org/a#b',
        'note: text # trailing comment',
      ].join('\n'),
    );
    expect(value).toEqual({
      id: 'CHG-001',
      title: "It's a change",
      status: 'active',
      phases: {
        '00-ideation': {
          status: 'approved',
          approved_hash: 'sha256:d07',
          approved_at: '2026-11-17',
        },
        '10-spec': { status: 'draft' },
      },
      implementation: { status: 'not-started' },
      stopped: null,
      owners: [],
      depends_on: ['C001-T-008', 'C001-T-009'],
      report: { commit: null, completed_at: null, notes: null },
      count: 12,
      flag: true,
      defects: [
        { id: 'D-001', summary: 'a, b: c', status: 'closed' },
        { id: 'D-002', status: 'open' },
      ],
      url: 'https://example.org/a#b',
      note: 'text',
    });
  });

  it('reads block sequences, multi-line flow collections and block scalars', () => {
    expect(
      yaml(
        [
          'list:',
          '- a',
          '- "b"',
          'flow: [one,',
          '  two]',
          'literal: |',
          '  line 1',
          '  line 2',
          'folded: >-',
          '  part one',
          '  part two',
          'plain: first',
          '  second',
          'escaped: "tab\\tquote\\" \\u00e9"',
        ].join('\n'),
      ),
    ).toEqual({
      list: ['a', 'b'],
      flow: ['one', 'two'],
      literal: 'line 1\nline 2\n',
      folded: 'part one part two',
      plain: 'first second',
      escaped: 'tab\tquote" é',
    });
  });

  it('returns null for an empty document', () => {
    expect(yaml('')).toBeNull();
    expect(yaml('# only a comment')).toBeNull();
  });

  it.each([
    ['id: [C042-T-007\ntitle: x', 1, 'flow sequence is not closed'],
    ['id: { a: 1\nb: 2', 1, 'flow mapping is not closed'],
    ['id: "open\ntitle: x', 1, 'quoted scalar is not closed'],
    ['a: b: c', 1, 'mapping values are not allowed here'],
    ['a: 1\na: 2', 2, 'duplicate key "a"'],
    ['a:\n  b: 1\n c: 2', 3, 'bad indentation'],
    ['a: 1\n\tb: 2', 2, 'tab character in indentation'],
    ['a: &anchor 1', 1, 'unsupported YAML feature'],
    ['a: [1, 2] x', 1, 'unexpected text after a value'],
    ['- a\nb: 1', 2, 'unexpected content'],
  ])('reports the fault of %j on line %i', (text, line, message) => {
    let caught: unknown;
    try {
      yaml(text);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ name: 'YamlError', line });
    expect((caught as Error).message).toContain(message);
  });
});

describe('readFrontmatter', () => {
  it('reads a block between --- lines and gives the closing line', () => {
    const fm = readFrontmatter(['---', 'id: T-1', 'title: A task', '---', '# Body']);
    expect(fm).toEqual({ kind: 'ok', data: { id: 'T-1', title: 'A task' }, closingLine: 4 });
  });

  it('accepts ... as the closing line', () => {
    expect(readFrontmatter(['---', 'id: x', '...']).kind).toBe('ok');
  });

  it('reports no frontmatter, an unclosed block and a YAML fault with its file line', () => {
    expect(readFrontmatter(['# Title', 'id: x'])).toEqual({ kind: 'none' });
    expect(readFrontmatter([])).toEqual({ kind: 'none' });
    expect(readFrontmatter(['---', 'id: x'])).toEqual({ kind: 'unclosed' });
    // C001-TS-151: line 2 of the file reads `id: [C042-T-007`.
    expect(readFrontmatter(['---', 'id: [C042-T-007', 'title: x', '---'])).toMatchObject({
      kind: 'invalid',
      line: 2,
    });
    expect(readFrontmatter(['---', 'id: x', 'title: a: b', '---'])).toMatchObject({
      kind: 'invalid',
      line: 3,
    });
  });
});
