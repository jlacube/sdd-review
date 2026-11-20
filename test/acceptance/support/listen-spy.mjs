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
