import { strict as assert } from 'node:assert';
import { Given } from '@cucumber/cucumber';
import { CONFIGURATION_PATH } from '../../../../src/core/api/index.js';
import type { AcceptanceWorld } from '../../support/world.js';
import {
  baseCommitWith,
  cloudStubProvider,
  configText,
  localStubProvider,
} from './req-801.steps.js';

// C001-TC-819 (C001-T-035, C001-T-085): C001-TS-856 and C001-TS-857, a review configuration that
// cannot be read gives model-free mode (C001-REQ-819); only the base commit's file counts
// (C001-REQ-426). The review start, the stubs and the checks are shared with req-801.steps.ts.

/** The API name of the scenarios: "OpenAI-compatible chat API" is `openai-chat` (C001-IF-004). */
const API_NAMES: Record<string, string> = {
  'OpenAI-compatible chat API': 'openai-chat',
  'Anthropic Messages API': 'anthropic-messages',
};
const apiOf = (name: string) => API_NAMES[name] ?? name;

/** The configuration text with a syntax error on line 3 (an unquoted word as a value). */
function brokenOnLine3(provider: Record<string, unknown>): string {
  const lines = configText({ formatVersion: 1, model: { provider } }).split('\n');
  // Line 3 is `    "provider": {` of the pretty-printed object; break it.
  lines[2] = '    "provider": oops {';
  return lines.join('\n');
}

Given(
  /^a base commit whose review configuration "([^"]+)" (names .+)$/,
  async function (this: AcceptanceWorld, path: string, fault: string) {
    assert.equal(path, CONFIGURATION_PATH);
    let m: RegExpExecArray | null;
    let text: string;
    if (
      (m =
        /^names the cloud stub with the provider API "([^"]+)" and the cloud opt-in setting$/.exec(
          fault,
        ))
    ) {
      const provider = { ...(await cloudStubProvider(this)), api: apiOf(m[1]!) };
      text = configText({ formatVersion: 1, model: { provider, cloudOptIn: true } });
    } else if (
      (m =
        /^names the local stub with the provider API "([^"]+)" and has a syntax error on line 3$/.exec(
          fault,
        ))
    ) {
      text = brokenOnLine3({ ...(await localStubProvider(this)), api: apiOf(m[1]!) });
    } else if (
      (m =
        /^names the cloud stub with the cloud opt-in setting and holds the key value "([^"]+)"$/.exec(
          fault,
        ))
    ) {
      const provider = { ...(await cloudStubProvider(this)), apiKey: m[1]! };
      text = configText({ formatVersion: 1, model: { provider, cloudOptIn: true } });
    } else {
      throw new Error(`fault not automated: ${fault}`);
    }
    baseCommitWith(this, text);
  },
);

Given(
  'a base commit whose review configuration names the local stub with the provider API {string}',
  async function (this: AcceptanceWorld, api: string) {
    const provider = { ...(await localStubProvider(this)), api: apiOf(api) };
    baseCommitWith(this, configText({ formatVersion: 1, model: { provider } }));
  },
);

Given(
  'the change under review leaves a syntax error on line 3 of the review configuration',
  async function (this: AcceptanceWorld) {
    this.repo!.write(CONFIGURATION_PATH, brokenOnLine3(await localStubProvider(this)));
  },
);
