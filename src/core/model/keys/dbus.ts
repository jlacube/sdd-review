import { connect, type Socket } from 'node:net';

/**
 * A minimal D-Bus client for the Secret Service reader (C001-ADR-008 §1 and §3, Linux row): method
 * calls over the per-user session bus socket, authenticated with SASL EXTERNAL, nothing else. It is
 * written on Node.js built-ins so that the review assistant links neither libdbus nor libsecret
 * (LGPL-2.1) and adds no dependency (dbus-next failed the licence and advisory check, D-010).
 *
 * Covered by the D-Bus specification subset it implements: little- and big-endian messages, the
 * basic types, strings, object paths, signatures, arrays, structs, dict entries and variants. No
 * Unix file descriptors, no server side, no signals (incoming signals are ignored).
 */

export type DbusValue =
  number | bigint | boolean | string | Uint8Array | DbusValue[] | readonly DbusValue[];

/** An error reply of the bus or of a service (its D-Bus error name in `dbusName`). */
export class DbusError extends Error {
  constructor(
    readonly dbusName: string,
    message: string,
  ) {
    super(message);
    this.name = 'DbusError';
  }
}

// ---------------------------------------------------------------------------------------------
// Signatures

/** Splits a signature into its complete types (`a{ss}o` → [`a{ss}`, `o`]). */
export function splitSignature(signature: string): string[] {
  const types: string[] = [];
  let i = 0;
  while (i < signature.length) {
    const end = completeTypeEnd(signature, i);
    types.push(signature.slice(i, end));
    i = end;
  }
  return types;
}

function completeTypeEnd(signature: string, start: number): number {
  const c = signature[start];
  if (c === undefined) throw new Error(`incomplete D-Bus signature "${signature}"`);
  if (c === 'a') return completeTypeEnd(signature, start + 1);
  if (c === '(' || c === '{') {
    const close = c === '(' ? ')' : '}';
    let i = start + 1;
    while (signature[i] !== close) {
      if (i >= signature.length) throw new Error(`unbalanced D-Bus signature "${signature}"`);
      i = completeTypeEnd(signature, i);
    }
    return i + 1;
  }
  if ('ybnqiuxtdsogvh'.includes(c)) return start + 1;
  throw new Error(`unsupported D-Bus type "${c}" in "${signature}"`);
}

function alignmentOf(type: string): number {
  switch (type[0]) {
    case 'y':
    case 'g':
    case 'v':
      return 1;
    case 'n':
    case 'q':
      return 2;
    case 'x':
    case 't':
    case 'd':
    case '(':
    case '{':
      return 8;
    default:
      return 4; // b i u s o a h
  }
}

// ---------------------------------------------------------------------------------------------
// Marshalling (always little-endian)

class Writer {
  private bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  align(n: number): void {
    while (this.bytes.length % n !== 0) this.bytes.push(0);
  }

  raw(data: Uint8Array): void {
    for (const b of data) this.bytes.push(b);
  }

  fixed(size: number, write: (view: DataView) => void): void {
    this.align(size);
    const buf = new DataView(new ArrayBuffer(size));
    write(buf);
    this.raw(new Uint8Array(buf.buffer));
  }

  setUint32At(offset: number, value: number): void {
    const buf = new DataView(new ArrayBuffer(4));
    buf.setUint32(0, value, true);
    for (let i = 0; i < 4; i++) this.bytes[offset + i] = buf.getUint8(i);
  }

  toBuffer(): Buffer {
    return Buffer.from(this.bytes);
  }
}

