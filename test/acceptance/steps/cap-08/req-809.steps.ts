import { strict as assert } from 'node:assert';
import { After, Given, Then } from '@cucumber/cucumber';
import {
  createTemporaryKeychain,
  linuxWriter,
  windowsWriter,
  type TemporaryKeychain,
} from '../../../fixtures/credential-store.js';
import type { RecordedRequest } from '../../support/stub-llm/stub-llm.js';
import type { AcceptanceWorld } from '../../support/world.js';
import { baseCommitWith, cloudStub, cloudStubProvider, configText } from './req-801.steps.js';

// C001-TC-809 (C001-T-086): C001-TS-825 to C001-TS-827, provider keys come from the environment or
// the operating system's credential store, never from the repository (C001-REQ-809, C001-IF-010
// §7). Also the credential-store and environment steps of C001-TS-858 to C001-TS-860
// (req-820.steps.ts). The CLI of the scenario inherits `process.env` (`AcceptanceWorld.cliEnv`),
// so an environment variable is set there for the scenario and restored after it. Store entries
// are written with the OS's own tool and removed after the scenario.

/** The environment variable the scenario's configuration names for the key. */
export const KEY_ENV = 'SDD_TEST_PROVIDER_KEY';

/** The provider name `cloudStubProvider` gives (req-801.steps.ts): the default entry's account. */
const CLOUD_PROVIDER_NAME = 'cloud-stub';

interface KeyState {
  /** The provider name of the configuration: the account of the default entry. */
  provider: string;
  /** The configured entry, when the configuration names one. */
  entry: { service: string; account: string } | null;
  /** The environment variable the configuration names, when it names one. */
  keyEnv: string | null;
  /** Variables set for the scenario, with their earlier values. */
  saved: Map<string, string | undefined>;
  cleanups: Array<() => void>;
  keychain?: TemporaryKeychain;
}

const states = new WeakMap<AcceptanceWorld, KeyState>();

export function keyState(world: AcceptanceWorld): KeyState {
  let state = states.get(world);
  if (!state) {
    state = { provider: 'cloud-stub', entry: null, keyEnv: null, saved: new Map(), cleanups: [] };
    states.set(world, state);
  }
  return state;
}

After(function (this: AcceptanceWorld) {
  const state = states.get(this);
  if (!state) return;
  for (const [name, value] of state.saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const cleanup of state.cleanups.splice(0)) cleanup();
  state.keychain?.remove();
  states.delete(this);
});

/** Sets (or, with `undefined`, removes) an environment variable for this scenario only. */
export function setScenarioEnv(world: AcceptanceWorld, name: string, value: string | undefined) {
  const state = keyState(world);
  if (!state.saved.has(name)) state.saved.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/** Writes a test secret into the OS credential store, as the developer would (C001-ADR-008 §1). */
export function storeSecret(
  world: AcceptanceWorld,
  service: string,
  account: string,
  secret: string,
) {
  const state = keyState(world);
  if (process.platform === 'win32') {
    state.cleanups.push(windowsWriter(service, account, secret));
  } else if (process.platform === 'darwin') {
    state.keychain ??= createTemporaryKeychain();
    state.cleanups.push(state.keychain.write(service, account, secret));
  } else {
    state.cleanups.push(linuxWriter(service, account, secret));
  }
}

/** Removes every environment variable the configuration could take a key from. */
export function noKeyInEnvironment(world: AcceptanceWorld): void {
  const state = keyState(world);
  for (const name of new Set([KEY_ENV, ...(state.keyEnv ? [state.keyEnv] : [])])) {
    setScenarioEnv(world, name, undefined);
  }
}

/** The key a request carries: `Authorization: Bearer` (OpenAI-compatible) or `x-api-key`. */
function keyOf(request: RecordedRequest): string | null {
  const auth = request.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  const apiKey = request.headers['x-api-key'];
  return typeof apiKey === 'string' ? apiKey : null;
}

export async function cloudRequests(world: AcceptanceWorld): Promise<RecordedRequest[]> {
  return (await cloudStub(world)).requests;
}

Given(
  'a review configuration that names the cloud stub with the cloud opt-in setting',
  async function (this: AcceptanceWorld) {
    const provider = { ...(await cloudStubProvider(this)), keyEnv: KEY_ENV };
    const state = keyState(this);
    state.provider = CLOUD_PROVIDER_NAME;
    state.keyEnv = KEY_ENV;
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider, cloudOptIn: true } }));
  },
);

Given(
  'a review configuration in the base commit that names the cloud stub with the cloud opt-in setting and also holds the value {string} as a key',
  async function (this: AcceptanceWorld, value: string) {
    const provider = { ...(await cloudStubProvider(this)), keyEnv: KEY_ENV, apiKey: value };
    const state = keyState(this);
    state.provider = CLOUD_PROVIDER_NAME;
    state.keyEnv = KEY_ENV;
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider, cloudOptIn: true } }));
  },
);

Given(
  'a file {string} of the working tree holds {string}',
  function (this: AcceptanceWorld, path: string, text: string) {
    this.repo!.write(path, `${text}\n`);
  },
);

Given(
  'the environment variable that the configuration names for the key holds {string}',
  function (this: AcceptanceWorld, key: string) {
    setScenarioEnv(this, keyState(this).keyEnv ?? KEY_ENV, key);
  },
);

Given(
  "the operating system's credential store holds the key {string} for that provider, and no environment variable holds a key",
  function (this: AcceptanceWorld, key: string) {
    storeSecret(this, 'sdd-review', keyState(this).provider, key);
    noKeyInEnvironment(this);
  },
);

Given('no environment variable holds a key', function (this: AcceptanceWorld) {
  noKeyInEnvironment(this);
});

Then(
  'every request recorded by the cloud stub carries the key {string}',
  async function (this: AcceptanceWorld, key: string) {
    const requests = await cloudRequests(this);
    // Not vacuous: the scenario is about the key a request carries, so a request must exist.
    assert.ok(requests.length > 0, 'the cloud stub received no request');
    for (const request of requests) assert.equal(keyOf(request), key);
  },
);

Then(
  'no request recorded by the cloud stub carries {string} or {string}',
  async function (this: AcceptanceWorld, first: string, second: string) {
    for (const request of await cloudRequests(this)) {
      const text = JSON.stringify(request);
      assert.ok(!text.includes(first), `a request carries ${first}`);
      assert.ok(!text.includes(second), `a request carries ${second}`);
    }
  },
);

Then('the cloud stub receives no request', async function (this: AcceptanceWorld) {
  assert.deepEqual(await cloudRequests(this), []);
});
