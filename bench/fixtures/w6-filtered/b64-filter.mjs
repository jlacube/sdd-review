// The "other" clean filter of the W6 fixture (C001-T-020): the stored form is the file's bytes in
// base64, the working-tree form the bytes themselves. Configured in the fixture's local git
// configuration as filter.sddr-b64.{clean,smudge} = node <this file> clean|smudge (required).
// Stands in for a filter such as git-crypt: the stored form differs from what the tests read.
const mode = process.argv[2];
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const input = Buffer.concat(chunks);
  if (mode === 'clean') process.stdout.write(input.toString('base64') + '\n');
  else if (mode === 'smudge')
    process.stdout.write(Buffer.from(input.toString('utf8').trim(), 'base64'));
  else {
    process.stderr.write('usage: b64-filter.mjs clean|smudge\n');
    process.exitCode = 2;
  }
});
