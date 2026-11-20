import * as checker from 'license-checker-rseidelsohn';

const forbidden = /(^|[^L])GPL|AGPL|LGPL|SSPL/i;
checker.init({ start: process.cwd(), production: false }, (err, packages) => {
  if (err) {
    console.error('licence-check: cannot read the dependency tree:', err.message);
    process.exit(2);
  }
  const bad = Object.entries(packages).filter(([, p]) => forbidden.test(String(p.licenses)));
  for (const [name, p] of bad) console.error(`forbidden licence: ${name} ${p.licenses}`);
  console.log(`licence-check: ${Object.keys(packages).length} packages, ${bad.length} forbidden`);
  process.exit(bad.length ? 1 : 0);
});
