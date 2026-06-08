import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Provide a parseable env so config/env.ts validates during tests
    // without requiring a real .env or database.
    env: {
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://localhost:27017/mini-apty-test',
      JWT_SECRET: 'test-secret-that-is-long-enough',
      JWT_EXPIRES_IN: '1h',
    },
  },
});
