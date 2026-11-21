// The filter stub of `fx-lfs` and `fx-crypt` (CAP-01 acceptance, fixture conventions; C001-T-028).
//
//   node filter-stub.mjs <clean|smudge|process> <lfs|crypt|copy> <log file> <store dir> [<path>]
//
// Appends one line per call to the log (the filter stub's log), so that a test can show that the
// review assistant never runs a filter (C001-IF-012 §2 item 2). Drivers:
// - lfs:   clean stores the content under its SHA-256 in the store and prints its Git LFS pointer
//          file (a valid pointer passes through, as Git LFS does); smudge prints the stored content
//          of a pointer, or the pointer itself when the content is not stored.
// - crypt: a fixed-key, deterministic cipher, as git-crypt is: clean encrypts (a header with a NUL
//          byte, then the bytes XOR the key), smudge decrypts; encrypted input passes through clean.
// - copy:  prints its input unchanged.
// `process` speaks git's long-running filter protocol version 2 (gitattributes(5)), which git uses
// instead of clean and smudge when `filter.<driver>.process` is set.
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

const [mode, driver, logFile, storeDir, pathArg = ''] = process.argv.slice(2);
const HEADER = Buffer.from('\0SDDCRYPT\0', 'latin1');
const KEY = 0x5a;
const POINTER =
  /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize (\d+)\n$/;

function log(command, path) {
  appendFileSync(logFile, `${driver} ${command} ${path}\n`);
}

function xor(bytes) {
  const out = Buffer.allocUnsafe(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ KEY;
  return out;
}

function apply(command, input) {
  if (driver === 'lfs') {
    if (command === 'clean') {
      if (input.length < 1024 && POINTER.test(input.toString('latin1'))) return input;
      const oid = createHash('sha256').update(input).digest('hex');
      mkdirSync(storeDir, { recursive: true });
      writeFileSync(join(storeDir, oid), input);
      return Buffer.from(
        `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${input.length}\n`,
      );
    }
    const m = input.length < 1024 ? POINTER.exec(input.toString('latin1')) : null;
    const stored = m ? join(storeDir, m[1]) : null;
    return stored && existsSync(stored) ? readFileSync(stored) : input;
  }
  if (driver === 'crypt') {
    const encrypted = input.subarray(0, HEADER.length).equals(HEADER);
    if (command === 'clean') return encrypted ? input : Buffer.concat([HEADER, xor(input)]);
    return encrypted ? xor(input.subarray(HEADER.length)) : input;
  }
  return input;
}

// ---------------------------------------------------------------------------------------------
// One call per file: clean or smudge.

if (mode === 'clean' || mode === 'smudge') {
  log(mode, pathArg);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  writeSync(1, apply(mode, Buffer.concat(chunks)));
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// The long-running process protocol (pkt-line framing).

let buffer = Buffer.alloc(0);
const waiting = [];
let ended = false;

function nextPacket() {
  return new Promise((resolve) => {
    waiting.push(resolve);
    drain();
  });
}

function drain() {
  while (waiting.length > 0) {
    if (buffer.length >= 4) {
      const len = Number.parseInt(buffer.subarray(0, 4).toString('latin1'), 16);
      if (len === 0) {
        buffer = buffer.subarray(4);
        waiting.shift()(null); // flush packet
        continue;
      }
      if (buffer.length >= len) {
        const data = buffer.subarray(4, len);
        buffer = buffer.subarray(len);
        waiting.shift()(data);
        continue;
      }
    }
    if (ended) waiting.shift()(undefined);
    else return;
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});
process.stdin.on('end', () => {
  ended = true;
  drain();
});

/** Packets up to the next flush packet; `undefined` at the end of the input. */
async function readList() {
  const list = [];
  for (;;) {
    const p = await nextPacket();
    if (p === undefined) return undefined;
    if (p === null) return list;
    list.push(p);
  }
}

function writePacket(data) {
  const len = (data.length + 4).toString(16).padStart(4, '0');
  writeSync(1, Buffer.concat([Buffer.from(len, 'latin1'), data]));
}
const flush = () => writeSync(1, Buffer.from('0000', 'latin1'));
const text = (packets) => packets.map((p) => p.toString('utf8').replace(/\n$/, ''));

await readList(); // git-filter-client, version=2
writePacket(Buffer.from('git-filter-server\n'));
writePacket(Buffer.from('version=2\n'));
flush();
await readList(); // capabilities
writePacket(Buffer.from('capability=clean\n'));
writePacket(Buffer.from('capability=smudge\n'));
flush();
for (;;) {
  const headers = await readList();
  if (headers === undefined) break;
  const fields = Object.fromEntries(
    text(headers).map((line) => [
      line.slice(0, line.indexOf('=')),
      line.slice(line.indexOf('=') + 1),
    ]),
  );
  const content = Buffer.concat((await readList()) ?? []);
  const command = fields.command ?? '';
  log(`process-${command}`, fields.pathname ?? '');
  const output = apply(command, content);
  writePacket(Buffer.from('status=success\n'));
  flush();
  for (let i = 0; i < output.length; i += 65516) writePacket(output.subarray(i, i + 65516));
  flush();
  flush(); // the status stays "success"
}
process.exit(0);
