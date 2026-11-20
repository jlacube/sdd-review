import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    testTimeout: 60_000,
    include: [
      'test/fixtures/**/*.test.ts',
      'test/unit/**/*.test.{ts,tsx}',
      'test/integration/**/*.test.ts',
      'test/browser/**/*.test.ts',
    ],
  },
});
