import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countRepositoryLines } from './loc.js';
import { formatBytes, formatDuration, writeReport } from './report.js';
import { runCommand } from './run.js';
import { runSelftest } from './selftest.js';
import { validateSetFile } from './set.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');
/** Directory holding the reference checkouts; override with SDD_BENCH_ROOT. */
export const benchRoot = process.env.SDD_BENCH_ROOT ?? path.resolve(repoRoot, '..', 'sdd-bench');

const USAGE = `usage: npm run bench -- <suite> [args]

suites:
  harness-selftest             run the harness on a small fixture (wall-clock and peak memory)
  validate-set                 validate bench/set/benchmark-set.json (draft or frozen)
  count-lines <dir>            count the lines of the files a git repository tracks
  measure <name> -- <cmd...>   run a command, write bench/results/<name>-<time>.json and .md
`;

async function main(argv: string[]): Promise<number> {
  const [suite, ...rest] = argv;
  switch (suite) {
    case 'harness-selftest': {
      const checks = await runSelftest();
      for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
      const failed = checks.filter((c) => !c.ok).length;
      console.log(
        failed === 0 ? 'harness-selftest: ok' : `harness-selftest: ${failed} check(s) failed`,
      );
      return failed === 0 ? 0 : 1;
    }
    case 'validate-set': {
      const file = path.join(repoRoot, 'bench', 'set', 'benchmark-set.json');
      const result = validateSetFile(file, { repoRoot, benchRoot, useGit: true });
      for (const w of result.warnings) console.log(`warning: ${w}`);
      for (const e of result.errors) console.log(`error: ${e}`);
      console.log(
        `validate-set: ${result.errors.length === 0 ? 'ok' : 'FAILED'} ` +
          `(${result.frozen ? 'frozen' : 'draft'}, ${result.errors.length} errors)`,
      );
      return result.errors.length === 0 ? 0 : 1;
    }
    case 'count-lines': {
      if (!rest[0]) {
        console.error(USAGE);
        return 2;
      }
      const c = countRepositoryLines(path.resolve(rest[0]));
      console.log(JSON.stringify(c, null, 2));
      return 0;
    }
    case 'measure': {
      const sep = rest.indexOf('--');
      if (!rest[0] || sep < 1 || sep === rest.length - 1) {
        console.error(USAGE);
        return 2;
      }
      const [command, ...args] = rest.slice(sep + 1);
      const report = await runCommand({
        name: rest[0],
        command,
        args,
        shell: process.platform === 'win32',
        echo: true,
      });
      const { jsonPath } = writeReport(report, path.join(repoRoot, 'bench', 'results'));
      console.log(
        `wall-clock ${formatDuration(report.wallClockMs)}, peak memory ` +
          `${formatBytes(report.memory.peakResidentBytes)}, exit ${report.command?.exitCode}; ${jsonPath}`,
      );
      return report.command?.exitCode === 0 ? 0 : 1;
    }
    default:
      console.error(USAGE);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