function writeValue(w: Writer, type: string, value: DbusValue): void {
  const c = type[0];
  switch (c) {
    case 'y':
      w.raw(Uint8Array.of(Number(value) & 0xff));
      return;
    case 'b':
      w.fixed(4, (v) => v.setUint32(0, value ? 1 : 0, true));
      return;
    case 'n':
      w.fixed(2, (v) => v.setInt16(0, Number(value), true));
      return;
    case 'q':
      w.fixed(2, (v) => v.setUint16(0, Number(value), true));
      return;
    case 'i':
    case 'h':
      w.fixed(4, (v) => v.setInt32(0, Number(value), true));
      return;
    case 'u':
      w.fixed(4, (v) => v.setUint32(0, Number(value), true));
      return;
    case 'x':
      w.fixed(8, (v) => v.setBigInt64(0, BigInt(value as bigint | number), true));
      return;
    case 't':
      w.fixed(8, (v) => v.setBigUint64(0, BigInt(value as bigint | number), true));
      return;
    case 'd':
      w.fixed(8, (v) => v.setFloat64(0, Number(value), true));
      return;
    case 's':
    case 'o': {
      const data = Buffer.from(String(value), 'utf8');
      w.fixed(4, (v) => v.setUint32(0, data.length, true));
      w.raw(data);
      w.raw(Uint8Array.of(0));
      return;
    }
    case 'g': {
      const data = Buffer.from(String(value), 'utf8');
      w.raw(Uint8Array.of(data.length));
      w.raw(data);
      w.raw(Uint8Array.of(0));
      return;
    }
    case 'v': {
      const [signature, inner] = value as readonly [string, DbusValue];
      writeValue(w, 'g', signature);
      writeValue(w, signature, inner);
      return;
    }
    case '(':
    case '{': {
      w.align(8);
      const fields = splitSignature(type.slice(1, -1));
      const values = value as readonly DbusValue[];
      fields.forEach((field, i) => writeValue(w, field, values[i]!));
      return;
    }
    case 'a': {
      const element = type.slice(1);
      w.align(4);
      const lengthAt = w.length;
      w.fixed(4, (v) => v.setUint32(0, 0, true));
      w.align(alignmentOf(element));
      const start = w.length;
      if (element === 'y' && value instanceof Uint8Array) w.raw(value);
      else for (const item of value as readonly DbusValue[]) writeValue(w, element, item);
      w.setUint32At(lengthAt, w.length - start);
      return;
    }
    default:
      throw new Error(`unsupported D-Bus type "${type}"`);
  }
}

/** Marshals `values` of `signature` as a little-endian message body. */
export function marshal(signature: string, values: readonly DbusValue[]): Buffer {
  const w = new Writer();
  splitSignature(signature).forEach((type, i) => writeValue(w, type, values[i]!));
  return w.toBuffer();
}

// ---------------------------------------------------------------------------------------------
// Unmarshalling

class Reader {
  offset: number;

  constructor(
    readonly buf: Buffer,
    readonly little: boolean,
    offset = 0,
  ) {
    this.offset = offset;
  }

  align(n: number): void {
    this.offset = Math.ceil(this.offset / n) * n;
  }

  need(n: number): void {
    if (this.offset + n > this.buf.length) throw new Error('truncated D-Bus message');
  }

  u8(): number {
    this.need(1);
    return this.buf.readUInt8(this.offset++);
  }

  u32(): number {
    this.align(4);
    this.need(4);
    const v = this.little ? this.buf.readUInt32LE(this.offset) : this.buf.readUInt32BE(this.offset);
    this.offset += 4;
    return v;
  }
}

function readValue(r: Reader, type: string): DbusValue {
  const c = type[0];
  const fixed = <T>(size: number, le: (o: number) => T, be: (o: number) => T): T => {
    r.align(size);
    r.need(size);
    const v = r.little ? le(r.offset) : be(r.offset);
    r.offset += size;
    return v;
  };
  const b = r.buf;
  switch (c) {
    case 'y':
      return r.u8();
    case 'b':
      return r.u32() !== 0;
    case 'n':
      return fixed(
        2,
        (o) => b.readInt16LE(o),
        (o) => b.readInt16BE(o),
      );
    case 'q':
      return fixed(
        2,
        (o) => b.readUInt16LE(o),
        (o) => b.readUInt16BE(o),
      );
    case 'i':
    case 'h':
      return fixed(
        4,
        (o) => b.readInt32LE(o),
        (o) => b.readInt32BE(o),
      );
    case 'u':
      return r.u32();
    case 'x':
      return fixed(
        8,
        (o) => b.readBigInt64LE(o),
        (o) => b.readBigInt64BE(o),
      );
    case 't':
      return fixed(
        8,
        (o) => b.readBigUInt64LE(o),
        (o) => b.readBigUInt64BE(o),
      );
    case 'd':
      return fixed(
        8,
        (o) => b.readDoubleLE(o),
        (o) => b.readDoubleBE(o),
      );
    case 's':
    case 'o': {
      const length = r.u32();
      r.need(length + 1);
      const s = b.toString('utf8', r.offset, r.offset + length);
      r.offset += length + 1;
      return s;
    }
    case 'g': {
      const length = r.u8();
      r.need(length + 1);
      const s = b.toString('utf8', r.offset, r.offset + length);
      r.offset += length + 1;
      return s;
    }
    case 'v': {
      const signature = readValue(r, 'g') as string;
      return [signature, readValue(r, signature)];
    }
    case '(':
    case '{': {
      r.align(8);
      return splitSignature(type.slice(1, -1)).map((field) => readValue(r, field));
    }
    case 'a': {
      const element = type.slice(1);
      const length = r.u32();
      r.align(alignmentOf(element));
      const end = r.offset + length;
      r.need(length);
      if (element === 'y') {
        const bytes = Buffer.from(b.subarray(r.offset, end));
        r.offset = end;
        return bytes;
      }
      const items: DbusValue[] = [];
      while (r.offset < end) items.push(readValue(r, element));
      return items;
    }
    default:
      throw new Error(`unsupported D-Bus type "${type}"`);
  }
}

