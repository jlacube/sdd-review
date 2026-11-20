import { describe, expect, it } from 'vitest';
import { launchBrowser, type BrowserKind } from '../acceptance/support/browser.js';
import { watchCspViolations } from '../acceptance/support/csp-violations.js';

// The CSP violation check of C001-T-012 must actually catch a violation, in the browser of the job.
const kind = process.env.SDD_BROWSER as BrowserKind | undefined;
const POLICY = "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'";

describe.skipIf(!kind)('CSP violation check', () => {
  async function check(html: string) {
    const browser = await launchBrowser(kind);
    try {
      const page = await browser.newPage();
      const watcher = await watchCspViolations(page);
      await page.route('http://review.test/**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          headers: { 'Content-Security-Policy': POLICY },
          body: html,
        }),
      );
      await page.goto('http://review.test/');
      await page.waitForTimeout(300);
      return await watcher.violations();
    } finally {
      await browser.close();
    }
  }

  it('reports an inline script', async () => {
    const found = await check('<p>x</p><script>document.title = "inline"</script>');
    expect(found.length).toBeGreaterThan(0);
  });

  it('reports a remote image', async () => {
    const found = await check('<img src="https://tracker.example.test/p.png">');
    expect(found.length).toBeGreaterThan(0);
  });

  it('reports nothing for a page that obeys the policy', async () => {
    expect(await check('<p>text only</p>')).toEqual([]);
  });
});
