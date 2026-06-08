import http from 'node:http';
import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { logger } from './lib/logger';

async function main(): Promise<void> {
  await connectDb();

  const server = http.createServer(createApp());
  server.listen(env.PORT, () => {
    logger.info(`listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Graceful shutdown: stop accepting connections, drain the Mongoose pool,
  // then exit. A hard timeout guards against a hung close. Shared by signals
  // and fatal crashes so cleanup always runs.
  let shuttingDown = false;
  const shutdown = (reason: string, exitCode: number): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'shutting down');

    const force = setTimeout(() => {
      logger.error('forced exit after timeout');
      process.exit(1);
    }, 10_000);
    force.unref();

    server.close(() => {
      void disconnectDb()
        .then(() => {
          clearTimeout(force);
          process.exit(exitCode);
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'error during shutdown');
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM', 0));
  process.on('SIGINT', () => shutdown('SIGINT', 0));

  // Last-resort crash handlers: log with full stack, then shut down. The
  // process is in an undefined state after these, so we always exit non-zero.
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    shutdown('uncaughtException', 1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandledRejection');
    shutdown('unhandledRejection', 1);
  });
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'fatal startup error');
  process.exit(1);
});
