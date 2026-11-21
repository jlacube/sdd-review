// `node print-env.mjs NAME…` prints, per name, "NAME=" and the value of that variable or
// "NAME=unset" (C001-TS-588, C001-TS-589); on Windows the lookup ignores letter case, as the
// operating system does (C001-TS-590).
for (const name of process.argv.slice(2)) {
  const value = process.env[name];
  process.stdout.write(`${name}=${value === undefined ? 'unset' : value}\n`);
}
