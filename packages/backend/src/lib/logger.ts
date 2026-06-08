import { pino, type LoggerOptions } from 'pino';
import { env } from '../config/env';

const isDev = env.NODE_ENV === 'development';
const isTest = env.NODE_ENV === 'test';

const options: LoggerOptions = {
  // Tests stay silent; otherwise honour LOG_LEVEL, defaulting by environment.
  level: env.LOG_LEVEL ?? (isTest ? 'silent' : isDev ? 'debug' : 'info'),
  // Never leak credentials into logs.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    remove: false,
  },
  // Human-readable in dev; structured JSON (one line per event) in prod.
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
};

/** Single shared logger instance for the whole backend. */
export const logger = pino(options);
