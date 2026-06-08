import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  sub: string;
}

export const signToken = (userId: string): string =>
  jwt.sign({ sub: userId }, env.JWT_SECRET, {
    // @types/jsonwebtoken@9 narrows expiresIn to `StringValue | number`, so the
    // plain string from env needs this cast.
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });

export const verifyToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new Error('Invalid token payload');
  }
  return { sub: decoded.sub };
};
