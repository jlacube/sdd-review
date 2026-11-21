import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DbusError,
  decodeMessage,
  encodeMethodCall,
  marshal,
  messageLength,
  socketTargets,
  splitSignature,
  unmarshal,
} from '../../../../src/core/model/keys/dbus.js';
import {
  chooseItem,
  classifyDbusError,
  SecretServiceReader,
  sessionBusAddress,
} from '../../../../src/core/model/keys/linux.js';
import {
  classifySecurityRun,
  MacosKeychainReader,
  SECURITY_TIMEOUT_MS,
} from '../../../../src/core/model/keys/macos.js';
import {
  classifyCredReadError,
  decodeCredentialBlob,
} from '../../../../src/core/model/keys/windows.js';

// C001-T-086 at unit level: the decoding and the not-found and cannot-open classes of the three
// readers of C001-ADR-008 §1, from recorded reader results (no credential store needed), and the
// built-in D-Bus client of the Secret Service reader.

describe('Windows: CredReadW blob decoding and error classes', () => {
  it('decodes the UTF-16LE blob that cmdkey wrote (licence report N-03)', () => {
    const recorded = Uint8Array.from([0x61, 0, 0x62, 0, 0x63, 0, 0x31, 0, 0x32, 0, 0x33, 0]);
    expect(decodeCredentialBlob(recorded)).toBe('abc123');
  });

  it('decodes a blob with a non-zero odd byte as UTF-8', () => {
    expect(decodeCredentialBlob(Buffer.from('sk-test-UTF8-é', 'utf8'))).toBe('sk-test-UTF8-é');
    expect(decodeCredentialBlob(Buffer.from('abcd', 'utf8'))).toBe('abcd');
  });

  it('decodes an odd-length blob as UTF-8 and an empty blob as an empty secret', () => {
    expect(decodeCredentialBlob(Buffer.from('abc', 'utf8'))).toBe('abc');
    expect(decodeCredentialBlob(new Uint8Array(0))).toBe('');
  });

  it('decodes a UTF-16LE blob of a text written as UTF-16 (Latin-1 range)', () => {
    expect(decodeCredentialBlob(Buffer.from('sk-é', 'utf16le'))).toBe('sk-é');
  });

  it.each([
    [1168, 'not found'],
    [5, 'access denied'],
    [1312, 'store unavailable'],
    [87, 'store unavailable'],
  ])('Win32 error %i is "%s"', (error, cause) => {
    expect(classifyCredReadError(error)).toEqual({
      found: false,
      cause,
      detail: `Win32 error ${error}`,
    });
  });
});

