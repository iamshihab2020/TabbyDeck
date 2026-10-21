import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The editor runs in Microsoft Edge (app mode) on Windows, so it can target a modern browser.
export default defineConfig({
  plugins: [preact()],
  base: './',
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0 },
  server: { port: 5174 },
});
