import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { errorHandler } from '../middleware/error-handler';
import { AppError } from '../lib/app-error';

/**
 * The supertest suites exercise the expected 4xx paths (validation / auth / authz
 * / 404) end-to-end. These unit-test the branches they don't reach: an *unhandled*
 * fault must still leave the API as the uniform `{ error: { code, message } }`
 * envelope with a 500, and 5xx AppErrors must be logged.
 */
function mockRes(): { res: Response; body: () => { error: { code: string; message: string; details: unknown } } } {
  const store = {} as Record<string, unknown>;
  store.status = vi.fn().mockReturnValue(store);
  store.json = vi.fn().mockReturnValue(store);
  const res = store as unknown as Response;
  const body = () => (store.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
  return { res, body };
}

const next = vi.fn();

describe('errorHandler — unhandled / fallback paths', () => {
  it('maps an unexpected Error to a uniform 500 INTERNAL_ERROR', () => {
    const { res, body } = mockRes();
    // No `req.log` → also exercises the `req.log ?? logger` fallback.
    errorHandler(new Error('boom'), {} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(body().error.code).toBe('INTERNAL_ERROR');
    // NODE_ENV=test (not production) → the real message is surfaced for debugging.
    expect(body().error.message).toBe('boom');
    expect(body().error.details).toBeNull();
  });

  it('maps a non-Error thrown value to 500 with a generic message', () => {
    const { res, body } = mockRes();
    errorHandler('just a string', {} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(body().error.code).toBe('INTERNAL_ERROR');
    expect(body().error.message).toBe('Unknown error');
  });

  it('logs 5xx AppErrors at error and preserves the status/code', () => {
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const req = { log } as unknown as Request;
    const { res, body } = mockRes();

    errorHandler(new AppError(503, 'UPSTREAM_DOWN', 'db unavailable'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(body().error.code).toBe('UPSTREAM_DOWN');
    expect(log.error).toHaveBeenCalledOnce();
  });

  it('does not log 4xx AppErrors (already logged once by the request logger)', () => {
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const req = { log } as unknown as Request;
    const { res, body } = mockRes();

    errorHandler(new AppError(403, 'FORBIDDEN', 'nope'), req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(body().error.code).toBe('FORBIDDEN');
    expect(log.error).not.toHaveBeenCalled();
  });
});
