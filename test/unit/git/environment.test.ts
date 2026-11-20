import { describe, expect, it } from 'vitest';
import {
  GIT_HARDENING_ENVIRONMENT,
  REMOVED_GIT_VARIABLES,
  gitReadEnvironment,
  removeLocatingVariables,
} from '../../../src/core/git/environment.js';

// C001-IF-013 §1 item 7 "Removed" list, as printed by `git rev-parse --local-env-vars` of git
// 2.45.1 without the command-line configuration variables, plus the two named at the end.
const SPEC_LIST = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_GRAFT_FILE',
  'GIT_SHALLOW_FILE',
  'GIT_CONFIG',
  'GIT_REPLACE_REF_BASE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_PREFIX',
  'GIT_NAMESPACE',
  'GIT_QUARANTINE_PATH',
];

describe('git read environment (C001-IF-013 §1 item 7, C001-ADR-004 A2.1)', () => {
  it('holds exactly the variables of the "Removed" list', () => {
    expect([...REMOVED_GIT_VARIABLES].sort()).toEqual([...SPEC_LIST].sort());
  });

  it('keeps the command-line configuration variables and every other variable', () => {
    const env = removeLocatingVariables(
      {
        GIT_CONFIG_PARAMETERS: "'core.x=1'",
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'a.b',
        GIT_CONFIG_VALUE_0: 'c',
        GIT_CEILING_DIRECTORIES: '/x',
        PATH: '/bin',
        HOME: '/home/u',
      },
      { caseInsensitive: false },
    );
    expect(env).toEqual({
      GIT_CONFIG_PARAMETERS: "'core.x=1'",
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'a.b',
      GIT_CONFIG_VALUE_0: 'c',
      GIT_CEILING_DIRECTORIES: '/x',
      PATH: '/bin',
      HOME: '/home/u',
    });
  });

  it.each(SPEC_LIST)('removes %s', (name) => {
    const env = removeLocatingVariables({ [name]: 'decoy', KEEP: '1' }, { caseInsensitive: false });
    expect(env).toEqual({ KEEP: '1' });
  });

  it('matches names case-insensitively when asked to (Windows)', () => {
    const env = removeLocatingVariables(
      { git_dir: 'd', Git_Index_File: 'i', GIT_WORK_TREE: 'w', Path: 'p' },
      { caseInsensitive: true },
    );
    expect(env).toEqual({ Path: 'p' });
  });

  it('matches names case-sensitively otherwise (POSIX)', () => {
    const env = removeLocatingVariables({ git_dir: 'd', GIT_DIR: 'D' }, { caseInsensitive: false });
    expect(env).toEqual({ git_dir: 'd' });
  });

  it('does not change its input', () => {
    const input = { GIT_DIR: 'd', A: '1' };
    removeLocatingVariables(input, { caseInsensitive: false });
    expect(input).toEqual({ GIT_DIR: 'd', A: '1' });
  });

  it('adds the hardening variables and removes the locating ones', () => {
    const env = gitReadEnvironment(
      { GIT_DIR: 'd', GIT_INDEX_FILE: 'i', GIT_OPTIONAL_LOCKS: '1', HOME: '/h' },
      { caseInsensitive: false },
    );
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_INDEX_FILE).toBeUndefined();
    expect(env.HOME).toBe('/h');
    for (const [name, value] of Object.entries(GIT_HARDENING_ENVIRONMENT)) {
      expect(env[name]).toBe(value);
    }
    expect(env.GIT_OPTIONAL_LOCKS).toBe('0');
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('replaces a differently cased hardening variable on Windows instead of duplicating it', () => {
    const env = gitReadEnvironment({ git_optional_locks: '1' }, { caseInsensitive: true });
    expect(Object.keys(env).filter((k) => k.toUpperCase() === 'GIT_OPTIONAL_LOCKS')).toEqual([
      'GIT_OPTIONAL_LOCKS',
    ]);
    expect(env.GIT_OPTIONAL_LOCKS).toBe('0');
  });

  it('never sets a safe.directory or configuration variable (C001-IF-012 §6)', () => {
    const names = Object.keys(GIT_HARDENING_ENVIRONMENT);
    expect(names.some((n) => /CONFIG|SAFE/i.test(n))).toBe(false);
  });
});
