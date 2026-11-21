import { describe, expect, it } from 'vitest';
import { baseIsHead, buildIntakeSummary, testCommandOf } from '../../../src/core/intake/summary.js';
import {
  mergeWithBuiltinPolicy,
  type EffectiveConfiguration,
} from '../../../src/core/config/effective.js';

// C001-TC-114 (unit level): the intake summary of C001-REQ-114 — the test command and where it comes
// from (C001-TS-160), the base commit that is HEAD itself (C001-TS-131), the parts of the summary.

const source = { default: false, commit: 'b'.repeat(40), path: '.sdd-review/config.json' };
const defaults = mergeWithBuiltinPolicy(null);
const readable = (command: string | null): EffectiveConfiguration => ({
  readable: true,
  source: { ...source, readable: true },
  ignoredSettings: [],
  notices: [],
  settings: { ...defaults, tests: { ...defaults.tests, command } },
});
const unreadable: EffectiveConfiguration = {
  readable: false,
  source: { ...source, readable: false },
  ignoredSettings: [],
  notices: [],
  error: { code: 'ERR-CFG-001', cause: 'not JSON' },
};

describe('testCommandOf (C001-TS-160)', () => {
  it('takes the command given for the review first', () => {
    expect(testCommandOf('npx jest', readable('npm test'))).toEqual({
      command: 'npx jest',
      origin: 'developer',
    });
  });
  it('takes the command of the base commit configuration otherwise', () => {
    expect(testCommandOf(undefined, readable('npm test'))).toEqual({
      command: 'npm test',
      origin: 'configuration',
    });
  });
  it('names no command when neither gives one, or the configuration is unreadable', () => {
    expect(testCommandOf(undefined, readable(null))).toBeNull();
    expect(testCommandOf(undefined, unreadable)).toBeNull();
    expect(testCommandOf('  ', readable(null))).toBeNull();
  });
});

describe('buildIntakeSummary', () => {
  it('keeps exactly the members of IntakeSummary', () => {
    const summary = buildIntakeSummary({
      baseCommit: { hash: 'b'.repeat(40), subject: 'Release 1.4' },
      baseChoice: 'named',
      baseRef: null,
      changedFiles: 4,
      changedLines: 212,
      sddChanges: [{ id: 'CHG-042', specItems: 12, selected: true }],
      documentedArchitecture: 'sdd-folder',
      commits: 2,
      namedFiles: [{ role: 'agent-plan', path: '/tmp/plan.md' }],
      testCommand: null,
      sizeWarning: null,
    });
    expect(summary).toEqual({
      baseCommit: { hash: 'b'.repeat(40), subject: 'Release 1.4' },
      baseChoice: 'named',
      baseRef: null,
      testCommand: null,
      changedFiles: 4,
      changedLines: 212,
      intentContext: {
        sddChanges: [{ id: 'CHG-042', specItems: 12, selected: true }],
        commits: 2,
        namedFiles: [{ role: 'agent-plan', path: '/tmp/plan.md' }],
        documentedArchitecture: 'sdd-folder',
      },
      sizeWarning: null,
    });
  });
});

describe('baseIsHead (C001-TS-131)', () => {
  it('compares the base commit with the HEAD of the snapshot, whatever chose it', () => {
    const summary = { baseCommit: { hash: 'c'.repeat(40), subject: '' } };
    expect(baseIsHead(summary, 'c'.repeat(40))).toBe(true);
    expect(baseIsHead(summary, 'd'.repeat(40))).toBe(false);
  });
});
