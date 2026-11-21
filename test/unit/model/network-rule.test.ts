import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// C001-T-085, C001-CON-11 and C001-CON-12: only src/core/model/ may import an outbound network
// client or use the global fetch; the UI server may only listen (eslint.config.js).
const eslint = new ESLint({ cwd: process.cwd() });

async function networkFindings(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages
    .filter((m) => m.severity === 2 && /C001-CON-1[12]/.test(m.message))
    .map((m) => m.message);
}

describe('outbound network rule', () => {
  it.each([
    ['src/core/intake/sample.ts', "import { request } from 'node:http'; export const r = request;"],
    ['src/core/intake/sample.ts', "import * as http from 'http'; export const r = http;"],
    ['src/core/intake/sample.ts', "import https from 'node:https'; export const r = https;"],
    ['src/core/intake/sample.ts', "import { connect } from 'node:net'; export const c = connect;"],
    ['src/core/git/sample.ts', "import { connect } from 'node:tls'; export const c = connect;"],
    ['src/core/git/sample.ts', "import { lookup } from 'node:dns'; export const l = lookup;"],
    ['src/core/store/sample.ts', "import { fetch } from 'undici'; export const f = fetch;"],
    ['src/cli/sample.ts', "import axios from 'axios'; export const a = axios;"],
    ['src/core/evidence/sample.ts', "export const f = () => fetch('https://example.test/');"],
    ['src/core/evidence/sample.ts', "export const w = () => new WebSocket('wss://example.test/');"],
    ['src/ui-server/sample.ts', "import { request } from 'node:http'; export const r = request;"],
    ['src/ui-server/sample.ts', "import http from 'node:http'; export const r = http;"],
    ['src/ui-server/sample.ts', "import { Socket } from 'node:net'; export const s = Socket;"],
    ['src/ui-server/sample.ts', "export const f = () => fetch('http://127.0.0.1/');"],
  ])('fails %s: %s', async (file, code) => {
    expect((await networkFindings(code, file)).length).toBeGreaterThan(0);
  });

  it.each([
    ['src/core/model/sample.ts', "import { request } from 'node:http'; export const r = request;"],
    ['src/core/model/adapters/sample.ts', "export const f = () => fetch('http://127.0.0.1/');"],
    [
      'src/ui-server/sample.ts',
      "import { createServer, type IncomingMessage } from 'node:http'; export const s = createServer; export type M = IncomingMessage;",
    ],
    [
      'src/ui-server/sample.ts',
      "import type { AddressInfo, Socket } from 'node:net'; export type A = AddressInfo | Socket;",
    ],
    [
      'src/core/intake/sample.ts',
      "import type { IncomingMessage } from 'node:http'; export type M = IncomingMessage;",
    ],
  ])('accepts %s: %s', async (file, code) => {
    expect(await networkFindings(code, file)).toEqual([]);
  });
});
