import { describe, expect, it } from 'vitest';
import { parseCommandLine } from '../../../src/cli/parser.js';
import { ReviewError } from '../../../src/core/errors/review-error.js';

// C001-IF-001 Synopsis and Commands: every command and option parses; anything else is ERR-CLI-001.

function usageError(argv: string[]): ReviewError {
  try {
    parseCommandLine(argv);
  } catch (error) {
    expect(error).toBeInstanceOf(ReviewError);
    return error as ReviewError;
  }
  throw new Error(`expected a usage error for: ${argv.join(' ')}`);
}

describe('command line parser', () => {
  it('parses review with every intake option and its own options', () => {
    const parsed = parseCommandLine([
      'review',
      '--base',
      'main',
      '--sdd-change',
      'CHG-001',
      '--pr-text',
      'pr.md',
      '--plan',
      'a.md',
      '--plan',
      'b.md',
      '--transcript',
      't.md',
      '--test-command',
      'npm test',
      '--port',
      '8123',
      '--no-browser',
    ]);
    expect(parsed).toEqual({
      kind: 'command',
      global: { format: 'text' },
      command: {
        name: 'review',
        intake: {
          base: 'main',
          sddChange: 'CHG-001',
          prText: 'pr.md',
          plans: ['a.md', 'b.md'],
          transcripts: ['t.md'],
          testCommand: 'npm test',
        },
        port: 8123,
        noBrowser: true,
      },
    });
  });

  it('parses open with and without a snapshot ID', () => {
    expect(parseCommandLine(['open'])).toMatchObject({
      command: { name: 'open', noBrowser: false },
    });
    expect(parseCommandLine(['open', 's-abc', '--port', '0', '--no-browser'])).toMatchObject({
      command: { name: 'open', snapshotId: 's-abc', port: 0, noBrowser: true },
    });
  });

  it('parses analyse with --headless and --out, and refuses it without either', () => {
    expect(
      parseCommandLine(['analyse', '--headless', '--out', 'out/x', '--base', 'B']),
    ).toMatchObject({
      command: { name: 'analyse', out: 'out/x', intake: { base: 'B', plans: [], transcripts: [] } },
    });
    expect(usageError(['analyse', '--out', 'x']).message).toMatch(/--headless/);
    expect(usageError(['analyse', '--headless']).message).toMatch(/--out/);
  });

  it('parses reviews, status, intents', () => {
    expect(parseCommandLine(['reviews'])).toMatchObject({ command: { name: 'reviews' } });
    expect(parseCommandLine(['status', '--snapshot', 's-1'])).toMatchObject({
      command: { name: 'status', snapshotId: 's-1' },
    });
    expect(parseCommandLine(['intents'])).toMatchObject({ command: { name: 'intents' } });
  });

  it('parses the verdict commands with their required text', () => {
    expect(parseCommandLine(['sign', 'i-abcdef', '--confirm-open-hunks', '3'])).toMatchObject({
      command: { name: 'sign', intent: 'i-abcdef', confirmOpenHunks: 3 },
    });
    expect(
      parseCommandLine(['reject', 'REQ-1', '--reason', 'wrong', '--snapshot', 's-1']),
    ).toMatchObject({
      command: { name: 'reject', intent: 'REQ-1', reason: 'wrong', snapshotId: 's-1' },
    });
    expect(parseCommandLine(['defer', 'REQ-1', '--note', 'later'])).toMatchObject({
      command: { name: 'defer', intent: 'REQ-1', note: 'later' },
    });
    expect(usageError(['reject', 'REQ-1']).message).toMatch(/--reason/);
    expect(usageError(['defer', 'REQ-1']).message).toMatch(/--note/);
    expect(usageError(['sign']).message).toMatch(/intent/);
    expect(usageError(['sign', 'a', 'b']).message).toMatch(/Unexpected argument/);
  });

  it('parses config validate', () => {
    expect(parseCommandLine(['config', 'validate'])).toMatchObject({
      command: { name: 'config-validate' },
    });
    expect(parseCommandLine(['config', 'validate', '--file', 'c.json'])).toMatchObject({
      command: { name: 'config-validate', file: 'c.json' },
    });
    expect(usageError(['config']).code).toBe('ERR-CLI-001');
    expect(usageError(['config', 'check']).code).toBe('ERR-CLI-001');
  });

  it('accepts the global options anywhere, with a space or an equals sign', () => {
    expect(parseCommandLine(['--repo', 'r', '--format', 'json', 'reviews'])).toMatchObject({
      global: { repo: 'r', format: 'json' },
    });
    expect(parseCommandLine(['reviews', '--repo=r2', '--format=json'])).toMatchObject({
      global: { repo: 'r2', format: 'json' },
    });
  });

  it('answers --help and --version', () => {
    expect(parseCommandLine(['--version'])).toEqual({ kind: 'version' });
    expect(parseCommandLine(['--help'])).toEqual({ kind: 'help' });
    expect(parseCommandLine(['review', '--help'])).toEqual({ kind: 'help' });
  });

  it('takes the value after an option as data, even when it starts with a dash', () => {
    // The core refuses an option-shaped commit name with ERR-INTAKE-003; the parser never reads it as an option.
    expect(
      parseCommandLine(['analyse', '--headless', '--out', 'o', '--base', '--output=pwned.txt']),
    ).toMatchObject({ command: { intake: { base: '--output=pwned.txt' } } });
    expect(parseCommandLine(['reject', 'x', '--reason', '-rf'])).toMatchObject({
      command: { reason: '-rf' },
    });
  });

  it('takes arguments after -- as positional data', () => {
    expect(parseCommandLine(['sign', '--', '-weird'])).toMatchObject({
      command: { intent: '-weird' },
    });
  });

  it('raises ERR-CLI-001 for an unknown command, an unknown option and a missing argument', () => {
    expect(usageError(['revew']).message).toMatch(/revew/);
    expect(usageError(['review', '--bogus']).message).toMatch(/--bogus/);
    expect(usageError(['review', '-x']).message).toMatch(/-x/);
    expect(usageError(['review', '--base']).message).toMatch(/--base/);
    expect(usageError([]).code).toBe('ERR-CLI-001');
    expect(usageError(['reviews', 'extra']).message).toMatch(/Unexpected argument/);
    expect(usageError(['reviews', '--no-browser']).message).toMatch(/--no-browser/);
  });

  it('refuses a repeated single option, an unusable port, count and format', () => {
    expect(usageError(['review', '--pr-text', 'a', '--pr-text', 'b']).message).toMatch(
      /more than once/,
    );
    expect(usageError(['review', '--port', 'x']).message).toMatch(/--port/);
    expect(usageError(['review', '--port', '70000']).message).toMatch(/--port/);
    expect(usageError(['sign', 'a', '--confirm-open-hunks', '-1']).message).toMatch(
      /--confirm-open-hunks/,
    );
    expect(usageError(['reviews', '--format', 'xml']).message).toMatch(/--format/);
  });

  it('puts the catalogue message around the detail', () => {
    const error = usageError(['revew']);
    expect(error.code).toBe('ERR-CLI-001');
    expect(error.message).toContain('Run `sdd-review --help`.');
    expect(error.exitCode).toBe(2);
  });
});
