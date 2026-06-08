import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { healthRouter } from './routes/health.routes';
import { requestLogger } from './middleware/request-logger';
import { notFoundHandler } from './middleware/not-found';
import { errorHandler } from './middleware/error-handler';

/**
 * Builds the Express app without binding a port, so tests can exercise it
 * in-process via supertest. Route modules (auth, walkthroughs) mount here.
 */
export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(requestLogger);
  app.use(express.json());

  app.use('/health', healthRouter);
  // Future: app.use('/auth', authRouter); app.use('/walkthroughs', walkthroughRouter);

  // 404 + error handler are always last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
