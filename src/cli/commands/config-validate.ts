import { resolve } from 'node:path';
import { CONFIGURATION_PATH, validateConfigurationFile } from '../../core/api/index.js';
import { EXIT, noticeLine } from '../exit-codes.js';
import type { CliIo } from '../io.js';
import type { Command, GlobalOptions } from '../parser.js';

type ConfigValidateCommand = Extract<Command, { name: 'config-validate' }>;

/**
 * `config validate [--file <path>]` (C001-IF-001): validates a review configuration against
 * C001-IF-004 and lists the ignored settings; changes nothing and reads no git data. The default
 * file is `.sdd-review/config.json` of the working tree (of `--repo`, or the current directory).
 * An invalid file rejects with ERR-CFG-003 (exit 10), reported by the runner.
 */
export function configValidate(
  command: ConfigValidateCommand,
  global: GlobalOptions,
  io: CliIo,
): number {
  const displayPath = command.file ?? CONFIGURATION_PATH;
  const filePath =
    command.file !== undefined
      ? resolve(io.cwd, command.file)
      : resolve(io.cwd, global.repo ?? '.', CONFIGURATION_PATH);
  const result = validateConfigurationFile(filePath, { displayPath });
  for (const notice of result.notices) io.stderr.write(`${noticeLine(notice)}\n`);
  if (global.format === 'json') {
    const document = { valid: result.valid, ignoredSettings: result.ignoredSettings };
    io.stdout.write(`${JSON.stringify(document)}\n`);
  } else {
    io.stdout.write(`"${displayPath}" is a valid review configuration.\n`);
    for (const pointer of result.ignoredSettings) io.stdout.write(`Ignored setting: ${pointer}\n`);
  }
  return EXIT.ok;
}
