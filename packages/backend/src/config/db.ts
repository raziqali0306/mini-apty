import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../lib/logger';

/**
 * Connection lifecycle is owned here so index.ts can wire graceful shutdown.
 * Mongoose maintains an internal pool; we open it once and drain it on signal.
 */
export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI);
  logger.info('mongo connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.connection.close();
  logger.info('mongo connection closed');
}
