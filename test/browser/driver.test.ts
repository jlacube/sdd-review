import { describe, expect, it } from 'vitest';
import { launchBrowser, type BrowserKind } from '../acceptance/support/browser.js';

// Smoke test of the Playwright driver for the browser named by SDD_BROWSER (per-browser CI job).
const kind = process.env.SDD_BROWSER as BrowserKind | undefined;

describe.skipIf(!kind)('browser driver', () => {
  it('opens a page in the configured browser', async () => {
    const browser = await launchBrowser(kind);
    try {
      const page = await browser.newPage();
      await page.setContent('<title>sdd</title><p>ok</p>');
      expect(await page.title()).toBe('sdd');
    } finally {
      await browser.close();
    }
  }, 60_000);
});
