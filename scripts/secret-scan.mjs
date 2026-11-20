import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const patterns = [
  /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
];
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter(
    (f) =>
      f && !f.startsWith('.sdd/') && f !== 'package-lock.json' && f !== 'scripts/secret-scan.mjs',
  );
let hits = 0;
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const p of patterns) {
    if (p.test(text)) {
      console.error(`possible secret in ${f}: ${p}`);
      hits++;
    }
  }
}
console.log(`secret-scan: ${files.length} files, ${hits} findings`);
process.exit(hits ? 1 : 0);
