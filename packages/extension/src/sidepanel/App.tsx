import { useEffect } from 'react';
import { useAuthStore } from '../store/use-auth-store';
import { AuthScreen } from './AuthScreen';

/**
 * Side-panel root. Routes on auth status: restores the session on mount, shows
 * the auth screen when signed out, and the (placeholder) authoring surface once
 * signed in. Author/player flows mount in the signed-in branch later.
 */
export function App(): JSX.Element {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const init = useAuthStore((s) => s.init);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    void init();
  }, [init]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (status === 'anonymous') {
    return <AuthScreen />;
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-slate-50 p-4 text-slate-900">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Mini Apty</h1>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100"
        >
          Sign out
        </button>
      </header>

      <p className="text-sm text-slate-500">
        Signed in as <span className="font-medium text-slate-900">{user?.email}</span>
      </p>

      <main className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-center">
        <p className="text-sm text-slate-500">Author and player flows land here.</p>
      </main>
    </div>
  );
}
