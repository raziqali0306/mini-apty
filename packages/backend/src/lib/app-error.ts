/**
 * Domain error carrying the HTTP status, a stable machine-readable `code`, and
 * an optional `details` payload. The global error handler renders these into a
 * uniform JSON envelope, so handlers throw these instead of touching `res`.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message = 'Bad request', details?: unknown): AppError =>
  new AppError(400, 'BAD_REQUEST', message, details);

/** 401 — no/invalid session. The caller is not authenticated. */
export const unauthorized = (message = 'Unauthorized'): AppError =>
  new AppError(401, 'UNAUTHORIZED', message);

/** 403 — authenticated, but not allowed to touch this resource (tenancy break). */
export const forbidden = (message = 'Forbidden'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

/** 409 — request conflicts with current state (e.g. duplicate email). */
export const conflict = (message = 'Conflict', details?: unknown): AppError =>
  new AppError(409, 'CONFLICT', message, details);

export const notFound = (message = 'Resource not found'): AppError =>
  new AppError(404, 'NOT_FOUND', message);
