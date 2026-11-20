// Builds test/acceptance/.features/cap-<nn>.feature from the Gherkin blocks of the acceptance
// files (C001-T-004). The Gherkin text is read from the specification, never copied into the
// repository; the output folder is ignored by git.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

export function specDir() {
  const change = readdirSync('.sdd').find((d) => /^001-/.test(d));
  return `.sdd/${change}/10-spec/20-capabilities`;
}

/** Returns the Gherkin blocks of one acceptance.md. */
export function gherkinBlocks(markdown) {
  const blocks = [];
  const re = /```gherkin\r?\n([\s\S]*?)```/g;
  for (let m = re.exec(markdown); m; m = re.exec(markdown)) blocks.push(m[1].trimEnd());
  return blocks;
}

export function extractFeatures(outDir = 'test/acceptance/.features') {
  const root = specDir();
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const cap of readdirSync(root).sort()) {
    const nn = /^CAP-(\d+)-/.exec(cap)?.[1];
    if (!nn) continue;
    const blocks = gherkinBlocks(readFileSync(`${root}/${cap}/acceptance.md`, 'utf8'));
    const body = blocks
      .map((b) => b.replace(/^/gm, '  ').replace(/^ {2}(?=\S)/gm, '  '))
      .join('\n\n');
    const file = `${outDir}/cap-${nn}.feature`;
    writeFileSync(file, `Feature: ${cap}\n\n${body}\n`);
    written.push({ file, scenarios: blocks.length });
  }
  return written;
}
