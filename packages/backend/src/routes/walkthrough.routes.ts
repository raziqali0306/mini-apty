import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import * as walkthroughController from '../controllers/walkthrough.controller';

// Mounted behind `authenticate` in app.ts, so every route here has a user.
export const walkthroughRouter = Router();

walkthroughRouter.post('/', asyncHandler(walkthroughController.create));
walkthroughRouter.get('/', asyncHandler(walkthroughController.list));
walkthroughRouter.get('/:id', asyncHandler(walkthroughController.getById));
walkthroughRouter.put('/:id', asyncHandler(walkthroughController.update));
walkthroughRouter.delete('/:id', asyncHandler(walkthroughController.remove));
