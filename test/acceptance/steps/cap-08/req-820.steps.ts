import { strict as assert } from 'node:assert';
import { Given, Then, When } from '@cucumber/cucumber';
import { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-820 area (C001-T-035): C001-TS-861, `config validate` reports a foreign credential-store
// service as an invalid file. C001-TS-858 to C001-TS-860 and C001-TS-862 need the model gateway
// and the credential readers (C001-T-085, C001-T-086).

Given(
  'the file {string} of the working tree names the credential-store entry with service {string} and account {string} and is valid in every other respect',
  function (this: AcceptanceWorld, path: string, service: string, account: string) {
    this.repo = FixtureRepo.create();
    this.repo.commit('B0', { files: { 'README.md': '# readme\n' } });
    const configuration = {
      formatVersion: 1,
      model: {
        provider: {
          name: account,
          api: 'openai-chat',
          endpoint: 'http://localhost:11434/v1',
          model: 'stub-model',
          keyCredential: { service, account },
        },
      },
    };
    this.repo.write(path, `${JSON.stringify(configuration, null, 2)}\n`);
  },
);

When('the developer runs `sdd-review config validate`', function (this: AcceptanceWorld) {
  this.cli(['config', 'validate']);
});

Then('the command exits with code {int}', function (this: AcceptanceWorld, code: number) {
  assert.equal(this.lastRun?.status, code, this.lastRun?.stderr);
});

Then(
  'it reports {word} with the JSON pointer {string}',
  function (this: AcceptanceWorld, code: string, pointer: string) {
    const line = (this.lastRun?.stderr ?? '').split('\n').find((l) => l.startsWith(`${code}: `));
    assert.ok(line, `no ${code} on standard error: ${this.lastRun?.stderr}`);
    assert.ok(line.includes(`: ${pointer}: `), `the line does not name ${pointer}: ${line}`);
  },
);
