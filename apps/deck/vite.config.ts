import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

// Chrome 60 (the Android floor) cannot run <script type="module">, so the bundle is a classic IIFE script.
const classicScript = (): Plugin => ({
  name: 'tabby-classic-script',
  apply: 'build',
  transformIndexHtml: { order: 'post', handler: html => html.replace(/<script type="module" crossorigin/g, '<script defer') },
});

// The "What's new" card needs only the newest release, so the deck ships that part of the changelog, not all of it.
const newestChangelog = (): Plugin => ({
  name: 'tabby-newest-changelog', enforce: 'pre',
  load(id) {
    if (!/CHANGELOG\.md\?raw$/.test(id)) return;
    return `export default ${JSON.stringify(readFileSync(id.replace(/\?raw$/, ''), 'utf8').split(/^(?=## )/m).slice(0, 2).join(''))};`;
  },
});

export default defineConfig({
  plugins: [preact(), classicScript(), newestChangelog()],
  base: './',
  build: {
    target: 'es2017',
    cssTarget: ['chrome60', 'safari13'], // iOS 13 is the Safari floor (pointer events); it still wants -webkit- prefixes
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    assetsInlineLimit: 0,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
  server: { port: 5173, proxy: { '/ws': { target: 'ws://127.0.0.1:8191', ws: true }, '/assets/u': 'http://127.0.0.1:8191' } },
});
