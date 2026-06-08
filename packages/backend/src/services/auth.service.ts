import { UserModel } from '../models/user.model';
import { hashPassword, verifyPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { conflict, unauthorized } from '../lib/app-error';
import type { UserDocument } from '../models/user.model';
import type { LoginInput, SignupInput } from '../schemas/auth.schema';

export interface AuthResult {
  token: string;
  user: { id: string; email: string };
}

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

const authResult = (user: UserDocument): AuthResult => {
  const id = user._id.toString();
  return { token: signToken(id), user: { id, email: user.email } };
};

/** Create a user (unique email) and return a fresh JWT. */
export async function signup(input: SignupInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await UserModel.create({ email: input.email, passwordHash });
    return authResult(user);
  } catch (err) {
    // Unique index is the atomic source of truth; map its violation to 409.
    if (isDuplicateKeyError(err)) throw conflict('Email already registered');
    throw err;
  }
}

/** Verify credentials and return a fresh JWT. Wrong email/password are
 * indistinguishable on purpose (both 401) to avoid user enumeration. */
export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await UserModel.findOne({ email: input.email });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw unauthorized('Invalid email or password');
  }
  return authResult(user);
}
