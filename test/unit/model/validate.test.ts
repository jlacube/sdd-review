import { describe, expect, it } from 'vitest';
import type { TaskInputs } from '../../../src/core/model/gateway.js';
import { modelOutputMarker, markItems } from '../../../src/core/model/marker.js';
import { validateOutput } from '../../../src/core/model/validate.js';

// C001-T-089: output validation (C001-IF-011 plus the ID checks) and the model-output marker
// (C001-REQ-810, C001-REQ-811).

const H1 = `h-${'1'.repeat(16)}`;
const H2 = `h-${'2'.repeat(16)}`;
const I1 = `i-${'1'.repeat(16)}`;
const I2 = `i-${'2'.repeat(16)}`;

const linking: TaskInputs['hunk-linking'] = {
  intents: [{ intentId: I1, title: 'T', sourceText: 'S' }],
  hunks: [{ hunkId: H1, path: 'a.ts', text: '+a' }],
};
const critique: TaskInputs['design-critique'] = {
  components: [{ componentName: 'billing', hunks: [{ hunkId: H1, path: 'a.ts', text: '+a' }] }],
};
const walkthrough: TaskInputs['walkthrough-account'] = {
  intent: { intentId: I1, title: 'T', sourceText: 'S' },
  hunks: [],
};
const extraction: TaskInputs['intent-extraction'] = { commits: [], namedFiles: [] };

describe('validateOutput (C001-IF-011)', () => {
  it('accepts a valid answer of each task', () => {
    expect(
      validateOutput(
        'hunk-linking',
        { task: 'hunk-linking', links: [{ hunkId: H1, intentId: null, reason: 'r' }] },
        linking,
      ),
    ).toEqual({ ok: true });
    expect(
      validateOutput(
        'design-critique',
        {
          task: 'design-critique',
          findings: [{ hunkIds: [H1], componentId: 'billing', title: 't', explanation: 'e' }],
        },
        critique,
      ),
    ).toEqual({ ok: true });
    expect(
      validateOutput(
        'walkthrough-account',
        { task: 'walkthrough-account', intentId: I1, account: 'a' },
        walkthrough,
      ),
    ).toEqual({ ok: true });
    expect(
      validateOutput(
        'intent-extraction',
        {
          task: 'intent-extraction',
          intents: [{ title: 'Add retry', sources: [{ kind: 'commit', reference: 'abc' }] }],
        },
        extraction,
      ),
    ).toEqual({ ok: true });
  });

  it.each([
    ['a missing member', { task: 'hunk-linking' }, /at \/ \(required "links"\)/],
    ['another task', { task: 'design-critique', findings: [] }, /does not match HunkLinking at \//],
    [
      'a member the format does not have',
      { task: 'hunk-linking', links: [], confidence: 'high' },
      /additionalProperties/,
    ],
    [
      'a malformed hunk ID',
      { task: 'hunk-linking', links: [{ hunkId: 'h-1', intentId: I1, reason: 'r' }] },
      /\/links\/0\/hunkId \(pattern\)/,
    ],
    ['not an object', ['a'], /at \/ \(type\)/],
  ])('rejects %s as unusable output', (_, output, reason) => {
    const check = validateOutput('hunk-linking', output, linking);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(reason);
  });

  it('rejects hunk and component IDs that the request does not hold', () => {
    expect(
      validateOutput(
        'hunk-linking',
        { task: 'hunk-linking', links: [{ hunkId: H2, intentId: I1, reason: 'r' }] },
        linking,
      ),
    ).toEqual({
      ok: false,
      reason: 'the output names a hunk ID that the request does not hold at /links/0/hunkId',
    });
    expect(
      validateOutput(
        'design-critique',
        { task: 'design-critique', findings: [{ hunkIds: [H2], title: 't', explanation: 'e' }] },
        critique,
      ).ok,
    ).toBe(false);
    expect(
      validateOutput(
        'design-critique',
        {
          task: 'design-critique',
          findings: [{ hunkIds: [H1], componentId: 'cart', title: 't', explanation: 'e' }],
        },
        critique,
      ),
    ).toEqual({
      ok: false,
      reason:
        'the output names a component that the request does not hold at /findings/0/componentId',
    });
    expect(
      validateOutput(
        'walkthrough-account',
        { task: 'walkthrough-account', intentId: I2, account: 'a' },
        walkthrough,
      ).ok,
    ).toBe(false);
  });

  it('leaves a link to an intent outside the request to the intent mapper (§2, ERR-MODEL-011)', () => {
    expect(
      validateOutput(
        'hunk-linking',
        { task: 'hunk-linking', links: [{ hunkId: H1, intentId: I2, reason: 'r' }] },
        linking,
      ),
    ).toEqual({ ok: true });
  });

  it('never quotes a value of the answer in its reason', () => {
    const check = validateOutput(
      'hunk-linking',
      {
        task: 'hunk-linking',
        links: [{ hunkId: 'MARKER-a1', intentId: I1, reason: 'MARKER-a1' }],
        ['MARKER-a1 key']: 1,
      },
      linking,
    );
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).not.toContain('MARKER');
  });
});

describe('the model-output marker (C001-REQ-810, C001-REQ-811)', () => {
  const provider = { name: 'local-runtime', model: 'configured' };

  it('names the provider and the model of the answer, else the configured model', () => {
    expect(modelOutputMarker(provider, 'stub-model-1')).toEqual({
      provider: 'local-runtime',
      model: 'stub-model-1',
      confidence: 'low',
    });
    expect(modelOutputMarker(provider, null).model).toBe('configured');
  });

  it('marks every item of every task with confidence low', () => {
    const marker = modelOutputMarker(provider, 'stub-model-1');
    const items = [
      ...markItems(
        'intent-extraction',
        {
          task: 'intent-extraction',
          intents: [
            {
              title: 'Add retry to the HTTP client',
              sources: [{ kind: 'commit', reference: 'a' }],
            },
          ],
        },
        marker,
      ),
      ...markItems(
        'hunk-linking',
        {
          task: 'hunk-linking',
          links: [{ hunkId: H1, intentId: I1, reason: 'confidence: high (0.99)' }],
        },
        marker,
      ),
      ...markItems(
        'walkthrough-account',
        { task: 'walkthrough-account', intentId: I1, account: 'a' },
        marker,
      ),
      ...markItems(
        'design-critique',
        {
          task: 'design-critique',
          findings: [{ hunkIds: [H1], componentId: 'billing', title: 't', explanation: 'e' }],
        },
        marker,
      ),
    ];
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.confidence).toBe('low');
      expect(item.labels.modelOutput).toEqual(marker);
    }
  });
});
