import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/fixtures/**/*.test.ts',
      'test/unit/**/*.test.ts',
      'test/integration/**/*.test.ts',
      'test/browser/**/*.test.ts',
    ],
  },
});
