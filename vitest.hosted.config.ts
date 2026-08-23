import { defineConfig } from 'vitest/config';

/**
 * Opt-in suite that runs against a REAL Supabase project over the network,
 * signing in as the demo accounts and exercising RLS through PostgREST.
 * Deliberately NOT part of `npm test` — it writes to whatever project
 * .env.local points at.
 *
 *   npm run test:hosted
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/hosted/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
  },
});
