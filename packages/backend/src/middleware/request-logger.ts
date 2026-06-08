import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger';

/**
 * Per-request logging via pino-http. Emits one compact line per completed
 * request with a request id, method, url, status, and response time. Severity
 * is derived from the outcome so 5xx/4xx stand out. Attaches a child logger at
 * `req.log` that downstream code (incl. the error handler) reuses.
 */
export const requestLogger = pinoHttp({
  logger,
  // Keep the structured payload small — the message already carries the gist;
  // headers/IPs would just be noise on every line.
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} ${err.message}`,
});