/** Unmarshals a message body of `signature`. */
export function unmarshal(signature: string, body: Buffer, little = true): DbusValue[] {
  const r = new Reader(body, little);
  return splitSignature(signature).map((type) => readValue(r, type));
}

// ---------------------------------------------------------------------------------------------
// Messages

export const MESSAGE_TYPE = { METHOD_CALL: 1, METHOD_RETURN: 2, ERROR: 3, SIGNAL: 4 } as const;

const FIELD = {
  PATH: 1,
  INTERFACE: 2,
  MEMBER: 3,
  ERROR_NAME: 4,
  REPLY_SERIAL: 5,
  DESTINATION: 6,
  SENDER: 7,
  SIGNATURE: 8,
} as const;

export interface MethodCall {
  readonly destination: string;
  readonly path: string;
  readonly interface: string;
  readonly member: string;
  readonly signature?: string;
  readonly body?: readonly DbusValue[];
}

export interface Message {
  readonly type: number;
  readonly serial: number;
  readonly replySerial?: number;
  readonly errorName?: string;
  readonly signature: string;
  readonly body: DbusValue[];
}

/** Encodes a method call (little-endian, protocol version 1). */
export function encodeMethodCall(call: MethodCall, serial: number): Buffer {
  const signature = call.signature ?? '';
  const body = signature ? marshal(signature, call.body ?? []) : Buffer.alloc(0);
  const fields: DbusValue[] = [
    [FIELD.PATH, ['o', call.path]],
    [FIELD.INTERFACE, ['s', call.interface]],
    [FIELD.MEMBER, ['s', call.member]],
    [FIELD.DESTINATION, ['s', call.destination]],
  ];
  if (signature) fields.push([FIELD.SIGNATURE, ['g', signature]]);
  const w = new Writer();
  w.raw(Uint8Array.of('l'.charCodeAt(0), MESSAGE_TYPE.METHOD_CALL, 0, 1));
  w.fixed(4, (v) => v.setUint32(0, body.length, true));
  w.fixed(4, (v) => v.setUint32(0, serial, true));
  writeValue(w, 'a(yv)', fields);
  w.align(8);
  return Buffer.concat([w.toBuffer(), body]);
}

/** The total length of the message at the start of `buf`, or null while its header is partial. */
export function messageLength(buf: Buffer): number | null {
  if (buf.length < 16) return null;
  const little = buf[0] === 'l'.charCodeAt(0);
  const bodyLength = little ? buf.readUInt32LE(4) : buf.readUInt32BE(4);
  const fieldsLength = little ? buf.readUInt32LE(12) : buf.readUInt32BE(12);
  return Math.ceil((16 + fieldsLength) / 8) * 8 + bodyLength;
}

/** Decodes one complete message. */
export function decodeMessage(buf: Buffer): Message {
  const endian = String.fromCharCode(buf[0] ?? 0);
  if (endian !== 'l' && endian !== 'B') throw new Error('not a D-Bus message');
  const little = endian === 'l';
  const r = new Reader(buf, little, 4);
  const bodyLength = r.u32();
  const serial = r.u32();
  const fields = readValue(r, 'a(yv)') as Array<[number, [string, DbusValue]]>;
  r.align(8);
  const header: Partial<Record<number, DbusValue>> = {};
  for (const [code, [, value]] of fields) header[code] = value;
  const signature = (header[FIELD.SIGNATURE] as string | undefined) ?? '';
  const body = buf.subarray(r.offset, r.offset + bodyLength);
  return {
    type: buf[1] ?? 0,
    serial,
    replySerial: header[FIELD.REPLY_SERIAL] as number | undefined,
    errorName: header[FIELD.ERROR_NAME] as string | undefined,
    signature,
    body: signature ? unmarshal(signature, Buffer.from(body), little) : [],
  };
}

// ---------------------------------------------------------------------------------------------
// Addresses

export type SocketTarget = { readonly path: string };

/** Unescapes a D-Bus address value (`%xx` escapes). */
function unescapeValue(value: string): string {
  return decodeURIComponent(value);
}

/**
 * The socket targets of a D-Bus address list, in order: `unix:path=` and, on Linux,
 * `unix:abstract=` (a leading NUL byte). Other transports are skipped.
 */
