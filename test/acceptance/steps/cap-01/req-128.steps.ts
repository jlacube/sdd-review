import { strict as assert } from 'node:assert';
import { readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { Given, Then } from '@cucumber/cucumber';
import { binaryBytes } from '../../../fixtures/repos/fx-lfs.js';
import {
  assertSnapshotContent,
  blobBytes,
  count,
  indexEntry,
  makeRacy,
  settle,
} from '../../support/clean-filter.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-128: C001-TS-174 to C001-TS-187 (C001-REQ-128) on `fx-lfs` (C001-T-028). C001-TS-188
// resumes a review and expects the moved-on notice: its steps come with the moved-on check
// (C001-T-033); the G-12 side of it is covered by test/integration/git/clean-filter.test.ts.

Given(
  /^after checkout the agent wrote ([\d,]+) new bytes into "([^"]+)" and staged them with `git add`, so that the index records a new pointer file whose "oid" line names the SHA-256 hash of these bytes and whose last line is "size (\d+)"$/,
  function (this: AcceptanceWorld, n: string, path: string, size: string) {
    const repo = this.repo!;
    repo.write(path, binaryBytes(count(n), 7));
    settle(repo, path, 600);
    repo.stage(path);
    const pointer = blobBytes(repo, `:${path}`).toString('latin1');
    assert.match(pointer, new RegExp(`\\nsize ${size}\\n$`));
  },
);

Then(
  /^the headless output holds, as the snapshot content of "([^"]+)", the pointer file that the index records, with the line "([^"]+)"$/,
  function (this: AcceptanceWorld, path: string, line: string) {
    const pointer = blobBytes(this.repo!, `:${path}`);
    assert.ok(pointer.toString('latin1').split('\n').includes(line));
    assertSnapshotContent(this, path, pointer);
  },
);

Given(
  /^the content of "([^"]+)" is unchanged since checkout, and (its modification time is set 1 hour later|the modification time that its index entry records is equal to the modification time of the index file, so that the entry is racy|the agent ran `git rm --cached [^`]+`, so that the index holds no entry for it)$/,
  function (this: AcceptanceWorld, path: string, state: string) {
    const repo = this.repo!;
    if (state.startsWith('its modification time')) {
      const later = new Date(Date.now() + 3_600_000);
      utimesSync(repo.path(path), later, later);
    } else if (state.includes('racy')) {
      makeRacy(repo, path);
    } else {
      repo.git('rm', '-q', '--cached', '--', path);
    }
  },
);

Given(
  /^after checkout the agent changed byte ([\d,]+) of "([^"]+)" in place, so that its size stays ([\d,]+) bytes, and set its modification time back to the value that its index entry records$/,
  function (this: AcceptanceWorld, at: string, path: string, size: string) {
    const repo = this.repo!;
    const entry = indexEntry(repo, path);
    const bytes = readFileSync(repo.path(path));
    assert.equal(bytes.length, count(size));
    bytes[count(at)] = bytes[count(at)]! ^ 0xff;
    writeFileSync(repo.path(path), bytes);
    const t = entry.mtimeSeconds + entry.mtimeNanoseconds / 1e9;
    utimesSync(repo.path(path), t, t);
  },
);
