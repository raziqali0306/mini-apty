import type { RequestHandler } from 'express';

/**
 * Express 4 does not forward rejected promises to error middleware. Wrapping an
 * async handler here funnels any thrown/rejected error into `next()` so the
 * global error handler owns the response — keeping handlers clean async/await.
 */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
