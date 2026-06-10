import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * `config/env.ts` parses `process.env` at import time and throws on a bad config
 * so a misconfigured deployment fails fast. We re-import it in isolation with a
 * stubbed env to hit the failure branch without affecting the rest of the suite.
 */
describe('env validation (fail-fast at import)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws when JWT_SECRET is too short', async () => {
    vi.resetModules();
    vi.stubEnv('JWT_SECRET', 'short');
    await expect(import('../config/env')).rejects.toThrow('Invalid environment configuration');
  });

  it('throws when MONGO_URI is missing', async () => {
    vi.resetModules();
    vi.stubEnv('MONGO_URI', '');
    await expect(import('../config/env')).rejects.toThrow('Invalid environment configuration');
  });

  it('parses a valid env successfully', async () => {
    vi.resetModules();
    const mod = await import('../config/env');
    expect(mod.env.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
    expect(mod.env.NODE_ENV).toBe('test');
  });
});
