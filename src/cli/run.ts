import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openCore, type OpenedCore } from '../core/api/open.js';
import { analyse, announceCloudUse } from './commands/analyse.js';
import { open } from './commands/open.js';
import { review } from './commands/review.js';
import { reviews } from './commands/reviews.js';
import { configValidate } from './commands/config-validate.js';
import { notImplemented } from './commands/pending.js';
import { EXIT, errorLine, exitCodeOf, toReviewError } from './exit-codes.js';
import type { CliIo } from './io.js';
import { parseCommandLine } from './parser.js';

const HELP = `sdd-review review  [<intake options>] [--port <n>] [--no-browser]
sdd-review open    [<snapshot-id>] [--port <n>] [--no-browser]
sdd-review analyse --headless --out <directory> [<intake options>]
sdd-review reviews
sdd-review status  [--snapshot <snapshot-id>]
sdd-review intents [--snapshot <snapshot-id>]
sdd-review sign    <intent> [--snapshot <snapshot-id>] [--confirm-open-hunks <n>]
sdd-review reject  <intent> --reason <text> [--snapshot <snapshot-id>]
sdd-review defer   <intent> --note <text> [--snapshot <snapshot-id>]
sdd-review config validate [--file <path>]

<intake options> = [--base <commit>] [--sdd-change <id>] [--pr-text <file>]
                   [--plan <file>]... [--transcript <file>]... [--test-command <command>]
global options   = [--repo <directory>] [--format text|json] [--help] [--version]
`;

function version(): string {
  const pkgUrl = new URL('../../package.json', import.meta.url);
  return (JSON.parse(readFileSync(pkgUrl, 'utf8')) as { version: string }).version;
}

/**
 * Runs one command line and returns its exit code (C001-IF-001). Results go to standard output;
 * progress, notices and errors go to standard error as `<code>: <message>`.
 */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  let opened: OpenedCore | undefined;
  try {
    const parsed = parseCommandLine(argv);
    if (parsed.kind === 'version') {
      io.stdout.write(`${version()}\n`);
      return EXIT.ok;
    }
    if (parsed.kind === 'help') {
      io.stdout.write(HELP);
      return EXIT.ok;
    }
    const { command, global } = parsed;
    // `config validate` reads a file of the working tree, no git data; every other command reads
    // git data, so the git program check (C001-IF-012 §6) is its first step.
    if (command.name === 'config-validate') return configValidate(command, global, io);
    opened = await openCore(resolve(io.cwd, global.repo ?? '.'), {
      env: io.env,
      onCloudUse: announceCloudUse(io),
    });
    switch (command.name) {
      case 'analyse':
        return await analyse(command, global, opened.core.api, io, EXIT.ok);
      case 'review':
        return await review(command, global, opened.core.api, io, EXIT.ok);
      case 'open':
        return await open(command, global, opened.core.api, io, EXIT.ok);
      case 'reviews':
        return await reviews(global, opened.core.api, io, EXIT.ok);
      default:
        throw notImplemented(command.name);
    }
  } catch (error) {
    const failure = toReviewError(error);
    try {
      opened?.log.recordError(failure, 'cli');
    } catch {
      /* the log is best effort; the exit code and the message are what matter */
    }
    io.stderr.write(`${errorLine(failure)}\n`);
    return exitCodeOf(failure);
  } finally {
    await opened?.close();
  }
}
