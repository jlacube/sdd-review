// Spike C001-T-023: entry of the prototype page. Loads `/data.json` (same origin), renders the
// prototype, and flags readiness for the runner (`body[data-ready]`, mark `spike:ready`).
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { SpikeDataset } from './dataset';
import './styles.css';

function Ready(props: { data: SpikeDataset }) {
  useEffect(() => {
    requestAnimationFrame(() => {
      performance.mark('spike:ready');
      document.body.dataset.ready = 'true';
    });
  }, []);
  return <App data={props.data} />;
}

async function start() {
  const root = document.getElementById('root');
  if (!root) throw new Error('no #root element');
  const response = await fetch('/data.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`data.json: HTTP ${response.status}`);
  const data = (await response.json()) as SpikeDataset;
  performance.mark('spike:data-loaded');
  createRoot(root).render(<Ready data={data} />);
}

start().catch((error: unknown) => {
  document.body.dataset.error = error instanceof Error ? error.message : String(error);
});
