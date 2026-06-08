import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { authenticate } from '../middleware/authenticate';
import * as authController from '../controllers/auth.controller';

export const authRouter = Router();

authRouter.post('/signup', asyncHandler(authController.signup));
authRouter.post('/login', asyncHandler(authController.login));
authRouter.get('/me', authenticate, asyncHandler(authController.me));
