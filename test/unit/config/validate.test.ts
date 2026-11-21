import { describe, expect, it } from 'vitest';
import { locateSyntaxError, parseJsonText } from '../../../src/core/config/json-text.js';
import {
  SERVICE_POINTER,
  validateConfigurationBytes,
  type ValidationOutcome,
} from '../../../src/core/config/validate.js';

// C001-IF-004 validation in the order of the interface (C001-T-035): JSON text, removal of the
// settings that weaken a built-in guarded area (C001-REQ-425), the credential-store service check
// (C001-REQ-820), then the schema and the path-pattern syntax (C001-REQ-427, C001-REQ-819).

const bytes = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2));
const check = (value: unknown) => validateConfigurationBytes(bytes(value));
const failure = (outcome: ValidationOutcome) => {
  if (outcome.valid) throw new Error('expected an invalid configuration');
  return outcome.failure;
};

const provider = (extra: Record<string, unknown> = {}) => ({
  name: 'team-model',
  api: 'openai-chat',
  endpoint: 'https://llm.example.test/v1',
  model: 'm',
  ...extra,
});

describe('C001-IF-004 validation', () => {
  it('accepts a full valid configuration', () => {
    const outcome = check({
      $schema: './x.json',
      formatVersion: 1,
      clearing: {
        rules: { passingTests: false },
        generatedFiles: ['src/api/generated/**'],
        guardedAreas: [{ name: 'billing', paths: ['src/billing/**'], description: 'money' }],
      },
      tests: { command: 'npm test', pathPatterns: ['test/**'], coverageReports: ['lcov.info'] },
      evidence: { scenarioCommand: 'npm run acceptance -- --scenario {id}' },
      design: { minCloneLength: 8 },
      model: {
        provider: provider({ keyCredential: { service: 'sdd-review/x', account: 'team-model' } }),
        cloudOptIn: true,
        timeoutSeconds: 30,
        excludedPaths: ['secrets/**'],
        maxRequestBytes: 8192,
      },
    });
    expect(outcome).toMatchObject({ valid: true, ignoredSettings: [] });
  });

  it('accepts the minimal file and a UTF-8 byte-order mark', () => {
    expect(check({ formatVersion: 1 }).valid).toBe(true);
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes({ formatVersion: 1 })]);
    expect(validateConfigurationBytes(bom).valid).toBe(true);
  });

  describe('invalid files (unreadable configuration)', () => {
    it('names the line of a JSON syntax error (C001-TS-480 line 7)', () => {
      const text = [
        '{',
        '  "formatVersion": 1,',
        '  "clearing": {',
        '    "rules": {',
        '',
        '',
        '      "formatting": tru',
        '    }',
        '  }',
        '}',
      ].join('\n');
      const f = failure(validateConfigurationBytes(Buffer.from(text)));
      expect(f).toMatchObject({ kind: 'syntax', line: 7 });
      expect(f.reason).toMatch(/^JSON syntax error on line 7: /);
    });

    it('names line 3 for a missing comma, and the last line for a truncated file', () => {
      const f = failure(
        validateConfigurationBytes(Buffer.from('{\n  "formatVersion": 1\n  "x": 2\n}')),
      );
      expect(f).toMatchObject({ kind: 'syntax', line: 3 });
      const g = failure(validateConfigurationBytes(Buffer.from('{\n  "formatVersion": 1,\n')));
      expect(g).toMatchObject({ kind: 'syntax', line: 3 });
    });

    it('refuses bytes that are not UTF-8', () => {
      const f = failure(validateConfigurationBytes(Buffer.from([0x7b, 0xff, 0x7d])));
      expect(f.kind).toBe('syntax');
    });

    it.each([
      [{}, '/formatVersion', 'is required'],
      [{ formatVersion: 2 }, '/formatVersion', 'must be 1'],
      [{ formatVersion: 1, extra: true }, '/extra', 'is not a setting'],
      [{ formatVersion: 1, design: { minCloneLength: 1 } }, '/design/minCloneLength', '>= 2'],
      [
        { formatVersion: 1, clearing: { rules: { newRule: true } } },
        '/clearing/rules/newRule',
        'is not a setting',
      ],
      [
        { formatVersion: 1, model: { provider: provider({ api: 'google-gemini' }) } },
        '/model/provider/api',
        'must be one of "openai-chat", "anthropic-messages"',
      ],
      [
        { formatVersion: 1, model: { provider: provider({ apiKey: 'sk-test-REPO-003' }) } },
        '/model/provider/apiKey',
        'is not a setting',
      ],
      [
        { formatVersion: 1, clearing: { generatedFiles: ['/abs/**'] } },
        '/clearing/generatedFiles/0',
        'must match pattern',
      ],
      [
        { formatVersion: 1, evidence: { scenarioCommand: 'npm test' } },
        '/evidence/scenarioCommand',
        'must match pattern',
      ],
      [[1, 2], '', 'must be object'],
    ])('schema: %j fails at %s', (value, pointer, reason) => {
      const f = failure(check(value));
      expect(f.kind).toBe('schema');
      expect(f.pointer).toBe(pointer);
      expect(f.reason).toContain(reason);
    });

    it('a key value in the file is not a setting (C001-TS-856 third example)', () => {
      const f = failure(
        check({ formatVersion: 1, model: { cloudOptIn: true, key: 'sk-test-REPO-003' } }),
      );
      expect(f).toMatchObject({ kind: 'schema', pointer: '/model/key' });
    });

    it('an invalid path pattern fails with its pointer and the pattern (C001-TS-480)', () => {
      const f = failure(
        check({
          formatVersion: 1,
          clearing: { guardedAreas: [{ name: 'billing', paths: ['src/[billing'] }] },
        }),
      );
      expect(f).toMatchObject({
        kind: 'pattern',
        pattern: 'src/[billing',
        pointer: '/clearing/guardedAreas/0/paths/0',
      });
      expect(f.reason).toContain('src/[billing');
    });
  });

  describe('settings that weaken a built-in guarded area (C001-REQ-425)', () => {
    it('removes every member of builtinGuardedAreas, whatever its value, and reports each', () => {
      const outcome = check({
        formatVersion: 1,
        clearing: {
          builtinGuardedAreas: {
            'security-auth': false,
            'data-migration': { exclude: ['db/migrations/legacy/**'] },
            'a/b~c': { removeTerms: ['auth'] },
          },
        },
      });
      expect(outcome.valid).toBe(true);
      expect(outcome.ignoredSettings).toEqual([
        '/clearing/builtinGuardedAreas/security-auth',
        '/clearing/builtinGuardedAreas/data-migration',
        '/clearing/builtinGuardedAreas/a~1b~0c',
      ]);
      if (outcome.valid) expect(outcome.configuration.clearing).toEqual({});
    });

    it('a non-object builtinGuardedAreas is removed and reported as a whole', () => {
      const outcome = check({ formatVersion: 1, clearing: { builtinGuardedAreas: 'none' } });
      expect(outcome).toMatchObject({
        valid: true,
        ignoredSettings: ['/clearing/builtinGuardedAreas'],
      });
    });

    it('removes added areas named with a built-in ID; adding areas apply beside them (C001-TS-475)', () => {
      const outcome = check({
        formatVersion: 1,
        clearing: {
          guardedAreas: [
            { name: 'public-api', paths: ['nothing/**'] },
            { name: 'billing', paths: ['src/billing/**'] },
          ],
          builtinGuardedAreas: { 'public-api': false },
        },
      });
      expect(outcome.ignoredSettings).toEqual([
        '/clearing/builtinGuardedAreas/public-api',
        '/clearing/guardedAreas/0',
      ]);
      expect(outcome.valid && outcome.configuration.clearing?.guardedAreas).toEqual([
        { name: 'billing', paths: ['src/billing/**'] },
      ]);
    });

    it('pointers of later problems name the entry of the file, not of the cleaned copy', () => {
      const outcome = check({
        formatVersion: 1,
        clearing: {
          guardedAreas: [
            { name: 'security-auth', paths: ['x/**'] },
            { name: 'billing', paths: ['src/[billing'] },
          ],
        },
      });
      expect(failure(outcome).pointer).toBe('/clearing/guardedAreas/1/paths/0');
      expect(outcome.ignoredSettings).toEqual(['/clearing/guardedAreas/0']);
    });
  });

  describe('credential-store service (C001-REQ-820)', () => {
    it.each(['sdd-review', 'sdd-review/x', 'sdd-review/team/model'])('accepts %s', (service) => {
      const outcome = check({
        formatVersion: 1,
        model: { provider: provider({ keyCredential: { service, account: 'team-model' } }) },
      });
      expect(outcome.valid).toBe(true);
    });

    it.each(['other', 'sdd-reviewer', 'git:https://github.com', 'Sdd-review', 'sdd-review-x'])(
      'refuses %s before validating the rest of the file',
      (service) => {
        // The rest is invalid as well (C001-TS-860 second example): the service is reported.
        const f = failure(
          check({
            formatVersion: 1,
            model: {
              provider: provider({
                api: 'google-gemini',
                keyCredential: { service, account: 'a' },
              }),
            },
          }),
        );
        expect(f).toMatchObject({ kind: 'service', service, pointer: SERVICE_POINTER });
        expect(f.reason).toContain(`"${service}"`);
      },
    );

    it('a service that is not a string fails the schema instead', () => {
      const f = failure(
        check({
          formatVersion: 1,
          model: { provider: provider({ keyCredential: { service: 7, account: 'a' } }) },
        }),
      );
      expect(f).toMatchObject({ kind: 'schema', pointer: SERVICE_POINTER });
    });
  });
});

describe('JSON text', () => {
  it('parses valid text and locates nothing in it', () => {
    expect(parseJsonText(Buffer.from('{"a":[1,-2.5e3,"x\\u0041",true,null]}'))).toEqual({
      a: [1, -2500, 'xA', true, null],
    });
    expect(locateSyntaxError('{"a":[1,{"b":"c"}]}')).toBeNull();
  });

  it.each([
    ['{"a": }', 'unexpected "}"'],
    ['{"a" 1}', 'expected ":"'],
    ['{a: 1}', 'expected a property name'],
    ['[1 2]', 'expected "," or "]"'],
    ['{"a": "x\ny"}', 'control character'],
    ['{"a": 1} x', 'after the end'],
    ['{"a": "\\q"}', 'invalid escape'],
  ])('locates the error of %j', (text, reason) => {
    expect(locateSyntaxError(text)?.reason).toContain(reason);
  });
});
