import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Build of the web client (C001-COMP-019, C001-ADR-002 item 1): hashed static files in `dist/web`,
 * which the UI server serves. The Content-Security-Policy forbids inline script and style, so
 * nothing is inlined: no data: URI assets, no inline CSS, no module-preload polyfill.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
    sourcemap: false,
    target: 'es2022',
  },
});
