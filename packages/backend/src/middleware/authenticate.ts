import type { RequestHandler } from 'express';
import { verifyToken } from '../lib/jwt';
import { unauthorized } from '../lib/app-error';

/**
 * Verifies the `Authorization: Bearer <jwt>` header and sets `req.userId`.
 * Any missing/malformed/invalid/expired token resolves to a 401 — distinct from
 * the 403 that the ownership checks raise downstream.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Missing or malformed Authorization header'));
    return;
  }

  try {
    const { sub } = verifyToken(header.slice('Bearer '.length).trim());
    req.userId = sub;
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
};
