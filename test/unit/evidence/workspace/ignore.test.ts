import { describe, expect, it } from 'vitest';
import {
  IgnoreRules,
  gitignoreSources,
  parseIgnoreFile,
} from '../../../../src/core/evidence/workspace/ignore.js';

// C001-T-015, C001-ADR-006 §2 "Ignore rules": git's semantics in process, no git and no file
// system. The cases follow gitignore(5).

const rules = (
  perDirectory: Record<string, string>,
  extra: { exclude?: string; excludesFile?: string; ignoreCase?: boolean } = {},
) =>
  new IgnoreRules({
    perDirectory: Object.entries(perDirectory).map(([directory, content]) => ({
      directory,
      content,
    })),
    exclude: extra.exclude ?? null,
    excludesFile: extra.excludesFile ?? null,
    ignoreCase: extra.ignoreCase ?? false,
  });

describe('parsing an ignore file', () => {
  it('skips blank lines and comments, keeps escaped # and !, trims unescaped trailing spaces', () => {
    const parsed = parseIgnoreFile('', '# comment\n\n\\#hash\n\\!bang\nspace   \nkept\\ \n');
    expect(parsed.rules.map((r) => r.source)).toEqual(['#hash', '!bang', 'space', 'kept ']);
    expect(parsed.rules.every((r) => !r.negated)).toBe(true);
  });
  it('reads CRLF files', () => {
    expect(parseIgnoreFile('', 'a\r\nb\r\n').rules.map((r) => r.source)).toEqual(['a', 'b']);
  });
});

describe('matching with git semantics', () => {
  it('a pattern without a slash matches the basename at any depth', () => {
    const r = rules({ '': '*.log\n' });
    expect(r.isIgnored('a.log', false)).toBe(true);
    expect(r.isIgnored('src/deep/b.log', false)).toBe(true);
    expect(r.isIgnored('src/b.txt', false)).toBe(false);
  });
  it('a pattern with a slash is anchored to the directory of its file', () => {
    const r = rules({ '': '/build\ndocs/out.txt\n', src: 'gen/*.ts\n' });
    expect(r.isIgnored('build', true)).toBe(true);
    expect(r.isIgnored('src/build', true)).toBe(false);
    expect(r.isIgnored('docs/out.txt', false)).toBe(true);
    expect(r.isIgnored('x/docs/out.txt', false)).toBe(false);
    expect(r.isIgnored('src/gen/a.ts', false)).toBe(true);
    expect(r.isIgnored('gen/a.ts', false)).toBe(false);
  });
  it('a trailing slash matches directories only', () => {
    const r = rules({ '': 'dist/\n' });
    expect(r.isIgnored('dist', true)).toBe(true);
    expect(r.isIgnored('dist', false)).toBe(false);
    expect(r.isIgnored('pkg/dist', true)).toBe(true);
  });
  it('an excluded directory excludes everything below it, and a negation cannot re-include', () => {
    const r = rules({ '': 'node_modules/\n!node_modules/keep.js\n' });
    expect(r.isIgnored('node_modules/a/b.js', false)).toBe(true);
    expect(r.isIgnored('node_modules/keep.js', false)).toBe(true);
    expect(r.isIgnoredBelow('node_modules')).toBe(true);
  });
  it('a negation re-includes a file whose directory is not excluded; the last match wins', () => {
    const r = rules({ '': '*.json\n!package.json\n' });
    expect(r.isIgnored('a.json', false)).toBe(true);
    expect(r.isIgnored('package.json', false)).toBe(false);
    expect(rules({ '': '!a.json\n*.json\n' }).isIgnored('a.json', false)).toBe(true);
  });
  it('a deeper .gitignore decides before a higher one; the files of a tree are read in any order', () => {
    const r = rules({ 'pkg/sub': '!*.tmp\n', '': '*.tmp\n' });
    expect(r.isIgnored('pkg/sub/a.tmp', false)).toBe(false);
    expect(r.isIgnored('pkg/a.tmp', false)).toBe(true);
  });
  it('.gitignore files decide before info/exclude, which decides before core.excludesFile', () => {
    const r = rules(
      { '': '!keep.bak\n' },
      { exclude: '*.bak\n!x.cache\n', excludesFile: '*.cache\n' },
    );
    expect(r.isIgnored('keep.bak', false)).toBe(false);
    expect(r.isIgnored('other.bak', false)).toBe(true);
    expect(r.isIgnored('x.cache', false)).toBe(false);
    expect(r.isIgnored('y.cache', false)).toBe(true);
  });
  it('** matches across directories', () => {
    const r = rules({ '': '**/coverage\nlogs/**\na/**/z.txt\n' });
    expect(r.isIgnored('coverage', true)).toBe(true);
    expect(r.isIgnored('x/y/coverage', true)).toBe(true);
    expect(r.isIgnored('logs/a/b', false)).toBe(true);
    expect(r.isIgnored('a/z.txt', false)).toBe(true);
    expect(r.isIgnored('a/b/c/z.txt', false)).toBe(true);
  });
  it('matches without letter case when core.ignorecase is set', () => {
    expect(rules({ '': '*.LOG\n' }).isIgnored('a.log', false)).toBe(false);
    expect(rules({ '': '*.LOG\n' }, { ignoreCase: true }).isIgnored('a.log', false)).toBe(true);
  });
  it('a rule of a subdirectory file never matches outside that directory', () => {
    const r = rules({ src: '*.js\n' });
    expect(r.isIgnored('src/a.js', false)).toBe(true);
    expect(r.isIgnored('a.js', false)).toBe(false);
    expect(r.isIgnored('srcx/a.js', false)).toBe(false);
  });
  it('no rule means nothing is ignored', () => {
    expect(rules({}).isIgnored('anything', false)).toBe(false);
  });
});

describe('the .gitignore files of a snapshot', () => {
  it('takes every .gitignore path with its directory', async () => {
    const contents: Record<string, string> = {
      '.gitignore': 'a\n',
      'pkg/.gitignore': 'b\n',
    };
    const sources = await gitignoreSources(
      ['src/x.ts', '.gitignore', 'pkg/.gitignore', 'pkg/not.gitignore'],
      async (path) => Buffer.from(contents[path] ?? ''),
    );
    expect(sources).toEqual([
      { directory: '', content: 'a\n' },
      { directory: 'pkg', content: 'b\n' },
    ]);
  });
});
