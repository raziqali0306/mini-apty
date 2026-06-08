import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../store/use-auth-store';
import { loginSchema, signupSchema } from '../schemas/auth';
import type { ApiError } from '../shared/messages';

type Mode = 'login' | 'signup';

/** Top-of-form banner for non-field failures; validation shows inline instead. */
function bannerMessage(error: ApiError | null): string | null {
  if (!error) return null;
  switch (error.kind) {
    case 'network':
      return "Can't reach the server. Is the backend running?";
    case 'auth':
      return error.message || 'Invalid email or password';
    case 'conflict':
      return error.message || 'That email is already registered';
    case 'validation':
      return null;
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function AuthScreen(): JSX.Element {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientErrors, setClientErrors] = useState<{ email?: string; password?: string }>({});

  const submitting = useAuthStore((s) => s.submitting);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const clearError = useAuthStore((s) => s.clearError);

  const serverFields = error?.kind === 'validation' ? error.fields : undefined;
  const emailError = clientErrors.email ?? serverFields?.email?.[0];
  const passwordError = clientErrors.password ?? serverFields?.password?.[0];
  const banner = bannerMessage(error);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    clearError();
    const schema = mode === 'login' ? loginSchema : signupSchema;
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setClientErrors({ email: f.email?.[0], password: f.password?.[0] });
      return;
    }
    setClientErrors({});
    if (mode === 'login') await login(parsed.data);
    else await signup(parsed.data);
  }

  function switchMode(next: Mode): void {
    setMode(next);
    setClientErrors({});
    clearError();
  }

  return (
    <div className="flex min-h-screen flex-col justify-center gap-6 bg-slate-50 p-6 text-slate-900">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Mini Apty</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
        </p>
      </div>

      {banner && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {banner}
        </div>
      )}

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
          {emailError && <span className="text-xs text-red-600">{emailError}</span>}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          />
          {passwordError && <span className="text-xs text-red-600">{passwordError}</span>}
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <button
          type="button"
          onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
          className="font-medium text-slate-900 underline"
        >
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}
