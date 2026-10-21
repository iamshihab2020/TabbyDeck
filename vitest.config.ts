import { defineConfig } from 'vitest/config';
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: { include: ['apps/*/test/**/*.test.{ts,tsx}', 'libs/*/test/**/*.test.{ts,tsx}'], environment: 'node' },
});
