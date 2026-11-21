import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { After, Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';
import { namedPath } from '../../support/named-files.js';

// C001-TC-113: C001-TS-129 (a named file that cannot be used stops intake, C001-REQ-113) on
// `fx-intake`. The review is started by the shared step of req-112.steps.ts; "no file … exists" is
// the step of req-120.steps.ts and "no snapshot is created" that of intake-common.steps.ts.

/** Files whose read permission a scenario removed, to give it back before clean-up. */
const locked = new WeakMap<AcceptanceWorld, string[]>();

/** Gives a file's read permission back, so that the scenario's folder can be removed. */
function unlock(path: string): void {
  if (process.platform === 'win32') {
    spawnSync('icacls', [path, '/remove:d', '*S-1-1-0'], { stdio: 'ignore' });
  } else {
    chmodSync(path, 0o644);
  }
}

Given(
  'the file {string} exists without read permission',
  function (this: AcceptanceWorld, file: string) {
    const path = namedPath(this, file);
    writeFileSync(path, '# Plan\n\n- [ ] Add the order total\n');
    locked.set(this, [...(locked.get(this) ?? []), path]);
    if (process.platform === 'win32') {
      // Windows ignores the POSIX mode bits for reading: deny reading to Everyone with an ACL entry.
      const r = spawnSync('icacls', [path, '/deny', '*S-1-1-0:(R)'], { encoding: 'utf8' });
      assert.equal(r.status, 0, `icacls failed: ${r.stdout}${r.stderr}`);
    } else {
      chmodSync(path, 0o000);
    }
    let readable = true;
    try {
      readFileSync(path);
    } catch {
      readable = false;
    }
    // A superuser reads every file whatever its permission: the state cannot be made there.
    if (readable) return 'skipped';
    return undefined;
  },
);

After(function (this: AcceptanceWorld) {
  for (const path of locked.get(this) ?? []) {
    try {
      unlock(path);
    } catch {
      /* the folder is removed with force in any case */
    }
  }
});

Given(
  /^the file "([^"]+)" holds a PDF document of (\d+) pages$/,
  function (this: AcceptanceWorld, file: string, pages: string) {
    // A minimal PDF: a binary comment line marks it as binary (PDF 1.7, 7.5.2), as PDF writers do,
    // and one compressed-looking content stream per page.
    const parts: Buffer[] = [
      Buffer.from('%PDF-1.7\n%'),
      Buffer.from([0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
    ];
    const n = Number(pages);
    const kids = Array.from({ length: n }, (_, i) => `${3 + i * 2} 0 R`).join(' ');
    parts.push(Buffer.from('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n'));
    parts.push(Buffer.from(`2 0 obj << /Type /Pages /Kids [${kids}] /Count ${n} >> endobj\n`));
    for (let i = 0; i < n; i++) {
      const page = 3 + i * 2;
      parts.push(
        Buffer.from(
          `${page} 0 obj << /Type /Page /Parent 2 0 R /Contents ${page + 1} 0 R >> endobj\n`,
        ),
        Buffer.from(`${page + 1} 0 obj << /Length 8 /Filter /FlateDecode >> stream\n`),
        Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]),
        Buffer.from('\nendstream endobj\n'),
      );
    }
    parts.push(Buffer.from('trailer << /Root 1 0 R >>\n%%EOF\n'));
    writeFileSync(namedPath(this, file), Buffer.concat(parts));
  },
);

Then(
  'intake stops with an error message that contains {string} and the reason {string}',
  function (this: AcceptanceWorld, file: string, reason: string) {
    const run = this.lastRun;
    assert.ok(run, 'the CLI was not run');
    assert.equal(run.status, 3, `exit code ${run.status}: ${run.stderr}${run.stdout}`);
    assert.ok(run.stderr.includes(file), `the error message does not name ${file}: ${run.stderr}`);
    assert.ok(
      run.stderr.includes(reason),
      `the error message does not state "${reason}": ${run.stderr}`,
    );
    assert.match(run.stderr, /ERR-CTX-00[123]/);
  },
);
