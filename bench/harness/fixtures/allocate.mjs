// Fixture of the harness self-test: holds resident memory for a while, in this process and in
// one child process, and prints phase markers.
// Usage: node allocate.mjs <MiB> <holdMs> [child]
import { spawn } from 'node:child_process';

const mib = Number(process.argv[2] ?? 50);
const holdMs = Number(process.argv[3] ?? 600);
const withChild = process.argv[4] === 'child';

function hold(megabytes) {
  const buf = Buffer.alloc(megabytes * 1024 * 1024, 1); // written, so the pages are resident
  let sum = 0;
  for (let i = 0; i < buf.length; i += 4096) sum += buf[i];
  return { buf, sum };
}

console.log('@@bench-phase allocate');
const held = hold(mib);
console.log('@@bench-phase hold');
if (withChild) {
  const child = spawn(process.execPath, [process.argv[1], String(mib), String(holdMs)], {
    stdio: 'ignore',
  });
  child.on('exit', () => process.exit(held.sum >= 0 ? 0 : 1));
} else {
  setTimeout(() => process.exit(held.sum >= 0 ? 0 : 1), holdMs);
}
