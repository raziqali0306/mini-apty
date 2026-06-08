import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error';
import { logger } from '../lib/logger';
import { env } from '../config/env';

/**
 * Single source of truth for error responses. Every failure leaves the API as
 * `{ error: { code, message, details } }` so the extension can branch on a
 * stable `code` (validation / auth / authz / unknown).
 *
 * Logging split: expected client errors (4xx — validation, auth, authz, 404)
 * are already logged once at `warn` by the request logger, so we don't re-log
 * (and avoid noisy stacks). Genuine server faults (5xx / unexpected) are logged
 * here at `error` with the full stack via the per-request child logger.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = req.log ?? logger;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) log.error({ err, code: err.code }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details ?? null },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error({ err }, 'unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : message,
      details: null,
    },
  });
};