export function socketTargets(address: string): SocketTarget[] {
  const targets: SocketTarget[] = [];
  for (const entry of address.split(';')) {
    const colon = entry.indexOf(':');
    if (colon < 0 || entry.slice(0, colon) !== 'unix') continue;
    const params = new Map<string, string>();
    for (const pair of entry.slice(colon + 1).split(',')) {
      const eq = pair.indexOf('=');
      if (eq > 0) params.set(pair.slice(0, eq), unescapeValue(pair.slice(eq + 1)));
    }
    const path = params.get('path');
    const abstract = params.get('abstract');
    if (path) targets.push({ path });
    else if (abstract) targets.push({ path: `\0${abstract}` });
  }
  return targets;
}

// ---------------------------------------------------------------------------------------------
// Connection

export interface OpenOptions {
  /** The user ID sent with SASL EXTERNAL; default `process.getuid()`. */
  readonly uid?: number;
}

export class DbusConnection {
  private buffer: Buffer = Buffer.alloc(0);
  private serial = 0;
  private readonly pending = new Map<
    number,
    { resolve: (m: Message) => void; reject: (e: Error) => void }
  >();
  private closedWith: Error | null = null;

  private constructor(private readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => this.onData(chunk));
    const fail = (error: Error) => this.failAll(error);
    socket.on('error', fail);
    socket.on('close', () => fail(new Error('D-Bus connection closed')));
  }

  /** Connects to the first reachable target, authenticates and says Hello to the bus. */
  static async open(address: string, options: OpenOptions = {}): Promise<DbusConnection> {
    const targets = socketTargets(address);
    if (targets.length === 0) throw new Error('no supported transport in the D-Bus address');
    let lastError: Error = new Error('no D-Bus target');
    for (const target of targets) {
      let socket: Socket;
      try {
        socket = await connectSocket(target.path);
      } catch (error) {
        lastError = error as Error;
        continue;
      }
      try {
        await authenticate(socket, options.uid ?? process.getuid?.() ?? 0);
        const connection = new DbusConnection(socket);
        await connection.call({
          destination: 'org.freedesktop.DBus',
          path: '/org/freedesktop/DBus',
          interface: 'org.freedesktop.DBus',
          member: 'Hello',
        });
        return connection;
      } catch (error) {
        socket.destroy();
        throw error;
      }
    }
    throw lastError;
  }

  /** Calls a method and resolves with the reply's body; rejects with DbusError on an error reply. */
  call(call: MethodCall): Promise<DbusValue[]> {
    if (this.closedWith) return Promise.reject(this.closedWith);
    this.serial += 1;
    const serial = this.serial;
    return new Promise<DbusValue[]>((resolve, reject) => {
      this.pending.set(serial, {
        resolve: (message) => {
          if (message.type === MESSAGE_TYPE.ERROR) {
            const text = typeof message.body[0] === 'string' ? message.body[0] : '';
            reject(new DbusError(message.errorName ?? 'unknown', text));
          } else {
            resolve(message.body);
          }
        },
        reject,
      });
      this.socket.write(encodeMethodCall(call, serial));
    });
  }

  close(): void {
    this.failAll(new Error('D-Bus connection closed'));
    this.socket.destroy();
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const length = messageLength(this.buffer);
      if (length === null || this.buffer.length < length) return;
      const raw = this.buffer.subarray(0, length);
      this.buffer = Buffer.from(this.buffer.subarray(length));
      let message: Message;
      try {
        message = decodeMessage(Buffer.from(raw));
      } catch (error) {
        this.failAll(error as Error);
        this.socket.destroy();
        return;
      } finally {
        raw.fill(0); // a GetSecrets reply holds a secret
      }
      if (message.replySerial === undefined) continue; // signals and calls to us are ignored
      const waiter = this.pending.get(message.replySerial);
      if (!waiter) continue;
      this.pending.delete(message.replySerial);
      waiter.resolve(message);
    }
  }

  private failAll(error: Error): void {
    this.closedWith ??= error;
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
  }
}

function connectSocket(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path });
    const onError = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.once('error', onError);
    socket.once('connect', () => {
      socket.off('error', onError);
      resolve(socket);
    });
  });
}

/** SASL EXTERNAL with the user ID (D-Bus specification, Authentication Protocol). */
function authenticate(socket: Socket, uid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let received = '';
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => onError(new Error('D-Bus connection closed during authentication'));
    const onData = (chunk: Buffer) => {
      received += chunk.toString('latin1');
      const end = received.indexOf('\r\n');
      if (end < 0) return;
      const line = received.slice(0, end);
      cleanup();
      if (line.startsWith('OK ')) {
        socket.write('BEGIN\r\n');
        resolve();
      } else {
        reject(new Error(`D-Bus authentication refused: ${line.split(' ')[0]}`));
      }
    };
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
    const identity = Buffer.from(String(uid), 'ascii').toString('hex');
    socket.write(`\0AUTH EXTERNAL ${identity}\r\n`);
  });
}
