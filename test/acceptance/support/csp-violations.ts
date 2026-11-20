import { strict as assert } from 'node:assert';
import type { Page } from 'playwright';

/**
 * The CSP violation check every UI task reuses (C001-ADR-002 consequences, C001-NFR-010): a
 * browser scenario fails when the page reports a Content-Security-Policy violation. Violations
 * are collected three ways, because browsers differ in what they log: the page's
 * `securitypolicyviolation` events (an init script, which the policy does not block), the console
 * messages that name the policy, and uncaught page errors about blocked code.
 */

export interface CspWatcher {
  /** Every violation seen so far, as text (page events included, read from the page now). */
  violations(): Promise<string[]>;
  /** Fails with the list when any violation was seen; call it after the page settled. */
  assertNone(): Promise<void>;
}

const CONSOLE_PATTERN =
  /content security policy|violates the following|refused to (load|execute|apply|connect|frame)|blocked by csp/i;

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

export async function watchCspViolations(page: Page): Promise<CspWatcher> {
  const seen: string[] = [];
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations!.push(
        `${event.effectiveDirective} blocked ${event.blockedURI || 'inline'}`,
      );
    });
  });
  page.on('console', (message) => {
    if (CONSOLE_PATTERN.test(message.text())) seen.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    if (CONSOLE_PATTERN.test(error.message)) seen.push(`pageerror: ${error.message}`);
  });
  const violations = async () => {
    const events = page.isClosed()
      ? []
      : await page.evaluate(() => window.__cspViolations ?? []).catch(() => [] as string[]);
    return [...new Set([...seen, ...events.map((v) => `event: ${v}`)])];
  };
  return {
    violations,
    async assertNone() {
      assert.deepEqual(
        await violations(),
        [],
        'the page reported Content-Security-Policy violations',
      );
    },
  };
}

/** Every request the page made, for the network log of C001-REQ-908. */
export function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}
