import { defineConfig } from 'vitest/config';
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: {
    include: ['apps/*/test/**/*.test.{ts,tsx}', 'libs/*/test/**/*.test.{ts,tsx}'], environment: 'node',
    // One process per test file, 40+ at once, made a worker crash now and then on Windows (exit 0xC0000409); six at a time does not.
    maxWorkers: 6,
  },
});
