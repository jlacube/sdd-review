import { chromium, firefox, type Browser, type BrowserType } from 'playwright';

export type BrowserKind = 'chrome' | 'edge' | 'firefox';

export const BROWSER_KINDS: readonly BrowserKind[] = ['chrome', 'edge', 'firefox'];

interface Launcher {
  readonly type: BrowserType;
  readonly channel?: string;
}

const LAUNCHERS: Record<BrowserKind, Launcher> = {
  chrome: { type: chromium, channel: 'chrome' },
  edge: { type: chromium, channel: 'msedge' },
  firefox: { type: firefox },
};

/** Playwright driver for Chrome, Edge and Firefox (C001-NFR-017). Headless by default. */
export async function launchBrowser(
  kind: BrowserKind = 'chrome',
  headless = true,
): Promise<Browser> {
  const { type, channel } = LAUNCHERS[kind];
  return type.launch({ headless, ...(channel ? { channel } : {}) });
}

/** The kinds a run covers: one, or all three with `--all-browsers`. */
export function browserKindsFor(env: NodeJS.ProcessEnv = process.env): BrowserKind[] {
  const wanted = env.SDD_ACCEPT_BROWSERS;
  if (!wanted) return ['chrome'];
  return wanted
    .split(',')
    .filter((k): k is BrowserKind => (BROWSER_KINDS as readonly string[]).includes(k));
}
