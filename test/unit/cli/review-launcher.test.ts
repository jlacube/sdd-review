import { describe, expect, it } from 'vitest';
import { launchDefaultBrowser } from '../../../src/cli/commands/review.js';

describe('browser launcher', () => {
  it('fails when the program named by BROWSER does not exist', async () => {
    const env = { ...process.env, BROWSER: 'sdd-no-such-browser-program' };
    expect(await launchDefaultBrowser('http://127.0.0.1:1/#token=x', env)).toBe(false);
  });

  it('fails when the program exits with a failure status', async () => {
    // `node <address>` cannot run a file of that name and exits 1.
    const env = { ...process.env, BROWSER: process.execPath };
    expect(await launchDefaultBrowser('sdd-no-such-script.js', env)).toBe(false);
  });
});
