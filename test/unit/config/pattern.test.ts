import { describe, expect, it } from 'vitest';
import {
  PatternSet,
  PatternSyntaxError,
  compilePattern,
} from '../../../src/core/config/pattern.js';
import {
  API_DESCRIPTION_PATTERNS,
  DATA_MIGRATION_PATTERNS,
  DEPENDENCY_BUILD_CONFIG_PATTERNS,
  ECOSYSTEM_FILES,
  TEST_FILE_PATTERNS,
} from '../../../src/core/config/builtin-policy.js';

// C001-IF-005 §1 pattern syntax (C001-T-035): the configuration loader rejects a pattern outside
// this syntax (C001-TS-480 `src/[billing`), and every built-in list of the policy compiles.

const matches = (pattern: string, path: string, builtin = false) =>
  compilePattern(pattern, { builtin }).test(path);

describe('C001-IF-005 §1 path patterns', () => {
  it('matches the whole path; * and ? stop at /', () => {
    expect(matches('src/*.ts', 'src/a.ts')).toBe(true);
    expect(matches('src/*.ts', 'src/x/a.ts')).toBe(false);
    expect(matches('src/?.ts', 'src/a.ts')).toBe(true);
    expect(matches('src/?.ts', 'src/ab.ts')).toBe(false);
    expect(matches('src/a.ts', 'xsrc/a.ts')).toBe(false);
  });

  it('** as a whole segment matches zero or more segments', () => {
    expect(matches('src/api/generated/**', 'src/api/generated/client.ts')).toBe(true);
    expect(matches('src/api/generated/**', 'src/api/generated/a/b/c.ts')).toBe(true);
    expect(matches('src/api/generated/**', 'src/api/generatedx/c.ts')).toBe(false);
    expect(matches('**/migrations/**', 'db/migrations/0001.sql')).toBe(true);
    expect(matches('**/migrations/**', 'migrations/0001.sql')).toBe(true);
    expect(matches('a/**/b', 'a/b')).toBe(true);
    expect(matches('a/**/b', 'a/x/y/b')).toBe(true);
    expect(matches('a/**/b', 'a/xb')).toBe(false);
    expect(matches('**', 'any/thing')).toBe(true);
    expect(matches('src/**', 'src/cart/total.ts')).toBe(true);
  });

  it('a pattern without / matches the file name at any depth', () => {
    expect(matches('Dockerfile', 'Dockerfile')).toBe(true);
    expect(matches('Dockerfile', 'deploy/web/Dockerfile')).toBe(true);
    expect(matches('*.sql', 'db/x/0003_fix.sql')).toBe(true);
    expect(matches('Dockerfile', 'deploy/Dockerfile.dev')).toBe(false);
  });

  it('{a,b} alternatives and [abc] character lists', () => {
    expect(matches('openapi*.{json,yaml,yml}', 'api/openapi.v2.yml')).toBe(true);
    expect(matches('openapi*.{json,yaml,yml}', 'openapi.toml')).toBe(false);
    expect(matches('{src,lib/gen}/**', 'lib/gen/a.ts')).toBe(true);
    expect(matches('file[abc].txt', 'fileb.txt')).toBe(true);
    expect(matches('file[abc].txt', 'filed.txt')).toBe(false);
    expect(matches('v[0-9].txt', 'v7.txt')).toBe(true);
  });

  it('dots and other regular-expression characters are literal', () => {
    expect(matches('a.b', 'axb')).toBe(false);
    expect(matches('a+(b)', 'a+(b)')).toBe(true);
  });

  it('built-in patterns ignore case; configured patterns do not, on every system', () => {
    expect(matches('Dockerfile', 'dockerfile', true)).toBe(true);
    expect(matches('Dockerfile', 'dockerfile', false)).toBe(false);
  });

  it.each([
    ['src/[billing', 'unclosed "["'],
    ['src/{a,b', 'unclosed "{"'],
    ['src/a}', 'without its opening bracket'],
    ['src/a]', 'without its opening bracket'],
    ['src/[]x', 'empty "[]"'],
    ['src//a', 'empty path segment'],
    ['[z-a]', 'reversed range'],
  ])('rejects %s', (pattern, reason) => {
    expect(() => compilePattern(pattern)).toThrow(PatternSyntaxError);
    expect(() => compilePattern(pattern)).toThrow(reason);
  });

  it('every built-in list of C001-IF-005 compiles', () => {
    const all = [
      ...DATA_MIGRATION_PATTERNS,
      ...Object.values(DEPENDENCY_BUILD_CONFIG_PATTERNS).flat(),
      ...API_DESCRIPTION_PATTERNS,
      ...Object.values(ECOSYSTEM_FILES).flat(),
      ...Object.values(TEST_FILE_PATTERNS).flat(),
    ];
    for (const pattern of all)
      expect(() => compilePattern(pattern, { builtin: true })).not.toThrow();
    const guarded = new PatternSet(Object.values(DEPENDENCY_BUILD_CONFIG_PATTERNS).flat(), {
      builtin: true,
    });
    expect(guarded.match('.sdd-review/config.json')).toBe('.sdd-review/**');
    expect(guarded.match('.github/workflows/ci.yml')).toBe('.github/workflows/**');
    expect(guarded.match('src/cart/total.ts')).toBeNull();
  });
});
