import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../../../src/cli/run.js';
import type { CliIo } from '../../../src/cli/io.js';

// `sdd-review config validate [--file <path>]` (C001-IF-001, C001-T-035): reads a working-tree file,
// no git data (it works outside a repository), lists the ignored settings (C001-REQ-425) and
// exits 10 with ERR-CFG-003 for an invalid file (C001-REQ-427), a foreign credential-store service
// included (C001-TS-861).

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function workTree(config?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'sddcfgcli-'));
  dirs.push(dir);
  if (config !== undefined) {
    mkdirSync(join(dir, '.sdd-review'));
    writeFileSync(
      join(dir, '.sdd-review', 'config.json'),
      typeof config === 'string' ? config : JSON.stringify(config, null, 2),
    );
  }
  return dir;
}

async function cli(args: string[], cwd: string) {
  let stdout = '';
  let stderr = '';
  const io: CliIo = {
    stdout: { write: (t: string) => (stdout += t) },
    stderr: { write: (t: string) => (stderr += t) },
    cwd,
    env: process.env,
    signal: new AbortController().signal,
  };
  return { status: await run(args, io), stdout, stderr };
}

describe('config validate', () => {
  it('a valid working-tree file exits 0, outside any git repository', async () => {
    const r = await cli(['config', 'validate'], workTree({ formatVersion: 1 }));
    expect(r).toEqual({
      status: 0,
      stdout: '".sdd-review/config.json" is a valid review configuration.\n',
      stderr: '',
    });
  });

  it('lists the ignored settings, with ERR-CFG-002 notices on standard error', async () => {
    const dir = workTree({
      formatVersion: 1,
      clearing: { builtinGuardedAreas: { 'security-auth': false } },
    });
    const r = await cli(['config', 'validate'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Ignored setting: /clearing/builtinGuardedAreas/security-auth');
    expect(r.stderr).toBe(
      'ERR-CFG-002: Ignored setting "/clearing/builtinGuardedAreas/security-auth": built-in guarded areas cannot be removed or narrowed.\n',
    );
    const j = await cli(['--format', 'json', 'config', 'validate'], dir);
    expect(JSON.parse(j.stdout)).toEqual({
      valid: true,
      ignoredSettings: ['/clearing/builtinGuardedAreas/security-auth'],
    });
  });

  it('C001-TS-861: a foreign credential-store service exits 10 with ERR-CFG-003 and its pointer', async () => {
    const dir = workTree({
      formatVersion: 1,
      model: {
        provider: {
          name: 'team-model',
          api: 'openai-chat',
          endpoint: 'http://localhost:1/v1',
          model: 'm',
          keyCredential: { service: 'sdd-reviewer', account: 'team-model' },
        },
      },
    });
    const r = await cli(['config', 'validate'], dir);
    expect(r.status).toBe(10);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(
      /^ERR-CFG-003: "\.sdd-review\/config\.json" is not a valid review configuration: \/model\/provider\/keyCredential\/service: credential-store service "sdd-reviewer" is outside/,
    );
  });

  it('--file names another file, relative to the current directory', async () => {
    const dir = workTree();
    writeFileSync(join(dir, 'c.json'), '{"formatVersion": 1, "tests": {"command": ""}}');
    const r = await cli(['config', 'validate', '--file', 'c.json'], dir);
    expect(r.status).toBe(10);
    expect(r.stderr).toMatch(
      /^ERR-CFG-003: "c\.json" is not a valid review configuration: \/tests\/command: /,
    );
  });

  it('a syntax error and a missing file are invalid files (exit 10)', async () => {
    const syntax = await cli(['config', 'validate'], workTree('{\n "formatVersion": 1\n "x": 1}'));
    expect(syntax.status).toBe(10);
    expect(syntax.stderr).toContain('JSON syntax error on line 3');
    const missing = await cli(['config', 'validate'], workTree());
    expect(missing.status).toBe(10);
    expect(missing.stderr).toContain('the file does not exist');
  });

  it('--repo locates the default file', async () => {
    const dir = workTree({ formatVersion: 1 });
    const r = await cli(['--repo', dir, 'config', 'validate'], workTree());
    expect(r.status).toBe(0);
  });
});
