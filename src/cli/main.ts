import { readFileSync } from 'node:fs';

const pkgUrl = new URL('../../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { version: string };

if (process.argv.includes('--version')) {
  process.stdout.write(`${pkg.version}\n`);
}
