import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    include: [
      'test/fixtures/**/*.test.ts',
      'test/unit/**/*.test.ts',
      'test/integration/**/*.test.ts',
      'test/browser/**/*.test.ts',
    ],
  },
});
