import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createApiClient,
  type IntakeSummary as Summary,
  type MovedOnNotice as Notice,
} from '../../../web/src/api/client';
import { MovedOnNotice } from '../../../web/src/components/MovedOnNotice';
import { IntakeSummary, summaryRows } from '../../../web/src/views/IntakeSummary';

// C001-T-033: the intake summary (C001-REQ-114) and the moved-on notice (C001-REQ-117) in the UI,
// rendered as text only (C001-CON-20).

const summary = {
  baseCommit: { hash: 'a'.repeat(40), subject: 'B0' },
  baseChoice: 'upstream-merge-base',
  baseRef: 'refs/remotes/origin/agent/cart',
  changedFiles: 2,
  changedLines: 10,
  intentContext: {
    sddChanges: [{ id: 'CHG-042', specItems: 12, selected: true }],
    commits: 2,
    namedFiles: [{ role: 'agent-plan', path: '<b>plan.md</b>' }],
    documentedArchitecture: 'none',
  },
  testCommand: { command: 'npm test', origin: 'configuration' },
  sizeWarning: null,
} as unknown as Summary;

describe('IntakeSummary view', () => {
  it('states the rule and branch, the intent context and the test command', () => {
    const rows = Object.fromEntries(summaryRows(summary).map((r) => [r.label, r.value]));
    expect(rows['Base chosen']).toBe('merge base with upstream origin/agent/cart');
    expect(rows['SDD changes']).toBe('CHG-042 (12 spec items)');
    expect(rows['Commits']).toBe('2');
    expect(rows['Test command']).toBe(
      'npm test (from the review configuration of the base commit)',
    );
  });

  it('renders repository text as text and warns when the rule chose HEAD', () => {
    const html = renderToStaticMarkup(<IntakeSummary summary={summary} />);
    expect(html).toContain('agent plan &lt;b&gt;plan.md&lt;/b&gt;');
    expect(html).not.toContain('Only uncommitted edits');
    const head = { ...summary, baseChoice: 'head' } as Summary;
    expect(renderToStaticMarkup(<IntakeSummary summary={head} />)).toContain(
      'Only uncommitted edits are reviewed',
    );
  });
});

describe('MovedOnNotice', () => {
  const notice: Notice = {
    filesDiffering: ['src/<i>cart</i>.ts'],
    headMoved: false,
    notice: {
      code: 'ERR-INTAKE-007',
      message: 'The working tree has moved on since snapshot s-1.',
    },
  };

  it('renders nothing without a notice', () => {
    expect(renderToStaticMarkup(<MovedOnNotice notice={null} />)).toBe('');
  });

  it('names the code, each differing file and whether HEAD moved', () => {
    const html = renderToStaticMarkup(<MovedOnNotice notice={notice} />);
    expect(html).toContain('ERR-INTAKE-007: The working tree has moved on');
    expect(html).toContain('src/&lt;i&gt;cart&lt;/i&gt;.ts');
    expect(html).toContain('HEAD did not move.');
    const moved = { ...notice, headMoved: true, currentHead: 'c'.repeat(40) };
    expect(renderToStaticMarkup(<MovedOnNotice notice={moved} />)).toContain(
      `HEAD moved to ${'c'.repeat(40)}.`,
    );
  });
});

describe('client checkMovedOn', () => {
  it('posts to the moved-on check route with the token', async () => {
    const fetchFn = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    expect(await createApiClient('tok', fetchFn).checkMovedOn()).toBeNull();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/v1/checks/moved-on');
    expect(init!.method).toBe('POST');
    expect((init!.headers as Record<string, string>)['X-Review-Token']).toBe('tok');
  });
});
