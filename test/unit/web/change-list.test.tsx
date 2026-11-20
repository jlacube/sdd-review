import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApiError, type IntakeSummary } from '../../../web/src/api/client';
import { App, errorText } from '../../../web/src/App';
import { changeRows, ChangeList } from '../../../web/src/views/ChangeList';

const summary = {
  baseCommit: { hash: 'a'.repeat(40), subject: '<img src=x onerror=alert(1)>' },
  baseChoice: 'named',
  changedFiles: 12,
  changedLines: 640,
  intentContext: { sddChanges: [], commits: 0, namedFiles: [], documentedArchitecture: false },
  testCommand: null,
  sizeWarning: null,
} as unknown as IntakeSummary;

describe('ChangeList', () => {
  it('lists the snapshot, the files and the lines', () => {
    const rows = changeRows('s-abc', summary);
    expect(rows.map((r) => r.label)).toEqual([
      'Snapshot',
      'Base commit',
      'Changed files',
      'Changed lines',
    ]);
    expect(rows.find((r) => r.label === 'Changed files')?.value).toBe('12');
  });

  it('renders repository text as escaped text, never as markup', () => {
    const html = renderToStaticMarkup(<ChangeList snapshotId="s-abc" summary={summary} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('s-abc');
  });

  it('shows the size warning as text', () => {
    const warned = {
      ...summary,
      sizeWarning: { code: 'ERR-INTAKE-006', message: 'big <b>change</b>' },
    } as unknown as IntakeSummary;
    const html = renderToStaticMarkup(<ChangeList snapshotId="s" summary={warned} />);
    expect(html).toContain('ERR-INTAKE-006: big &lt;b&gt;change&lt;/b&gt;');
  });
});

describe('App', () => {
  it('asks for the address with the token when the fragment has none', () => {
    expect(renderToStaticMarkup(<App token={null} />)).toContain('no review token');
  });
  it('names the catalogue code of a failure', () => {
    expect(errorText(new ApiError(403, 'ERR-UI-002', 'refused'))).toBe('ERR-UI-002: refused');
    expect(errorText(new ApiError(500, null, 'x'))).toBe('HTTP 500: x');
  });
});
