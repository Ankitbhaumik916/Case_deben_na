import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // hosted suite talks to a live project; run it explicitly via test:hosted
    exclude: ['tests/hosted/**', 'node_modules/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
