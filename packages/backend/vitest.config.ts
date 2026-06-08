import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    // Suites share one test database; run files serially to avoid cross-file races.
    fileParallelism: false,
    hookTimeout: 30_000,
    // env.ts validates these at import; MONGO_URI is set by the setup file.
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-that-is-long-enough',
      JWT_EXPIRES_IN: '1h',
    },
  },
});
