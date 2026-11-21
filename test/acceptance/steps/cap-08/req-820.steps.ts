import { strict as assert } from 'node:assert';
import { Given, Then, When } from '@cucumber/cucumber';
import { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import type { AcceptanceWorld } from '../../support/world.js';
import { CONFIGURATION_PATH } from '../../../../src/core/api/index.js';
import {
  baseCommitWith,
  cloudStubProvider,
  configText,
  localStubProvider,
  providerMode as providerModeOf,
} from './req-801.steps.js';
import { keyState, noKeyInEnvironment, setScenarioEnv, storeSecret } from './req-809.steps.js';

// C001-TC-820 area (C001-T-035): C001-TS-861, `config validate` reports a foreign credential-store
// service as an invalid file. C001-TS-858 to C001-TS-860 and C001-TS-862: below (C001-T-086).

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

// C001-TC-858 to C001-TC-862 (C001-T-086): C001-TS-858 to C001-TS-860 and C001-TS-862, the
// credential-store services a base-commit configuration may name (C001-REQ-820). The entry of a
// foreign service is written into the real store (Amendment 1, A1.3 of C001-ADR-008) and must
// never be read or sent.

/** The cloud-stub provider of these scenarios with its credential-store entry. */
async function cloudWithEntry(
  world: AcceptanceWorld,
  name: string,
  service: string,
  account: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const provider = {
    ...(await cloudStubProvider(world)),
    name,
    keyCredential: { service, account },
    ...extra,
  };
  const state = keyState(world);
  state.provider = name;
  state.entry = { service, account };
  state.keyEnv = typeof extra.keyEnv === 'string' ? extra.keyEnv : null;
  return configText({ formatVersion: 1, model: { provider, cloudOptIn: true } });
}

Given(
  'a review configuration that names the cloud stub as provider {string} with the cloud opt-in setting and the credential-store entry with service {string} and account {string}',
  async function (this: AcceptanceWorld, name: string, service: string, account: string) {
    baseCommitWith(this, await cloudWithEntry(this, name, service, account));
  },
);

Given(
  /^a review configuration that names the cloud stub as provider "([^"]+)" with the cloud opt-in setting, the credential-store entry with service "([^"]+)" and account "([^"]+)", and the (key environment variable|provider API) "([^"]+)"$/,
  async function (
    this: AcceptanceWorld,
    name: string,
    service: string,
    account: string,
    kind: string,
    value: string,
  ) {
    const extra = kind === 'provider API' ? { api: value } : { keyEnv: value };
    baseCommitWith(this, await cloudWithEntry(this, name, service, account, extra));
  },
);

Given(
  "the operating system's credential store holds the key {string} in that entry, and no environment variable holds a key",
  function (this: AcceptanceWorld, key: string) {
    const { entry } = keyState(this);
    assert.ok(entry, 'the configuration names no credential-store entry');
    storeSecret(this, entry.service, entry.account, key);
    noKeyInEnvironment(this);
  },
);

Given(
  "the operating system's credential store holds the secret {string} in that entry",
  function (this: AcceptanceWorld, secret: string) {
    const { entry } = keyState(this);
    assert.ok(entry, 'the configuration names no credential-store entry');
    storeSecret(this, entry.service, entry.account, secret);
  },
);

Given(
  /^"([A-Z][A-Z0-9_]*)" holds "([^"]*)"$/,
  function (this: AcceptanceWorld, name: string, value: string) {
    setScenarioEnv(this, name, value);
  },
);

Given(
  'a base commit whose review configuration names the local stub as provider {string} with no credential-store entry',
  async function (this: AcceptanceWorld, name: string) {
    const provider = { ...(await localStubProvider(this)), name };
    keyState(this).provider = name;
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider } }));
  },
);

Given(
  'the change under review sets in the review configuration the credential-store entry with service {string} and account {string}',
  async function (this: AcceptanceWorld, service: string, account: string) {
    const provider = {
      ...(await localStubProvider(this)),
      name: keyState(this).provider,
      keyCredential: { service, account },
    };
    this.repo!.write(CONFIGURATION_PATH, configText({ formatVersion: 1, model: { provider } }));
  },
);

/** The notice line of `code` on standard error, which names `service`. */
function noticeNamingService(world: AcceptanceWorld, code: string, service: string): void {
  const line = (world.lastRun?.stderr ?? '').split('\n').find((l) => l.startsWith(`${code}: `));
  assert.ok(line, `no ${code} on standard error: ${world.lastRun?.stderr}`);
  assert.ok(line.includes(`"${service}"`), `${code} does not name the service ${service}: ${line}`);
}

Then(
  'the review reports the notice {word} that names the service {string}',
  function (this: AcceptanceWorld, code: string, service: string) {
    noticeNamingService(this, code, service);
  },
);

Then(
  'the review runs in model-free mode and reports the notice {word} that names the service {string}',
  async function (this: AcceptanceWorld, code: string, service: string) {
    assert.equal(await providerModeOf(this), 'model-free');
    noticeNamingService(this, code, service);
  },
);

Then(
  'the review reports neither the notice {word} nor the notice {word}',
  function (this: AcceptanceWorld, first: string, second: string) {
    const lines = (this.lastRun?.stderr ?? '').split('\n');
    for (const code of [first, second]) {
      assert.ok(!lines.some((l) => l.startsWith(`${code}: `)), this.lastRun?.stderr);
    }
  },
);
