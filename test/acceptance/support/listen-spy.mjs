// Preloaded into the CLI process of an acceptance run (`node --import`): records every call that
// makes the process listen on a socket, so that "no process of the review assistant listened on a
// socket" (C001-TS-926) can be checked on every operating system without privileges.
import dgram from 'node:dgram';
import { appendFileSync } from 'node:fs';
import net from 'node:net';

const log = process.env.SDD_LISTEN_LOG;
if (log) {
  const spy = (prototype, name, label) => {
    const original = prototype[name];
    prototype[name] = function (...args) {
      appendFileSync(log, `${label}\n`);
      return original.apply(this, args);
    };
  };
  spy(net.Server.prototype, 'listen', 'net.Server.listen');
  spy(dgram.Socket.prototype, 'bind', 'dgram.Socket.bind');
}

// Records every outbound connection the CLI process starts (C001-T-085), so that "network capture
// records 0 connections to non-loopback addresses" can be checked without privileges. Every TCP,
// TLS and HTTP client connection of Node goes through `net.Socket.prototype.connect`. The
// per-process capture of the whole process tree is C001-T-095.
const connectLog = process.env.SDD_CONNECT_LOG;
if (connectLog) {
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    let first = args[0];
    if (Array.isArray(first)) first = first[0]; // the normalised arguments of net internals
    const target =
      typeof first === 'object' && first !== null
        ? { host: first.host ?? null, port: first.port ?? null, path: first.path ?? null }
        : typeof first === 'string' && !/^\d+$/.test(first)
          ? { host: null, port: null, path: first }
          : { host: typeof args[1] === 'string' ? args[1] : null, port: Number(first), path: null };
    appendFileSync(connectLog, `${JSON.stringify(target)}\n`);
    return original.apply(this, args);
  };
}
