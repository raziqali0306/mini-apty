import { useEffect } from 'react';
import { useAuthStore } from '../store/use-auth-store';
import { useAppStore } from '../store/use-app-store';
import { useAuthorStore } from '../store/use-author-store';
import { AuthScreen } from './AuthScreen';
import { HomeScreen } from './HomeScreen';
import { AuthorScreen } from './AuthorScreen';
import { PreviewScreen } from './PreviewScreen';

/**
 * Side-panel root. Routes on auth status, then (when signed in) on the selected
 * mode: home picker → author or preview. Author/player flows fill in their
 * screens in later steps.
 */
export function App(): JSX.Element {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const init = useAuthStore((s) => s.init);
  const logout = useAuthStore((s) => s.logout);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const editingId = useAuthorStore((s) => s.editingId);

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

  const title =
    mode === 'author'
      ? editingId
        ? 'Edit walkthrough'
        : 'Author'
      : mode === 'preview'
        ? 'Preview'
        : 'Mini Apty';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          {mode !== 'home' && (
            <button
              type="button"
              onClick={() => setMode('home')}
              aria-label="Back"
              className="rounded px-1 text-slate-500 hover:text-slate-900"
            >
              ←
            </button>
          )}
          <h1 className="text-base font-semibold">{title}</h1>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 p-4">
        {mode === 'home' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Signed in as <span className="font-medium text-slate-900">{user?.email}</span>
            </p>
            <HomeScreen
              onSelectMode={(next) => {
                // Fresh authoring from Home — clear any leftover edit state.
                if (next === 'author') useAuthorStore.getState().reset();
                setMode(next);
              }}
            />
          </div>
        )}
        {mode === 'author' && <AuthorScreen />}
        {mode === 'preview' && <PreviewScreen />}
      </main>
    </div>
  );
}
