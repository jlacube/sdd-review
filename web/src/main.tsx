import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { tokenFromFragment } from './api/client';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('no #root element');
createRoot(root).render(
  <StrictMode>
    <App token={tokenFromFragment(window.location.hash)} />
  </StrictMode>,
);
