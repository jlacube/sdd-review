#!/usr/bin/env node
import { EXIT } from './exit-codes.js';
import { run } from './run.js';

// The interrupt signal stops the running command at its next step; a second one ends the process.
const controller = new AbortController();
let signals = 0;
for (const name of ['SIGINT', 'SIGTERM'] as const) {
  process.on(name, () => {
    if (++signals > 1) process.exit(EXIT.internal);
    controller.abort();
  });
}

process.exitCode = await run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
  env: process.env,
  signal: controller.signal,
});
