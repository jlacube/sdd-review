import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFECT_KINDS, runCalibrationCheck, runDefectValidation } from './calibration.js';
import { countRepositoryLines } from './loc.js';
import { formatBytes, formatDuration, writeReport } from './report.js';
import { runCommand } from './run.js';
import { runSelftest } from './selftest.js';
import { validateSetFile } from './set.js';
import {
  parseSpikeArgs,
  runParseSpike,
  SPIKE_USAGE,
  writeSpikeReport,
} from '../../spikes/parse/runner.js';
import {
  dryRun as spikeEvidenceDryRun,
  parseSpikeEvidenceArgs,
  runBuildW6,
  runSpikeEvidence,
  SPIKE_EVIDENCE_USAGE,
} from '../../spikes/evidence/runner.js';
import {
  outcomeLine,
  parseSpikeUiArgs,
  runUiSpike,
  SPIKE_UI_USAGE,
} from '../../spikes/ui/runner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');
/** Directory holding the reference checkouts; override with SDD_BENCH_ROOT. */
export const benchRoot = process.env.SDD_BENCH_ROOT ?? path.resolve(repoRoot, '..', 'sdd-bench');

const USAGE = `usage: npm run bench -- <suite> [args]

suites:
  harness-selftest             run the harness on a small fixture (wall-clock and peak memory)
  validate-set                 validate bench/set/benchmark-set.json (draft or frozen)
  calibration --check-overlap  validate bench/calibration/corpus.json and check it does not overlap the
                               benchmark set or the G-8 pool (study/g8/pool.json once it exists)
  calibration --validate-corpus
                               check the defects of each seeded change (at least 8 seeded, the six
                               kinds, files and lines changed by the change; git when the clone is
                               present) and report the kind coverage per change
  count-lines <dir>            count the lines of the files a git repository tracks
  measure <name> -- <cmd...>   run a command, write bench/results/<name>-<time>.json and .md
${SPIKE_USAGE}
${SPIKE_EVIDENCE_USAGE}
${SPIKE_UI_USAGE}
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
    case 'calibration': {
      if (rest[0] === '--validate-corpus') {
        const result = runDefectValidation(repoRoot, benchRoot);
        for (const r of result.reports) {
          const kinds = DEFECT_KINDS.map((k) => `${k} ${r.kinds[k]}`).join(', ');
          console.log(
            `${r.id}: ${r.seeded} seeded, ${r.noticed} noticed (${r.checkedWith}); ${kinds}`,
          );
        }
        if (result.pending.length > 0) console.log(`not seeded yet: ${result.pending.join(', ')}`);
        for (const w of result.warnings) console.log(`warning: ${w}`);
        for (const e of result.errors) console.log(`error: ${e}`);
        console.log(
          `calibration --validate-corpus: ${result.errors.length === 0 ? 'ok' : 'FAILED'} ` +
            `(${result.reports.length} seeded changes, ${result.pending.length} not seeded yet, ` +
            `${result.errors.length} errors)`,
        );
        return result.errors.length === 0 ? 0 : 1;
      }
      if (rest[0] !== '--check-overlap') {
        console.error(USAGE);
        return 2;
      }
      const result = runCalibrationCheck(repoRoot);
      for (const e of result.errors) console.log(`error: ${e}`);
      console.log(
        `calibration --check-overlap: ${result.errors.length === 0 ? 'ok' : 'FAILED'} ` +
          `(${result.changes} changes against ${result.checkedAgainst} others; G-8 pool ` +
          `${result.poolPresent ? 'checked' : 'not yet recorded'})`,
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
    case 'spike-parse': {
      let parsed;
      try {
        parsed = parseSpikeArgs(
          rest,
          path.join(repoRoot, 'bench', 'set', 'benchmark-set.json'),
          benchRoot,
        );
      } catch (error) {
        console.error(`spike-parse: ${(error as Error).message}

${USAGE}`);
        return 2;
      }
      let allPass = true;
      for (const target of parsed.targets) {
        const report = await runParseSpike(target, parsed.options);
        const { jsonPath, mdPath } = writeSpikeReport(
          report,
          path.join(repoRoot, 'bench', 'results'),
        );
        const v = report.verdict;
        console.log(
          `${target.id}: ${report.result.toUpperCase()}, max ${formatDuration(v.maxWallClockMs)} ` +
            `(margin ${v.timeMarginPct} %), peak ${formatBytes(v.maxPeakResidentBytes)} ` +
            `(margin ${v.memoryMarginPct} %); ${jsonPath}, ${mdPath}`,
        );
        allPass &&= report.result === 'pass';
      }
      return allPass ? 0 : 1;
    }
    case 'spike-ui': {
      const setFile = path.join(repoRoot, 'bench', 'set', 'benchmark-set.json');
      let parsed;
      try {
        parsed = parseSpikeUiArgs(rest, setFile);
      } catch (error) {
        console.error(`spike-ui: ${(error as Error).message}

${USAGE}`);
        return 2;
      }
      let allPass = true;
      for (const target of parsed.targets) {
        const outcome = await runUiSpike(
          target,
          parsed.options,
          setFile,
          benchRoot,
          path.join(repoRoot, 'bench', 'results'),
        );
        for (const { report, mdPath } of outcome.reports) {
          console.log(outcomeLine(report, mdPath));
          allPass &&= report.result === 'pass';
        }
      }
      return allPass ? 0 : 1;
    }
    case 'spike-evidence': {
      let parsed;
      try {
        parsed = parseSpikeEvidenceArgs(rest);
      } catch (error) {
        console.error(`spike-evidence: ${(error as Error).message}

${USAGE}`);
        return 2;
      }
      if (parsed.mode === 'dry-run') {
        const { lines, problems } = spikeEvidenceDryRun(repoRoot, benchRoot);
        for (const l of lines) console.log(l);
        console.log(
          `spike-evidence --dry-run: ok (${problems} target(s) not ready; nothing was run)`,
        );
        return 0;
      }
      if (parsed.mode === 'build-w6') {
        const r = runBuildW6(parsed, benchRoot);
        console.log(JSON.stringify(r, null, 2));
        return 0;
      }
      const { report, jsonPath, mdPath } = await runSpikeEvidence(parsed, repoRoot, benchRoot);
      console.log(
        `${report.target} ${report.label}: ${formatDuration(report.wallClockMs)}` +
          `${report.validForMeasurement ? '' : ' (smoke run, not a measurement)'}; ${jsonPath}, ${mdPath}`,
      );
      for (const n of report.notes) console.log(`note: ${n}`);
      return 0;
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
