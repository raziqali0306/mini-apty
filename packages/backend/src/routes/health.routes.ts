import { Router } from 'express';
import mongoose from 'mongoose';

export const healthRouter = Router();

/** Liveness + DB readiness, used by humans and (later) container healthchecks. */
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
  });
});
