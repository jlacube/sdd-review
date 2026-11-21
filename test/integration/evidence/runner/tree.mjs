// Process tree of the runner's cancellation test: `root` starts `mid`, which starts `leaf`; each
// appends its process ID to the pid file and keeps writing a file in its working directory (the
// evidence workspace), as a mutation tool or a test does. On Linux and macOS the leaf ignores
// SIGTERM, so the runner must escalate to SIGKILL to end it.
import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [role, pidFile] = process.argv.slice(2);
const next = { root: 'mid', mid: 'leaf' }[role];
if (next) {
  spawn(process.execPath, [fileURLToPath(import.meta.url), next, pidFile], { stdio: 'ignore' });
}
if (role === 'leaf' && process.platform !== 'win32') process.on('SIGTERM', () => undefined);
appendFileSync(pidFile, `${process.pid}\n`);
let n = 0;
setInterval(() => writeFileSync(`run-output-${role}.txt`, `mutated ${n++}\n`), 20);
