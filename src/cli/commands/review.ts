import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { CoreApi } from '../../core/api/index.js';
import { ReviewError } from '../../core/api/index.js';
import { errorLine, noticeLine } from '../exit-codes.js';
import { intakeSummaryText } from '../format.js';
import type { CliIo } from '../io.js';
import type { Command, GlobalOptions } from '../parser.js';
import { runJobsToEnd, startOptionsOf } from './analyse.js';

type ReviewCommand = Extract<Command, { name: 'review' }>;

/** Opens an address in a web browser; resolves true when one was started. */
export type BrowserLauncher = (address: string, env: NodeJS.ProcessEnv) => Promise<boolean>;

/** How long a launcher may run before it counts as started (a browser keeps running). */
const LAUNCH_GRACE_MS = 3000;

/**
 * The program that opens an address: the one named by the `BROWSER` environment variable (the
 * convention of command line tools), else the default of the operating system.
 */
function launcherFor(address: string, env: NodeJS.ProcessEnv): { file: string; args: string[] } {
  const named = env.BROWSER?.trim();
  if (named) {
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(named)) {
      // A batch file runs through cmd.exe (/s strips the outer quotes); the address holds no cmd metacharacter (base64url token).
      return { file: 'cmd.exe', args: ['/d', '/s', '/c', `""${named}" "${address}""`] };
    }
    return { file: named, args: [address] };
  }
  if (process.platform === 'win32') {
    return { file: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', address] };
  }
  if (process.platform === 'darwin') return { file: 'open', args: [address] };
  return { file: 'xdg-open', args: [address] };
}

export const launchDefaultBrowser: BrowserLauncher = (address, env) =>
  new Promise<boolean>((resolve) => {
    const { file, args } = launcherFor(address, env);
    let settled = false;
    const done = (ok: boolean) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      }
    };
    const timer = setTimeout(() => done(true), LAUNCH_GRACE_MS);
    try {
      const child = spawn(file, args, {
        stdio: 'ignore',
        windowsHide: true,
        windowsVerbatimArguments: file === 'cmd.exe',
        env,
      });
      child.on('error', () => done(false));
      child.on('exit', (code) => done(code === 0));
      child.unref();
    } catch {
      done(false);
    }
  });

/** The folder of the built web client in the installed package: `dist/web`, next to `dist/cli`. */
export function defaultStaticDir(): string {
  return fileURLToPath(new URL('../../web/', import.meta.url));
}

export interface ReviewDeps {
  readonly launch?: BrowserLauncher;
  readonly staticDir?: string;
}

const waitForStop = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });

/**
 * `review` (C001-IF-001, C001-REQ-901, C001-REQ-902, C001-REQ-914): intake, the analysis, the UI
 * server on 127.0.0.1, then the review in the default browser, or its address when none opens.
 * Runs until the developer stops it, then closes the server and returns `exitOk`: every action of
 * the review is saved when it is confirmed, so nothing is pending at the stop.
 */
export async function review(
  command: ReviewCommand,
  global: GlobalOptions,
  api: CoreApi,
  io: CliIo,
  exitOk: number,
  deps: ReviewDeps = {},
): Promise<number> {
  io.stderr.write('review: taking in the change\n');
  const started = await api.startReview(startOptionsOf(command.intake));
  for (const notice of started.notices) io.stderr.write(`${noticeLine(notice)}\n`);
  if (io.signal.aborted) return exitOk;

  io.stderr.write('review: running the analysis\n');
  // Nothing is written yet, so an interrupt here ends the command at once.
  const stopped = Symbol('stopped');
  try {
    await runJobsToEnd(api, started.snapshotId, () => {
      if (io.signal.aborted) throw stopped;
    });
  } catch (error) {
    if (error === stopped) return exitOk;
    throw error;
  }

  // Loaded here and nowhere else: no other command loads the UI server (C001-CON-09).
  const { startUiServer } = await import('../../ui-server/server.js');
  const server = await startUiServer({
    core: api,
    snapshotId: started.snapshotId,
    ...(command.port !== undefined ? { port: command.port } : {}),
    staticDir: deps.staticDir ?? defaultStaticDir(),
  });
  try {
    if (global.format === 'json') {
      io.stdout.write(
        `${JSON.stringify({ snapshotId: started.snapshotId, intakeSummary: started.intakeSummary, address: server.url }, null, 2)}\n`,
      );
    } else {
      io.stdout.write(intakeSummaryText(started.intakeSummary, command.intake.base ?? 'HEAD'));
      io.stdout.write(`Snapshot: ${started.snapshotId}\nReview address: ${server.url}\n`);
    }
    if (!command.noBrowser) {
      const launch = deps.launch ?? launchDefaultBrowser;
      if (!(await launch(server.url, io.env))) {
        const notice = new ReviewError('ERR-UI-003', {
          operation: 'review',
          params: { address: server.url },
        });
        io.stderr.write(`${errorLine(notice)}\n`);
      }
    }
    io.stderr.write('review: serving the review; stop it with Ctrl+C\n');
    await waitForStop(io.signal);
  } finally {
    await server.close();
  }
  return exitOk;
}