describe('macOS: security find-generic-password results', () => {
  it('exit status 0 gives the standard output as the secret', () => {
    expect(classifySecurityRun({ status: 0, stdout: 'sk-test-MAC\n', timedOut: false })).toEqual({
      found: true,
      secret: 'sk-test-MAC\n',
    });
  });

  it.each([
    [44, 'not found'],
    [36, 'locked'],
    [51, 'access denied'],
    [1, 'store unavailable'],
    [128, 'store unavailable'],
  ])('exit status %i is "%s" and the output is not kept', (status, cause) => {
    const result = classifySecurityRun({ status, stdout: 'sk-test-NOPE', timedOut: false });
    expect(result).toEqual({ found: false, cause, detail: `exit status ${status}` });
  });

  it('no answer within 30 s is "timed out"', () => {
    expect(SECURITY_TIMEOUT_MS).toBe(30_000);
    expect(classifySecurityRun({ status: null, stdout: '', timedOut: true })).toMatchObject({
      found: false,
      cause: 'timed out',
    });
  });

  it('a program that cannot start is a store that cannot be opened', async () => {
    const reader = new MacosKeychainReader({ program: join(tmpdir(), 'no-such-security-program') });
    expect(await reader.read('sdd-review', 'p')).toEqual({
      found: false,
      cause: 'store unavailable',
      detail: 'cannot start: ENOENT',
    });
  });

  it('a program that does not answer is ended at the timeout', async () => {
    // node itself, waiting forever on its arguments: stands in for a keychain dialog.
    const reader = new MacosKeychainReader({
      program: process.execPath,
      prefixArgs: ['-e', 'setInterval(() => {}, 1000)', '--'],
      timeoutMs: 300,
    });
    const started = Date.now();
    const result = await reader.read('sdd-review', 'p');
    expect(result).toMatchObject({ found: false, cause: 'timed out' });
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe('Linux: Secret Service reader pieces', () => {
  it('finds the session bus from DBUS_SESSION_BUS_ADDRESS, else gives none', () => {
    expect(sessionBusAddress({ DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1/bus' })).toBe(
      'unix:path=/run/user/1/bus',
    );
    expect(sessionBusAddress({ XDG_RUNTIME_DIR: join(tmpdir(), 'no-such-runtime-dir') })).toBe(
      null,
    );
    expect(sessionBusAddress({})).toBeNull();
  });

  it('chooses the default collection first, then the most recently modified item', () => {
    const c = (path: string, modified: number) => ({ path, modified: BigInt(modified) });
    const def = '/org/freedesktop/secrets/collection/login';
    const other = '/org/freedesktop/secrets/collection/work';
    expect(chooseItem([c(`${other}/1`, 900), c(`${def}/1`, 100)], def)?.path).toBe(`${def}/1`);
    expect(chooseItem([c(`${other}/1`, 100), c(`${other}/2`, 900)], def)?.path).toBe(`${other}/2`);
    expect(chooseItem([c(`${def}/1`, 100), c(`${def}/2`, 200)], '/')?.path).toBe(`${def}/2`);
    expect(chooseItem([c(`${def}x/1`, 900), c(`${def}/1`, 100)], def)?.path).toBe(`${def}/1`);
  });

  it.each([
    ['org.freedesktop.DBus.Error.ServiceUnknown', 'store unavailable'],
    ['org.freedesktop.DBus.Error.NoReply', 'store unavailable'],
    ['org.freedesktop.DBus.Error.AccessDenied', 'access denied'],
    ['org.freedesktop.Secret.Error.IsLocked', 'locked'],
  ])('the D-Bus error %s is "%s"', (name, cause) => {
    expect(classifyDbusError(new DbusError(name, 'text'))).toEqual({ cause, detail: name });
  });

  it('a socket error is a store that cannot be opened', () => {
    const error = Object.assign(new Error('connect ENOENT'), { code: 'ENOENT' });
    expect(classifyDbusError(error)).toEqual({ cause: 'store unavailable', detail: 'ENOENT' });
  });

  it('no session bus: store unavailable at once', async () => {
    expect(await new SecretServiceReader({ env: {} }).read('sdd-review', 'p')).toEqual({
      found: false,
      cause: 'store unavailable',
      detail: 'no session bus',
    });
  });
});

describe('Linux: a bus that does not answer ends the reader at its timeout (C001-RISK-018)', () => {
  let server: Server | undefined;
  const sockets: Socket[] = [];
  let dir: string | undefined;
  afterEach(async () => {
    for (const s of sockets.splice(0)) s.destroy();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  /** A local socket (a named pipe on Windows) that accepts and never answers. */
  async function silentBus(): Promise<string> {
    dir = mkdtempSync(join(tmpdir(), 'sddbus-'));
    const path =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\sdd-silent-bus-${process.pid}-${Date.now()}`
        : join(dir, 'bus');
    server = createServer((s) => sockets.push(s));
    await new Promise<void>((resolve) => server!.listen(path, resolve));
    return path;
  }

  it('ends within its timeout and reports "timed out"', async () => {
    const path = await silentBus();
    const reader = new SecretServiceReader({
      env: { DBUS_SESSION_BUS_ADDRESS: `unix:path=${path}` },
      timeoutMs: 400,
    });
    const started = Date.now();
    const result = await reader.read('sdd-review', 'p');
    expect(result).toMatchObject({ found: false, cause: 'timed out' });
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  it('a bus that refuses authentication is a store that cannot be opened', async () => {
    const path = await silentBus();
    server!.removeAllListeners('connection');
    server!.on('connection', (s: Socket) => {
      sockets.push(s);
      s.once('data', () => s.write('REJECTED EXTERNAL\r\n'));
    });
    const reader = new SecretServiceReader({
      env: { DBUS_SESSION_BUS_ADDRESS: `unix:path=${path}` },
      timeoutMs: 4_000,
    });
    expect(await reader.read('sdd-review', 'p')).toMatchObject({
      found: false,
      cause: 'store unavailable',
    });
  });
});

describe('built-in D-Bus client: wire format', () => {
  it('splits signatures into complete types', () => {
    expect(splitSignature('a{ss}o')).toEqual(['a{ss}', 'o']);
    expect(splitSignature('aoo')).toEqual(['ao', 'o']);
    expect(splitSignature('a{o(oayays)}')).toEqual(['a{o(oayays)}']);
    expect(() => splitSignature('a{ss')).toThrow();
  });

  it('marshals the SearchItems attributes as the specification lays them out', () => {
    const body = marshal('a{ss}', [[['service', 'sdd-review']]]);
    // array length 32 at 0, padding to 8, "service" (len 7) at 8, "sdd-review" (len 10) at 20
    expect(body.readUInt32LE(0)).toBe(body.length - 8);
    expect(body.readUInt32LE(8)).toBe(7);
    expect(body.toString('utf8', 12, 19)).toBe('service');
    expect(body.readUInt32LE(20)).toBe(10);
    expect(body.toString('utf8', 24, 34)).toBe('sdd-review');
  });

  it('round-trips the types the Secret Service reader uses', () => {
    const secret = Buffer.from('sk-test-DBUS', 'utf8');
    const cases: Array<[string, unknown[]]> = [
      ['sv', ['plain', ['s', '']]],
      ['vo', [['s', ''], '/org/freedesktop/secrets/session/s1']],
      ['aoao', [['/a/1', '/a/2'], []]],
      ['aoo', [['/a/1'], '/s/1']],
      ['a{o(oayays)}', [[['/a/1', ['/s/1', Buffer.alloc(0), secret, 'text/plain']]]]],
      ['v', [['t', 1_700_000_000n]]],
      ['ybnqiuxtd', [7, true, -2, 3, -4, 5, -6n, 7n, 1.5]],
      ['g', ['a{sv}']],
    ];
    for (const [signature, values] of cases) {
      expect(unmarshal(signature, marshal(signature, values as never))).toEqual(values);
    }
  });

  it('encodes a method call that decodes back to its header and body', () => {
    const encoded = encodeMethodCall(
      {
        destination: 'org.freedesktop.secrets',
        path: '/org/freedesktop/secrets',
        interface: 'org.freedesktop.Secret.Service',
        member: 'ReadAlias',
        signature: 's',
        body: ['default'],
      },
      9,
    );
    expect(messageLength(encoded)).toBe(encoded.length);
    expect(messageLength(encoded.subarray(0, 10))).toBeNull();
    const decoded = decodeMessage(encoded);
    expect(decoded).toMatchObject({ type: 1, serial: 9, signature: 's', body: ['default'] });
  });

  it('decodes a big-endian reply', () => {
    // A METHOD_RETURN, serial 2, REPLY_SERIAL 1, SIGNATURE "s", body "ok".
    const fields = Buffer.from([
      5,
      1,
      0x75,
      0,
      0,
      0,
      0,
      1, // (y=5, v: g "u", u 1)
      8,
      1,
      0x67,
      0,
      1,
      0x73,
      0,
      0, // (y=8, v: g "g", g "s"), padded
    ]);
    const body = Buffer.from([0, 0, 0, 2, 0x6f, 0x6b, 0]);
    const head = Buffer.alloc(16);
    head.write('B', 0, 'latin1');
    head[1] = 2;
    head[3] = 1;
    head.writeUInt32BE(body.length, 4);
    head.writeUInt32BE(2, 8);
    head.writeUInt32BE(fields.length - 1, 12); // the last byte is padding
    const message = Buffer.concat([head, fields, body]);
    expect(messageLength(message)).toBe(message.length);
    expect(decodeMessage(message)).toMatchObject({
      type: 2,
      serial: 2,
      replySerial: 1,
      signature: 's',
      body: ['ok'],
    });
  });

  it('reads unix:path and unix:abstract targets and skips other transports', () => {
    expect(socketTargets('unix:path=/tmp/dbus-x%2cy,guid=1;tcp:host=h,port=1')).toEqual([
      { path: '/tmp/dbus-x,y' },
    ]);
    expect(socketTargets('unix:abstract=/tmp/dbus-a,guid=2')).toEqual([{ path: '\0/tmp/dbus-a' }]);
    expect(socketTargets('tcp:host=localhost,port=1')).toEqual([]);
  });
});
