import type { RequestHandler } from 'express';
import { signupSchema, loginSchema } from '../schemas/auth.schema';
import * as authService from '../services/auth.service';
import { UserModel } from '../models/user.model';
import { unauthorized } from '../lib/app-error';

export const signup: RequestHandler = async (req, res) => {
  const input = signupSchema.parse(req.body);
  const result = await authService.signup(input);
  res.status(201).json(result);
};

export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.status(200).json(result);
};

/** Returns the current user — a simple way to confirm a token round-trips. */
export const me: RequestHandler = async (req, res) => {
  if (!req.userId) throw unauthorized();
  const user = await UserModel.findById(req.userId);
  if (!user) throw unauthorized();
  res.json({ user: { id: user._id.toString(), email: user.email } });
};
