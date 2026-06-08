import type { RequestHandler } from 'express';
import { notFound } from '../lib/app-error';

/** Terminal 404 for unmatched routes; defers to the global error handler. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.originalUrl} not found`));
};
